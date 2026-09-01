/**
 * Telephony provider abstraction. The backend talks to the telephony provider
 * (server-side credentials); the frontend never sees telephony credentials.
 *
 * Implementations:
 *  - NoneTelephonyProvider : throws PROVIDER_UNAVAILABLE (no provider configured).
 *  - (future) TwilioProvider / GhlCallsProvider : real outbound calls + webhooks.
 *
 * The CallRecord is stored app-side (audit, metrics, AI). The provider only
 * handles the live call leg + returns a providerCallId for later sync.
 */

import { ApiError } from "../../utils/errors";
import { config } from "../../config/env";

export interface StartCallInput {
  contactId: string;
  number: string;
  ghlUserId: string;
}
export interface ProviderCallResult {
  providerCallId: string;
  status: "initiated" | "ringing";
}

export interface TelephonyProvider {
  startCall(input: StartCallInput): Promise<ProviderCallResult>;
  /** Terminate an active call. */
  endCall(providerCallId: string): Promise<void>;
}

class NoneTelephonyProvider implements TelephonyProvider {
  async startCall(_input: StartCallInput): Promise<ProviderCallResult> {
    throw new ApiError("PROVIDER_UNAVAILABLE", "Telephony provider not configured");
  }
  async endCall(_providerCallId: string): Promise<void> {
    throw new ApiError("PROVIDER_UNAVAILABLE", "Telephony provider not configured");
  }
}

export function getTelephonyProvider(): TelephonyProvider {
  // In production, select based on config.telephony.provider.
  // Currently no provider is wired — calls remain app-side mock only.
  if (config.telephony.provider === "none" || !config.telephony.apiKey) {
    return new NoneTelephonyProvider();
  }
  // Future: return new TwilioProvider(config.telephony.apiKey);
  return new NoneTelephonyProvider();
}
