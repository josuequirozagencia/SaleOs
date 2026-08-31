import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, enforceOwner, createActor } from "./helpers";
import { ApiError } from "../utils/errors";
import { auditRepo } from "../repositories/auditRepo";

export function scheduledMessagesRoutes(router: Router) {
  router.post("/scheduled-messages", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const b = (ctx.body ?? {}) as any;
    // Resolve the real conversation owner — NEVER trust body.advisorUserId for authorization.
    const conv = await provider.getConversation(tenantId, b.conversationId);
    if (!conv) throw new ApiError("NOT_FOUND", "Conversation not found");
    enforceOwner(ctx, conv.assignedTo);
    // The scheduler owner is resolved server-side; body.advisorUserId is ignored for scoping.
    const actor = createActor(ctx, b.advisorUserId ?? conv.assignedTo ?? undefined);
    const sm = await provider.createScheduledMessage(tenantId, { ...b, advisorUserId: actor, contactId: conv.contactId });
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "message_scheduled", resource: "scheduled_message", resourceId: sm.id });
    ok(ctx, sm, 201);
  });

  router.patch("/scheduled-messages/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    // Fetch the scheduled message directly by id — no full-collection scan.
    const sm = await provider.getScheduledMessage(tenantId, ctx.params.id);
    if (!sm) throw new ApiError("NOT_FOUND", "Scheduled message not found");
    enforceOwner(ctx, sm.advisorUserId);
    ok(ctx, await provider.updateScheduledMessage(tenantId, ctx.params.id, ctx.body as any));
  });

  router.post("/scheduled-messages/:id/cancel", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const sm = await provider.getScheduledMessage(tenantId, ctx.params.id);
    if (!sm) throw new ApiError("NOT_FOUND", "Scheduled message not found");
    enforceOwner(ctx, sm.advisorUserId);
    await provider.cancelScheduledMessage(tenantId, ctx.params.id);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "message_cancelled", resource: "scheduled_message", resourceId: ctx.params.id });
    ok(ctx, { ok: true });
  });
}
