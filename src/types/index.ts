/**
 * Shared backend domain types.
 *
 * These mirror the frontend `src/lib/types.ts` contracts exactly so the
 * API responses are shape-compatible. The backend is the authority for
 * server-only fields (tenantId, audit metadata) which are stripped before
 * serialization when they should not reach the client.
 */

export type Role = "super_admin" | "admin" | "supervisor" | "advisor";

// Pipeline & Opportunity domain types (defined in ./opportunities to keep
// this file focused).
export type {
  PipelineStageInfo, Pipeline, Opportunity, PaginatedOpportunities,
} from "./opportunities";

export type UserSource = "highlevel" | "salesos";
export type UserSyncStatus = "synced" | "pending" | "error" | "disabled" | "not_found";

export interface CrmUser {
  ghlUserId: string;
  name: string;
  email: string;
  avatarColor: string;
  initials: string;
  role: Role;
  active: boolean;
  locationId: string;
  phone?: string;
  /** Origin of the user identity — CRM platform or created in Sales OS. */
  source?: UserSource;
  /** Sync state of the link with the CRM platform. */
  syncStatus?: UserSyncStatus;
  /** Timestamp of the last successful sync with the CRM (server-only). */
  lastSyncedAt?: number;
  /** Server-only: tenant scoping. Never serialized to the client. */
  tenantId?: string;
}

/** Result of a user sync operation (import/update from the CRM platform). */
export interface UserSyncResult {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  lastSyncAt: number;
}

export interface UserProfile {
  ghlUserId: string;
  preferredTheme: "dark" | "light";
  appearance: "corporate" | "femenino" | "masculino" | "moderno";
  favoriteColor: string;
  language: string;
  timezone: string;
  monthlyGoal: number;
  commissionPercentage: number;
  gamificationLevel: string;
  notificationPreferences: {
    newMessages: boolean;
    newLeads: boolean;
    matriculas: boolean;
    calls: boolean;
  };
}

export interface CrmLocation {
  id: string;
  name: string;
  phone?: string;
}

export type MessageChannel = "whatsapp" | "instagram" | "messenger" | "other";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";

export interface CrmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  direction: MessageDirection;
  text: string;
  timestamp: number;
  status: MessageStatus;
  contentType: "text" | "image" | "audio" | "video" | "document" | "template";
  isAi?: boolean;
  visibility?: "external" | "internal";
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  category: "marketing" | "utility" | "transactional";
  variables: number;
}

export type PipelineStage = "venta" | "seguimiento" | "abono" | "matriculado";

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactInitials: string;
  contactAvatarColor: string;
  channel: MessageChannel;
  lastMessage: string;
  lastTimestamp: number;
  unread: number;
  assignedTo: string | null;
  tags: string[];
  status: "open" | "pending" | "closed";
  pipelineStage: PipelineStage;
  window24ExpiresAt?: number;
  tenantId?: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  channel?: MessageChannel;
  area?: string;
  experience?: string;
  sede?: string;
  tags: string[];
  assignedTo: string | null;
  createdAt: number;
  lastActivityAt?: number;
  leadScore: number;
  matriculated: boolean;
  matriculaId?: string;
  pipelineStage?: PipelineStage;
  avatarColor: string;
  initials: string;
  tenantId?: string;
}

export type PaymentMethod =
  | "efectivo" | "tarjeta" | "transferencia" | "yape" | "plin" | "otro";
export type MatriculaStatus =
  | "pendiente" | "abonado" | "matriculado" | "anulado";

export interface Matricula {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  area: string;
  areaId?: string;
  total: number;
  abono: number;
  pendiente: number;
  paymentMethod: PaymentMethod;
  date: number;
  status: MatriculaStatus;
  assignedTo: string;
  programId?: string; notes?: string;
  customFields?: Record<string, string | string[] | boolean | number>;
  createdAt?: number;
  updatedAt?: number;
  tenantId?: string;
}

export type CallDirection = "outbound" | "inbound";
export type CallStatus =
  | "initiated" | "ringing" | "answered" | "completed"
  | "missed" | "rejected" | "failed" | "cancelled";

export interface CallObjection {
  type: string;
  severity: "alta" | "media" | "baja";
  detail?: string;
}

export interface CallAiAnalysis {
  summary: string;
  keyPoints: string[];
  need: string | null;
  interestedProgram: string | null;
  objections: CallObjection[];
  budgetMentioned: number | null;
  availability: string | null;
  nextStep: string;
  closeProbability: number;
  strengths: string[];
  weakPoints: string[];
  recommendations: string;
  score: number;
}

export interface CallRecord {
  id: string;
  contactId: string;
  contactName: string;
  ghlUserId: string;
  userName: string;
  number: string;
  direction: CallDirection;
  status: CallStatus;
  startedAt: number;
  connectedAt?: number;
  endedAt?: number;
  duration: number;
  effectiveDuration?: number;
  providerCallId?: string;
  recordingUrl?: string;
  transcription?: string;
  transcriptStatus?: "none" | "processing" | "ready" | "failed";
  aiAnalysis?: CallAiAnalysis | null;
  aiAnalysisHash?: string | null;
  aiStatus?: "none" | "processing" | "ready" | "failed";
  createdAt?: number;
  updatedAt?: number;
  tenantId?: string;
}

export interface Achievement {
  level: string;
  matriculas: number;
  commissionBase: number;
  bonus: number;
  totalEarned: number;
  progress: number;
  nextLevel: string | null;
  rank: number;
}

export interface ResponseTimeSummary {
  avgToday: number;
  avgWeek: number;
  avgMonth: number;
  min: number;
  max: number;
  answered: number;
  pending: number;
  unanswered: number;
}

