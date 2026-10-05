import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import {
  FLEETOS_MODULES,
  resolveVisibleModules,
} from "@/lib/fleetos/module-registry";
import type { CompanyRole } from "@/lib/company.shared";

const FULL_ACCESS_ROLES = new Set<CompanyRole>([
  "fleet_owner",
  "fleet_manager",
]);

type RoleState = {
  loading: boolean;
  roles: Set<CompanyRole>;
  /** true = super admin OR full-access company role. */
  fullAccess: boolean;
};

/**
 * Derives the set of route paths the current user is allowed to see, using:
 *   - the FleetOS module registry (`src/lib/fleetos/module-registry.ts`)
 *   - the user's company roles
 *   - the company's subscription entitlements (`plan_feature_access`)
 *
 * Returns `{ loading, allowed }` where `allowed`:
 *   - `null`  = full access, show everything (super admin / fleet owner / fleet manager)
 *   - `Set`   = only these route paths are permitted
 *
 * Same shape as before — nav components filter on `allowed.has(route)`.
 */
export function useAllowedModules() {
  const [roleState, setRoleState] = useState<RoleState>({
    loading: true,
    roles: new Set(),
    fullAccess: false,
  });
  const { data: subscription, isLoading: subLoading } = useSubscription();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) setRoleState({ loading: false, roles: new Set(), fullAccess: false });
        return;
      }
      // Super admins bypass everything.
      const { data: saRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (saRow) {
        if (!cancelled) setRoleState({ loading: false, roles: new Set(), fullAccess: true });
        return;
      }
      const { data: members } = await supabase
        .from("company_members")
        .select("id")
        .eq("user_id", u.user.id);
      const memberIds = (members ?? []).map((m: any) => m.id);
      if (memberIds.length === 0) {
        if (!cancelled) setRoleState({ loading: false, roles: new Set(), fullAccess: false });
        return;
      }
      const { data: roleRows } = await supabase
        .from("company_member_roles")
        .select("role")
        .in("member_id", memberIds);
      const roles = new Set<CompanyRole>(
        (roleRows ?? []).map((r: any) => r.role as CompanyRole),
      );
      const fullAccess = [...roles].some((r) => FULL_ACCESS_ROLES.has(r));
      if (!cancelled) setRoleState({ loading: false, roles, fullAccess });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = roleState.loading || subLoading;

  if (loading) return { loading: true, allowed: new Set<string>() };

  // Super admin / fleet owner / fleet manager: full access.
  if (roleState.fullAccess) return { loading: false, allowed: null as Set<string> | null };

  // No company membership yet: only always-available modules.
  if (roleState.roles.size === 0) {
    const alwaysOn = new Set<string>();
    for (const m of FLEETOS_MODULES) {
      if (m.alwaysAvailable) for (const r of m.routes) alwaysOn.add(r);
    }
    return { loading: false, allowed: alwaysOn };
  }

  const featureEnabled = (key: string) => {
    // No subscription record yet → treat everything as enabled so a fresh
    // company isn't locked out; entitlements take over once it loads.
    if (!subscription) return true;
    const f = subscription.features?.[key];
    // Unlisted feature keys default to enabled (module ships before catalog row).
    if (!f) return true;
    return f.enabled;
  };

  const visible = resolveVisibleModules(roleState.roles, featureEnabled, false);
  const allowed = new Set<string>();
  for (const m of visible) for (const r of m.routes) allowed.add(r);
  return { loading: false, allowed };
}
