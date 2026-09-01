/**
 * Database client — a single shared `pg` Pool (lazily initialized).
 *
 * Postgres is the Source of Truth for BeautyCRM-OWNED data: tenants,
 * sessions, OAuth states, idempotency, audit logs. CRM-native entities
 * (contacts, conversations, opportunities, pipelines, calendars, users)
 * remain live-fetched from the CRM provider — they are NOT duplicated here.
 *
 * CONNECTION:
 * - In production, `DATABASE_URL` is set (Railway provisioned Postgres).
 * - In local dev, `PGHOST=/tmp` + `postgres:///beautycrm` works against a
 *   locally-started instance.
 * - When `DATABASE_URL` is unset AND NODE_ENV !== "production", the pool is
 *   null and the repositories transparently fall back to their in-memory
 *   stores (so the app + tests still run without a DB). Production NEVER
 *   falls back — a missing DATABASE_URL is a hard failure.
 *
 * TEST ISOLATION:
 * - In test mode the DB is opt-in via `DB_TEST=1`. Pre-existing tests run
 *   against the in-memory fallback (their original design); only tests that
 *   explicitly opt in (Block 1 persistence tests) use the real pool.
 *
 * LAZY INIT: the pool is created on first use (ensurePool), NOT at import. So
 * merely importing this module does not activate the DB.
 *
 * SECURITY: the pool holds the connection string only; no secrets are logged.
 */

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "../config/env";
import { logger } from "../utils/router";

let pool: Pool | null = null;

function resolveConnectionString(): string | null {
  if (config.databaseUrl) return config.databaseUrl;
  // Local dev convenience: socket-based connection to a local Postgres.
  if (config.nodeEnv !== "production" && process.env.PGHOST) {
    return `postgres:///beautycrm`;
  }
  return null;
}

const connStr = resolveConnectionString();

// In test mode, the DB is opt-in: pre-existing tests were written against the
// in-memory stores (sync, seeded "default" tenant). Only tests that explicitly
// set DB_TEST=1 (e.g. Block 1 persistence tests) use the real pool.
const testDbOptIn =
  config.nodeEnv !== "test" || process.env.DB_TEST === "1";

function ensurePool(): Pool | null {
  if (!connStr || !testDbOptIn) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: connStr,
      host: process.env.PGHOST || undefined,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", (err) => {
      logger.error(`DB pool error: ${err.message}`);
    });
  }
  return pool;
}

/**
 * True when a real Postgres pool is available. The pool is created lazily on
 * first use, so merely importing the module does NOT activate the DB.
 */
export const dbAvailable = (): boolean => ensurePool() !== null;

/** Acquire a client for a transaction or multi-statement block. */
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = ensurePool();
  if (!p) throw new Error("Database not available — pool is null");
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Run a single parameterized query (auto-acquire/release). */
export async function query<T = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const p = ensurePool();
  if (!p) throw new Error("Database not available — pool is null");
  const res = await p.query(text, params);
  return res.rows as T[];
}

export { pool };
