import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, requireAdminRole } from "./helpers";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";
import type { Role } from "../types";

export function usersRoutes(router: Router) {
  // List users (all authenticated users — needed for advisor filter + "Ver como").
  router.get("/users", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const users = await provider.listUsers(tenantId);
    ok(ctx, users);
  });

  // Get a single user by ghlUserId.
  router.get("/users/:ghlUserId", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const user = await provider.getUser(tenantId, ctx.params.ghlUserId);
    if (!user) throw new ApiError("NOT_FOUND", "Usuario no encontrado");
    ok(ctx, user);
  });

  // User profile (app-local complement).
  router.get("/users/:ghlUserId/profile", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const profile = await provider.getUserProfile(tenantId, ctx.params.ghlUserId);
    ok(ctx, profile);
  });

  router.patch("/users/:ghlUserId/profile", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const profile = await provider.updateUserProfile(tenantId, ctx.params.ghlUserId, ctx.body as any);
    ok(ctx, profile);
  });

  // Sync users from the CRM platform (admin-only). Idempotent.
  router.post("/users/sync", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const { provider, tenantId } = scope(ctx);
    const result = await provider.syncUsers(tenantId);
    auditRepo.record({ tenantId, ghlUserId: ctx.session!.ghlUserId, action: "user_synced", resource: "users", resourceId: tenantId, metadata: { total: result.total, created: result.created, updated: result.updated } });
    ok(ctx, result);
  });

  // Create a user in the CRM platform (admin-only). The backend controls
  // the role — an advisor can never escalate by sending a body role.
  router.post("/users", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const { provider, tenantId } = scope(ctx);
    const body = (ctx.body ?? {}) as { name?: string; email?: string; phone?: string; role?: Role };
    if (!body.name || !body.email) throw new ApiError("VALIDATION_ERROR", "Nombre y email son obligatorios");
    // Only super_admin can create super_admin/admin users; admin can create
    // supervisor/advisor. This prevents privilege escalation.
    const requestedRole: Role = body.role ?? "advisor";
    if ((requestedRole === "super_admin" || requestedRole === "admin") && ctx.session!.role !== "super_admin") {
      throw new ApiError("FORBIDDEN", "No puedes crear usuarios con ese rol");
    }
    const user = await provider.createUser(tenantId, { name: body.name, email: body.email, phone: body.phone, role: requestedRole });
    auditRepo.record({ tenantId, ghlUserId: ctx.session!.ghlUserId, action: "user_created", resource: "users", resourceId: user.ghlUserId, metadata: { email: body.email, role: requestedRole } });
    ok(ctx, user);
  });

  // Update a user (admin-only). Role changes are controlled server-side.
  router.patch("/users/:ghlUserId", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const { provider, tenantId } = scope(ctx);
    const body = (ctx.body ?? {}) as Partial<{ name: string; email: string; phone: string; role: Role }>;
    // Prevent privilege escalation via role change.
    if (body.role && (body.role === "super_admin" || body.role === "admin") && ctx.session!.role !== "super_admin") {
      throw new ApiError("FORBIDDEN", "No puedes asignar ese rol");
    }
    const user = await provider.updateUser(tenantId, ctx.params.ghlUserId, body);
    auditRepo.record({ tenantId, ghlUserId: ctx.session!.ghlUserId, action: "user_updated", resource: "users", resourceId: ctx.params.ghlUserId, metadata: { fields: Object.keys(body) } });
    ok(ctx, user);
  });

  // Deactivate a user (admin-only).
  router.post("/users/:ghlUserId/disable", requireAuth, async (ctx) => {
    requireAdminRole(ctx);
    const { provider, tenantId } = scope(ctx);
    const user = await provider.disableUser(tenantId, ctx.params.ghlUserId);
    auditRepo.record({ tenantId, ghlUserId: ctx.session!.ghlUserId, action: "user_disabled", resource: "users", resourceId: ctx.params.ghlUserId });
    ok(ctx, user);
  });

  router.get("/location", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.getLocation(tenantId));
  });
}
