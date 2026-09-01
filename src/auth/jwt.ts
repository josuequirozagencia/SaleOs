/**
 * Minimal JWT implementation using Node crypto (no external dep).
 * Signs/verifies HS256 tokens carrying the AuthSession payload.
 *
 * The JWT is ONLY an internal BeautyCRM session — it is never the identity
 * authority. Identity is established server-side from the verified GHL user
 * context (Embedded) or OAuth token exchange (Standalone), then encoded into
 * this short-lived session token. The jti enables server-side revocation.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { config } from "../config/env";
import type { AuthSession } from "../types";

function base64Url(input: Buffer | string): string {
  let s = Buffer.from(input).toString("base64");
  while (s.endsWith("=")) s = s.slice(0, -1);
  s = s.split("+").join("-");
  s = s.split("/").join("_");
  return s;
}

function base64UrlDecode(input: string): Buffer {
  let s = input;
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  s = s.split("-").join("+");
  s = s.split("_").join("/");
  return Buffer.from(s + pad, "base64");
}

function newJti(): string {
  return `ses_${randomBytes(12).toString("hex")}`;
}

export function signJwt(session: Omit<AuthSession, "jti" | "iat" | "exp">, ttlSeconds = config.sessionTtlSeconds): { token: string; jti: string } {
  const jti = newJti();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ ...session, jti, iat, exp }),
  );
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", config.jwtSecret).update(data).digest();
  const sigB64 = base64Url(sig);
  return { token: `${data}.${sigB64}`, jti };
}

export function verifyJwt(token: string): AuthSession | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expected = createHmac("sha256", config.jwtSecret).update(data).digest();
  const actual = base64UrlDecode(sig);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  try {
    const decoded = JSON.parse(base64UrlDecode(payload).toString("utf8")) as AuthSession;
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}
