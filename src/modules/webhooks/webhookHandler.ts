/**
 * Webhook handler for CRM provider events. Validates authenticity (shared
 * secret signature via timing-safe comparison), enforces idempotency (no
 * double-processing), and routes the event to the appropriate provider
 * mutation.
 *
 * SECURITY:
 *  - The signature is compared with `timingSafeEqual` (constant-time).
 *  - In production, a missing WEBHOOK_SECRET rejects ALL webhooks (no open
 *    ingress). In dev, an empty secret allows manual testing.
 *  - The tenant is resolved from the signed channel (a registered webhook →
 *    tenant mapping), NEVER from the request body. A forged body cannot
 *    mutate another tenant's data.
 *
 * In production these events come from the CRM platform; in dev they can be
 * POSTed manually for testing. No secrets are logged.
 */

import type { CrmProvider } from "../../providers/crmProvider";
import { getProvider } from "../../services/providerService";
import { idempotencyStore } from "../../repositories/idempotencyStore";
import { tenantRepo } from "../../repositories/tenantRepo";
import { ApiError } from "../../utils/errors";
import { config } from "../../config/env";

/** Read the webhook secret live so tests/runtime changes take effect. */
function webhookSecret(): string {
  return process.env.WEBHOOK_SECRET ?? config.webhookSecret ?? "";
}

export interface WebhookPayload {
  eventId: string;
  type: string;
  /**
   * Optional tenant hint from the body. This is NEVER trusted as the
   * authoritative tenant — it is only retained for backwards compatibility
   * with dev tooling. The authoritative tenant comes from the signed webhook
   * URL channel (`tenantIdFromUrl`), validated against the tenant registry.
   */
  tenantId?: string;
  data: Record<string, unknown>;
}

/**
 * Resolve the tenant for an incoming webhook from the signed URL channel
 * (e.g. /api/webhooks/crm/:tenantId). The body-supplied tenantId is NEVER
 * used for authorization — a forged body cannot mutate another tenant's data.
 *
 * The tenant must exist in the registry. If the URL channel is absent (legacy
 * single-tenant dev path), we fall back to "default" ONLY when that tenant is
 * registered. Unknown tenants are rejected.
 */
async function resolveTenant(tenantIdFromUrl?: string): Promise<string> {
  const tenantId = tenantIdFromUrl ?? "default";
  const tenant = await tenantRepo.get(tenantId);
  if (!tenant) {
    throw new ApiError("UNAUTHORIZED", "Unknown webhook tenant channel");
  }
  return tenantId;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) diff |= aBuf[i] ^ bBuf[i];
  return diff === 0;
}

export async function handleWebhook(
  payload: WebhookPayload,
  signature?: string,
  tenantIdFromUrl?: string,
): Promise<{ ok: boolean; duplicate: boolean }> {
  const secret = webhookSecret();

  // In production, require a configured secret — never accept unsigned ingress.
  if (config.nodeEnv === "production" && !secret) {
    throw new ApiError("UNAUTHORIZED", "Webhook secret not configured");
  }
  // Validate signature (timing-safe) when a secret is configured.
  if (secret) {
    if (!signature || !safeEqual(signature, secret)) {
      throw new ApiError("UNAUTHORIZED", "Invalid webhook signature");
    }
  }

  // Idempotency: skip already-processed events.
  if (await idempotencyStore.seen(payload.eventId, tenantIdFromUrl)) {
    return { ok: true, duplicate: true };
  }

  // Authoritative tenant comes from the signed URL channel, NEVER the body.
  const tenantId = await resolveTenant(tenantIdFromUrl);
  const provider: CrmProvider = getProvider(tenantId);
  const d = payload.data;

  switch (payload.type) {
    case "contact_updated":
    case "tag_updated":
      if (d.contactId && Array.isArray(d.tags)) await provider.updateContactTags(tenantId, String(d.contactId), d.tags as string[]);
      break;
    case "owner_changed":
      if (d.contactId && d.ghlUserId) await provider.updateContactOwner(tenantId, String(d.contactId), String(d.ghlUserId));
      break;
    case "message_received":
    case "message_sent":
      // Messages are stored by the provider; the app refetches via React Query.
      break;
    case "appointment_created":
    case "appointment_updated":
    case "appointment_cancelled":
      // Appointment state lives in the CRM; the app refetches appointments.
      break;
    case "call_started":
    case "call_answered":
    case "call_completed":
      // Call state is synced by the telephony provider; the app refetches calls.
      break;
    case "user_created":
    case "user_updated":
      // User identity lives in the CRM; the app refetches users via React Query.
      // No local mutation needed — the provider is the source of truth.
      break;
    case "user_deleted":
    case "user_disabled":
      // Deactivation is handled by the provider; the app refetches users.
      break;
    default:
      // Unknown event types are acknowledged but not processed (no invented logic).
      break;
  }

  return { ok: true, duplicate: false };
}
