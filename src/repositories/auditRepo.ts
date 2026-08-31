/**
 * Audit log repository. Records administrative/sensitive actions for
 * compliance and traceability. In-memory in dev; database-backed in prod.
 *
 * Never logs secrets or token values — only action/resource metadata.
 */

import type { AuditEntry } from "../types";

const entries: AuditEntry[] = [];

export const auditRepo = {
  record(entry: Omit<AuditEntry, "id" | "timestamp">): void {
    entries.push({ ...entry, id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() });
  },

  list(tenantId: string, limit = 100): AuditEntry[] {
    return entries.filter((e) => e.tenantId === tenantId).slice(-limit).reverse();
  },
};
