/**
 * Backend entitlement enforcement for FleetOS modules.
 *
 * Every server function that returns or mutates module data must call
 * `assertFeature(context, "<featureKey>")` right after `requireSupabaseAuth`.
 * This validates the caller's company subscription against
 * `plan_feature_access` before any data is read or written.
 *
 * A registered module in `src/lib/fleetos/module-registry.ts` that is not
 * marked `alwaysAvailable` is entitlement-gated. Server code MUST NOT rely
 * on the client-side registry alone — the client can be bypassed. This
 * helper is the authoritative check.
 *
 * Feature flow:
 *   requireSupabaseAuth → assertFeature("loads") → your handler
 *
 * Errors are thrown so the framework serializes them to the client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  FLEETOS_MODULES,
  getModule,
} from "@/lib/fleetos/module-registry";

export class FeatureNotEntitledError extends Error {
  readonly code = "FEATURE_NOT_ENTITLED";
  readonly status = 403;
  constructor(public readonly featureKey: string, message?: string) {
    super(message ?? `Your plan does not include the "${featureKey}" module.`);
    this.name = "FeatureNotEntitledError";
  }
}

export class SubscriptionReadOnlyError extends Error {
  readonly code = "SUBSCRIPTION_READ_ONLY";
  readonly status = 402;
  constructor(message?: string) {
    super(message ?? "Subscription is read-only. Reactivate billing to make changes.");
    this.name = "SubscriptionReadOnlyError";
  }
}

type Ctx = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

type AssertOptions = {
  /** Also require the subscription to be writable. Use on mutations. */
  requireWritable?: boolean;
};

/**
 * Validate `plan_feature_access` for the caller's company. Throws when the
 * feature is not entitled, or (when `requireWritable`) the subscription is
 * in a read-only state.
 *
 * Returns the resolved `{ companyId }` for downstream queries.
 */
export async function assertFeature(
  context: Ctx,
  featureKey: string,
  options: AssertOptions = {},
): Promise<{ companyId: string }> {
  const { supabase, userId } = context;

  // Super admins bypass entitlement checks entirely.
  const { data: saRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  const isSuperAdmin = !!saRow;

  // Always-available modules (dashboard/company/profile/billing) skip entitlement.
  const mod = FLEETOS_MODULES.find((m) => m.featureKey === featureKey);
  const alwaysOn = mod?.alwaysAvailable === true;

  // Resolve the caller's company. `get_user_company` is a SECURITY DEFINER
  // RPC that returns the first membership.
  const { data: companyId, error: companyErr } = await supabase.rpc(
    "get_user_company",
    { _user: userId },
  );
  if (companyErr) throw companyErr;
  if (!companyId) throw new Error("No company found for user");

  if (isSuperAdmin || alwaysOn) {
    return { companyId: companyId as string };
  }

  // Entitlement check via the same RPC the DB uses internally.
  const { data: entitled, error: featErr } = await supabase.rpc(
    "company_has_feature",
    { _company: companyId as string, _feature: featureKey },
  );
  if (featErr) throw featErr;
  if (!entitled) throw new FeatureNotEntitledError(featureKey);

  if (options.requireWritable) {
    const { data: readOnly, error: roErr } = await supabase.rpc(
      "is_company_read_only",
      { _company: companyId as string },
    );
    if (roErr) throw roErr;
    if (readOnly) throw new SubscriptionReadOnlyError();
  }

  return { companyId: companyId as string };
}

/**
 * Convenience: assert entitlement by module `id` from the registry (rather
 * than raw `featureKey`). Prefer this when the caller already knows the module.
 */
export async function assertModule(
  context: Ctx,
  moduleId: string,
  options: AssertOptions = {},
) {
  const mod = getModule(moduleId);
  if (!mod) throw new Error(`Unknown FleetOS module: ${moduleId}`);
  return assertFeature(context, mod.featureKey, options);
}
