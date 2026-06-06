import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Wind, AlertTriangle, Construction, Trash2, Car, ParkingCircleOff, CloudRain, CloudLightning, Clock, User } from "lucide-react";
import { HAZARD_TYPES, hazardLabel, severityClasses } from "@/lib/navaroad";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useDriverNames } from "@/hooks/use-driver-names";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/hazard-map")({
  component: HazardMap,
});

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  high_wind: Wind,
  accident: Car,
  road_closure: AlertTriangle,
  construction: Construction,
  debris: Trash2,
  parking_full: ParkingCircleOff,
  flooding: CloudRain,
  severe_weather: CloudLightning,
};

// Deterministic pseudo-position from id so markers stay put across renders.
function pos(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return { left: 5 + (h % 90), top: 5 + ((h >> 8) % 88) };
}

function HazardMap() {
  const [filters, setFilters] = useState<Set<string>>(new Set(HAZARD_TYPES.map((h) => h.value)));
  useRealtimeInvalidate(["hazard_reports"], [["map-hazards"], ["driver-names"]]);

  const { data: drivers = {} } = useDriverNames();

  const { data: hazards = [], isLoading } = useQuery({
    queryKey: ["map-hazards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hazard_reports").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const visible = useMemo(() => hazards.filter((h) => filters.has(h.hazard_type)), [hazards, filters]);

  function toggle(v: string) {
    setFilters((s) => {
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
          <p className="text-muted-foreground text-sm">Live driver-reported hazards across active lanes.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {HAZARD_TYPES.map((t) => {
          const active = filters.has(t.value);
          const Icon = ICONS[t.value];
          return (
            <button
              key={t.value}
              onClick={() => toggle(t.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
                active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="relative aspect-[16/10] rounded-xl border border-border bg-sidebar overflow-hidden">
        <div className="absolute inset-0 road-grid opacity-60" />
        {/* fake roads */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <path d="M0,80 Q200,40 400,120 T800,200" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" />
          <path d="M0,260 L800,260" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" strokeDasharray="6 8" />
          <path d="M200,0 L260,500" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" />
          <path d="M600,0 Q540,250 700,500" stroke="oklch(0.4 0.02 250)" strokeWidth="3" fill="none" />
        </svg>

        {visible.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No hazards match the selected filters.
          </div>
        )}

        {visible.map((h) => {
          const Icon = ICONS[h.hazard_type] ?? AlertTriangle;
          const p = pos(h.id);
          return (
            <div
              key={h.id}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
            >
              <div className={cn(
                "size-8 rounded-full border-2 flex items-center justify-center shadow-lg",
                h.severity === "critical" ? "bg-destructive border-destructive-foreground/40 text-destructive-foreground"
                  : h.severity === "high" ? "bg-primary border-primary-foreground/30 text-primary-foreground"
                  : "bg-warning border-background/40 text-warning-foreground",
              )}>
                <Icon className="size-4" />
              </div>
              <div className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 mt-2 w-56 rounded-md border border-border bg-popover p-3 text-xs shadow-xl z-10">
                <div className="font-medium text-popover-foreground">{hazardLabel(h.hazard_type)}</div>
                <div className="text-muted-foreground mt-0.5">{h.location}</div>
                {h.description && <div className="text-muted-foreground mt-1">{h.description}</div>}
                <span className={`inline-block mt-2 px-1.5 py-0.5 rounded border text-[10px] uppercase ${severityClasses(h.severity)}`}>{h.severity}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">{visible.length} of {hazards.length} hazards shown</div>
    </div>
  );
}
