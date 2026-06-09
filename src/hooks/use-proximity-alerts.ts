import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation, distanceMiles } from "@/hooks/use-geolocation";
import { useActiveRoute } from "@/hooks/use-active-route";
import { getSafetyFeed } from "@/lib/safety-engine.functions";
import { hazardLabel } from "@/lib/navaroad";
import { recommendedActionFor } from "@/lib/hazard-proximity";
import { useBrowserNotifications } from "@/hooks/use-browser-notifications";
import { findNearbyTruckStops } from "@/lib/nearby-poi.functions";
import { useWeighStationStatuses } from "@/lib/weigh-stations";

export type ProximityAlertKind = "high_wind" | "road_closure" | "severe_weather" | "driver_report" | "weigh_station";

export type ProximityAlert = {
  uid: string; // hazard id, stable
  kind: ProximityAlertKind;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  source: string;
  distanceMi: number;
  recommendedAction: string;
  lat: number;
  lon: number;
  enteredAt: string;
};

// Radii per the product spec.
const RADIUS_MI: Record<ProximityAlertKind, number> = {
  high_wind: 25,
  road_closure: 25,
  severe_weather: 25,
  driver_report: 10,
  weigh_station: 1,
};

const SESSION_KEY = "navaroad.proximityFiredIds";

function readFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function writeFired(s: Set<string>) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

function classifyApiAlert(category: string, title: string): ProximityAlertKind | null {
  const c = category.toLowerCase();
  const t = title.toLowerCase();
  if (c === "road_closure" || c.includes("closure") || c.includes("detour")) return "road_closure";
  if (c === "high_wind" || /\bwind\b/.test(t) || /\bwind\b/.test(c)) return "high_wind";
  if (
    c === "tornado" || c === "thunderstorm" || c === "winter_storm" || c === "flood" ||
    c === "severe_weather" || c === "visibility" ||
    /tornado|thunder|storm|snow|flood|hail|ice|blizzard|hurricane/.test(t)
  ) return "severe_weather";
  return null;
}

/**
 * Live proximity alert feed. Subscribes to GPS, hazard reports, and the
 * safety feed (NWS + TomTom), and pushes banner events the moment a hazard
 * crosses its configured radius for the first time this session.
 * Cheap to keep mounted globally — relies on TanStack Query for dedupe.
 */
