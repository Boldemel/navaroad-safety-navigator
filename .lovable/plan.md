# QA Diagnosis: New-Account Local Trial + Demo Dashboard Data (no changes made)

## Answers to the six questions

### 1) Is signup granting a local 7-day trial before Stripe Checkout? — YES, confirmed
The DB trigger `provision_company_for_new_user()` (SECURITY DEFINER, runs at signup) inserts the new company directly with `subscription_status='trial'`, `subscription_plan='owner_operator'`, `trial_started_at=now()`, `trial_ends_at=now()+7 days`. Stripe Checkout is never in this path — the trial exists entirely in the database before a card is ever requested.

Verified on the actual account: "William Stewart's Fleet" (created 2026-10-05 06:59 UTC) — status `trial`, plan `owner_operator`, trial 10/05 → 10/12.

### 2) Why does it say "Add a payment method"? 
The banner (`src/components/subscription-banner.tsx`) shows that sentence whenever `status==='trial'` and `paymentMethodOnFile===false`. Because the local trial bypassed Stripe Checkout, no card was ever collected — the banner is accurately reporting a state the wrong signup flow created. Card-required-at-signup is only enforced inside Stripe Checkout, which the user never passed through.

### 3) Are the fleet metrics demo/hardcoded or cross-company data? — HARDCODED, no tenant leak
`src/routes/_authenticated/home.tsx` hardcodes every number: lines 74–79 (12 active trucks, 9 drivers, 7 loads in transit, 4 deliveries, 3 alerts, 2 inspections), lines 86–93 (revenue $18,420, expenses $6,910, etc.), plus hardcoded Today's Alerts, Live Fleet Activity, Recent Loads, Recent Settlements, Recent Maintenance, Copilot tips, and 7-day Performance Summary charts. They are static string literals, not queries of any table.

DB confirms the new company (`f61fa9ed-…`) has **0 loads, 0 trips, 0 maintenance records, 0 fuel purchases, 0 settlements, 1 member** — nothing was seeded and nothing leaked from another company. Tenant isolation is intact.

### 4) Stripe state for the new account
No Stripe customer, no subscription, no payment method: `stripe_customer_id` is NULL, `billing_subscription_id` is NULL, `payment_method_on_file` is false. (No personal data shown.)

### 5) Correct plan/role? — YES
Plan `owner_operator`, member role `fleet_owner` — exactly as intended for new owners.

### Root cause (single sentence)
Signup auto-provisions a free local trial via the DB trigger, skipping Stripe Checkout entirely, and the Home dashboard is a static demo page — two independent launch issues.

## Recommended fix (implementation plan)

1. **Stop granting the trial at signup** — change `provision_company_for_new_user()`: insert the company with `subscription_status='trial'`-free state (e.g. `trial` only from Stripe) and NULL trial dates. The company must be provisioned (so RLS/ownership works) but not "in trial".
2. **Force checkout before trial** — after signup/onboarding, the owner is redirected through `createCheckoutSession` ($49/mo Owner Operator, `trial_period_days: 7`, card required). Only the Stripe webhook (`checkout.session.completed`) sets the trial: `subscription_status='trial'`, real trial dates, `payment_method_on_file=true`, Stripe ids. Until then the app shows a read-only onboarding state (not a usable free trial) — `payment_method_on_file` is written only by the webhook, never locally.
3. **No local trial fallback** — ensure no other code path writes `trial_ends_at`/`trial_started_at` locally (only the webhook and Stripe-truth code do).
4. **Replace Home dashboard demo data with real queries** — fleet status, financial snapshot, alerts, activity, recent loads/settlements/maintenance, and performance summary should read the company's own tables (via server functions) and show proper empty states ("No trucks yet — add your first truck") when zero. Optionally keep the hardcoded numbers behind an explicit demo environment flag only.
5. **Banner wording stays valid** once the flow is fixed: it will only ever show "Add a payment method" if a Stripe-created trial somehow lost its card, which Stripe prevents.

No edits made — awaiting approval to implement.
