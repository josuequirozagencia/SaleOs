import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, q, num, enforceOwner } from "./helpers";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";

export function callsRoutes(router: Router) {
  router.get("/calls", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.listCalls(tenantId, {
      page: num(ctx, "page", 1), pageSize: num(ctx, "pageSize", 25),
      assignedTo: assignedTo(ctx), status: q(ctx, "status"), direction: q(ctx, "direction"),
      contactId: q(ctx, "contactId"), search: q(ctx, "search"),
    }));
  });

  router.get("/calls/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const call = await provider.getCall(tenantId, ctx.params.id);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found");
    enforceOwner(ctx, call.ghlUserId);
    ok(ctx, call);
  });

  router.post("/calls", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const b = (ctx.body ?? {}) as any;
    // Resolve the real contact owner — NEVER trust body.ghlUserId for authorization.
    const contact = await provider.getContact(tenantId, b.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    // The actor is always the session user for advisors; body.ghlUserId is ignored.
    const actor = ctx.session!.ghlUserId;
    const call = await provider.startCall(tenantId, b.contactId, b.number, actor);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "call_created", resource: "call", resourceId: call.id });
    ok(ctx, call, 201);
  });

  router.post("/calls/:id/answer", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const call = await provider.getCall(tenantId, ctx.params.id);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found");
    enforceOwner(ctx, call.ghlUserId);
    ok(ctx, await provider.answerCall(tenantId, ctx.params.id));
  });

  router.post("/calls/:id/complete", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { status } = (ctx.body ?? {}) as { status?: any };
    const call = await provider.getCall(tenantId, ctx.params.id);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found");
    enforceOwner(ctx, call.ghlUserId);
    ok(ctx, await provider.completeCall(tenantId, ctx.params.id, status ?? "completed"));
  });

  router.post("/calls/:id/transcribe", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const call = await provider.getCall(tenantId, ctx.params.id);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found");
    enforceOwner(ctx, call.ghlUserId);
    ok(ctx, await provider.requestTranscription(tenantId, ctx.params.id));
  });

  router.post("/calls/:id/analyze", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const call = await provider.getCall(tenantId, ctx.params.id);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found");
    enforceOwner(ctx, call.ghlUserId);
    ok(ctx, await provider.requestAnalysis(tenantId, ctx.params.id));
  });

  router.get("/calls/:id/analysis-status", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const call = await provider.getCall(tenantId, ctx.params.id);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found");
    enforceOwner(ctx, call.ghlUserId);
    ok(ctx, await provider.getCallAnalysisStatus(tenantId, ctx.params.id));
  });
}
