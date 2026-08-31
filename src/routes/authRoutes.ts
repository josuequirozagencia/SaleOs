import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { authService } from "../auth/authService";
import { ok } from "./helpers";
import { rateLimits } from "../middleware/rateLimit";
import { auditRepo } from "../repositories/auditRepo";

export function authRoutes(router: Router) {
  router.post("/auth/login", rateLimits.auth, async (ctx) => {
    const { email } = (ctx.body ?? {}) as { email?: string };
    const result = await authService.login(email ?? "");
    auditRepo.record({ tenantId: result.session.tenantId, ghlUserId: result.session.ghlUserId, action: "login", resource: "auth", resourceId: result.session.ghlUserId });
    ok(ctx, { token: result.token, user: result.user, profile: result.profile });
  });

  router.get("/auth/session", requireAuth, async (ctx) => {
    const { user, profile } = await authService.getSession(ctx.session!.ghlUserId);
    ok(ctx, { user, profile });
  });

  router.post("/auth/view-as", requireAuth, async (ctx) => {
    const { targetUserId } = (ctx.body ?? {}) as { targetUserId?: string };
    const { token } = await authService.viewAs(ctx.session!, targetUserId ?? "");
    auditRepo.record({ tenantId: ctx.session!.tenantId, ghlUserId: ctx.session!.ghlUserId, action: "view_as_started", resource: "auth", resourceId: targetUserId ?? "" });
    ok(ctx, { token });
  });

  router.post("/auth/exit-view-as", requireAuth, async (ctx) => {
    const { token } = await authService.exitViewAs(ctx.session!);
    auditRepo.record({ tenantId: ctx.session!.tenantId, ghlUserId: ctx.session!.ghlUserId, action: "view_as_exited", resource: "auth", resourceId: ctx.session!.ghlUserId });
    ok(ctx, { token });
  });

  router.post("/auth/logout", requireAuth, async (ctx) => {
    auditRepo.record({ tenantId: ctx.session!.tenantId, ghlUserId: ctx.session!.ghlUserId, action: "logout", resource: "auth", resourceId: ctx.session!.ghlUserId });
    ok(ctx, { ok: true });
  });
}
