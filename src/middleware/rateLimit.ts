/**
 * Lightweight in-memory rate limiter (token bucket).
 *
 * The bucket key is derived from the AUTHENTICATED session when present
 * (tenantId + ghlUserId), falling back to the remote IP for unauthenticated
 * routes (login, webhooks). The client-controlled `x-tenant-id` header is
 * NEVER used as a key — otherwise a client could rotate it to evade limits.
 *
 * For production, swap for a Redis-backed limiter — the interface is stable.
 * Returns 429 RATE_LIMITED when exceeded.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "../utils/errors";
import type { AuthSession } from "../types";

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "anon";
}

export function rateLimit(opts: { capacity: number; refillPerMinute: number }) {
  return (req: IncomingMessage & { session?: AuthSession }, _res: ServerResponse, next: (err?: unknown) => void) => {
    // Prefer the authenticated identity; never trust a client header for the key.
    const key = req.session ? `t:${req.session.tenantId}:u:${req.session.ghlUserId}` : `ip:${clientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: opts.capacity, last: now };

    // refill
    const elapsed = now - bucket.last;
    const refilled = Math.min(opts.capacity, bucket.tokens + (elapsed / WINDOW_MS) * opts.refillPerMinute);
    bucket.tokens = refilled;
    bucket.last = now;

    if (bucket.tokens < 1) {
      return next(new ApiError("RATE_LIMITED", "Too many requests. Please slow down."));
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}

/** Per-domain rate limit presets. Apply the appropriate limiter per route group. */
export const rateLimits = {
  auth: rateLimit({ capacity: 10, refillPerMinute: 5 }),
  messages: rateLimit({ capacity: 60, refillPerMinute: 30 }),
  webhooks: rateLimit({ capacity: 200, refillPerMinute: 100 }),
  uploads: rateLimit({ capacity: 20, refillPerMinute: 10 }),
  analytics: rateLimit({ capacity: 30, refillPerMinute: 15 }),
  default: rateLimit({ capacity: 100, refillPerMinute: 60 }),
};
