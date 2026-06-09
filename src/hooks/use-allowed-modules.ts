import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Role → allowed module paths. Fleet owners / company owners / fleet managers get everything.
 * /company and /profile are always visible.
 */
const ROLE_MODULES: Record<string, string[]> = {
  driver: ["/dashboard", "/hazard-map", "/parking", "/loads", "/inspections", "/documents", "/fuel", "/logbook"],
  dispatcher: ["/loads", "/dashboard", "/hazard-map", "/fleet-profitability"],
  safety_manager: ["/inspections", "/documents", "/logbook", "/hazard-map", "/assistant"],
  maintenance_manager: ["/maintenance", "/inspections"],
  accountant: ["/fuel", "/expenses", "/ifta", "/assistant", "/fleet-profitability"],
};

const FULL_ACCESS_ROLES = new Set(["fleet_owner", "company_owner", "fleet_manager"]);
const ALWAYS_VISIBLE = ["/company", "/profile"];

export function useAllowedModules() {
  const [state, setState] = useState<{ loading: boolean; allowed: Set<string> | null }>({
    loading: true,
    allowed: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) setState({ loading: false, allowed: new Set(ALWAYS_VISIBLE) });
        return;
      }
      // Super admins get full access regardless of company membership.
      const { data: saRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (saRow) {
        if (!cancelled) setState({ loading: false, allowed: null });
        return;
      }
      const { data: members } = await supabase
        .from("company_members")
        .select("id")
        .eq("user_id", u.user.id);
      const memberIds = (members ?? []).map((m: any) => m.id);
      if (memberIds.length === 0) {
        if (!cancelled) setState({ loading: false, allowed: new Set(ALWAYS_VISIBLE) });
        return;
      }
      const { data: roles } = await supabase
        .from("company_member_roles")
        .select("role")
        .in("member_id", memberIds);
      const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));

      const allowed = new Set<string>(ALWAYS_VISIBLE);
      let fullAccess = false;
      for (const r of roleSet) {
        if (FULL_ACCESS_ROLES.has(r)) { fullAccess = true; break; }
        for (const path of ROLE_MODULES[r] ?? []) allowed.add(path);
      }
      if (!cancelled) {
        setState({ loading: false, allowed: fullAccess ? null : allowed });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** null = full access (show all). Otherwise only paths in the set are allowed. */
  return state;
}
