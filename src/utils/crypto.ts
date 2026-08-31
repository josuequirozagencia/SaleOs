/**
 * Symmetric encryption helpers for storing provider tokens at rest.
 * Uses Node's built-in crypto (AES-256-GCM) — no external deps.
 *
 * SECURITY: tokens are encrypted before persistence and never returned in
 * plaintext to any API response. Only `tokenLast4` is exposed for display.
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { config } from "../config/env";

const ALGO = "aes-256-gcm";
// Derive a stable 32-byte key from the configured encryption key (any length)
// via SHA-256. This guarantees a valid AES-256 key regardless of input length.
const KEY = createHash("sha256").update(config.encryptionKey || "dev-encryption-key").digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: iv:tag:ciphertext (all base64)
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid ciphertext");
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskToken(token: string): string | undefined {
  if (!token) return undefined;
  return token.slice(-4);
}
