import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getHomeDashboard, type HomeDashboardData } from "@/lib/home-dashboard.functions";
import {
  Truck, Users, Package, PackageCheck, Bell, ClipboardCheck,
  DollarSign, Receipt, TrendingUp, Fuel, Gauge, FileText, Wallet,
  Map as MapIcon, Radio, PlusCircle, Wrench, Sparkles,
  Activity, AlertTriangle, ArrowUpRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeDashboard,
});

const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString();

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function HomeDashboard() {
  const [name, setName] = useState<string>("");
  const [now, setNow] = useState<Date>(() => new Date());
  const fetchDashboard = useServerFn(getHomeDashboard);
  const { data, isLoading } = useQuery<HomeDashboardData | null>({
    queryKey: ["home-dashboard"],
    queryFn: () => fetchDashboard(),
    staleTime: 60_000,
  });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, driver_name, username")
        .eq("id", u.user.id)
        .maybeSingle();
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      const first =
        profile?.first_name ||
        profile?.driver_name?.split(" ")[0] ||
        (meta.first_name as string) ||
        (meta.full_name as string)?.split(" ")[0] ||
        (meta.name as string)?.split(" ")[0] ||
        "";
      setName(first);
    })();
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Loading your dashboard…
        </div>
      </div>
    );
  }

  const { fleet, financial, performance7d } = data;
  const hasAnyData =
    fleet.activeTrucks + fleet.loadsInTransit + data.recentLoads.length +
    data.recentSettlements.length + data.recentMaintenance.length > 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {greeting}
          {name ? <>, <span className="text-orange-500">{name}</span></> : null}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back to FleetOS.
        </p>
        <p className="mt-0.5 text-xs font-mono uppercase tracking-widest text-muted-foreground/80">
          {dateStr}
        </p>
      </header>

      {!hasAnyData && (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5 text-sm">
          <strong>Your fleet is just getting started.</strong>{" "}
          Add your first truck, create a load, or log a fuel purchase — every
          number on this page is your real data and will fill in as you work.
        </div>
      )}

      {/* Fleet Status */}
      <Section title="Fleet Status" hint="Live operational snapshot">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Truck} label="Active Trucks" value={num(fleet.activeTrucks)} />
          <StatCard icon={Users} label="Drivers On Duty" value={num(fleet.driversOnDuty)} />
          <StatCard icon={Package} label="Loads In Transit" value={num(fleet.loadsInTransit)} />
          <StatCard icon={PackageCheck} label="Deliveries Today" value={num(fleet.deliveriesToday)} />
          <StatCard icon={Bell} label="Active Alerts" value={num(fleet.activeAlerts)} tone={fleet.activeAlerts > 0 ? "warning" : "default"} />
          <StatCard icon={ClipboardCheck} label="Open Maint. Tasks" value={num(fleet.pendingInspections)} />
        </div>
      </Section>

      {/* Financial Snapshot */}
      <Section title="Financial Snapshot" hint="Today's performance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={DollarSign} label="Revenue Today" value={usd(financial.revenueToday)} tone={financial.revenueToday > 0 ? "success" : "default"} />
          <StatCard icon={Receipt} label="Expenses Today" value={usd(financial.expensesToday)} />
          <StatCard icon={TrendingUp} label="Profit Today" value={usd(financial.profitToday)} tone={financial.profitToday > 0 ? "success" : "default"} />
          <StatCard icon={Gauge} label="Revenue / Mile" value={financial.revenuePerMile != null ? `$${financial.revenuePerMile.toFixed(2)}` : "—"} />
          <StatCard icon={Fuel} label="Fuel Cost" value={usd(financial.fuelCostToday)} />
          <StatCard icon={Activity} label="Average MPG" value={financial.averageMpg != null ? financial.averageMpg.toFixed(1) : "—"} />
          <StatCard icon={Wallet} label="Settlements (30d)" value={usd(financial.settlementTotal30d)} />
          <StatCard icon={FileText} label="Outstanding Invoices" value={usd(financial.outstandingInvoices)} tone={financial.outstandingInvoices > 0 ? "warning" : "default"} />
        </div>
      </Section>

      {/* Quick Actions */}
      <Section title="Quick Actions">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <QuickAction to="/dashboard" icon={MapIcon} label="Analyze Route" />
          <QuickAction to="/dispatch" icon={Radio} label="Dispatch Load" />
          <QuickAction to="/loads" icon={PlusCircle} label="Create Load" />
          <QuickAction to="/fuel" icon={Fuel} label="Fuel Entry" />
          <QuickAction to="/inspections" icon={ClipboardCheck} label="Inspection" />
          <QuickAction to="/maintenance" icon={Wrench} label="Maintenance" />
          <QuickAction to="/assistant" icon={Sparkles} label="AI Copilot" />
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts */}
        <Panel title="Active Alerts" icon={AlertTriangle}>
          {data.alertsFeed.length === 0 ? (
            <EmptyState text="No active alerts right now." />
          ) : (
            <FeedList
              items={data.alertsFeed.map((a) => ({
                icon: AlertTriangle,
                text: a.text,
                meta: timeAgo(a.at),
                tone: a.severity === "high" || a.severity === "critical" ? "destructive" : "warning",
              }))}
            />
          )}
        </Panel>

        {/* Activity */}
        <Panel title="Recent Fleet Activity" icon={Activity}>
          {data.activity.length === 0 ? (
            <EmptyState text="No activity yet — trips and loads will appear here." />
          ) : (
            <FeedList
              items={data.activity.map((a) => ({
                icon: Truck,
                text: a.text,
                meta: timeAgo(a.at),
                tone: "default",
              }))}
            />
          )}
        </Panel>
      </div>

      {/* AI Copilot */}
      <div className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-black">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Navaroad Copilot</h2>
              <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-orange-500">
                Live
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Smart recommendations across your fleet.
            </p>
          </div>
          <Link
            to="/assistant"
            className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            Open <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
          {(hasAnyData
            ? [
                "Ask Copilot which loads were most profitable this week.",
                "Ask Copilot to summarize fuel spend by truck.",
                "Ask Copilot which drivers are approaching HOS limits.",
                "Ask Copilot to draft a maintenance plan from open tasks.",
              ]
            : [
                "Add your first truck, then ask Copilot for a profitability breakdown.",
                "Create a load and ask Copilot to suggest a dispatch plan.",
                "Log a fuel purchase and ask Copilot to track your cost per mile.",
                "Ask Copilot how to set up inspections for your fleet.",
              ]
          ).map((s, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-background/60 p-3 text-sm"
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Performance Summary */}
      <Section title="Performance Summary" hint="Last 7 days">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MiniChart label="Revenue" value={usd(performance7d.revenue.reduce((a, b) => a + b, 0))} bars={toBars(performance7d.revenue)} tone="success" />
          <MiniChart label="Expenses" value={usd(performance7d.expenses.reduce((a, b) => a + b, 0))} bars={toBars(performance7d.expenses)} tone="default" />
          <MiniChart label="Profit" value={usd(performance7d.profit.reduce((a, b) => a + b, 0))} bars={toBars(performance7d.profit)} tone="success" />
          <MiniChart label="Miles" value={num(Math.round(performance7d.miles.reduce((a, b) => a + b, 0)))} bars={toBars(performance7d.miles)} tone="default" />
          <MiniChart label="Fuel" value={usd(performance7d.fuel.reduce((a, b) => a + b, 0))} bars={toBars(performance7d.fuel)} tone="default" />
        </div>
      </Section>

      {/* Recent lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Recent Loads" icon={Package}>
          {data.recentLoads.length === 0 ? (
            <EmptyState text="No loads yet — create your first load." />
          ) : (
            <CompactList
              items={data.recentLoads.map((l) => ({
                primary: l.label,
                secondary: `${l.status}${l.rateUsd != null ? ` · ${usd(l.rateUsd)}` : ""}`,
              }))}
            />
          )}
        </Panel>
        <Panel title="Recent Settlements" icon={Wallet}>
          {data.recentSettlements.length === 0 ? (
            <EmptyState text="No settlements yet." />
          ) : (
            <CompactList
              items={data.recentSettlements.map((s) => ({
                primary: s.label,
                secondary: `${usd(s.amountUsd)} · ${s.status}`,
              }))}
            />
          )}
        </Panel>
        <Panel title="Recent Maintenance" icon={Wrench}>
          {data.recentMaintenance.length === 0 ? (
            <EmptyState text="No maintenance records yet." />
          ) : (
            <CompactList
              items={data.recentMaintenance.map((m) => ({
                primary: m.label,
                secondary: m.detail,
              }))}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Normalize daily values to bar heights (0–100). All-zero → flat minimal bars. */
function toBars(values: number[]): number[] {
  const max = Math.max(...values, 0);
  if (max <= 0) return values.map(() => 4);
  return values.map((v) => Math.max(4, Math.round((v / max) * 100)));
}

/* ---------------- primitives ---------------- */

function Section({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-3 text-sm text-muted-foreground">{text}</p>;
}

type Tone = "default" | "success" | "warning" | "destructive";
const TONE_ICON: Record<Tone, string> = {
  default: "bg-orange-500/10 text-orange-500",
  success: "bg-emerald-500/10 text-emerald-500",
  warning: "bg-amber-500/10 text-amber-500",
  destructive: "bg-destructive/10 text-destructive",
};

function StatCard({
  icon: Icon, label, value, tone = "default",
}: { icon: LucideIcon; label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <div className={cn("size-9 rounded-lg grid place-items-center", TONE_ICON[tone])}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </div>
          <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  to, icon: Icon, label,
}: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition hover:border-orange-500/50 hover:bg-accent"
    >
      <div className="grid size-10 place-items-center rounded-lg bg-orange-500/10 text-orange-500 transition group-hover:bg-orange-500 group-hover:text-black">
        <Icon className="size-5" />
      </div>
      <div className="text-xs font-semibold leading-tight">{label}</div>
    </Link>
  );
}

function Panel({
  title, icon: Icon, children,
}: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-500">
          <Icon className="size-4" />
        </div>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FeedList({
  items,
}: {
  items: Array<{ icon: LucideIcon; text: string; meta?: string; tone?: Tone }>;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((it, i) => {
        const Icon = it.icon;
        const tone = it.tone ?? "default";
        return (
          <li key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className={cn("mt-0.5 size-7 shrink-0 grid place-items-center rounded-md", TONE_ICON[tone])}>
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug">{it.text}</div>
              {it.meta ? (
                <div className="text-[11px] text-muted-foreground">{it.meta}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CompactList({
  items,
}: {
  items: Array<{ primary: string; secondary: string }>;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((it, i) => (
        <li key={i} className="py-2.5 first:pt-0 last:pb-0">
          <div className="text-sm font-medium truncate">{it.primary}</div>
          <div className="text-[11px] text-muted-foreground truncate">{it.secondary}</div>
        </li>
      ))}
    </ul>
  );
}

function MiniChart({
  label, value, bars, tone,
}: { label: string; value: string; bars: number[]; tone: Tone }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums leading-tight">{value}</div>
      <div className="mt-2 flex h-10 items-end gap-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm",
              i === bars.length - 1 && h > 4
                ? tone === "success" ? "bg-emerald-500" : "bg-orange-500"
                : "bg-muted",
            )}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}
