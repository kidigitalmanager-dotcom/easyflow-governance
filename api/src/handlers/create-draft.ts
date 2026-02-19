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

// ─── Gmail Draft (mock → live later) ───

async function createGmailDraft(req: CreateDraftRequest): Promise<CreateDraftResponse> {
  // TODO: Replace with real Gmail API call:
  // POST https://gmail.googleapis.com/gmail/v1/users/me/drafts
  // Headers: Authorization: Bearer <req.accessToken>
  // Body: { message: { raw: base64(RFC 2822 message) } }

  logger.info("Creating Gmail draft (mock)", {
    to: req.to,
    subject: req.subject,
    hasInReplyTo: !!req.inReplyTo,
  });

  return {
    draftId: `gmail-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: "gmail",
    status: "created",
    message: "Mock draft created. Live Gmail API integration pending.",
  };
}

// ─── Outlook Draft (mock → live later) ───

async function createOutlookDraft(req: CreateDraftRequest): Promise<CreateDraftResponse> {
  // TODO: Replace with real Microsoft Graph call:
  // POST https://graph.microsoft.com/v1.0/me/messages
  // Headers: Authorization: Bearer <req.accessToken>
  // Body: { subject, body: { contentType: "HTML", content }, toRecipients, isDraft: true }

  logger.info("Creating Outlook draft (mock)", {
    to: req.to,
    subject: req.subject,
    hasInReplyTo: !!req.inReplyTo,
  });

  return {
    draftId: `outlook-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: "outlook",
    status: "created",
    message: "Mock draft created. Live Outlook/Graph API integration pending.",
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
