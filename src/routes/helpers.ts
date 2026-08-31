/**
 * Helpers shared by route modules: resolve the provider + tenant + scope from
 * the request session, and small response utilities.
 */

import type { RouteContext } from "../utils/router";
import { sendJson } from "../utils/router";
import { getProvider } from "../services/providerService";
import { resolveScope, enforceAssignedToFilter, enforceOwnership, resolveCreateActor, requireAdmin } from "../auth/permissions";
import type { CrmProvider } from "../providers/crmProvider";

export interface ScopedCtx {
  ctx: RouteContext;
  provider: CrmProvider;
  tenantId: string;
  scope: ReturnType<typeof resolveScope>;
}

export function scope(ctx: RouteContext): ScopedCtx {
  if (!ctx.session) throw new Error("Unauthenticated request reached a scoped handler");
  const tenantId = ctx.session.tenantId;
  const provider = getProvider(tenantId);
  const sc = resolveScope(ctx.session);
  return { ctx, provider, tenantId, scope: sc };
}

/** Resolve the assignedTo filter from query, enforcing server-side scope. */
export function assignedTo(ctx: RouteContext, teamUserIds: string[] = []): string {
  if (!ctx.session) return "all";
  const req = ctx.query.get("assignedTo") ?? undefined;
  return enforceAssignedToFilter(ctx.session, req, teamUserIds);
}

/** Resolve the create actor (ghlUserId) for a CREATE, enforcing server-side scope. */
export function createActor(ctx: RouteContext, requested: string | undefined, teamUserIds: string[] = []): string {
  if (!ctx.session) throw new Error("Unauthenticated request reached a scoped handler");
  return resolveCreateActor(ctx.session, requested, teamUserIds);
}

/** Enforce that the caller owns the resource before a write. */
export function enforceOwner(ctx: RouteContext, resourceOwner: string | null | undefined): void {
  if (!ctx.session) throw new Error("Unauthenticated request reached a scoped handler");
  enforceOwnership(ctx.session, resourceOwner);
}

/** Require admin role for sensitive operations. */
export function requireAdminRole(ctx: RouteContext): void {
  if (!ctx.session) throw new Error("Unauthenticated request reached a scoped handler");
  requireAdmin(ctx.session);
}

export function ok(ctx: RouteContext, body: unknown, status = 200) {
  sendJson(ctx.res, status, body);
}

export function q(ctx: RouteContext, key: string): string | undefined {
  return ctx.query.get(key) ?? undefined;
}

export function num(ctx: RouteContext, key: string, def: number): number {
  const v = ctx.query.get(key);
  return v ? Number(v) : def;
}
