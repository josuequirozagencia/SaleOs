/**
 * CrmProvider — the single abstraction through which all external CRM
 * (GoHighLevel) communication flows. The backend services call this, never
 * the CRM directly from a module. Two implementations:
 *
 *  - GhlProvider   : real HTTP calls to the CRM Private API v2.0 (server-side
 *                    credentials injected from tenant config). Throws
 *                    PROVIDER_ERROR on failure.
 *  - MockProvider  : in-memory data mirroring the same interface, used when
 *                    USE_MOCK=true or no credentials are configured.
 *
 * Endpoints here are intentionally abstract; the real GhlProvider maps each
 * to the official CRM endpoint. We do NOT invent CRM endpoints — when an
 * official endpoint is unavailable, the method throws PROVIDER_UNAVAILABLE
 * and the caller surfaces a controlled error.
 */

import type {
  CrmUser, CrmLocation, Contact, Conversation, CrmMessage, MessageTemplate,
  PipelineStage, Matricula, CallRecord, Calendar, TimeSlot, Appointment,
  AppointmentStatus, IntegrationState, StudyArea, Program, CustomField,
  QuickReply, FollowUp, ScheduledMessage, ContactNote, TimelineEvent,
  Paginated, AppConfig, IntegrationConfig, UserProfile, Achievement,
  CurrencyConfig, Role, Pipeline, Opportunity, PaginatedOpportunities,
} from "../types";

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  assignedTo?: string;
  channel?: string;
  status?: string;
  tag?: string;
  unreadOnly?: boolean;
  assignedFilter?: "all" | "assigned" | "unassigned";
  matriculated?: boolean;
  area?: string;
  programId?: string;
  contactId?: string;
  direction?: string;
  from?: number;
  to?: number;
}

export interface CrmProvider {
  // ── Users / Location ──────────────────────────────────────────────
  listUsers(tenantId: string): Promise<CrmUser[]>;
  getUserProfile(tenantId: string, ghlUserId: string): Promise<UserProfile | null>;
  updateUserProfile(tenantId: string, ghlUserId: string, updates: Partial<UserProfile>): Promise<UserProfile>;
  getLocation(tenantId: string): Promise<CrmLocation>;
  /** Fetch a single user by ghlUserId from the CRM platform. */
  getUser(tenantId: string, ghlUserId: string): Promise<CrmUser | null>;
  /** Create a user in the CRM platform. Returns the CRM-created user (with ghlUserId). */
  createUser(tenantId: string, data: { name: string; email: string; phone?: string; role: Role }): Promise<CrmUser>;
  /** Update a user's editable fields in the CRM platform. */
  updateUser(tenantId: string, ghlUserId: string, updates: Partial<Pick<CrmUser, "name" | "email" | "phone" | "role">>): Promise<CrmUser>;
  /** Deactivate a user in the CRM platform (soft delete). */
  disableUser(tenantId: string, ghlUserId: string): Promise<CrmUser>;
  /** Sync users from the CRM platform into the local representation (idempotent). */
  syncUsers(tenantId: string): Promise<{ total: number; created: number; updated: number; unchanged: number; errors: number; lastSyncAt: number }>;

  // ── Contacts ──────────────────────────────────────────────────────
  listContacts(tenantId: string, params: ListParams): Promise<Paginated<Contact>>;
  getContact(tenantId: string, contactId: string): Promise<Contact | null>;
  updateContactOwner(tenantId: string, contactId: string, ghlUserId: string): Promise<Contact>;
  updateContactTags(tenantId: string, contactId: string, tags: string[]): Promise<Contact>;

  // ── Conversations / Messages ─────────────────────────────────────
  listConversations(tenantId: string, params: ListParams): Promise<Paginated<Conversation>>;
  getConversation(tenantId: string, conversationId: string): Promise<Conversation | null>;
  getConversationMessages(tenantId: string, conversationId: string, page: number, pageSize: number): Promise<Paginated<CrmMessage>>;
  sendMessage(tenantId: string, conversationId: string, payload: { text: string; ghlUserId: string; visibility?: "external" | "internal"; attachment?: { url: string; contentType: string; fileName: string } }): Promise<CrmMessage>;
  sendTemplate(tenantId: string, conversationId: string, payload: { templateId: string; variables: string[]; ghlUserId: string }): Promise<CrmMessage>;
  getTemplates(tenantId: string): Promise<MessageTemplate[]>;
  updateConversationTags(tenantId: string, conversationId: string, tags: string[]): Promise<Conversation>;
  updateConversationPipeline(tenantId: string, conversationId: string, stage: PipelineStage): Promise<Conversation>;
  markConversationRead(tenantId: string, conversationId: string): Promise<void>;
  getConversationByContact(tenantId: string, contactId: string): Promise<Conversation | null>;

