import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  Clock, AlertTriangle, Bed, Briefcase, TruckIcon, RotateCcw, ClipboardList, Coffee, Power,
} from "lucide-react";
import { useHos, LIMITS, fmtHm, type DutyStatus } from "@/hooks/use-hos";
import { cn } from "@/lib/utils";
import { PageTabs } from "@/components/page-tabs";
import { HosGauge } from "@/components/hos-gauge";

const LOGBOOK_TABS = [
  { to: "/logbook", label: "Logbook Grid", icon: ClipboardList },
  { to: "/hos", label: "HOS Limits", icon: Clock },
];

export const Route = createFileRoute("/_authenticated/hos")({
  component: HosPage,
});

const STATUSES: { key: DutyStatus; label: string; short: string; icon: typeof Bed }[] = [
  { key: "off", label: "Off Duty", short: "OFF", icon: Power },
  { key: "sleeper", label: "Sleeper", short: "SB", icon: Bed },
  { key: "driving", label: "Driving", short: "D", icon: TruckIcon },
  { key: "onduty", label: "On Duty", short: "ON", icon: Briefcase },
];

const STATUS_ACCENT: Record<DutyStatus, string> = {
  off: "bg-muted text-foreground border-border",
  sleeper: "bg-primary/15 text-primary border-primary/30",
  driving: "bg-success/15 text-success border-success/40",
  onduty: "bg-warning/15 text-warning border-warning/40",
};

function HosPage() {
  const hos = useHos();
  const {
    state, setStatus, reset, segmentMin,
    liveDriveMinToday, liveDriveSinceBreak, liveCycleMin, windowElapsed, remaining,
  } = hos;

  const warnings: { msg: string; severe: boolean }[] = [];
  if (remaining.drive === 0) warnings.push({ msg: "11-hour driving limit reached — take a 10-hour off-duty break.", severe: true });
  else if (remaining.drive <= 30) warnings.push({ msg: `Approaching 11h drive limit (${fmtHm(remaining.drive)} left)`, severe: false });
  if (remaining.window === 0 && state.dayStartedAt) warnings.push({ msg: "14-hour duty window closed — driving not allowed.", severe: true });
  else if (remaining.window <= 60 && state.dayStartedAt) warnings.push({ msg: `14h window closes in ${fmtHm(remaining.window)}`, severe: false });
  if (remaining.untilBreak === 0 && state.status === "driving") warnings.push({ msg: "30-minute break required — 8h driving without break.", severe: true });
  else if (remaining.untilBreak <= 30 && state.status === "driving") warnings.push({ msg: `30-min break required in ${fmtHm(remaining.untilBreak)}`, severe: false });
  if (remaining.cycle <= 4 * 60) warnings.push({ msg: `Only ${fmtHm(remaining.cycle)} left in 70h/8-day cycle`, severe: remaining.cycle === 0 });

  const currentStatus = STATUSES.find((s) => s.key === state.status)!;

  return (
    <div className="container max-w-3xl py-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="size-6 text-primary" /> Hours of Service
          </h1>
          <p className="text-xs text-muted-foreground">Property-carrying CMV · 11/14/70 rule</p>
        </div>
        <PageTabs tabs={LOGBOOK_TABS} />
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={cn(
                "rounded-md border p-2.5 text-sm flex gap-2",
                w.severe
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-warning/40 bg-warning/10 text-warning",
              )}
            >
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>{w.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Status hero */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className={cn("px-4 py-3 border-b flex items-center justify-between gap-3", STATUS_ACCENT[state.status])}>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-background/60 flex items-center justify-center">
              <currentStatus.icon className="size-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-80">Current Status</div>
              <div className="text-lg font-bold leading-tight">
                {state.status === "onduty" ? "On Duty (not driving)" : currentStatus.label}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider opacity-80">Elapsed</div>
            <div className="text-lg font-bold tabular-nums">{fmtHm(segmentMin)}</div>
          </div>
        </div>

        {/* Duty selector pills */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-sidebar/30">
          {STATUSES.map((s) => {
            const active = state.status === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(s.key)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 rounded-lg border transition-all",
                  active
                    ? cn("border-2 shadow-sm", STATUS_ACCENT[s.key])
                    : "border-border bg-card hover:bg-accent text-muted-foreground",
                )}
                aria-pressed={active}
              >
                <s.icon className="size-4" />
                <span className="text-[10px] font-bold tracking-wider">{s.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Gauge cluster */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">
          Today's Limits
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <HosGauge
            label="Drive (11h)"
            usedMin={liveDriveMinToday}
            maxMin={LIMITS.driveMaxMin}
          />
          <HosGauge
            label="Shift (14h)"
            usedMin={windowElapsed}
            maxMin={LIMITS.windowMaxMin}
            inactive={!state.dayStartedAt}
          />
          <HosGauge
            label="Break in (8h)"
            usedMin={liveDriveSinceBreak}
            maxMin={LIMITS.breakRequiredAfterMin}
            inactive={state.status !== "driving"}
          />
          <HosGauge
            label="Cycle (70h)"
            usedMin={liveCycleMin}
            maxMin={LIMITS.cycleMaxMin}
          />
        </div>
      </div>

      {/* Remaining strip */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
          <Coffee className="size-3.5" /> Remaining
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { l: "Drive", v: fmtHm(remaining.drive) },
            { l: "Shift", v: state.dayStartedAt ? fmtHm(remaining.window) : "—" },
            { l: "Break", v: state.status === "driving" ? fmtHm(remaining.untilBreak) : "—" },
            { l: "Cycle", v: fmtHm(remaining.cycle) },
          ].map((x) => (
            <div key={x.l} className="rounded-md bg-muted/40 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{x.l}</div>
              <div className="font-semibold tabular-nums text-sm">{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => { if (confirm("Reset all HOS counters?")) reset(); }}
      >
        <RotateCcw className="size-3.5 mr-2" /> Reset all counters
      </Button>

      <p className="text-xs text-muted-foreground">
        Informational only. Always cross-check with your official ELD. Counters are stored in this browser.
      </p>
    </div>
  );
}
