/**
 * OAuth state store — single-use, short-lived state nonces for the OAuth
 * Authorization Code flow. Prevents CSRF + code-replay attacks.
 *
 * A state is created at /auth/oauth/start, validated once at /auth/oauth/callback,
 * then consumed (marked used). A state older than STATE_TTL_MS is rejected.
 *
 * PERSISTENCE:
 * - Postgres when the DB pool is available: states survive restarts and are
 *   shared across instances, so a restart mid-OAuth cannot orphan a state.
 * - In-memory fallback (Map) when no DB (dev/tests).
 *
 * Anti-replay: `consume` is atomic — a row is marked used_at only if it was
 * unused; a second consume sees the used row and returns null.
 */

import { query, dbAvailable } from "../db/client";

const states = new Map<string, { createdAt: number; redirectAfter?: string }>();
const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const oauthStateStore = {
  async create(redirectAfter?: string): Promise<string> {
    const state = `st_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const now = Date.now();
    if (dbAvailable()) {
      await query(
        `INSERT INTO oauth_states (state, redirect_after, created_at, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [state, redirectAfter ?? null, now, now + STATE_TTL_MS],
      );
      return state;
    }
    states.set(state, { createdAt: now, redirectAfter });
    return state;
  },

  /** Validate + consume. Returns the stored redirectAfter, or null if invalid. */
  async consume(state: string): Promise<string | null> {
    if (dbAvailable()) {
      // Atomic single-use: claim the row only if unused + not expired.
      const claimed = await query<{ redirect_after: string | null }>(
        `UPDATE oauth_states SET used_at = $2
         WHERE state = $1 AND used_at IS NULL AND expires_at > $2
         RETURNING redirect_after`,
        [state, Date.now()],
      );
      if (claimed.length === 0) return null;
      return claimed[0].redirect_after ?? "/";
    }
    const entry = states.get(state);
    if (!entry) return null;
    states.delete(state);
    if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
    return entry.redirectAfter ?? "/";
  },

  /** Dev/test helper: reset the in-memory fallback. */
  clear(): void {
    states.clear();
  },

  /** Dev/test helper: reset persisted state (tests only). */
  async clearDb(): Promise<void> {
    if (dbAvailable()) {
      await query("DELETE FROM oauth_states");
    }
  },
};
