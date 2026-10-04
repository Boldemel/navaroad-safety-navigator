# Navaroad FleetOS — Launch-Readiness Audit (read-only)

No code, data, secrets, or settings were changed. Findings are from the live database (plan catalog, RLS, policies, view options) and source review. Items marked "unverified" need a live test.

## 1. Production-ready (appears solid)
- Auth: email sign-in, reset-password, gated `_authenticated` area (client-side session check).
- Multi-tenant base: every data table has RLS on; company-scoped tables use `is_company_member` / `has_company_permission` (security-definer, no recursion). Profitability views use `security_invoker=true`, so they inherit table RLS.
- Signup auto-creates a company, owner membership, and a 7-day trial.
- Server entitlement guard (`assertFeature`) plus DB `enforce_company_writable` trigger blocks writes when past_due/suspended/cancelled.
- Core modules with real CRUD + DB automation: Loads, Dispatch (assign, status timeline, comms, truck posts, history), Fuel -> IFTA + Expenses sync, Trip logs -> IFTA state miles, Inspections -> Maintenance tasks -> Maintenance records -> Expenses, Delivered loads -> draft Settlements with driver pay model.
- Reports, Driver Performance, Truck dashboards, PDF/CSV export, Documents compliance view.
- AI Copilot (`/api/chat`): requires bearer token, resolves company from membership, persists history.
- Stripe webhook verifies signatures before writing.

## 2. Implemented but incomplete / placeholder
- Annual billing: catalog has annual prices but `stripe_annual_price_id` is empty for all plans; checkout only uses monthly.
- Enterprise: no Stripe product; "Contact Sales" only (fine), but there is no sales form/flow — just email.
- Notifications: email/SMS/push toggles saved on profile, but no sending service found. Only browser notifications exist.
- ELD: credentials are stored (`driver_eld_credentials`) but no ELD data sync; HOS is manually entered.
- Load Board: registered as a module, but there is no external load board feed — only internal loads and truck posts.
- Checkout success/cancel returns to `/company?checkout=...`; no confirmation handling verified there (billing UI lives at `/billing`).
- Hazard/weigh-station community data depends on users; weigh-station alerts disabled.

## 3. Missing
- Transactional email (trial ending, payment failed, invites, receipts).
- Native mobile apps (Rork wrapper not yet built); offline support is only an offline banner.
- API access, SSO, white-label, multi-terminal (marketed as Enterprise/future).
- Usage limit enforcement (truck/user caps per plan) — limits exist in catalog but no enforcement was found.
- Automated tests.

## 4. Bugs / high-risk issues
- CRITICAL — Billing bypass: the `companies` UPDATE policy lets the owner/fleet_owner update any column. A company owner can set their own `subscription_status='active'` and `subscription_plan='fleet_pro'` from the browser, skipping payment and unlocking all features. Billing columns must be server/webhook-only.
- HIGH — ELD passwords stored in plain text in `driver_eld_credentials.eld_password`.
- HIGH — Duplicate DB triggers on `fuel_purchases` (`fuel_purchases_sync_after_change` and `fuel_purchases_sync_downstream` both run the same function). Upserts make it mostly harmless but it doubles work; worth cleanup.
- MEDIUM — `alerts` table readable by public (fine if intentional).
- MEDIUM — Profitability views granted to anon; safe today only because of `security_invoker` + RLS. Revoke anon to remove reliance on that.
- MEDIUM — `delete_current_user` deletes the owner's company only if no members remain; members of a deleted owner could orphan.
- MEDIUM — Previous hydration crashes on auth/dashboard were patched; regression risk remains without tests.

## 5. Stripe / billing exact status
- Code calls Stripe REST using secret `STRIPE_SECRET_KEY`; webhook uses `STRIPE_WEBHOOK_SECRET`; URL `/api/public/stripe-webhook`.
- All stored price IDs contain the account fragment `GoscGzlDsB`, i.e. they belong to account `acct_1SqMXxGoscGzlDsB` (business "ABFT Solutions").
  - owner_operator $49 -> price_1Tj8h3GoscGzlDsB1HuZZiOl
  - small_fleet $149 -> price_1Tgfw7GoscGzlDsBg2q47kFM
  - growth_fleet $299 -> price_1Tgfx3GoscGzlDsBuEzFKu6u
  - fleet_pro $499 -> price_1Tgfy2GoscGzlDsB3hBS9kJT
  - enterprise -> none
