/**
 * Normalized API error codes. The frontend receives these as `code` in the
 * JSON error body, never raw stack traces.
 *
 * 400 VALIDATION_ERROR
 * 401 UNAUTHORIZED
 * 403 FORBIDDEN
 * 404 NOT_FOUND
 * 409 CONFLICT
 * 422 BUSINESS_RULE_ERROR
 * 429 RATE_LIMITED
 * 500 INTERNAL_ERROR
 * 502 PROVIDER_ERROR
 * 503 PROVIDER_UNAVAILABLE
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMIT"
  | "APPOINTMENT_CONFLICT"
  | "SCHEDULED_MESSAGE_FAILED"
  | "WEBHOOK_INVALID"
  | "WEBHOOK_DUPLICATE"
  | "MATRICULA_ALREADY_EXISTS";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  PROVIDER_ERROR: 502,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_AUTH_FAILED: 502,
  PROVIDER_RATE_LIMIT: 502,
  APPOINTMENT_CONFLICT: 409,
  SCHEDULED_MESSAGE_FAILED: 422,
  WEBHOOK_INVALID: 401,
  WEBHOOK_DUPLICATE: 409,
  MATRICULA_ALREADY_EXISTS: 409,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Wrap provider/network failures into a controlled provider error. */
export function providerError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : "Provider request failed";
  return new ApiError("PROVIDER_ERROR", message);
}
