/**
 * Schema migrations for the BeautyCRM-owned Postgres tables.
 *
 * Idempotent (CREATE TABLE IF NOT EXISTS). Run once at boot via
 * `runMigrations()`. Each migration is a named, ordered SQL block; the
 * `schema_migrations` table tracks which have been applied so re-runs skip
 * completed work. This is intentionally lightweight (no external framework).
 *
 * Tables (BeautyCRM-owned data ONLY — CRM entities stay in the provider):
 *   tenants          — location → tenant mapping + encrypted provider token
 *   sessions         — revoked jti list + per-user revalidation timestamp
 *   oauth_states     — single-use, short-lived OAuth state nonces
 *   idempotency      — processed webhook event ids (dedup)
 *   audit_log        — sensitive/admin action trace
 *
 * SECURITY: no tokens, secrets, PIT, or shared secrets are ever stored in
 * audit_log. Provider tokens in `tenants` are encrypted at rest (AES-256-GCM)
 * before persistence — only tokenLast4 is ever exposed.
 */

import { query, withClient } from "./client";
import { logger } from "../utils/router";

interface Migration {
  id: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS tenants (
        id              TEXT PRIMARY KEY,
        location_id     TEXT NOT NULL UNIQUE,
        company_id      TEXT,
        name            TEXT NOT NULL,
        encrypted_token TEXT NOT NULL DEFAULT '',
        token_last4     TEXT,
        status          TEXT NOT NULL DEFAULT 'active',
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      BIGINT NOT NULL,
        updated_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tenants_location ON tenants (location_id);
      CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants (active);

      CREATE TABLE IF NOT EXISTS sessions (
        jti             TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        tenant_id       TEXT NOT NULL,
        revoked         BOOLEAN NOT NULL DEFAULT FALSE,
        revoked_at      BIGINT,
        last_revalidated BIGINT,
        created_at      BIGINT NOT NULL,
        expires_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions (revoked);

      CREATE TABLE IF NOT EXISTS oauth_states (
        state           TEXT PRIMARY KEY,
        redirect_after  TEXT,
        created_at      BIGINT NOT NULL,
        expires_at      BIGINT NOT NULL,
        used_at         BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states (expires_at);

      CREATE TABLE IF NOT EXISTS idempotency (
        event_id        TEXT PRIMARY KEY,
        tenant_id       TEXT,
        created_at      BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id              BIGSERIAL PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        action          TEXT NOT NULL,
        resource        TEXT NOT NULL,
        resource_id     TEXT,
        metadata        JSONB,
        created_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log (tenant_id, created_at DESC);
    `,
  },
  {
    id: "0002_app_local",
    sql: `
      CREATE TABLE IF NOT EXISTS matriculas (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        contact_id      TEXT NOT NULL,
        contact_name    TEXT NOT NULL DEFAULT '',
        contact_phone   TEXT NOT NULL DEFAULT '',
        first_name      TEXT,
        last_name       TEXT,
        age             INTEGER,
        area            TEXT NOT NULL DEFAULT '',
        area_id         TEXT,
        program_id      TEXT,
        opportunity_id  TEXT,
        total           NUMERIC(14,2) NOT NULL DEFAULT 0,
        abono           NUMERIC(14,2) NOT NULL DEFAULT 0,
        payment_method  TEXT NOT NULL DEFAULT 'otro',
        enrollment_date BIGINT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pendiente',
        assigned_to     TEXT NOT NULL,
        notes           TEXT,
        custom_fields   JSONB,
        created_at      BIGINT NOT NULL,
        updated_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mat_tenant ON matriculas (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_mat_assigned ON matriculas (tenant_id, assigned_to);
      CREATE INDEX IF NOT EXISTS idx_mat_contact ON matriculas (tenant_id, contact_id);

      CREATE TABLE IF NOT EXISTS follow_ups (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        contact_id      TEXT NOT NULL,
        contact_name    TEXT NOT NULL DEFAULT '',
        ghl_user_id     TEXT NOT NULL,
        due_at          BIGINT NOT NULL,
        reason          TEXT NOT NULL DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'pending',
        type            TEXT NOT NULL DEFAULT 'otro',
        note            TEXT,
        created_at      BIGINT NOT NULL,
        completed_at    BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_fu_tenant ON follow_ups (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_fu_assigned ON follow_ups (tenant_id, ghl_user_id);
      CREATE INDEX IF NOT EXISTS idx_fu_contact ON follow_ups (tenant_id, contact_id);

      CREATE TABLE IF NOT EXISTS contact_notes (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        contact_id      TEXT NOT NULL,
        ghl_user_id     TEXT NOT NULL,
        text            TEXT NOT NULL,
        created_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notes_contact ON contact_notes (tenant_id, contact_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS timeline_events (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        contact_id      TEXT NOT NULL,
        type            TEXT NOT NULL,
        timestamp       BIGINT NOT NULL,
        title           TEXT NOT NULL DEFAULT '',
        description     TEXT,
        ghl_user_id     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tl_contact ON timeline_events (tenant_id, contact_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        contact_id      TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        advisor_user_id TEXT NOT NULL,
        message         TEXT NOT NULL,
        scheduled_at    BIGINT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'scheduled',
        created_at      BIGINT NOT NULL,
        updated_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sm_tenant ON scheduled_messages (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sm_due ON scheduled_messages (status, scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_sm_conv ON scheduled_messages (tenant_id, conversation_id);

      CREATE TABLE IF NOT EXISTS study_areas (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        name            TEXT NOT NULL,
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        "order"         INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_areas_tenant ON study_areas (tenant_id);

      CREATE TABLE IF NOT EXISTS programs (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        area_id         TEXT NOT NULL,
        name            TEXT NOT NULL,
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        "order"         INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_prog_tenant ON programs (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_prog_area ON programs (tenant_id, area_id);

      CREATE TABLE IF NOT EXISTS custom_fields (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        name            TEXT NOT NULL,
        key             TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT 'TEXT',
        placeholder     TEXT,
        description     TEXT,
        required        BOOLEAN NOT NULL DEFAULT FALSE,
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        "order"         INTEGER NOT NULL DEFAULT 0,
        options         JSONB
      );
      CREATE INDEX IF NOT EXISTS idx_cf_tenant ON custom_fields (tenant_id);

      CREATE TABLE IF NOT EXISTS quick_replies (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        name            TEXT NOT NULL,
        content         TEXT NOT NULL,
        category        TEXT NOT NULL DEFAULT 'general',
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at      BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_qr_tenant ON quick_replies (tenant_id);

      CREATE TABLE IF NOT EXISTS tenant_config (
        tenant_id       TEXT PRIMARY KEY,
        app_name        TEXT NOT NULL DEFAULT 'BeautyCRM AI',
        currency        JSONB,
        commercial_rules JSONB
      );
    `,
  },
  {
    id: "0003_user_profiles",
    sql: `
      -- BeautyCRM-owned user preferences (theme, language, monthlyGoal,
      -- commission, gamification, notification prefs). These are NOT CRM
      -- identity — the CRM platform exposes no endpoint for them. Identity
      -- (userId, email, name, role, location, active) stays in the CRM; only
      -- BeautyCRM preferences live here. Scoped by tenant_id + ghl_user_id
      -- so one academy can never read another's preferences.
      CREATE TABLE IF NOT EXISTS user_profiles (
        tenant_id       TEXT NOT NULL,
        ghl_user_id     TEXT NOT NULL,
        preferences     JSONB NOT NULL DEFAULT '{}',
        updated_at      BIGINT NOT NULL,
        PRIMARY KEY (tenant_id, ghl_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles (tenant_id);
    `,
  },
  {
    id: "0004_app_users",
    sql: `
      -- BeautyCRM-owned application users (login credentials + authorization).
      -- The CRM platform remains the Source of Truth for CRM identity
      -- (contacts, conversations, opportunities, CRM user directory). This
      -- table holds ONLY what BeautyCRM needs to authenticate its own users
      -- and link them to a CRM user (ghlUserId) within a tenant (location).
      --
      -- tenant_id + ghl_user_id is the link to the CRM identity; role/scope
      -- are derived server-side from this row, never trusted from the client.
      -- password_hash stores a salted scrypt hash (never the plaintext, never
      -- returned in any response). Scoped by tenant_id so one academy can
      -- never read another academy's users.
      CREATE TABLE IF NOT EXISTS app_users (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        ghl_user_id     TEXT NOT NULL,
        email           TEXT NOT NULL,
        name            TEXT NOT NULL DEFAULT '',
        password_hash   TEXT NOT NULL,
        role            TEXT NOT NULL DEFAULT 'advisor',
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      BIGINT NOT NULL,
        updated_at      BIGINT NOT NULL,
        UNIQUE (tenant_id, email),
        UNIQUE (tenant_id, ghl_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON app_users (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (email);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  if (!(await ensureSchemaTable())) return;
  for (const m of migrations) {
    const applied = await query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [m.id],
    );
    if (applied.length > 0) continue;
    await withClient(async (client) => {
      await client.query(m.sql);
      await client.query(
        "INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)",
        [m.id, Date.now()],
      );
    });
    logger.info(`Migration applied: ${m.id}`);
  }
  // Dev/test parity: seed the canonical "default" tenant so the DB path
  // matches the in-memory fallback's seed (loc_demo_001 → "default"). This
  // mirrors what the in-memory store does on boot. NEVER runs in production.
  if (process.env.NODE_ENV !== "production") {
    await seedDefaultTenant();
  }
}

async function seedDefaultTenant(): Promise<void> {
  try {
    const now = Date.now();
    await query(
      `INSERT INTO tenants (id, location_id, name, encrypted_token, token_last4, status, active, created_at, updated_at)
       VALUES ('default', 'loc_demo_001', 'Academia Belleza Demo', '', NULL, 'active', TRUE, $1, $1)
       ON CONFLICT (location_id) DO NOTHING`,
      [now],
    );
  } catch {
    // best-effort seed
  }
}

async function ensureSchemaTable(): Promise<boolean> {
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at BIGINT NOT NULL
      )`,
    );
    return true;
  } catch (err) {
    logger.error(`Migration init failed (DB unavailable?): ${(err as Error).message}`);
    return false;
  }
}
