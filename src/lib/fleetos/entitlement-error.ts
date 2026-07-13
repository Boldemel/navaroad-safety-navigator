/**
 * Centralized error formatter for FleetOS entitlement failures.
 *
 * Every server function that gates a module through
 * `assertFeature()` (see `require-feature.server.ts`) may throw either
 * `FeatureNotEntitledError` (403) or `SubscriptionReadOnlyError` (402).
 * Both are serialized to the client using the SAME stable JSON schema so
 * the UI can reliably branch on `code` / `featureKey` / `isReadOnly`
 * without string-matching messages.
 *
 * Shape returned to the client (via server middleware):
 *   {
 *     "error": {
 *       "code": "FEATURE_NOT_ENTITLED" | "SUBSCRIPTION_READ_ONLY",
 *       "featureKey": string | null,
 *       "isReadOnly": boolean,
 *       "message": string
 *     }
 *   }
 *
 * Safe to import from both client and server (pure types + pure functions,
 * no server-only imports).
 */

export const ENTITLEMENT_ERROR_CODES = {
  FEATURE_NOT_ENTITLED: "FEATURE_NOT_ENTITLED",
  SUBSCRIPTION_READ_ONLY: "SUBSCRIPTION_READ_ONLY",
} as const;

export type EntitlementErrorCode =
  (typeof ENTITLEMENT_ERROR_CODES)[keyof typeof ENTITLEMENT_ERROR_CODES];

export type EntitlementErrorPayload = {
  code: EntitlementErrorCode;
  featureKey: string | null;
  isReadOnly: boolean;
  message: string;
};

export type EntitlementErrorEnvelope = {
  error: EntitlementErrorPayload;
};

const HTTP_STATUS_BY_CODE: Record<EntitlementErrorCode, number> = {
  FEATURE_NOT_ENTITLED: 403,
  SUBSCRIPTION_READ_ONLY: 402,
};

/**
 * Duck-typed detection so this module can stay dependency-free. The
 * concrete error classes live in `require-feature.server.ts` and set the
 * same `code` string.
 */
export function toEntitlementPayload(
  error: unknown,
): EntitlementErrorPayload | null {
  if (error == null || typeof error !== "object") return null;
  const anyErr = error as {
    code?: unknown;
    featureKey?: unknown;
    message?: unknown;
  };
  const code = anyErr.code;
  if (code !== "FEATURE_NOT_ENTITLED" && code !== "SUBSCRIPTION_READ_ONLY") {
    return null;
  }
  const featureKey =
    typeof anyErr.featureKey === "string" && anyErr.featureKey.length > 0
      ? anyErr.featureKey
      : null;
  const message =
    typeof anyErr.message === "string" && anyErr.message.length > 0
      ? anyErr.message
      : code === "FEATURE_NOT_ENTITLED"
        ? "Your plan does not include this module."
        : "Subscription is read-only. Reactivate billing to make changes.";
  return {
    code: code as EntitlementErrorCode,
    featureKey,
    isReadOnly: code === "SUBSCRIPTION_READ_ONLY",
    message,
  };
}

export function entitlementHttpStatus(code: EntitlementErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

/**
 * Serialize an entitlement error to a JSON `Response` with the correct
 * HTTP status. Returns `null` when the error is not an entitlement error
 * so callers can fall through to their default handling.
 */
export function entitlementErrorResponse(error: unknown): Response | null {
  const payload = toEntitlementPayload(error);
  if (!payload) return null;
  const envelope: EntitlementErrorEnvelope = { error: payload };
  return new Response(JSON.stringify(envelope), {
    status: entitlementHttpStatus(payload.code),
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-entitlement-error": payload.code,
      ...(payload.featureKey
        ? { "x-entitlement-feature": payload.featureKey }
        : {}),
    },
  });
}

/**
 * Client-side helper: try to parse an unknown thrown value (from
 * `useServerFn` / fetch / tanstack query) into the stable payload.
 * Accepts either the raw error, the envelope, or a JSON string.
 */
export function parseEntitlementError(
  input: unknown,
): EntitlementErrorPayload | null {
  if (input == null) return null;

  // Already the payload shape.
  const direct = toEntitlementPayload(input);
  if (direct) return direct;

  // Envelope: { error: { code, ... } }
  if (typeof input === "object" && input !== null && "error" in input) {
    const inner = (input as { error: unknown }).error;
    const fromInner = toEntitlementPayload(inner);
    if (fromInner) return fromInner;
  }

  // JSON string.
  if (typeof input === "string") {
    try {
      return parseEntitlementError(JSON.parse(input));
    } catch {
      return null;
    }
  }

  // Error thrown by tanstack start with a `.body` / `.response` payload.
  if (typeof input === "object" && input !== null) {
    const anyIn = input as { body?: unknown; response?: unknown };
    if (anyIn.body) {
      const fromBody = parseEntitlementError(anyIn.body);
      if (fromBody) return fromBody;
    }
    if (anyIn.response && typeof anyIn.response === "object") {
      const resp = anyIn.response as { body?: unknown };
      if (resp.body) {
        const fromResp = parseEntitlementError(resp.body);
        if (fromResp) return fromResp;
      }
    }
  }

  return null;
}

export function isEntitlementError(input: unknown): boolean {
  return parseEntitlementError(input) !== null;
}
