import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Wind, AlertTriangle, Construction, Trash2, Car, ParkingCircleOff, CloudRain,
  CloudLightning, Clock, User, Cloud, Radio, MapPin, LocateFixed, Megaphone,
} from "lucide-react";
import { HAZARD_TYPES, hazardLabel, severityClasses } from "@/lib/navaroad";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useDriverNames } from "@/hooks/use-driver-names";
import { formatDistanceToNow } from "date-fns";
import { getSafetyFeed } from "@/lib/safety-engine.functions";
import { getTomTomKey } from "@/lib/tomtom.functions";
import { TomTomMap, type MapMarker } from "@/components/tomtom-map";
import { useActiveRoute } from "@/hooks/use-active-route";
import { useGeolocation } from "@/hooks/use-geolocation";
import { hazardsWithin, nearestHazardAlert, type HazardLike } from "@/lib/hazard-proximity";


export const Route = createFileRoute("/_authenticated/hazard-map")({
  component: HazardMap,
});

const HAZARD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  high_wind: Wind,
  accident: Car,
  road_closure: AlertTriangle,
  construction: Construction,
  debris: Trash2,
  parking_full: ParkingCircleOff,
  flooding: CloudRain,
  severe_weather: CloudLightning,
  tornado: CloudLightning,
  winter_storm: CloudRain,
  flood: CloudRain,
  thunderstorm: CloudLightning,
  visibility: Cloud,
  detour: AlertTriangle,
  chain_restriction: AlertTriangle,
  incident: Car,
};

type Marker = {
  id: string;
  layer: "api" | "driver";
  source: string;
  category: string;
  severity: string;
  title: string;
  location: string;
  description: string;
  updatedAt: string;
  reporter_id?: string | null;
  lat?: number | null;
  lon?: number | null;
};

