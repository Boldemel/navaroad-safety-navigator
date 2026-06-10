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
export type ProximityAlertKind = "high_wind" | "road_closure" | "severe_weather" | "driver_report";

/**
 * Tier of an active proximity alert:
 * - `notice`   first heads-up — driver has time to plan a reroute
 * - `action`   take action now — change lanes, slow down, decide bypass
 * - `critical` immediate — closest range, flashes red on the nav banner
 */
export type ProximityTier = "notice" | "action" | "critical";

export type ProximityAlert = {
  uid: string; // hazard id, stable
  kind: ProximityAlertKind;
  severity: "low" | "medium" | "high" | "critical";
  tier: ProximityTier;
  title: string;
  source: string;
  distanceMi: number;
  recommendedAction: string;
  lat: number;
  lon: number;
  enteredAt: string;
};

/**
 * Tiered trigger distances (miles) by alert kind. Tuned for highway speeds so
 * drivers get a true heads-up (`notice`), a decision window (`action`), and a
 * last-mile critical flash. Hazards that demand a full reroute (closures,
 * severe weather) get the longest notice radius.
const TIERS: Record<ProximityAlertKind, { notice: number; action: number; critical: number }> = {
  road_closure:    { notice: 15, action: 5,  critical: 2 },
  severe_weather:  { notice: 25, action: 10, critical: 3 },
  high_wind:       { notice: 25, action: 10, critical: 5 },
  driver_report:   { notice: 10, action: 3,  critical: 1 },
};
};

function tierFor(kind: ProximityAlertKind, distanceMi: number): ProximityTier | null {
  const t = TIERS[kind];
  if (distanceMi <= t.critical) return "critical";
  if (distanceMi <= t.action) return "action";
  if (distanceMi <= t.notice) return "notice";
  return null;
}

const TIER_RANK: Record<ProximityTier, number> = { notice: 1, action: 2, critical: 3 };

const SESSION_KEY = "navaroad.proximityFiredTiers";

function readFired(): Map<string, ProximityTier> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return new Map(raw ? (JSON.parse(raw) as Array<[string, ProximityTier]>) : []);
  } catch { return new Map(); }
}
function writeFired(m: Map<string, ProximityTier>) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...m.entries()])); } catch { /* ignore */ }
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

function weighStationAction(severity: ProximityAlert["severity"], tier: ProximityTier): string {
  const open = severity === "high";
  const closed = severity === "low";
  if (tier === "critical") {
    return open
      ? "Weigh station OPEN within 1 mile — slow down and prepare to pull in."
      : closed
        ? "Weigh station within 1 mile (reported CLOSED) — proceed with caution."
        : "Weigh station within 1 mile — confirm status and be ready to enter.";
  }
  if (tier === "action") {
    return open
      ? "Open weigh station ~2 mi ahead — move to the right lane."
      : "Weigh station ~2 mi ahead — confirm status and lane position.";
  }
  return open
    ? "Open weigh station ~3 mi ahead — plan your lane change."
    : "Weigh station ~3 mi ahead — heads up.";
}

function tieredAction(
  kind: ProximityAlertKind,
  baseAction: string,
  tier: ProximityTier,
  distanceMi: number,
): string {
  if (kind === "road_closure") {
    if (tier === "critical") return "Road closure within 2 mi — reroute is closing fast.";
    if (tier === "action") return "Road closure ~5 mi ahead — pick an alternate route now.";
    return "Road closure ~10+ mi ahead — start planning a detour.";
  }
  if (tier === "notice") {
    const miles = distanceMi < 1 ? "less than a mile" : `${Math.round(distanceMi)} mi`;
    return `Heads up: ${baseAction.replace(/\.$/, "")} (${miles} ahead).`;
  }
  return baseAction;
}

/**
 * Live proximity alert feed. Subscribes to GPS, hazard reports, and the
 * safety feed (NWS + TomTom), and pushes banner events as a hazard crosses
 * each tier threshold (notice → action → critical). Cheap to keep mounted
 * globally — relies on TanStack Query for dedupe.
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

  const firedRef = useRef<Map<string, ProximityTier>>(readFired());
  const [active, setActive] = useState<ProximityAlert[]>([]);
  const { notify } = useBrowserNotifications();

  // Detect hazards entering a new (deeper) tier and refresh distances of active ones.
  useEffect(() => {
    if (!here) return;
    const newOrUpgraded: ProximityAlert[] = [];
    const liveByUid = new Map<string, ProximityAlert>();

    for (const c of candidates) {
      const d = distanceMiles(here, { lat: c.lat, lon: c.lon });
      const tier = tierFor(c.kind, d);
      if (!tier) continue;
      const prev = firedRef.current.get(c.uid);
      const isUpgrade = !prev || TIER_RANK[tier] > TIER_RANK[prev];
      const baseAction = c.kind === "weigh_station"
        ? weighStationAction(c.severity, tier)
        : tieredAction(
            c.kind,
            recommendedActionFor(
              { id: c.uid, title: c.title, category: c.category, severity: c.severity, lat: c.lat, lon: c.lon, source: c.source, description: c.description },
              d,
            ),
            tier,
            d,
          );
      const alert: ProximityAlert = {
        uid: c.uid,
        kind: c.kind,
        severity: c.severity,
        tier,
        title: c.title,
        source: c.source,
        distanceMi: d,
        recommendedAction: baseAction,
        lat: c.lat,
        lon: c.lon,
        enteredAt: new Date().toISOString(),
      };
      liveByUid.set(c.uid, alert);
      if (isUpgrade) {
        firedRef.current.set(c.uid, tier);
        newOrUpgraded.push(alert);
      }
    }

    if (newOrUpgraded.length > 0) writeFired(firedRef.current);

    for (const a of newOrUpgraded) {
      if (a.tier === "critical" || (a.tier === "action" && (a.severity === "critical" || a.severity === "high"))) {
        notify({
          title: `${a.title} · ${a.tier.toUpperCase()}`,
          body: `${a.distanceMi < 1 ? "<1 mi" : Math.round(a.distanceMi) + " mi"} away — ${a.recommendedAction}`,
          tag: `${a.uid}:${a.tier}`,
        });
      }
    }

    // Merge: keep already-active alerts (with refreshed distance/tier) + new upgrades.
    setActive((cur) => {
      const merged = new Map<string, ProximityAlert>();
      for (const a of cur) {
        const refreshed = liveByUid.get(a.uid);
        if (refreshed) merged.set(a.uid, { ...refreshed, enteredAt: a.enteredAt });
      }
      for (const a of newOrUpgraded) merged.set(a.uid, a);
      const arr = [...merged.values()];
      arr.sort((a, b) => {
        const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
        if (tierDiff !== 0) return tierDiff;
        const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
        return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
      });
      return arr.slice(0, 5);
    });
  }, [candidates, here?.lat, here?.lon, notify]);

  const dismiss = (uid: string) => setActive((cur) => cur.filter((a) => a.uid !== uid));
  const dismissAll = () => setActive([]);

  return { alerts: active, dismiss, dismissAll };
}
