/**
 * Domain types mirrored from the backend (`src/types/index.ts`).
 *
 * Kept as a hand-written mirror rather than an import: the backend compiles to
 * CommonJS with its own tsconfig, and wiring a shared package would couple the
 * two builds. The fields below match the API responses exactly — including the
 * ones that are legitimately null.
 */

export type Role = "super_admin" | "admin" | "supervisor" | "advisor";
export type MessageChannel = "whatsapp" | "instagram" | "messenger" | "other";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";
export type PipelineStage = "venta" | "seguimiento" | "abono" | "matriculado";
export type ConversationStatus = "open" | "pending" | "closed";

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
}

export interface UserProfile {
  ghlUserId: string;
  preferredTheme: "dark" | "light";
  language: string;
  monthlyGoal: number;
  commissionPercentage: number;
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactInitials: string;
  contactAvatarColor: string;
  channel: MessageChannel;
  lastMessage: string;
  /**
   * Epoch ms, or null when the CRM gave no parseable date. The backend
   * deliberately does not invent "now" here, so the UI must render the
   * absence rather than a wrong time.
   */
  lastTimestamp: number | null;
  unread: number;
  assignedTo: string | null;
  tags: string[];
  status: ConversationStatus;
  pipelineStage: PipelineStage;
}

export interface CrmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  direction: MessageDirection;
  text: string;
  /** Epoch ms, or null when undeterminable — see Conversation.lastTimestamp. */
  timestamp: number | null;
  status: MessageStatus;
  contentType: "text" | "image" | "audio" | "video" | "document" | "template";
  isAi?: boolean;
  visibility?: "external" | "internal";
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SessionResponse {
  user: CrmUser;
  profile: UserProfile;
}

export interface LoginResponse extends SessionResponse {
  token: string;
}

// ── Matrículas ───────────────────────────────────────────────────────────

export type PaymentMethod =
  | "efectivo" | "tarjeta" | "transferencia" | "yape" | "plin" | "otro";

export type MatriculaStatus = "pendiente" | "abonado" | "matriculado" | "anulado";

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
  programId?: string;
  total: number;
  abono: number;
  /** Computed by the backend — never sent on create. */
  pendiente: number;
  paymentMethod: PaymentMethod;
  /** Enrollment date, epoch ms. */
  date: number;
  status: MatriculaStatus;
  assignedTo: string;
  notes?: string;
  customFields?: Record<string, string | string[] | boolean | number>;
  createdAt?: number;
  updatedAt?: number;
}

/** Payload for POST /matriculas — `pendiente` is derived server-side. */
export type MatriculaInput = Omit<Matricula, "id" | "pendiente" | "createdAt" | "updatedAt" | "assignedTo">;

// ── Contacts (enough for the picker) ─────────────────────────────────────

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  area?: string;
  tags: string[];
  assignedTo: string | null;
  /** Epoch ms, or null when the CRM gave no parseable date. */
  createdAt: number | null;
  matriculated: boolean;
  matriculaId?: string;
  avatarColor: string;
  initials: string;
}

// ── Tenant configuration ─────────────────────────────────────────────────

export interface CurrencyConfig {
  currencyCode: string;
  currencySymbol: string;
  currencyName: string;
  decimalDigits: number;
  decimalSeparator: string;
  thousandsSeparator: string;
  position: "before" | "after";
}

export interface StudyArea {
  id: string;
  name: string;
  active: boolean;
  order?: number;
}

export interface Program {
  id: string;
  areaId: string;
  name: string;
  active: boolean;
  order?: number;
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
}
