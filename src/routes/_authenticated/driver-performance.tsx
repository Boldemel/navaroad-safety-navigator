import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Users, Loader2, AlertTriangle, Award, Clock, FolderLock, ShieldCheck, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";
import { getDriverPerformance, type DriverScorecard } from "@/lib/driver-performance.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/driver-performance")({
  component: DriverPerformancePage,
});

const fmt$ = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function toneForScore(s: number) {
  if (s >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 65) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function DriverPerformancePage() {
  const [filters, setFilters] = useState<FleetFilterValue>(emptyFleetFilters);
  const [selected, setSelected] = useState<DriverScorecard | null>(null);
  const fetchReport = useServerFn(getDriverPerformance);
  const payload = useMemo(() => ({
    from: filters.from || undefined,
    to: filters.to || undefined,
    truck: filters.truck || undefined,
    driverId: filters.driverId || undefined,
  }), [filters]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["driver-performance", payload],
    queryFn: () => fetchReport({ data: payload }),
  });

  return (
    <div className="container max-w-7xl py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="size-6 text-primary" /> Driver Performance
        </h1>
        <p className="text-sm text-muted-foreground">
          Per-driver scorecard: loads, on-time delivery, inspections, HOS violations, and document compliance
        </p>
      </div>

      <FleetFilters value={filters} onChange={setFilters} />

      {error && (
        <Card className="p-4 text-sm text-destructive">{(error as Error).message}</Card>
      )}

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="size-4 animate-spin" /> Building scorecards…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Drivers" value={String(data.totals.drivers)} />
            <Kpi label="Revenue" value={fmt$(data.totals.revenue)} />
            <Kpi label="Loads" value={data.totals.loads.toLocaleString()} />
            <Kpi label="HOS violations" value={String(data.totals.hosViolations)} tone={data.totals.hosViolations > 0 ? "bad" : undefined} />
            <Kpi label="Expired docs" value={String(data.totals.expiredDocs)} tone={data.totals.expiredDocs > 0 ? "bad" : undefined} />
          </div>

          {data.drivers.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No drivers match the current filters.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.drivers.map((d) => (
                <button
                  key={d.driverId}
                  onClick={() => setSelected(d)}
                  className="text-left"
                >
                  <Card className="p-4 hover:border-primary/40 transition-colors h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{d.name}</div>
                        <div className="text-xs text-muted-foreground">{d.loads} loads • {d.miles.toLocaleString()} mi</div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-2xl font-bold leading-none", toneForScore(d.compliance))}>
                          {d.compliance}
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground tracking-wide">score</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Stat icon={<Award className="size-3.5" />} label="Revenue" value={fmt$(d.revenue)} />
                      <Stat icon={<Clock className="size-3.5" />} label="On-time" value={pct(d.onTimeRate)} />
                      <Stat icon={<ShieldCheck className="size-3.5" />} label="Inspections" value={`${d.preTrip + d.postTrip}`} />
                      <Stat icon={<AlertTriangle className="size-3.5" />} label="HOS" value={String(d.hosViolations)} tone={d.hosViolations > 0 ? "bad" : undefined} />
                    </div>

                    {(d.expiredDocs > 0 || d.expiringDocs > 0 || d.openDefects > 0) && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {d.expiredDocs > 0 && <Badge variant="destructive" className="text-[10px]">{d.expiredDocs} expired</Badge>}
                        {d.expiringDocs > 0 && <Badge variant="secondary" className="text-[10px]">{d.expiringDocs} expiring</Badge>}
                        {d.openDefects > 0 && <Badge variant="secondary" className="text-[10px]">{d.openDefects} defects</Badge>}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-end text-xs text-muted-foreground">
                      Details <ChevronRight className="size-3.5" />
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && <DriverDetail d={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DriverDetail({ d }: { d: DriverScorecard }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="size-5 text-primary" /> {d.name}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 mt-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Score" value={String(d.compliance)} tone={d.compliance < 65 ? "bad" : undefined} />
          <Kpi label="Revenue" value={fmt$(d.revenue)} />
          <Kpi label="Miles" value={d.miles.toLocaleString()} />
          <Kpi label="On-time" value={pct(d.onTimeRate)} />
        </div>

        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-4" /> HOS Violations ({d.violations.length})
          </h3>
          {d.violations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No HOS violations in window.</p>
          ) : (
            <div className="border rounded-md divide-y max-h-48 overflow-auto">
              {d.violations.map((v, i) => (
                <div key={i} className="flex items-center justify-between text-xs px-3 py-2">
                  <span>{v.date}</span>
                  <span className="text-muted-foreground">
                    {v.type === "driving_11" ? `Driving ${v.drivingHours}h (>11)` : `On-duty ${v.onDutyHours}h (>14)`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <FolderLock className="size-4" /> Documents ({d.docs.length})
          </h3>
          {d.docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documents on file.</p>
          ) : (
            <div className="border rounded-md divide-y max-h-56 overflow-auto">
              {d.docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-xs px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{doc.title}</div>
                    <div className="text-muted-foreground">{doc.category || doc.docType}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground">{doc.expiresOn || "—"}</div>
                    {doc.status === "expired" && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                    {doc.status === "soon" && <Badge variant="secondary" className="text-[10px]">In {doc.daysUntil}d</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold mt-0.5", tone === "bad" && "text-destructive")}>{value}</div>
    </Card>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn("font-medium ml-auto", tone === "bad" && "text-destructive")}>{value}</span>
    </div>
  );
}
