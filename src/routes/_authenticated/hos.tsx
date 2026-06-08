import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Bed, Briefcase, TruckIcon, Coffee, RotateCcw, ClipboardList } from "lucide-react";
import { useHos, LIMITS, fmtHm, type DutyStatus } from "@/hooks/use-hos";
import { cn } from "@/lib/utils";
import { PageTabs } from "@/components/page-tabs";

const LOGBOOK_TABS = [
  { to: "/logbook", label: "Logbook Grid", icon: ClipboardList },
  { to: "/hos", label: "HOS Limits", icon: Clock },
];

export const Route = createFileRoute("/_authenticated/hos")({
  component: HosPage,
});

const STATUSES: { key: DutyStatus; label: string; icon: typeof Bed }[] = [
  { key: "off", label: "Off Duty", icon: Bed },
  { key: "sleeper", label: "Sleeper", icon: Bed },
  { key: "driving", label: "Driving", icon: TruckIcon },
  { key: "onduty", label: "On Duty", icon: Briefcase },
];

function Bar({ label, used, max, warn = 0.85, danger = 1 }: { label: string; used: number; max: number; warn?: number; danger?: number }) {
  const pct = Math.min(100, (used / max) * 100);
  const state = used / max >= danger ? "destructive" : used / max >= warn ? "warning" : "primary";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{fmtHm(used)} / {fmtHm(max)}</span>
      </div>
      <div className="h-2 bg-muted rounded overflow-hidden">
        <div className={cn("h-full transition-all",
          state === "destructive" && "bg-destructive",
          state === "warning" && "bg-warning",
          state === "primary" && "bg-primary",
        )} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HosPage() {
  const hos = useHos();
  const { state, setStatus, reset, liveDriveMinToday, liveDriveSinceBreak, liveOnDutyMinToday, liveCycleMin, windowElapsed, remaining } = hos;

  const warnings: { msg: string; severe: boolean }[] = [];
  if (remaining.drive === 0) warnings.push({ msg: "11-hour driving limit reached. Take a 10-hour off-duty break.", severe: true });
  else if (remaining.drive <= 30) warnings.push({ msg: `Approaching 11h drive limit (${fmtHm(remaining.drive)} left)`, severe: false });
  if (remaining.window === 0 && state.dayStartedAt) warnings.push({ msg: "14-hour duty window closed. Driving not allowed.", severe: true });
  else if (remaining.window <= 60 && state.dayStartedAt) warnings.push({ msg: `14h window closes in ${fmtHm(remaining.window)}`, severe: false });
  if (remaining.untilBreak === 0 && state.status === "driving") warnings.push({ msg: "30-minute break required — 8h driving without break.", severe: true });
  else if (remaining.untilBreak <= 30 && state.status === "driving") warnings.push({ msg: `30-min break required in ${fmtHm(remaining.untilBreak)}`, severe: false });
  if (remaining.cycle <= 4 * 60) warnings.push({ msg: `Only ${fmtHm(remaining.cycle)} left in 70h/8-day cycle`, severe: remaining.cycle === 0 });

  return (
      <div className="container max-w-3xl py-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="size-6 text-primary" /> Hours of Service</h1>
            <p className="text-sm text-muted-foreground">Property-carrying CMV · 11/14/70 rule</p>
          </div>
          <PageTabs tabs={LOGBOOK_TABS} />
        </div>

        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <div key={i} className={cn("rounded-md border p-3 text-sm flex gap-2",
                w.severe ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-warning",
              )}>
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <span>{w.msg}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm text-muted-foreground">Current status</div>
          <div className="text-2xl font-semibold capitalize">{state.status === "onduty" ? "On Duty (not driving)" : state.status}</div>
          <div className="text-xs text-muted-foreground">For {fmtHm(hos.segmentMin)} · since {new Date(state.statusStartedAt).toLocaleTimeString()}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {STATUSES.map((s) => (
              <Button
                key={s.key}
                variant={state.status === s.key ? "default" : "outline"}
                onClick={() => setStatus(s.key)}
                className="justify-start"
              >
                <s.icon className="size-4 mr-2" /> {s.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="text-sm font-medium">Today's limits</div>
          <Bar label="Drive time (11h max)" used={liveDriveMinToday} max={LIMITS.driveMaxMin} />
          <Bar label="On-duty window (14h max)" used={windowElapsed} max={LIMITS.windowMaxMin} />
          <Bar label="Drive since break (8h until 30-min break)" used={liveDriveSinceBreak} max={LIMITS.breakRequiredAfterMin} />
          <Bar label="On-duty time today" used={liveOnDutyMinToday} max={LIMITS.windowMaxMin} />
          <Bar label="70-hour / 8-day cycle" used={liveCycleMin} max={LIMITS.cycleMaxMin} />
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2"><Coffee className="size-4" /> Remaining</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div><div className="text-xs text-muted-foreground">Drive</div><div className="font-semibold">{fmtHm(remaining.drive)}</div></div>
            <div><div className="text-xs text-muted-foreground">Window</div><div className="font-semibold">{state.dayStartedAt ? fmtHm(remaining.window) : "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Until break</div><div className="font-semibold">{state.status === "driving" ? fmtHm(remaining.untilBreak) : "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Cycle</div><div className="font-semibold">{fmtHm(remaining.cycle)}</div></div>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => { if (confirm("Reset all HOS counters?")) reset(); }}>
          <RotateCcw className="size-3.5 mr-2" /> Reset all counters
        </Button>

        <p className="text-xs text-muted-foreground">
          This tracker is informational only. Always cross-check with your official ELD. Counters are stored in this browser only.
        </p>
      </div>
  );
}
