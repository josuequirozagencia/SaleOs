/**
 * AppUser repository — BeautyCRM-owned login users.
 *
 * Stores ONLY what BeautyCRM needs to authenticate a user and link them to a
 * CRM identity: id, tenantId, ghlUserId, email, name, passwordHash, role,
 * active. The CRM platform remains the Source of Truth for CRM entities
 * (contacts, conversations, opportunities, the CRM user directory); this
 * table is the BeautyCRM auth + authorization layer scoped by tenant_id.
 *
 * SECURITY:
 *  - Every query filters by tenant_id; one academy can never read another's
 *    users (multi-tenant isolation).
 *  - passwordHash is never returned by any read method — callers receive the
 *    safe projection (toSafeUser) only.
 *  - role/active are authoritative here; the client never supplies them as
 *    trusted values (the route layer enforces this).
 *
 * PERSISTENCE: Postgres when the pool is available (production + local dev);
 * in-memory Map fallback when no DB (dev/tests). The in-memory fallback seeds
 * a demo admin so the app + tests can log in without a database.
 */

import { query, dbAvailable } from "../db/client";
import { hashPassword } from "../auth/password";
import type { Role } from "../types";

export type AppScope = "all" | "team" | "self";

/** The full persisted row (server-side only — never serialized to the client). */
export interface AppUserRow {
  id: string;
  tenantId: string;
  ghlUserId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Safe projection returned to callers / API responses — no passwordHash. */
export interface SafeAppUser {
  id: string;
  tenantId: string;
  ghlUserId: string;
  email: string;
  name: string;
  role: Role;
  scope: AppScope;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Role → data scope (mirrors permissions.ts ROLE_SCOPE). */
export function scopeForRole(role: Role): AppScope {
  switch (role) {
    case "super_admin":
    case "admin":
      return "all";
    case "supervisor":
      return "team";
    default:
      return "self";
  }
}

function toSafe(row: AppUserRow): SafeAppUser {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ghlUserId: row.ghlUserId,
    email: row.email,
    name: row.name,
    role: row.role,
    scope: scopeForRole(row.role),
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── In-memory fallback (dev/tests without a DB) ───────────────────────────
interface MemUser extends AppUserRow {}
const memUsers = new Map<string, MemUser>(); // keyed by `${tenantId}:${email}`

let memSeeded = false;
function seedMemOnce(): void {
  if (memSeeded) return;
  const now = Date.now();
  // Demo admin so the app + tests can log in without a database. The password
  // is hashed with the same algorithm as production.
  const admin: MemUser = {
    id: "au_admin",
    tenantId: "default",
    ghlUserId: "u_admin",
    email: "admin@demo.com",
    name: "Admin Global",
    passwordHash: hashPassword("admin123"),
    role: "super_admin",
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  memUsers.set(`${admin.tenantId}:${admin.email}`, admin);
  memSeeded = true;
}

type DbRow = {
  id: string;
  tenant_id: string;
  ghl_user_id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function rowToAppUser(r: DbRow): AppUserRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    ghlUserId: r.ghl_user_id,
    email: r.email,
    name: r.name,
    passwordHash: r.password_hash,
    role: r.role as Role,
    active: r.active,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

const uid = (p: string) =>
  `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const appUserRepo = {
  /**
   * Find a user by email within a tenant for login. Returns the FULL row
   * (including passwordHash) — this is the ONLY method that exposes the hash,
   * and only to the trusted authService for verification. Never serialize
   * the result to a client.
   */
  async findByEmailForLogin(
    tenantId: string,
    email: string,
  ): Promise<AppUserRow | null> {
    const normalized = email.trim().toLowerCase();
    if (dbAvailable()) {
      const rows = await query<DbRow>(
        `SELECT * FROM app_users WHERE tenant_id = $1 AND email = $2`,
        [tenantId, normalized],
      );
      return rows[0] ? rowToAppUser(rows[0]) : null;
    }
    seedMemOnce();
    return memUsers.get(`${tenantId}:${normalized}`) ?? null;
  },

  /**
   * Find a user by email across ALL tenants (login entry point). A user logs
   * in with just email + password, so we resolve the (tenantId, row) pair
   * here. Returns the FULL row (with passwordHash) for verification — never
   * serialize to a client.
   *
   * SECURITY: this does NOT trust any client-supplied tenantId. The tenantId
   * is derived from the persisted row, then encoded into the session.
   */
  async findByEmailGlobal(email: string): Promise<AppUserRow | null> {
    const normalized = email.trim().toLowerCase();
    if (dbAvailable()) {
      // Do NOT filter by active here: the login flow must distinguish an
      // inactive user (→ "Usuario inactivo") from a non-existent one
      // (→ "Credenciales incorrectas") to avoid false negatives. The active
      // check is performed by the caller (authService.login).
      const rows = await query<DbRow>(
        `SELECT * FROM app_users WHERE email = $1 LIMIT 1`,
        [normalized],
      );
      return rows[0] ? rowToAppUser(rows[0]) : null;
    }
    seedMemOnce();
    for (const u of memUsers.values()) {
      if (u.email === normalized) return u;
    }
    return null;
  },

  /** Get a user by id within a tenant (safe projection). */
  async getById(tenantId: string, id: string): Promise<SafeAppUser | null> {
    if (dbAvailable()) {
      const rows = await query<DbRow>(
        `SELECT * FROM app_users WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );
      return rows[0] ? toSafe(rowToAppUser(rows[0])) : null;
    }
    seedMemOnce();
    for (const u of memUsers.values()) {
      if (u.tenantId === tenantId && u.id === id) return toSafe(u);
    }
    return null;
  },

