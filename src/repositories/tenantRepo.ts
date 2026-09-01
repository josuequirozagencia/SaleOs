/**
 * Tenant repository — the multi-tenant core.
 *
 * Resolves a CRM locationId (sub-account) to a BeautyCRM tenantId. Every
 * app-local query is scoped by tenantId; no tenant can read another tenant's
 * data. The tenantId is ALWAYS derived server-side from the verified session
 * — a client-supplied tenantId/locationId is never trusted for authorization.
 *
 * PERSISTENCE:
 * - Postgres when `DATABASE_URL`/pool is available (production + local dev).
 *   Survives restarts; shared across instances.
 * - In-memory Map fallback when no DB (tests/dev without Postgres). The
 *   default dev tenant is seeded so the app still boots.
 *
 * SECURITY: the provider token is encrypted at rest (AES-256-GCM) before it
 * touches the DB. Only `tokenLast4` is ever returned to any caller. The
 * plaintext token is decrypted server-side only, on demand, for CRM calls.
 */

import type { Tenant } from "../types";
import { encrypt, decrypt, maskToken } from "../utils/crypto";
import { query, dbAvailable } from "../db/client";
import { config } from "../config/env";
import { logger } from "../utils/router";

// ── In-memory fallback (dev/tests without a DB) ─────────────────────────
const memTenants = new Map<string, Tenant>();
memTenants.set("default", {
  id: "default",
  name: "Academia Belleza Demo",
  ghlLocationId: "loc_demo_001",
  encryptedToken: "",
  tokenLast4: undefined,
  active: true,
  createdAt: Date.now(),
});

// Dev/test parity: when the DB is active but the canonical "default" tenant
// (loc_demo_001) is missing, seed it once so the DB path matches the
// in-memory fallback. This mirrors the in-memory seed above. NEVER seeds in
// production (production tenants come exclusively from OAuth onboarding).
let dbDefaultSeeded = false;
async function ensureDbDefaultSeed(): Promise<void> {
  if (dbDefaultSeeded || config.nodeEnv === "production") return;
  try {
    const existing = await query<TenantRow>(
      "SELECT id FROM tenants WHERE location_id = $1",
      ["loc_demo_001"],
    );
    if (existing.length === 0) {
      const now = Date.now();
      await query(
        `INSERT INTO tenants (id, location_id, name, encrypted_token, status, active, created_at, updated_at)
         VALUES ('default', 'loc_demo_001', 'Academia Belleza Demo', '', 'active', TRUE, $1, $1)
         ON CONFLICT (location_id) DO NOTHING`,
        [now],
      );
    }
    dbDefaultSeeded = true;
  } catch {
    // best-effort seed
  }
}

