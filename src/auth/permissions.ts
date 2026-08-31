/**
 * Server-side data scoping. This is the authoritative permission layer —
 * the frontend hides UI, but the backend enforces scope on every query.
 *
 * Scopes:
 *  - super_admin → "all" (global, can impersonate)
 *  - admin       → "all" (location-wide)
 *  - supervisor  → "team" (set of allowed ghlUserIds)
 *  - advisor     → "self" (only their own ghlUserId)
 *
 * The effective scope also honors "viewAs": when a super_admin impersonates
 * a user, the scope is computed AS IF the backend were that user. This must
 * never change the real session — only the data scope for the request.
 */

import type { AuthSession, Role } from "../types";
import { ApiError } from "../utils/errors";

export type DataScope = "all" | "team" | "self";

export interface ResolvedScope {
  scope: DataScope;
  /** When scope === "self", the single allowed ghlUserId. */
  selfUserId?: string;
  /** When scope === "team", the allowed ghlUserIds. */
  teamUserIds?: string[];
  /** The user whose data the request is effectively viewing (viewAs target). */
  effectiveUserId: string;
}

const ROLE_SCOPE: Record<Role, DataScope> = {
  super_admin: "all",
  admin: "all",
  supervisor: "team",
  advisor: "self",
};

/**
 * Resolve the data scope for a session. `viewAsUserId` is honored ONLY for
 * super_admin (impersonation). For other roles it is ignored to prevent
 * privilege escalation.
 */
export function resolveScope(session: AuthSession): ResolvedScope {
  const role = session.role;

  if (role === "super_admin" && session.viewAsUserId) {
    // Impersonation: scope as the impersonated user.
    return {
      scope: "self",
      selfUserId: session.viewAsUserId,
      effectiveUserId: session.viewAsUserId,
    };
  }

  const scope = ROLE_SCOPE[role];
  return {
    scope,
    selfUserId: scope === "self" ? session.ghlUserId : undefined,
    effectiveUserId: session.ghlUserId,
  };
}

/**
 * Enforce that a requested `assignedTo` filter is within the caller's scope.
 * Returns the ghlUserId the query should actually filter by, or "all".
 *
 * - advisor: always forced to self, regardless of what they request.
 * - supervisor: must request "all", self, or a team member.
 * - admin/super_admin: any value allowed.
 */
export function enforceAssignedToFilter(
  session: AuthSession,
  requested: string | undefined,
  teamUserIds: string[] = [],
): string {
  const scope = resolveScope(session);

  if (scope.scope === "self") {
    // Advisors (and impersonated users) can ONLY see their own data.
    return scope.selfUserId!;
  }

  if (scope.scope === "team") {
    if (!requested || requested === "all") return "all";
    if (requested === session.ghlUserId) return requested;
    if (!teamUserIds.includes(requested)) {
      throw new ApiError("FORBIDDEN", "Not allowed to view that advisor's data");
    }
    return requested;
  }

  // admin / super_admin
  return requested && requested !== "all" ? requested : "all";
}

/**
 * Enforce ownership: the caller may only mutate/own resources belonging to
 * the resolved scope. Used for write operations (send message, create call,
 * change owner, etc.).
 */
export function enforceOwnership(session: AuthSession, resourceOwner: string | null | undefined) {
  const scope = resolveScope(session);
  if (scope.scope === "all") return;
  if (scope.scope === "self") {
    if (resourceOwner !== scope.selfUserId) {
      throw new ApiError("FORBIDDEN", "You do not own this resource");
    }
    return;
  }
  // team
  if (!resourceOwner || !scope.teamUserIds?.includes(resourceOwner)) {
    throw new ApiError("FORBIDDEN", "This resource is outside your team scope");
  }
}

/**
 * Resolve the actor (ghlUserId) for a CREATE operation. The client NEVER
 * chooses its own scope: an advisor is always forced to self; a supervisor
 * must target a team member (or self); admin/super_admin may assign to any
 * valid user. The body-supplied `requested` value is never trusted as
 * authorization — only as the desired assignee, validated against scope.
 */
export function resolveCreateActor(
  session: AuthSession,
  requested: string | undefined,
  teamUserIds: string[] = [],
): string {
  const scope = resolveScope(session);
  if (scope.scope === "self") return scope.selfUserId!;
  if (scope.scope === "team") {
    if (!requested || requested === session.ghlUserId) return session.ghlUserId;
    if (!teamUserIds.includes(requested)) {
      throw new ApiError("FORBIDDEN", "Cannot assign to an advisor outside your team");
    }
    return requested;
  }
  // admin / super_admin (all)
  return requested && requested !== "all" ? requested : session.ghlUserId;
}

/** Only super_admin/admin may perform administrative actions. */
export function requireAdmin(session: AuthSession) {
  if (session.role !== "super_admin" && session.role !== "admin") {
    throw new ApiError("FORBIDDEN", "Administrator access required");
  }
}

/** Only super_admin may impersonate or change global config. */
export function requireSuperAdmin(session: AuthSession) {
  if (session.role !== "super_admin") {
    throw new ApiError("FORBIDDEN", "Super Admin access required");
  }
}
