import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { TrendingUp, DollarSign, Fuel, Wrench, Users, Receipt, Truck, Sparkles, Loader2, MapPin, Briefcase, Package, AlertTriangle, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getProfitabilityReport,
  type ProfitRow,
  type ProfitabilityReport,
} from "@/lib/fleet-profitability.functions";

export const Route = createFileRoute("/_authenticated/fleet-profitability")({
  component: ProfitabilityAnalysisPage,
});

const fmt$ = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt$2 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
type Preset = "month" | "last" | "ytd" | "custom";
const ALL = "__all__";

function ProfitabilityAnalysisPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [truck, setTruck] = useState<string>(ALL);
  const [driverId, setDriverId] = useState<string>(ALL);
  const [loadId, setLoadId] = useState<string>(ALL);
  const [broker, setBroker] = useState<string>(ALL);
  const [lane, setLane] = useState<string>(ALL);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === "month") { setFrom(startOfMonth(now)); setTo(today()); }
    else if (p === "last") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(first.toISOString().slice(0, 10));
      setTo(last.toISOString().slice(0, 10));
    } else if (p === "ytd") {
      setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setTo(today());
    }
  };

  const filters = useMemo(() => ({
    from, to,
    truck: truck === ALL ? undefined : truck,
    driverId: driverId === ALL ? undefined : driverId,
    loadId: loadId === ALL ? undefined : loadId,
    broker: broker === ALL ? undefined : broker,
    lane: lane === ALL ? undefined : lane,
  }), [from, to, truck, driverId, loadId, broker, lane]);

  const fetchReport = useServerFn(getProfitabilityReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["profitability", filters],
    queryFn: () => fetchReport({ data: filters }),
  });

  const activeFilters = [
    truck !== ALL && { k: "Truck", v: truck, clear: () => setTruck(ALL) },
    driverId !== ALL && {
      k: "Driver",
      v: data?.options.drivers.find((d) => d.id === driverId)?.name ?? "—",
      clear: () => setDriverId(ALL),
    },
    loadId !== ALL && {
      k: "Load",
      v: data?.options.loads.find((l) => l.id === loadId)?.label ?? "—",
      clear: () => setLoadId(ALL),
    },
    broker !== ALL && { k: "Broker", v: broker, clear: () => setBroker(ALL) },
    lane !== ALL && { k: "Lane", v: lane, clear: () => setLane(ALL) },
  ].filter(Boolean) as { k: string; v: string; clear: () => void }[];

  const clearAll = () => { setTruck(ALL); setDriverId(ALL); setLoadId(ALL); setBroker(ALL); setLane(ALL); };

  return (
    <div className="container max-w-7xl py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="size-6 text-primary" /> Profitability Analysis
        </h1>
        <p className="text-sm text-muted-foreground">
          Drill-down profitability across trucks, drivers, loads, lanes, and brokers
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["month", "last", "ytd", "custom"] as Preset[]).map((p) => (
            <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => applyPreset(p)}>
              {p === "month" ? "This month" : p === "last" ? "Last month" : p === "ytd" ? "YTD" : "Custom"}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="h-9 w-auto text-xs" />
            <span className="text-xs text-muted-foreground">→</span>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="h-9 w-auto text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <FilterSelect label="Truck" value={truck} onChange={setTruck}
            options={(data?.options.trucks ?? []).map((t) => ({ value: t, label: t }))} />
          <FilterSelect label="Driver" value={driverId} onChange={setDriverId}
            options={(data?.options.drivers ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect label="Load" value={loadId} onChange={setLoadId}
            options={(data?.options.loads ?? []).map((l) => ({ value: l.id, label: l.label }))} />
          <FilterSelect label="Broker" value={broker} onChange={setBroker}
            options={(data?.options.brokers ?? []).map((b) => ({ value: b, label: b }))} />
          <FilterSelect label="Lane" value={lane} onChange={setLane}
            options={(data?.options.lanes ?? []).map((l) => ({ value: l, label: l }))} />
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {activeFilters.map((f) => (
              <button key={f.k + f.v} onClick={f.clear}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs hover:bg-muted/70">
                <span className="text-muted-foreground">{f.k}:</span> {f.v}
                <X className="size-3 ml-0.5" />
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={clearAll}>Clear all</Button>
          </div>
        )}
      </Card>

      {error && <Card className="p-4 text-sm text-destructive">{(error as Error).message}</Card>}

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading profitability…
        </div>
      ) : (
        <>
          <InsightCards report={data} />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="overview">Fleet Total</TabsTrigger>
              <TabsTrigger value="truck">By Truck</TabsTrigger>
              <TabsTrigger value="driver">By Driver</TabsTrigger>
              <TabsTrigger value="load">By Load</TabsTrigger>
              <TabsTrigger value="lane">By Lane</TabsTrigger>
              <TabsTrigger value="broker">By Broker</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <OverviewTab data={data} />
            </TabsContent>
            <TabsContent value="truck" className="mt-4">
              <RowsTable rows={data.byTruck} keyHeader="Truck #" icon={<Truck className="size-8" />} empty="No truck activity in this range." />
            </TabsContent>
            <TabsContent value="driver" className="mt-4">
              <RowsTable rows={data.byDriver} keyHeader="Driver" icon={<Users className="size-8" />} empty="No driver activity in this range." showLoads />
            </TabsContent>
            <TabsContent value="load" className="mt-4">
              <RowsTable rows={data.byLoad} keyHeader="Load #" icon={<Package className="size-8" />} empty="No load activity in this range." showSub />
            </TabsContent>
            <TabsContent value="lane" className="mt-4">
              <RowsTable rows={data.byLane} keyHeader="Lane" icon={<MapPin className="size-8" />} empty="No lane activity in this range." showLoads />
            </TabsContent>
            <TabsContent value="broker" className="mt-4">
              <RowsTable rows={data.byBroker} keyHeader="Broker / Customer" icon={<Briefcase className="size-8" />} empty="No broker activity in this range." showLoads />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={cn("text-xl font-bold", tone === "good" && "text-primary", tone === "bad" && "text-destructive")}>{value}</div>
    </Card>
  );
}

function OverviewTab({ data }: { data: ProfitabilityReport }) {
  const o = data.overview;
  const totalExp = o.totalCost;
  const bars = [
    { label: "Fuel", value: o.fuel, color: "bg-amber-500" },
    { label: "Maintenance", value: o.maintenance, color: "bg-orange-500" },
    { label: "Driver pay", value: o.driverPay, color: "bg-blue-500" },
    { label: "Other", value: o.otherExpenses, color: "bg-zinc-500" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Revenue" value={fmt$(o.revenue)} icon={<TrendingUp className="size-4" />} tone="good" />
        <Kpi label="Fuel cost" value={fmt$(o.fuel)} icon={<Fuel className="size-4" />} tone="bad" />
        <Kpi label="Maintenance" value={fmt$(o.maintenance)} icon={<Wrench className="size-4" />} tone="bad" />
        <Kpi label="Driver pay" value={fmt$(o.driverPay)} icon={<Users className="size-4" />} tone="bad" />
        <Kpi label="Other expenses" value={fmt$(o.otherExpenses)} icon={<Receipt className="size-4" />} tone="bad" />
        <Kpi label="Net profit" value={fmt$(o.netProfit)} icon={<DollarSign className="size-4" />} tone={o.netProfit >= 0 ? "good" : "bad"} />
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Cost breakdown</div>
        {totalExp === 0 ? (
          <div className="text-sm text-muted-foreground">No expenses recorded in this range.</div>
        ) : (
          <div className="space-y-2">
            {bars.map((b) => {
              const pct = totalExp > 0 ? (b.value / totalExp) * 100 : 0;
              return (
                <div key={b.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{b.label}</span>
                    <span className="text-muted-foreground">{fmt$(b.value)} · {pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div className={cn("h-full", b.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Metric label="Total miles" value={o.miles.toLocaleString()} />
        <Metric label="Revenue / mile" value={o.miles > 0 ? fmt$2(o.revenuePerMile) : "—"} />
        <Metric label="Cost / mile" value={o.miles > 0 ? fmt$2(o.costPerMile) : "—"} />
        <Metric label="Profit / mile" value={o.miles > 0 ? fmt$2(o.profitPerMile) : "—"} tone={o.profitPerMile >= 0 ? "good" : "bad"} />
      </Card>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-semibold",
        tone === "good" && "text-primary",
        tone === "bad" && "text-destructive")}>{value}</div>
    </div>
  );
}

function profitClass(n: number) {
  return n >= 0 ? "text-primary font-medium" : "text-destructive font-medium";
}

function RowsTable({ rows, keyHeader, icon, empty, showLoads, showSub }: {
  rows: ProfitRow[]; keyHeader: string; icon: React.ReactNode; empty: string;
  showLoads?: boolean; showSub?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 flex flex-col items-center gap-2 text-muted-foreground">
        {icon}<div className="text-sm">{empty}</div>
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <Th>{keyHeader}</Th>
            {showLoads && <Th right>Loads</Th>}
            <Th right>Revenue</Th>
            <Th right>Fuel</Th>
            <Th right>Maint.</Th>
            <Th right>Driver pay</Th>
            <Th right>Other</Th>
            <Th right>Total cost</Th>
            <Th right>Net profit</Th>
            <Th right>Miles</Th>
            <Th right>Rev / mi</Th>
            <Th right>Cost / mi</Th>
            <Th right>Profit / mi</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <Td>
                <div className="font-medium">{r.label}</div>
                {showSub && r.sublabel && <div className="text-xs text-muted-foreground truncate max-w-[220px]">{r.sublabel}</div>}
              </Td>
              {showLoads && <Td right>{r.loadsCompleted ?? 0}</Td>}
              <Td right>{fmt$(r.revenue)}</Td>
              <Td right>{fmt$(r.fuel)}</Td>
              <Td right>{fmt$(r.maintenance)}</Td>
              <Td right>{fmt$(r.driverPay)}</Td>
              <Td right>{fmt$(r.otherExpenses)}</Td>
              <Td right>{fmt$(r.totalCost)}</Td>
              <Td right><span className={profitClass(r.netProfit)}>{fmt$(r.netProfit)}</span></Td>
              <Td right>{r.miles > 0 ? r.miles.toLocaleString() : "—"}</Td>
              <Td right>{r.miles > 0 ? fmt$2(r.revenuePerMile) : "—"}</Td>
              <Td right>{r.miles > 0 ? fmt$2(r.costPerMile) : "—"}</Td>
              <Td right><span className={profitClass(r.profitPerMile)}>{r.miles > 0 ? fmt$2(r.profitPerMile) : "—"}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function InsightCards({ report }: { report: ProfitabilityReport }) {
  const h = report.highlights;
  const items: { icon: React.ReactNode; title: string; value: string; sub: string; tone?: "good" | "bad" }[] = [];

  if (h.mostProfitableTruck && h.mostProfitableTruck.netProfit !== 0) {
    items.push({
      icon: <Truck className="size-4" />,
      title: "Most profitable truck",
      value: h.mostProfitableTruck.label,
      sub: `${fmt$(h.mostProfitableTruck.netProfit)} net · ${h.mostProfitableTruck.miles > 0 ? fmt$2(h.mostProfitableTruck.profitPerMile) + "/mi" : "—"}`,
      tone: "good",
    });
  }
  if (h.leastProfitableTruck && h.leastProfitableTruck.key !== h.mostProfitableTruck?.key) {
    items.push({
      icon: <Truck className="size-4" />,
      title: "Least profitable truck",
      value: h.leastProfitableTruck.label,
      sub: `${fmt$(h.leastProfitableTruck.netProfit)} net`,
      tone: "bad",
    });
  }
  if (h.mostProfitableLoad) {
    items.push({
      icon: <Package className="size-4" />,
      title: "Most profitable load",
      value: h.mostProfitableLoad.label,
      sub: `${fmt$(h.mostProfitableLoad.netProfit)} net${h.mostProfitableLoad.sublabel ? ` · ${h.mostProfitableLoad.sublabel}` : ""}`,
      tone: "good",
    });
  }
  if (h.losingLoads.length > 0) {
    items.push({
      icon: <AlertTriangle className="size-4" />,
      title: `Loads losing money (${h.losingLoads.length})`,
      value: h.losingLoads.map((l) => l.label).slice(0, 3).join(", ") + (h.losingLoads.length > 3 ? "…" : ""),
      sub: `Total loss ${fmt$(h.losingLoads.reduce((a, l) => a + l.netProfit, 0))}`,
      tone: "bad",
    });
  }
  if (h.highestFuelCpmTruck && h.highestFuelCpmTruck.miles > 0) {
    items.push({
      icon: <Fuel className="size-4" />,
      title: "Highest fuel cost / mile",
      value: h.highestFuelCpmTruck.label,
      sub: `${fmt$2(h.highestFuelCpmTruck.fuelPerMile)}/mi · ${fmt$(h.highestFuelCpmTruck.fuel)} total`,
      tone: "bad",
    });
  }
  if (h.highestMaintTruck && h.highestMaintTruck.maintenance > 0) {
    items.push({
      icon: <Wrench className="size-4" />,
      title: "Highest maintenance cost",
      value: h.highestMaintTruck.label,
      sub: `${fmt$(h.highestMaintTruck.maintenance)} total`,
      tone: "bad",
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium flex items-center gap-2">
        <Sparkles className="size-4 text-primary" /> AI Insights
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it, i) => (
          <Card key={i} className="p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(it.tone === "good" && "text-primary", it.tone === "bad" && "text-destructive")}>{it.icon}</span>
              {it.title}
            </div>
            <div className="font-semibold truncate" title={it.value}>{it.value}</div>
            <div className="text-xs text-muted-foreground">{it.sub}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-3 py-2 font-medium whitespace-nowrap", right ? "text-right" : "text-left")}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={cn("px-3 py-2 whitespace-nowrap", right ? "text-right" : "text-left")}>{children}</td>;
}
