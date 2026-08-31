/**
 * MockProvider — in-memory implementation of CrmProvider for development.
 *
 * It mirrors the exact same interface as GhlProvider so the backend can swap
 * providers with a single flag (USE_MOCK) without touching any module code.
 * All data is clearly fictitious and never persisted to disk.
 *
 * SECURITY: no secrets, no network calls. This is development-only.
 */

import type { CrmProvider } from "../crmProvider";
import type { ListParams } from "../crmProvider";
import { ApiError } from "../../utils/errors";
import type {
  CrmUser, CrmLocation, Contact, Conversation, CrmMessage, MessageTemplate,
  PipelineStage, Matricula, CallRecord, Calendar, TimeSlot, Appointment,
  AppointmentStatus, IntegrationState, StudyArea, Program, CustomField,
  QuickReply, FollowUp, ScheduledMessage, ContactNote, TimelineEvent,
  Paginated, AppConfig, IntegrationConfig, UserProfile, Achievement,
  CurrencyConfig, Role,
} from "../../types";
import { MATRICULA_DUPLICATE_CODE } from "../../types";

// ── Seed data (fictitious) ──────────────────────────────────────────────

const now = () => Date.now();
const id = (p: string) => `${p}_${now()}_${Math.random().toString(36).slice(2, 7)}`;

