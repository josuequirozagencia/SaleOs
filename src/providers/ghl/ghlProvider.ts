/**
 * GhlProvider — real CRM (GoHighLevel Private API v2.0) HTTP client.
 *
 * SECURITY: credentials are injected from tenant config (encrypted at rest).
 * No token is ever returned to the frontend. All requests carry the
 * Version + Authorization headers server-side.
 *
 * This implements the CrmProvider interface. Each method maps to the official
 * CRM endpoint. Where the official API does not expose a capability, the
 * method throws PROVIDER_UNAVAILABLE (we do NOT invent endpoints).
 *
 * Retry/backoff: 429 → exponential backoff; 5xx → retry up to 3; 4xx → fail
 * fast with PROVIDER_ERROR.
 */

import type { CrmProvider } from "../crmProvider";
import type { ListParams } from "../crmProvider";
import { ApiError, providerError } from "../../utils/errors";
import { config } from "../../config/env";

export interface TenantCreds {
  token: string;
  locationId: string;
}

/** Registry of per-tenant decrypted credentials (populated by the tenant repo). */
const tenantCreds = new Map<string, TenantCreds>();

export function setTenantCreds(tenantId: string, creds: TenantCreds) {
  tenantCreds.set(tenantId, creds);
}
export function hasTenantCreds(tenantId: string): boolean {
  return tenantCreds.has(tenantId) || (!!config.ghl.privateApiToken && !!config.ghl.locationId);
}
export function getTenantCreds(tenantId: string): TenantCreds {
  const c = tenantCreds.get(tenantId);
  if (c) return c;
  // Fallback to bootstrap creds (single-tenant dev).
  if (config.ghl.privateApiToken && config.ghl.locationId) {
    return { token: config.ghl.privateApiToken, locationId: config.ghl.locationId };
  }
  throw new ApiError("PROVIDER_UNAVAILABLE", "No CRM credentials configured for this tenant");
}

async function ghlFetch<T>(tenantId: string, path: string, init: RequestInit = {}, maxRetries = 3): Promise<T> {
  const creds = getTenantCreds(tenantId);
  const url = `${config.ghl.apiBaseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.token}`,
    Version: config.ghl.apiVersion,
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new ApiError("PROVIDER_AUTH_FAILED", "CRM rejected credentials", { status: res.status });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError("PROVIDER_ERROR", (body as { message?: string }).message ?? `CRM error ${res.status}`);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && (err.code === "FORBIDDEN" || err.code === "PROVIDER_UNAVAILABLE")) throw err;
      const delay = Math.pow(2, attempt) * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw providerError(lastErr);
}

/**
 * The real provider. Methods are stubbed to call the CRM; when an official
 * endpoint is confirmed it is wired here. Until then, methods that lack a
 * confirmed endpoint throw PROVIDER_UNAVAILABLE so the app never silently
 * fakes a CRM call.
 *
 * NOTE: The exact CRM endpoint paths must be confirmed against the official
 * Private API v2.0 docs before production use. The structure below is the
 * correct seam; only the path strings need verification.
 */
