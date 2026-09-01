/**
 * Session store — tracks issued BeautyCRM sessions for revocation.
 *
 * The JWT is short-lived (SESSION_TTL_SECONDS) and signed server-side, but a
 * stolen token must be revocable before its natural expiry. This store keeps
 * the set of revoked session IDs (jti) plus a per-user revalidation timestamp.
 *
 * PERSISTENCE:
 * - Postgres when the DB pool is available: revoked jtis + revalidation
 *   timestamps survive restarts and are shared across instances.
 * - In-memory fallback (Set/Map) when no DB (dev/tests).
 *
 * The store NEVER holds secrets — only opaque jti values + timestamps.
 */

import { query, dbAvailable } from "../db/client";

const revoked = new Set<string>();
const lastRevalidated = new Map<string, number>(); // ghlUserId -> epoch ms

export const sessionStore = {
  async revoke(jti: string): Promise<void> {
    if (!jti) return;
    if (dbAvailable()) {
      await query(
        `INSERT INTO sessions (jti, user_id, tenant_id, revoked, revoked_at, created_at, expires_at)
         VALUES ($1, '', '', TRUE, $2, $2, 0)
         ON CONFLICT (jti) DO UPDATE SET revoked = TRUE, revoked_at = $2`,
        [jti, Date.now()],
      );
      return;
    }
    revoked.add(jti);
  },

  async isRevoked(jti: string): Promise<boolean> {
    if (!jti) return false;
    if (dbAvailable()) {
      const rows = await query<{ revoked: boolean }>(
        "SELECT revoked FROM sessions WHERE jti = $1",
        [jti],
      );
      return rows[0]?.revoked === true;
    }
    return revoked.has(jti);
  },

  /** Mark that the user's identity was just revalidated against the CRM. */
  async markRevalidated(ghlUserId: string): Promise<void> {
    const now = Date.now();
    if (dbAvailable()) {
      // Upsert a revalidation marker row keyed by user (jti = user marker).
      await query(
        `INSERT INTO sessions (jti, user_id, tenant_id, revoked, last_revalidated, created_at, expires_at)
         VALUES ($1, $2, '', FALSE, $3, $3, 0)
         ON CONFLICT (jti) DO UPDATE SET last_revalidated = $3`,
        [`reval_${ghlUserId}`, ghlUserId, now],
      );
      return;
    }
    lastRevalidated.set(ghlUserId, now);
  },

  /** Seconds since the last revalidation (Infinity if never). */
  async secondsSinceRevalidation(ghlUserId: string): Promise<number> {
    if (dbAvailable()) {
      const rows = await query<{ last_revalidated: string | null }>(
        "SELECT last_revalidated FROM sessions WHERE jti = $1",
        [`reval_${ghlUserId}`],
      );
      const t = rows[0]?.last_revalidated;
      if (!t) return Infinity;
      return (Date.now() - Number(t)) / 1000;
    }
    const t = lastRevalidated.get(ghlUserId);
    if (!t) return Infinity;
    return (Date.now() - t) / 1000;
  },

  /** Dev/test helper: reset the in-memory fallback. */
  clear(): void {
    revoked.clear();
    lastRevalidated.clear();
  },

  /** Dev/test helper: reset persisted state (tests only). */
  async clearDb(): Promise<void> {
    if (dbAvailable()) {
      await query("DELETE FROM sessions");
    }
  },
};