type TenantRow = {
  id: string;
  location_id: string;
  company_id: string | null;
  name: string;
  encrypted_token: string;
  token_last4: string | null;
  status: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function rowToTenant(r: TenantRow): Tenant {
  return {
    id: r.id,
    name: r.name,
    ghlLocationId: r.location_id,
    encryptedToken: r.encrypted_token ?? "",
    tokenLast4: r.token_last4 ?? undefined,
    active: r.active,
    createdAt: Number(r.created_at),
  };
}

export const tenantRepo = {
  async get(tenantId: string): Promise<Tenant | null> {
    if (dbAvailable()) {
      await ensureDbDefaultSeed();
      const rows = await query<TenantRow>(
        "SELECT * FROM tenants WHERE id = $1",
        [tenantId],
      );
      return rows[0] ? rowToTenant(rows[0]) : null;
    }
    return memTenants.get(tenantId) ?? null;
  },

  /** Resolve a tenant by its CRM locationId (sub-account). Multi-tenant core. */
  async findByLocationId(locationId: string): Promise<Tenant | null> {
    if (!locationId) return null;
    if (dbAvailable()) {
      await ensureDbDefaultSeed();
      const rows = await query<TenantRow>(
        "SELECT * FROM tenants WHERE location_id = $1 AND active = TRUE",
        [locationId],
      );
      return rows[0] ? rowToTenant(rows[0]) : null;
    }
    for (const t of memTenants.values()) {
      if (t.ghlLocationId === locationId && t.active) return t;
    }
    return null;
  },

  /**
   * Register (or upsert) a tenant for a CRM location. Called during OAuth
   * onboarding when an admin authorizes the app for a sub-account. The
   * provider token is encrypted at rest; only tokenLast4 is ever exposed.
   */
  async registerByLocation(locationId: string, name?: string, token?: string): Promise<Tenant> {
    const id = `t_${locationId}`;
    const now = Date.now();
    const encToken = token ? encrypt(token) : "";
    const last4 = token ? maskToken(token) : undefined;
    const label = name ?? id;

    if (dbAvailable()) {
      const rows = await query<TenantRow>(
        `INSERT INTO tenants (id, location_id, name, encrypted_token, token_last4, status, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', TRUE, $6, $6)
         ON CONFLICT (location_id) DO UPDATE SET
           name = EXCLUDED.name,
           encrypted_token = CASE WHEN EXCLUDED.encrypted_token <> '' THEN EXCLUDED.encrypted_token ELSE tenants.encrypted_token END,
           token_last4 = CASE WHEN EXCLUDED.encrypted_token <> '' THEN EXCLUDED.token_last4 ELSE tenants.token_last4 END,
           active = TRUE,
           status = 'active',
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [id, locationId, label, encToken, last4 ?? null, now],
      );
      return rowToTenant(rows[0]);
    }

    let t = await this.findByLocationId(locationId);
    if (!t) {
      t = { id, name: label, ghlLocationId: locationId, encryptedToken: "", active: true, createdAt: now };
      memTenants.set(id, t);
    }
    if (name) t.name = name;
    if (token) {
      t.encryptedToken = encToken;
      t.tokenLast4 = last4;
    }
    memTenants.set(t.id, t);
    return t;
  },

  /** Returns the decrypted token (server-side only — never serialized). */
  async getToken(tenantId: string): Promise<string | null> {
    const t = await this.get(tenantId);
    if (!t || !t.encryptedToken) return null;
    try {
      return decrypt(t.encryptedToken);
    } catch {
      return null;
    }
  },

  async saveCredentials(tenantId: string, token: string, locationId: string): Promise<Tenant> {
    const now = Date.now();
    const encToken = token ? encrypt(token) : "";
    const last4 = token ? maskToken(token) : undefined;

    if (dbAvailable()) {
      const rows = await query<TenantRow>(
        `INSERT INTO tenants (id, location_id, name, encrypted_token, token_last4, status, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', TRUE, $6, $6)
         ON CONFLICT (location_id) DO UPDATE SET
           encrypted_token = EXCLUDED.encrypted_token,
           token_last4 = EXCLUDED.token_last4,
           location_id = EXCLUDED.location_id,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [tenantId, locationId || tenantId, tenantId, encToken, last4 ?? null, now],
      );
      return rowToTenant(rows[0]);
    }

    const t = (await this.get(tenantId)) ?? {
      id: tenantId,
      name: tenantId,
      ghlLocationId: locationId,
      encryptedToken: "",
      active: true,
      createdAt: now,
    };
    t.encryptedToken = encToken;
    t.tokenLast4 = last4;
    t.ghlLocationId = locationId || t.ghlLocationId;
    memTenants.set(tenantId, t);
    return t;
  },

  async clearCredentials(tenantId: string): Promise<Tenant> {
    if (dbAvailable()) {
      const rows = await query<TenantRow>(
        `UPDATE tenants SET encrypted_token = '', token_last4 = NULL, updated_at = $2
         WHERE id = $1 RETURNING *`,
        [tenantId, Date.now()],
      );
      return rows[0] ? rowToTenant(rows[0]) : (await this.get(tenantId))!;
    }
    const t = await this.get(tenantId);
    if (t) {
      t.encryptedToken = "";
      t.tokenLast4 = undefined;
      memTenants.set(tenantId, t);
    }
    return t!;
  },

  /** Masked config for the frontend — never includes the token. */
  async masked(tenantId: string): Promise<{ hasToken: boolean; tokenLast4?: string; locationId: string | null; persisted: boolean }> {
    const t = await this.get(tenantId);
    return {
      hasToken: !!t?.encryptedToken,
      tokenLast4: t?.tokenLast4,
      locationId: t?.ghlLocationId ?? null,
      persisted: !!t?.encryptedToken,
    };
  },

  /** List all active tenants (used by the scheduler to iterate). */
  async listActive(): Promise<Tenant[]> {
    if (dbAvailable()) {
      const rows = await query<TenantRow>(
        "SELECT * FROM tenants WHERE active = TRUE ORDER BY created_at",
      );
      return rows.map(rowToTenant);
    }
    return [...memTenants.values()].filter((t) => t.active);
  },

  /** Dev/test helper: reset the in-memory fallback. */
  clearMem(): void {
    memTenants.clear();
  },
};
