/**
 * DbProvider — production composite provider.
 *
 * Splits data ownership:
 *  - CRM-native entities → delegated to the real GhlProvider (CRM is SoT).
 *  - App-local commercial data → persisted in PostgreSQL, scoped by tenant_id.
 *
 * SECURITY: every app-local query filters by tenant_id; a row belonging to
 * another tenant can never be read or mutated. The route layer enforces
 * ownership (IDOR) on top; this layer enforces tenant isolation.
 *
 * FALLBACK: when no DB pool is available (dev/test without DATABASE_URL), the
 * app-local methods delegate to the MockProvider so the app still runs. In
 * production the pool is required (server.ts hard-fails without DATABASE_URL).
 *
 * This file holds the CRM-native delegation + core app-local entities
 * (matrículas, follow-ups, notes, timeline, scheduled messages). Catalog
 * (areas/programs/custom fields/quick replies) + config + analytics live in
 * dbCatalog.ts and are mixed in via composition.
 */

import type { CrmProvider, ListParams } from "../crmProvider";
import { GhlProvider, hasTenantCreds } from "../ghl/ghlProvider";
import { MockProvider } from "../mock/mockProvider";
import { ApiError } from "../../utils/errors";
import { query, dbAvailable } from "../../db/client";
import type {
  CrmUser, Contact, Conversation, CrmMessage, MessageTemplate,
  PipelineStage, Matricula, CallRecord, Calendar, TimeSlot, Appointment,
  AppointmentStatus, IntegrationState, StudyArea, Program, CustomField,
  QuickReply, FollowUp, ScheduledMessage, ContactNote, TimelineEvent,
  Paginated, AppConfig, IntegrationConfig, UserProfile,
  CurrencyConfig, Role, Achievement,
} from "../../types";
import { MATRICULA_DUPLICATE_CODE } from "../../types";
import {
  mapMatricula, mapFollowUp, mapNote, mapTimeline, mapScheduled, mapUserProfile,
  type MatriculaRow, type FollowUpRow, type NoteRow, type TimelineRow, type ScheduledRow,
  type UserProfileRow,
} from "./mappers";
import { CatalogMixin } from "./dbCatalog";

const now = () => Date.now();
const uid = (p: string) => `${p}_${now()}_${Math.random().toString(36).slice(2, 7)}`;

// Compose the catalog/config/analytics methods onto the core provider.
// CrmProvider already declares every catalog/config/analytics member
// (areas, programs, custom fields, quick replies, app/currency config,
// achievement, dashboard, response-time + conversion analytics); the mixin
// object only supplies the internal useDb/mock/ghl/crm helpers (protected on
// the class) plus the runtime implementations. Extending CrmProvider alone
// keeps the merged instance type complete for `implements CrmProvider` while
// avoiding a redundant re-declaration that conflicted with CrmProvider (TS2430).
// The catalog method bodies are still attached at runtime via
// CatalogMixin.applyTo(DbProvider) below.
export interface DbProvider extends CrmProvider {}

export class DbProvider implements CrmProvider {
  protected ghl = new GhlProvider();
  /** In-memory fallback used only when no DB pool is available (dev/test). */
  protected mock = new MockProvider();

  protected useDb(): boolean { return dbAvailable(); }

  /**
   * CRM-native reads/writes go to the real GhlProvider when credentials exist
   * for the tenant; otherwise fall back to the MockProvider (dev/test). This
   * mirrors the pre-Block-2 providerService selection so existing tests that
   * run without CRM credentials keep resolving seeded users.
   */
  protected crm(tenantId: string): CrmProvider {
    return hasTenantCreds(tenantId) ? this.ghl : this.mock;
  }

  // ── CRM-native delegation (CRM is Source of Truth) ──────────────────
  // Delegates to the real GhlProvider when credentials exist for the tenant;
  // otherwise falls back to the MockProvider (dev/test). This preserves the
  // pre-Block-2 selection semantics so tests without CRM creds keep resolving
  // seeded users, while production uses the real CRM.
  listUsers = (t: string) => this.crm(t).listUsers(t);
  getUser = (t: string, id: string) => this.crm(t).getUser(t, id);
  getLocation = (t: string) => this.crm(t).getLocation(t);
  createUser = (t: string, d: { name: string; email: string; phone?: string; role: Role }) => this.crm(t).createUser(t, d);
  updateUser = (t: string, id: string, u: Partial<Pick<CrmUser, "name" | "email" | "phone" | "role">>) => this.crm(t).updateUser(t, id, u);
  disableUser = (t: string, id: string) => this.crm(t).disableUser(t, id);
  syncUsers = (t: string) => this.crm(t).syncUsers(t);

