import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { requireSuperAdmin } from "../auth/permissions";
import { scope, ok } from "./helpers";
import { tenantRepo } from "../repositories/tenantRepo";
import { getProvider } from "../services/providerService";
import { setTenantCreds } from "../providers/ghl/ghlProvider";
import { auditRepo } from "../repositories/auditRepo";

export function integrationRoutes(router: Router) {
  router.get("/integration/status", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.getIntegrationState(tenantId));
  });

  router.post("/integration/connect", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.connectIntegration(tenantId));
  });

  router.post("/integration/test", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.testIntegration(tenantId));
  });

  router.post("/integration/sync", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.syncIntegration(tenantId));
  });

  router.post("/integration/disconnect", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.disconnectIntegration(tenantId));
  });

  // Config (token + locationId). Admin-only. Token stored encrypted, never returned.
  router.get("/integration/config", requireAuth, async (ctx) => {
    ok(ctx, await tenantRepo.masked(ctx.session!.tenantId));
  });

  router.put("/integration/config", requireAuth, async (ctx) => {
    requireSuperAdmin(ctx.session!);
    const { token, locationId } = (ctx.body ?? {}) as { token?: string; locationId?: string };
    const tenantId = ctx.session!.tenantId;
    await tenantRepo.saveCredentials(tenantId, token ?? "", locationId ?? "");
    if (token) {
      const t = await tenantRepo.get(tenantId);
      setTenantCreds(tenantId, { token, locationId: locationId ?? t?.ghlLocationId ?? "" });
    }
    await auditRepo.record({ tenantId, ghlUserId: ctx.session!.ghlUserId, action: "integration_config_saved", resource: "integration", resourceId: tenantId });
    ok(ctx, await tenantRepo.masked(tenantId));
  });

  router.delete("/integration/config", requireAuth, async (ctx) => {
    requireSuperAdmin(ctx.session!);
    const tenantId = ctx.session!.tenantId;
    await tenantRepo.clearCredentials(tenantId);
    await auditRepo.record({ tenantId, ghlUserId: ctx.session!.ghlUserId, action: "integration_config_cleared", resource: "integration", resourceId: tenantId });
    ok(ctx, await tenantRepo.masked(tenantId));
  });
}
