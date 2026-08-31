import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { requireAdmin, requireSuperAdmin } from "../auth/permissions";
import { scope, ok } from "./helpers";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";
import type { CurrencyConfig } from "../types";

// Supported currency codes (mirrors the frontend catalog).
const SUPPORTED_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "MXN", "COP", "PEN", "CLP", "ARS", "BRL", "CAD", "AUD", "BOB",
]);

function validateCurrency(cfg: Partial<CurrencyConfig>): string | null {
  if (!cfg.currencyCode || !SUPPORTED_CURRENCIES.has(cfg.currencyCode)) {
    return "Código de moneda no soportado.";
  }
  if (cfg.decimalDigits !== undefined && (cfg.decimalDigits < 0 || cfg.decimalDigits > 4)) {
    return "Los dígitos decimales deben estar entre 0 y 4.";
  }
  if (cfg.position !== undefined && cfg.position !== "before" && cfg.position !== "after") {
    return "La posición del símbolo debe ser 'before' o 'after'.";
  }
  if (cfg.decimalSeparator !== undefined && cfg.decimalSeparator === cfg.thousandsSeparator) {
    return "El separador decimal y de miles no pueden ser iguales.";
  }
  return null;
}

export function configRoutes(router: Router) {
  // Areas
  router.get("/areas", requireAuth, async (ctx) => { const { provider, tenantId } = scope(ctx); ok(ctx, await provider.listAreas(tenantId)); });
  router.post("/areas", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); const { name } = (ctx.body ?? {}) as { name?: string }; ok(ctx, await provider.createArea(tenantId, name ?? ""), 201); });
  router.patch("/areas/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.updateArea(tenantId, ctx.params.id, ctx.body as any)); });
  router.delete("/areas/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); await provider.removeArea(tenantId, ctx.params.id); ok(ctx, { ok: true }); });

  // Programs
  router.get("/programs", requireAuth, async (ctx) => { const { provider, tenantId } = scope(ctx); ok(ctx, await provider.listPrograms(tenantId)); });
  router.get("/areas/:areaId/programs", requireAuth, async (ctx) => { const { provider, tenantId } = scope(ctx); ok(ctx, await provider.listProgramsByArea(tenantId, ctx.params.areaId)); });
  router.post("/programs", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.createProgram(tenantId, ctx.body as any), 201); });
  router.patch("/programs/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.updateProgram(tenantId, ctx.params.id, ctx.body as any)); });
  router.delete("/programs/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); await provider.removeProgram(tenantId, ctx.params.id); ok(ctx, { ok: true }); });

  // Custom fields
  router.get("/custom-fields", requireAuth, async (ctx) => { const { provider, tenantId } = scope(ctx); ok(ctx, await provider.listCustomFields(tenantId)); });
  router.post("/custom-fields", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.createCustomField(tenantId, ctx.body as any), 201); });
  router.patch("/custom-fields/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.updateCustomField(tenantId, ctx.params.id, ctx.body as any)); });
  router.delete("/custom-fields/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); await provider.removeCustomField(tenantId, ctx.params.id); ok(ctx, { ok: true }); });

  // Quick replies
  router.get("/quick-replies", requireAuth, async (ctx) => { const { provider, tenantId } = scope(ctx); ok(ctx, await provider.listQuickReplies(tenantId)); });
  router.post("/quick-replies", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.createQuickReply(tenantId, ctx.body as any), 201); });
  router.patch("/quick-replies/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.updateQuickReply(tenantId, ctx.params.id, ctx.body as any)); });
  router.delete("/quick-replies/:id", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); await provider.removeQuickReply(tenantId, ctx.params.id); ok(ctx, { ok: true }); });

  // Commercial rules (stored as app config; admin-only writes)
  let commercialRules = { commissionType: "percentage" as "percentage" | "fixed", commissionValue: 10, commissionBase: "total" as "total" | "paidAmount", bonusPerLevel: {} as Record<string, number>, responseTimeThresholds: { green: 120, yellow: 300, orange: 600, red: 600 } };
  router.get("/commercial-rules", requireAuth, async (ctx) => ok(ctx, commercialRules));
  router.put("/commercial-rules", requireAuth, async (ctx) => { requireAdmin(ctx.session!); commercialRules = { ...(ctx.body as any) }; auditRepo.record({ tenantId: ctx.session!.tenantId, ghlUserId: ctx.session!.ghlUserId, action: "commercial_rules_updated", resource: "config", resourceId: "rules" }); ok(ctx, commercialRules); });

  // App config (global app identity)
  router.get("/app-config", requireAuth, async (ctx) => { const { provider, tenantId } = scope(ctx); ok(ctx, await provider.getAppConfig(tenantId)); });
  router.put("/app-config", requireAuth, async (ctx) => { requireAdmin(ctx.session!); const { provider, tenantId } = scope(ctx); ok(ctx, await provider.updateAppConfig(tenantId, ctx.body as any)); });

  // Currency config (per-tenant, presentation only; admin-only writes)
  router.get("/settings/currency", requireAuth, async (ctx) => { const { provider, tenantId } = scope(ctx); ok(ctx, await provider.getCurrency(tenantId)); });
  router.put("/settings/currency", requireAuth, async (ctx) => {
    requireAdmin(ctx.session!);
    const cfg = (ctx.body ?? {}) as CurrencyConfig;
    const error = validateCurrency(cfg);
    if (error) throw new ApiError("VALIDATION_ERROR", error);
    const { provider, tenantId } = scope(ctx);
    const saved = await provider.updateCurrency(tenantId, cfg);
    auditRepo.record({ tenantId: ctx.session!.tenantId, ghlUserId: ctx.session!.ghlUserId, action: "currency_updated", resource: "config", resourceId: "currency", metadata: { currencyCode: cfg.currencyCode } });
    ok(ctx, saved);
  });
}
