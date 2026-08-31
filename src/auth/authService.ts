/**
 * Auth service. Issues session JWTs for a CRM user (identified by email or
 * ghlUserId). The session carries the role + tenantId, which the permission
 * layer uses for server-side data scoping.
 *
 * In production, login validates against the CRM's user directory; here the
 * mock validates against the seeded users. No password is stored — the CRM
 * remains the identity authority.
 */

import { signJwt } from "./jwt";
import { getProvider } from "../services/providerService";
import { ApiError } from "../utils/errors";
import type { AuthSession, CrmUser, UserProfile } from "../types";

export interface LoginResult {
  token: string;
  user: CrmUser;
  profile: UserProfile;
  session: AuthSession;
}

export const authService = {
  async login(email: string): Promise<LoginResult> {
    const provider = getProvider("default");
    const users = await provider.listUsers("default");
    // Strict identity validation: the user MUST exist in the CRM directory.
    // There is NO fallback — an unknown email is rejected. This prevents any
    // caller from logging in as an arbitrary (or the first/seeded) user.
    const user = users.find((u) => u.email === email);
    if (!user) throw new ApiError("UNAUTHORIZED", "Usuario no encontrado");
    const profile = (await provider.getUserProfile("default", user.ghlUserId))!;
    const session: AuthSession = { ghlUserId: user.ghlUserId, role: user.role, tenantId: "default", viewAsUserId: null };
    const token = signJwt(session);
    return { token, user, profile, session };
  },

  /** "Ver como" — super admin impersonates a user. Returns a new token. */
  async viewAs(session: AuthSession, targetUserId: string): Promise<{ token: string; session: AuthSession }> {
    if (session.role !== "super_admin") throw new ApiError("FORBIDDEN", "Solo Super Admin puede usar 'Ver como'");
    const provider = getProvider(session.tenantId);
    const users = await provider.listUsers(session.tenantId);
    const target = users.find((u) => u.ghlUserId === targetUserId);
    if (!target) throw new ApiError("NOT_FOUND", "Usuario objetivo no encontrado");
    const newSession: AuthSession = { ...session, viewAsUserId: targetUserId };
    return { token: signJwt(newSession), session: newSession };
  },

  async exitViewAs(session: AuthSession): Promise<{ token: string; session: AuthSession }> {
    const newSession: AuthSession = { ...session, viewAsUserId: null };
    return { token: signJwt(newSession), session: newSession };
  },

  async getSession(ghlUserId: string): Promise<{ user: CrmUser; profile: UserProfile }> {
    const provider = getProvider("default");
    const users = await provider.listUsers("default");
    const user = users.find((u) => u.ghlUserId === ghlUserId);
    if (!user) throw new ApiError("UNAUTHORIZED", "Sesión inválida");
    const profile = (await provider.getUserProfile("default", ghlUserId))!;
    return { user, profile };
  },
};
