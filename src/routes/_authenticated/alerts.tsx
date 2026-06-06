import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HAZARD_TYPES, hazardLabel, severityClasses } from "@/lib/navaroad";
import { formatDistanceToNow } from "date-fns";
import { Bell, MapPin, Clock, User } from "lucide-react";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useDriverNames } from "@/hooks/use-driver-names";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts")({
  component: AlertsCenter,
});

function AlertsCenter() {
  useRealtimeInvalidate(["hazard_reports", "alerts"], [["alerts-all"], ["alerts-hazards"], ["driver-names"]]);
  const [filters, setFilters] = useState<Set<string>>(new Set(HAZARD_TYPES.map((h) => h.value)));
  const { data: drivers = {} } = useDriverNames();

  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ["alerts-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("alerts").select("*").eq("active", true).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: hazards = [], isLoading: hazardsLoading } = useQuery({
    queryKey: ["alerts-hazards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hazard_reports").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  type Item = {
    id: string;
    kind: "alert" | "report";
    type: string;
    severity: string;
    location: string;
    message: string;
    action?: string | null;
    created_at: string;
    reporter_id?: string | null;
  };

  const items: Item[] = useMemo(() => [
    ...alerts.map((a) => ({
      id: a.id, kind: "alert" as const, type: a.alert_type, severity: a.severity,
      location: a.location, message: a.message, action: a.recommended_action, created_at: a.created_at,
    })),
    ...hazards.map((h) => ({
      id: h.id, kind: "report" as const, type: h.hazard_type, severity: h.severity,
      location: h.location, message: h.description ?? "Driver-reported hazard",
      action: null, created_at: h.created_at, reporter_id: h.reporter_id,
    })),
  ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [alerts, hazards]);

  const visible = items.filter((it) => filters.has(it.type));
  const loading = alertsLoading || hazardsLoading;

  function toggle(v: string) {
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
          <p className="text-muted-foreground text-sm">All active hazards, closures, and weather alerts.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {HAZARD_TYPES.map((t) => {
          const active = filters.has(t.value);
          return (
            <button
              key={t.value}
              onClick={() => toggle(t.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
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
            {items.length === 0 ? "No active alerts." : "No alerts match the selected filters."}
          </div>
        )}
        {visible.map((it) => {
          const driver = it.reporter_id ? drivers[it.reporter_id] : null;
          return (
            <div key={it.kind + it.id} className="rounded-xl border border-border bg-card p-4 md:p-5">
              <div className="flex items-start gap-3 flex-wrap">
                <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${severityClasses(it.severity)}`}>
                  {it.severity}
                </span>
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border">
                  {it.kind === "alert" ? "System Alert" : "Driver Report"}
                </span>
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="size-3" /> {formatDistanceToNow(new Date(it.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-3 font-medium">{hazardLabel(it.type)}</div>
              <div className="text-sm text-muted-foreground inline-flex items-center gap-1 mt-1">
                <MapPin className="size-3.5" /> {it.location}
              </div>
              <p className="mt-2 text-sm">{it.message}</p>
              {it.kind === "report" && (
                <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                  <User className="size-3" /> Reported by {driver ?? "a driver"}
                </div>
              )}
              {it.action && (
                <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                  <span className="font-medium text-primary">Recommended:</span> <span className="text-foreground">{it.action}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
