/**
 * ProviderService — the single seam through which all backend modules access
 * the CRM provider. It selects the implementation based on config (USE_MOCK or
 * missing credentials → MockProvider; real credentials → GhlProvider).
 *
 * Modules never import a provider directly — they call getProvider(), which
 * guarantees the abstraction and makes swapping implementations a one-line
 * change. This mirrors the frontend's USE_MOCK switch exactly.
 */

import { config } from "../config/env";
import { MockProvider } from "../providers/mock/mockProvider";
import { GhlProvider, hasTenantCreds } from "../providers/ghl/ghlProvider";
import type { CrmProvider } from "../providers/crmProvider";

const mockInstance = new MockProvider();
const realInstance = new GhlProvider();

/**
 * Returns the active provider for a tenant. In mock mode (or when no real
 * credentials are configured) the mock is used. Otherwise the real GHL
 * provider is used with per-tenant credentials injected server-side.
 */
export function getProvider(_tenantId: string): CrmProvider {
  // Mock is opt-in ONLY: defaults to real mode so the app connects to the real
  // CRM sub-account whenever credentials are present. Set USE_MOCK=true to
  // force mock for local development.
  const useMock = (process.env.USE_MOCK ?? "false").toLowerCase() === "true";
  if (useMock) return mockInstance;
  // Real mode: use the real provider when credentials exist for the tenant.
  if (hasTenantCreds(_tenantId)) return realInstance;
  // Fallback to mock when credentials are missing (dev safety net).
  return mockInstance;
}

export { mockInstance, realInstance };
export type { CrmProvider };