  // ── Pipelines / Opportunities (CRM-native) ──────────────────────
  listPipelines(tenantId: string): Promise<Pipeline[]>;
  listOpportunities(tenantId: string, params: ListParams): Promise<PaginatedOpportunities>;
  updateOpportunityStage(tenantId: string, id: string, stageId: string): Promise<Opportunity>;

  // ── Matrículas ────────────────────────────────────────────────────
  listMatriculas(tenantId: string, assignedTo?: string): Promise<Matricula[]>;
  getMatricula(tenantId: string, id: string): Promise<Matricula | null>;
  getMatriculaByContact(tenantId: string, contactId: string): Promise<Matricula | null>;
  createMatricula(tenantId: string, data: Omit<Matricula, "id" | "pendiente">): Promise<Matricula>;
  cancelMatricula(tenantId: string, id: string): Promise<Matricula>;
  removeMatricula(tenantId: string, id: string): Promise<void>;

  // ── Calls ────────────────────────────────────────────────────────
  listCalls(tenantId: string, params: ListParams): Promise<Paginated<CallRecord>>;
  getCall(tenantId: string, id: string): Promise<CallRecord | null>;
  listCallsByContact(tenantId: string, contactId: string): Promise<CallRecord[]>;
  startCall(tenantId: string, contactId: string, number: string, ghlUserId: string): Promise<CallRecord>;
  answerCall(tenantId: string, id: string): Promise<CallRecord>;
  completeCall(tenantId: string, id: string, finalStatus: CallRecord["status"]): Promise<CallRecord>;
  requestTranscription(tenantId: string, id: string): Promise<CallRecord>;
  requestAnalysis(tenantId: string, id: string): Promise<CallRecord>;
  getCallAnalysisStatus(tenantId: string, id: string): Promise<CallRecord>;

  // ── Achievements / Response time / Dashboard ─────────────────────
  getAchievement(tenantId: string, ghlUserId: string): Promise<Achievement>;
  getDashboardMetrics(tenantId: string, assignedTo?: string): Promise<Record<string, unknown>>;
  /**
   * Aggregated response-time analytics computed server-side. Avoids loading
   * all conversations + all messages into the client. Returns per-advisor and
   * global metrics for the given period.
   */
  getResponseTimeAnalytics(tenantId: string, params: { from?: number; to?: number; advisorId?: string }): Promise<{
    summary: { avgSeconds: number; minSeconds: number; maxSeconds: number; answered: number; pending: number; unanswered: number; medianSeconds: number };
    byAdvisor: { ghlUserId: string; name: string; answered: number; pending: number; unanswered: number; avgSeconds: number; minSeconds: number; maxSeconds: number }[];
  }>;

  /**
   * Aggregated commercial conversion analytics (Fase 9.1). Computed server-side
   * so the client never downloads the full contact/matricula base. Conversion =
   * active matrícula. Enforces advisor scope server-side via assignedTo.
   */
  getConversionAnalytics(tenantId: string, params: { from?: number; to?: number; advisorId?: string }): Promise<{
    totalIncomingLeads: number;
    totalAssignedLeads: number;
    totalUnassignedLeads: number;
    totalConvertedLeads: number;
    conversionRate: number;
    assignedRate: number;
    convertedOfAssignedRate: number;
    advisors: { ghlUserId: string; name: string; received: number; converted: number; conversionRate: number }[];
  }>;

  // ── Integration ──────────────────────────────────────────────────
  getIntegrationState(tenantId: string): Promise<IntegrationState>;
  connectIntegration(tenantId: string): Promise<IntegrationState>;
  testIntegration(tenantId: string): Promise<{ ok: boolean; message: string }>;
  syncIntegration(tenantId: string): Promise<IntegrationState>;
  disconnectIntegration(tenantId: string): Promise<IntegrationState>;
  getIntegrationConfig(tenantId: string): Promise<IntegrationConfig>;
  saveIntegrationConfig(tenantId: string, token: string, locationId: string): Promise<IntegrationConfig>;
  clearIntegrationConfig(tenantId: string): Promise<IntegrationConfig>;