const users: CrmUser[] = [
  { ghlUserId: "u_admin", name: "Admin Global", email: "admin@demo.com", avatarColor: "#6366f1", initials: "AG", role: "super_admin", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_laura", name: "Laura", email: "laura@demo.com", avatarColor: "#ec4899", initials: "LA", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_rommy", name: "Rommy", email: "rommy@demo.com", avatarColor: "#f59e0b", initials: "RO", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_carolina", name: "Carolina", email: "carolina@demo.com", avatarColor: "#10b981", initials: "CA", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_milka", name: "Milka", email: "milka@demo.com", avatarColor: "#8b5cf6", initials: "MI", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_jenny", name: "Jenny", email: "jenny@demo.com", avatarColor: "#ef4444", initials: "JE", role: "advisor", active: true, locationId: "loc_demo_001" },
];

const profiles: Record<string, UserProfile> = Object.fromEntries(
  users.map((u) => [u.ghlUserId, {
    ghlUserId: u.ghlUserId, preferredTheme: "dark", appearance: "moderno",
    favoriteColor: u.avatarColor, language: "es", timezone: "America/Lima",
    monthlyGoal: 20000, commissionPercentage: 10, gamificationLevel: "BASE",
    notificationPreferences: { newMessages: true, newLeads: true, matriculas: true, calls: true },
  }]),
);

const location: CrmLocation = { id: "loc_demo_001", name: "Academia Belleza Demo", phone: "+51987654321" };

const contacts: Contact[] = [
  { id: "c_1", name: "María González", phone: "+51911111111", email: "maria@demo.com", city: "Lima", channel: "whatsapp", area: "Cosmetología", experience: "Básica", sede: "Sede Central", tags: ["Interesada"], assignedTo: "u_laura", createdAt: now() - 86400000 * 5, lastActivityAt: now() - 3600000, leadScore: 75, matriculated: false, avatarColor: "#ec4899", initials: "MG" },
  { id: "c_2", name: "Lucía Ramírez", phone: "+51922222222", email: "lucia@demo.com", city: "Arequipa", channel: "instagram", area: "Uñas", experience: "Intermedia", tags: ["Matriculado"], assignedTo: "u_rommy", createdAt: now() - 86400000 * 10, lastActivityAt: now() - 7200000, leadScore: 90, matriculated: true, matriculaId: "mt_seed_1", avatarColor: "#f59e0b", initials: "LR" },
  { id: "c_3", name: "Sofía Torres", phone: "+51933333333", email: "sofia@demo.com", city: "Lima", channel: "whatsapp", area: "Maquillaje", experience: "Avanzada", tags: ["Seguimiento"], assignedTo: "u_carolina", createdAt: now() - 86400000 * 3, lastActivityAt: now() - 1800000, leadScore: 60, matriculated: false, avatarColor: "#10b981", initials: "ST" },
  { id: "c_4", name: "Valeria Cruz", phone: "+51944444444", email: "valeria@demo.com", city: "Trujillo", channel: "messenger", area: "Micropigmentación", tags: [], assignedTo: "u_milka", createdAt: now() - 86400000 * 7, lastActivityAt: now() - 86400000, leadScore: 40, matriculated: false, avatarColor: "#8b5cf6", initials: "VC" },
  { id: "c_5", name: "Daniela Ríos", phone: "+51955555555", email: "daniela@demo.com", city: "Lima", channel: "whatsapp", area: "Lashista", tags: ["Matriculado"], assignedTo: "u_jenny", createdAt: now() - 86400000 * 15, lastActivityAt: now() - 86400000 * 2, leadScore: 85, matriculated: true, matriculaId: "mt_seed_2", avatarColor: "#ef4444", initials: "DR" },
];

const conversations: Conversation[] = [
  { id: "conv_1", contactId: "c_1", contactName: "María González", contactInitials: "MG", contactAvatarColor: "#ec4899", channel: "whatsapp", lastMessage: "¿Cuánto cuesta el curso?", lastTimestamp: now() - 3600000, unread: 2, assignedTo: "u_laura", tags: ["Interesada"], status: "open", pipelineStage: "venta" },
  { id: "conv_2", contactId: "c_2", contactName: "Lucía Ramírez", contactInitials: "LR", contactAvatarColor: "#f59e0b", channel: "instagram", lastMessage: "Listo, ya aboné.", lastTimestamp: now() - 7200000, unread: 0, assignedTo: "u_rommy", tags: ["Matriculado"], status: "closed", pipelineStage: "matriculado" },
  { id: "conv_3", contactId: "c_3", contactName: "Sofía Torres", contactInitials: "ST", contactAvatarColor: "#10b981", channel: "whatsapp", lastMessage: "Me interesa el horario de sábados.", lastTimestamp: now() - 1800000, unread: 1, assignedTo: "u_carolina", tags: ["Seguimiento"], status: "pending", pipelineStage: "seguimiento" },
];

const messages: Record<string, CrmMessage[]> = {
  conv_1: [
    { id: "m_1", conversationId: "conv_1", senderId: "c_1", direction: "inbound", text: "Hola, vi el anuncio del curso.", timestamp: now() - 7200000, status: "read", contentType: "text" },
    { id: "m_2", conversationId: "conv_1", senderId: "u_laura", direction: "outbound", text: "¡Hola María! Claro, te cuento.", timestamp: now() - 7140000, status: "read", contentType: "text" },
    { id: "m_3", conversationId: "conv_1", senderId: "c_1", direction: "inbound", text: "¿Cuánto cuesta el curso?", timestamp: now() - 3600000, status: "delivered", contentType: "text" },
  ],
  conv_2: [
    { id: "m_4", conversationId: "conv_2", senderId: "c_2", direction: "inbound", text: "Quiero matricularme.", timestamp: now() - 9000000, status: "read", contentType: "text" },
    { id: "m_5", conversationId: "conv_2", senderId: "u_rommy", direction: "outbound", text: "Perfecto, te paso los datos.", timestamp: now() - 8880000, status: "read", contentType: "text" },
    { id: "m_6", conversationId: "conv_2", senderId: "c_2", direction: "inbound", text: "Listo, ya aboné.", timestamp: now() - 7200000, status: "read", contentType: "text" },
  ],
  conv_3: [
    { id: "m_7", conversationId: "conv_3", senderId: "c_3", direction: "inbound", text: "Me interesa el horario de sábados.", timestamp: now() - 1800000, status: "delivered", contentType: "text" },
  ],
};

const templates: MessageTemplate[] = [
  { id: "tpl_1", name: "Bienvenida", body: "Hola {{1}}, bienvenida a la academia. ¿En qué te puedo ayudar?", category: "marketing", variables: 1 },
  { id: "tpl_2", name: "Seguimiento", body: "Hola {{1}}, te escribo para darte seguimiento sobre el curso de {{2}}.", category: "utility", variables: 2 },
];

const matriculas: Matricula[] = [
  { id: "mt_seed_1", contactId: "c_2", contactName: "Lucía Ramírez", contactPhone: "+51922222222", firstName: "Lucía", lastName: "Ramírez", area: "Uñas", areaId: "a_2", total: 1500, abono: 1500, pendiente: 0, paymentMethod: "yape", date: now() - 86400000 * 9, status: "matriculado", assignedTo: "u_rommy", programId: "p_2", createdAt: now() - 86400000 * 9, updatedAt: now() - 86400000 * 9 },
  { id: "mt_seed_2", contactId: "c_5", contactName: "Daniela Ríos", contactPhone: "+51955555555", firstName: "Daniela", lastName: "Ríos", area: "Lashista", areaId: "a_4", total: 1200, abono: 600, pendiente: 600, paymentMethod: "transferencia", date: now() - 86400000 * 14, status: "matriculado", assignedTo: "u_jenny", programId: "p_4", createdAt: now() - 86400000 * 14, updatedAt: now() - 86400000 * 14 },
];

const calls: CallRecord[] = [
  { id: "cl_seed_1", contactId: "c_1", contactName: "María González", ghlUserId: "u_laura", userName: "Laura", number: "+51911111111", direction: "outbound", status: "completed", startedAt: now() - 86400000, connectedAt: now() - 86400000 + 8000, endedAt: now() - 86400000 + 522000, duration: 522, effectiveDuration: 514, providerCallId: "prov_seed_1", createdAt: now() - 86400000, updatedAt: now() - 86400000 },
  { id: "cl_seed_2", contactId: "c_3", contactName: "Sofía Torres", ghlUserId: "u_carolina", userName: "Carolina", number: "+51933333333", direction: "outbound", status: "missed", startedAt: now() - 43200000, duration: 0, providerCallId: "prov_seed_2", createdAt: now() - 43200000, updatedAt: now() - 43200000 },
];

const areas: StudyArea[] = [
  { id: "a_1", name: "Cosmetología", active: true, order: 1 },
  { id: "a_2", name: "Uñas", active: true, order: 2 },
  { id: "a_3", name: "Maquillaje", active: true, order: 3 },
  { id: "a_4", name: "Lashista", active: true, order: 4 },
];

const programs: Program[] = [
  { id: "p_1", areaId: "a_1", name: "Cosmetología Profesional", active: true, order: 1 },
  { id: "p_2", areaId: "a_2", name: "Manicura Profesional", active: true, order: 1 },
  { id: "p_3", areaId: "a_3", name: "Maquillaje Social", active: true, order: 1 },
  { id: "p_4", areaId: "a_4", name: "Extensión de Pestañas", active: true, order: 1 },
];

const customFields: CustomField[] = [
  { id: "cf_1", name: "Ciudad", key: "ciudad", type: "TEXT", required: false, active: true, order: 1, placeholder: "Ciudad de residencia" },
  { id: "cf_2", name: "Instagram", key: "instagram", type: "TEXT", required: false, active: true, order: 2, placeholder: "@usuario" },
];

const quickReplies: QuickReply[] = [
  { id: "qr_1", name: "Saludo", content: "Hola {{contact.firstName}}, ¿cómo estás?", category: "general", active: true, updatedAt: now() },
  { id: "qr_2", name: "Horarios", content: "Nuestros horarios son: lun-vie 9-18h, sáb 9-14h.", category: "info", active: true, updatedAt: now() },
];

const followUps: FollowUp[] = [
  { id: "fu_1", contactId: "c_1", contactName: "María González", ghlUserId: "u_laura", dueAt: now() + 86400000, reason: "Enviar horarios", status: "pending", type: "whatsapp" },
];

const scheduledMessages: ScheduledMessage[] = [];

const notes: ContactNote[] = [
  { id: "nt_1", contactId: "c_1", ghlUserId: "u_laura", text: "Interesada en turno mañana.", createdAt: now() - 86400000 },
];

const timeline: TimelineEvent[] = [
  { id: "tl_1", contactId: "c_1", type: "contact_created", timestamp: now() - 86400000 * 5, title: "Contacto creado", ghlUserId: "u_laura" },
  { id: "tl_2", contactId: "c_1", type: "message_received", timestamp: now() - 7200000, title: "Mensaje recibido", ghlUserId: "u_laura" },
];

const calendars: Calendar[] = [
  { id: "cal_1", name: "Calendario Laura", assignedTo: "u_laura", active: true, timezone: "America/Lima", providerCalendarId: "ghl_cal_1" },
  { id: "cal_2", name: "Calendario General", assignedTo: null, active: true, timezone: "America/Lima", providerCalendarId: "ghl_cal_2" },
];

const slots: TimeSlot[] = Array.from({ length: 6 }).map((_, i) => ({
  id: `slot_${i}`, calendarId: "cal_1", start: now() + 86400000 + i * 3600000, end: now() + 86400000 + i * 3600000 + 1800000, available: true, providerSlotId: `ghl_slot_${i}`,
}));

const appointments: Appointment[] = [];

const DEFAULT_CURRENCY: CurrencyConfig = {
  currencyCode: "PEN", currencySymbol: "S/", currencyName: "Sol peruano",
  decimalDigits: 2, decimalSeparator: ".", thousandsSeparator: ",", position: "before",
};

let appConfig: AppConfig = { appName: "BeautyCRM AI", currency: { ...DEFAULT_CURRENCY } };

const integrationConfigs = new Map<string, IntegrationConfig>();
integrationConfigs.set("default", { hasToken: false, locationId: null, persisted: false });

// ── Helpers ─────────────────────────────────────────────────────────────

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { data: slice, total: items.length, page, pageSize, hasMore: start + pageSize < items.length };
}

