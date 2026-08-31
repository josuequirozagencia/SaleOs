/**
 * Repository contracts — the persistence seam.
 *
 * The application's own commercial data (matrículas, follow-ups, notes,
 * scheduled messages, audit logs, config, etc.) flows through these
 * interfaces. The MockProvider currently implements them in-memory; a
 * database-backed implementation (Postgres) can be dropped in without
 * touching any route or provider code.
 *
 * CRM data (contacts, conversations, messages, appointments, calendars,
 * users) is NOT stored here — it is fetched live from the CRM provider and
 * optionally cached. These repositories are for APP-LOCAL data only.
 *
 * Every method is tenant-scoped: `tenantId` is always the first argument and
 * a repository MUST never return or mutate rows belonging to another tenant.
 */

import type {
  Matricula, FollowUp, ContactNote, ScheduledMessage, TimelineEvent,
  AuditEntry, AppConfig, CurrencyConfig, StudyArea, Program, CustomField,
  QuickReply, CommercialRules,
} from "../types";

export interface MatriculaRepository {
  list(tenantId: string, assignedTo?: string): Promise<Matricula[]>;
  get(tenantId: string, id: string): Promise<Matricula | null>;
  getByContact(tenantId: string, contactId: string): Promise<Matricula | null>;
  create(tenantId: string, data: Omit<Matricula, "id" | "pendiente">): Promise<Matricula>;
  update(tenantId: string, id: string, updates: Partial<Matricula>): Promise<Matricula>;
  cancel(tenantId: string, id: string): Promise<Matricula>;
  remove(tenantId: string, id: string): Promise<void>;
}

export interface FollowUpRepository {
  list(tenantId: string, assignedTo?: string): Promise<FollowUp[]>;
  listByContact(tenantId: string, contactId: string): Promise<FollowUp[]>;
  get(tenantId: string, id: string): Promise<FollowUp | null>;
  create(tenantId: string, data: Omit<FollowUp, "id" | "status">): Promise<FollowUp>;
  update(tenantId: string, id: string, updates: Partial<FollowUp>): Promise<FollowUp>;
  updateStatus(tenantId: string, id: string, status: FollowUp["status"]): Promise<FollowUp>;
  remove(tenantId: string, id: string): Promise<void>;
}

export interface NoteRepository {
  listByContact(tenantId: string, contactId: string): Promise<ContactNote[]>;
  create(tenantId: string, contactId: string, ghlUserId: string, text: string): Promise<ContactNote>;
}

export interface ScheduledMessageRepository {
  listByConversation(tenantId: string, conversationId: string): Promise<ScheduledMessage[]>;
  get(tenantId: string, id: string): Promise<ScheduledMessage | null>;
  create(tenantId: string, data: Omit<ScheduledMessage, "id" | "status" | "createdAt" | "updatedAt">): Promise<ScheduledMessage>;
  update(tenantId: string, id: string, updates: Partial<Pick<ScheduledMessage, "message" | "scheduledAt">>): Promise<ScheduledMessage>;
  cancel(tenantId: string, id: string): Promise<void>;
  listDue(tenantId: string, before: number): Promise<ScheduledMessage[]>;
  markStatus(tenantId: string, id: string, status: ScheduledMessage["status"]): Promise<void>;
}

export interface TimelineRepository {
  listByContact(tenantId: string, contactId: string): Promise<TimelineEvent[]>;
  add(tenantId: string, event: Omit<TimelineEvent, "id" | "timestamp">): Promise<TimelineEvent>;
}

export interface AuditRepository {
  record(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<void>;
  list(tenantId: string, limit?: number): Promise<AuditEntry[]>;
}

export interface ConfigRepository {
  getAppConfig(tenantId: string): Promise<AppConfig>;
  updateAppConfig(tenantId: string, updates: Partial<AppConfig>): Promise<AppConfig>;
  getCurrency(tenantId: string): Promise<CurrencyConfig>;
  updateCurrency(tenantId: string, config: CurrencyConfig): Promise<CurrencyConfig>;
  getCommercialRules(tenantId: string): Promise<CommercialRules>;
  updateCommercialRules(tenantId: string, rules: CommercialRules): Promise<CommercialRules>;
}

export interface CatalogRepository {
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
}

/**
 * The aggregate repository interface. A database-backed implementation
 * implements this; the MockProvider delegates to its in-memory stores.
 * Swapping is a one-line change in providerService.
 */
export interface AppRepository extends
  MatriculaRepository, FollowUpRepository, NoteRepository,
  ScheduledMessageRepository, TimelineRepository, AuditRepository,
  ConfigRepository, CatalogRepository {}
