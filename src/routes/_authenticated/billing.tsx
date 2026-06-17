import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, CreditCard, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  createCheckoutSession,
  createBillingPortalSession,
} from "@/lib/stripe.functions";
import { listSubscriptionPlans, getMySubscription } from "@/lib/subscription.functions";
import { statusLabel, type SubscriptionPlan } from "@/lib/subscription.shared";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>Billing unavailable</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Something went wrong loading billing."}
        </AlertDescription>
      </Alert>
      <Button className="mt-3" onClick={() => reset()}>Retry</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
  head: () => ({
    meta: [
      { title: "Billing & Plans · Navaroad" },
      { name: "description", content: "Manage your Navaroad subscription, payment method, and plan." },
    ],
  }),
});

function BillingPage() {
  const router = useRouter();
  const search = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const checkoutFlag = search.get("checkout");

  const listPlans = useServerFn(listSubscriptionPlans);
  const getSub = useServerFn(getMySubscription);
  const checkout = useServerFn(createCheckoutSession);
  const portal = useServerFn(createBillingPortalSession);

  const plansQuery = useQuery({ queryKey: ["billing", "plans"], queryFn: () => listPlans() });
  const subQuery = useQuery({ queryKey: ["subscription", "me"], queryFn: () => getSub() });

  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null);
  const startCheckout = useMutation({
    mutationFn: (plan: SubscriptionPlan) => checkout({ data: { plan } }),
    onSuccess: (res) => { window.location.href = res.url; },
    onError: (err: any) => {
      setPendingPlan(null);
      toast.error(err?.message ?? "Couldn't start checkout");
    },
  });
  const openPortal = useMutation({
    mutationFn: () => portal(),
    onSuccess: (res) => { window.location.href = res.url; },
    onError: (err: any) => toast.error(err?.message ?? "Couldn't open billing portal"),
  });

  const sub = subQuery.data;
  const plans = plansQuery.data ?? [];
  const currentPlan = sub?.plan;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing & Plans</h1>
        <p className="text-sm text-muted-foreground">
          7-day free trial · Cancel any time · Card required at signup, auto-charged on day 8
        </p>
      </div>

      {checkoutFlag === "success" && (
        <Alert>
          <Check className="size-4" />
          <AlertTitle>Subscription started</AlertTitle>
          <AlertDescription>
            Your trial is active. We'll send a reminder before the first charge.
          </AlertDescription>
        </Alert>
      )}
      {checkoutFlag === "cancelled" && (
        <Alert variant="destructive">
          <AlertTitle>Checkout cancelled</AlertTitle>
          <AlertDescription>No charge was made. You can pick a plan when you're ready.</AlertDescription>
        </Alert>
      )}

      {/* Current subscription summary */}
      {sub && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Current subscription</CardTitle>
                <CardDescription>
                  Plan: <strong className="capitalize">{sub.plan.replace(/_/g, " ")}</strong>
                  {" · "}
                  <Badge variant={sub.readOnly ? "destructive" : sub.status === "trial" ? "secondary" : "default"}>
                    {statusLabel(sub.status)}
                  </Badge>
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => openPortal.mutate()}
                disabled={openPortal.isPending}
              >
                {openPortal.isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                Manage billing
                <ExternalLink className="size-3 opacity-70" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Trial ends</div>
              <div className="text-sm">
                {sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : "—"}
                {sub.status === "trial" && (
                  <span className="ml-1 text-muted-foreground">({sub.trialDaysRemaining} days left)</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Payment method</div>
              <div className="text-sm">
                {sub.paymentMethodOnFile && sub.paymentMethodBrand
                  ? `${sub.paymentMethodBrand.toUpperCase()} •••• ${sub.paymentMethodLast4 ?? ""}`
                  : "Not on file"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
              <div className="text-sm">
                {sub.readOnly
                  ? "Read-only — reactivate billing to make changes"
                  : sub.status === "trial"
                  ? "On trial — auto-charge on day 8"
                  : "Active"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" />
        Secure checkout powered by Stripe. Cancel during trial = no charge.
      </div>

      {/* Plan grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plansQuery.isLoading && (
          <div className="col-span-full flex justify-center p-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {plans
          .filter((p) => p.plan !== "enterprise")
          .map((p) => {
            const isCurrent = currentPlan === p.plan && !sub?.readOnly;
            return (
              <Card key={p.id} className={isCurrent ? "border-primary shadow-md" : ""}>
                <CardHeader>
                  <div className="flex items-baseline justify-between">
                    <CardTitle>{p.displayName}</CardTitle>
                    {isCurrent && <Badge>Current</Badge>}
                  </div>
                  <CardDescription>{p.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-bold">${p.monthlyPriceUsd}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                  {p.truckLimit && (
                    <div className="text-xs text-muted-foreground">Up to {p.truckLimit} trucks</div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-sm">
                    {p.features.slice(0, 6).map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="size-4 shrink-0 text-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={
                      startCheckout.isPending ||
                      pendingPlan === p.plan ||
                      isCurrent
                    }
                    onClick={() => {
                      setPendingPlan(p.plan);
                      startCheckout.mutate(p.plan);
                    }}
                  >
                    {pendingPlan === p.plan && startCheckout.isPending ? (
                      <><Loader2 className="size-4 animate-spin" /> Redirecting…</>
                    ) : isCurrent ? (
                      "Active"
                    ) : sub?.status === "trial" || !sub ? (
                      "Start 7-day trial"
                    ) : (
                      "Switch to this plan"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
