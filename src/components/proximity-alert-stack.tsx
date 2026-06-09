import { AlertTriangle, Wind, Cloud, Construction, User, X, MapPin, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProximityAlerts, type ProximityAlertKind } from "@/hooks/use-proximity-alerts";

const KIND_META: Record<ProximityAlertKind, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  high_wind: { label: "High wind", Icon: Wind },
  road_closure: { label: "Road closure", Icon: Construction },
  severe_weather: { label: "Severe weather", Icon: Cloud },
  driver_report: { label: "Driver report", Icon: User },
  weigh_station: { label: "Weigh station", Icon: Scale },
};

const SEV_CLS: Record<string, string> = {
  critical: "border-destructive/60 bg-destructive/15 text-destructive",
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-primary/30 bg-primary/10 text-primary",
};

const TIER_LABEL: Record<string, string> = {
  notice: "Heads up",
  action: "Take action",
  critical: "Critical",
};
const TIER_CLS: Record<string, string> = {
  notice: "bg-primary/15 text-primary border-primary/30",
  action: "bg-warning/15 text-warning border-warning/40",
  critical: "bg-destructive/20 text-destructive border-destructive/50 animate-pulse",
};

export function ProximityAlertStack() {
  const { alerts, dismiss, dismissAll } = useProximityAlerts();
  if (alerts.length === 0) return null;
  return (
    <div className="fixed top-2 inset-x-2 md:top-4 md:right-4 md:left-auto md:w-96 z-[1200] space-y-2 pointer-events-none">
      {alerts.length > 1 && (
        <div className="flex justify-end pointer-events-auto">
          <button
            onClick={dismissAll}
            className="text-[11px] rounded-full border border-border bg-card/90 backdrop-blur px-2.5 py-1 text-muted-foreground hover:text-foreground"
          >
            Dismiss all
          </button>
        </div>
      )}
      {alerts.map((a) => {
        const meta = KIND_META[a.kind];
        const Icon = meta.Icon;
        const cls = SEV_CLS[a.severity] ?? SEV_CLS.medium;
        return (
          <div
            key={a.uid}
            role="alert"
            className={cn(
              "pointer-events-auto rounded-xl border shadow-lg backdrop-blur-sm p-3 flex items-start gap-3",
              cls,
            )}
            style={{ background: undefined }}
          >
            <div className="size-9 rounded-md border border-current/40 bg-background/40 flex items-center justify-center shrink-0">
              <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
                <AlertTriangle className="size-3" /> {meta.label} · {a.severity}
                <span className={cn("ml-auto rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide", TIER_CLS[a.tier])}>
                  {TIER_LABEL[a.tier]}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground mt-0.5 truncate">{a.title}</div>
              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                <MapPin className="size-3" />
                {a.distanceMi < 1 ? "<1 mi" : `${Math.round(a.distanceMi)} mi`} away · {a.source}
              </div>
              <div className="text-xs text-foreground/90 mt-1">{a.recommendedAction}</div>
            </div>
            <button
              onClick={() => dismiss(a.uid)}
              aria-label="Dismiss alert"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-background/50"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
