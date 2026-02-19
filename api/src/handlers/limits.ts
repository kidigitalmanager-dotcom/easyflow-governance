/**
 * GET /limits
 *
 * Returns current plan entitlements and usage counters for the tenant.
 * MVP: usage counters are mock values; production will query Postgres.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { requireAuth } from "../middleware/auth.js";
import { ok, cors, serverError } from "../lib/response.js";
import { logger, setContext } from "../lib/logger.js";
import { PLAN_LIMITS } from "../types/index.js";
import type { LimitsResponse } from "../types/index.js";

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return cors();

  setContext(event.requestContext.requestId);

  // Auth
  const { auth, error: authError } = requireAuth(event);
  if (authError) return authError;
  setContext(event.requestContext.requestId, auth!.tenantId);

  logger.info("GET /limits", {
    userId: auth!.userId,
    plan: auth!.plan,
  });

  try {
    const limits = PLAN_LIMITS[auth!.plan];

    // MVP: mock usage counters. Production → SELECT from postgres governance.usage table.
    const response: LimitsResponse = {
      plan: auth!.plan,
      mailboxes: { used: 1, limit: limits.mailboxes },
      playbooks: { used: 1, limit: limits.playbooks },
      emails: { used: 42, limit: limits.emailsPerMonth },
      drafts: { used: 17, limit: limits.draftsPerMonth },
    };

    logger.info("Limits response", { plan: auth!.plan });

    return ok(response);
  } catch (err) {
    logger.error("Limits handler error", { error: String(err) });
    return serverError("Failed to retrieve limits.");
  }
}
