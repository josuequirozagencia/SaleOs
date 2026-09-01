/**
 * Seed data for the MockProvider — extracted to keep mockProvider.ts under the
 * per-file line limit. All data is clearly fictitious and never persisted.
 */

import type {
  CrmUser, CrmLocation, Contact, Conversation, CrmMessage, MessageTemplate,
  Matricula, CallRecord, StudyArea, Program, CustomField, QuickReply,
  FollowUp, ScheduledMessage, ContactNote, TimelineEvent, Calendar, TimeSlot,
  Appointment, AppConfig, CurrencyConfig, Pipeline, Opportunity,
} from "../../types";

const now = () => Date.now();

export const seedUsers: CrmUser[] = [
  { ghlUserId: "u_admin", name: "Admin Global", email: "admin@demo.com", avatarColor: "#6366f1", initials: "AG", role: "super_admin", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_laura", name: "Laura", email: "laura@demo.com", avatarColor: "#ec4899", initials: "LA", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_rommy", name: "Rommy", email: "rommy@demo.com", avatarColor: "#f59e0b", initials: "RO", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_carolina", name: "Carolina", email: "carolina@demo.com", avatarColor: "#10b981", initials: "CA", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_milka", name: "Milka", email: "milka@demo.com", avatarColor: "#8b5cf6", initials: "MI", role: "advisor", active: true, locationId: "loc_demo_001" },
  { ghlUserId: "u_jenny", name: "Jenny", email: "jenny@demo.com", avatarColor: "#ef4444", initials: "JE", role: "advisor", active: true, locationId: "loc_demo_001" },
];

export const seedProfiles = Object.fromEntries(
  seedUsers.map((u) => [u.ghlUserId, { ghlUserId: u.ghlUserId, preferredTheme: "dark" as const, appearance: "moderno" as const, favoriteColor: u.avatarColor, language: "es", timezone: "America/Lima", monthlyGoal: 20000, commissionPercentage: 10, gamificationLevel: "BASE", notificationPreferences: { newMessages: true, newLeads: true, matriculas: true, calls: true } }]),
);

export const seedLocation: CrmLocation = { id: "loc_demo_001", name: "Academia Belleza Demo", phone: "+51987654321" };

export const seedContacts: Contact[] = [
  { id: "c_1", name: "María González", phone: "+51911111111", email: "maria@demo.com", city: "Lima", channel: "whatsapp", area: "Cosmetología", experience: "Básica", sede: "Sede Central", tags: ["Interesada"], assignedTo: "u_laura", createdAt: now() - 86400000 * 5, lastActivityAt: now() - 3600000, leadScore: 75, matriculated: false, avatarColor: "#ec4899", initials: "MG" },
  { id: "c_2", name: "Lucía Ramírez", phone: "+51922222222", email: "lucia@demo.com", city: "Arequipa", channel: "instagram", area: "Uñas", experience: "Intermedia", tags: ["Matriculado"], assignedTo: "u_rommy", createdAt: now() - 86400000 * 10, lastActivityAt: now() - 7200000, leadScore: 90, matriculated: true, matriculaId: "mt_seed_1", avatarColor: "#f59e0b", initials: "LR" },
  { id: "c_3", name: "Sofía Torres", phone: "+51933333333", email: "sofia@demo.com", city: "Lima", channel: "whatsapp", area: "Maquillaje", experience: "Avanzada", tags: ["Seguimiento"], assignedTo: "u_carolina", createdAt: now() - 86400000 * 3, lastActivityAt: now() - 1800000, leadScore: 60, matriculated: false, avatarColor: "#10b981", initials: "ST" },
  { id: "c_4", name: "Valeria Cruz", phone: "+51944444444", email: "valeria@demo.com", city: "Trujillo", channel: "messenger", area: "Micropigmentación", tags: [], assignedTo: "u_milka", createdAt: now() - 86400000 * 7, lastActivityAt: now() - 86400000, leadScore: 40, matriculated: false, avatarColor: "#8b5cf6", initials: "VC" },
  { id: "c_5", name: "Daniela Ríos", phone: "+51955555555", email: "daniela@demo.com", city: "Lima", channel: "whatsapp", area: "Lashista", tags: ["Matriculado"], assignedTo: "u_jenny", createdAt: now() - 86400000 * 15, lastActivityAt: now() - 86400000 * 2, leadScore: 85, matriculated: true, matriculaId: "mt_seed_2", avatarColor: "#ef4444", initials: "DR" },
];

export const seedConversations: Conversation[] = [
  { id: "conv_1", contactId: "c_1", contactName: "María González", contactInitials: "MG", contactAvatarColor: "#ec4899", channel: "whatsapp", lastMessage: "¿Cuánto cuesta el curso?", lastTimestamp: now() - 3600000, unread: 2, assignedTo: "u_laura", tags: ["Interesada"], status: "open", pipelineStage: "venta" },
  { id: "conv_2", contactId: "c_2", contactName: "Lucía Ramírez", contactInitials: "LR", contactAvatarColor: "#f59e0b", channel: "instagram", lastMessage: "Listo, ya aboné.", lastTimestamp: now() - 7200000, unread: 0, assignedTo: "u_rommy", tags: ["Matriculado"], status: "closed", pipelineStage: "matriculado" },
  { id: "conv_3", contactId: "c_3", contactName: "Sofía Torres", contactInitials: "ST", contactAvatarColor: "#10b981", channel: "whatsapp", lastMessage: "Me interesa el horario de sábados.", lastTimestamp: now() - 1800000, unread: 1, assignedTo: "u_carolina", tags: ["Seguimiento"], status: "pending", pipelineStage: "seguimiento" },
];

export const seedMessages: Record<string, CrmMessage[]> = {
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

export const seedTemplates: MessageTemplate[] = [
  { id: "tpl_1", name: "Bienvenida", body: "Hola {{1}}, bienvenida a la academia. ¿En qué te puedo ayudar?", category: "marketing", variables: 1 },
  { id: "tpl_2", name: "Seguimiento", body: "Hola {{1}}, te escribo para darte seguimiento sobre el curso de {{2}}.", category: "utility", variables: 2 },
];

export const seedMatriculas: Matricula[] = [
  { id: "mt_seed_1", contactId: "c_2", contactName: "Lucía Ramírez", contactPhone: "+51922222222", firstName: "Lucía", lastName: "Ramírez", area: "Uñas", areaId: "a_2", total: 1500, abono: 1500, pendiente: 0, paymentMethod: "yape", date: now() - 86400000 * 9, status: "matriculado", assignedTo: "u_rommy", programId: "p_2", createdAt: now() - 86400000 * 9, updatedAt: now() - 86400000 * 9 },
  { id: "mt_seed_2", contactId: "c_5", contactName: "Daniela Ríos", contactPhone: "+51955555555", firstName: "Daniela", lastName: "Ríos", area: "Lashista", areaId: "a_4", total: 1200, abono: 600, pendiente: 600, paymentMethod: "transferencia", date: now() - 86400000 * 14, status: "matriculado", assignedTo: "u_jenny", programId: "p_4", createdAt: now() - 86400000 * 14, updatedAt: now() - 86400000 * 14 },
];

export const seedCalls: CallRecord[] = [
  { id: "cl_seed_1", contactId: "c_1", contactName: "María González", ghlUserId: "u_laura", userName: "Laura", number: "+51911111111", direction: "outbound", status: "completed", startedAt: now() - 86400000, connectedAt: now() - 86400000 + 8000, endedAt: now() - 86400000 + 522000, duration: 522, effectiveDuration: 514, providerCallId: "prov_seed_1", createdAt: now() - 86400000, updatedAt: now() - 86400000 },
  { id: "cl_seed_2", contactId: "c_3", contactName: "Sofía Torres", ghlUserId: "u_carolina", userName: "Carolina", number: "+51933333333", direction: "outbound", status: "missed", startedAt: now() - 43200000, duration: 0, providerCallId: "prov_seed_2", createdAt: now() - 43200000, updatedAt: now() - 43200000 },
];

export const seedAreas: StudyArea[] = [
  { id: "a_1", name: "Cosmetología", active: true, order: 1 },
  { id: "a_2", name: "Uñas", active: true, order: 2 },
  { id: "a_3", name: "Maquillaje", active: true, order: 3 },
  { id: "a_4", name: "Lashista", active: true, order: 4 },
];

export const seedPrograms: Program[] = [
  { id: "p_1", areaId: "a_1", name: "Cosmetología Profesional", active: true, order: 1 },
  { id: "p_2", areaId: "a_2", name: "Manicura Profesional", active: true, order: 1 },
  { id: "p_3", areaId: "a_3", name: "Maquillaje Social", active: true, order: 1 },
  { id: "p_4", areaId: "a_4", name: "Extensión de Pestañas", active: true, order: 1 },
];

export const seedCustomFields: CustomField[] = [
  { id: "cf_1", name: "Ciudad", key: "ciudad", type: "TEXT", required: false, active: true, order: 1, placeholder: "Ciudad de residencia" },
  { id: "cf_2", name: "Instagram", key: "instagram", type: "TEXT", required: false, active: true, order: 2, placeholder: "@usuario" },
];

export const seedQuickReplies: QuickReply[] = [
  { id: "qr_1", name: "Saludo", content: "Hola {{contact.firstName}}, ¿cómo estás?", category: "general", active: true, updatedAt: now() },
  { id: "qr_2", name: "Horarios", content: "Nuestros horarios son: lun-vie 9-18h, sáb 9-14h.", category: "info", active: true, updatedAt: now() },
];

export const seedFollowUps: FollowUp[] = [
  { id: "fu_1", contactId: "c_1", contactName: "María González", ghlUserId: "u_laura", dueAt: now() + 86400000, reason: "Enviar horarios", status: "pending", type: "whatsapp" },
];

export const seedScheduledMessages: ScheduledMessage[] = [];
export const seedNotes: ContactNote[] = [
  { id: "nt_1", contactId: "c_1", ghlUserId: "u_laura", text: "Interesada en turno mañana.", createdAt: now() - 86400000 },
];

export const seedTimeline: TimelineEvent[] = [
  { id: "tl_1", contactId: "c_1", type: "contact_created", timestamp: now() - 86400000 * 5, title: "Contacto creado", ghlUserId: "u_laura" },
  { id: "tl_2", contactId: "c_1", type: "message_received", timestamp: now() - 7200000, title: "Mensaje recibido", ghlUserId: "u_laura" },
];

export const seedCalendars: Calendar[] = [
  { id: "cal_1", name: "Calendario Laura", assignedTo: "u_laura", active: true, timezone: "America/Lima", providerCalendarId: "ghl_cal_1" },
  { id: "cal_2", name: "Calendario General", assignedTo: null, active: true, timezone: "America/Lima", providerCalendarId: "ghl_cal_2" },
];

export const seedSlots: TimeSlot[] = Array.from({ length: 6 }).map((_, i) => ({
  id: `slot_${i}`, calendarId: "cal_1", start: now() + 86400000 + i * 3600000, end: now() + 86400000 + i * 3600000 + 1800000, available: true, providerSlotId: `ghl_slot_${i}`,
}));

export const seedAppointments: Appointment[] = [];

export const seedPipelines: Pipeline[] = [
  {
    id: "pl_1", name: "Ventas Academia", stages: [
      { id: "st_1", name: "Nuevo lead", position: 0 },
      { id: "st_2", name: "Contactado", position: 1 },
      { id: "st_3", name: "Negociación", position: 2 },
      { id: "st_4", name: "Abonado", position: 3 },
      { id: "st_5", name: "Matriculado", position: 4 },
    ],
  },
];

export const seedOpportunities: Opportunity[] = [
  { id: "op_1", name: "Curso Uñas - María", pipelineId: "pl_1", pipelineStageId: "st_1", status: "open", contactId: "c_1", contactName: "María González", monetaryValue: 1500, assignedTo: "u_laura", createdAt: now() - 86400000 * 2, updatedAt: now() - 3600000 },
  { id: "op_2", name: "Curso Lashista - Sofía", pipelineId: "pl_1", pipelineStageId: "st_3", status: "open", contactId: "c_3", contactName: "Sofía Torres", monetaryValue: 1200, assignedTo: "u_carolina", createdAt: now() - 86400000 * 3, updatedAt: now() - 1800000 },
  { id: "op_3", name: "Cosmetología - Valeria", pipelineId: "pl_1", pipelineStageId: "st_2", status: "open", contactId: "c_4", contactName: "Valeria Cruz", monetaryValue: 2000, assignedTo: "u_milka", createdAt: now() - 86400000 * 7, updatedAt: now() - 86400000 },
];

export const DEFAULT_CURRENCY: CurrencyConfig = {
  currencyCode: "PEN", currencySymbol: "S/", currencyName: "Sol peruano",
  decimalDigits: 2, decimalSeparator: ".", thousandsSeparator: ",", position: "before",
};

export let seedAppConfig: AppConfig = { appName: "BeautyCRM AI", currency: { ...DEFAULT_CURRENCY } };
export function setSeedAppConfig(c: AppConfig) { seedAppConfig = c; }
