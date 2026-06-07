import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { announceHazard } from "@/hooks/use-voice-guidance";
import { useVoiceSettings } from "@/lib/voice/voice-settings";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Wind, AlertTriangle, Construction, Trash2, Car, ParkingCircleOff, CloudRain,
  CloudLightning, Clock, User, Cloud, Radio, MapPin, LocateFixed, Megaphone,
  Truck, Scale, TreePine,
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
import { hazardsWithin, hazardsAlongRoute, nearestHazardAlert, type HazardLike } from "@/lib/hazard-proximity";
import { searchTruckPois, type TruckPoiResult } from "@/lib/poi-search.functions";
import { DriveModePanel } from "@/components/drive-mode-panel";

// POI marker colors (kept in sync with the legend below).
const POI_COLORS = {
  truck_stop: "#f97316",   // orange
  rest_area: "#10b981",    // emerald
  weigh_station: "#a855f7", // violet
} as const;

function samplePoiGeometry(geom: Array<[number, number]>, maxPoints: number) {
  if (geom.length <= maxPoints) return geom;
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(geom[Math.floor((i / (maxPoints - 1)) * (geom.length - 1))]);
  }
  return sampled;
}

// LocalStorage-backed cache for POIs so the map shows the last-seen icons
// immediately on revisit while fresh results load in the background.
type PoiKind = "truck_stop" | "rest_area" | "weigh_station";
type CachedPois = TruckPoiResult;
const POI_CACHE_PREFIX = "navaroad.poiCache.";
function poiCacheKey(kind: PoiKind, routeKey: string) {
  return `${POI_CACHE_PREFIX}${kind}.${routeKey}`;
}
type PoiCacheEntry = { at: number; data: CachedPois };
function readPoiCache(kind: PoiKind, routeKey: string): CachedPois | undefined {
  if (typeof window === "undefined" || routeKey === "none") return undefined;
  try {
    const raw = window.localStorage.getItem(poiCacheKey(kind, routeKey));
    if (!raw) return undefined;
    return (JSON.parse(raw) as PoiCacheEntry).data;
  } catch { return undefined; }
}
function readPoiCacheAt(kind: PoiKind, routeKey: string): number | undefined {
  if (typeof window === "undefined" || routeKey === "none") return undefined;
  try {
    const raw = window.localStorage.getItem(poiCacheKey(kind, routeKey));
    if (!raw) return undefined;
    return (JSON.parse(raw) as PoiCacheEntry).at;
  } catch { return undefined; }
}
function writePoiCache(kind: PoiKind, routeKey: string, data: CachedPois) {
  if (typeof window === "undefined" || routeKey === "none") return;
  try {
    window.localStorage.setItem(poiCacheKey(kind, routeKey), JSON.stringify({ at: Date.now(), data } satisfies PoiCacheEntry));
  } catch { /* ignore quota */ }
}


