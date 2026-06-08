import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { hazardLabel, severityClasses } from "@/lib/navaroad";
import { formatDistanceToNow } from "date-fns";
import { Bell, MapPin, Clock, User, Cloud, Construction, Users, Lightbulb, Map as MapIcon, AlertTriangle } from "lucide-react";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useReporterProfiles, ReporterTrustBadge } from "@/components/reporter-trust-badge";
import { cn } from "@/lib/utils";
import { getSafetyFeed } from "@/lib/safety-engine.functions";
import { useActiveRoute } from "@/hooks/use-active-route";
import { hazardsAlongRoute, recommendedActionFor, type HazardLike } from "@/lib/hazard-proximity";
import { Route as RouteIcon } from "lucide-react";
import { HazardPhoto } from "@/components/hazard-photo";
import { PageTabs } from "@/components/page-tabs";

const HAZARD_TABS = [
  { to: "/hazard-map", label: "Hazard Map", icon: MapIcon },
  { to: "/report", label: "Report Hazard", icon: AlertTriangle },
  { to: "/alerts", label: "Alerts", icon: Bell },
];

export const Route = createFileRoute("/_authenticated/alerts")({
  component: AlertsCenter,
});

type Source = "weather_api" | "dot" | "driver" | "system";

const SOURCES: Array<{ value: Source; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "weather_api", label: "Weather API", icon: Cloud },
  { value: "dot", label: "DOT / Road", icon: Construction },
  { value: "driver", label: "Driver Reports", icon: Users },
];