  /** Get a user by ghlUserId within a tenant (safe projection). */
  async getByGhlUserId(
    tenantId: string,
    ghlUserId: string,
  ): Promise<SafeAppUser | null> {
    if (dbAvailable()) {
      const rows = await query<DbRow>(
        `SELECT * FROM app_users WHERE tenant_id = $1 AND ghl_user_id = $2`,
        [tenantId, ghlUserId],
      );
      return rows[0] ? toSafe(rowToAppUser(rows[0])) : null;
    }
    seedMemOnce();
    for (const u of memUsers.values()) {
      if (u.tenantId === tenantId && u.ghlUserId === ghlUserId) return toSafe(u);
    }
    return null;
  },

  /** List all users of a tenant (safe projections). */
  async listByTenant(tenantId: string): Promise<SafeAppUser[]> {
    if (dbAvailable()) {
      const rows = await query<DbRow>(
        `SELECT * FROM app_users WHERE tenant_id = $1 ORDER BY created_at`,
        [tenantId],
      );
      return rows.map((r) => toSafe(rowToAppUser(r)));
    }
    seedMemOnce();
    return [...memUsers.values()]
      .filter((u) => u.tenantId === tenantId)
      .map(toSafe);
  },

  /** Create a user. Caller supplies a plaintext password; it is hashed here. */
  async create(args: {
    tenantId: string;
    ghlUserId: string;
    email: string;
    name: string;
    password: string;
    role: Role;
  }): Promise<SafeAppUser> {
    const now = Date.now();
    const normalized = args.email.trim().toLowerCase();
    const row: AppUserRow = {
      id: uid("au"),
      tenantId: args.tenantId,
      ghlUserId: args.ghlUserId,
      email: normalized,
      name: args.name,
      passwordHash: hashPassword(args.password),
      role: args.role,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    if (dbAvailable()) {
      const rows = await query<DbRow>(
        `INSERT INTO app_users (id, tenant_id, ghl_user_id, email, name, password_hash, role, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $8)
         RETURNING *`,
        [
          row.id, row.tenantId, row.ghlUserId, row.email, row.name,
          row.passwordHash, row.role, now,
        ],
      );
      return toSafe(rowToAppUser(rows[0]));
    }
    seedMemOnce();
    const key = `${row.tenantId}:${row.email}`;
    if (memUsers.has(key)) {
      throw new Error("EMAIL_TAKEN");
    }
    for (const u of memUsers.values()) {
      if (u.tenantId === row.tenantId && u.ghlUserId === row.ghlUserId) {
        throw new Error("GHL_USER_TAKEN");
      }
    }
    memUsers.set(key, row);
    return toSafe(row);
  },

  /** Update editable fields. Role changes are controlled by the route layer. */
  async update(
    tenantId: string,
    id: string,
    updates: Partial<{
      name: string;
      email: string;
      role: Role;
      ghlUserId: string;
      active: boolean;
      password: string;
    }>,
  ): Promise<SafeAppUser | null> {
    const now = Date.now();
    const sets: string[] = ["updated_at = $1"];
    const vals: unknown[] = [now];
    let i = 2;
    if (updates.name !== undefined) { sets.push(`name = $${i++}`); vals.push(updates.name); }
    if (updates.email !== undefined) { sets.push(`email = $${i++}`); vals.push(updates.email.trim().toLowerCase()); }
    if (updates.role !== undefined) { sets.push(`role = $${i++}`); vals.push(updates.role); }
    if (updates.ghlUserId !== undefined) { sets.push(`ghl_user_id = $${i++}`); vals.push(updates.ghlUserId); }
    if (updates.active !== undefined) { sets.push(`active = $${i++}`); vals.push(updates.active); }
    if (updates.password !== undefined) { sets.push(`password_hash = $${i++}`); vals.push(hashPassword(updates.password)); }

    if (dbAvailable()) {
      const rows = await query<DbRow>(
        `UPDATE app_users SET ${sets.join(", ")} WHERE tenant_id = $${i} AND id = $${i + 1} RETURNING *`,
        [...vals, tenantId, id],
      );
      return rows[0] ? toSafe(rowToAppUser(rows[0])) : null;
    }
    seedMemOnce();
    for (const u of memUsers.values()) {
      if (u.tenantId === tenantId && u.id === id) {
        if (updates.name !== undefined) u.name = updates.name;
        if (updates.email !== undefined) {
          memUsers.delete(`${u.tenantId}:${u.email}`);
          u.email = updates.email.trim().toLowerCase();
          memUsers.set(`${u.tenantId}:${u.email}`, u);
        }
        if (updates.role !== undefined) u.role = updates.role;
        if (updates.ghlUserId !== undefined) u.ghlUserId = updates.ghlUserId;
        if (updates.active !== undefined) u.active = updates.active;
        if (updates.password !== undefined) u.passwordHash = hashPassword(updates.password);
        u.updatedAt = now;
        return toSafe(u);
      }
    }
    return null;
  },

  /** Set the active flag (activate/deactivate). */
  async setActive(
    tenantId: string,
    id: string,
    active: boolean,
  ): Promise<SafeAppUser | null> {
    return this.update(tenantId, id, { active });
  },

  /** Dev/test helper: reset the in-memory fallback. */
  clearMem(): void {
    memUsers.clear();
    memSeeded = false;
  },
};
