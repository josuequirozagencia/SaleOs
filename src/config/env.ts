/**
 * Typed environment configuration loaded once at startup.
 * Throws on missing required secrets so misconfiguration fails fast.
 */

import { resolve } from "node:path";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    // In dev we allow missing secrets (mock provider). In production we fail.
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required env var: ${name}`);
    }
    return fallback ?? "";
  }
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:8080").split(",").map((s) => s.trim()).filter(Boolean),

  /**
   * Directory holding the compiled frontend. In the Docker image the build is
   * copied to /app/web; locally it resolves to web/dist relative to the repo.
   * When the directory is absent the server simply runs API-only.
   */
  webRoot: process.env.WEB_ROOT ?? resolve(__dirname, "../../web/dist"),

  jwtSecret: required("JWT_SECRET", "dev-jwt-secret-change-me"),
  encryptionKey: required("ENCRYPTION_KEY", "dev-encryption-key-change-me-32b"),
  databaseUrl: process.env.DATABASE_URL ?? "",

  ghl: {
    apiBaseUrl: required("GHL_API_BASE_URL", "https://services.leadconnectorhq.com"),
    apiVersion: required("GHL_API_VERSION", "2021-07-28"),
    privateApiToken: process.env.GHL_PRIVATE_API_TOKEN ?? "",
    locationId: process.env.GHL_LOCATION_ID ?? "",
    // Marketplace App — User Context (Embedded SSO). Read via getters so tests
    // and runtime can set the env var after import. The Shared Secret is used
    // ONLY server-side to decrypt the platform-provided user context; it is
    // NEVER shipped to the browser.
    get appId() { return process.env.GHL_APP_ID ?? ""; },
    get sharedSecret() { return process.env.GHL_APP_SHARED_SECRET ?? ""; },
    // OAuth 2.0 (Standalone SSO). Client credentials for the Marketplace App,
    // exchanged server-side only — CLIENT_SECRET never reaches the frontend.
    get oauthClientId() { return process.env.CLIENT_ID ?? ""; },
    get oauthClientSecret() { return process.env.CLIENT_SECRET ?? ""; },
    get oauthRedirectUri() { return process.env.REDIRECT_URI ?? ""; },
    marketplaceBaseUrl: required("GHL_MARKETPLACE_BASE_URL", "https://marketplace.leadconnectorhq.com"),
  },

  // Session lifetime (seconds). Short-lived JWT + server-side revocation list.
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 8),
  // How often (seconds) the backend revalidates the user against the CRM
  // directory (active? role unchanged? tenant still connected?).
  revalidationIntervalSeconds: Number(process.env.REVALIDATION_INTERVAL_SECONDS ?? 60 * 10),

  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS ?? 30000),

  ai: {
    provider: process.env.AI_PROVIDER ?? "none",
    apiKey: process.env.AI_API_KEY ?? "",
  },

  telephony: {
    provider: process.env.TELEPHONY_PROVIDER ?? "none",
    apiKey: process.env.TELEPHONY_API_KEY ?? "",
  },
};

export type Config = typeof config;
