/**
 * Idempotency store for webhook processing. Ensures the same webhook event is
 * never processed twice (dedup by event id). In-memory in dev; Redis/DB in prod.
 */

const processed = new Set<string>();

export const idempotencyStore = {
  /** Returns true if the event id was already processed; marks it otherwise. */
  seen(eventId: string): boolean {
    if (processed.has(eventId)) return true;
    processed.add(eventId);
    return false;
  },
  clear() { processed.clear(); },
};
