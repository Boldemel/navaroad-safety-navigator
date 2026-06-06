import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { hazardLabel, severityClasses } from "@/lib/navaroad";
import { formatDistanceToNow } from "date-fns";
import { Bell, MapPin, Clock, User, Cloud, Construction, Users, Lightbulb } from "lucide-react";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useDriverNames } from "@/hooks/use-driver-names";
import { cn } from "@/lib/utils";
import { getSafetyFeed } from "@/lib/safety-engine.functions";

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
  const { data: drivers = {} } = useDriverNames();
  const feedFn = useServerFn(getSafetyFeed);

  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ["safety-feed"],
    queryFn: () => feedFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: hazards = [], isLoading: hazardsLoading } = useQuery({
    queryKey: ["alerts-hazards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hazard_reports").select("*").order("created_at", { ascending: false }).limit(100);
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
    }));
    const drivers: Item[] = hazards.map((h) => ({
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
    }));
    return [...weather, ...road, ...drivers].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [feed, hazards]);

  const visible = items.filter((it) => filters.has(it.source));
  const loading = feedLoading || hazardsLoading;

  function toggle(v: Source) {
    setFilters((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v); else n.add(v);
      return n;
    });
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Bell className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Alerts Center</h1>
          <p className="text-muted-foreground text-sm">Live alerts from weather APIs, DOT feeds, and driver reports.</p>
        </div>
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
          const driver = it.reporter_id ? drivers[it.reporter_id] : null;
          return (
            <div key={it.source + it.id} className="rounded-xl border border-border bg-card p-4 md:p-5">
              <div className="flex items-start gap-3 flex-wrap">
                <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(it.severity)}`}>
                  {it.severity}
                </span>
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border">{it.sourceLabel}</span>
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
              {it.source === "driver" && (
                <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                  <User className="size-3" /> Reported by {driver ?? "a driver"}
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
