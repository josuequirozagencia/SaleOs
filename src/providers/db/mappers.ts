/**
 * Row → domain mappers for the DbProvider's app-local Postgres tables.
 * Kept in a separate module so the provider file stays focused on logic.
 */

import type {
  Matricula, FollowUp, ContactNote, TimelineEvent, ScheduledMessage,
  StudyArea, Program, CustomField, QuickReply, UserProfile,
} from "../../types";

export interface MatriculaRow {
  id: string; tenant_id: string; contact_id: string; contact_name: string;
  contact_phone: string; first_name: string | null; last_name: string | null;
  age: number | null; area: string; area_id: string | null; program_id: string | null;
  opportunity_id: string | null; total: string; abono: string; payment_method: string;
  enrollment_date: string; status: string; assigned_to: string; notes: string | null;
  custom_fields: Record<string, unknown> | null; created_at: string; updated_at: string;
}
export function mapMatricula(r: MatriculaRow): Matricula {
  const total = Number(r.total);
  const abono = Number(r.abono);
  return {
    id: r.id, contactId: r.contact_id, contactName: r.contact_name,
    contactPhone: r.contact_phone, firstName: r.first_name ?? undefined,
    lastName: r.last_name ?? undefined, age: r.age ?? undefined, area: r.area,
    areaId: r.area_id ?? undefined, programId: r.program_id ?? undefined,
    total, abono, pendiente: Math.max(0, total - abono),
    paymentMethod: r.payment_method as Matricula["paymentMethod"],
    date: Number(r.enrollment_date), status: r.status as Matricula["status"],
    assignedTo: r.assigned_to, notes: r.notes ?? undefined,
    customFields: (r.custom_fields as Matricula["customFields"]) ?? undefined,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  };
}

export interface FollowUpRow {
  id: string; tenant_id: string; contact_id: string; contact_name: string;
  ghl_user_id: string; due_at: string; reason: string; status: string;
  type: string; note: string | null; created_at: string; completed_at: string | null;
}
export function mapFollowUp(r: FollowUpRow): FollowUp {
  return {
    id: r.id, contactId: r.contact_id, contactName: r.contact_name,
    ghlUserId: r.ghl_user_id, dueAt: Number(r.due_at), reason: r.reason,
    status: r.status as FollowUp["status"], type: r.type as FollowUp["type"],
    note: r.note ?? undefined, createdAt: Number(r.created_at),
    completedAt: r.completed_at ? Number(r.completed_at) : undefined,
  };
}

export interface NoteRow {
  id: string; tenant_id: string; contact_id: string; ghl_user_id: string;
  text: string; created_at: string;
}
export function mapNote(r: NoteRow): ContactNote {
  return { id: r.id, contactId: r.contact_id, ghlUserId: r.ghl_user_id,
    text: r.text, createdAt: Number(r.created_at) };
}

export interface TimelineRow {
  id: string; tenant_id: string; contact_id: string; type: string;
  timestamp: string; title: string; description: string | null; ghl_user_id: string | null;
}
export function mapTimeline(r: TimelineRow): TimelineEvent {
  return { id: r.id, contactId: r.contact_id, type: r.type as TimelineEvent["type"],
    timestamp: Number(r.timestamp), title: r.title,
    description: r.description ?? undefined, ghlUserId: r.ghl_user_id ?? undefined };
}

export interface ScheduledRow {
  id: string; tenant_id: string; contact_id: string; conversation_id: string;
  advisor_user_id: string; message: string; scheduled_at: string; status: string;
  created_at: string; updated_at: string;
}
export function mapScheduled(r: ScheduledRow): ScheduledMessage {
  return { id: r.id, contactId: r.contact_id, conversationId: r.conversation_id,
    advisorUserId: r.advisor_user_id, message: r.message,
    scheduledAt: Number(r.scheduled_at), status: r.status as ScheduledMessage["status"],
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) };
}

export interface AreaRow {
  id: string; tenant_id: string; name: string; active: boolean; order: number;
}
export function mapArea(r: AreaRow): StudyArea {
  return { id: r.id, name: r.name, active: r.active, order: r.order };
}

export interface ProgramRow {
  id: string; tenant_id: string; area_id: string; name: string; active: boolean; order: number;
}
export function mapProgram(r: ProgramRow): Program {
  return { id: r.id, areaId: r.area_id, name: r.name, active: r.active, order: r.order };
}

export interface CustomFieldRow {
  id: string; tenant_id: string; name: string; key: string; type: string;
  placeholder: string | null; description: string | null; required: boolean;
  active: boolean; order: number; options: string[] | null;
}
export function mapCustomField(r: CustomFieldRow): CustomField {
  return { id: r.id, name: r.name, key: r.key, type: r.type as CustomField["type"],
    placeholder: r.placeholder ?? undefined, description: r.description ?? undefined,
    required: r.required, active: r.active, order: r.order, options: r.options ?? undefined };
}

export interface QuickReplyRow {
  id: string; tenant_id: string; name: string; content: string; category: string;
  active: boolean; updated_at: string;
}
export function mapQuickReply(r: QuickReplyRow): QuickReply {
  return { id: r.id, name: r.name, content: r.content, category: r.category,
    active: r.active, updatedAt: Number(r.updated_at) };
}

// ── User profile preferences (BeautyCRM-owned; identity stays in the CRM) ──

export interface UserProfileRow {
  tenant_id: string;
  ghl_user_id: string;
  preferences: Record<string, unknown> | null;
  updated_at: string;
}

/**
 * Merge stored preferences over neutral defaults. The CRM never supplies
 * these fields, so every value defaults to a neutral, non-fictitious state
 * when the user has not configured anything. `ghlUserId` is the only field
 * that originates from the verified CRM identity (passed in by the caller).
 */
export function mapUserProfile(
  r: UserProfileRow | undefined,
  ghlUserId: string,
  defaults: UserProfile,
): UserProfile {
  const p = (r?.preferences ?? {}) as Partial<UserProfile>;
  return {
    ...defaults,
    ...p,
    ghlUserId,
    notificationPreferences: {
      ...defaults.notificationPreferences,
      ...(p.notificationPreferences ?? {}),
    },
  };
}
