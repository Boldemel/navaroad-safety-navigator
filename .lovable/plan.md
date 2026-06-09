
## Why you don't see Sample Company

The `Platform Admin` page (`src/routes/_authenticated/admin/platform.tsx`) is currently all placeholders — every tab just renders "Wiring pending." Nothing actually queries `companies`, so your Sample Company can't appear there. (It does exist in the DB — `Sample Company`, owned by you.)

## Why it feels like only "Fleet Manager" access

Two separate things:

1. On the company itself you already hold `company_owner` + `fleet_owner` roles, which grant every permission. So inside that company you should already have full access.
2. But `super_admin` is a **platform** role — it isn't wired into the per-company permission checks (`has_company_permission`, `isOwner`, `myRoles` UI gates). So if you ever visit a company you're *not* a member of (or get downgraded), you'd be blocked. Super admins should bypass those checks everywhere.

## Plan

### 1. Wire the Companies tab (real data)

Replace the placeholder with a real list backed by a new server function.

- New `src/lib/platform-admin.functions.ts`:
  - `listAllCompanies()` — super-admin-only; uses `supabaseAdmin` to return every company with: `id, name, owner_id, owner_email, member_count, created_at, status` (suspended flag if present, otherwise just active).
  - `setCompanySuspended({ companyId, suspended })` and `deleteCompany({ companyId })` — super-admin-only, guarded by `is_super_admin(auth.uid())`.
  - All handlers verify super_admin via `requireSupabaseAuth` + a `has_role(userId, 'super_admin')` check before touching `supabaseAdmin`.
- New `src/components/platform-admin/companies-tab.tsx`: searchable table (name, owner email, members, created, actions: View as / Suspend / Delete). "View as" links to existing impersonation flow (kept as placeholder if not yet wired).
- Update `platform.tsx` to render `<CompaniesTab />` inside the Companies `TabsContent` instead of the placeholder string.

### 2. Make super_admin a global override

Front-end:
- New helper `src/hooks/use-effective-company-access.ts` returning `{ isOwner, canManageMembers, canManageAll }` that ORs the existing checks with `useIsSuperAdmin()`.
- Update `src/routes/_authenticated/company.tsx` so `isOwner`, `canManageMembers`, the rename input `disabled`, and the roles label all treat super_admin as full access (label shows "Super Admin (platform)" when the user isn't actually a company member).
- Update `src/hooks/use-allowed-modules.ts` so super_admin gets all modules regardless of `FULL_ACCESS_ROLES`.

Database:
- New migration updating `public.has_company_permission(_user, _company, _permission)` to short-circuit `true` when `public.is_super_admin(_user)` is true. This is the single chokepoint every RLS policy already goes through, so it propagates platform-wide without touching individual policies.
- Add an RLS policy on `public.companies` allowing super_admin to `SELECT/UPDATE/DELETE` any row (used by the platform admin queries that go through the user-scoped client).

### 3. Verify

- Reload `/admin/platform` → Companies tab lists Sample Company with you as owner.
- Visit `/company` for Sample Company → header shows full owner controls (already true today, but now also true via the super_admin path).
- Spot-check: a non-super-admin user still sees only their own companies.

## Technical notes

- `is_super_admin` already exists; no new SECURITY DEFINER function needed for the check.
- The `has_company_permission` change is a function replacement (`CREATE OR REPLACE`) — no signature change, so existing policies keep working.
- `listAllCompanies` uses `supabaseAdmin` because we want to see *all* companies including ones the caller isn't a member of; the super-admin gate is enforced in the handler before any admin query runs.
- No new tables. No changes to auth flows.
