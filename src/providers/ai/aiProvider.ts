/**
 * AI provider abstraction for call analysis. The backend transcribes the
 * recording and runs analysis server-side; the frontend never sees AI API
 * keys.
 *
 * Flow:
 *   recording (from telephony provider)
 *     → transcription
 *       → hash (avoid re-analysis of unchanged transcripts)
 *         → AI analysis (summary, objections, score, etc.)
 *           → CallAiAnalysis persisted app-side
 *
 * Implementations:
 *  - NoneAiProvider : throws PROVIDER_UNAVAILABLE (no AI provider configured).
 *  - (future) OpenAiProvider / WhisperProvider : real transcription + analysis.
 */

import { ApiError } from "../../utils/errors";
import { config } from "../../config/env";
import type { CallAiAnalysis } from "../../types";

export interface AiProvider {
  transcribe(recordingUrl: string): Promise<string>;
  analyze(transcript: string, context?: { contactName?: string; program?: string }): Promise<CallAiAnalysis>;
}

class NoneAiProvider implements AiProvider {
  async transcribe(_recordingUrl: string): Promise<string> {
    throw new ApiError("PROVIDER_UNAVAILABLE", "AI provider not configured");
  }
  async analyze(_transcript: string): Promise<CallAiAnalysis> {
    throw new ApiError("PROVIDER_UNAVAILABLE", "AI provider not configured");
  }
}

export function getAiProvider(): AiProvider {
  if (config.ai.provider === "none" || !config.ai.apiKey) {
    return new NoneAiProvider();
  }
  // Future: return new OpenAiProvider(config.ai.apiKey);
  return new NoneAiProvider();
}

/** SHA-256 hash of a transcript to detect unchanged content (avoid re-analysis). */
export function transcriptHash(transcript: string): string {
  // Lazy import to keep this module side-effect free in test envs.
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(transcript).digest("hex");
}
