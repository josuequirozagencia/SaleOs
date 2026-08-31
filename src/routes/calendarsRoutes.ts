import type { Router } from "../utils/router";
import { requireAuth } from "../auth/middleware";
import { scope, ok, assignedTo, q, num, enforceOwner, createActor } from "./helpers";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";

export function calendarsRoutes(router: Router) {
  router.get("/calendars", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.listCalendars(tenantId, assignedTo(ctx)));
  });

  router.get("/calendars/:calendarId/slots", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const from = Number(ctx.query.get("from") ?? 0);
    const to = Number(ctx.query.get("to") ?? Date.now() + 86400000 * 30);
    ok(ctx, await provider.getSlots(tenantId, ctx.params.calendarId, from, to));
  });

  router.get("/appointments", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    ok(ctx, await provider.listAppointments(tenantId, {
      page: num(ctx, "page", 1), pageSize: num(ctx, "pageSize", 25),
      assignedTo: assignedTo(ctx), contactId: q(ctx, "contactId"), status: q(ctx, "status"),
      from: q(ctx, "from") ? Number(q(ctx, "from")) : undefined, to: q(ctx, "to") ? Number(q(ctx, "to")) : undefined,
    }));
  });

  router.post("/appointments", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const b = (ctx.body ?? {}) as any;
    // Resolve the real contact owner — NEVER trust body.ghlUserId for authorization.
    const contact = await provider.getContact(tenantId, b.contactId);
    if (!contact) throw new ApiError("NOT_FOUND", "Contact not found");
    enforceOwner(ctx, contact.assignedTo);
    // The appointment owner is resolved server-side; body.ghlUserId is ignored for scoping.
    const actor = createActor(ctx, b.ghlUserId ?? contact.assignedTo ?? undefined);
    // Revalidate availability server-side before booking to prevent double-booking.
    if (b.calendarId && b.start && b.end) {
      const slots = await provider.getSlots(tenantId, b.calendarId, b.start, b.end);
      const slot = slots.find((s) => s.start === b.start);
      if (!slot) throw new ApiError("BUSINESS_RULE_ERROR", "El horario seleccionado ya no está disponible.");
    }
    const appt = await provider.bookAppointment(tenantId, { ...b, ghlUserId: actor });
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "appointment_created", resource: "appointment", resourceId: appt.id });
    ok(ctx, appt, 201);
  });

  router.patch("/appointments/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { status } = (ctx.body ?? {}) as { status?: any };
    const appt = await provider.getAppointment(tenantId, ctx.params.id);
    if (!appt) throw new ApiError("NOT_FOUND", "Appointment not found");
    enforceOwner(ctx, appt.ghlUserId);
    const updated = await provider.updateAppointmentStatus(tenantId, ctx.params.id, status);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "appointment_updated", resource: "appointment", resourceId: ctx.params.id, metadata: { status } });
    ok(ctx, updated);
  });

  router.post("/appointments/:id/reschedule", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const { start, end, slotId } = (ctx.body ?? {}) as { start: number; end: number; slotId?: string };
    const appt = await provider.getAppointment(tenantId, ctx.params.id);
    if (!appt) throw new ApiError("NOT_FOUND", "Appointment not found");
    enforceOwner(ctx, appt.ghlUserId);
    const updated = await provider.rescheduleAppointment(tenantId, ctx.params.id, start, end);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "appointment_updated", resource: "appointment", resourceId: ctx.params.id, metadata: { rescheduled: true } });
    ok(ctx, updated);
  });

  router.delete("/appointments/:id", requireAuth, async (ctx) => {
    const { provider, tenantId } = scope(ctx);
    const appt = await provider.getAppointment(tenantId, ctx.params.id);
    if (!appt) throw new ApiError("NOT_FOUND", "Appointment not found");
    enforceOwner(ctx, appt.ghlUserId);
    await provider.cancelAppointment(tenantId, ctx.params.id);
    if (ctx.session) auditRepo.record({ tenantId, ghlUserId: ctx.session.ghlUserId, action: "appointment_updated", resource: "appointment", resourceId: ctx.params.id, metadata: { cancelled: true } });
    ok(ctx, { ok: true });
  });
}
