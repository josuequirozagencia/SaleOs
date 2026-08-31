import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, q, num, enforceOwner, createActor } from "./helpers";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";

export function conversationsRoutes(router: Router) {
  router.get("/conversations", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const result = await provider.listConversations(tenantId, {
      page: num(ctx, "page", 1), pageSize: num(ctx, "pageSize", 25),
      assignedTo: assignedTo(ctx), channel: q(ctx, "channel"), status: q(ctx, "status"),
      search: q(ctx, "search"), unreadOnly: q(ctx, "unreadOnly") === "true",
      assignedFilter: q(ctx, "assignedFilter") as any, tag: q(ctx, "tag"),
    });
    ok(ctx, result);
  });

  router.get("/conversations/:id/messages", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    // Messages are always paginated — no "load all" escape hatch.
    ok(ctx, await provider.getConversationMessages(tenantId, ctx.params.id, num(ctx, "page", 1), num(ctx, "pageSize", 50)));
  });

  router.post("/conversations/:id/messages", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const b = (ctx.body ?? {}) as any;
    // Resolve the real conversation owner — NEVER trust body.ghlUserId for authorization.
    const conv = await provider.getConversation(tenantId, ctx.params.id);
    if (!conv) throw new ApiError("NOT_FOUND", "Conversation not found");
    enforceOwner(ctx, conv.assignedTo);
    const actor = createActor(ctx, b.ghlUserId);
    const msg = await provider.sendMessage(tenantId, ctx.params.id, { text: b.text, ghlUserId: actor, visibility: b.visibility, attachment: b.attachment });
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "message_sent", resource: "conversation", resourceId: ctx.params.id });
    ok(ctx, msg);
  });

  router.patch("/conversations/:id/tags", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { tags } = (ctx.body ?? {}) as { tags?: string[] };
    const conv = await provider.getConversation(tenantId, ctx.params.id);
    if (!conv) throw new ApiError("NOT_FOUND", "Conversation not found");
    enforceOwner(ctx, conv.assignedTo);
    ok(ctx, await provider.updateConversationTags(tenantId, ctx.params.id, tags ?? []));
  });

  router.patch("/conversations/:id/pipeline", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { stage } = (ctx.body ?? {}) as { stage?: any };
    const conv = await provider.getConversation(tenantId, ctx.params.id);
    if (!conv) throw new ApiError("NOT_FOUND", "Conversation not found");
    enforceOwner(ctx, conv.assignedTo);
    ok(ctx, await provider.updateConversationPipeline(tenantId, ctx.params.id, stage));
  });

  router.post("/conversations/:id/read", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const conv = await provider.getConversation(tenantId, ctx.params.id);
    if (!conv) throw new ApiError("NOT_FOUND", "Conversation not found");
    enforceOwner(ctx, conv.assignedTo);
    await provider.markConversationRead(tenantId, ctx.params.id);
    ok(ctx, { ok: true });
  });

  router.get("/conversations/:id/scheduled", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.listScheduledByConversation(tenantId, ctx.params.id));
  });

  router.get("/message-templates", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.getTemplates(tenantId));
  });
}