  // ── User profile preferences (app-local → Postgres) ──────────────────
  // Identity (userId, email, name, role, location, active) comes from the
  // CRM via getUser() above. The CRM exposes NO endpoint for preferences
  // (theme, language, monthlyGoal, commission, gamification, notifications),
  // so those are BeautyCRM-owned and persist here, scoped by tenant_id +
  // ghl_user_id. Neutral defaults are used until the user configures them —
  // we never invent fictitious profile data.
  private defaultProfile(ghlUserId: string): UserProfile {
    return {
      ghlUserId,
      preferredTheme: "dark",
      appearance: "moderno",
      favoriteColor: "#8b5cf6",
      language: "es",
      timezone: "America/Lima",
      monthlyGoal: 0,
      commissionPercentage: 0,
      gamificationLevel: "BASE",
      notificationPreferences: {
        newMessages: true,
        newLeads: true,
        matriculas: true,
        calls: true,
      },
    };
  }
  async getUserProfile(tenantId: string, ghlUserId: string): Promise<UserProfile | null> {
    if (!this.useDb()) return this.mock.getUserProfile(tenantId, ghlUserId);
    const rows = await query<UserProfileRow>(
      `SELECT preferences, updated_at FROM user_profiles WHERE tenant_id = $1 AND ghl_user_id = $2`,
      [tenantId, ghlUserId],
    );
    return mapUserProfile(rows[0], ghlUserId, this.defaultProfile(ghlUserId));
  }
  async updateUserProfile(tenantId: string, ghlUserId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    if (!this.useDb()) return this.mock.updateUserProfile(tenantId, ghlUserId, updates);
    const current = await this.getUserProfile(tenantId, ghlUserId);
    const next: UserProfile = { ...current, ...updates, ghlUserId };
    // Persist only the preference fields (never identity); ghlUserId is the
    // key, not stored inside the JSONB blob.
    const { ghlUserId: _id, ...prefs } = next;
    await query(
      `INSERT INTO user_profiles (tenant_id, ghl_user_id, preferences, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, ghl_user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = EXCLUDED.updated_at`,
      [tenantId, ghlUserId, JSON.stringify(prefs), now()],
    );
    return next;
  }

  listContacts = (t: string, p: ListParams) => this.crm(t).listContacts(t, p);
  getContact = (t: string, id: string) => this.crm(t).getContact(t, id);
  updateContactOwner = (t: string, id: string, u: string) => this.crm(t).updateContactOwner(t, id, u);
  updateContactTags = (t: string, id: string, tags: string[]) => this.crm(t).updateContactTags(t, id, tags);

  listConversations = (t: string, p: ListParams) => this.crm(t).listConversations(t, p);
  getConversation = (t: string, id: string) => this.crm(t).getConversation(t, id);
  getConversationMessages = (t: string, id: string, page: number, pageSize: number) =>
    this.crm(t).getConversationMessages(t, id, page, pageSize);
  sendMessage = (t: string, id: string, p: any) => this.crm(t).sendMessage(t, id, p);
  sendTemplate = (t: string, id: string, p: any) => this.crm(t).sendTemplate(t, id, p);
  getTemplates = (t: string) => this.crm(t).getTemplates(t);
  updateConversationTags = (t: string, id: string, tags: string[]) => this.crm(t).updateConversationTags(t, id, tags);
  updateConversationPipeline = (t: string, id: string, stage: PipelineStage) => this.crm(t).updateConversationPipeline(t, id, stage);
  markConversationRead = (t: string, id: string) => this.crm(t).markConversationRead(t, id);
  getConversationByContact = (t: string, id: string) => this.crm(t).getConversationByContact(t, id);

  listPipelines = (t: string) => this.crm(t).listPipelines(t);
  listOpportunities = (t: string, p: ListParams) => this.crm(t).listOpportunities(t, p);
  updateOpportunityStage = (t: string, id: string, stageId: string) => this.crm(t).updateOpportunityStage(t, id, stageId);

