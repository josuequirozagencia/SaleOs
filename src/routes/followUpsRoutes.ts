import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, enforceOwner, createActor } from "./helpers";
import { ApiError } from "../utils/errors";
import { auditRepo } from "../repositories/auditRepo";

export function followUpsRoutes(router: Router) {
  router.get("/follow-ups", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.listFollowUps(tenantId, assignedTo(ctx)));
  });

  router.post("/follow-ups", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const b = (ctx.body ?? {}) as any;
    // Resolve the real contact owner — NEVER trust body.ghlUserId for authorization.
    const contact = await provider.getContact(tenantId, b.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    // The follow-up owner is resolved server-side; body.ghlUserId is ignored for scoping.
    const actor = createActor(ctx, b.ghlUserId ?? contact.assignedTo ?? undefined);
    const fu = await provider.createFollowUp(tenantId, { ...b, ghlUserId: actor });
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "followup_created", resource: "follow_up", resourceId: fu.id });
    ok(ctx, fu, 201);
  });

  router.patch("/follow-ups/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    // Direct lookup — no full-collection scan.
    const fu = await provider.getFollowUp(tenantId, ctx.params.id);
    if (!fu) throw new ApiError("NOT_FOUND", "Follow-up not found");
    enforceOwner(ctx, fu.ghlUserId);
    const updated = await provider.updateFollowUp(tenantId, ctx.params.id, ctx.body as any);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "followup_updated", resource: "follow_up", resourceId: ctx.params.id });
    ok(ctx, updated);
  });

  router.post("/follow-ups/:id/complete", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const fu = await provider.getFollowUp(tenantId, ctx.params.id);
    if (!fu) throw new ApiError("NOT_FOUND", "Follow-up not found");
    enforceOwner(ctx, fu.ghlUserId);
    const updated = await provider.updateFollowUpStatus(tenantId, ctx.params.id, "completed");
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "followup_completed", resource: "follow_up", resourceId: ctx.params.id });
    ok(ctx, updated);
  });

  router.delete("/follow-ups/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const fu = await provider.getFollowUp(tenantId, ctx.params.id);
    if (!fu) throw new ApiError("NOT_FOUND", "Follow-up not found");
    enforceOwner(ctx, fu.ghlUserId);
    await provider.removeFollowUp(tenantId, ctx.params.id);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "followup_deleted", resource: "follow_up", resourceId: ctx.params.id });
    ok(ctx, { ok: true });
  });
}
