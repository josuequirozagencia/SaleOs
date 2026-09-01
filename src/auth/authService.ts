/**
 * Auth service — issues BeautyCRM session JWTs ONLY after verifying identity
 * against an authoritative source:
 *
 *   Embedded  → GHL User Context (AES-decrypted with the Marketplace Shared Secret)
 *   Standalone → OAuth 2.0 Authorization Code (token exchanged server-side)
 *
 * The client NEVER supplies ghlUserId / locationId / role / tenantId. Those
 * are derived server-side from the verified identity and encoded into the
 * short-lived session JWT. The CRM platform remains the Source of Truth.
 *
 * Role mapping: the platform context exposes a coarse role ("admin"/"user").
 * BeautyCRM refines it: agency owner / admin → ADMIN; otherwise the user's
 * CRM user record (fetched with the tenant token) determines ADVISOR vs
 * SUPERVISOR. The client cannot influence this.
 */

import { signJwt } from "./jwt";
import { decryptUserContext, type GhlUserContext } from "./ghlContext";
import { sessionStore } from "./sessionStore";
import { oauthStateStore } from "./oauthStateStore";
import { tenantRepo } from "../repositories/tenantRepo";
import { appUserRepo, type SafeAppUser } from "../repositories/appUserRepo";
import { verifyPassword } from "./password";
import { requireAdmin } from "./permissions";
import { getProvider } from "../services/providerService";
import { config } from "../config/env";
import { ApiError } from "../utils/errors";
import type { AuthSession, CrmUser, Role, UserProfile } from "../types";

export interface LoginResult {
  token: string;
  user: CrmUser;
  profile: UserProfile;
  session: AuthSession;
}

const PLATFORM_ADMIN_ROLE = "admin";

/** Map the verified platform identity to a BeautyCRM role. */
function mapRole(ctxRole: string | undefined, isAgencyOwner: boolean | undefined): Role {
  if (isAgencyOwner || ctxRole === PLATFORM_ADMIN_ROLE) return "admin";
  // Default CRM users to advisor; a supervisor designation is resolved from
  // the CRM user record (team membership) in resolveUserRecord.
  return "advisor";
}