  listCalendars = (t: string, a?: string) => this.crm(t).listCalendars(t, a);
  getSlots = (t: string, id: string, from: number, to: number) => this.crm(t).getSlots(t, id, from, to);
  listAppointments = (t: string, p: ListParams) => this.crm(t).listAppointments(t, p);
  getAppointment = (t: string, id: string) => this.crm(t).getAppointment(t, id);
  listAppointmentsByContact = (t: string, id: string) => this.crm(t).listAppointmentsByContact(t, id);
  bookAppointment = (t: string, d: any) => this.crm(t).bookAppointment(t, d);
  updateAppointmentStatus = (t: string, id: string, s: AppointmentStatus) => this.crm(t).updateAppointmentStatus(t, id, s);
  rescheduleAppointment = (t: string, id: string, start: number, end: number) => this.crm(t).rescheduleAppointment(t, id, start, end);
  cancelAppointment = (t: string, id: string) => this.crm(t).cancelAppointment(t, id);

  getIntegrationState = (t: string) => this.crm(t).getIntegrationState(t);
  connectIntegration = (t: string) => this.crm(t).connectIntegration(t);
  testIntegration = (t: string) => this.crm(t).testIntegration(t);
  syncIntegration = (t: string) => this.crm(t).syncIntegration(t);
  disconnectIntegration = (t: string) => this.crm(t).disconnectIntegration(t);
  getIntegrationConfig = (t: string) => this.crm(t).getIntegrationConfig(t);
  saveIntegrationConfig = (t: string, token: string, loc: string) => this.crm(t).saveIntegrationConfig(t, token, loc);
  clearIntegrationConfig = (t: string) => this.crm(t).clearIntegrationConfig(t);