  // ── Areas / Programs / Custom fields / Quick replies ────────────
  listAreas(tenantId: string): Promise<StudyArea[]>;
  createArea(tenantId: string, name: string): Promise<StudyArea>;
  updateArea(tenantId: string, id: string, updates: Partial<StudyArea>): Promise<StudyArea>;
  removeArea(tenantId: string, id: string): Promise<void>;
  listPrograms(tenantId: string): Promise<Program[]>;
  listProgramsByArea(tenantId: string, areaId: string): Promise<Program[]>;
  createProgram(tenantId: string, data: Omit<Program, "id">): Promise<Program>;
  updateProgram(tenantId: string, id: string, updates: Partial<Program>): Promise<Program>;
  removeProgram(tenantId: string, id: string): Promise<void>;
  listCustomFields(tenantId: string): Promise<CustomField[]>;
  createCustomField(tenantId: string, data: Omit<CustomField, "id">): Promise<CustomField>;
  updateCustomField(tenantId: string, id: string, updates: Partial<CustomField>): Promise<CustomField>;
  removeCustomField(tenantId: string, id: string): Promise<void>;
  listQuickReplies(tenantId: string): Promise<QuickReply[]>;
  createQuickReply(tenantId: string, data: Omit<QuickReply, "id" | "updatedAt">): Promise<QuickReply>;
  updateQuickReply(tenantId: string, id: string, updates: Partial<QuickReply>): Promise<QuickReply>;
  removeQuickReply(tenantId: string, id: string): Promise<void>;

  // ── Follow-ups / Notes / Timeline ───────────────────────────────
  listFollowUps(tenantId: string, assignedTo?: string): Promise<FollowUp[]>;
  listFollowUpsByContact(tenantId: string, contactId: string): Promise<FollowUp[]>;
  /** Fetch a single follow-up by id (for ownership checks on PATCH/DELETE). */
  getFollowUp(tenantId: string, id: string): Promise<FollowUp | null>;
  createFollowUp(tenantId: string, data: Omit<FollowUp, "id" | "status">): Promise<FollowUp>;
  updateFollowUp(tenantId: string, id: string, updates: Partial<FollowUp>): Promise<FollowUp>;
  updateFollowUpStatus(tenantId: string, id: string, status: FollowUp["status"]): Promise<FollowUp>;
  removeFollowUp(tenantId: string, id: string): Promise<void>;
  listNotesByContact(tenantId: string, contactId: string): Promise<ContactNote[]>;
  createNote(tenantId: string, contactId: string, ghlUserId: string, text: string): Promise<ContactNote>;
  listTimelineByContact(tenantId: string, contactId: string): Promise<TimelineEvent[]>;

  // ── Scheduled messages ──────────────────────────────────────────
  listScheduledByConversation(tenantId: string, conversationId: string): Promise<ScheduledMessage[]>;
  /** Fetch a single scheduled message by id (for ownership checks on PATCH/cancel). */
  getScheduledMessage(tenantId: string, id: string): Promise<ScheduledMessage | null>;
  createScheduledMessage(tenantId: string, data: Omit<ScheduledMessage, "id" | "status" | "createdAt" | "updatedAt">): Promise<ScheduledMessage>;
  updateScheduledMessage(tenantId: string, id: string, updates: Partial<Pick<ScheduledMessage, "message" | "scheduledAt">>): Promise<ScheduledMessage>;
  cancelScheduledMessage(tenantId: string, id: string): Promise<void>;
  /** Pull due scheduled messages for the scheduler job. */
  listDueScheduledMessages(tenantId: string, before: number): Promise<ScheduledMessage[]>;
  markScheduledMessage(tenantId: string, id: string, status: ScheduledMessage["status"]): Promise<void>;

  // ── Calendars / Appointments ─────────────────────────────────────
  listCalendars(tenantId: string, assignedTo?: string): Promise<Calendar[]>;
  getSlots(tenantId: string, calendarId: string, from: number, to: number): Promise<TimeSlot[]>;
  listAppointments(tenantId: string, params: ListParams): Promise<Paginated<Appointment>>;
  getAppointment(tenantId: string, id: string): Promise<Appointment | null>;
  listAppointmentsByContact(tenantId: string, contactId: string): Promise<Appointment[]>;
  bookAppointment(tenantId: string, data: Omit<Appointment, "id" | "createdAt" | "updatedAt">): Promise<Appointment>;
  updateAppointmentStatus(tenantId: string, id: string, status: AppointmentStatus): Promise<Appointment>;
  rescheduleAppointment(tenantId: string, id: string, start: number, end: number, slotId?: string): Promise<Appointment>;
  cancelAppointment(tenantId: string, id: string): Promise<void>;

  // ── App config ──────────────────────────────────────────────────
  getAppConfig(tenantId: string): Promise<AppConfig>;
  updateAppConfig(tenantId: string, updates: Partial<AppConfig>): Promise<AppConfig>;

  // ── Currency config (per-tenant, presentation only) ─────────────
  getCurrency(tenantId: string): Promise<CurrencyConfig>;
  updateCurrency(tenantId: string, config: CurrencyConfig): Promise<CurrencyConfig>;
}
