/**
 * POST /ai/ask
 *
 * Receives email context from the Chrome Extension / Console,
 * runs it through Bedrock Claude Sonnet with PII minimization,
 * returns priority + recommendation + draft.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { requireAuth } from "../middleware/auth.js";
import { invokeBedrockAsk } from "../lib/bedrock.js";
import { ok, badRequest, serverError, cors } from "../lib/response.js";
import { logger, setContext } from "../lib/logger.js";
import type { AskAIRequest } from "../types/index.js";

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return cors();

  setContext(event.requestContext.requestId);

  // Auth
  const { auth, error: authError } = requireAuth(event);
  if (authError) return authError;
  setContext(event.requestContext.requestId, auth!.tenantId);

  logger.info("POST /ai/ask", {
    userId: auth!.userId,
    plan: auth!.plan,
  });

  // Parse body
  let body: AskAIRequest;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return badRequest("Invalid JSON body");
  }

  // Validate: at least one field should be present
  if (!body.subject && !body.sender && !body.snippet && !body.url) {
    return badRequest("At least one of: subject, sender, snippet, or url is required");
  }

  try {
    const result = await invokeBedrockAsk(body);

    logger.info("Ask AI response", {
      priority: result.priority,
      playbookName: result.playbookName,
      approvalRequired: result.approvalRequired,
    });

    return ok(result);
  } catch (err) {
    logger.error("Ask AI handler error", { error: String(err) });
    return serverError("AI analysis failed. Please try again.");
  }
}
