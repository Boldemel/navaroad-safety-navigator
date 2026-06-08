import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WeighStatus = "open" | "closed";

export type LatestStatus = {
  status: WeighStatus;
  station_name: string | null;
  created_at: string;
  expires_at: string;
};

/** Fetch latest non-expired status for every reported station. */
export function useWeighStationStatuses() {
  return useQuery({
    queryKey: ["weigh-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weigh_station_status")
        .select("station_id, status, station_name, created_at, expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, LatestStatus>();
      for (const row of data ?? []) {
        if (!latest.has(row.station_id)) {
          latest.set(row.station_id, {
            status: row.status as WeighStatus,
            station_name: row.station_name,
            created_at: row.created_at,
            expires_at: row.expires_at,
          });
        }
      }
      return latest;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useReportWeighStationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      stationId: string;
      stationName?: string | null;
      lat: number;
      lon: number;
      status: WeighStatus;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sign in required");
      const { error } = await supabase.from("weigh_station_status").insert({
        station_id: input.stationId,
        station_name: input.stationName ?? null,
        latitude: input.lat,
        longitude: input.lon,
        status: input.status,
        reporter_id: u.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weigh-status"] }),
  });
}
