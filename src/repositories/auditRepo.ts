/**
 * Audit log repository. Records administrative/sensitive actions for
 * compliance and traceability.
 *
 * PERSISTENCE:
 * - Postgres when the DB pool is available: audit entries survive restarts.
 * - In-memory fallback (array) when no DB (dev/tests).
 *
 * SECURITY: never logs secrets, tokens, PIT, or shared secrets — only
 * action/resource metadata.
 */

import type { AuditEntry } from "../types";
import { query, dbAvailable } from "../db/client";

const entries: AuditEntry[] = [];

interface AuditRow {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function rowToEntry(r: AuditRow): AuditEntry {
  return {
    id: String(r.id),
    tenantId: r.tenant_id,
    ghlUserId: r.user_id,
    action: r.action,
    resource: r.resource,
    resourceId: r.resource_id ?? "",
    timestamp: Number(r.created_at),
    metadata: r.metadata ?? undefined,
  };
}

export const auditRepo = {
  /**
   * Record an audit entry. Best-effort: never rejects — audit logging must
   * not break the main operation. Callers may fire-and-forget (without await)
   * since errors are swallowed internally.
   */
  async record(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<void> {
    try {
      if (dbAvailable()) {
        await query(
          `INSERT INTO audit_log (tenant_id, user_id, action, resource, resource_id, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            entry.tenantId,
            entry.ghlUserId,
            entry.action,
            entry.resource,
            entry.resourceId || null,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            Date.now(),
          ],
        );
        return;
      }
      entries.push({
        ...entry,
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      });
    } catch {
      // Audit logging is best-effort — never surface a failure to the caller.
    }
  },

  async list(tenantId: string, limit = 100): Promise<AuditEntry[]> {
    if (dbAvailable()) {
      const rows = await query<AuditRow>(
        `SELECT * FROM audit_log WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [tenantId, limit],
      );
      return rows.map(rowToEntry);
    }
    return entries.filter((e) => e.tenantId === tenantId).slice(-limit).reverse();
  },
};
