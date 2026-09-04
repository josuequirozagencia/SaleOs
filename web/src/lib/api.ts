/**
 * API client.
 *
 * The app is served from the same origin as the backend, so every path here is
 * relative and the session travels in the HttpOnly cookie the login sets. No
 * token is ever read, stored, or attached by this code — the browser handles
 * it, which is what keeps it out of reach of any script on the page.
 */

import type {
  Contact,
  Conversation,
  CrmMessage,
  CrmUser,
  CurrencyConfig,
  CustomField,
  LoginResponse,
  Matricula,
  MatriculaInput,
  Paginated,
  Program,
  SessionResponse,
  StudyArea,
} from "./types";

const BASE = "/api/crm";

/** An error the API returned, carrying the backend's own code and message. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True when the session is missing or expired and the user must sign in. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      ...init,
    });
  } catch {
    // fetch only rejects on a transport failure — the user is offline, or the
    // server is unreachable. Say that, rather than a generic failure.
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // A non-JSON body from an API path means something upstream answered
    // instead of the API (a proxy error page, an SPA fallback). Don't pretend
    // to have parsed it.
    if (!res.ok) {
      throw new ApiError(res.status, "BAD_RESPONSE", `El servidor respondió ${res.status} sin datos legibles.`);
    }
    return undefined as T;
  }

  if (!res.ok) {
    const err = body as { code?: string; message?: string } | undefined;
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? `Error ${res.status}`);
  }

  return body as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    session: () => request<SessionResponse>("/auth/session"),
    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  },

  users: {
    list: () => request<CrmUser[]>("/users"),
  },

  conversations: {
    list: (params: {
      page?: number;
      pageSize?: number;
      assignedTo?: string;
      search?: string;
      channel?: string;
      status?: string;
      unreadOnly?: boolean;
    }) => request<Paginated<Conversation>>(`/conversations${qs(params)}`),

    messages: (conversationId: string, params: { page?: number; pageSize?: number } = {}) =>
      request<Paginated<CrmMessage>>(
        `/conversations/${encodeURIComponent(conversationId)}/messages${qs(params)}`,
      ),

    send: (conversationId: string, text: string, visibility?: "external" | "internal") =>
      request<CrmMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ text, visibility }),
      }),

    markRead: (conversationId: string) =>
      request<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/read`, {
        method: "POST",
      }),
  },

  contacts: {
    list: (params: {
      page?: number;
      pageSize?: number;
      search?: string;
      matriculated?: boolean;
    }) => request<Paginated<Contact>>(`/contacts${qs(params)}`),
  },

  matriculas: {
    /** Returns the full list — this endpoint is not paginated server-side. */
    list: () => request<Matricula[]>("/matriculas"),

    create: (data: MatriculaInput) =>
      request<Matricula>("/matriculas", { method: "POST", body: JSON.stringify(data) }),

    cancel: (id: string) =>
      request<Matricula>(`/matriculas/${encodeURIComponent(id)}/cancel`, { method: "POST" }),

    remove: (id: string) =>
      request<{ ok: boolean }>(`/matriculas/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  config: {
    areas: () => request<StudyArea[]>("/areas"),
    programsByArea: (areaId: string) =>
      request<Program[]>(`/areas/${encodeURIComponent(areaId)}/programs`),
    customFields: () => request<CustomField[]>("/custom-fields"),
    currency: () => request<CurrencyConfig>("/settings/currency"),
  },
};

/** The backend's code for "this contact already has a matrícula". */
export const MATRICULA_DUPLICATE_CODE = "MATRICULA_ALREADY_EXISTS";
