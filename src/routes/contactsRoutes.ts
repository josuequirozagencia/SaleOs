import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, q, num, enforceOwner, requireAdminRole } from "./helpers";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";

export function contactsRoutes(router: Router) {
  router.get("/contacts", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const result = await provider.listContacts(tenantId, {
      page: num(ctx, "page", 1), pageSize: num(ctx, "pageSize", 25),
      search: q(ctx, "search"), assignedTo: assignedTo(ctx),
      area: q(ctx, "area"), programId: q(ctx, "programId"), tag: q(ctx, "tag"),
      matriculated: q(ctx, "matriculated") === "true" ? true : q(ctx, "matriculated") === "false" ? false : undefined,
    });
    ok(ctx, result);
  });

  router.get("/contacts/:contactId", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, contact);
  });

  router.patch("/contacts/:contactId/owner", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    // Only super_admin/admin may change owners.
    requireAdminRole(ctx);
    const { assignedTo: ghlUserId } = (ctx.body ?? {}) as { assignedTo?: string };
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    const updated = await provider.updateContactOwner(tenantId, ctx.params.contactId, ghlUserId ?? "");
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "contact_owner_changed", resource: "contact", resourceId: ctx.params.contactId, metadata: { from: contact.assignedTo, to: ghlUserId } });
    ok(ctx, updated);
  });

  router.patch("/contacts/:contactId/tags", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { tags } = (ctx.body ?? {}) as { tags?: string[] };
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.updateContactTags(tenantId, ctx.params.contactId, tags ?? []));
  });

  router.get("/contacts/:contactId/conversation", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.getConversationByContact(tenantId, ctx.params.contactId));
  });

  router.get("/contacts/:contactId/calls", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.listCallsByContact(tenantId, ctx.params.contactId));
  });

  router.get("/contacts/:contactId/follow-ups", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.listFollowUpsByContact(tenantId, ctx.params.contactId));
  });

  router.get("/contacts/:contactId/notes", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.listNotesByContact(tenantId, ctx.params.contactId));
  });

  router.post("/contacts/:contactId/notes", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { text } = (ctx.body ?? {}) as { text?: string };
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    // The note author is always the session user; body.ghlUserId is ignored for scoping.
    const actor = ctx.session!.ghlUserId;
    ok(ctx, await provider.createNote(tenantId, ctx.params.contactId, actor, text ?? ""), 201);
  });

  router.get("/contacts/:contactId/timeline", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.listTimelineByContact(tenantId, ctx.params.contactId));
  });

  router.get("/contacts/:contactId/matricula", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.getMatriculaByContact(tenantId, ctx.params.contactId));
  });

  router.get("/contacts/:contactId/appointments", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const contact = await provider.getContact(tenantId, ctx.params.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    ok(ctx, await provider.listAppointmentsByContact(tenantId, ctx.params.contactId));
  });
}
