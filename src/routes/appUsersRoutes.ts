/**
 * App users routes — BeautyCRM-owned login users administration.
 *
 * These manage the BeautyCRM app_users table (login credentials + the link to
 * a CRM user via ghlUserId). The CRM platform remains the Source of Truth for
 * CRM identity (contacts, conversations, the CRM user directory); these routes
 * only manage BeautyCRM's own auth + authorization layer.
 *
 * SECURITY:
 *  - Every route requires an authenticated session (requireAuth).
 *  - Every mutating route requires admin (requireAdminRole), enforced both in
 *    the route and inside authService (defense in depth).
 *  - tenantId is ALWAYS taken from the session, never from the body/query.
 *  - role/ghlUserId/active supplied in the body are validated server-side
 *    (privilege-escalation guards, CRM-user existence check) — never trusted.
 *  - passwordHash is never returned; only the safe projection is serialized.
 */

import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { ok, requireAdminRole } from "./helpers";
import { authService } from "../auth/authService";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";
import type { Role } from "../types";

export function appUsersRoutes(router: Router) {
  // List BeautyCRM users of the tenant (admin only).
  router.get("/app-users", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const users = await authService.listUsers(ctx.session!);
    ok(ctx, users);
  });

  // Create a BeautyCRM login user linked to a CRM user (admin only).
  router.post("/app-users", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const body = (ctx.body ?? {}) as {
      ghlUserId?: string;
      email?: string;
      name?: string;
      password?: string;
      role?: Role;
    };
    const user = await authService.createUser(ctx.session!, {
      ghlUserId: body.ghlUserId ?? "",
      email: body.email ?? "",
      name: body.name ?? "",
      password: body.password ?? "",
      role: body.role ?? "advisor",
    });
    auditRepo.record({
      tenantId: ctx.session!.tenantId,
      ghlUserId: ctx.session!.ghlUserId,
      action: "app_user_created",
      resource: "app_users",
      resourceId: user.id,
      metadata: { email: body.email, role: body.role ?? "advisor", ghlUserId: body.ghlUserId },
    });
    ok(ctx, user, 201);
  });

  // Update a BeautyCRM user (admin only). Role/ghlUserId/active/password changes
  // are validated server-side.
  router.patch("/app-users/:id", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const body = (ctx.body ?? {}) as Partial<{
      name: string;
      email: string;
      role: Role;
      ghlUserId: string;
      active: boolean;
      password: string;
    }>;
    const user = await authService.updateUser(ctx.session!, ctx.params.id, body);
    if (!user) throw new ApiError("NOT_FOUND", "Usuario no encontrado");
    auditRepo.record({
      tenantId: ctx.session!.tenantId,
      ghlUserId: ctx.session!.ghlUserId,
      action: "app_user_updated",
      resource: "app_users",
      resourceId: ctx.params.id,
      metadata: { fields: Object.keys(body) },
    });
    ok(ctx, user);
  });

  // Activate/deactivate a BeautyCRM user (admin only).
  router.post("/app-users/:id/toggle-active", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const { active } = (ctx.body ?? {}) as { active?: boolean };
    const user = await authService.setUserActive(
      ctx.session!,
      ctx.params.id,
      active ?? true,
    );
    if (!user) throw new ApiError("NOT_FOUND", "Usuario no encontrado");
    auditRepo.record({
      tenantId: ctx.session!.tenantId,
      ghlUserId: ctx.session!.ghlUserId,
      action: active ? "app_user_activated" : "app_user_deactivated",
      resource: "app_users",
      resourceId: ctx.params.id,
    });
    ok(ctx, user);
  });
}
