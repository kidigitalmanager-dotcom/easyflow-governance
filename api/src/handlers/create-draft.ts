/**
 * POST /drafts/gmail   → creates a Gmail draft via Google API
 * POST /drafts/outlook → creates an Outlook draft via Microsoft Graph
 *
 * MVP: mock-only (returns a fake draftId).
 * Production: uses the accessToken from the request to call provider APIs.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { requireAuth } from "../middleware/auth.js";
import { created, badRequest, cors, serverError } from "../lib/response.js";
import { logger, setContext } from "../lib/logger.js";
import type { CreateDraftRequest, CreateDraftResponse } from "../types/index.js";

// ─── RFC 2822 Message Builder ───

function buildRfc2822Message(to: string, subject: string, body: string, inReplyTo?: string): string {
  const lines: string[] = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    `MIME-Version: 1.0`,
  ];
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push(`References: ${inReplyTo}`);
  }
  lines.push(""); // blank line separating headers from body
  lines.push(Buffer.from(body).toString("base64"));
  return lines.join("\r\n");
}

function toUrlSafeBase64(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Gmail Draft (LIVE via Google API) ───

async function createGmailDraft(req: CreateDraftRequest): Promise<CreateDraftResponse> {
  // If no access token, fall back to mock
  if (!req.accessToken) {
    logger.warn("No access token provided, returning mock draft");
    return {
      draftId: `gmail-mock-${Date.now()}`,
      provider: "gmail",
      status: "created",
      message: "Mock draft (no accessToken). Verbinde Google OAuth für echte Entwürfe.",
    };
  }

  logger.info("Creating Gmail draft (live)", {
    to: req.to,
    subject: req.subject,
    hasInReplyTo: !!req.inReplyTo,
  });

  const rawMessage = buildRfc2822Message(req.to, req.subject, req.body, req.inReplyTo);
  const encodedMessage = toUrlSafeBase64(rawMessage);

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: { raw: encodedMessage },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Gmail API error", {
      status: response.status,
      body: errorText.slice(0, 500),
    });

    // 401 = token expired/revoked
    if (response.status === 401) {
      return {
        draftId: "",
        provider: "gmail",
        status: "error",
        message: "Google OAuth Token abgelaufen. Bitte neu anmelden.",
      };
    }

    return {
      draftId: "",
      provider: "gmail",
      status: "error",
      message: `Gmail API Fehler: ${response.status}`,
    };
  }

  const data = await response.json() as { id: string; message?: { id: string } };

  logger.info("Gmail draft created successfully", {
    draftId: data.id,
    messageId: data.message?.id,
  });

  return {
    draftId: data.id,
    provider: "gmail",
    status: "created",
    message: "Entwurf in Gmail gespeichert.",
  };
}

// ─── Outlook Draft (LIVE via Microsoft Graph) ───

async function createOutlookDraft(req: CreateDraftRequest): Promise<CreateDraftResponse> {
  // If no access token, fall back to mock
  if (!req.accessToken) {
    logger.warn("No access token provided, returning mock Outlook draft");
    return {
      draftId: `outlook-mock-${Date.now()}`,
      provider: "outlook",
      status: "created",
      message: "Mock draft (no accessToken). Verbinde Microsoft OAuth für echte Entwürfe.",
    };
  }

  logger.info("Creating Outlook draft (live)", {
    to: req.to,
    subject: req.subject,
    hasInReplyTo: !!req.inReplyTo,
  });

  // Microsoft Graph: POST /me/messages creates a draft (isDraft defaults to true)
  const graphBody: Record<string, unknown> = {
    subject: req.subject,
    body: {
      contentType: "Text",
      content: req.body,
    },
    toRecipients: [
      {
        emailAddress: {
          address: req.to,
        },
      },
    ],
  };

  // If replying, set conversationId
  if (req.inReplyTo) {
    graphBody.conversationId = req.inReplyTo;
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(graphBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Microsoft Graph API error", {
      status: response.status,
      body: errorText.slice(0, 500),
    });

    if (response.status === 401) {
      return {
        draftId: "",
        provider: "outlook",
        status: "error",
        message: "Microsoft OAuth Token abgelaufen. Bitte neu anmelden.",
      };
    }

    return {
      draftId: "",
      provider: "outlook",
      status: "error",
      message: `Graph API Fehler: ${response.status}`,
    };
  }

  const data = await response.json() as { id: string; conversationId?: string };

  logger.info("Outlook draft created successfully", {
    draftId: data.id,
    conversationId: data.conversationId,
  });

  return {
    draftId: data.id,
    provider: "outlook",
    status: "created",
    message: "Entwurf in Outlook gespeichert.",
  };
}

// ─── Validation ───

function validateBody(body: unknown): body is CreateDraftRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    (b.provider === "gmail" || b.provider === "outlook") &&
    typeof b.to === "string" && b.to.length > 0 &&
    typeof b.subject === "string" &&
    typeof b.body === "string" && b.body.length > 0
  );
}

// ─── Handler ───

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return cors();

  setContext(event.requestContext.requestId);

  // Auth
  const { auth, error: authError } = requireAuth(event);
  if (authError) return authError;
  setContext(event.requestContext.requestId, auth!.tenantId);

  // Determine provider from path
  const path = event.path || event.resource || "";
  const isGmail = path.includes("/gmail");
  const isOutlook = path.includes("/outlook");

  if (!isGmail && !isOutlook) {
    return badRequest("Invalid endpoint. Use /drafts/gmail or /drafts/outlook");
  }

  const provider = isGmail ? "gmail" : "outlook";

  logger.info(`POST /drafts/${provider}`, {
    userId: auth!.userId,
    plan: auth!.plan,
  });

  // Parse body
  let body: CreateDraftRequest;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return badRequest("Invalid JSON body");
  }

  // Override provider from path (path is authoritative)
  body.provider = provider;

  if (!validateBody(body)) {
    return badRequest("Required fields: provider, to, subject, body");
  }

  try {
    const result = isGmail
      ? await createGmailDraft(body)
      : await createOutlookDraft(body);

    logger.info("Draft created", {
      provider,
      draftId: result.draftId,
      status: result.status,
    });

    return created(result);
  } catch (err) {
    logger.error("Create draft error", { provider, error: String(err) });
    return serverError(`Failed to create ${provider} draft.`);
  }
}
