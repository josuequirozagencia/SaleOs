/**
 * Scheduled-message scheduler job. Runs on a configurable interval and
 * processes due scheduled messages: validates state → sends via the provider
 * → marks the result. This is the server-side scheduler the frontend never
 * implements (no browser setTimeout).
 *
 * In production this runs as a background worker; in dev it is a setInterval
 * started by the server. Only messages with status "scheduled" whose
 * scheduledAt <= now are processed.
 *
 * Multi-tenant: iterates active tenants. Each message is marked "processing"
 * before send (reentrancy guard) and "sent"/"failed" after. Failed messages
 * are NOT retried automatically in this version — they require manual review
 * (a dead-letter/retry queue is a production enhancement).
 */

import { getProvider } from "../services/providerService";
import { tenantRepo } from "../repositories/tenantRepo";
import { config } from "../config/env";
import { logger } from "../utils/router";

let running = false;

/** Active tenant ids to process. In single-tenant dev this is ["default"]. */
function activeTenants(): string[] {
  // tenantRepo is in-memory; in production this queries active tenants from DB.
  const t = tenantRepo.get("default");
  return t ? ["default"] : [];
}

export async function runSchedulerTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const tenantId of activeTenants()) {
      const provider = getProvider(tenantId);
      const due = await provider.listDueScheduledMessages(tenantId, Date.now());
      for (const sm of due) {
        try {
          await provider.markScheduledMessage(tenantId, sm.id, "processing");
          // Validate conversation/window then send via the provider.
          await provider.sendMessage(tenantId, sm.conversationId, { text: sm.message, ghlUserId: sm.advisorUserId });
          await provider.markScheduledMessage(tenantId, sm.id, "sent");
          logger.info(`Scheduled message ${sm.id} sent (tenant ${tenantId})`);
        } catch (err) {
          await provider.markScheduledMessage(tenantId, sm.id, "failed");
          logger.error(err);
        }
      }
    }
  } finally {
    running = false;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => { runSchedulerTick().catch(logger.error); }, config.schedulerIntervalMs);
  logger.info(`Scheduler started (interval ${config.schedulerIntervalMs}ms)`);
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
