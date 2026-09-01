/**
 * Auth middleware. Extracts the session JWT from the Authorization header or
 * the `session` cookie, verifies it, checks the revocation list, and — at a
 * bounded interval — revalidates the user against the CRM directory.
 *
 * The session is the authority for data scoping. Client-supplied
 * assignedTo/viewAs/tenantId values are NEVER trusted; they are validated
 * against the session in the permissions layer.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyJwt } from "./jwt";
import { sessionStore } from "./sessionStore";
import { authService } from "./authService";
import { config } from "../config/env";
import { ApiError } from "../utils/errors";
import type { AuthSession } from "../types";

export interface AuthedRequest extends IncomingMessage {
  session?: AuthSession;
}

export function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.cookie ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === "session" && v.length) return v.join("=");
  }
  return null;
}

/** Requires a valid, non-revoked session; revalidates periodically. */
export async function requireAuth(req: AuthedRequest, _res: ServerResponse, next: (err?: unknown) => void) {
  try {
    const token = extractToken(req);
    if (!token) return next(new ApiError("UNAUTHORIZED", "Authentication required"));
    const session = verifyJwt(token);
    if (!session) return next(new ApiError("UNAUTHORIZED", "Invalid or expired session"));
    if (session.jti && (await sessionStore.isRevoked(session.jti))) {
      return next(new ApiError("UNAUTHORIZED", "Session revoked"));
    }
    req.session = session;

    // Bounded revalidation: confirm the user is still active in the CRM and the
    // tenant is still connected. This catches deactivation / role change / OAuth
    // revocation that happened after the JWT was issued. Runs at most every
    // REVALIDATION_INTERVAL_SECONDS per user.
    const since = await sessionStore.secondsSinceRevalidation(session.ghlUserId);
    if (since >= config.revalidationIntervalSeconds) {
      // Revalidate — if the user was deactivated, the request must be rejected.
      await authService.revalidate(session);
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Optional auth — attaches session if present but does not reject. */
export async function optionalAuth(req: AuthedRequest, _res: ServerResponse, next: (err?: unknown) => void) {
  try {
    const token = extractToken(req);
    if (token) {
      const session = verifyJwt(token);
      if (session && !(session.jti && (await sessionStore.isRevoked(session.jti)))) req.session = session;
    }
    next();
  } catch {
    next();
  }
}

/** Set the session as an HttpOnly, Secure, SameSite cookie. */
export function setSessionCookie(res: ServerResponse, token: string): void {
  const flags = [
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${config.sessionTtlSeconds}`,
    "Path=/",
  ];
  if (config.nodeEnv === "production") flags.push("Secure");
  res.setHeader("Set-Cookie", `session=${token}; ${flags.join("; ")}`);
}

/** Clear the session cookie. */
export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/");
}
