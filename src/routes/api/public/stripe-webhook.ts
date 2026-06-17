/**
 * Stripe webhook receiver. URL: /api/public/stripe-webhook
 *
 * Configure in Stripe Dashboard -> Developers -> Webhooks with these events:
 *   - checkout.session.completed
 *   - customer.subscription.created
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_succeeded
 *   - invoice.payment_failed
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const sig = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 500 });

        const { verifyStripeSignature, stripeFetch } = await import("@/lib/stripe.server");
        const valid = await verifyStripeSignature(rawBody, sig, secret);
        if (!valid) return new Response("Invalid signature", { status: 400 });

        const event = JSON.parse(rawBody) as { id: string; type: string; data: { object: any } };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Maps Stripe subscription status -> our internal status
        const mapStatus = (s: string): string => {
          switch (s) {
            case "trialing": return "trial";
            case "active": return "active";
            case "past_due": return "past_due";
            case "unpaid": return "suspended";
            case "canceled": return "cancelled";
            case "incomplete":
            case "incomplete_expired": return "past_due";
            default: return s;
          }
        };

        async function resolveCompanyId(sub: any): Promise<string | null> {
          const fromMeta = sub?.metadata?.company_id;
          if (fromMeta) return fromMeta as string;
          if (sub?.customer) {
            const { data } = await supabaseAdmin
              .from("companies").select("id")
              .eq("stripe_customer_id", sub.customer).maybeSingle();
            return data?.id ?? null;
          }
          return null;
        }

        async function syncFromSubscription(sub: any) {
          const companyId = await resolveCompanyId(sub);
          if (!companyId) return;
          const status = mapStatus(sub.status);
          const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
          const isReadOnly = ["past_due", "suspended", "cancelled"].includes(status);
          const planKey = sub.metadata?.plan as string | undefined;

          // Try to read default payment method for last4/brand
          let pmBrand: string | null = null;
          let pmLast4: string | null = null;
          let pmOnFile = false;
          try {
            const pmId = sub.default_payment_method
              ?? (await stripeFetch<any>(`/customers/${sub.customer}`)).invoice_settings?.default_payment_method;
            if (pmId) {
              const pm = await stripeFetch<any>(`/payment_methods/${pmId}`);
              pmBrand = pm.card?.brand ?? null;
              pmLast4 = pm.card?.last4 ?? null;
              pmOnFile = !!pm.card;
            }
          } catch { /* non-fatal */ }

          const patch: Record<string, any> = {
            stripe_customer_id: sub.customer,
            billing_subscription_id: sub.id,
            subscription_status: status,
            trial_ends_at: trialEndsAt,
            payment_method_on_file: pmOnFile || undefined,
            payment_method_brand: pmBrand ?? undefined,
            payment_method_last4: pmLast4 ?? undefined,
            read_only_at: isReadOnly ? new Date().toISOString() : null,
            cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
            reactivated_at: !isReadOnly && status === "active" ? new Date().toISOString() : undefined,
          };
          if (planKey) patch.subscription_plan = planKey;
          // Strip undefined to avoid overwriting existing values with null
          Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

          await supabaseAdmin.from("companies").update(patch).eq("id", companyId);
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object;
              const companyId = session.client_reference_id ?? session.metadata?.company_id;
              if (companyId && session.customer) {
                await supabaseAdmin
                  .from("companies")
                  .update({ stripe_customer_id: session.customer })
                  .eq("id", companyId);
              }
              if (session.subscription) {
                const sub = await stripeFetch<any>(`/subscriptions/${session.subscription}`);
                await syncFromSubscription(sub);
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              await syncFromSubscription(event.data.object);
              break;
            }
            case "invoice.payment_succeeded":
            case "invoice.payment_failed": {
              const invoice = event.data.object;
              if (invoice.subscription) {
                const sub = await stripeFetch<any>(`/subscriptions/${invoice.subscription}`);
                await syncFromSubscription(sub);
              }
              break;
            }
            default:
              break;
          }
        } catch (err) {
          console.error("[stripe-webhook] handler error", event.type, err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
