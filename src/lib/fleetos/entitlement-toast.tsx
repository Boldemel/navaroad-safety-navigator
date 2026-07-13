/**
 * Centralized client handler for FleetOS entitlement errors.
 *
 * Parses a thrown value against the stable JSON schema defined in
 * `entitlement-error.ts` and surfaces a consistent toast (or inline
 * banner) with:
 *   - the server message
 *   - the affected module label (looked up from the feature key)
 *   - an action linking to /billing
 *
 * Use `handleEntitlementError(error)` from any query/mutation cache
 * handler or `try/catch`. Returns `true` when the error was an
 * entitlement error and a toast was shown, so callers can early-return
 * before their generic fallback.
 */

import { Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FLEETOS_MODULES,
  type FleetOSModule,
} from "@/lib/fleetos/module-registry";
import {
  parseEntitlementError,
  type EntitlementErrorPayload,
} from "@/lib/fleetos/entitlement-error";

function moduleForFeatureKey(featureKey: string | null): FleetOSModule | undefined {
  if (!featureKey) return undefined;
  return FLEETOS_MODULES.find(
    (m) => m.featureKey === featureKey || m.id === featureKey,
  );
}

/**
 * Show a consistent toast for an entitlement error. Returns whether the
 * error matched the entitlement schema (so the caller can skip its
 * generic error toast).
 */
export function handleEntitlementError(error: unknown): boolean {
  const payload = parseEntitlementError(error);
  if (!payload) return false;

  const mod = moduleForFeatureKey(payload.featureKey);
  const moduleLabel = mod?.label ?? payload.featureKey ?? "This module";
  const title = payload.isReadOnly
    ? "Subscription is read-only"
    : `${moduleLabel} not included in your plan`;

  toast.error(title, {
    id: `entitlement:${payload.code}:${payload.featureKey ?? "unknown"}`,
    description: payload.message,
    duration: 8000,
    action: {
      label: payload.isReadOnly ? "Reactivate billing" : "Upgrade plan",
      onClick: () => {
        if (typeof window !== "undefined") {
          window.location.assign("/billing");
        }
      },
    },
  });
  return true;
}

/**
 * Inline banner variant of the same message. Use inside a page/section
 * that failed to load due to an entitlement gate. Pass the raw thrown
 * error; renders nothing when the error is not an entitlement error.
 */
export function EntitlementBanner({
  error,
  className,
}: {
  error: unknown;
  className?: string;
}) {
  const payload = parseEntitlementError(error);
  if (!payload) return null;
  return <EntitlementBannerFromPayload payload={payload} className={className} />;
}

export function EntitlementBannerFromPayload({
  payload,
  className,
}: {
  payload: EntitlementErrorPayload;
  className?: string;
}) {
  const mod = moduleForFeatureKey(payload.featureKey);
  const moduleLabel = mod?.label ?? payload.featureKey ?? "This module";
  const Icon = payload.isReadOnly ? Lock : ShieldAlert;
  const tone = payload.isReadOnly
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-warning/40 bg-warning/10 text-warning";
  const title = payload.isReadOnly
    ? "Subscription is read-only"
    : `${moduleLabel} not included in your plan`;
  const actionLabel = payload.isReadOnly ? "Reactivate billing" : "Upgrade plan";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm",
        tone,
        className,
      )}
      data-entitlement-code={payload.code}
      data-entitlement-feature={payload.featureKey ?? ""}
    >
      <Icon className="size-4 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="font-semibold leading-tight">{title}</div>
        <div className="opacity-90">{payload.message}</div>
        {payload.featureKey ? (
          <div className="text-[11px] uppercase tracking-wider opacity-70">
            Feature: {payload.featureKey}
          </div>
        ) : null}
      </div>
      <a
        href="/billing"
        className="rounded-md border border-current px-2.5 py-1 text-xs font-medium hover:bg-current/10"
      >
        {actionLabel}
      </a>
    </div>
  );
}
