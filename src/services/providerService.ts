/**
 * ProviderService — the single seam through which all backend modules access
 * the data layer. It selects the implementation based on config:
 *
 *  - DbProvider  : production composite. CRM-native entities delegate to the
 *                  real GhlProvider (CRM is SoT); app-local commercial data
 *                  (matrículas, follow-ups, notes, timeline, scheduled
 *                  messages, catalog, config, analytics) persists in Postgres
 *                  (tenant-scoped). Falls back to MockProvider for app-local
 *                  data when no DB pool is available (dev/test).
 *  - MockProvider : in-memory, used only when USE_MOCK=true (local dev).
 *
 * Modules never import a provider directly — they call getProvider(), which
 * guarantees the abstraction and makes swapping implementations a one-line
 * change.
 */

import { config } from "../config/env";
import { MockProvider } from "../providers/mock/mockProvider";
import { GhlProvider, hasTenantCreds } from "../providers/ghl/ghlProvider";
import { DbProvider } from "../providers/db/dbProvider";
import type { CrmProvider } from "../providers/crmProvider";

const mockInstance = new MockProvider();
const realInstance = new GhlProvider();
const dbInstance = new DbProvider();

/**
 * Returns the active provider for a tenant.
 *  - USE_MOCK=true → MockProvider (local dev only).
 *  - Otherwise → DbProvider (production composite). It delegates CRM-native
 *    calls to the real GhlProvider when credentials exist, and persists
 *    app-local data in Postgres (with in-memory fallback when no DB pool).
 */
export function getProvider(_tenantId: string): CrmProvider {
  const useMock = (process.env.USE_MOCK ?? "false").toLowerCase() === "true";
  if (useMock) return mockInstance;
  // Production composite: CRM-native delegation + Postgres app-local persistence.
  return dbInstance;
}

export { mockInstance, realInstance, dbInstance };
export type { CrmProvider };
