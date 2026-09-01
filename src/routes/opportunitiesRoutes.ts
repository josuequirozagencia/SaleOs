import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, q, num, requireAdminRole } from "./helpers";
import { ApiError } from "../utils/errors";

export function opportunitiesRoutes(router: Router) {
  router.get("/pipelines", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    if ((provider as any).listPipelines) {
      ok(ctx, await (provider as any).listPipelines(tenantId));
    } else {
      ok(ctx, []);
    }
  });

  router.get("/opportunities", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    if ((provider as any).listOpportunities) {
      const res = await (provider as any).listOpportunities(tenantId, {
        page: num(ctx, "page", 1),
        pageSize: num(ctx, "pageSize", 50),
        search: q(ctx, "search"),
        assignedTo: assignedTo(ctx),
      });
      ok(ctx, res);
    } else {
      ok(ctx, { data: [], total: 0, page: 1, pageSize: 50, hasMore: false });
    }
  });

  router.patch("/opportunities/:id/stage", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { stageId } = (ctx.body ?? {}) as { stageId?: string };
    if (!stageId) throw new ApiError("BAD_REQUEST", "stageId es requerido");

    if ((provider as any).updateOpportunityStage) {
      const updated = await (provider as any).updateOpportunityStage(tenantId, ctx.params.id, stageId);
      ok(ctx, updated);
    } else {
      throw new ApiError("PROVIDER_UNAVAILABLE", "Actualización de oportunidad no disponible");
    }
  });
}
