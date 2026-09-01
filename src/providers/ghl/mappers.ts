/**
 * server/src/providers/ghl/mappers.ts
 *
 * Bidirectional mappers between external CRM payloads (GoHighLevel Private API v2.0)
 * and BeautyCRM domain types.
 *
 * Normalizes field naming differences, missing properties, date formats (ISO string vs epoch ms),
 * and color/initial generation.
 */

import type {
  CrmUser,
  Contact,
  Conversation,
  CrmMessage,
  Calendar,
  TimeSlot,
  Appointment,
  AppointmentStatus,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  PipelineStage,
  Role,
} from "../../types";

const AVATAR_COLORS = [
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#6366f1", // indigo
];

function getDeterministicColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name: string): string {
  if (!name || !name.trim()) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseEpochMs(dateVal: unknown): number {
  if (!dateVal) return Date.now();
  if (typeof dateVal === "number") return dateVal;
  if (typeof dateVal === "string") {
    const num = Number(dateVal);
    if (!isNaN(num) && num > 1000000000000) return num;
    const parsed = new Date(dateVal).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return Date.now();
}

// ── Users Mapper ─────────────────────────────────────────────────────────────

export function mapCrmUser(raw: any): CrmUser {
  const ghlUserId = String(raw.id || raw.ghlUserId || raw._id || "");
  const name =
    raw.name ||
    [raw.firstName, raw.lastName].filter(Boolean).join(" ") ||
    "Usuario";
  const email = raw.email || "";
  const phone = raw.phone || raw.phoneNumber || undefined;

  let role: Role = "advisor";
  const rawRole = String(raw.role || raw.type || "").toLowerCase();
  if (rawRole.includes("super")) role = "super_admin";
  else if (rawRole.includes("admin")) role = "admin";
  else if (rawRole.includes("superv")) role = "supervisor";

  const active = raw.active !== undefined ? Boolean(raw.active) : !raw.deleted;

  return {
    ghlUserId,
    name,
    email,
    phone,
    avatarColor: getDeterministicColor(ghlUserId || email || name),
    initials: getInitials(name),
    role,
    active,
    locationId: String(raw.locationId || ""),
    source: "highlevel",
    syncStatus: "synced",
    lastSyncedAt: Date.now(),
  };
}

// ── Contact Mapper ───────────────────────────────────────────────────────────

export function mapCrmContact(raw: any): Contact {
  const id = String(raw.id || raw._id || "");
  const name =
    raw.name ||
    [raw.firstName, raw.lastName].filter(Boolean).join(" ") ||
    "Contacto sin nombre";
  const phone = raw.phone || raw.phoneNumber || "";
  const email = raw.email || undefined;
  const city = raw.city || raw.address1 || undefined;
  const tags: string[] = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
  const assignedTo = raw.assignedTo ? String(raw.assignedTo) : null;
  const createdAt = parseEpochMs(raw.dateAdded || raw.createdAt);
  const lastActivityAt = raw.dateUpdated || raw.lastActivity ? parseEpochMs(raw.dateUpdated || raw.lastActivity) : undefined;

  const isMatriculated = tags.some((t) => t.toLowerCase() === "matriculado") || Boolean(raw.matriculated);

  let pipelineStage: PipelineStage = "venta";
  if (raw.pipelineStage && ["venta", "seguimiento", "abono", "matriculado"].includes(raw.pipelineStage)) {
    pipelineStage = raw.pipelineStage as PipelineStage;
  } else if (isMatriculated) {
    pipelineStage = "matriculado";
  }

  return {
    id,
    name,
    phone,
    email,
    city,
    tags,
    assignedTo,
    createdAt,
    lastActivityAt,
    leadScore: typeof raw.leadScore === "number" ? raw.leadScore : 50,
    matriculated: isMatriculated,
    pipelineStage,
    avatarColor: getDeterministicColor(id || name),
    initials: getInitials(name),
  };
}

// ── Conversation Mapper ──────────────────────────────────────────────────────

export function mapCrmConversation(raw: any): Conversation {
  const id = String(raw.id || raw._id || "");
  const contactId = String(raw.contactId || raw.contact?.id || "");
  const contactName =
    raw.contactName ||
    raw.contact?.name ||
    [raw.contact?.firstName, raw.contact?.lastName].filter(Boolean).join(" ") ||
    "Cliente";

  let channel: MessageChannel = "other";
  const rawType = String(raw.type || raw.channel || raw.lastMessageType || "").toLowerCase();
  if (rawType.includes("whatsapp")) channel = "whatsapp";
  else if (rawType.includes("instagram")) channel = "instagram";
  else if (rawType.includes("fb") || rawType.includes("messenger")) channel = "messenger";

  const lastMessage = String(raw.lastMessageBody || raw.lastMessage || raw.snippet || "");
  const lastTimestamp = parseEpochMs(raw.lastMessageDate || raw.dateUpdated || raw.updatedAt);
  const unread = typeof raw.unreadCount === "number" ? raw.unreadCount : (raw.unread ? 1 : 0);
  const assignedTo = raw.assignedTo ? String(raw.assignedTo) : null;
  const tags: string[] = Array.isArray(raw.tags) ? raw.tags.map(String) : [];

  let status: "open" | "pending" | "closed" = "open";
  const rawStatus = String(raw.status || "").toLowerCase();
  if (rawStatus === "pending" || rawStatus === "closed") status = rawStatus as any;

  let pipelineStage: PipelineStage = "venta";
  if (raw.pipelineStage && ["venta", "seguimiento", "abono", "matriculado"].includes(raw.pipelineStage)) {
    pipelineStage = raw.pipelineStage as PipelineStage;
  }

  return {
    id,
    contactId,
    contactName,
    contactInitials: getInitials(contactName),
    contactAvatarColor: getDeterministicColor(contactId || contactName),
    channel,
    lastMessage,
    lastTimestamp,
    unread,
    assignedTo,
    tags,
    status,
    pipelineStage,
  };
}

// ── Message Mapper ───────────────────────────────────────────────────────────

export function mapCrmMessage(raw: any): CrmMessage {
  const id = String(raw.id || raw._id || "");
  const conversationId = String(raw.conversationId || "");
  const senderId = String(raw.senderId || raw.authorId || raw.userId || raw.contactId || "");

  let direction: MessageDirection = "outbound";
  const rawDir = String(raw.direction || raw.messageType || "").toLowerCase();
  if (rawDir.includes("inbound") || rawDir.includes("in") || rawDir === "1") {
    direction = "inbound";
  }

  const text = String(raw.body || raw.text || raw.message || "");
  const timestamp = parseEpochMs(raw.dateAdded || raw.createdAt || raw.timestamp);

  let status: MessageStatus = "sent";
  const rawStatus = String(raw.status || "").toLowerCase();
  if (["delivered", "read", "failed"].includes(rawStatus)) status = rawStatus as MessageStatus;

  let contentType: CrmMessage["contentType"] = "text";
  const rawContentType = String(raw.contentType || raw.type || "").toLowerCase();
  if (rawContentType.includes("image")) contentType = "image";
  else if (rawContentType.includes("audio")) contentType = "audio";
  else if (rawContentType.includes("video")) contentType = "video";
  else if (rawContentType.includes("document") || rawContentType.includes("pdf")) contentType = "document";
  else if (rawContentType.includes("template")) contentType = "template";

  return {
    id,
    conversationId,
    senderId,
    direction,
    text,
    timestamp,
    status,
    contentType,
    isAi: Boolean(raw.isAi),
    visibility: raw.visibility === "internal" ? "internal" : "external",
  };
}

// ── Calendar Mapper ──────────────────────────────────────────────────────────

export function mapCrmCalendar(raw: any): Calendar {
  return {
    id: String(raw.id || ""),
    name: String(raw.name || "Calendario"),
    assignedTo: raw.primaryUser || raw.assignedTo ? String(raw.primaryUser || raw.assignedTo) : null,
    active: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    timezone: String(raw.timezone || "America/Lima"),
    providerCalendarId: raw.id ? String(raw.id) : undefined,
  };
}

// ── TimeSlot Mapper ──────────────────────────────────────────────────────────

export function mapCrmSlot(raw: any, calendarId: string): TimeSlot {
  const start = parseEpochMs(raw.start || raw.startTime);
  const end = parseEpochMs(raw.end || raw.endTime);
  return {
    id: `slot_${start}_${end}`,
    calendarId,
    start,
    end,
    available: raw.available !== false,
  };
}

// ── Appointment Mapper ───────────────────────────────────────────────────────

export function mapCrmAppointment(raw: any): Appointment {
  const id = String(raw.id || raw._id || "");
  const calendarId = String(raw.calendarId || "");
  const contactId = String(raw.contactId || raw.contact?.id || "");
  const contactName = String(raw.contactName || raw.contact?.name || "Contacto");
  const ghlUserId = String(raw.assignedUserId || raw.assignedTo || raw.userId || "");
  const start = parseEpochMs(raw.startTime || raw.start);
  const end = parseEpochMs(raw.endTime || raw.end);

  let status: AppointmentStatus = "scheduled";
  const rawStatus = String(raw.appointmentStatus || raw.status || "").toLowerCase();
  if (["confirmed", "cancelled", "completed", "no_show"].includes(rawStatus)) {
    status = rawStatus as AppointmentStatus;
  }

  return {
    id,
    calendarId,
    contactId,
    contactName,
    ghlUserId,
    start,
    end,
    status,
    title: raw.title ? String(raw.title) : undefined,
    note: raw.notes || raw.note ? String(raw.notes || raw.note) : undefined,
    createdAt: raw.createdAt ? parseEpochMs(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? parseEpochMs(raw.updatedAt) : undefined,
  };
}
