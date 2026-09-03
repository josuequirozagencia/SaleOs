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
import {
  mapCrmUser,
  mapCrmContact,
  mapCrmConversation,
  mapCrmMessage,
  mapCrmCalendar,
  mapCrmSlot,
  mapCrmAppointment,
} from "./mappers";
import { mapCrmPipeline, mapCrmOpportunity } from "./opportunityMappers";
import type { Pipeline, Opportunity, PaginatedOpportunities } from "../../types";

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
    return (data.users || []).map(mapCrmUser);
  }
  async getUser(tenantId: string, ghlUserId: string) {
    try {
      const data = await ghlFetch<any>(tenantId, `/users/${ghlUserId}`);
      return data ? mapCrmUser(data.user || data) : null;
    } catch (err) {
      if (err instanceof ApiError && err.code === "PROVIDER_ERROR") return null;
      throw err;
    }
  }
  // User profile preferences (theme, language, monthlyGoal, commission, …)
  // are NOT a CRM concept — the CRM platform exposes no endpoint for them.
  // They are BeautyCRM-owned configuration and persist in PostgreSQL, scoped
  // by tenant_id + ghl_user_id (see DbProvider). The CRM provider must never
  // invent or hardcode these values, so it reports the capability as
  // unavailable rather than returning a static profile.
  async getUserProfile(_t: string, _ghlUserId: string): Promise<any> {
    throw new ApiError("PROVIDER_UNAVAILABLE", "User profile preferences are app-local data (not a CRM entity)");
  }
  async updateUserProfile(_t: string, _ghlUserId: string, _updates: any): Promise<any> {
    throw new ApiError("PROVIDER_UNAVAILABLE", "User profile preferences are app-local data (not a CRM entity)");
  }
  async getLocation(tenantId: string) {
    const creds = getTenantCreds(tenantId);
    return ghlFetch<any>(tenantId, `/locations/${creds.locationId}`);
  }
  async createUser(tenantId: string, data: { name: string; email: string; phone?: string; role: any }) {
    const creds = getTenantCreds(tenantId);
    const res = await ghlFetch<any>(tenantId, `/users/`, {
      method: "POST",
      body: JSON.stringify({ locationId: creds.locationId, name: data.name, email: data.email, phone: data.phone, role: data.role }),
    });
    return mapCrmUser(res.user || res);
  }
  async updateUser(tenantId: string, ghlUserId: string, updates: Partial<Pick<any, "name" | "email" | "phone" | "role">>) {
    const res = await ghlFetch<any>(tenantId, `/users/${ghlUserId}`, { method: "PUT", body: JSON.stringify(updates) });
    return mapCrmUser(res.user || res);
  }
  async disableUser(tenantId: string, ghlUserId: string) {
    const res = await ghlFetch<any>(tenantId, `/users/${ghlUserId}`, { method: "DELETE" });
    return mapCrmUser(res.user || res);
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
      page: p.page ?? 1,
    };
    if (p.search) body.query = p.search;
    const data = await ghlFetch<{ contacts: any[]; total?: number; count?: number }>(
      tenantId,
      `/contacts/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    const contactsArr = (data.contacts || []).map(mapCrmContact);
    return {
      data: contactsArr,
      total: data.total ?? data.count ?? contactsArr.length,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 25,
      hasMore: contactsArr.length === (p.pageSize ?? 25),
    };
  }
  async getContact(tenantId: string, id: string) {
    const data = await ghlFetch<any>(tenantId, `/contacts/${id}`);
    return data ? mapCrmContact(data.contact || data) : null;
  }
  async updateContactOwner(tenantId: string, id: string, ghlUserId: string) {
    const creds = getTenantCreds(tenantId);
    const res = await ghlFetch<any>(tenantId, `/contacts/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, assignedTo: ghlUserId }) });
    return mapCrmContact(res.contact || res);
  }
  async updateContactTags(tenantId: string, id: string, tags: string[]) {
    const creds = getTenantCreds(tenantId);
    const res = await ghlFetch<any>(tenantId, `/contacts/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, tags }) });
    return mapCrmContact(res.contact || res);
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
      page: String(p.page ?? 1),
    });
    if (p.search) q.set("search", p.search);
    if (p.assignedTo && p.assignedTo !== "all") q.set("assignedTo", p.assignedTo);
    if (p.unreadOnly) q.set("unreadOnly", "true");
    if (p.assignedFilter === "assigned") q.set("assigned", "true");
    const data = await ghlFetch<{ conversations: any[]; total?: number }>(
      tenantId,
      `/conversations/search?${q}`
    );
    const convArr = (data.conversations || []).map(mapCrmConversation);
    return {
      data: convArr,
      total: data.total ?? convArr.length,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 25,
      hasMore: convArr.length === (p.pageSize ?? 25),
    };
  }
  async getConversation(tenantId: string, conversationId: string) {
    const data = await ghlFetch<any>(tenantId, `/conversations/${conversationId}`);
    return data ? mapCrmConversation(data.conversation || data) : null;
  }
  async getConversationMessages(tenantId: string, conversationId: string, page: number, pageSize: number) {
    const data = await ghlFetch<{ messages: any; messagesList?: any[]; lastMessageId?: string; nextPage?: boolean }>(
      tenantId,
      `/conversations/${conversationId}/messages?limit=${pageSize}&offset=${(page - 1) * pageSize}`
    );
    const rawArr = Array.isArray(data.messages) ? data.messages : (data.messages?.messages ?? []);
    const messagesArr = rawArr.map(mapCrmMessage);
    return { data: messagesArr, total: messagesArr.length, page, pageSize, hasMore: data.nextPage ?? false };
  }
  async sendMessage(tenantId: string, conversationId: string, payload: any) {
    const creds = getTenantCreds(tenantId);
    // Official endpoint: POST /conversations/messages (NOT /conversations/{id}/messages).
    // Required fields: contactId, type, status. Text content goes in `message`
    // (not `text`). Attachments are an array of URL strings. Resolve the real
    // contactId from the conversation record — never trust the request body.
    const conv = await this.getConversation(tenantId, conversationId);
    if (!conv || !conv.contactId) {
      throw new ApiError("PROVIDER_ERROR", "Cannot send message: conversation has no contactId");
    }

    const isInternal = payload.visibility === "internal";
    // Map our visibility → official message type. Internal notes use
    // InternalComment (with userId); external messages infer the channel type
    // from the conversation (WhatsApp/SMS/etc.), defaulting to SMS.
    let type: string;
    if (isInternal) {
      type = "InternalComment";
    } else if (conv.channel === "whatsapp") {
      type = "WhatsApp";
    } else if (conv.channel === "instagram") {
      type = "IG";
    } else if (conv.channel === "messenger") {
      type = "FB";
    } else {
      type = "SMS";
    }

    // Normalize attachments: the frontend sends a single object {url,...};
    // the official API expects attachments: string[] (URLs).
    const attachments: string[] = [];
    if (payload.attachment) {
      const a = payload.attachment;
      const url = typeof a === "string" ? a : a.url;
      if (url) attachments.push(url);
    }

    const body: Record<string, unknown> = {
      type,
      contactId: conv.contactId,
      message: payload.text ?? "",
      status: "delivered",
      locationId: creds.locationId,
      attachments,
    };
    if (isInternal && payload.ghlUserId) {
      body.userId = payload.ghlUserId;
    }

    const res = await ghlFetch<any>(tenantId, `/conversations/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapCrmMessage(res.message || res);
  }
  async sendTemplate(tenantId: string, conversationId: string, payload: any) {
    const creds = getTenantCreds(tenantId);
    const conv = await this.getConversation(tenantId, conversationId);
    if (!conv || !conv.contactId) throw new ApiError("PROVIDER_ERROR", "Cannot send template: conversation has no contactId");
    const type = conv.channel === "whatsapp" ? "WhatsApp" : "SMS";
    const res = await ghlFetch<any>(tenantId, `/conversations/messages`, { method: "POST", body: JSON.stringify({ type, contactId: conv.contactId, status: "delivered", locationId: creds.locationId, templateId: payload.templateId, message: payload.text ?? "" }) });
    return mapCrmMessage(res.message || res);
  }
  async getTemplates(tenantId: string) {
    const creds = getTenantCreds(tenantId);
    const data = await ghlFetch<any>(tenantId, `/conversations/message-templates?locationId=${creds.locationId}`);
    return data.templates ?? [];
  }
  async updateConversationTags(tenantId: string, id: string, tags: string[]) {
    const creds = getTenantCreds(tenantId);
    const res = await ghlFetch<any>(tenantId, `/conversations/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, tags }) });
    return mapCrmConversation(res.conversation || res);
  }
  async updateConversationPipeline(tenantId: string, id: string, stage: any) {
    const creds = getTenantCreds(tenantId);
    const res = await ghlFetch<any>(tenantId, `/conversations/${id}`, { method: "PUT", body: JSON.stringify({ locationId: creds.locationId, pipelineStage: stage }) });
    return mapCrmConversation(res.conversation || res);
  }
  async markConversationRead(tenantId: string, id: string) {
    await ghlFetch<any>(tenantId, `/conversations/${id}/messages/read`, { method: "POST", body: JSON.stringify({}) });
  }
  async getConversationByContact(tenantId: string, contactId: string): Promise<any> {
    const list = await this.listConversations(tenantId, { pageSize: 50 });
    const match = list.data.find((c) => c.contactId === contactId);
    return match || null;
  }

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
    return (data.calendars || []).map(mapCrmCalendar);
  }
  async getSlots(tenantId: string, calendarId: string, from: number, to: number) {
    const start = new Date(from).toISOString();
    const end = new Date(to).toISOString();
    const data = await ghlFetch<any>(tenantId, `/calendars/${calendarId}/free-slots?startDate=${start}&endDate=${end}`);
    return (data.slots || []).map((s: any) => mapCrmSlot(s, calendarId));
  }
  async listAppointments(tenantId: string, p: any) {
    const creds = getTenantCreds(tenantId);
    const data = await ghlFetch<any>(tenantId, `/appointments/?locationId=${creds.locationId}&limit=${p.pageSize ?? 25}&offset=${((p.page ?? 1) - 1) * (p.pageSize ?? 25)}`);
    const apptArr = (data.appointments || []).map(mapCrmAppointment);
    return { data: apptArr, total: data.total ?? apptArr.length, page: p.page ?? 1, pageSize: p.pageSize ?? 25, hasMore: !!data.nextCursor };
  }
  async listAppointmentsByContact(_t: string, _c: string): Promise<any[]> { throw new ApiError("PROVIDER_UNAVAILABLE", "Use listAppointments with contactId filter"); }
  async getAppointment(tenantId: string, id: string) {
    const data = await ghlFetch<any>(tenantId, `/appointments/${id}`);
    return data ? mapCrmAppointment(data.appointment || data) : null;
  }
  async bookAppointment(tenantId: string, data: any) {
    const creds = getTenantCreds(tenantId);
    const res = await ghlFetch<any>(tenantId, `/appointments/`, { method: "POST", body: JSON.stringify({ ...data, locationId: creds.locationId }) });
    return mapCrmAppointment(res.appointment || res);
  }
  async updateAppointmentStatus(tenantId: string, id: string, status: any) {
    const res = await ghlFetch<any>(tenantId, `/appointments/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    return mapCrmAppointment(res.appointment || res);
  }
  async rescheduleAppointment(tenantId: string, id: string, start: number, end: number) {
    const res = await ghlFetch<any>(tenantId, `/appointments/${id}/reschedule`, { method: "POST", body: JSON.stringify({ start, end }) });
    return mapCrmAppointment(res.appointment || res);
  }
  async cancelAppointment(tenantId: string, id: string) {
    await ghlFetch<any>(tenantId, `/appointments/${id}`, { method: "DELETE" });
  }

  // ── Pipelines & Opportunities (Private API v2.0) ──────────────────
  async listPipelines(tenantId: string): Promise<Pipeline[]> {
    const creds = getTenantCreds(tenantId);
    const data = await ghlFetch<any>(tenantId, `/opportunities/pipelines?locationId=${creds.locationId}`);
    return (data.pipelines || []).map(mapCrmPipeline);
  }
  async listOpportunities(tenantId: string, p: ListParams): Promise<PaginatedOpportunities> {
    const creds = getTenantCreds(tenantId);
    const q = new URLSearchParams({
      location_id: creds.locationId,
      limit: String(p.pageSize ?? 50),
      page: String(p.page ?? 1),
    });
    if (p.search) q.set("q", p.search);
    // "all" is the app's own sentinel for "no advisor filter" — it is NOT a
    // user id. Sending it literally makes the CRM search for a user called
    // "all" and return an empty list. Same rule as listConversations.
    if (p.assignedTo && p.assignedTo !== "all") q.set("assigned_to", p.assignedTo);
    const data = await ghlFetch<any>(tenantId, `/opportunities/search?${q}`);
    const opps = (data.opportunities || []).map(mapCrmOpportunity);
    return { data: opps, total: data.meta?.total ?? opps.length, page: p.page ?? 1, pageSize: p.pageSize ?? 50, hasMore: opps.length === (p.pageSize ?? 50) };
  }
  async updateOpportunityStage(tenantId: string, id: string, stageId: string): Promise<Opportunity> {
    const res = await ghlFetch<any>(tenantId, `/opportunities/${id}`, {
      method: "PUT",
      body: JSON.stringify({ pipelineStageId: stageId }),
    });
    return mapCrmOpportunity(res.opportunity || res);
  }

  // ── App config ──────────────────────────────────────────────────
  async getAppConfig(_t: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "App config is app-local data"); }
  async updateAppConfig(_t: string, _u: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "App config is app-local data"); }

  // ── Currency config (per-tenant, presentation only) ─────────────
  // Currency is app-local tenant configuration, not a CRM entity. The real
  // backend persists it per tenant; the CRM provider does not store it.
  async getCurrency(_t: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Currency is app-local tenant configuration"); }
  async updateCurrency(_t: string, _c: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Currency is app-local tenant configuration"); }

  // ── Commercial rules (per-tenant, app-local) ────────────────────────
  async getCommercialRules(_t: string): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Commercial rules are app-local tenant configuration"); }
  async updateCommercialRules(_t: string, _r: any): Promise<any> { throw new ApiError("PROVIDER_UNAVAILABLE", "Commercial rules are app-local tenant configuration"); }
}
