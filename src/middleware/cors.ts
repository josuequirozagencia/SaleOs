/**
 * CORS middleware. Allows configured origins and the standard headers/methods
 * used by the SPA. Credentials supported for cookie-based sessions.
 *
 * SECURITY: never reflects an arbitrary request origin, and never combines
 * `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` (that is an
 * invalid + insecure combination). Only origins explicitly listed in config
 * are allowed.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config/env";

export function corsMiddleware(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
  const origin = req.headers.origin ?? "";
  const allowed = config.corsOrigin.includes(origin);
  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  next();
}