export type IntegrationStatus =
  | "connected" | "syncing" | "error" | "disconnected";

export interface IntegrationState {
  status: IntegrationStatus;
  locationId: string | null;
  locationName: string | null;
  lastSyncAt: number | null;
  syncedUsers: number;
  syncedContacts: number;
  syncedConversations: number;
  connectedPhone: string | null;
  errorMessage?: string;
}

export interface IntegrationConfig {
  hasToken: boolean;
  tokenLast4?: string;
  locationId: string | null;
  persisted: boolean;
}

export interface StudyArea {
  id: string;
  name: string;
  active: boolean;
  order?: number;
  tenantId?: string;
}

export interface Program {
  id: string;
  areaId: string;
  name: string;
  active: boolean;
  order?: number;
  tenantId?: string;
}

export type CustomFieldType =
  | "TEXT" | "NUMBER" | "EMAIL" | "PHONE" | "DATE" | "TEXTAREA"
  | "SELECT" | "MULTISELECT" | "CHECKBOX" | "RADIO" | "FILE" | "IMAGE";

export interface CustomField {
  id: string;
  name: string;
  key: string;
  type: CustomFieldType;
  placeholder?: string;
  description?: string;
  required: boolean;
  active: boolean;
  order: number;
  options?: string[];
  tenantId?: string;
}

export interface QuickReply {
  id: string;
  name: string;
  content: string;
  category: string;
  active: boolean;
  updatedAt: number;
  tenantId?: string;
}

export type FollowUpStatus = "pending" | "completed" | "postponed" | "cancelled";
export type FollowUpType = "llamada" | "mensaje" | "whatsapp" | "visita" | "otro";

export interface FollowUp {
  id: string;
  contactId: string;
  contactName: string;
  ghlUserId: string;
  dueAt: number;
  reason: string;
  status: FollowUpStatus;
  type: FollowUpType;
  note?: string; createdAt?: number; completedAt?: number;
  tenantId?: string;
}

export type ScheduledMessageStatus =
  | "scheduled" | "processing" | "sent" | "failed" | "cancelled";

export interface ScheduledMessage {
  id: string;
  contactId: string;
  conversationId: string;
  advisorUserId: string;
  message: string;
  scheduledAt: number;
  status: ScheduledMessageStatus;
  createdAt: number;
  updatedAt: number;
  tenantId?: string;
}

export type TimelineEventType =
  | "contact_created" | "message_received" | "message_sent"
  | "owner_changed" | "stage_changed" | "tag_added" | "tag_removed"
  | "followup_created" | "followup_completed" | "matricula_created"
  | "matricula_revoked" | "message_scheduled" | "scheduled_sent"
  | "scheduled_cancelled";

export interface TimelineEvent {
  id: string;
  contactId: string;
  type: TimelineEventType;
  timestamp: number;
  title: string;
  description?: string;
  ghlUserId?: string;
  tenantId?: string;
}

export interface ContactNote {
  id: string;
  contactId: string;
  ghlUserId: string;
  text: string;
  createdAt: number;
  tenantId?: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Calendar {
  id: string;
  name: string;
  assignedTo: string | null;
  active: boolean;
  timezone: string;
  providerCalendarId?: string;
  tenantId?: string;
}

export interface TimeSlot {
  id: string;
  calendarId: string;
  start: number;
  end: number;
  available: boolean;
  providerSlotId?: string;
}

export type AppointmentStatus =
  | "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";

export interface Appointment {
  id: string;
  calendarId: string;
  contactId: string;
  contactName: string;
  ghlUserId: string;
  start: number;
  end: number;
  status: AppointmentStatus;
  title?: string;
  note?: string;
  providerAppointmentId?: string;
  createdAt?: number;
  updatedAt?: number;
  tenantId?: string;
}

export interface CurrencyConfig {
  currencyCode: string;
  currencySymbol: string;
  currencyName: string;
  decimalDigits: number;
  decimalSeparator: string;
  thousandsSeparator: string;
  position: "before" | "after";
}

export interface AppConfig {
  appName: string;
  /** Per-tenant currency configuration (presentation only; no conversion). */
  currency?: CurrencyConfig;
  tenantId?: string;
}

/** Configurable commercial rules (commission, base, bonuses, thresholds). */
export interface CommercialRules {
  commissionType: "percentage" | "fixed";
  commissionValue: number;
  commissionBase: "total" | "paidAmount";
  bonusPerLevel: Record<string, number>;
  responseTimeThresholds: { green: number; yellow: number; orange: number; red: number };
}

export interface AttachmentResult {
  id: string;
  url: string;
  contentType: string;
  fileName: string;
  size: number;
}

// ── Audit log ─────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  tenantId: string;
  ghlUserId: string;
  action: string;
  resource: string;
  resourceId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ── Tenant ────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  ghlLocationId: string;
  /** Encrypted provider token (never the plaintext). */
  encryptedToken: string;
  tokenLast4?: string;
  active: boolean;
  createdAt: number;
}

// ── Auth session ──────────────────────────────────────────────────────

export interface AuthSession {
  /** Unique session id (jti) — used for revocation. */
  jti: string;
  ghlUserId: string;
  role: Role;
  tenantId: string;
  /** CRM location/sub-account the session is bound to (multi-tenant). */
  locationId: string;
  /** Data scope derived server-side from the role. */
  scope: "all" | "team" | "self";
  /** "viewAs" target when a super admin impersonates. */
  viewAsUserId?: string | null;
  /** Issued-at (epoch seconds). */
  iat?: number;
  /** Expiry (epoch seconds). */
  exp?: number;
}

export const MATRICULA_DUPLICATE_CODE = "MATRICULA_EXISTENTE";
