/**
 * Password hashing — salted scrypt (Node built-in, no external dep).
 *
 * Format: `scrypt$<saltB64>$<hashB64>` where the hash is 64 bytes derived via
 * scrypt(N=16384, r=8, p=1). Verification is constant-time. The plaintext
 * password is NEVER stored or logged; only this opaque string persists.
 *
 * SECURITY: this is BeautyCRM's own credential store. The CRM platform is
 * still the Source of Truth for CRM identity; these credentials only gate
 * access to the BeautyCRM session, which is then linked to a ghlUserId.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Hash a plaintext password into the persisted `scrypt$salt$hash` string. */
export function hashPassword(plain: string): string {
  if (!plain) throw new Error("Password must not be empty");
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Verify a plaintext password against the stored hash. Constant-time. */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const actual = scryptSync(plain, salt, expected.length, SCRYPT_PARAMS);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
