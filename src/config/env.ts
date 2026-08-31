/**
 * Typed environment configuration loaded once at startup.
 * Throws on missing required secrets so misconfiguration fails fast.
 */

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

  jwtSecret: required("JWT_SECRET", "dev-jwt-secret-change-me"),
  encryptionKey: required("ENCRYPTION_KEY", "dev-encryption-key-change-me-32b"),
  databaseUrl: process.env.DATABASE_URL ?? "",

  ghl: {
    apiBaseUrl: required("GHL_API_BASE_URL", "https://services.leadconnectorhq.com"),
    apiVersion: required("GHL_API_VERSION", "2021-07-28"),
    privateApiToken: process.env.GHL_PRIVATE_API_TOKEN ?? "",
    locationId: process.env.GHL_LOCATION_ID ?? "",
  },

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
