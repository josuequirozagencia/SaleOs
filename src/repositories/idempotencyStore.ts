/**
 * Idempotency store for webhook processing. Ensures the same webhook event is
 * never processed twice (dedup by event id).
 *
 * PERSISTENCE:
 * - Postgres when the DB pool is available: dedup survives restarts and is
 *   shared across instances (important for webhook redelivery).
 * - In-memory fallback (Set) when no DB (dev/tests).
 */

import { query, dbAvailable, withClient } from "../db/client";

const processed = new Set<string>();

export const idempotencyStore = {
  /**
   * Returns true if the event id was already processed; marks it otherwise.
   * Atomic in Postgres via ON CONFLICT DO NOTHING + rowcount check.
   */
  async seen(eventId: string, tenantId?: string): Promise<boolean> {
    if (!eventId) return false;
    if (dbAvailable()) {
      // Atomic single-use: INSERT ... ON CONFLICT DO NOTHING. rowCount=1 means
      // the row was inserted (first time → NOT seen); rowCount=0 means a
      // conflict (already present → seen). We use withClient to access
      // rowCount, since the query() helper only returns rows.
      const inserted = await withClient(async (client) => {
        const r = await client.query(
          `INSERT INTO idempotency (event_id, tenant_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (event_id) DO NOTHING`,
          [eventId, tenantId ?? null, Date.now()],
        );
        return r.rowCount;
      });
      // inserted === 1 → newly recorded → NOT previously seen.
      // inserted === 0 → already present → seen.
      return inserted === 0;
    }
    if (processed.has(eventId)) return true;
    processed.add(eventId);
    return false;
  },

  clear() {
    processed.clear();
  },

  /** Reset persisted state (tests only). Clears both in-memory and DB. */
  async clearAll(): Promise<void> {
    processed.clear();
    if (dbAvailable()) {
      try {
        await query("DELETE FROM idempotency");
      } catch {
        // best-effort
      }
    }
  },
};
