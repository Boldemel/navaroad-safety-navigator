# Architecture rules

- Only super admins or trusted server sessions may grant/revoke `super_admin` (RLS + `protect_super_admin_role` trigger) — prevents platform privilege escalation.
- Company members are added only via server functions using the admin client after a permission check — no direct client inserts of arbitrary users.
- Team-management server functions must verify the target user belongs to the caller's company (`assertTargetInCompany`) — prevents cross-company account takeover.
- Plan truck/user limits are enforced by DB triggers (`enforce_truck_limit`, `enforce_user_limit`) reading `subscription_plans`; NULL = unlimited; super-admin-owned companies are exempt — client cannot bypass.
- Trucks are counted as distinct normalized `vehicle_unit` values across a company's operational tables — there is no separate truck registry.
- ELD passwords are AES-GCM encrypted server-side (`eld-crypto.server.ts`, secret `ELD_ENCRYPTION_KEY`) and decrypted only in server functions — never stored plaintext.
- Self-signup owners receive the `fleet_owner` company role, which the module registry treats as full access.
- Account deletion is blocked while the user owns a company with other members or a live, non-cancelling Stripe subscription — prevents billing after deletion.
- Public FleetOS software CTAs use absolute external anchors to verified app-origin pages; TanStack Link is reserved for local routes so cross-origin navigation remains valid and type-safe.
- Company INSERTs are trusted-provisioning-only (or verified super-admin); trial write gates require a Stripe subscription and an unexpired end in both database and subscription responses — prevents local-trial/orphan-company bypass.