function addTimeline(contactId: string, type: TimelineEvent["type"], title: string, ghlUserId?: string) {
  timeline.push({ id: id("tl"), contactId, type, timestamp: now(), title, ghlUserId });
}

// ── Provider ─────────────────────────────────────────────────────────────

export class MockProvider implements CrmProvider {
  // Users / Location
  async listUsers() { return users.filter((u) => u.active); }
  async getUser(_t: string, ghlUserId: string) { return users.find((u) => u.ghlUserId === ghlUserId) ?? null; }
  async getUserProfile(_t: string, ghlUserId: string) { return profiles[ghlUserId] ?? profiles[users[0].ghlUserId] ?? null; }
  async updateUserProfile(_t: string, ghlUserId: string, updates: Partial<UserProfile>) {
    const p = profiles[ghlUserId] ?? (profiles[ghlUserId] = profiles[users[0].ghlUserId]);
    profiles[ghlUserId] = { ...p, ...updates };
    return profiles[ghlUserId];
  }
  async getLocation() { return location; }
  async createUser(_t: string, data: { name: string; email: string; phone?: string; role: Role }) {
    const ghlUserId = id("u");
    const colors = ["#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#6366f1"];
    const initials = data.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const u: CrmUser = {
      ghlUserId, name: data.name, email: data.email, phone: data.phone,
      avatarColor: colors[users.length % colors.length], initials,
      role: data.role, active: true, locationId: location.id,
      source: "salesos", syncStatus: "synced", lastSyncedAt: now(),
    };
    users.push(u);
    profiles[ghlUserId] = {
      ghlUserId, preferredTheme: "dark", appearance: "moderno", favoriteColor: u.avatarColor,
      language: "es", timezone: "America/Lima", monthlyGoal: 20000, commissionPercentage: 10,
      gamificationLevel: "BASE",
      notificationPreferences: { newMessages: true, newLeads: true, matriculas: true, calls: true },
    };
    return u;
  }
  async updateUser(_t: string, ghlUserId: string, updates: Partial<Pick<CrmUser, "name" | "email" | "phone" | "role">>) {
    const u = users.find((x) => x.ghlUserId === ghlUserId);
    if (!u) throw new ApiError("NOT_FOUND", "Usuario no encontrado");
    Object.assign(u, updates, { lastSyncedAt: now() });
    return u;
  }
  async disableUser(_t: string, ghlUserId: string) {
    const u = users.find((x) => x.ghlUserId === ghlUserId);
    if (!u) throw new ApiError("NOT_FOUND", "Usuario no encontrado");
    u.active = false; u.syncStatus = "disabled"; u.lastSyncedAt = now();
    return u;
  }
  async syncUsers(_t: string) {
    // Idempotent sync: all seeded users are already present. Mark synced.
    let created = 0, updated = 0, unchanged = 0, errors = 0;
    for (const u of users) {
      if (!u.source) { u.source = "highlevel"; u.syncStatus = "synced"; u.lastSyncedAt = now(); updated++; }
      else { u.syncStatus = "synced"; u.lastSyncedAt = now(); unchanged++; }
    }
    return { total: users.length, created, updated, unchanged, errors, lastSyncAt: now() };
  }

