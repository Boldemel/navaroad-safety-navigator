import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Map of profile id -> driver_name for all known drivers. */
export function useDriverNames() {
  return useQuery({
    queryKey: ["driver-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, driver_name");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.driver_name ?? "Driver";
      return map;
    },
    staleTime: 60_000,
  });
}
