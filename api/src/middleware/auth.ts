/**
 * Shared-Token Authentication Middleware.
 *
 * MVP: validates a shared API key from the X-Api-Key header.
 * The key is stored in Lambda environment variable API_KEY.
 *
 * Future: JWT validation with tenant/user claims.
 */
import type { APIGatewayProxyEvent } from "aws-lambda";
import type { AuthContext, PlanId } from "../types/index.js";
import { unauthorized } from "../lib/response.js";
import { logger } from "../lib/logger.js";

// For MVP: shared key auth. Tenant info is encoded in a simple header.
// Production: replace with JWT token validation (Cognito / custom issuer).

export function authenticate(event: APIGatewayProxyEvent): AuthContext | null {
  const apiKey = event.headers["x-api-key"] || event.headers["X-Api-Key"];
  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    logger.error("API_KEY environment variable not set");
    return null;
  }

  if (!apiKey || apiKey !== expectedKey) {
    logger.warn("Auth failed: invalid or missing API key", {
      hasKey: !!apiKey,
      keyPrefix: apiKey?.slice(0, 8) + "...",
    });
    return null;
  }

  // MVP: extract tenant context from headers (set by extension/frontend)
  const tenantId = event.headers["x-tenant-id"] || "default";
  const userId = event.headers["x-user-id"] || "unknown";
  const plan = (event.headers["x-plan"] as PlanId) || "team";

  return { tenantId, userId, plan };
}

export function requireAuth(event: APIGatewayProxyEvent) {
  const auth = authenticate(event);
  if (!auth) {
    return { auth: null, error: unauthorized("Invalid or missing API key") };
  }
  return { auth, error: null };
}
