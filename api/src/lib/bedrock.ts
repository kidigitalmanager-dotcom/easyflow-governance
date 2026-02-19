/**
 * Bedrock Claude Sonnet client for email triage.
 * Region: eu-central-1 (Frankfurt) for GDPR compliance.
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { logger } from "./logger.js";
import { minimizePii, restorePii, type PiiResult } from "./pii.js";
import type { AskAIRequest, AskAIResponse, PriorityLevel } from "../types/index.js";

const REGION = process.env.AWS_REGION || "eu-central-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-sonnet-4-20250514";

const client = new BedrockRuntimeClient({ region: REGION });

const SYSTEM_PROMPT = `Du bist UseEasy, ein KI-gestütztes E-Mail-Governance-System. Analysiere die folgende E-Mail und gib eine strukturierte Bewertung ab.

REGELN:
- Priorisierung: P0 (Sofort handeln), P1 (Zeitkritisch), P2 (Antwort empfohlen), P3 (Kein Handlungsbedarf)
- Erstelle IMMER einen Entwurf (außer bei P3 ohne Antwortbedarf)
- Entwürfe sind NUR Entwürfe – niemals automatisch senden
- Sei konkret bei der Evidenz (max. 3 Punkte)
- Antworte auf Deutsch
- Verwende professionellen, freundlichen Ton im Entwurf

Antworte AUSSCHLIESSLICH als JSON in diesem Format:
{
  "priority": "P0|P1|P2|P3",
  "tldr": "Kurze Zusammenfassung in 1-2 Sätzen",
  "recommendation": "Konkrete Handlungsempfehlung",
  "evidence": ["Punkt 1", "Punkt 2", "Punkt 3"],
  "playbookName": "Name des verwendeten Playbooks",
  "version": "vX.Y",
  "draft": "Vollständiger E-Mail-Entwurf oder leer",
  "approvalRequired": true|false
}`;

function buildUserPrompt(req: AskAIRequest, sanitized: string): string {
  const parts: string[] = [];
  if (req.subject) parts.push(`Betreff: ${req.subject}`);
  if (req.sender) parts.push(`Absender: ${req.sender}`);
  if (req.mailbox) parts.push(`Mailbox: ${req.mailbox}`);
  if (sanitized) parts.push(`\nInhalt:\n${sanitized}`);
  if (req.url) parts.push(`\nURL: ${req.url}`);
  return parts.join("\n");
}

export async function invokeBedrockAsk(req: AskAIRequest): Promise<AskAIResponse> {
  const startTime = Date.now();

  // PII minimization before sending to LLM
  const rawText = [req.subject, req.sender, req.snippet].filter(Boolean).join(" | ");
  const piiResult: PiiResult = minimizePii(rawText);

  logger.info("Bedrock invoke start", {
    model: MODEL_ID,
    piiMappingsCount: piiResult.mappings.length,
    hasSubject: !!req.subject,
    hasSender: !!req.sender,
    hasSnippet: !!req.snippet,
  });

  const userPrompt = buildUserPrompt(req, piiResult.sanitized);

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content?.[0]?.text || "{}";

    // Parse the JSON response from Claude
    let parsed: AskAIResponse;
    try {
      // Extract JSON from potential markdown code block
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      logger.error("Failed to parse Bedrock response as JSON", {
        rawContent: content.slice(0, 500),
        error: String(parseErr),
      });
      // Fallback response
      parsed = {
        priority: "P2",
        tldr: "Analyse konnte nicht abgeschlossen werden.",
        recommendation: "Bitte manuell prüfen.",
        evidence: ["KI-Analyse fehlgeschlagen"],
        playbookName: "Fallback",
        version: "v0.0",
        draft: "",
        approvalRequired: true,
      };
    }

    // Restore PII in the draft (so the actual email contains real data)
    if (parsed.draft && piiResult.mappings.length > 0) {
      parsed.draft = restorePii(parsed.draft, piiResult.mappings);
    }

    // Validate priority
    if (!["P0", "P1", "P2", "P3"].includes(parsed.priority)) {
      parsed.priority = "P2";
    }

    const duration = Date.now() - startTime;
    logger.info("Bedrock invoke complete", {
      durationMs: duration,
      priority: parsed.priority,
      approvalRequired: parsed.approvalRequired,
      draftLength: parsed.draft?.length || 0,
    });

    return parsed;
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("Bedrock invoke failed", {
      durationMs: duration,
      error: String(err),
      errorName: (err as Error).name,
    });
    throw err;
  }
}
