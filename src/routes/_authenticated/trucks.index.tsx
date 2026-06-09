import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Truck, Loader2, AlertTriangle, Wrench, Fuel, DollarSign, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FleetFilters, emptyFleetFilters, type FleetFilterValue } from "@/components/fleet-filters";
import { listTrucks, type TruckSummary } from "@/lib/trucks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trucks/")({
  component: TrucksIndexPage,
});

const fmt$ = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtN = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function TrucksIndexPage() {
  const [filters, setFilters] = useState<FleetFilterValue>(emptyFleetFilters);
  const fetchList = useServerFn(listTrucks);
  const payload = useMemo(() => ({
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [filters]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["trucks-list", payload],
    queryFn: () => fetchList({ data: payload }),
  });

  const trucks = data?.trucks ?? [];
  const totals = trucks.reduce(
    (a, t) => ({
      revenue: a.revenue + t.revenue,
      cost: a.cost + t.fuelCost + t.maintenanceCost,
      defects: a.defects + t.openDefects + t.openTasks,
    }),
    { revenue: 0, cost: 0, defects: 0 }
  );

  return (
    <div className="container max-w-7xl py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="size-6 text-primary" /> Trucks
        </h1>
        <p className="text-sm text-muted-foreground">Per-truck profitability, maintenance, and current assignment.</p>
      </div>

      <FleetFilters value={filters} onChange={setFilters} showDriver={false} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={DollarSign} label="Fleet revenue" value={fmt$(totals.revenue)} />
        <Kpi icon={Fuel} label="Fuel + maintenance" value={fmt$(totals.cost)} />
        <Kpi icon={AlertTriangle} label="Open defects/tasks" value={fmtN(totals.defects)} />
        <Kpi icon={Truck} label="Trucks" value={fmtN(trucks.length)} />
      </div>

      {error && (
        <Card className="p-4 border-destructive/40 text-destructive text-sm">
          {(error as Error).message}
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin mr-2" /> Loading…
        </div>
      ) : trucks.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground text-sm">
          No truck activity in the selected range.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {trucks.map((t) => (
            <TruckCard key={t.vehicleUnit} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="p-4 space-y-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </Card>
  );
}

function TruckCard({ t }: { t: TruckSummary }) {
  const profitTone =
    t.netProfit > 0 ? "text-emerald-600 dark:text-emerald-400"
    : t.netProfit < 0 ? "text-destructive"
    : "text-muted-foreground";
  const rpm = t.miles > 0 ? t.revenue / t.miles : 0;
  return (
    <Link
      to="/trucks/$vehicleUnit"
      params={{ vehicleUnit: t.vehicleUnit }}
      className="block"
    >
      <Card className="p-4 hover:bg-accent/30 transition-colors h-full">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate flex items-center gap-2">
              <Truck className="size-4 text-primary shrink-0" />
              {t.vehicleUnit}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {t.currentDriverName ?? "No active driver"}
            </div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          <Stat label="Revenue" value={fmt$(t.revenue)} />
          <Stat label="Miles" value={fmtN(t.miles)} />
          <Stat label="Loads" value={fmtN(t.loads)} />
          <Stat label="Fuel" value={fmt$(t.fuelCost)} />
          <Stat label="Maint." value={fmt$(t.maintenanceCost)} />
          <Stat label="RPM" value={rpm ? `$${rpm.toFixed(2)}` : "—"} />
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="text-xs text-muted-foreground">Net</div>
          <div className={cn("text-sm font-semibold", profitTone)}>{fmt$(t.netProfit)}</div>
        </div>

        {(t.openDefects + t.openTasks > 0 || t.nextServiceDueDate) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {t.openTasks > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                <Wrench className="size-3 mr-1" />{t.openTasks} open task{t.openTasks > 1 ? "s" : ""}
              </Badge>
            )}
            {t.openDefects > 0 && (
              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3 mr-1" />{t.openDefects} defect{t.openDefects > 1 ? "s" : ""}
              </Badge>
            )}
            {t.nextServiceDueDate && (
              <Badge variant="outline" className="text-[10px]">
                Service due {t.nextServiceDueDate}
              </Badge>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