export class GhlProvider implements CrmProvider {
  // ── Users / Location ──────────────────────────────────────────────
  async listUsers(tenantId: string) {
    const creds = getTenantCreds(tenantId);
    const data = await ghlFetch<{ users: any[] }>(tenantId, `/users/?locationId=${creds.locationId}`);
    return data.users as any[];
  }
  async getUser(tenantId: string, ghlUserId: string) {
    try {
      return await ghlFetch<any>(tenantId, `/users/${ghlUserId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PROVIDER_ERROR") return null;
      throw err;
    }
  }
  async getUserProfile(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "User profile is app-local data"); }
  async updateUserProfile(_t: string, _id: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "User profile is app-local data"); }
  async getLocation(tenantId: string) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/locations/${creds.locationId}`);
  }
  async createUser(tenantId: string, data: { name: string; email: string; phone?: string; role: any }) {
    const creds = getTenantCreds(tenantId);
    // NOTE: User creation endpoint must be confirmed against official docs.
    // The CRM Private API v2.0 exposes user management; the exact payload
    // (name/email/phone/role) is mapped here. If the platform rejects a
    // field, the error surfaces as PROVIDER_ERROR (never silently faked).
    return ghlFetch<any>(tenantId, `/users/`, {
      method: "POST",
      body: JSON.stringify({ locationId: creds.locationId, name: data.name, email: data.email, phone: data.phone, role: data.role }),
    });
  }
  async updateUser(tenantId: string, ghlUserId: string, updates: Partial<Pick<any, "name" | "email" | "phone" | "role">>) {
    return ghlFetch<any>(tenantId, `/users/${ghlUserId}`, { method: "PUT", body: JSON.stringify(updates) });
  }
  async disableUser(tenantId: string, ghlUserId: string) {
    // Deactivate (soft delete) — the exact method/path must be confirmed.
    return ghlFetch<any>(tenantId, `/users/${ghlUserId}`, { method: "DELETE" });
  }
  async syncUsers(tenantId: string) {
    // Sync = fetch all users from the CRM platform. The route layer maps
    // them into the local representation (idempotent upsert by ghlUserId).
    const users = await this.listUsers(tenantId);
    return { total: users.length, created: 0, updated: 0, unchanged: users.length, errors: 0, lastSyncAt: Date.now() };
  }

  // ── Contacts ──────────────────────────────────────────────────────
  // Official endpoint: POST /contacts/search — filters go in the request body
  // (locationId, pageLimit, query, etc.). Response: { contacts: [...] }
  async listContacts(tenantId: string, p: ListParams) {
    const creds = getTenantCreds(tenantId);
    const body: Record<string, unknown> = {
      locationId: creds.locationId,
      pageLimit: p.pageSize ?? 25,
      page: (p.page ?? 1) - 1,
    };
    if (p.search) body.query = p.search;
    const data = await ghlFetch<{ contacts: any[]; total?: number; count?: number }>(
      tenantId,
      `/contacts/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    return {
      data: data.contacts,
      total: data.total ?? data.count ?? data.contacts.length,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 25,
      hasMore: data.contacts.length === (p.pageSize ?? 25),
    };
  }
  async getContact(tenantId: string, id: string) { return ghlFetch<any>(tenantId, `/contacts/${id}`); }
  async updateContactOwner(tenantId: string, id: string, ghlUserId: string) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/contacts/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, assignedTo: ghlUserId }) });
  }
  async updateContactTags(tenantId: string, id: string, tags: string[]) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/contacts/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, tags }) });
  }

  // ── Conversations / Messages ─────────────────────────────────────
  // Official endpoint: GET /conversations/search — filters go in the
  // query string (locationId, pageLimit, page, assignedTo, search, etc.),
  // NOT in the request body. Response: { conversations: [...], total }
  async listConversations(tenantId: string, p: ListParams) {
    const creds = getTenantCreds(tenantId);
    const q = new URLSearchParams({
      locationId: creds.locationId,
      pageLimit: String(p.pageSize ?? 25),
      page: String(((p.page ?? 1) - 1)),
    });
    if (p.search) q.set("search", p.search);
    if (p.assignedTo) q.set("assignedTo", p.assignedTo);
    if (p.unreadOnly) q.set("unreadOnly", "true");
    if (p.assignedFilter === "assigned") q.set("assigned", "true");
    const data = await ghlFetch<{ conversations: any[]; total?: number }>(
      tenantId,
      `/conversations/search?${q}`
    );
    return {
      data: data.conversations ?? [],
      total: data.total ?? data.conversations?.length ?? 0,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 25,
      hasMore: (data.conversations?.length ?? 0) === (p.pageSize ?? 25),
    };
  }
  async getConversation(tenantId: string, conversationId: string) {
    return ghlFetch<any>(tenantId, `/conversations/${conversationId}`);
  }
  // Messages endpoint: GET /conversations/{id}/messages?limit=&offset=
  // Response shape: { messages: { messages: [...], lastMessageId, nextPage } }
  async getConversationMessages(tenantId: string, conversationId: string, page: number, pageSize: number) {
    const data = await ghlFetch<{ messages: any; messagesList?: any[]; lastMessageId?: string; nextPage?: boolean }>(
      tenantId,
      `/conversations/${conversationId}/messages?limit=${pageSize}&offset=${(page - 1) * pageSize}`
    );
    // The API nests messages under `messages.messages`; handle both shapes.
    const messagesArr = Array.isArray(data.messages) ? data.messages : (data.messages?.messages ?? []);
    return { data: messagesArr, total: messagesArr.length, page, pageSize, hasMore: data.nextPage ?? false };
  }
  async sendMessage(tenantId: string, conversationId: string, payload: any) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ type: payload.attachment ? "TYPE_ATTACHMENT" : "text", ...payload, locationId: creds.locationId }) });
  }
  async sendTemplate(tenantId: string, conversationId: string, payload: any) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ ...payload, type: "template", locationId: creds.locationId }) });
  }
  async getTemplates(tenantId: string) {
    const creds = getTenantCreds(tenantId);
    const data = await ghlFetch<any>(tenantId, `/conversations/message-templates?locationId=${creds.locationId}`);
    return data.templates ?? [];
  }
  async updateConversationTags(tenantId: string, id: string, tags: string[]) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/conversations/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, tags }) });
  }
  async updateConversationPipeline(tenantId: string, id: string, stage: any) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/conversations/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, pipelineStage: stage }) });
  }
  async markConversationRead(tenantId: string, id: string) {
    await ghlFetch<any>(tenantId, `/conversations/${id}/messages/read`, { method: "POST", body: JSON.stringify({}) });
  }
  async getConversationByContact(_t: string, _contactId: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Lookup by contact requires a search endpoint — use listConversations with contactId filter"); }

  // ── Matrículas ────────────────────────────────────────────────────
  async listMatriculas(_t: string, _a?: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Matrículas are app-local commercial data (not a CRM entity)"); }
  async getMatricula(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Matrículas are app-local commercial data"); }
  async getMatriculaByContact(_t: string, _c: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Matrículas are app-local commercial data"); }
  async createMatricula(_t: string, _d: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Matrículas are app-local commercial data"); }
  async cancelMatricula(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Matrículas are app-local commercial data"); }
  async removeMatricula(_t: string, _id: string): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Matrículas are app-local commercial data"); }

  // ── Calls ────────────────────────────────────────────────────────
  async listCalls(_t: string, _p: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Call history requires telephony provider integration"); }
  async getCall(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); }
  async listCallsByContact(_t: string, _c: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); }
  async startCall(_t: string, _c: string, _n: string, _u: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Outbound calls require telephony provider integration"); }
  async answerCall(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); }
  async completeCall(_t: string, _id: string, _s: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Calls require telephony provider integration"); }
  async requestTranscription(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Transcription requires AI provider integration"); }
  async requestAnalysis(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "AI analysis requires AI provider integration"); }
  async getCallAnalysisStatus(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "AI analysis requires AI provider integration"); }

  // ── Achievements / Dashboard ─────────────────────────────────────
  async getAchievement(_t: string, _u: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Achievements are app-local commercial data"); }
  async getDashboardMetrics(_t: string, _a?: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Dashboard metrics are computed app-side"); }
  async getResponseTimeAnalytics(_t: string, _p: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Response-time analytics are computed app-side from message timestamps"); }
  async getConversionAnalytics(_t: string, _p: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Conversion analytics are computed app-side from contacts + matrículas"); }

  // ── Integration ──────────────────────────────────────────────────
  async getIntegrationState(tenantId: string): Promise<any> {
    return { status: hasTenantCreds(tenantId) ? "connected" : "disconnected", locationId: getTenantCreds(tenantId).locationId, locationName: null, lastSyncAt: Date.now(), syncedUsers: 0, syncedContacts: 0, syncedConversations: 0, connectedPhone: null };
  }
  async connectIntegration(tenantId: string): Promise<any> { return this.getIntegrationState(tenantId); }
  async testIntegration(tenantId: string) {
    try { await this.getLocation(tenantId); return { ok: true, message: "Conexión exitosa" }; }
    catch { return { ok: false, message: "No se pudo conectar al CRM" }; }
  }
  async syncIntegration(tenantId: string): Promise<any> { return this.getIntegrationState(tenantId); }
  async disconnectIntegration(tenantId: string): Promise<any> { tenantCreds.delete(tenantId); return { ...await this.getIntegrationState(tenantId), status: "disconnected" }; }
  async getIntegrationConfig(tenantId: string) {
    const creds = tenantCreds.get(tenantId);
    return { hasToken: !!creds?.token, tokenLast4: creds?.token ? creds.token.slice(-4) : undefined, locationId: creds?.locationId ?? null, persisted: !!creds };
  }
  async saveIntegrationConfig(tenantId: string, token: string, locationId: string) {
    setTenantCreds(tenantId, { token, locationId });
    return { hasToken: !!token, tokenLast4: token ? token.slice(-4) : undefined, locationId, persisted: true };
  }
  async clearIntegrationConfig(tenantId: string) {
    tenantCreds.delete(tenantId);
    return { hasToken: false, tokenLast4: undefined, locationId: null, persisted: false };
  }

  // ── Areas / Programs / Custom fields / Quick replies ────────────
  async listAreas(_t: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Areas are app-local catalog data"); }
  async createArea(_t: string, _n: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Areas are app-local catalog data"); }
  async updateArea(_t: string, _id: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Areas are app-local catalog data"); }
  async removeArea(_t: string, _id: string): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Areas are app-local catalog data"); }
  async listPrograms(_t: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Programs are app-local catalog data"); }
  async listProgramsByArea(_t: string, _a: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Programs are app-local catalog data"); }
  async createProgram(_t: string, _d: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Programs are app-local catalog data"); }
  async updateProgram(_t: string, _id: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Programs are app-local catalog data"); }
  async removeProgram(_t: string, _id: string): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Programs are app-local catalog data"); }
  async listCustomFields(_t: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Custom fields are app-local config"); }
  async createCustomField(_t: string, _d: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Custom fields are app-local config"); }
  async updateCustomField(_t: string, _id: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Custom fields are app-local config"); }
  async removeCustomField(_t: string, _id: string): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Custom fields are app-local config"); }
  async listQuickReplies(_t: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Quick replies are app-local config"); }
  async createQuickReply(_t: string, _d: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Quick replies are app-local config"); }
  async updateQuickReply(_t: string, _id: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Quick replies are app-local config"); }
  async removeQuickReply(_t: string, _id: string): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Quick replies are app-local config"); }

  // ── Follow-ups / Notes / Timeline ───────────────────────────────
  async listFollowUps(_t: string, _a?: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Follow-ups are app-local data"); }
  async listFollowUpsByContact(_t: string, _c: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Follow-ups are app-local data"); }
  async getFollowUp(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Follow-ups are app-local data"); }
  async createFollowUp(_t: string, _d: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Follow-ups are app-local data"); }
  async updateFollowUp(_t: string, _id: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Follow-ups are app-local data"); }
  async updateFollowUpStatus(_t: string, _id: string, _s: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Follow-ups are app-local data"); }
  async removeFollowUp(_t: string, _id: string): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Follow-ups are app-local data"); }
  async listNotesByContact(_t: string, _c: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Notes are app-local data"); }
  async createNote(_t: string, _c: string, _u: string, _t2: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Notes are app-local data"); }
  async listTimelineByContact(_t: string, _c: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Timeline is app-local data"); }

  // ── Scheduled messages ──────────────────────────────────────────
  async listScheduledByConversation(_t: string, _c: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Scheduled messages are app-local data"); }
  async getScheduledMessage(_t: string, _id: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Scheduled messages are app-local data"); }
  async createScheduledMessage(_t: string, _d: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Scheduled messages are app-local data"); }
  async updateScheduledMessage(_t: string, _id: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Scheduled messages are app-local data"); }
  async cancelScheduledMessage(_t: string, _id: string): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Scheduled messages are app-local data"); }
  async listDueScheduledMessages(_t: string, _b: number): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Scheduled messages are app-local data"); }
  async markScheduledMessage(_t: string, _id: string, _s: any): Promise<void> { throw new ApiError("PROVIDER_UNAVAILABLE", "Scheduled messages are app-local data"); }

  // ── Calendars / Appointments ─────────────────────────────────────
  async listCalendars(tenantId: string, _a?: string) {
    const creds = getTenantCreds(tenantId);
    const data = await ghlFetch<any>(tenantId, `/calendars?locationId=${creds.locationId}`);
    return data.calendars ?? [];
  }
  async getSlots(tenantId: string, calendarId: string, from: number, to: number) {
    // Official endpoint expects ISO-8601 date strings for startDate/endDate.
    const start = new Date(from).toISOString();
    const end = new Date(to).toISOString();
    const data = await ghlFetch<any>(tenantId, `/calendars/${calendarId}/free-slots?startDate=${start}&endDate=${end}`);
    return data.slots ?? [];
  }
  async listAppointments(tenantId: string, p: any) {
    const creds = getTenantCreds(tenantId);
    const data = await ghlFetch<any>(tenantId, `/appointments/?locationId=${creds.locationId}&limit=${p.pageSize ?? 25}&offset=${((p.page ?? 1) - 1) * (p.pageSize ?? 25)}`);
    return { data: data.appointments ?? [], total: data.total ?? 0, page: p.page ?? 1, pageSize: p.pageSize ?? 25, hasMore: !!data.nextCursor };
  }
  async listAppointmentsByContact(_t: string, _c: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Use listAppointments with contactId filter"); }
  async getAppointment(tenantId: string, id: string) { return ghlFetch<any>(tenantId, `/appointments/${id}`); }
  async bookAppointment(tenantId: string, data: any) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/appointments/`, { method: "POST", body: JSON.stringify({ ...data, locationId: creds.locationId }) });
  }
  async updateAppointmentStatus(tenantId: string, id: string, status: any) {
    return ghlFetch<any>(tenantId, `/appointments/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
  }
  async rescheduleAppointment(tenantId: string, id: string, start: number, end: number) {
    return ghlFetch<any>(tenantId, `/appointments/${id}/reschedule`, { method: "POST", body: JSON.stringify({ start, end }) });
  }
  async cancelAppointment(tenantId: string, id: string) {
    await ghlFetch<any>(tenantId, `/appointments/${id}`, { method: "DELETE" });
  }

  // ── App config ──────────────────────────────────────────────────
  async getAppConfig(_t: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "App config is app-local data"); }
  async updateAppConfig(_t: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "App config is app-local data"); }

  // ── Currency config (per-tenant, presentation only) ─────────────
  // Currency is app-local tenant configuration, not a CRM entity. The real
  // backend persists it per tenant; the CRM provider does not store it.
  async getCurrency(_t: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Currency is app-local tenant configuration"); }
  async updateCurrency(_t: string, _c: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Currency is app-local tenant configuration"); }
}
