/**
 * Tenant repository. In production this is backed by a database; in dev it is
 * an in-memory map. Each tenant holds its CRM locationId + encrypted provider
 * token. The plaintext token is NEVER returned to any caller — only
 * `tokenLast4` for masked display.
 *
 * Multi-tenant isolation: every query in the modules is scoped by tenantId.
 * No tenant can read another tenant's data.
 */

import type { Tenant } from "../types";
import { encrypt, decrypt, maskToken } from "../utils/crypto";

const tenants = new Map<string, Tenant>();

// Seed a default dev tenant.
tenants.set("default", {
  id: "default",
  name: "Academia Belleza Demo",
  ghlLocationId: "loc_demo_001",
  encryptedToken: "",
  tokenLast4: undefined,
  active: true,
  createdAt: Date.now(),
});

export const tenantRepo = {
  get(tenantId: string): Tenant | null {
    return tenants.get(tenantId) ?? null;
  },

  /** Returns the decrypted token (server-side only — never serialized). */
  getToken(tenantId: string): string | null {
    const t = tenants.get(tenantId);
    if (!t || !t.encryptedToken) return null;
    try { return decrypt(t.encryptedToken); } catch { return null; }
  },

  saveCredentials(tenantId: string, token: string, locationId: string): Tenant {
    const t = tenants.get(tenantId) ?? { id: tenantId, name: tenantId, ghlLocationId: locationId, encryptedToken: "", active: true, createdAt: Date.now() };
    t.encryptedToken = token ? encrypt(token) : "";
    t.tokenLast4 = maskToken(token);
    t.ghlLocationId = locationId || t.ghlLocationId;
    tenants.set(tenantId, t);
    return t;
  },

  clearCredentials(tenantId: string): Tenant {
    const t = tenants.get(tenantId);
    if (t) { t.encryptedToken = ""; t.tokenLast4 = undefined; tenants.set(tenantId, t); }
    return t!;
  },

  /** Masked config for the frontend — never includes the token. */
  masked(tenantId: string): { hasToken: boolean; tokenLast4?: string; locationId: string | null; persisted: boolean } {
    const t = tenants.get(tenantId);
    return { hasToken: !!t?.encryptedToken, tokenLast4: t?.tokenLast4, locationId: t?.ghlLocationId ?? null, persisted: !!t?.encryptedToken };
  },
};