export function useProximityAlerts() {
  const geo = useGeolocation({ watch: true });
  const here = geo.coords ? { lat: geo.coords.lat, lon: geo.coords.lon } : null;
  const route = useActiveRoute();
  const feedFn = useServerFn(getSafetyFeed);

  const { data: feed } = useQuery({
    queryKey: ["safety-feed", route?.savedAt ?? "none"],
    queryFn: () => feedFn({ data: { geometry: route?.geometry ?? [] } }),
    enabled: !!route && route.geometry.length >= 2,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: hazards = [] } = useQuery({
    queryKey: ["map-hazards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hazard_reports")
        .select("*")
        .eq("status", "active")
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 2 * 60_000,
  });

  // Coarse coord bucket (~3 mi cells) so weigh-station refetches don't churn.
  const cellLat = here ? Math.round(here.lat * 20) / 20 : null;
  const cellLon = here ? Math.round(here.lon * 20) / 20 : null;
  const findPoi = useServerFn(findNearbyTruckStops);
  const { data: weighData } = useQuery({
    queryKey: ["nearby-weigh-stations", cellLat, cellLon],
    queryFn: () => findPoi({ data: { lat: here!.lat, lon: here!.lon, radiusMi: 50, kind: "weigh_station" } }),
    enabled: !!here,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  const { data: weighStatus } = useWeighStationStatuses();

  // Build candidate list (id, kind, severity, lat/lon, title, source, action helper).
  type Candidate = {
    uid: string; kind: ProximityAlertKind; severity: ProximityAlert["severity"];
    title: string; source: string; lat: number; lon: number;
    category: string; description?: string;
  };
  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    for (const a of feed?.weatherAlerts ?? []) {
      if (a.lat == null || a.lon == null) continue;
      const kind = classifyApiAlert(a.category, a.event);
      if (!kind) continue;
      out.push({
        uid: "wx-" + a.id, kind, severity: a.severity,
        title: a.event, source: `NWS (${a.provider})`,
        lat: a.lat, lon: a.lon, category: a.category, description: a.headline,
      });
    }
    for (const r of feed?.roadAlerts ?? []) {
      if (r.lat == null || r.lon == null) continue;
      if (r.category !== "road_closure") continue;
      out.push({
        uid: "rd-" + r.id, kind: "road_closure", severity: r.severity,
        title: `Road closure — ${r.roadway}`, source: `DOT (${r.provider})`,
        lat: r.lat, lon: r.lon, category: r.category, description: r.description,
      });
    }
    for (const h of hazards) {
      if (h.latitude == null || h.longitude == null) continue;
      out.push({
        uid: "dr-" + h.id, kind: "driver_report",
        severity: (h.severity ?? "medium") as ProximityAlert["severity"],
        title: hazardLabel(h.hazard_type), source: "Driver Report",
        lat: h.latitude, lon: h.longitude, category: h.hazard_type, description: h.description ?? undefined,
      });
    }
    for (const w of weighData?.pois ?? []) {
      const status = weighStatus?.get(w.id);
      const isOpen = status?.status === "open";
      const isClosed = status?.status === "closed";
      out.push({
        uid: "ws-" + w.id,
        kind: "weigh_station",
        severity: isOpen ? "high" : isClosed ? "low" : "medium",
        title: isOpen ? `Weigh station OPEN — ${w.name}` : isClosed ? `Weigh station closed — ${w.name}` : `Weigh station ahead — ${w.name}`,
        source: status ? "Driver report" : "TomTom",
        lat: w.lat,
        lon: w.lon,
        category: "weigh_station",
        description: [w.address, w.city, w.state].filter(Boolean).join(", "),
      });
    }
    return out;
  }, [feed, hazards, weighData, weighStatus]);

  const firedRef = useRef<Set<string>>(readFired());
  const [active, setActive] = useState<ProximityAlert[]>([]);
  const { notify } = useBrowserNotifications();

  // Detect new hazards that just entered their radius.
  useEffect(() => {
    if (!here) return;
    const additions: ProximityAlert[] = [];
    for (const c of candidates) {
      const d = distanceMiles(here, { lat: c.lat, lon: c.lon });
      if (d > RADIUS_MI[c.kind]) continue;
      if (firedRef.current.has(c.uid)) continue;
      firedRef.current.add(c.uid);
      additions.push({
        uid: c.uid,
        kind: c.kind,
        severity: c.severity,
        title: c.title,
        source: c.source,
        distanceMi: d,
        recommendedAction: c.kind === "weigh_station"
          ? (c.severity === "high"
              ? "Weigh station reported OPEN — slow down and prepare to pull in."
              : c.severity === "low"
                ? "Weigh station reported CLOSED — proceed with caution; conditions can change."
                : "Weigh station ahead within 1 mile — confirm status and be ready to enter.")
          : recommendedActionFor(
              { id: c.uid, title: c.title, category: c.category, severity: c.severity, lat: c.lat, lon: c.lon, source: c.source, description: c.description },
              d,
            ),
        lat: c.lat,
        lon: c.lon,
        enteredAt: new Date().toISOString(),
      });
    }
    if (additions.length > 0) {
      writeFired(firedRef.current);
      for (const a of additions) {
        if (a.severity === "critical" || a.severity === "high") {
          notify({
            title: `${a.title} · ${a.severity.toUpperCase()}`,
            body: `${a.distanceMi < 1 ? "<1 mi" : Math.round(a.distanceMi) + " mi"} away — ${a.recommendedAction}`,
            tag: a.uid,
          });
        }
      }
      // Newest critical first, cap at 5 visible.
      setActive((cur) => {
        const merged = [...additions, ...cur];
        merged.sort((a, b) => {
          const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
          return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
        });
        return merged.slice(0, 5);
      });
    }
  }, [candidates, here?.lat, here?.lon, notify]);

  const dismiss = (uid: string) => setActive((cur) => cur.filter((a) => a.uid !== uid));
  const dismissAll = () => setActive([]);

  return { alerts: active, dismiss, dismissAll };
}
