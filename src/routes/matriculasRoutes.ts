import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, enforceOwner, createActor } from "./helpers";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";

export function matriculasRoutes(router: Router) {
  router.get("/matriculas", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.listMatriculas(tenantId, assignedTo(ctx)));
  });

  router.get("/matriculas/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const m = await provider.getMatricula(tenantId, ctx.params.id);
    if (!m) throw new ApiError("NOT_FOUND", "Matrícula not found");
    enforceOwner(ctx, m.assignedTo);
    ok(ctx, m);
  });

  router.post("/matriculas", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const b = (ctx.body ?? {}) as any;
    // Resolve the real contact owner — NEVER trust body.assignedTo/ghlUserId for authorization.
    const contact = await provider.getContact(tenantId, b.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    // An advisor can only create a matrícula for a contact they own (or that is unassigned).
    enforceOwner(ctx, contact.assignedTo);
    // The actor is resolved server-side; body.assignedTo is ignored for scoping.
    const actor = createActor(ctx, b.assignedTo ?? b.ghlUserId ?? contact.assignedTo ?? undefined);
    const data = { ...b, assignedTo: actor };
    const m = await provider.createMatricula(tenantId, data);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "matricula_created", resource: "matricula", resourceId: m.id });
    ok(ctx, m, 201);
  });

  router.post("/matriculas/:id/cancel", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const existing = await provider.getMatricula(tenantId, ctx.params.id);
    if (!existing) throw new ApiError("NOT_FOUND", "Matrícula not found");
    enforceOwner(ctx, existing.assignedTo);
    const m = await provider.cancelMatricula(tenantId, ctx.params.id);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "matricula_cancelled", resource: "matricula", resourceId: ctx.params.id });
    ok(ctx, m);
  });

  router.delete("/matriculas/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const existing = await provider.getMatricula(tenantId, ctx.params.id);
    if (!existing) throw new ApiError("NOT_FOUND", "Matrícula not found");
    enforceOwner(ctx, existing.assignedTo);
    await provider.removeMatricula(tenantId, ctx.params.id);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "matricula_cancelled", resource: "matricula", resourceId: ctx.params.id });
    ok(ctx, { ok: true });
  });
}
