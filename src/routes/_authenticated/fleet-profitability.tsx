import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Fuel, Wrench, Users, Receipt, Truck, Sparkles, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getFleetProfitability,
  generateProfitabilityInsights,
} from "@/lib/fleet-profitability.functions";

export const Route = createFileRoute("/_authenticated/fleet-profitability")({
  component: FleetProfitabilityPage,
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

function FleetProfitabilityPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === "month") {
      setFrom(startOfMonth(now));
      setTo(today());
    } else if (p === "last") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(first.toISOString().slice(0, 10));
      setTo(last.toISOString().slice(0, 10));
    } else if (p === "ytd") {
      setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setTo(today());
    }
  };

  const fetchProfit = useServerFn(getFleetProfitability);
  const { data, isLoading, error } = useQuery({
    queryKey: ["fleet-profit", from, to],
    queryFn: () => fetchProfit({ data: { from, to } }),
  });

  return (
    <div className="container max-w-6xl py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="size-6 text-primary" /> Fleet Profitability
        </h1>
        <p className="text-sm text-muted-foreground">
          Revenue, costs, and profit across your fleet
        </p>
      </div>

      {/* Date controls */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["month", "last", "ytd", "custom"] as Preset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "outline"}
              onClick={() => applyPreset(p)}
            >
              {p === "month" ? "This month" : p === "last" ? "Last month" : p === "ytd" ? "YTD" : "Custom"}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="h-9 w-auto text-xs" />
            <span className="text-xs text-muted-foreground">→</span>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="h-9 w-auto text-xs" />
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 text-sm text-destructive">
          {(error as Error).message}
        </Card>
      )}

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading profitability…
        </div>
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="truck">By Truck</TabsTrigger>
            <TabsTrigger value="load">By Load</TabsTrigger>
            <TabsTrigger value="driver">By Driver</TabsTrigger>
            <TabsTrigger value="ai">AI Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <OverviewTab data={data} />
          </TabsContent>
          <TabsContent value="truck" className="mt-4">
            <TruckTab rows={data.byTruck} />
          </TabsContent>
          <TabsContent value="load" className="mt-4">
            <LoadTab rows={data.byLoad} />
          </TabsContent>
          <TabsContent value="driver" className="mt-4">
            <DriverTab rows={data.byDriver} />
          </TabsContent>
          <TabsContent value="ai" className="mt-4">
            <AIInsightsTab from={from} to={to} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "good" | "bad" | "neutral" }) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={cn(
        "text-xl font-bold",
        tone === "good" && "text-primary",
        tone === "bad" && "text-destructive",
      )}>{value}</div>
    </Card>
  );
}

function OverviewTab({ data }: { data: import("@/lib/fleet-profitability.functions").FleetProfitability }) {
  const o = data.overview;
  const totalExp = o.fuel + o.maintenance + o.driverPay + o.otherExpenses;
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

      <Card className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><div className="text-xs text-muted-foreground">Total miles</div><div className="font-semibold">{o.totalMiles.toLocaleString()}</div></div>
        <div><div className="text-xs text-muted-foreground">Profit / mile</div><div className={cn("font-semibold", o.profitPerMile >= 0 ? "text-primary" : "text-destructive")}>{fmt$2(o.profitPerMile)}</div></div>
        <div><div className="text-xs text-muted-foreground">Margin</div><div className="font-semibold">{o.revenue > 0 ? `${((o.netProfit / o.revenue) * 100).toFixed(1)}%` : "—"}</div></div>
      </Card>
    </div>
  );
}

function profitClass(n: number) {
  return n >= 0 ? "text-primary font-medium" : "text-destructive font-medium";
}

function TruckTab({ rows }: { rows: import("@/lib/fleet-profitability.functions").TruckRow[] }) {
  if (rows.length === 0) return <Empty icon={<Truck className="size-8" />} text="No truck data in this range." />;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <Th>Truck #</Th><Th right>Revenue</Th><Th right>Expenses</Th><Th right>Profit</Th><Th right>Profit / mi</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.truckUnit} className="border-b border-border last:border-0">
              <Td>{r.truckUnit}</Td>
              <Td right>{fmt$(r.revenue)}</Td>
              <Td right>{fmt$(r.expenses)}</Td>
              <Td right><span className={profitClass(r.profit)}>{fmt$(r.profit)}</span></Td>
              <Td right><span className={profitClass(r.profitPerMile)}>{r.miles > 0 ? fmt$2(r.profitPerMile) : "—"}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LoadTab({ rows }: { rows: import("@/lib/fleet-profitability.functions").LoadRow[] }) {
  if (rows.length === 0) return <Empty icon={<Receipt className="size-8" />} text="No load data in this range." />;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <Th>Load #</Th><Th>Customer</Th><Th right>Revenue</Th><Th right>Expenses</Th><Th right>Net profit</Th><Th right>Profit / mi</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.loadId} className="border-b border-border last:border-0">
              <Td>{r.loadNumber}</Td>
              <Td>{r.customer ?? "—"}</Td>
              <Td right>{fmt$(r.revenue)}</Td>
              <Td right>{fmt$(r.expenses)}</Td>
              <Td right><span className={profitClass(r.netProfit)}>{fmt$(r.netProfit)}</span></Td>
              <Td right><span className={profitClass(r.profitPerMile)}>{r.miles > 0 ? fmt$2(r.profitPerMile) : "—"}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DriverTab({ rows }: { rows: import("@/lib/fleet-profitability.functions").DriverRow[] }) {
  if (rows.length === 0) return <Empty icon={<Users className="size-8" />} text="No driver data in this range." />;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <Th>Driver</Th><Th right>Loads</Th><Th right>Revenue</Th><Th right>Cost</Th><Th right>Profit contribution</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driverId} className="border-b border-border last:border-0">
              <Td>{r.driverName}</Td>
              <Td right>{r.loadsCompleted}</Td>
              <Td right>{fmt$(r.revenue)}</Td>
              <Td right>{fmt$(r.cost)}</Td>
              <Td right><span className={profitClass(r.profitContribution)}>{fmt$(r.profitContribution)}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AIInsightsTab({ from, to }: { from: string; to: string }) {
  const fetchInsights = useServerFn(generateProfitabilityInsights);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["fleet-profit-insights", from, to],
    queryFn: () => fetchInsights({ data: { from, to } }),
    enabled: false,
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> AI insights
        </div>
        <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <><Loader2 className="size-3.5 animate-spin mr-1" /> Analyzing…</> : data ? "Regenerate" : "Generate insights"}
        </Button>
      </div>
      {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}
      {!data && !isFetching && !error && (
        <p className="text-sm text-muted-foreground">
          Click "Generate insights" for an AI summary of revenue trends, cost drivers, and outliers in the selected range.
        </p>
      )}
      {data && (
        <ul className="space-y-2">
          {data.insights.map((line, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-3 py-2 font-medium", right ? "text-right" : "text-left")}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={cn("px-3 py-2", right ? "text-right" : "text-left")}>{children}</td>;
}
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card className="p-8 flex flex-col items-center gap-2 text-muted-foreground">
      {icon}
      <div className="text-sm">{text}</div>
    </Card>
  );
}
