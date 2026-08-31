/**
 * Express-compatible auth middleware. Extracts the session JWT from the
 * Authorization header (or cookie) and attaches the authenticated session
 * to the request. Rejects unauthenticated requests with UNAUTHORIZED.
 *
 * The session is the authority for data scoping — never trust client-sent
 * assignedTo/viewAs values blindly; they are validated against the session.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyJwt } from "./jwt";
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

/** Requires a valid session. */
export function requireAuth(req: AuthedRequest, _res: ServerResponse, next: (err?: unknown) => void) {
  const token = extractToken(req);
  if (!token) return next(new ApiError("UNAUTHORIZED", "Authentication required"));
  const session = verifyJwt(token);
  if (!session) return next(new ApiError("UNAUTHORIZED", "Invalid or expired session"));
  req.session = session;
  next();
}

/** Optional auth — attaches session if present but does not reject. */
export function optionalAuth(req: AuthedRequest, _res: ServerResponse, next: (err?: unknown) => void) {
  const token = extractToken(req);
  if (token) {
    const session = verifyJwt(token);
    if (session) req.session = session;
  }
  next();
}
