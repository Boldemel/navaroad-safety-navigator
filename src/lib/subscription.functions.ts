import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  type CompanySubscription,
  type PlanCatalogEntry,
  isReadOnly,
} from "./subscription.shared";

/** Catalog of all active plans (public to signed-in users). */
export const listSubscriptionPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanCatalogEntry[]> => {
    const { data, error } = await context.supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      id: p.id,
      plan: p.plan,
      displayName: p.display_name,
      description: p.description,
      monthlyPriceUsd: Number(p.monthly_price_usd),
      annualPriceUsd: Number(p.annual_price_usd),
      truckLimit: p.truck_limit,
      userLimit: p.user_limit,
      features: Array.isArray(p.features) ? p.features : [],
      sortOrder: p.sort_order,
      isActive: p.is_active,
    }));
  });

/** Current user's company subscription + feature matrix. */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanySubscription | null> => {
    const { supabase, userId } = context;
    const { data: mem } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!mem) return null;

    const { data: c, error } = await supabase
      .from("companies")
      .select("id, subscription_plan, subscription_status, trial_started_at, trial_ends_at, payment_method_on_file, payment_method_brand, payment_method_last4, cancelled_at")
      .eq("id", mem.company_id)
      .single();
    if (error || !c) throw error ?? new Error("Company not found");

    const { data: features } = await supabase
      .from("plan_feature_access")
      .select("feature_key, enabled, usage_limit")
      .eq("plan", c.subscription_plan);

    const featureMap: CompanySubscription["features"] = {};
    for (const f of features ?? []) {
      featureMap[(f as any).feature_key] = {
        enabled: (f as any).enabled,
        usageLimit: (f as any).usage_limit,
      };
    }

    const trialEnds = c.trial_ends_at ? new Date(c.trial_ends_at) : null;
    const trialDaysRemaining = trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))
      : 0;

    return {
      companyId: c.id,
      plan: c.subscription_plan,
      status: c.subscription_status,
      trialStartedAt: c.trial_started_at,
      trialEndsAt: c.trial_ends_at,
      trialDaysRemaining,
      paymentMethodOnFile: c.payment_method_on_file,
      paymentMethodBrand: c.payment_method_brand,
      paymentMethodLast4: c.payment_method_last4,
      readOnly: isReadOnly(c.subscription_status),
      cancelledAt: c.cancelled_at,
      features: featureMap,
    };
  });

/** Owner-initiated cancel: keeps data, flips to cancelled (read-only). */
export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: c, error: lookupErr } = await supabase
      .from("companies")
      .select("id, owner_id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!c) throw new Error("Only the company owner can cancel.");
    const { error } = await supabase
      .from("companies")
      .update({
        subscription_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        read_only_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (error) throw error;
    return { ok: true };
  });

/** Reactivate a cancelled / past-due / suspended subscription. */
export const reactivateMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan: z.enum(SUBSCRIPTION_PLANS) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c } = await supabase
      .from("companies").select("id, owner_id, payment_method_on_file")
      .eq("owner_id", userId).maybeSingle();
    if (!c) throw new Error("Only the company owner can reactivate.");
    if (!c.payment_method_on_file) throw new Error("Add a payment method before reactivating.");
    const { error } = await supabase
      .from("companies")
      .update({
        subscription_status: "active",
        subscription_plan: data.plan,
        reactivated_at: new Date().toISOString(),
        cancelled_at: null,
        read_only_at: null,
      })
      .eq("id", c.id);
    if (error) throw error;
    return { ok: true };
  });

// =========================
// Super-admin operations
// =========================

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  if (!data) throw new Error("Forbidden: super admin only");
}

export const adminSetCompanyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ companyId: z.string().uuid(), plan: z.enum(SUBSCRIPTION_PLANS) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("companies")
      .update({ subscription_plan: data.plan }).eq("id", data.companyId);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetCompanyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ companyId: z.string().uuid(), status: z.enum(SUBSCRIPTION_STATUSES) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { subscription_status: data.status };
    if (isReadOnly(data.status)) patch.read_only_at = new Date().toISOString();
    else { patch.read_only_at = null; patch.cancelled_at = null; }
    const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", data.companyId);
    if (error) throw error;
    return { ok: true };
  });

export const adminUpdatePlanCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      plan: z.enum(SUBSCRIPTION_PLANS),
      displayName: z.string().min(1).max(120),
      description: z.string().max(1000).nullable().optional(),
      monthlyPriceUsd: z.number().nonnegative(),
      annualPriceUsd: z.number().nonnegative(),
      truckLimit: z.number().int().positive().nullable().optional(),
      userLimit: z.number().int().positive().nullable().optional(),
      isActive: z.boolean(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("subscription_plans").update({
      display_name: data.displayName,
      description: data.description ?? null,
      monthly_price_usd: data.monthlyPriceUsd,
      annual_price_usd: data.annualPriceUsd,
      truck_limit: data.truckLimit ?? null,
      user_limit: data.userLimit ?? null,
      is_active: data.isActive,
    }).eq("plan", data.plan);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetPlanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      plan: z.enum(SUBSCRIPTION_PLANS),
      featureKey: z.string().min(1).max(60),
      enabled: z.boolean(),
      usageLimit: z.number().int().positive().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("plan_feature_access").upsert(
      { plan: data.plan, feature_key: data.featureKey, enabled: data.enabled, usage_limit: data.usageLimit ?? null },
      { onConflict: "plan,feature_key" },
    );
    if (error) throw error;
    return { ok: true };
  });

export type PlatformSubscriptionMetrics = {
  totalCompanies: number;
  trialCompanies: number;
  activeCompanies: number;
  pastDueCompanies: number;
  suspendedCompanies: number;
  cancelledCompanies: number;
  mrrUsd: number;
};

export const adminSubscriptionMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformSubscriptionMetrics> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: companies }, { data: plans }] = await Promise.all([
      supabaseAdmin.from("companies").select("subscription_plan, subscription_status"),
      supabaseAdmin.from("subscription_plans").select("plan, monthly_price_usd"),
    ]);
    const priceByPlan = new Map<string, number>();
    for (const p of plans ?? []) priceByPlan.set((p as any).plan, Number((p as any).monthly_price_usd));
    let mrr = 0;
    const counts = { trial: 0, active: 0, past_due: 0, suspended: 0, cancelled: 0 };
    for (const c of companies ?? []) {
      const s = (c as any).subscription_status as keyof typeof counts;
      if (s in counts) counts[s] += 1;
      if (s === "active") mrr += priceByPlan.get((c as any).subscription_plan) ?? 0;
    }
    return {
      totalCompanies: (companies ?? []).length,
      trialCompanies: counts.trial,
      activeCompanies: counts.active,
      pastDueCompanies: counts.past_due,
      suspendedCompanies: counts.suspended,
      cancelledCompanies: counts.cancelled,
      mrrUsd: mrr,
    };
  });
