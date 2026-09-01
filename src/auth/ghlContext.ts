/**
 * GoHighLevel Marketplace App — User Context decryption.
 *
 * The platform delivers an AES-encrypted user-context payload to the embedded
 * app (Custom Menu Link via window.exposeSessionDetails, or Custom Page via
 * postMessage). The frontend CANNOT read it — it forwards the opaque string
 * to the backend, which decrypts it here with the Marketplace App's
 * Shared Secret (GHL_APP_SHARED_SECRET).
 *
 * Format (OpenSSL / CryptoJS-compatible): a base64 string whose decoded bytes
 * begin with the ASCII marker "Salted__" followed by an 8-byte salt and the
 * ciphertext. Key + IV are derived from the secret + salt via EVP_BytesToKey
 * (MD5). This mirrors CryptoJS.AES.decrypt exactly, which is what the official
 * documentation references.
 *
 * SECURITY: the Shared Secret is server-side only. If decryption fails (wrong
 * secret, tampered payload), we reject the login — there is no fallback.
 */

import { createHash, createDecipheriv } from "node:crypto";
import { config } from "../config/env";
import { ApiError } from "../utils/errors";

export interface GhlUserContext {
  userId: string;
  companyId?: string;
  role?: string;
  type?: string;
  activeLocation?: string;
  userName?: string;
  email?: string;
  isAgencyOwner?: boolean;
  versionId?: string;
  appStatus?: string;
}

const SALTED = Buffer.from("Salted__", "utf8");

/**
 * OpenSSL EVP_BytesToKey derivation (MD5) — produces key+IV of the requested
 * lengths. This is the exact derivation CryptoJS uses for its default
 * passphrase-based AES.
 */
function evpBytesToKey(password: Buffer, salt: Buffer, keyLen: number, ivLen: number): { key: Buffer; iv: Buffer } {
  const hashes: Buffer[] = [];
  let prev: Buffer = Buffer.alloc(0);
  while (hashes.length * 16 < keyLen + ivLen) {
    const h = createHash("md5").update(Buffer.concat([prev, password, salt])).digest();
    hashes.push(h);
    prev = h;
  }
  const all = Buffer.concat(hashes);
  return { key: all.subarray(0, keyLen), iv: all.subarray(keyLen, keyLen + ivLen) };
}

/**
 * Decrypt the platform-provided user context. Throws ApiError(UNAUTHORIZED)
 * on any failure — the caller must surface 401, never a partial identity.
 */
export function decryptUserContext(encrypted: string): GhlUserContext {
  if (!config.ghl.sharedSecret) {
    throw new ApiError("UNAUTHORIZED", "Embedded SSO no configurado (falta GHL_APP_SHARED_SECRET)");
  }
  if (!encrypted || typeof encrypted !== "string") {
    throw new ApiError("UNAUTHORIZED", "Contexto de usuario ausente");
  }

  let cipherText: Buffer;
  try {
    cipherText = Buffer.from(encrypted, "base64");
  } catch {
    throw new ApiError("UNAUTHORIZED", "Contexto de usuario malformado");
  }
  if (cipherText.length < 16 || cipherText.subarray(0, 8).toString("utf8") !== "Salted__") {
    throw new ApiError("UNAUTHORIZED", "Contexto de usuario inválido");
  }

  const salt = cipherText.subarray(8, 16);
  const data = cipherText.subarray(16);
  const { key, iv } = evpBytesToKey(Buffer.from(config.ghl.sharedSecret, "utf8"), salt, 32, 16);

  let plain: string;
  try {
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    plain = dec.toString("utf8");
  } catch {
    throw new ApiError("UNAUTHORIZED", "No se pudo verificar la identidad (descifrado fallido)");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plain);
  } catch {
    throw new ApiError("UNAUTHORIZED", "Contexto de usuario corrupto");
  }

  const ctx = parsed as GhlUserContext;
  if (!ctx || typeof ctx.userId !== "string" || !ctx.userId) {
    throw new ApiError("UNAUTHORIZED", "Contexto de usuario sin identidad");
  }
  return ctx;
}
