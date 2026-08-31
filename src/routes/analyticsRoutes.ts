import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, q } from "./helpers";
import { rateLimits } from "../middleware/rateLimit";

export function analyticsRoutes(router: Router) {
  // Aggregated response-time analytics (server-side computed). Replaces the
  // former mass-download endpoint that loaded 100 conversations × 100k messages.
  router.get("/analytics/response-time", requireAuth, rateLimits.analytics, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const from = q(ctx, "from") ? Number(q(ctx, "from")) : undefined;
    const to = q(ctx, "to") ? Number(q(ctx, "to")) : undefined;
    // The advisor filter is enforced server-side via assignedTo() (scope).
    const advisorId = assignedTo(ctx);
    ok(ctx, await provider.getResponseTimeAnalytics(tenantId, { from, to, advisorId }));
  });

  // Commercial conversion analytics (Fase 9.1). Aggregated server-side;
  // advisor scope enforced via assignedTo(). Conversion = active matrícula.
  router.get("/analytics/conversion", requireAuth, rateLimits.analytics, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const from = q(ctx, "from") ? Number(q(ctx, "from")) : undefined;
    const to = q(ctx, "to") ? Number(q(ctx, "to")) : undefined;
    const advisorId = assignedTo(ctx);
    ok(ctx, await provider.getConversionAnalytics(tenantId, { from, to, advisorId }));
  });

  // Legacy response-time list (compat — returns empty, analytics is aggregated).
  router.get("/response-time", requireAuth, async (ctx) => {
    ok(ctx, []);
  });

  router.get("/response-time/summary", requireAuth, rateLimits.analytics, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const result = await provider.getResponseTimeAnalytics(tenantId, { advisorId: assignedTo(ctx) });
    ok(ctx, {
      avgToday: result.summary.avgSeconds,
      avgWeek: result.summary.avgSeconds,
      avgMonth: result.summary.avgSeconds,
      min: result.summary.minSeconds,
      max: result.summary.maxSeconds,
      answered: result.summary.answered,
      pending: result.summary.pending,
      unanswered: result.summary.unanswered,
    });
  });

  // Achievements
  router.get("/achievements/:ghlUserId", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.getAchievement(tenantId, ctx.params.ghlUserId));
  });

  // Dashboard
  router.get("/dashboard", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.getDashboardMetrics(tenantId, assignedTo(ctx)));
  });
}
