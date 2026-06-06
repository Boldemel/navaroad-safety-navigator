import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Wind, AlertTriangle, Construction, Trash2, Car, ParkingCircleOff, CloudRain,
  CloudLightning, Clock, User, Cloud, Radio,
} from "lucide-react";
import { HAZARD_TYPES, hazardLabel, severityClasses } from "@/lib/navaroad";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useDriverNames } from "@/hooks/use-driver-names";
import { formatDistanceToNow } from "date-fns";
import { getSafetyFeed } from "@/lib/safety-engine.functions";

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

function pos(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return { left: 5 + (h % 90), top: 5 + ((h >> 8) % 88) };
}

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
};

function HazardMap() {
  const [showApi, setShowApi] = useState(true);
  const [showDriver, setShowDriver] = useState(true);
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(HAZARD_TYPES.map((h) => h.value)));
  useRealtimeInvalidate(["hazard_reports"], [["map-hazards"], ["driver-names"]]);

  const { data: drivers = {} } = useDriverNames();
  const feedFn = useServerFn(getSafetyFeed);

  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ["safety-feed"],
    queryFn: () => feedFn(),
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
      id: a.id, layer: "api", source: `Weather · ${a.provider}`,
      category: a.category, severity: a.severity, title: a.event,
      location: a.areaDesc, description: a.headline, updatedAt: a.effective,
    }));
    const road: Marker[] = (feed?.roadAlerts ?? []).map((r) => ({
      id: r.id, layer: "api", source: `DOT · ${r.provider}`,
      category: r.category, severity: r.severity, title: r.category.replace(/_/g, " "),
      location: `${r.roadway} — ${r.location}`, description: r.description, updatedAt: r.updatedAt,
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
      })),
    [hazards],
  );

  const visibleApi = showApi ? apiMarkers : [];
  const visibleDriver = showDriver ? driverMarkers.filter((m) => typeFilters.has(m.category)) : [];
  const allVisible = [...visibleApi, ...visibleDriver];

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
          <p className="text-muted-foreground text-sm">Live weather and DOT hazards, with driver reports as a community layer.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-full border border-border bg-card px-3 py-1.5">
          <Radio className={`size-3 ${feedLoading ? "animate-pulse" : "text-success"}`} />
          {feedLoading ? "Loading live sources…" : `${apiMarkers.length} API hazards · ${driverMarkers.length} driver reports`}
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

      <div className="relative aspect-[16/10] rounded-xl border border-border bg-sidebar overflow-hidden">
        <div className="absolute inset-0 road-grid opacity-60" />
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <path d="M0,80 Q200,40 400,120 T800,200" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" />
          <path d="M0,260 L800,260" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" strokeDasharray="6 8" />
          <path d="M200,0 L260,500" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" />
          <path d="M600,0 Q540,250 700,500" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" />
        </svg>

        {!feedLoading && !hazardsLoading && allVisible.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
            No hazards from any connected source. The map updates automatically as new alerts come in.
          </div>
        )}

        {allVisible.map((m) => {
          const Icon = HAZARD_ICONS[m.category] ?? AlertTriangle;
          const p = pos(m.id);
          const driver = m.reporter_id ? drivers[m.reporter_id] : null;
          const ringColor =
            m.severity === "critical" ? "bg-destructive border-destructive-foreground/40 text-destructive-foreground"
            : m.severity === "high" ? "bg-primary border-primary-foreground/30 text-primary-foreground"
            : "bg-warning border-background/40 text-warning-foreground";
          return (
            <div
              key={m.layer + m.id}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
            >
              <div className={cn("size-8 rounded-full border-2 flex items-center justify-center shadow-lg", ringColor, m.layer === "driver" && "ring-2 ring-warning/40 ring-offset-2 ring-offset-sidebar")}>
                <Icon className="size-4" />
              </div>
              <div className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 mt-2 w-64 rounded-md border border-border bg-popover p-3 text-xs shadow-xl z-10">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-popover-foreground">{m.title}</div>
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border whitespace-nowrap">{m.source}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">{m.location}</div>
                {m.description && <div className="text-muted-foreground mt-1 line-clamp-3">{m.description}</div>}
                <div className="flex items-center justify-between mt-2 gap-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase ${severityClasses(m.severity)}`}>{m.severity}</span>
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="size-3" />{formatDistanceToNow(new Date(m.updatedAt), { addSuffix: true })}
                  </span>
                </div>
                {m.layer === "driver" && (
                  <div className="text-[10px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                    <User className="size-3" />Reported by {driver ?? "a driver"}
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
