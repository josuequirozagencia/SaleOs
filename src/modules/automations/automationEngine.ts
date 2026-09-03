/**
 * AutomationEngine — server-side commercial automations.
 *
 * Runs as a scheduled sweep (not webhook-triggered, because response-time
 * alerts need a delayed check: at message-received time we cannot yet know
 * whether a reply will arrive within 5 minutes). The engine inspects
 * conversations for inbound messages that remain unanswered beyond the
 * threshold and raises a follow-up alert so the team can act.
 *
 * RULES IMPLEMENTED (technically supported with current infra):
 *  - Lead sin respuesta > 5 min: an inbound customer message with no advisor
 *    reply within ALERT_THRESHOLD_MS creates a BeautyCRM follow-up (type
 *    "whatsapp", reason "Lead sin respuesta >5min"). It does NOT auto-send a
 *    message to the customer (no explicit send-rule configured).
 *
 * RULES REQUIRING EXTERNAL CONFIG (marked BLOCKED, not simulated):
 *  - Round-robin assignment: needs an assignment-rules config table (active
 *    users, teams, sede, availability). BLOCKED until Block 2 catalog extends.
 *  - VIP / repeat-client detection: needs tag-based rules config. BLOCKED.
 *  - Auto task creation: needs a task-rules config. BLOCKED.
 *
 * SECURITY: tenant-scoped. The sweep only reads conversations the provider
 * exposes for the tenant; it never crosses tenants. Alerts are stored as
 * follow-ups (tenant_id-scoped) via the provider.
 */

import { getProvider } from "../../services/providerService";
import { tenantRepo } from "../../repositories/tenantRepo";
import { logger } from "../../utils/router";

/** 5 minutes — the explicit threshold from the product spec. */
const ALERT_THRESHOLD_MS = 5 * 60 * 1000;

/** Avoid re-alerting the same conversation: one open alert per conversation. */
const ALERT_REASON = "Lead sin respuesta >5min";

export async function runAutomationTick(): Promise<void> {
  const tenants = await tenantRepo.listActive();
  for (const tenant of tenants) {
    try {
      const provider = getProvider(tenant.id);
      // Fetch recent open conversations (page 1, recent).
      const convPage = await provider.listConversations(tenant.id, {
        pageSize: 50,
        status: "open",
      });
      for (const conv of convPage.data) {
        await checkConversationResponse(tenant.id, conv.id, conv.contactId, conv.contactName, conv.assignedTo);
      }
    } catch (err) {
      logger.error(`Automation sweep failed for tenant ${tenant.id}: ${(err as Error).message}`);
    }
  }
}

async function checkConversationResponse(
  tenantId: string,
  conversationId: string,
  contactId: string,
  contactName: string,
  assignedTo: string | null,
): Promise<void> {
  const provider = getProvider(tenantId);
  // Load the latest messages (page 1, most recent first per provider contract).
  const msgPage = await provider.getConversationMessages(tenantId, conversationId, 1, 20);
  // Messages whose instant the CRM did not return are EXCLUDED, not dated to
  // "now": an invented timestamp would make an old unanswered message look
  // fresh (suppressing a real alert) or a fresh one look overdue.
  const msgs = msgPage.data
    .filter((m) => typeof m.timestamp === "number")
    .sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
  if (msgs.length === 0) return;

  // Find the last inbound (customer) message and check for a subsequent reply.
  let lastInboundIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].direction === "inbound" && msgs[i].visibility !== "internal") {
      lastInboundIdx = i;
      break;
    }
  }
  if (lastInboundIdx < 0) return;

  const lastInbound = msgs[lastInboundIdx];
  const hasReplyAfter = msgs
    .slice(lastInboundIdx + 1)
    .some((m) => m.direction === "outbound" && m.visibility !== "internal");

  if (hasReplyAfter) return; // answered — no alert.

  const elapsed = Date.now() - (lastInbound.timestamp as number);
  if (elapsed < ALERT_THRESHOLD_MS) return; // still within the 5-min window.

  // Already alerted? Skip if an open alert follow-up exists for this contact.
  const existing = await provider.listFollowUpsByContact(tenantId, contactId);
  const alreadyAlerted = existing.some(
    (f) => f.reason === ALERT_REASON && f.status === "pending",
  );
  if (alreadyAlerted) return;

  // Assign the alert to the conversation owner, or leave for the team.
  const owner = assignedTo ?? "unassigned";
  await provider.createFollowUp(tenantId, {
    contactId,
    contactName,
    ghlUserId: owner,
    dueAt: Date.now(),
    reason: ALERT_REASON,
    type: "whatsapp",
    note: `Mensaje sin respuesta desde hace ${Math.round(elapsed / 60000)} min.`,
  });
  logger.info(`Automation: response alert raised for conversation ${conversationId} (tenant ${tenantId})`);
}