  // Calls (telephony → not available without a telephony provider)
  listCalls = async (_t: string, _p: any): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "Call history requires telephony provider integration"); };
  getCall = async (_t: string, _id: string): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); };
  listCallsByContact = async (_t: string, _c: string): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); };
  startCall = async (_t: string, _c: string, _n: string, _u: string): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "Outbound calls require telephony provider integration"); };
  answerCall = async (_t: string, _id: string): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); };
  completeCall = async (_t: string, _id: string, _s: any): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); };
  requestTranscription = async (_t: string, _id: string): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "Transcription requires AI provider integration"); };
  requestAnalysis = async (_t: string, _id: string): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "AI analysis requires AI provider integration"); };
  getCallAnalysisStatus = async (_t: string, _id: string): Promise<any> => { throw new ApiError("PROVIDER_UNAVAILABLE", "AI analysis requires AI provider integration"); };

  // ── Matrículas (app-local → Postgres) ───────────────────────────────
  async listMatriculas(tenantId: string, assignedTo?: string): Promise<Matricula[]> {
    if (!this.useDb()) return this.mock.listMatriculas(tenantId, assignedTo);
    const rows = assignedTo && assignedTo !== "all"
      ? await query<MatriculaRow>(`SELECT * FROM matriculas WHERE tenant_id = $1 AND assigned_to = $2 ORDER BY created_at DESC`, [tenantId, assignedTo])
      : await query<MatriculaRow>(`SELECT * FROM matriculas WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]);
    return rows.map(mapMatricula);
  }
  async getMatricula(tenantId: string, id: string): Promise<Matricula | null> {
    if (!this.useDb()) return this.mock.getMatricula(tenantId, id);
    const rows = await query<MatriculaRow>(`SELECT * FROM matriculas WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return rows[0] ? mapMatricula(rows[0]) : null;
  }
  async getMatriculaByContact(tenantId: string, contactId: string): Promise<Matricula | null> {
    if (!this.useDb()) return this.mock.getMatriculaByContact(tenantId, contactId);
    const rows = await query<MatriculaRow>(
      `SELECT * FROM matriculas WHERE tenant_id = $1 AND contact_id = $2 AND status <> 'anulado' ORDER BY created_at DESC LIMIT 1`, [tenantId, contactId]);
    return rows[0] ? mapMatricula(rows[0]) : null;
  }
  async createMatricula(tenantId: string, data: Omit<Matricula, "id" | "pendiente">): Promise<Matricula> {
    if (!this.useDb()) return this.mock.createMatricula(tenantId, data);
    const existing = await this.getMatriculaByContact(tenantId, data.contactId);
    if (existing) throw new ApiError("MATRICULA_ALREADY_EXISTS", "Este contacto ya tiene una matrícula registrada.", { code: MATRICULA_DUPLICATE_CODE });
    const id = uid("mt"); const ts = now();
    const total = data.total ?? 0; const abono = data.abono ?? 0;
    await query(
      `INSERT INTO matriculas (id, tenant_id, contact_id, contact_name, contact_phone, first_name, last_name, age,
        area, area_id, program_id, opportunity_id, total, abono, payment_method, enrollment_date, status,
        assigned_to, notes, custom_fields, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)`,
      [id, tenantId, data.contactId, data.contactName ?? "", data.contactPhone ?? "",
       data.firstName ?? null, data.lastName ?? null, data.age ?? null,
       data.area ?? "", data.areaId ?? null, data.programId ?? null, (data as any).opportunityId ?? null,
       total, abono, data.paymentMethod ?? "otro", data.date ?? ts, data.status ?? "pendiente",
       data.assignedTo, (data as any).notes ?? null,
       data.customFields ? JSON.stringify(data.customFields) : null, ts]);
    await this.syncMatriculadoTag(tenantId, data.contactId, true);
    await this.addTimeline(tenantId, { contactId: data.contactId, type: "matricula_created", title: "Matrícula creada", ghlUserId: data.assignedTo });
    return (await this.getMatricula(tenantId, id))!;
  }
  async cancelMatricula(tenantId: string, id: string): Promise<Matricula> {
    if (!this.useDb()) return this.mock.cancelMatricula(tenantId, id);
    const m = await this.getMatricula(tenantId, id);
    if (!m) throw new ApiError("NOT_FOUND", "Matrícula not found");
    await query(`UPDATE matriculas SET status = 'anulado', updated_at = $3 WHERE tenant_id = $1 AND id = $2`, [tenantId, id, now()]);
    const other = await this.getMatriculaByContact(tenantId, m.contactId);
    if (!other) await this.syncMatriculadoTag(tenantId, m.contactId, false);
    await this.addTimeline(tenantId, { contactId: m.contactId, type: "matricula_revoked", title: "Matrícula anulada" });
    return (await this.getMatricula(tenantId, id))!;
  }
  async removeMatricula(tenantId: string, id: string): Promise<void> {
    if (!this.useDb()) return this.mock.removeMatricula(tenantId, id);
    const m = await this.getMatricula(tenantId, id);
    if (!m) return;
    await query(`DELETE FROM matriculas WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    const other = await this.getMatriculaByContact(tenantId, m.contactId);
    if (!other) await this.syncMatriculadoTag(tenantId, m.contactId, false);
  }

  /** Best-effort sync of the "Matriculado" tag to the CRM contact (SoT). */
  protected async syncMatriculadoTag(tenantId: string, contactId: string, add: boolean): Promise<void> {
    try {
      const crm = this.crm(tenantId);
      const contact = await crm.getContact(tenantId, contactId);
      if (!contact) return;
      const tags = [...(contact.tags ?? [])];
      const has = tags.some((t) => t.toLowerCase() === "matriculado");
      if (add && !has) tags.push("matriculado");
      if (!add) tags.filter((t) => t.toLowerCase() !== "matriculado");
      await crm.updateContactTags(tenantId, contactId, tags);
    } catch { /* best-effort tag sync */ }
  }

  // ── Follow-ups (app-local → Postgres) ───────────────────────────────
  async listFollowUps(tenantId: string, assignedTo?: string): Promise<FollowUp[]> {
    if (!this.useDb()) return this.mock.listFollowUps(tenantId, assignedTo);
    const rows = assignedTo && assignedTo !== "all"
      ? await query<FollowUpRow>(`SELECT * FROM follow_ups WHERE tenant_id = $1 AND ghl_user_id = $2 ORDER BY due_at ASC`, [tenantId, assignedTo])
      : await query<FollowUpRow>(`SELECT * FROM follow_ups WHERE tenant_id = $1 ORDER BY due_at ASC`, [tenantId]);
    return rows.map(mapFollowUp);
  }
  async listFollowUpsByContact(tenantId: string, contactId: string): Promise<FollowUp[]> {
    if (!this.useDb()) return this.mock.listFollowUpsByContact(tenantId, contactId);
    const rows = await query<FollowUpRow>(`SELECT * FROM follow_ups WHERE tenant_id = $1 AND contact_id = $2 ORDER BY due_at ASC`, [tenantId, contactId]);
    return rows.map(mapFollowUp);
  }
  async getFollowUp(tenantId: string, id: string): Promise<FollowUp | null> {
    if (!this.useDb()) return this.mock.getFollowUp(tenantId, id);
    const rows = await query<FollowUpRow>(`SELECT * FROM follow_ups WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return rows[0] ? mapFollowUp(rows[0]) : null;
  }
  async createFollowUp(tenantId: string, data: Omit<FollowUp, "id" | "status">): Promise<FollowUp> {
    if (!this.useDb()) return this.mock.createFollowUp(tenantId, data);
    const id = uid("fu"); const ts = now();
    await query(
      `INSERT INTO follow_ups (id, tenant_id, contact_id, contact_name, ghl_user_id, due_at, reason, status, type, note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10)`,
      [id, tenantId, data.contactId, data.contactName ?? "", data.ghlUserId, data.dueAt, data.reason, data.type, data.note ?? null, ts]);
    await this.addTimeline(tenantId, { contactId: data.contactId, type: "followup_created", title: "Seguimiento creado", ghlUserId: data.ghlUserId });
    return (await this.getFollowUp(tenantId, id))!;
  }
  async updateFollowUp(tenantId: string, id: string, updates: Partial<FollowUp>): Promise<FollowUp> {
    if (!this.useDb()) return this.mock.updateFollowUp(tenantId, id, updates);
    const cols: Record<string, string> = { dueAt: "due_at", reason: "reason", type: "type", note: "note", ghlUserId: "ghl_user_id", contactName: "contact_name", status: "status" };
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    for (const [k, v] of Object.entries(updates)) { if (cols[k] !== undefined) { sets.push(`${cols[k]} = $${i}`); vals.push(v); i++; } }
    if (sets.length === 0) return (await this.getFollowUp(tenantId, id))!;
    vals.push(tenantId, id);
    await query(`UPDATE follow_ups SET ${sets.join(", ")} WHERE tenant_id = $${i} AND id = $${i + 1}`, vals);
    return (await this.getFollowUp(tenantId, id))!;
  }
  async updateFollowUpStatus(tenantId: string, id: string, status: FollowUp["status"]): Promise<FollowUp> {
    if (!this.useDb()) return this.mock.updateFollowUpStatus(tenantId, id, status);
    const completedAt = status === "completed" ? now() : null;
    await query(`UPDATE follow_ups SET status = $3, completed_at = COALESCE($4, completed_at) WHERE tenant_id = $1 AND id = $2`, [tenantId, id, status, completedAt]);
    if (status === "completed") { const fu = await this.getFollowUp(tenantId, id); if (fu) await this.addTimeline(tenantId, { contactId: fu.contactId, type: "followup_completed", title: "Seguimiento completado" }); }
    return (await this.getFollowUp(tenantId, id))!;
  }
  async removeFollowUp(tenantId: string, id: string): Promise<void> {
    if (!this.useDb()) return this.mock.removeFollowUp(tenantId, id);
    await query(`DELETE FROM follow_ups WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  }

  // ── Notes (app-local → Postgres) ────────────────────────────────────
  async listNotesByContact(tenantId: string, contactId: string): Promise<ContactNote[]> {
    if (!this.useDb()) return this.mock.listNotesByContact(tenantId, contactId);
    const rows = await query<NoteRow>(`SELECT * FROM contact_notes WHERE tenant_id = $1 AND contact_id = $2 ORDER BY created_at DESC`, [tenantId, contactId]);
    return rows.map(mapNote);
  }
  async createNote(tenantId: string, contactId: string, ghlUserId: string, text: string): Promise<ContactNote> {
    if (!this.useDb()) return this.mock.createNote(tenantId, contactId, ghlUserId, text);
    const id = uid("nt"); const ts = now();
    await query(`INSERT INTO contact_notes (id, tenant_id, contact_id, ghl_user_id, text, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [id, tenantId, contactId, ghlUserId, text, ts]);
    return { id, contactId, ghlUserId, text, createdAt: ts };
  }

  // ── Timeline (app-local → Postgres) ─────────────────────────────────
  async listTimelineByContact(tenantId: string, contactId: string): Promise<TimelineEvent[]> {
    if (!this.useDb()) return this.mock.listTimelineByContact(tenantId, contactId);
    const rows = await query<TimelineRow>(`SELECT * FROM timeline_events WHERE tenant_id = $1 AND contact_id = $2 ORDER BY timestamp DESC`, [tenantId, contactId]);
    return rows.map(mapTimeline);
  }
  async addTimeline(tenantId: string, event: Omit<TimelineEvent, "id" | "timestamp">): Promise<TimelineEvent> {
    if (!this.useDb()) { await this.mock.createNote(tenantId, event.contactId, event.ghlUserId ?? "system", event.title); return { ...event, id: uid("tl"), timestamp: now() }; }
    const id = uid("tl"); const ts = now();
    await query(
      `INSERT INTO timeline_events (id, tenant_id, contact_id, type, timestamp, title, description, ghl_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, tenantId, event.contactId, event.type, ts, event.title, event.description ?? null, event.ghlUserId ?? null]);
    return { ...event, id, timestamp: ts };
  }

  // ── Scheduled messages (app-local → Postgres) ───────────────────────
  async listScheduledByConversation(tenantId: string, conversationId: string): Promise<ScheduledMessage[]> {
    if (!this.useDb()) return this.mock.listScheduledByConversation(tenantId, conversationId);
    const rows = await query<ScheduledRow>(`SELECT * FROM scheduled_messages WHERE tenant_id = $1 AND conversation_id = $2 AND status = 'scheduled' ORDER BY scheduled_at ASC`, [tenantId, conversationId]);
    return rows.map(mapScheduled);
  }
  async getScheduledMessage(tenantId: string, id: string): Promise<ScheduledMessage | null> {
    if (!this.useDb()) return this.mock.getScheduledMessage(tenantId, id);
    const rows = await query<ScheduledRow>(`SELECT * FROM scheduled_messages WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return rows[0] ? mapScheduled(rows[0]) : null;
  }
  async createScheduledMessage(tenantId: string, data: Omit<ScheduledMessage, "id" | "status" | "createdAt" | "updatedAt">): Promise<ScheduledMessage> {
    if (!this.useDb()) return this.mock.createScheduledMessage(tenantId, data);
    const id = uid("sm"); const ts = now();
    await query(
      `INSERT INTO scheduled_messages (id, tenant_id, contact_id, conversation_id, advisor_user_id, message, scheduled_at, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,$8)`,
      [id, tenantId, data.contactId, data.conversationId, data.advisorUserId, data.message, data.scheduledAt, ts]);
    await this.addTimeline(tenantId, { contactId: data.contactId, type: "message_scheduled", title: "Mensaje programado", ghlUserId: data.advisorUserId });
    return (await this.getScheduledMessage(tenantId, id))!;
  }
  async updateScheduledMessage(tenantId: string, id: string, updates: Partial<Pick<ScheduledMessage, "message" | "scheduledAt">>): Promise<ScheduledMessage> {
    if (!this.useDb()) return this.mock.updateScheduledMessage(tenantId, id, updates);
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    if (updates.message !== undefined) { sets.push(`message = $${i}`); vals.push(updates.message); i++; }
    if (updates.scheduledAt !== undefined) { sets.push(`scheduled_at = $${i}`); vals.push(updates.scheduledAt); i++; }
    if (sets.length === 0) return (await this.getScheduledMessage(tenantId, id))!;
    sets.push(`updated_at = $${i}`); vals.push(now()); i++;
    vals.push(tenantId, id);
    await query(`UPDATE scheduled_messages SET ${sets.join(", ")} WHERE tenant_id = $${i} AND id = $${i + 1}`, vals);
    return (await this.getScheduledMessage(tenantId, id))!;
  }
  async cancelScheduledMessage(tenantId: string, id: string): Promise<void> {
    if (!this.useDb()) return this.mock.cancelScheduledMessage(tenantId, id);
    await query(`UPDATE scheduled_messages SET status = 'cancelled', updated_at = $3 WHERE tenant_id = $1 AND id = $2`, [tenantId, id, now()]);
  }
  async listDueScheduledMessages(tenantId: string, before: number): Promise<ScheduledMessage[]> {
    if (!this.useDb()) return this.mock.listDueScheduledMessages(tenantId, before);
    const rows = await query<ScheduledRow>(`SELECT * FROM scheduled_messages WHERE tenant_id = $1 AND status = 'scheduled' AND scheduled_at <= $2`, [tenantId, before]);
    return rows.map(mapScheduled);
  }
  async markScheduledMessage(tenantId: string, id: string, status: ScheduledMessage["status"]): Promise<void> {
    if (!this.useDb()) return this.mock.markScheduledMessage(tenantId, id, status);
    await query(`UPDATE scheduled_messages SET status = $3, updated_at = $4 WHERE tenant_id = $1 AND id = $2`, [tenantId, id, status, now()]);
  }
}

// Apply the catalog/config/analytics mixin methods onto the prototype.
CatalogMixin.applyTo(DbProvider);
