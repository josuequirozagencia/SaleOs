/**
 * App wiring. Builds the router, mounts all route modules under /api/crm,
 * registers global middleware (CORS, rate limiting), and exposes the webhook
 * endpoint. The frontend's API_BASE_URL points here.
 */

import { Router, sendJson } from "./utils/router";
import { corsMiddleware } from "./middleware/cors";
import { rateLimits } from "./middleware/rateLimit";
import { handleWebhook } from "./modules/webhooks/webhookHandler";
import { config } from "./config/env";
import { tenantRepo } from "./repositories/tenantRepo";

import { authRoutes } from "./routes/authRoutes";
import { usersRoutes } from "./routes/usersRoutes";
import { appUsersRoutes } from "./routes/appUsersRoutes";
import { contactsRoutes } from "./routes/contactsRoutes";
import { conversationsRoutes } from "./routes/conversationsRoutes";
import { matriculasRoutes } from "./routes/matriculasRoutes";
import { callsRoutes } from "./routes/callsRoutes";
import { analyticsRoutes } from "./routes/analyticsRoutes";
import { integrationRoutes } from "./routes/integrationRoutes";
import { configRoutes } from "./routes/configRoutes";
import { followUpsRoutes } from "./routes/followUpsRoutes";
import { scheduledMessagesRoutes } from "./routes/scheduledMessagesRoutes";
import { calendarsRoutes } from "./routes/calendarsRoutes";
import { opportunitiesRoutes } from "./routes/opportunitiesRoutes";

export function createApp(): Router {
  const router = new Router();

  // Global middleware
  router.use(corsMiddleware);
  router.use(rateLimits.default);

  // Health check (no auth) — liveness.
  router.get("/api/health", async (ctx) => sendJson(ctx.res, 200, { ok: true, env: config.nodeEnv }));

  // Readiness check (no auth) — verifies critical config is present.
  router.get("/api/ready", async (ctx) => {
    const checks: Record<string, boolean> = { server: true };
    // In production, a configured JWT secret + encryption key are required.
    if (config.nodeEnv === "production") {
      checks.jwtSecret = !!config.jwtSecret && config.jwtSecret !== "dev-jwt-secret-change-me";
      checks.encryptionKey = !!config.encryptionKey && config.encryptionKey !== "dev-encryption-key-change-me-32b";
      checks.database = !!config.databaseUrl;
    }
    const ready = Object.values(checks).every(Boolean);
    sendJson(ctx.res, ready ? 200 : 503, { ready, checks });
  });

  // Webhook receiver (signature-validated, idempotent, rate-limited).
  // The tenant is encoded in the URL channel (/api/webhooks/crm/:tenantId) and
  // is the authoritative tenant — the body is NEVER trusted for authorization.
  router.post("/api/webhooks/crm/:tenantId", rateLimits.webhooks, async (ctx) => {
    const sig = (ctx.req.headers["x-webhook-signature"] as string | undefined) ??
      (ctx.req.headers["x-webhook"] as string | undefined);
    const result = await handleWebhook(
      (ctx.body ?? {}) as any,
      sig,
      ctx.params.tenantId,
    );
    sendJson(ctx.res, 200, result);
  });

  // Backwards-compatible single-tenant webhook path (resolves "default").
  router.post("/api/webhooks/crm", rateLimits.webhooks, async (ctx) => {
    const sig = (ctx.req.headers["x-webhook-signature"] as string | undefined) ??
      (ctx.req.headers["x-webhook"] as string | undefined);
    const result = await handleWebhook(
      (ctx.body ?? {}) as any,
      sig,
      "default",
    );
    sendJson(ctx.res, 200, result);
  });

  // All CRM routes mount under /api/crm (matches frontend API_BASE_URL).
  const crm = new Router();
  authRoutes(crm);
  usersRoutes(crm);
  appUsersRoutes(crm);
  contactsRoutes(crm);
  conversationsRoutes(crm);
  matriculasRoutes(crm);
  callsRoutes(crm);
  analyticsRoutes(crm);
  integrationRoutes(crm);
  configRoutes(crm);
  followUpsRoutes(crm);
  scheduledMessagesRoutes(crm);
  calendarsRoutes(crm);
  opportunitiesRoutes(crm);

  router.mount("/api/crm", crm);

  return router;
}

// Re-export for graceful shutdown usage.
export { tenantRepo };