- If the business info was corrected on the SAME account: IDs still work; verify the Checkout and receipts show "Navaroad Technologies LLC", statement descriptor, support email, and legal URLs.
- If it is a NEW Stripe account: all of the following must change — secret key, webhook secret (new endpoint registered in the new account), all 4 price/product IDs, and any existing `stripe_customer_id` values on companies would be invalid.
- Must verify after change: (1) which account the current secret key returns; (2) the webhook endpoint exists in that account with the 6 events; (3) a real checkout -> trial -> webhook updates the company row; (4) customer portal is configured in that account; (5) failed payment moves company to read-only.
- Plan naming mismatch: marketing shows Starter / Professional / FleetOS Complete / Enterprise; database uses Owner Operator / Small Fleet / Growth Fleet / Fleet Pro / Enterprise. Confirm the mapping and prices match Stripe.

## 6. Strengths
- One app, one backend, consistent company scoping and role permissions.
- Strong DB automation linking fuel, IFTA, expenses, maintenance, settlements.
- Defense in depth for entitlements (server check + DB write trigger).
- Broad module coverage for a single product.

## 7. Weaknesses
- Billing state is trusted from a client-writable table.
- No outbound email/SMS; trial and dunning communication absent.
- No plan limit enforcement; no tests; large page files (dashboard ~74k chars, company ~59k).
- Integrations (ELD, load boards) are storage-only.

## 8. Launch blockers
- Critical: Lock billing columns on `companies` (billing bypass). Confirm Stripe account/keys/webhook/prices after account change and run a live end-to-end purchase.
- High: Encrypt or remove stored ELD passwords. Trial-ending and payment-failed emails. Fix checkout return page to confirm success. Enforce truck/user caps per plan.
- Medium: Remove duplicate fuel trigger; revoke anon on views; align marketing plan names/prices with catalog; add a sales/demo request form.
- Low: Annual prices, test suite, splitting large pages.

## 9. Recommendation
Beta-ready, not ready for paying customers. Before charging anyone: fix the billing bypass, verify Stripe on the corrected account end-to-end (checkout, trial, webhook, portal, failed payment), protect ELD passwords, enforce plan limits, add trial/payment emails, and correct marketing claims below.

## 10. Can wait until after launch
Annual billing, native apps via Rork, ELD/load-board data integrations, SSO/API/white-label, automated tests, code splitting.

## 11. Inspected
- Routes: `src/routes/index.tsx`, `auth.tsx`, `_authenticated/route.tsx` and all 30 child routes listed, `api/chat.ts`, `api/public/stripe-webhook.ts`.
- Libraries: `stripe.functions.ts`, `stripe.server.ts`, `subscription.functions.ts`, `fleetos/require-feature.server.ts`, `fleetos/module-registry.ts`, `use-allowed-modules.ts`, `use-subscription.ts`, `start.ts`.
- Database: `subscription_plans` rows, RLS status of all 45 public tables/views, policies on companies, profiles, company_members, company_member_roles, loads, driver_eld_credentials, plan_feature_access, alerts; all functions and triggers.
- Secrets present: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TOMTOM_API_KEY, LOVABLE_API_KEY.

## 12. Marketing claims vs product
- "Unlimited trucks/drivers/users/locations", "Multi-Terminal", "API Access", "Custom Integrations", "SSO", "White Label" (Enterprise) — not built; mark future or remove.
- Load Board — no external board; internal loads/truck posts only.
- ELD integration — credential storage only, no sync.
- Notifications (email/SMS/push) — no delivery.
- Mobile apps — web only today.
- Plan names/prices on site do not match database catalog names; per-plan truck limits are not enforced.

## 13. Multi-tenant isolation and roles
- Company data tables: reads/writes gated on company membership and permission functions — isolation looks correct in policy.
- Roles stored in separate tables (`user_roles`, `company_member_roles`) — correct pattern.
- Role management limited to company owner / fleet_owner.
- Gap: within a company, the owner can rewrite billing fields (Section 4).
- Unverified live: a cross-company read test with two real accounts is recommended before launch.

## Next step if approved
Fix the Critical and High items above, in that order, then re-test Stripe end-to-end.