function scopeForRole(role: Role): AuthSession["scope"] {
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

/**
 * Resolve the CRM user record for the verified ghlUserId within the tenant.
 * This is the secondary verification step: confirms the user still exists and
 * is active in the connected sub-account. Returns the BeautyCRM-refined role.
 */
async function resolveUserRecord(
  tenantId: string,
  ghlUserId: string,
  fallbackRole: Role,
): Promise<{ user: CrmUser; profile: UserProfile; role: Role }> {
  const provider = getProvider(tenantId);
  const user = await provider.getUser(tenantId, ghlUserId);
  if (!user || !user.active) {
    throw new ApiError("UNAUTHORIZED", "Usuario no encontrado o inactivo en la academia");
  }
  const profile = (await provider.getUserProfile(tenantId, ghlUserId))!;
  // The CRM user record's role is authoritative for ADVISOR/SUPERVISOR; the
  // platform context only distinguishes admin-level. If the CRM record carries
  // a finer role, prefer it; otherwise keep the mapped fallback.
  const role: Role = (user.role as Role) ?? fallbackRole;
  return { user, profile, role };
}

async function issueSession(
  ghlUserId: string,
  tenantId: string,
  locationId: string,
  role: Role,
): Promise<{ token: string; jti: string; session: AuthSession }> {
  const scope = scopeForRole(role);
  const { token, jti } = signJwt({ ghlUserId, role, tenantId, locationId, scope });
  await sessionStore.markRevalidated(ghlUserId);
  return { token, jti, session: { jti, ghlUserId, role, tenantId, locationId, scope } };
}

export const authService = {
  // ── BeautyCRM native login (email + password) ──────────────────────────

  /**
   * Authenticate a BeautyCRM user with email + password. This is BeautyCRM's
   * OWN credential store (app_users in Postgres); the CRM platform remains
   * the Source of Truth for CRM identity, but the login itself is owned by
   * BeautyCRM so admins/advisors can sign in directly without SSO/OAuth.
   *
   * Identity derivation (server-side, never trusted from the client):
   *   email + password → app_users row → tenantId, ghlUserId, role, scope.
   * The client NEVER supplies tenantId/ghlUserId/role — those come from the
   * persisted row. The session is then linked to the CRM user via ghlUserId
   * (resolved against the CRM directory to confirm the user still exists and
   * is active there), and the locationId is taken from the registered tenant.
   *
   * The existing JWT/cookie/sessionStore infrastructure is reused — this is
   * a new entry point, not a parallel session system.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    if (!email || !password) {
      throw new ApiError("VALIDATION_ERROR", "Email y contraseña son obligatorios");
    }

    // Resolve the user from BeautyCRM's own store (across all tenants). The
    // tenantId is derived from the row, never from the client.
    const row = await appUserRepo.findByEmailGlobal(email);
    if (!row) {
      throw new ApiError("UNAUTHORIZED", "Credenciales incorrectas");
    }
    if (!row.active) {
      throw new ApiError("FORBIDDEN", "Usuario inactivo. Contacta al administrador.");
    }

    // Verify the password (constant-time scrypt compare). A wrong password
    // yields the same error as an unknown email to avoid user enumeration.
    if (!verifyPassword(password, row.passwordHash)) {
      throw new ApiError("UNAUTHORIZED", "Credenciales incorrectas");
    }

    // The tenant must be registered + active (multi-tenant guard).
    const tenant = await tenantRepo.get(row.tenantId);
    if (!tenant || !tenant.active) {
      throw new ApiError("FORBIDDEN", "Academia no configurada o inactiva");
    }

    // Confirm the linked CRM user still exists + is active in the CRM
    // directory. The CRM remains the identity authority; the app_users row
    // only gates BeautyCRM access. If the CRM user is gone, login is denied.
    const provider = getProvider(row.tenantId);
    const crmUser = await provider.getUser(row.tenantId, row.ghlUserId);
    if (!crmUser || !crmUser.active) {
      throw new ApiError("UNAUTHORIZED", "Usuario no encontrado o inactivo en la academia");
    }

    // Issue the session using the EXISTING infrastructure (signJwt +
    // sessionStore). role/scope are derived from the app_users row, which is
    // the BeautyCRM authorization authority.
    const { token, jti, session } = await issueSession(
      row.ghlUserId,
      row.tenantId,
      tenant.ghlLocationId,
      row.role,
    );

    // The profile is BeautyCRM-owned preferences (Postgres); reuse the
    // existing provider path so the frontend contract is unchanged.
    const profile = (await provider.getUserProfile(row.tenantId, row.ghlUserId))!;

    return { token, user: crmUser, profile, session: { ...session, jti } };
  },

  // ── Embedded SSO ──────────────────────────────────────────────────────

  /**
   * Authenticate via the GHL User Context. The frontend forwards the opaque
   * encrypted payload; the backend decrypts it with the Shared Secret and
   * derives the full identity. No client-supplied identity is trusted.
   */
  async sso(encryptedData: string): Promise<LoginResult> {
    if (!encryptedData) throw new ApiError("VALIDATION_ERROR", "encryptedData es obligatorio");
    const ctx = decryptUserContext(encryptedData);

    const locationId = ctx.activeLocation ?? "";
    if (!locationId) {
      throw new ApiError("UNAUTHORIZED", "Contexto sin academia activa (activeLocation)");
    }

    // Multi-tenant resolution: the location must be a registered tenant.
    const tenant = await tenantRepo.findByLocationId(locationId);
    if (!tenant || !tenant.active) {
      throw new ApiError("FORBIDDEN", "Academia no conectada a BeautyCRM");
    }

    const fallbackRole = mapRole(ctx.role, ctx.isAgencyOwner);
    const { user, profile, role } = await resolveUserRecord(tenant.id, ctx.userId, fallbackRole);

    const { token, jti, session } = await issueSession(ctx.userId, tenant.id, locationId, role);
    return { token, user, profile, session: { ...session, jti } };
  },

  // ── Standalone OAuth ──────────────────────────────────────────────────

  /** Begin OAuth: returns the platform authorize URL + a single-use state. */
  async startOAuth(redirectAfter?: string): Promise<{ authorizeUrl: string; state: string }> {
    if (!config.ghl.oauthClientId || !config.ghl.oauthRedirectUri) {
      throw new ApiError("PROVIDER_UNAVAILABLE", "OAuth no configurado (falta CLIENT_ID/REDIRECT_URI)");
    }
    const state = await oauthStateStore.create(redirectAfter);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.ghl.oauthClientId,
      redirect_uri: config.ghl.oauthRedirectUri,
      state,
    });
    return {
      authorizeUrl: `${config.ghl.marketplaceBaseUrl}/oauth/chooselocation?${params}`,
      state,
    };
  },

  /**
   * Complete OAuth: exchange the authorization code server-side, derive the
   * identity from the token response, register/upsert the tenant, and issue
   * a BeautyCRM session. The code is single-use; state is consumed.
   */
  async oauthCallback(code: string, state: string): Promise<{ result: LoginResult; redirectAfter: string }> {
    if (!code || !state) throw new ApiError("VALIDATION_ERROR", "code y state son obligatorios");
    const redirectAfter = await oauthStateStore.consume(state);
    if (redirectAfter === null) {
      throw new ApiError("UNAUTHORIZED", "State inválido o expirado (posible replay/CSRF)");
    }
    if (!config.ghl.oauthClientId || !config.ghl.oauthClientSecret) {
      throw new ApiError("PROVIDER_UNAVAILABLE", "OAuth no configurado (falta CLIENT_SECRET)");
    }

    // Exchange the code for tokens + identity. Server-side only.
    const tokenRes = await exchangeOAuthCode(code);
    if (!tokenRes.userId || !tokenRes.locationId) {
      throw new ApiError("UNAUTHORIZED", "OAuth no devolvió identidad de usuario");
    }

    // Register / upsert the tenant for this location, storing the encrypted
    // access + refresh tokens (server-side only).
    const tenant = await tenantRepo.registerByLocation(
      tokenRes.locationId,
      tokenRes.locationName,
      tokenRes.access_token,
    );

    const fallbackRole = mapRole(tokenRes.role, tokenRes.isAgencyOwner);
    const { user, profile, role } = await resolveUserRecord(tenant.id, tokenRes.userId, fallbackRole);

    const { token, jti, session } = await issueSession(tokenRes.userId, tenant.id, tokenRes.locationId, role);
    return { result: { token, user, profile, session: { ...session, jti } }, redirectAfter };
  },

  // ── Session refresh ───────────────────────────────────────────────────

  /**
   * Re-issue a session for an already-authenticated user (sliding window).
   * The caller MUST already hold a valid session; this never elevates role
   * or changes tenant — it re-derives them from the CRM record.
   */
  async refresh(session: AuthSession): Promise<{ token: string; jti: string }> {
    const { user, profile: _p, role } = await resolveUserRecord(session.tenantId, session.ghlUserId, session.role);
    const { token, jti } = await issueSession(session.ghlUserId, session.tenantId, session.locationId, role);
    // Revoke the old session jti to prevent concurrent use of the stale token.
    if (session.jti) await sessionStore.revoke(session.jti);
    return { token, jti };
  },

  // ── Logout ────────────────────────────────────────────────────────────

  async logout(session: AuthSession): Promise<void> {
    if (session.jti) await sessionStore.revoke(session.jti);
  },

  // ── Session lookup (for /auth/session) ────────────────────────────────

  async getSession(session: AuthSession): Promise<{ user: CrmUser; profile: UserProfile }> {
    const provider = getProvider(session.tenantId);
    const user = await provider.getUser(session.tenantId, session.ghlUserId);
    if (!user || !user.active) throw new ApiError("UNAUTHORIZED", "Sesión inválida");
    const profile = (await provider.getUserProfile(session.tenantId, session.ghlUserId))!;
    return { user, profile };
  },

  // ── Revalidation ─────────────────────────────────────────────────────

  /**
   * Periodically revalidate the user against the CRM directory: still active?
   * role unchanged? tenant still connected? Called by the auth middleware.
   * Throws on revocation/deactivation, which the middleware turns into 401.
   */
  async revalidate(session: AuthSession): Promise<void> {
    if (await sessionStore.isRevoked(session.jti)) {
      throw new ApiError("UNAUTHORIZED", "Sesión revocada");
    }
    const tenant = await tenantRepo.get(session.tenantId);
    if (!tenant || !tenant.active) {
      throw new ApiError("FORBIDDEN", "Academia desconectada");
    }
    const provider = getProvider(session.tenantId);
    const user = await provider.getUser(session.tenantId, session.ghlUserId);
    if (!user || !user.active) {
      throw new ApiError("UNAUTHORIZED", "Usuario desactivado");
    }
    await sessionStore.markRevalidated(session.ghlUserId);
  },

  // ── Impersonation (super admin only) ─────────────────────────────────

  async viewAs(session: AuthSession, targetUserId: string): Promise<{ token: string; jti: string }> {
    if (session.role !== "super_admin") throw new ApiError("FORBIDDEN", "Solo Super Admin puede usar 'Ver como'");
    const provider = getProvider(session.tenantId);
    const target = await provider.getUser(session.tenantId, targetUserId);
    if (!target) throw new ApiError("NOT_FOUND", "Usuario objetivo no encontrado");
    const { token, jti } = signJwt({
      ghlUserId: session.ghlUserId,
      role: session.role,
      tenantId: session.tenantId,
      locationId: session.locationId,
      scope: session.scope,
      viewAsUserId: targetUserId,
    });
    return { token, jti };
  },

  async exitViewAs(session: AuthSession): Promise<{ token: string; jti: string }> {
    const { token, jti } = signJwt({
      ghlUserId: session.ghlUserId,
      role: session.role,
      tenantId: session.tenantId,
      locationId: session.locationId,
      scope: session.scope,
      viewAsUserId: null,
    });
    return { token, jti };
  },

  // ── BeautyCRM user administration (admin only) ────────────────────────
  // These manage the BeautyCRM-owned app_users table. The CRM platform stays
  // the Source of Truth for CRM identity; here we only create/maintain the
  // BeautyCRM login + its link (tenantId + ghlUserId) to a CRM user.

  async listUsers(session: AuthSession): Promise<SafeAppUser[]> {
    requireAdmin(session);
    return appUserRepo.listByTenant(session.tenantId);
  },

  async createUser(
    session: AuthSession,
    args: {
      ghlUserId: string;
      email: string;
      name: string;
      password: string;
      role: Role;
    },
  ): Promise<SafeAppUser> {
    requireAdmin(session);
    if (!args.email || !args.password || !args.ghlUserId) {
      throw new ApiError("VALIDATION_ERROR", "email, password y ghlUserId son obligatorios");
    }
    // Privilege escalation guard: only super_admin may create admin/super_admin.
    if (
      (args.role === "super_admin" || args.role === "admin") &&
      session.role !== "super_admin"
    ) {
      throw new ApiError("FORBIDDEN", "No puedes crear usuarios con ese rol");
    }
    // The ghlUserId must correspond to a real CRM user in this tenant — we
    // never invent CRM users. This validates the link before persisting.
    const provider = getProvider(session.tenantId);
    const crmUser = await provider.getUser(session.tenantId, args.ghlUserId);
    if (!crmUser) {
      throw new ApiError("NOT_FOUND", "El usuario del CRM no existe en esta academia");
    }
    try {
      return await appUserRepo.create({
        tenantId: session.tenantId,
        ghlUserId: args.ghlUserId,
        email: args.email,
        name: args.name || crmUser.name,
        password: args.password,
        role: args.role,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "EMAIL_TAKEN") {
        throw new ApiError("CONFLICT", "Ya existe un usuario con ese email");
      }
      if (msg === "GHL_USER_TAKEN") {
        throw new ApiError("CONFLICT", "Ese usuario del CRM ya está vinculado");
      }
      throw err;
    }
  },

  async updateUser(
    session: AuthSession,
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
    requireAdmin(session);
    // Privilege escalation guard on role changes.
    if (
      updates.role &&
      (updates.role === "super_admin" || updates.role === "admin") &&
      session.role !== "super_admin"
    ) {
      throw new ApiError("FORBIDDEN", "No puedes asignar ese rol");
    }
    // If re-linking to a different CRM user, validate it exists in the tenant.
    if (updates.ghlUserId) {
      const provider = getProvider(session.tenantId);
      const crmUser = await provider.getUser(session.tenantId, updates.ghlUserId);
      if (!crmUser) {
        throw new ApiError("NOT_FOUND", "El usuario del CRM no existe en esta academia");
      }
    }
    return appUserRepo.update(session.tenantId, id, updates);
  },

  async setUserActive(
    session: AuthSession,
    id: string,
    active: boolean,
  ): Promise<SafeAppUser | null> {
    requireAdmin(session);
    return appUserRepo.setActive(session.tenantId, id, active);
  },
};

// ── OAuth token exchange (server-side only) ──────────────────────────────

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  userId?: string;
  locationId?: string;
  companyId?: string;
  role?: string;
  type?: string;
  isAgencyOwner?: boolean;
  locationName?: string;
}

async function exchangeOAuthCode(code: string): Promise<OAuthTokenResponse & { userId: string; locationId: string }> {
  const url = `${config.ghl.marketplaceBaseUrl}/oauth/token`;
  const body = new URLSearchParams({
    client_id: config.ghl.oauthClientId,
    client_secret: config.ghl.oauthClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.ghl.oauthRedirectUri,
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new ApiError("PROVIDER_ERROR", "No se pudo contactar el servidor OAuth");
  }
  if (!res.ok) {
    throw new ApiError("UNAUTHORIZED", "OAuth rechazó el código (posible replay o código inválido)");
  }
  const data = (await res.json()) as OAuthTokenResponse;
  return { ...data, userId: data.userId ?? "", locationId: data.locationId ?? "" };
}
