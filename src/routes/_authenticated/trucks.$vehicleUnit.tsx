import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Truck, Loader2, AlertTriangle, Wrench, Fuel, Package, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTruckDetail } from "@/lib/trucks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trucks/$vehicleUnit")({
  component: TruckDetailPage,
});

const fmt$ = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtN = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

function TruckDetailPage() {
  const { vehicleUnit } = Route.useParams();
  const fetchDetail = useServerFn(getTruckDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["truck-detail", vehicleUnit],
    queryFn: () => fetchDetail({ data: { vehicleUnit } }),
  });

  if (isLoading) {
    return (
      <div className="container max-w-7xl py-6 flex items-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="container max-w-7xl py-6">
        <Card className="p-4 border-destructive/40 text-destructive text-sm">
          {(error as Error)?.message ?? "Failed to load truck"}
        </Card>
      </div>
    );
  }

  const { summary, recentLoads, recentMaintenance, openDefects, recentFuel } = data;
  const rpm = summary.miles > 0 ? summary.revenue / summary.miles : 0;
  const cpm = summary.miles > 0 ? (summary.fuelCost + summary.maintenanceCost) / summary.miles : 0;
  const profitTone =
    summary.netProfit > 0 ? "text-emerald-600 dark:text-emerald-400"
    : summary.netProfit < 0 ? "text-destructive"
    : "text-muted-foreground";

  return (
    <div className="container max-w-7xl py-6 space-y-5">
      <Link to="/trucks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All trucks
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="size-6 text-primary" /> {summary.vehicleUnit}
          </h1>
          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <User className="size-3.5" />
            {summary.currentDriverName ?? "No active driver"}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {summary.openTasks > 0 && (
            <Badge variant="destructive">
              <Wrench className="size-3 mr-1" />{summary.openTasks} open task{summary.openTasks > 1 ? "s" : ""}
            </Badge>
          )}
          {summary.openDefects > 0 && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3 mr-1" />{summary.openDefects} defect{summary.openDefects > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Revenue" value={fmt$(summary.revenue)} />
        <Kpi label="Fuel" value={fmt$(summary.fuelCost)} />
        <Kpi label="Maintenance" value={fmt$(summary.maintenanceCost)} />
        <Kpi label="Net" value={fmt$(summary.netProfit)} valueClass={profitTone} />
        <Kpi label="Miles" value={fmtN(summary.miles)} />
        <Kpi label="Loads" value={fmtN(summary.loads)} />
        <Kpi label="RPM" value={rpm ? `$${rpm.toFixed(2)}` : "—"} />
        <Kpi label="CPM" value={cpm ? `$${cpm.toFixed(2)}` : "—"} />
        <Kpi label="Last odometer" value={summary.lastFuelOdometer != null ? fmtN(summary.lastFuelOdometer) : "—"} />
        <Kpi label="Service due" value={summary.nextServiceDueDate ?? (summary.nextServiceDueOdometer != null ? `@ ${fmtN(summary.nextServiceDueOdometer)}` : "—")} />
        <Kpi label="Last activity" value={fmtDate(summary.lastActivityAt)} />
      </div>

      <Section title="Open defects & maintenance tasks" icon={Wrench}>
        {openDefects.length === 0 ? (
          <Empty>No open defects.</Empty>
        ) : (
          <div className="divide-y">
            {openDefects.map((d) => (
              <div key={d.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.category ?? "Defect"} · opened {fmtDate(d.createdAt)}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Badge variant={d.priority === "Critical" || d.priority === "High" ? "destructive" : "secondary"} className="text-[10px]">
                    {d.priority}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent loads" icon={Package}>
        {recentLoads.length === 0 ? (
          <Empty>No recent loads for this truck.</Empty>
        ) : (
          <div className="divide-y">
            {recentLoads.map((l) => (
              <div key={l.id} className="py-2 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 text-sm items-center">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {l.shipper ?? "—"} → {l.consignee ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.driverName ?? "—"} · pickup {fmtDate(l.pickup)} · delivery {fmtDate(l.delivery)}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] justify-self-start md:justify-self-end">{l.status}</Badge>
                <div className="text-xs text-muted-foreground">{fmtN(l.miles)} mi</div>
                <div className="font-medium">{fmt$(l.rate)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent maintenance" icon={Wrench}>
        {recentMaintenance.length === 0 ? (
          <Empty>No maintenance records.</Empty>
        ) : (
          <div className="divide-y">
            {recentMaintenance.map((m) => (
              <div key={m.id} className="py-2 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 text-sm items-center">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.serviceType}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(m.serviceDate)} {m.vendor ? `· ${m.vendor}` : ""}
                    {m.nextDueDate ? ` · next due ${m.nextDueDate}` : ""}
                    {m.nextDueOdometer != null ? ` · @ ${fmtN(m.nextDueOdometer)}` : ""}
                  </div>
                </div>
                <div className="font-medium">{fmt$(m.cost)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent fuel" icon={Fuel}>
        {recentFuel.length === 0 ? (
          <Empty>No fuel purchases.</Empty>
        ) : (
          <div className="divide-y">
            {recentFuel.map((f) => (
              <div key={f.id} className="py-2 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 text-sm items-center">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.station ?? "Fuel"} · {f.state}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(f.date)}{f.odometer != null ? ` · odo ${fmtN(f.odometer)}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{fmtN(f.gallons)} gal</div>
                <div className="font-medium">{fmt$(f.total)}</div>
                <div />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card className="p-3 space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold truncate", valueClass)}>{value}</div>
    </Card>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Icon className="size-4 text-primary" /> {title}
      </div>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground py-4 text-center">{children}</div>;
}