function AlertsCenter() {
  useRealtimeInvalidate(["hazard_reports"], [["alerts-hazards"], ["driver-names"]]);
  const [filters, setFilters] = useState<Set<Source>>(new Set(SOURCES.map((s) => s.value)));
  // Driver reputation profiles for everyone whose hazard appears in this list.
  const feedFn = useServerFn(getSafetyFeed);
  const activeRoute = useActiveRoute();
  const geometry = activeRoute?.geometry ?? [];

  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ["safety-feed", activeRoute?.savedAt ?? "none"],
    queryFn: () => feedFn({ data: { geometry } }),
    enabled: geometry.length >= 2,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: hazards = [], isLoading: hazardsLoading } = useQuery({
    queryKey: ["alerts-hazards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hazard_reports")
        .select("*")
        .eq("status", "active")
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  type Item = {
    id: string;
    source: Source;
    sourceLabel: string;
    type: string;
    severity: string;
    location: string;
    message: string;
    action?: string | null;
    updatedAt: string;
    reporter_id?: string | null;
    lat?: number | null;
    lon?: number | null;
    category?: string;
    onRoute?: boolean;
    distanceMi?: number;
    photoUrl?: string | null;
  };

  const items: Item[] = useMemo(() => {
    const weather: Item[] = (feed?.weatherAlerts ?? []).map((a) => ({
      id: a.id,
      source: "weather_api",
      sourceLabel: `Weather API · ${a.provider}`,
      type: a.event,
      severity: a.severity,
      location: a.areaDesc,
      message: a.headline,
      action: a.recommendedAction,
      updatedAt: a.effective,
      lat: a.lat ?? null,
      lon: a.lon ?? null,
      category: a.category,
    }));
    const road: Item[] = (feed?.roadAlerts ?? []).map((r) => ({
      id: r.id,
      source: "dot",
      sourceLabel: `DOT · ${r.provider}`,
      type: r.category,
      severity: r.severity,
      location: `${r.roadway} — ${r.location}`,
      message: r.description,
      action: r.recommendedAction,
      updatedAt: r.updatedAt,
      lat: r.lat ?? null,
      lon: r.lon ?? null,
      category: r.category,
    }));
    const driverItems: Item[] = hazards.map((h) => ({
      id: h.id,
      source: "driver",
      sourceLabel: "Driver Report",
      type: h.hazard_type,
      severity: h.severity,
      location: h.location,
      message: h.description ?? "Driver-reported hazard",
      action: null,
      updatedAt: h.created_at,
      reporter_id: h.reporter_id,
      lat: h.latitude ?? null,
      lon: h.longitude ?? null,
      category: h.hazard_type,
      photoUrl: h.photo_url ?? null,
    }));
    const all = [...weather, ...road, ...driverItems];

    // Tag items inside the 10mi route corridor and compute distance-to-route.
    if (geometry.length >= 2) {
      const probes: HazardLike[] = all
        .filter((i) => i.lat != null && i.lon != null)
        .map((i) => ({
          id: i.source + i.id,
          title: i.type,
          category: i.category ?? i.type,
          severity: i.severity,
          lat: i.lat ?? null,
          lon: i.lon ?? null,
          source: i.sourceLabel,
        }));
      const onRoute = hazardsAlongRoute(geometry, probes, 10);
      const byKey = new Map(onRoute.map((h) => [h.id, h.distanceMi]));
      for (const it of all) {
        const key = it.source + it.id;
        if (byKey.has(key)) {
          it.onRoute = true;
          it.distanceMi = byKey.get(key);
          if (!it.action) {
            it.action = recommendedActionFor(
              { id: key, title: it.type, category: it.category ?? it.type, severity: it.severity, lat: it.lat, lon: it.lon, source: it.sourceLabel },
              it.distanceMi ?? 0,
            );
          }
        }
      }
    }

    return all.sort((a, b) => {
      // On-route items first, then newest.
      if (!!b.onRoute !== !!a.onRoute) return b.onRoute ? 1 : -1;
      return +new Date(b.updatedAt) - +new Date(a.updatedAt);
    });
  }, [feed, hazards, geometry]);

  const [onRouteOnly, setOnRouteOnly] = useState(false);
  const visible = items.filter((it) => filters.has(it.source) && (!onRouteOnly || it.onRoute));
  const onRouteCount = items.filter((i) => i.onRoute).length;
  const loading = feedLoading || hazardsLoading;
  const { data: reporters } = useReporterProfiles(
    visible.filter((i) => i.source === "driver").map((i) => i.reporter_id ?? null),
  );

  function toggle(v: Source) {
    setFilters((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v); else n.add(v);
      return n;
    });
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bell className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Alerts</h1>
            <p className="text-muted-foreground text-sm">
              Live alerts from weather APIs, DOT feeds, and driver reports.
              {activeRoute ? (
                <> Scoped to your route: <span className="text-foreground">{activeRoute.origin} → {activeRoute.destination}</span>.</>
              ) : (
                <> Analyze a route to see route-scoped weather & road alerts.</>
              )}
            </p>
          </div>
        </div>
        <PageTabs tabs={HAZARD_TABS} />
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCES.map((t) => {
          const active = filters.has(t.value);
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => toggle(t.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
                active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
        {activeRoute && (
          <button
            onClick={() => setOnRouteOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
              onRouteOnly ? "border-warning/40 bg-warning/15 text-warning" : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
            title="Only show hazards within 10 mi of your active route"
          >
            <RouteIcon className="size-3.5" />
            On route only ({onRouteCount})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
            Loading alerts…
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
            {items.length === 0 ? "No active alerts from connected sources." : "No alerts match the selected sources."}
          </div>
        )}
        {visible.map((it) => {
          const reporter = it.reporter_id ? reporters?.[it.reporter_id] : undefined;
          const driver = reporter?.driver_name ?? null;
          return (
            <div key={it.source + it.id} className={cn(
              "rounded-xl border bg-card p-4 md:p-5",
              it.onRoute ? "border-warning/40" : "border-border",
            )}>
              <div className="flex items-start gap-3 flex-wrap">
                <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(it.severity)}`}>
                  {it.severity}
                </span>
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border">{it.sourceLabel}</span>
                {it.onRoute && (
                  <span className="text-xs text-warning px-2 py-0.5 rounded border border-warning/40 bg-warning/10 inline-flex items-center gap-1">
                    <RouteIcon className="size-3" />
                    On route{it.distanceMi != null && <> · {it.distanceMi < 1 ? "<1 mi" : `${Math.round(it.distanceMi)} mi`} off route</>}
                  </span>
                )}
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="size-3" /> {formatDistanceToNow(new Date(it.updatedAt), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-3 font-medium">{it.source === "driver" ? hazardLabel(it.type) : it.type.replace(/_/g, " ")}</div>
              <div className="text-sm text-muted-foreground inline-flex items-center gap-1 mt-1">
                <MapPin className="size-3.5" /> {it.location}
              </div>
              {it.message && <p className="mt-2 text-sm line-clamp-3">{it.message}</p>}
              {it.photoUrl && <HazardPhoto path={it.photoUrl} className="mt-2 size-24" />}
              {it.source === "driver" && (
                <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3" /> Reported by {driver ?? "a driver"}
                  </span>
                  <ReporterTrustBadge profile={reporter} />
                </div>
              )}
              {it.action && (
                <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                  <span className="font-medium text-primary inline-flex items-center gap-1.5"><Lightbulb className="size-3.5" />Recommended:</span>{" "}
                  <span className="text-foreground">{it.action}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
