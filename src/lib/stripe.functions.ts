import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { SUBSCRIPTION_PLANS } from "./subscription.shared";
import type {
  CheckoutSessionResult,
  PortalSessionResult,
  AdminCompanyBilling,
} from "./stripe.shared";

function appOrigin(): string {
  const fromEnv = process.env.APP_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  const host = getRequestHost();
  return `${proto}://${host}`;
}

/**
 * Create a Stripe Checkout Session for the chosen plan.
 * - 7-day free trial
 * - Card collection required (validated now)
 * - Auto-charges on day 8
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan: z.enum(SUBSCRIPTION_PLANS) }).parse(d))
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    const { supabase, userId } = context;
    const { stripeFetch } = await import("./stripe.server");

    // Find caller's company (owner only allowed to start checkout)
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, name, stripe_customer_id, owner_id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!company) throw new Error("Only the company owner can start checkout.");

    // Look up the plan's Stripe price id
    const { data: plan, error: pErr } = await supabase
      .from("subscription_plans")
      .select("plan, display_name, stripe_monthly_price_id")
      .eq("plan", data.plan)
      .single();
    if (pErr) throw pErr;
    if (!plan.stripe_monthly_price_id) {
      throw new Error(`${plan.display_name} is not yet wired to a Stripe price.`);
    }

    // Resolve customer email
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email ?? undefined;

    const origin = appOrigin();
    const session = await stripeFetch<{ id: string; url: string }>(
      "/checkout/sessions",
      {
        method: "POST",
        body: {
          mode: "subscription",
          payment_method_collection: "always",
          customer: company.stripe_customer_id ?? undefined,
          customer_email: company.stripe_customer_id ? undefined : email,
          client_reference_id: company.id,
          allow_promotion_codes: true,
          line_items: [{ price: plan.stripe_monthly_price_id, quantity: 1 }],
          subscription_data: {
            trial_period_days: 7,
            metadata: { company_id: company.id, plan: data.plan },
          },
          metadata: { company_id: company.id, plan: data.plan },
          success_url: `${origin}/company?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/company?checkout=cancelled`,
        },
      },
    );

    return { url: session.url };
  });

/** Create a Stripe Billing Portal session so users can update card / cancel. */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;
    const { stripeFetch } = await import("./stripe.server");

    const { data: company } = await supabase
      .from("companies")
      .select("id, stripe_customer_id, owner_id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (!company) throw new Error("Only the company owner can manage billing.");
    if (!company.stripe_customer_id) {
      throw new Error("No Stripe customer yet. Start a checkout first.");
    }
    const origin = appOrigin();
    const portal = await stripeFetch<{ url: string }>(
      "/billing_portal/sessions",
      {
        method: "POST",
        body: { customer: company.stripe_customer_id, return_url: `${origin}/company` },
      },
    );
    return { url: portal.url };
  });

/** Super-admin: list every company's subscription with billing details. */
export const adminListCompanyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCompanyBilling[]> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase
      .rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: companies }, { data: plans }] = await Promise.all([
      supabaseAdmin
        .from("companies")
        .select(
          "id, name, owner_id, subscription_plan, subscription_status, trial_ends_at, " +
            "payment_method_on_file, payment_method_brand, payment_method_last4, " +
            "stripe_customer_id, billing_subscription_id, cancelled_at",
        )
        .order("name"),
      supabaseAdmin
        .from("subscription_plans")
        .select("plan, monthly_price_usd"),
    ]);

    const priceByPlan = new Map<string, number>();
    for (const p of plans ?? []) priceByPlan.set((p as any).plan, Number((p as any).monthly_price_usd));

    // Look up owner emails
    const ownerIds = Array.from(new Set((companies ?? []).map((c: any) => c.owner_id).filter(Boolean)));
    const emails = new Map<string, string>();
    for (const oid of ownerIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(oid as string);
      if (u?.user?.email) emails.set(oid as string, u.user.email);
    }

    return (companies ?? []).map((c: any) => ({
      companyId: c.id,
      companyName: c.name,
      ownerEmail: emails.get(c.owner_id) ?? null,
      plan: c.subscription_plan,
      status: c.subscription_status,
      trialEndsAt: c.trial_ends_at,
      paymentMethodOnFile: c.payment_method_on_file,
      paymentMethodBrand: c.payment_method_brand,
      paymentMethodLast4: c.payment_method_last4,
      stripeCustomerId: c.stripe_customer_id,
      stripeSubscriptionId: c.billing_subscription_id,
      monthlyPriceUsd: priceByPlan.get(c.subscription_plan) ?? 0,
      cancelledAt: c.cancelled_at,
    }));
  });