export const Route = createFileRoute("/_authenticated/hazard-map")({
  component: HazardMap,
  validateSearch: (search: Record<string, unknown>) => ({
    focusLat: typeof search.focusLat === "number" ? search.focusLat
      : typeof search.focusLat === "string" ? Number(search.focusLat) : undefined,
    focusLon: typeof search.focusLon === "number" ? search.focusLon
      : typeof search.focusLon === "string" ? Number(search.focusLon) : undefined,
    focusLabel: typeof search.focusLabel === "string" ? search.focusLabel : undefined,
    focusDetails: typeof search.focusDetails === "string" ? search.focusDetails : undefined,
  }),
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
  const [showTruckStops, setShowTruckStops] = useState(true);
  const [showRestAreas, setShowRestAreas] = useState(true);
  const [showWeighStations, setShowWeighStations] = useState(true);
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(HAZARD_TYPES.map((h) => h.value)));
  const [driveActive, setDriveActive] = useState(false);
  const [follow, setFollow] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  useRealtimeInvalidate(["hazard_reports"], [["map-hazards"], ["driver-names"]]);
  const poiFn = useServerFn(searchTruckPois);

  const { data: drivers = {} } = useDriverNames();
  const feedFn = useServerFn(getSafetyFeed);
  const tomtomKeyFn = useServerFn(getTomTomKey);
  const activeRoute = useActiveRoute();
  const geometry = activeRoute?.geometry ?? [];
  const geo = useGeolocation({ watch: true });
  const { focusLat, focusLon, focusLabel, focusDetails } = Route.useSearch();
  const navigate = Route.useNavigate();
  const hasFocus = Number.isFinite(focusLat) && Number.isFinite(focusLon);
  const focusPoint = hasFocus ? { lat: focusLat as number, lon: focusLon as number } : null;
  const clearFocus = () => navigate({ search: { focusLat: undefined, focusLon: undefined, focusLabel: undefined, focusDetails: undefined }, replace: true } as never);


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

  // Truck-friendly POIs along the active route, or around current GPS as a
  // fallback so the map isn't empty when no route has been analyzed yet.
  const poiGeometry = useMemo(() => {
    if (geometry.length >= 2) return samplePoiGeometry(geometry, 1000);
    if (geo.coords) {
      // Build a tiny 2-point "route" centered on the driver so the same
      // server fn (which expects a geometry) can search nearby POIs.
      const { lat, lon } = geo.coords;
      const d = 0.25; // ~17 mi box
      return [
        [lon - d, lat - d] as [number, number],
        [lon + d, lat + d] as [number, number],
      ];
    }
    return [];
  }, [geometry, geo.coords?.lat, geo.coords?.lon]);
  const poiEnabled = poiGeometry.length >= 2;
  const routeKey = activeRoute?.savedAt ?? (geo.coords ? `here-${geo.coords.lat.toFixed(2)}-${geo.coords.lon.toFixed(2)}` : "none");
  const { data: truckStopsData } = useQuery({
    queryKey: ["hazard-map-truck-stops", routeKey],
    queryFn: () => poiFn({ data: { geometry: poiGeometry, kind: "truck_stop", limit: 100 } }),
    enabled: poiEnabled,
    staleTime: 10 * 60_000,
    initialData: () => readPoiCache("truck_stop", routeKey),
    initialDataUpdatedAt: () => readPoiCacheAt("truck_stop", routeKey),
  });
  const { data: restAreasData } = useQuery({
    queryKey: ["hazard-map-rest-areas", routeKey],
    queryFn: () => poiFn({ data: { geometry: poiGeometry, kind: "rest_area", limit: 100 } }),
    enabled: poiEnabled,
    staleTime: 10 * 60_000,
    initialData: () => readPoiCache("rest_area", routeKey),
    initialDataUpdatedAt: () => readPoiCacheAt("rest_area", routeKey),
  });
  const { data: weighStationsData } = useQuery({
    queryKey: ["hazard-map-weigh-stations", routeKey],
    queryFn: () => poiFn({ data: { geometry: poiGeometry, kind: "weigh_station", limit: 100 } }),
    enabled: poiEnabled,
    staleTime: 10 * 60_000,
    initialData: () => readPoiCache("weigh_station", routeKey),
    initialDataUpdatedAt: () => readPoiCacheAt("weigh_station", routeKey),
  });
  useEffect(() => { if (truckStopsData) writePoiCache("truck_stop", routeKey, truckStopsData); }, [truckStopsData, routeKey]);
  useEffect(() => { if (restAreasData) writePoiCache("rest_area", routeKey, restAreasData); }, [restAreasData, routeKey]);
  useEffect(() => { if (weighStationsData) writePoiCache("weigh_station", routeKey, weighStationsData); }, [weighStationsData, routeKey]);



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
  const onRoute = useMemo(
    () => (geometry.length >= 2 ? hazardsAlongRoute(geometry, allHazardsForProximity, 10) : []),
    [geometry, allHazardsForProximity],
  );
  // Voice alert prioritises on-route hazards (within 10 mi corridor of the
  // active route) over generic 25mi-from-driver proximity.
  const voiceAlert = useMemo(
    () => nearestHazardAlert(here, onRoute.length ? onRoute : allHazardsForProximity),
    [here, onRoute, allHazardsForProximity],
  );

  // Speak the highest-priority hazard whenever it changes (deduped by id in the
  // voice engine so the same alert is not announced twice).
  const [voiceSettings] = useVoiceSettings();
  const lastSpokenAlertRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceAlert || voiceSettings.muted || !voiceSettings.hazardAlerts) return;
    if (lastSpokenAlertRef.current === voiceAlert.hazard.id) return;
    lastSpokenAlertRef.current = voiceAlert.hazard.id;
    announceHazard({ id: voiceAlert.hazard.id, title: voiceAlert.speakable, severity: voiceAlert.severity });
  }, [voiceAlert, voiceSettings.muted, voiceSettings.hazardAlerts]);


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
        <button
          onClick={() => setShowTruckStops((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
            showTruckStops ? "border-[color:var(--legend-truck,#f97316)]/50 bg-orange-500/15 text-orange-500" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <Truck className="size-3.5" /> Truck stops ({truckStopsData?.pois.length ?? 0})
        </button>
        <button
          onClick={() => setShowRestAreas((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
            showRestAreas ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <TreePine className="size-3.5" /> Rest areas ({restAreasData?.pois.length ?? 0})
        </button>
        <button
          onClick={() => setShowWeighStations((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
            showWeighStations ? "border-violet-500/50 bg-violet-500/15 text-violet-500" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <Scale className="size-3.5" /> Weigh stations ({weighStationsData?.pois.length ?? 0})
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

      {/* GPS status / request bar */}
      <div className="rounded-xl border border-border bg-card p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <LocateFixed className={cn("size-3.5", geo.status === "granted" ? "text-success" : "text-muted-foreground")} />
          {geo.status === "granted" && here
            ? <>Your location: <span className="text-foreground">{here.lat.toFixed(4)}, {here.lon.toFixed(4)}</span>{geo.coords?.accuracyM != null && <> · ±{Math.round(geo.coords.accuracyM)}m</>}</>
            : geo.status === "denied"
              ? <span className="text-destructive">Location access is needed for live route safety alerts.</span>
              : geo.status === "unavailable"
                ? <>Geolocation not supported in this browser.</>
                : <>Share your GPS location to see hazards within 25 miles.</>}
        </div>
        {geo.status !== "granted" && geo.status !== "unavailable" && (
          <button
            type="button"
            onClick={geo.request}
            disabled={geo.status === "prompting"}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/15 disabled:opacity-60"
          >
            <LocateFixed className="size-3.5" />
            {geo.status === "prompting" ? "Requesting…" : "Use my current location"}
          </button>
        )}
      </div>

      {voiceAlert && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm flex items-start gap-2">
          <Megaphone className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-warning font-medium">Nearest hazard (voice-alert preview)</div>
            <div className="font-medium mt-0.5">{voiceAlert.hazard.title}</div>
            <div className="text-xs text-muted-foreground">
              {voiceAlert.distanceMi < 1 ? "<1 mi" : `${Math.round(voiceAlert.distanceMi)} mi`} away · severity <span className="uppercase">{voiceAlert.severity}</span>
            </div>
            <div className="text-xs mt-1">{voiceAlert.recommendedAction}</div>
          </div>
        </div>
      )}

      {focusPoint && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm flex items-center gap-2">
          <MapPin className="size-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{focusLabel ?? "Selected location"}</div>
            <div className="text-xs text-muted-foreground">{focusDetails ? `${focusDetails} · ` : ""}{focusPoint.lat.toFixed(4)}, {focusPoint.lon.toFixed(4)}</div>
          </div>
          <button onClick={clearFocus} className="text-xs text-primary underline">Show all hazards</button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative aspect-[16/8] overflow-hidden">
          <TomTomMap
            tomtomKey={tomtom?.key ?? null}
            showTraffic
            height="100%"
            routeGeometry={focusPoint ? [] : geometry}
            currentLocation={focusPoint ? null : here}
            markers={focusPoint
              ? [{ id: "focus", lat: focusPoint.lat, lon: focusPoint.lon, title: focusLabel ?? "Selected location", description: focusDetails, color: "#22c55e", iconKey: "pin" }]
              : [
                  ...allVisible
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
                      iconKey:
                        m.layer === "driver"
                          ? "driver"
                          : m.severity === "critical" || m.severity === "high"
                            ? "hazard"
                            : "weather",
                    })),
                  ...(showTruckStops ? (truckStopsData?.pois ?? []) : []).map<MapMarker>((p) => ({
                    id: "ts-" + p.id,
                    lat: p.lat,
                    lon: p.lon,
                    title: p.name,
                    description: `Truck stop · ${p.address || `${p.city ?? ""} ${p.state ?? ""}`.trim() || p.source}`,
                    color: POI_COLORS.truck_stop,
                    iconKey: "truck_stop",
                  })),
                  ...(showRestAreas ? (restAreasData?.pois ?? []) : []).map<MapMarker>((p) => ({
                    id: "ra-" + p.id,
                    lat: p.lat,
                    lon: p.lon,
                    title: p.name,
                    description: `Rest area · ${p.address || `${p.city ?? ""} ${p.state ?? ""}`.trim() || p.source}`,
                    color: POI_COLORS.rest_area,
                    iconKey: "rest_area",
                  })),
                  ...(showWeighStations ? (weighStationsData?.pois ?? []) : []).map<MapMarker>((p) => ({
                    id: "ws-" + p.id,
                    lat: p.lat,
                    lon: p.lon,
                    title: p.name,
                    description: `Weigh station · ${p.address || `${p.city ?? ""} ${p.state ?? ""}`.trim() || p.source}`,
                    color: POI_COLORS.weigh_station,
                    iconKey: "weigh_station",
                  })),
                ]}
          />
        </div>

        {/* Map key / legend */}
        <aside className="rounded-xl border border-border bg-card p-3 text-xs space-y-3 h-fit">
          <div className="font-medium text-sm">Map Key</div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hazards</div>
            <LegendRow color="#ef4444" icon={<AlertTriangle className="size-3.5" />} label="High / critical alert" />
            <LegendRow color="#3b82f6" icon={<Cloud className="size-3.5" />} label="Weather / road alert" />
            <LegendRow color="#f59e0b" icon={<User className="size-3.5" />} label="Driver report" />
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Truck POIs</div>
            <LegendRow color={POI_COLORS.truck_stop} icon={<Truck className="size-3.5" />} label="Truck stop / travel center" />
            <LegendRow color={POI_COLORS.rest_area} icon={<TreePine className="size-3.5" />} label="Rest area / welcome center" />
            <LegendRow color={POI_COLORS.weigh_station} icon={<Scale className="size-3.5" />} label="Weigh / inspection station" />
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Other</div>
            <LegendRow color="#22c55e" icon={<MapPin className="size-3.5" />} label="Selected / focused point" />
            <LegendRow color="#3b82f6" icon={<LocateFixed className="size-3.5" />} label="Your current location" outline />
          </div>
        </aside>
      </div>

      {activeRoute && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-medium mb-2 inline-flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> Along your active route ({onRoute.length})
            <span className="text-xs text-muted-foreground font-normal">— within 10 mi of {activeRoute.origin} → {activeRoute.destination}</span>
          </div>
          {onRoute.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hazards detected on this route.</div>
          ) : (
            <ul className="space-y-1.5">
              {onRoute.slice(0, 10).map((h) => (
                <li key={"route-" + h.id} className="flex items-start gap-2 text-sm">
                  <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(h.severity)}`}>{h.severity}</span>
                  <span className="flex-1 min-w-0 truncate">{h.title}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{h.distanceMi < 1 ? "<1 mi" : `${Math.round(h.distanceMi)} mi`} off route</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {here && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-medium mb-2 inline-flex items-center gap-2">
            <LocateFixed className="size-4 text-primary" /> Within 25 miles of you ({nearby.length})
          </div>
          {nearby.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hazards detected within 25 miles of your current location.</div>
          ) : (
            <ul className="space-y-1.5">
              {nearby.slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-sm">
                  <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(h.severity)}`}>{h.severity}</span>
                  <span className="flex-1 min-w-0 truncate">{h.title}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{h.distanceMi < 1 ? "<1 mi" : `${Math.round(h.distanceMi)} mi`}</span>
                </li>
              ))}
            </ul>
          )}
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

function LegendRow({
  color,
  icon,
  label,
  outline,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  outline?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex size-5 items-center justify-center rounded-full text-white shrink-0"
        style={{
          backgroundColor: outline ? "transparent" : color,
          border: outline ? `2px solid ${color}` : `1px solid ${color}`,
          color: outline ? color : "white",
        }}
      >
        {icon}
      </span>
      <span className="text-foreground/90">{label}</span>
    </div>
  );
}
