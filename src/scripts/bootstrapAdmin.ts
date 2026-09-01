/**
 * Bootstrap — create the FIRST production administrator (one-time, manual).
 *
 * This is NOT run automatically on deploy. It is a standalone CLI invoked
 * manually from Railway (or locally) exactly once to seed the first app_users
 * row, after which the admin can sign in natively and create the rest of the
 * team from the BeautyCRM admin UI.
 *
 * USAGE (Railway shell / local):
 *   node dist/scripts/bootstrapAdmin.js
 *
 * REQUIRED env vars (temporary — DELETE after running):
 *   BOOTSTRAP_ADMIN_EMAIL        valid email, unique within the tenant
 *   BOOTSTRAP_ADMIN_PASSWORD     plaintext, must pass the password policy
 *   BOOTSTRAP_ADMIN_NAME         display name
 *   BOOTSTRAP_ADMIN_GHL_USER_ID  a REAL, active CRM user id in this tenant
 *   BOOTSTRAP_ADMIN_TENANT_ID     an existing, active BeautyCRM tenant id
 *
 * SECURITY:
 *  - No credentials are written to any file, log, or DB column in plaintext.
 *  - The password is hashed with the EXISTING scrypt mechanism (password.ts)
 *    via appUserRepo.create — the same path used by the admin UI.
 *  - The plaintext password is NEVER printed or logged.
 *  - The script refuses to run if a user with that email or ghlUserId already
 *    exists in the tenant (no silent duplicate / overwrite).
 *  - It validates the tenant is registered + active and that the ghlUserId
 *    resolves to a real, active CRM user — it never invents CRM users.
 *  - role is hardcoded to "admin" (scope: ALL). The script does not accept a
 *    role from the environment, so it cannot be abused to mint super_admin.
 *  - After success, all BOOTSTRAP_* vars can be removed; the system keeps
 *    working normally (the row persists in app_users).
 */

import { config } from "../config/env";
import { runMigrations } from "../db/migrations";
import { dbAvailable } from "../db/client";
import { tenantRepo } from "../repositories/tenantRepo";
import { appUserRepo } from "../repositories/appUserRepo";
import { getProvider } from "../services/providerService";
import { logger } from "../utils/router";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 10;

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    fail(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function fail(msg: string): never {
  logger.error(`[bootstrap:admin] ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // 1. Collect + validate env vars.
  const email = required("BOOTSTRAP_ADMIN_EMAIL");
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const name = required("BOOTSTRAP_ADMIN_NAME");
  const ghlUserId = required("BOOTSTRAP_ADMIN_GHL_USER_ID");
  const tenantId = required("BOOTSTRAP_ADMIN_TENANT_ID");

  // 2. Email validity.
  if (!EMAIL_RE.test(email)) {
    fail("BOOTSTRAP_ADMIN_EMAIL is not a valid email address");
  }

  // 3. Password policy (min length + at least one letter and one digit).
  if (password.length < MIN_PASSWORD_LEN) {
    fail(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LEN} characters`);
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    fail("BOOTSTRAP_ADMIN_PASSWORD must contain letters and numbers");
  }

  // 4. Production requires a real DB — no in-memory fallback for bootstrap.
  if (config.nodeEnv === "production" && !config.databaseUrl) {
    fail("DATABASE_URL is required in production");
  }
  if (!dbAvailable()) {
    fail("Database is not available — set DATABASE_URL before running bootstrap");
  }

  // 5. Ensure schema (incl. app_users) exists before inserting.
  await runMigrations();
  logger.info("[bootstrap:admin] migrations applied");

  // 6. Tenant must exist and be active.
  const tenant = await tenantRepo.get(tenantId);
  if (!tenant) {
    fail(`Tenant not found: ${tenantId}`);
  }
  if (!tenant.active) {
    fail(`Tenant is not active: ${tenantId}`);
  }

  // 7. ghlUserId must resolve to a real, active CRM user in this tenant.
  const provider = getProvider(tenantId);
  const crmUser = await provider.getUser(tenantId, ghlUserId);
  if (!crmUser) {
    fail(`CRM user not found in tenant ${tenantId}: ghlUserId=${ghlUserId}`);
  }
  if (!crmUser.active) {
    fail(`CRM user is not active in tenant ${tenantId}: ghlUserId=${ghlUserId}`);
  }

  // 8. No duplicate by email or ghlUserId within the tenant.
  const existingByEmail = await appUserRepo.findByEmailGlobal(email);
  if (existingByEmail && existingByEmail.tenantId === tenantId) {
    fail(`A user with email "${email}" already exists in tenant ${tenantId}`);
  }
  const existingByGhl = await appUserRepo.getByGhlUserId(tenantId, ghlUserId);
  if (existingByGhl) {
    fail(`ghlUserId "${ghlUserId}" is already linked to a user in tenant ${tenantId}`);
  }

  // 9. Create with role hardcoded to "admin" (scope ALL). The password is
  //    hashed inside appUserRepo.create via the existing scrypt path.
  const created = await appUserRepo.create({
    tenantId,
    ghlUserId,
    email,
    name: name || crmUser.name,
    password, // hashed internally — never persisted in plaintext
    role: "admin",
  });

  // 10. Success — print only safe fields. NEVER the password or hash.
  logger.info("[bootstrap:admin] ✅ First administrator created successfully:");
  logger.info(`  id        : ${created.id}`);
  logger.info(`  tenantId  : ${created.tenantId}`);
  logger.info(`  ghlUserId : ${created.ghlUserId}`);
  logger.info(`  email     : ${created.email}`);
  logger.info(`  name      : ${created.name}`);
  logger.info(`  role      : ${created.role} (scope: ${created.scope})`);
  logger.info(`  active    : ${created.active}`);
  logger.info("[bootstrap:admin] You can now remove all BOOTSTRAP_* env vars.");
}

main().catch((err) => {
  logger.error(`[bootstrap:admin] Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
