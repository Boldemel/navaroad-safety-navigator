import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Returns true if the current signed-in user has the `super_admin` platform role. */
export function useIsSuperAdmin() {
  const [state, setState] = useState<{ loading: boolean; isSuperAdmin: boolean }>({
    loading: true,
    isSuperAdmin: false,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) setState({ loading: false, isSuperAdmin: false });
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!cancelled) setState({ loading: false, isSuperAdmin: !!data });
    })();
    return () => { cancelled = true; };
  }, []);
  return state;
}