function HazardMap() {
  const [showApi, setShowApi] = useState(true);
  const [showDriver, setShowDriver] = useState(true);
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(HAZARD_TYPES.map((h) => h.value)));
  useRealtimeInvalidate(["hazard_reports"], [["map-hazards"], ["driver-names"]]);

  const { data: drivers = {} } = useDriverNames();
  const feedFn = useServerFn(getSafetyFeed);
  const tomtomKeyFn = useServerFn(getTomTomKey);
  const activeRoute = useActiveRoute();
  const geometry = activeRoute?.geometry ?? [];
  const geo = useGeolocation({ watch: true });


  const { data: tomtom } = useQuery({
    queryKey: ["tomtom-key"],
    queryFn: () => tomtomKeyFn(),
    staleTime: Infinity,
  });

  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ["safety-feed", activeRoute?.savedAt ?? "none"],
    queryFn: () => feedFn({ data: { geometry } }),
    enabled: geometry.length >= 2,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: hazards = [], isLoading: hazardsLoading } = useQuery({
    queryKey: ["map-hazards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hazard_reports").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const apiMarkers: Marker[] = useMemo(() => {
    const weather: Marker[] = (feed?.weatherAlerts ?? []).map((a) => ({
      id: a.id, layer: "api", source: `NWS (${a.provider})`,
      category: a.category, severity: a.severity, title: a.event,
      location: a.areaDesc, description: a.headline, updatedAt: a.effective,
      lat: a.lat ?? null, lon: a.lon ?? null,
    }));
    const road: Marker[] = (feed?.roadAlerts ?? []).map((r) => ({
      id: r.id, layer: "api", source: `DOT (${r.provider})`,
      category: r.category, severity: r.severity, title: r.category.replace(/_/g, " "),
      location: `${r.roadway} — ${r.location}`, description: r.description, updatedAt: r.updatedAt,
      lat: r.lat ?? null, lon: r.lon ?? null,
    }));
    return [...weather, ...road];
  }, [feed]);

  const driverMarkers: Marker[] = useMemo(
    () =>
      hazards.map((h) => ({
        id: h.id, layer: "driver", source: "Driver Report",
        category: h.hazard_type, severity: h.severity, title: hazardLabel(h.hazard_type),
        location: h.location, description: h.description ?? "", updatedAt: h.created_at,
        reporter_id: h.reporter_id,
        lat: h.latitude ?? null, lon: h.longitude ?? null,
      })),
    [hazards],
  );

  const visibleApi = showApi ? apiMarkers : [];
  const visibleDriver = showDriver ? driverMarkers.filter((m) => typeFilters.has(m.category)) : [];
  const allVisible = [...visibleApi, ...visibleDriver].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
  );
  const loading = feedLoading || hazardsLoading;

  // Proximity (25mi from current GPS) — works regardless of active route.
  const allHazardsForProximity: HazardLike[] = useMemo(
    () => [...apiMarkers, ...driverMarkers].map((m) => ({
      id: m.layer + m.id, title: m.title, category: m.category, severity: m.severity,
      lat: m.lat, lon: m.lon, source: m.source, description: m.description,
    })),
    [apiMarkers, driverMarkers],
  );
  const here = geo.coords ? { lat: geo.coords.lat, lon: geo.coords.lon } : null;
  const nearby = useMemo(
    () => (here ? hazardsWithin(here, allHazardsForProximity, 25) : []),
    [here, allHazardsForProximity],
  );
  const voiceAlert = useMemo(
    () => nearestHazardAlert(here, allHazardsForProximity),
    [here, allHazardsForProximity],
  );

  function toggleType(v: string) {
    setTypeFilters((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v); else n.add(v);
      return n;
    });
  }


  return (
    <div className="p-4 md:p-8 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Hazard Map</h1>
          <p className="text-muted-foreground text-sm">
            Live NWS weather alerts, TomTom incidents, and driver reports — scoped to your route.
            {activeRoute ? (
              <> Showing alerts along <span className="text-foreground">{activeRoute.origin} → {activeRoute.destination}</span>.</>
            ) : (
              <> Analyze a route on the Dashboard to load route-scoped hazards.</>
            )}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-full border border-border bg-card px-3 py-1.5">
          <Radio className={`size-3 ${loading ? "animate-pulse" : "text-success"}`} />
          {loading
            ? "Loading live sources…"
            : `${apiMarkers.length} API hazards · ${driverMarkers.length} driver reports · updated ${feed?.generatedAt ? new Date(feed.generatedAt).toLocaleTimeString() : "—"}`}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Layers:</span>
        <button
          onClick={() => setShowApi((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
            showApi ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <Cloud className="size-3.5" /> API hazards ({apiMarkers.length})
        </button>
        <button
          onClick={() => setShowDriver((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
            showDriver ? "border-warning/40 bg-warning/15 text-warning" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="size-3.5" /> Driver reports ({driverMarkers.length})
        </button>
      </div>

      {showDriver && (
        <div className="flex flex-wrap gap-2">
          {HAZARD_TYPES.map((t) => {
            const active = typeFilters.has(t.value);
            const Icon = HAZARD_ICONS[t.value] ?? AlertTriangle;
            return (
              <button
                key={t.value}
                onClick={() => toggleType(t.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
                  active ? "border-border bg-card text-foreground" : "border-border bg-card text-muted-foreground/60 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative aspect-[16/8] overflow-hidden">
        <TomTomMap
          tomtomKey={tomtom?.key ?? null}
          showTraffic
          height="100%"
          routeGeometry={geometry}
          markers={allVisible
            .filter((m): m is Marker & { lat: number; lon: number } => m.lat != null && m.lon != null)
            .map<MapMarker>((m) => ({
              id: m.layer + m.id,
              lat: m.lat,
              lon: m.lon,
              title: m.title,
              description: `${m.source} · ${m.location}`,
              color:
                m.layer === "driver"
                  ? "#f59e0b"
                  : m.severity === "critical" || m.severity === "high"
                    ? "#ef4444"
                    : "#3b82f6",
            }))}
        />
      </div>

      {activeRoute && !loading && apiMarkers.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          No hazards detected on this route.
        </div>
      )}
      {activeRoute && !loading && apiMarkers.length > 0 && allVisible.length < apiMarkers.length + driverMarkers.length && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          {(apiMarkers.length + driverMarkers.length) - allVisible.length} hazard(s) hidden by active filters — toggle layers or hazard types above to show them.
        </div>
      )}


      <div className="space-y-2">
        {loading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading live hazards…
          </div>
        )}
        {!loading && allVisible.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No live hazards from connected sources right now.
          </div>
        )}
        {allVisible.map((m) => {
          const Icon = HAZARD_ICONS[m.category] ?? AlertTriangle;
          const driver = m.reporter_id ? drivers[m.reporter_id] : null;
          return (
            <div key={m.layer + m.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
              <div
                className={cn(
                  "size-9 rounded-md border flex items-center justify-center shrink-0",
                  m.layer === "api"
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-warning/10 border-warning/30 text-warning",
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(m.severity)}`}>
                    {m.severity}
                  </span>
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border">
                    Source: {m.source}
                  </span>
                  <div className="flex-1" />
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="size-3" /> {formatDistanceToNow(new Date(m.updatedAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="mt-2 font-medium">{m.title}</div>
                <div className="text-sm text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                  <MapPin className="size-3.5" /> {m.location}
                  {m.lat != null && m.lon != null && (
                    <span className="ml-2 text-[11px]">({m.lat.toFixed(3)}, {m.lon.toFixed(3)})</span>
                  )}
                </div>
                {m.description && <p className="mt-1 text-sm line-clamp-3">{m.description}</p>}
                {m.layer === "driver" && (
                  <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                    <User className="size-3" /> Reported by {driver ?? "a driver"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {allVisible.length} hazard{allVisible.length === 1 ? "" : "s"} ({visibleApi.length} from APIs, {visibleDriver.length} from drivers)
      </div>
    </div>
  );
}
