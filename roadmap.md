# Roadmap

- [x] Oct 23 company INSERT safety: replace owner client INSERT policy with super-admin-only, normalize nonprivileged INSERT defaults to pre-checkout, require Stripe subscription plus future trial end in DB/server response; no customer rows changed
- [ ] Auth #418 root cause: not reproduced in clean desktop/mobile production/local tests; no speculative fix claimed

- [x] Oct 23 follow-up: verify commit ce61981, all 12 FleetOS links, live marketing failures, marked contact submission, and deployment evidence; report blockers
- [x] Verify public website and live FleetOS signup/sign-in destinations
- [x] Repair FleetOS landing-page software links without redesign (confirmed live on app.navaroad.com Oct 23)
- [x] Test desktop/mobile software CTA flows and marked public contact submission
- [ ] Public navaroad.com CTA repairs: blocked by separate website source/hosting access, absent from this project and accessible workspace projects
- [ ] Confirm live Stripe-before-trial onboarding: authenticated checkout/banner flow unverified Oct 23; owner-controlled card test required
- [ ] Public contact delivery readback/notification and test cleanup: blocked by separate website backend access

- [x] Launch blocker 1 (Critical): lock company billing fields from client updates
- [x] Launch blocker 2: Stripe hardening + Owner Operator $49 price
- [x] A) Super-admin / role security + two-company isolation test
- [x] B) ELD credential security (encrypted)
- [x] C) Plan limit enforcement (trucks/users)
- [x] D) Marketing claim alignment
- [x] E) Core production QA (all routes load; new-owner role fix)
- [x] F) Legal/privacy consistency
- [x] G) Final audit report
- [ ] Owner: real-card trial checkout test (owner action)
- [ ] Owner: approve updated public prices/claims and Terms billing section (legal review recommended)
- Post-launch: email/SMS notifications, annual Stripe prices, consent-based member invites, external ELD/load-board, API/SSO
- [x] Stripe-before-trial: remove local trial grant, normalize test account, gate pre-checkout access
- [x] Home dashboard: replace hardcoded demo data with real company-scoped queries + empty states
- [x] Verify: no free local trial, $49 checkout reachable, zeros for new company, tenant isolation, type/build checks