  // Contacts
  async listContacts(_t: string, p: ListParams) {
    let items = [...contacts];
    if (p.assignedTo && p.assignedTo !== "all") items = items.filter((c) => c.assignedTo === p.assignedTo);
    if (p.area && p.area !== "all") items = items.filter((c) => c.area === p.area);
    if (p.programId && p.programId !== "all") { const prog = programs.find((x) => x.id === p.programId); if (prog) items = items.filter((c) => c.area === prog.name); }
    if (p.tag && p.tag !== "all") items = items.filter((c) => c.tags.includes(p.tag!));
    if (p.matriculated !== undefined) items = items.filter((c) => c.matriculated === p.matriculated);
    if (p.search) { const q = p.search.toLowerCase(); items = items.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q)); }
    return paginate(items, p.page ?? 1, p.pageSize ?? 25);
  }
  async getContact(_t: string, contactId: string) { return contacts.find((c) => c.id === contactId) ?? null; }
  async updateContactOwner(_t: string, contactId: string, ghlUserId: string) {
    const c = contacts.find((x) => x.id === contactId);
    if (c) { c.assignedTo = ghlUserId; addTimeline(contactId, "owner_changed", `Propietario cambiado`, ghlUserId); }
    return c!;
  }
  async updateContactTags(_t: string, contactId: string, tags: string[]) {
    const c = contacts.find((x) => x.id === contactId);
    if (c) { c.tags = tags; c.matriculated = tags.some((t) => t.toLowerCase() === "matriculado"); addTimeline(contactId, "tag_added", "Etiquetas actualizadas"); }
    return c!;
  }

  // Conversations / Messages
  async listConversations(_t: string, p: ListParams) {
    let items = [...conversations];
    if (p.assignedTo && p.assignedTo !== "all") items = items.filter((c) => c.assignedTo === p.assignedTo);
    if (p.channel && p.channel !== "all") items = items.filter((c) => c.channel === p.channel);
    if (p.status && p.status !== "all") items = items.filter((c) => c.status === p.status);
    if (p.search) { const q = p.search.toLowerCase(); items = items.filter((c) => c.contactName.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)); }
    if (p.unreadOnly) items = items.filter((c) => c.unread > 0);
    if (p.assignedFilter === "assigned") items = items.filter((c) => c.assignedTo !== null);
    if (p.assignedFilter === "unassigned") items = items.filter((c) => c.assignedTo === null);
    if (p.tag && p.tag !== "all") items = items.filter((c) => c.tags.includes(p.tag!));
    return paginate(items, p.page ?? 1, p.pageSize ?? 25);
  }
  async getConversation(_t: string, conversationId: string) { return conversations.find((c) => c.id === conversationId) ?? null; }
  async getConversationMessages(_t: string, conversationId: string, page: number, pageSize: number) {
    const all = messages[conversationId] ?? [];
    return paginate(all, page, pageSize);
  }
  async sendMessage(_t: string, conversationId: string, payload: { text: string; ghlUserId: string; visibility?: "external" | "internal"; attachment?: { url: string; contentType: string; fileName: string } }) {
    const msg: CrmMessage = { id: id("m"), conversationId, senderId: payload.ghlUserId, direction: "outbound", text: payload.text, timestamp: now(), status: "sent", contentType: payload.attachment ? "image" : "text", visibility: payload.visibility ?? "external" };
    (messages[conversationId] ??= []).push(msg);
    const conv = conversations.find((c) => c.id === conversationId);
    if (conv) { conv.lastMessage = msg.text; conv.lastTimestamp = now(); conv.unread = 0; }
    const c = conversations.find((x) => x.id === conversationId);
    if (c) addTimeline(c.contactId, "message_sent", "Mensaje enviado", payload.ghlUserId);
    return msg;
  }
  async sendTemplate(_t: string, conversationId: string, payload: { templateId: string; variables: string[]; ghlUserId: string }) {
    const tpl = templates.find((x) => x.id === payload.templateId);
    let body = tpl?.body ?? "";
    payload.variables.forEach((v, i) => { body = body.replace(`{{${i + 1}}}`, v); });
    const msg: CrmMessage = { id: id("m"), conversationId, senderId: payload.ghlUserId, direction: "outbound", text: body, timestamp: now(), status: "sent", contentType: "template" };
    (messages[conversationId] ??= []).push(msg);
    return msg;
  }
  async getTemplates() { return templates; }
  async updateConversationTags(_t: string, conversationId: string, tags: string[]) {
    const c = conversations.find((x) => x.id === conversationId);
    if (c) c.tags = tags;
    return c!;
  }
  async updateConversationPipeline(_t: string, conversationId: string, stage: PipelineStage) {
    const c = conversations.find((x) => x.id === conversationId);
    if (c) { c.pipelineStage = stage; addTimeline(c.contactId, "stage_changed", `Etapa: ${stage}`); }
    return c!;
  }
  async markConversationRead(_t: string, conversationId: string) {
    const c = conversations.find((x) => x.id === conversationId);
    if (c) c.unread = 0;
  }
  async getConversationByContact(_t: string, contactId: string) {
    return conversations.filter((c) => c.contactId === contactId).sort((a, b) => b.lastTimestamp - a.lastTimestamp)[0] ?? null;
  }

  // Matrículas
  async listMatriculas(_t: string, assignedTo?: string) {
    let items = [...matriculas];
    if (assignedTo && assignedTo !== "all") items = items.filter((m) => m.assignedTo === assignedTo);
    return items;
  }
  async getMatricula(_t: string, mid: string) { return matriculas.find((m) => m.id === mid) ?? null; }
  async getMatriculaByContact(_t: string, contactId: string) { return matriculas.find((m) => m.contactId === contactId && m.status !== "anulado") ?? null; }
  async createMatricula(_t: string, data: Omit<Matricula, "id" | "pendiente">) {
    const existing = matriculas.find((m) => m.contactId === data.contactId && m.status !== "anulado");
    if (existing) throw new ApiError("MATRICULA_ALREADY_EXISTS", "Este contacto ya tiene una matrícula registrada.", { code: MATRICULA_DUPLICATE_CODE });
    const m: Matricula = { ...data, id: id("mt"), pendiente: Math.max(0, data.total - data.abono), createdAt: now(), updatedAt: now() };
    matriculas.push(m);
    const c = contacts.find((x) => x.id === data.contactId);
    if (c) { c.matriculated = true; c.matriculaId = m.id; c.pipelineStage = "matriculado"; if (!c.tags.some((t) => t.toLowerCase() === "matriculado")) c.tags = [...c.tags, "matriculado"]; }
    addTimeline(data.contactId, "matricula_created", "Matrícula creada", data.assignedTo);
    return m;
  }
  async cancelMatricula(_t: string, mid: string) {
    const m = matriculas.find((x) => x.id === mid);
    if (m) {
      m.status = "anulado"; m.updatedAt = now();
      // Only revert the matriculated state if NO other active matrícula exists
      // for the same contact (business rule: tag stays while any active matrícula remains).
      const otherActive = matriculas.some((x) => x.contactId === m.contactId && x.id !== m.id && x.status !== "anulado");
      const c = contacts.find((x) => x.id === m.contactId);
      if (c && !otherActive) { c.matriculated = false; c.matriculaId = undefined; c.tags = c.tags.filter((t) => t.toLowerCase() !== "matriculado"); }
      addTimeline(m.contactId, "matricula_revoked", "Matrícula anulada");
    }
    return m!;
  }
  async removeMatricula(_t: string, mid: string) {
    const idx = matriculas.findIndex((m) => m.id === mid);
    if (idx >= 0) {
      const m = matriculas[idx];
      const otherActive = matriculas.some((x) => x.contactId === m.contactId && x.id !== m.id && x.status !== "anulado");
      const c = contacts.find((x) => x.id === m.contactId);
      if (c && !otherActive) { c.matriculated = false; c.matriculaId = undefined; c.tags = c.tags.filter((t) => t.toLowerCase() !== "matriculado"); }
      matriculas.splice(idx, 1);
    }
  }

  // Calls
  async listCalls(_t: string, p: ListParams) {
    let items = [...calls];
    if (p.assignedTo && p.assignedTo !== "all") items = items.filter((c) => c.ghlUserId === p.assignedTo);
    if (p.status && p.status !== "all") items = items.filter((c) => c.status === p.status);
    if (p.direction && p.direction !== "all") items = items.filter((c) => c.direction === p.direction);
    if (p.contactId) items = items.filter((c) => c.contactId === p.contactId);
    if (p.search) { const q = p.search.toLowerCase(); items = items.filter((c) => c.contactName.toLowerCase().includes(q) || c.number.includes(q)); }
    items.sort((a, b) => b.startedAt - a.startedAt);
    return paginate(items, p.page ?? 1, p.pageSize ?? 25);
  }
  async getCall(_t: string, cid: string) { return calls.find((c) => c.id === cid) ?? null; }
  async listCallsByContact(_t: string, contactId: string) { return calls.filter((c) => c.contactId === contactId).sort((a, b) => b.startedAt - a.startedAt); }
  async startCall(_t: string, contactId: string, number: string, ghlUserId: string) {
    const c = contacts.find((x) => x.id === contactId);
    const u = users.find((x) => x.ghlUserId === ghlUserId);
    const call: CallRecord = { id: id("cl"), contactId, contactName: c?.name ?? "Desconocido", ghlUserId, userName: u?.name ?? "Desconocido", number, direction: "outbound", status: "initiated", startedAt: now(), duration: 0, providerCallId: `prov_${now()}`, createdAt: now(), updatedAt: now() };
    calls.push(call);
    return call;
  }
  async answerCall(_t: string, cid: string) { const c = calls.find((x) => x.id === cid); if (c) { c.status = "answered"; c.connectedAt = now(); c.updatedAt = now(); } return c!; }
  async completeCall(_t: string, cid: string, finalStatus: CallRecord["status"]) {
    const c = calls.find((x) => x.id === cid); if (c) { const t = now(); c.endedAt = t; c.updatedAt = t; if (finalStatus === "completed" && c.connectedAt) { c.status = "completed"; c.effectiveDuration = Math.round((t - c.connectedAt) / 1000); c.duration = Math.round((t - c.startedAt) / 1000); } else { c.status = finalStatus; c.duration = Math.round((t - c.startedAt) / 1000); } } return c!;
  }
  async requestTranscription(_t: string, cid: string) { const c = calls.find((x) => x.id === cid); if (c) { c.transcriptStatus = "processing"; c.aiStatus = "none"; c.updatedAt = now(); } return c!; }
  async requestAnalysis(_t: string, cid: string) { const c = calls.find((x) => x.id === cid); if (c) { c.aiStatus = "processing"; c.transcriptStatus = c.transcriptStatus ?? "processing"; c.updatedAt = now(); } return c!; }
  async getCallAnalysisStatus(_t: string, cid: string) {
    const c = calls.find((x) => x.id === cid);
    if (c && c.aiStatus === "processing") { const elapsed = now() - (c.updatedAt ?? c.startedAt); if (elapsed > 2500) { c.aiStatus = "ready"; c.transcriptStatus = "ready"; if (!c.aiAnalysis) { c.aiAnalysis = { summary: "Llamada atendida. Interés inicial.", keyPoints: ["Interés inicial"], need: "Información del programa", interestedProgram: null, objections: [{ type: "no_listo", severity: "media", detail: "Pidió tiempo." }], budgetMentioned: null, availability: "Por confirmar", nextStep: "Seguimiento en 48h.", closeProbability: 45, strengths: ["Atendió rápido"], weakPoints: ["No fijó próximo paso"], recommendations: "Agendar seguimiento.", score: 55 }; c.aiAnalysisHash = `h_${c.id}`; } } }
    return c!;
  }

  // Achievements / Dashboard
  async getAchievement(_t: string, ghlUserId: string) {
    const count = matriculas.filter((m) => m.assignedTo === ghlUserId && m.status !== "anulado").length;
    const total = matriculas.filter((m) => m.assignedTo === ghlUserId && m.status !== "anulado").reduce((s, m) => s + m.total, 0);
    return { level: count >= 10 ? "ORO" : count >= 5 ? "PLATA" : count >= 1 ? "BRONCE" : "BASE", matriculas: count, commissionBase: Math.round(total * 0.1), bonus: 0, totalEarned: Math.round(total * 0.1), progress: (count % 5) * 20, nextLevel: count >= 10 ? null : "PLATA", rank: 1 };
  }
  async getDashboardMetrics(_t: string, assignedTo?: string) {
    const advisors = users.filter((u) => u.role === "advisor");
    const revenueByAdvisor = advisors.map((a, i) => ({ name: a.name, ghlUserId: a.ghlUserId, revenue: [4100, 2600, 1600, 2250, 1250][i] ?? 1000 }));
    return {
      salesToday: 1200, salesWeek: 5400, salesMonth: 18500, matriculasCount: matriculas.length, commissions: 925, bonuses: 200, billing: 18500, conversationsCount: conversations.length, avgResponseTime: 186, callsCount: calls.length, conversionRate: 32,
      revenueByAdvisor: assignedTo && assignedTo !== "all" ? revenueByAdvisor.filter((r) => r.ghlUserId === assignedTo) : revenueByAdvisor,
      revenueHistory: [{ month: "Mar", current: 12000, previous: 10000 }, { month: "Abr", current: 14500, previous: 13000 }, { month: "May", current: 16800, previous: 14200 }, { month: "Jun", current: 18500, previous: 16000 }],
    };
  }

  /**
   * Server-side response-time aggregation. Computes first-response times from
   * real message timestamps (customer message → first advisor reply), per the
   * domain rule. Avoids shipping all messages to the client.
   */
  async getResponseTimeAnalytics(_t: string, params: { from?: number; to?: number; advisorId?: string }) {
    const from = params.from ?? 0;
    const to = params.to ?? Date.now();
    const advisorFilter = params.advisorId && params.advisorId !== "all" ? params.advisorId : undefined;

    // Collect all response intervals across conversations in range.
    const intervals: number[] = [];
    const byAdvisorMap = new Map<string, { answered: number; pending: number; unanswered: number; times: number[]; min: number; max: number }>();

    for (const conv of conversations) {
      if (advisorFilter && conv.assignedTo !== advisorFilter) continue;
      const msgs = (messages[conv.id] ?? [])
        .filter((m) => m.timestamp >= from && m.timestamp <= to)
        .sort((a, b) => a.timestamp - b.timestamp);

      let pendingCustomerMsg: CrmMessage | null = null;
      let hadCustomerInPeriod = false;
      let hadReply = false;
      const owner = conv.assignedTo ?? "unassigned";
      if (!byAdvisorMap.has(owner)) byAdvisorMap.set(owner, { answered: 0, pending: 0, unanswered: 0, times: [], min: Infinity, max: 0 });

      for (const m of msgs) {
        if (m.direction === "inbound" && m.visibility !== "internal") {
          if (!pendingCustomerMsg) pendingCustomerMsg = m;
          hadCustomerInPeriod = true;
        } else if (m.direction === "outbound" && m.visibility !== "internal" && pendingCustomerMsg) {
          // First advisor reply to the pending customer message.
          const rt = Math.round((m.timestamp - pendingCustomerMsg.timestamp) / 1000);
          if (rt >= 0) {
            intervals.push(rt);
            const a = byAdvisorMap.get(owner)!;
            a.times.push(rt);
            a.min = Math.min(a.min, rt);
            a.max = Math.max(a.max, rt);
            a.answered++;
          }
          pendingCustomerMsg = null;
          hadReply = true;
        }
      }

      // After processing, if a customer message is still pending → pending.
      if (pendingCustomerMsg) {
        byAdvisorMap.get(owner)!.pending++;
      } else if (hadCustomerInPeriod && !hadReply) {
        byAdvisorMap.get(owner)!.unanswered++;
      }
    }

    const avg = intervals.length ? Math.round(intervals.reduce((s, x) => s + x, 0) / intervals.length) : 0;
    const min = intervals.length ? Math.min(...intervals) : 0;
    const max = intervals.length ? Math.max(...intervals) : 0;
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    const byAdvisor = Array.from(byAdvisorMap.entries()).map(([ghlUserId, a]) => {
      const u = users.find((x) => x.ghlUserId === ghlUserId);
      return {
        ghlUserId,
        name: u?.name ?? ghlUserId,
        answered: a.answered,
        pending: a.pending,
        unanswered: a.unanswered,
        avgSeconds: a.times.length ? Math.round(a.times.reduce((s, x) => s + x, 0) / a.times.length) : 0,
        minSeconds: a.times.length ? a.min : 0,
        maxSeconds: a.times.length ? a.max : 0,
      };
    });

    return {
      summary: {
        avgSeconds: avg,
        minSeconds: min,
        maxSeconds: max,
        medianSeconds: median,
        answered: intervals.length,
        pending: byAdvisor.reduce((s, a) => s + a.pending, 0),
        unanswered: byAdvisor.reduce((s, a) => s + a.unanswered, 0),
      },
      byAdvisor,
    };
  }

  /**
   * Server-side conversion analytics (Fase 9.1). Mirrors the frontend domain
   * engine so the contract is identical when USE_MOCK flips to real backend.
   * Conversion = active matrícula (status !== "anulado").
   */
  async getConversionAnalytics(_t: string, params: { from?: number; to?: number; advisorId?: string }) {
    const from = params.from ?? 0;
    const to = params.to ?? Date.now();
    const advisorFilter = params.advisorId && params.advisorId !== "all" ? params.advisorId : undefined;

    const scopedContacts = advisorFilter
      ? contacts.filter((c) => c.assignedTo === advisorFilter)
      : contacts;
    const scopedMatriculas = advisorFilter
      ? matriculas.filter((m) => m.assignedTo === advisorFilter)
      : matriculas;

    const incoming = scopedContacts.filter(
      (c) => c.createdAt >= from && c.createdAt <= to,
    );
    const convertedContactIds = new Set(
      scopedMatriculas.filter((m) => m.status !== "anulado").map((m) => m.contactId),
    );
    const convertedAdvisorByContact = new Map<string, string>();
    for (const m of scopedMatriculas) {
      if (m.status !== "anulado") convertedAdvisorByContact.set(m.contactId, m.assignedTo);
    }

    const totalIncomingLeads = incoming.length;
    const totalAssignedLeads = incoming.filter((c) => c.assignedTo !== null).length;
    const totalUnassignedLeads = Math.max(0, totalIncomingLeads - totalAssignedLeads);
    const totalConvertedLeads = incoming.filter((c) => convertedContactIds.has(c.id)).length;
    const safeRate = (n: number, d: number) => (d <= 0 ? 0 : Math.round((n / d) * 1000) / 10);

    const advisors = users
      .filter((u) => u.role === "advisor" && u.active)
      .map((u) => {
        const received = incoming.filter((c) => c.assignedTo === u.ghlUserId).length;
        const converted = incoming.filter(
          (c) => c.assignedTo === u.ghlUserId && convertedAdvisorByContact.get(c.id) === u.ghlUserId,
        ).length;
        return {
          ghlUserId: u.ghlUserId,
          name: u.name,
          received,
          converted,
          conversionRate: safeRate(converted, received),
        };
      })
      .filter((a) => a.received > 0)
      .sort((a, b) => b.conversionRate - a.conversionRate);

    return {
      totalIncomingLeads,
      totalAssignedLeads,
      totalUnassignedLeads,
      totalConvertedLeads,
      conversionRate: safeRate(totalConvertedLeads, totalIncomingLeads),
      assignedRate: safeRate(totalAssignedLeads, totalIncomingLeads),
      convertedOfAssignedRate: safeRate(totalConvertedLeads, totalAssignedLeads),
      advisors,
    };
  }

  // Integration
  async getIntegrationState(_t: string) { const cfg = integrationConfigs.get("default")!; return { status: cfg.hasToken ? "connected" : "disconnected", locationId: cfg.locationId, locationName: location.name, lastSyncAt: cfg.hasToken ? now() : null, syncedUsers: users.length, syncedContacts: contacts.length, syncedConversations: conversations.length, connectedPhone: location.phone ?? null } as IntegrationState; }
  async connectIntegration(t: string) { return this.getIntegrationState(t); }
  async testIntegration(t: string) { return { ok: true, message: "Conexión exitosa" }; }
  async syncIntegration(t: string) { return this.getIntegrationState(t); }
  async disconnectIntegration(t: string) { const cfg = integrationConfigs.get("default")!; integrationConfigs.set("default", { hasToken: false, locationId: null, persisted: false }); return this.getIntegrationState(t); }
  async getIntegrationConfig(_t: string) { return integrationConfigs.get("default")!; }
  async saveIntegrationConfig(_t: string, token: string, locationId: string) { const cfg: IntegrationConfig = { hasToken: !!token, tokenLast4: token ? token.slice(-4) : undefined, locationId: locationId || null, persisted: true }; integrationConfigs.set("default", cfg); return cfg; }
  async clearIntegrationConfig(_t: string) { integrationConfigs.set("default", { hasToken: false, locationId: null, persisted: false }); return integrationConfigs.get("default")!; }

  // Areas / Programs / Custom fields / Quick replies
  async listAreas() { return [...areas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
  async createArea(_t: string, name: string) { const a: StudyArea = { id: id("a"), name, active: true, order: areas.length + 1 }; areas.push(a); return a; }
  async updateArea(_t: string, aid: string, updates: Partial<StudyArea>) { const a = areas.find((x) => x.id === aid); if (a) Object.assign(a, updates); return a!; }
  async removeArea(_t: string, aid: string) { const idx = areas.findIndex((x) => x.id === aid); if (idx >= 0) areas.splice(idx, 1); }
  async listPrograms() { return [...programs]; }
  async listProgramsByArea(_t: string, areaId: string) { return programs.filter((p) => p.areaId === areaId); }
  async createProgram(_t: string, data: Omit<Program, "id">) { const p: Program = { ...data, id: id("p") }; programs.push(p); return p; }
  async updateProgram(_t: string, pid: string, updates: Partial<Program>) { const p = programs.find((x) => x.id === pid); if (p) Object.assign(p, updates); return p!; }
  async removeProgram(_t: string, pid: string) { const idx = programs.findIndex((x) => x.id === pid); if (idx >= 0) programs.splice(idx, 1); }
  async listCustomFields() { return [...customFields].sort((a, b) => a.order - b.order); }
  async createCustomField(_t: string, data: Omit<CustomField, "id">) { const f: CustomField = { ...data, id: id("cf") }; customFields.push(f); return f; }
  async updateCustomField(_t: string, fid: string, updates: Partial<CustomField>) { const f = customFields.find((x) => x.id === fid); if (f) Object.assign(f, updates); return f!; }
  async removeCustomField(_t: string, fid: string) { const idx = customFields.findIndex((x) => x.id === fid); if (idx >= 0) customFields.splice(idx, 1); }
  async listQuickReplies() { return quickReplies.filter((q) => q.active); }
  async createQuickReply(_t: string, data: Omit<QuickReply, "id" | "updatedAt">) { const q: QuickReply = { ...data, id: id("qr"), updatedAt: now() }; quickReplies.push(q); return q; }
  async updateQuickReply(_t: string, qid: string, updates: Partial<QuickReply>) { const q = quickReplies.find((x) => x.id === qid); if (q) Object.assign(q, updates, { updatedAt: now() }); return q!; }
  async removeQuickReply(_t: string, qid: string) { const idx = quickReplies.findIndex((x) => x.id === qid); if (idx >= 0) quickReplies.splice(idx, 1); }

  // Follow-ups / Notes / Timeline
  async listFollowUps(_t: string, assignedTo?: string) { let items = [...followUps]; if (assignedTo && assignedTo !== "all") items = items.filter((f) => f.ghlUserId === assignedTo); return items; }
  async listFollowUpsByContact(_t: string, contactId: string) { return followUps.filter((f) => f.contactId === contactId); }
  async getFollowUp(_t: string, fid: string) { return followUps.find((f) => f.id === fid) ?? null; }
  async createFollowUp(_t: string, data: Omit<FollowUp, "id" | "status">) { const f: FollowUp = { ...data, id: id("fu"), status: "pending" }; followUps.push(f); addTimeline(data.contactId, "followup_created", "Seguimiento creado", data.ghlUserId); return f; }
  async updateFollowUp(_t: string, fid: string, updates: Partial<FollowUp>) { const f = followUps.find((x) => x.id === fid); if (f) Object.assign(f, updates); return f!; }
  async updateFollowUpStatus(_t: string, fid: string, status: FollowUp["status"]) { const f = followUps.find((x) => x.id === fid); if (f) { f.status = status; if (status === "completed") addTimeline(f.contactId, "followup_completed", "Seguimiento completado"); } return f!; }
  async removeFollowUp(_t: string, fid: string) { const idx = followUps.findIndex((x) => x.id === fid); if (idx >= 0) followUps.splice(idx, 1); }
  async listNotesByContact(_t: string, contactId: string) { return notes.filter((n) => n.contactId === contactId).sort((a, b) => b.createdAt - a.createdAt); }
  async createNote(_t: string, contactId: string, ghlUserId: string, text: string) { const n: ContactNote = { id: id("nt"), contactId, ghlUserId, text, createdAt: now() }; notes.push(n); return n; }
  async listTimelineByContact(_t: string, contactId: string) { return timeline.filter((t) => t.contactId === contactId).sort((a, b) => b.timestamp - a.timestamp); }

  // Scheduled messages
  async listScheduledByConversation(_t: string, conversationId: string) { return scheduledMessages.filter((s) => s.conversationId === conversationId && s.status === "scheduled"); }
  async getScheduledMessage(_t: string, sid: string) { return scheduledMessages.find((s) => s.id === sid) ?? null; }
  async createScheduledMessage(_t: string, data: Omit<ScheduledMessage, "id" | "status" | "createdAt" | "updatedAt">) { const s: ScheduledMessage = { ...data, id: id("sm"), status: "scheduled", createdAt: now(), updatedAt: now() }; scheduledMessages.push(s); const c = conversations.find((x) => x.id === data.conversationId); if (c) addTimeline(c.contactId, "message_scheduled", "Mensaje programado", data.advisorUserId); return s; }
  async updateScheduledMessage(_t: string, sid: string, updates: Partial<Pick<ScheduledMessage, "message" | "scheduledAt">>) { const s = scheduledMessages.find((x) => x.id === sid); if (s) Object.assign(s, updates, { updatedAt: now() }); return s!; }
  async cancelScheduledMessage(_t: string, sid: string) { const s = scheduledMessages.find((x) => x.id === sid); if (s) { s.status = "cancelled"; s.updatedAt = now(); } }
  async listDueScheduledMessages(_t: string, before: number) { return scheduledMessages.filter((s) => s.status === "scheduled" && s.scheduledAt <= before); }
  async markScheduledMessage(_t: string, sid: string, status: ScheduledMessage["status"]) { const s = scheduledMessages.find((x) => x.id === sid); if (s) { s.status = status; s.updatedAt = now(); } }

  // Calendars / Appointments
  async listCalendars(_t: string, assignedTo?: string) { let items = calendars.filter((c) => c.active); if (assignedTo && assignedTo !== "all") items = items.filter((c) => c.assignedTo === assignedTo); return items; }
  async getSlots(_t: string, calendarId: string, from: number, to: number) { return slots.filter((s) => s.calendarId === calendarId && s.start >= from && s.start < to && s.available); }
  async listAppointments(_t: string, p: ListParams) {
    let items = [...appointments];
    if (p.assignedTo && p.assignedTo !== "all") items = items.filter((a) => a.ghlUserId === p.assignedTo);
    if (p.contactId) items = items.filter((a) => a.contactId === p.contactId);
    if (p.status && p.status !== "all") items = items.filter((a) => a.status === p.status);
    if (p.from) items = items.filter((a) => a.start >= p.from!);
    if (p.to) items = items.filter((a) => a.start < p.to!);
    items.sort((a, b) => a.start - b.start);
    return paginate(items, p.page ?? 1, p.pageSize ?? 25);
  }
  async listAppointmentsByContact(_t: string, contactId: string) { return appointments.filter((a) => a.contactId === contactId).sort((a, b) => a.start - b.start); }
  async getAppointment(_t: string, aid: string) { return appointments.find((a) => a.id === aid) ?? null; }
  async bookAppointment(_t: string, data: Omit<Appointment, "id" | "createdAt" | "updatedAt">) {
    const slot = slots.find((s) => s.id === data.providerAppointmentId); if (slot) slot.available = false;
    const a: Appointment = { ...data, id: id("ap"), providerAppointmentId: data.providerAppointmentId ?? `ghl_ap_${now()}`, createdAt: now(), updatedAt: now() };
    appointments.push(a);
    return a;
  }
  async updateAppointmentStatus(_t: string, aid: string, status: AppointmentStatus) {
    const a = appointments.find((x) => x.id === aid); if (a) { a.status = status; a.updatedAt = now(); if (status === "cancelled") { const slot = slots.find((s) => s.calendarId === a.calendarId && s.start === a.start); if (slot) slot.available = true; } } return a!;
  }
  async rescheduleAppointment(_t: string, aid: string, start: number, end: number) {
    const a = appointments.find((x) => x.id === aid); if (a) { const old = slots.find((s) => s.calendarId === a.calendarId && s.start === a.start); if (old) old.available = true; a.start = start; a.end = end; a.updatedAt = now(); } return a!;
  }
  async cancelAppointment(_t: string, aid: string) { const a = appointments.find((x) => x.id === aid); if (a) { const slot = slots.find((s) => s.calendarId === a.calendarId && s.start === a.start); if (slot) slot.available = true; } const idx = appointments.findIndex((x) => x.id === aid); if (idx >= 0) appointments.splice(idx, 1); }

  // App config
  async getAppConfig(_t: string) { return { ...appConfig }; }
  async updateAppConfig(_t: string, updates: Partial<AppConfig>) { appConfig = { ...appConfig, ...updates }; return { ...appConfig }; }

  // Currency config (per-tenant, presentation only)
  async getCurrency(_t: string) { return { ...(appConfig.currency ?? DEFAULT_CURRENCY) }; }
  async updateCurrency(_t: string, config: CurrencyConfig) { appConfig = { ...appConfig, currency: { ...config } }; return { ...appConfig.currency! }; }
}

export const mockProvider = new MockProvider();
