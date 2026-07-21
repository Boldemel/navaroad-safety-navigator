import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, Users, Package, PackageCheck, Bell, ClipboardCheck,
  DollarSign, Receipt, TrendingUp, Fuel, Gauge, FileText, Wallet,
  Map as MapIcon, Radio, PlusCircle, Wrench, Sparkles, ClipboardList,
  Activity, AlertTriangle, CheckCircle2, Clock, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeDashboard,
});

function HomeDashboard() {
  const [name, setName] = useState<string>("");
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      const first =
        (meta.first_name as string) ||
        (meta.full_name as string)?.split(" ")[0] ||
        (meta.name as string)?.split(" ")[0] ||
        u.user.email?.split("@")[0] ||
        "Driver";
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

      {/* Fleet Status */}
      <Section title="Fleet Status" hint="Live operational snapshot">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Truck} label="Active Trucks" value="12" />
          <StatCard icon={Users} label="Drivers On Duty" value="9" />
          <StatCard icon={Package} label="Loads In Transit" value="7" />
          <StatCard icon={PackageCheck} label="Deliveries Today" value="4" />
          <StatCard icon={Bell} label="Active Alerts" value="3" tone="warning" />
          <StatCard icon={ClipboardCheck} label="Pending Inspections" value="2" />
        </div>
      </Section>

      {/* Financial Snapshot */}
      <Section title="Financial Snapshot" hint="Today's performance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={DollarSign} label="Revenue Today" value="$18,420" tone="success" />
          <StatCard icon={Receipt} label="Expenses Today" value="$6,910" />
          <StatCard icon={TrendingUp} label="Profit Today" value="$11,510" tone="success" />
          <StatCard icon={Gauge} label="Revenue / Mile" value="$2.45" />
          <StatCard icon={Fuel} label="Fuel Cost" value="$3,240" />
          <StatCard icon={Activity} label="Average MPG" value="6.8" />
          <StatCard icon={Wallet} label="Settlement Total" value="$42,180" />
          <StatCard icon={FileText} label="Outstanding Invoices" value="$27,650" tone="warning" />
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
        <Panel title="Today's Alerts" icon={AlertTriangle}>
          <FeedList
            items={[
              { icon: AlertTriangle, text: "High winds along I-80", meta: "Weather · 12m ago", tone: "warning" },
              { icon: Clock, text: "Truck #418 approaching HOS limit", meta: "Compliance · 24m ago", tone: "warning" },
              { icon: ClipboardCheck, text: "Inspection due tomorrow — Truck #521", meta: "Compliance", tone: "default" },
              { icon: Wrench, text: "Maintenance overdue — Truck #412", meta: "Maintenance · 1h ago", tone: "destructive" },
              { icon: Fuel, text: "Low fuel warning — Truck #305", meta: "Fuel · 2h ago", tone: "default" },
            ]}
          />
        </Panel>

        {/* Activity */}
        <Panel title="Live Fleet Activity" icon={Activity}>
          <FeedList
            items={[
              { icon: Truck, text: "Truck #412 departed Dallas, TX", meta: "3m ago" },
              { icon: PackageCheck, text: "Load #LD-2043 delivered in Atlanta, GA", meta: "18m ago", tone: "success" },
              { icon: ClipboardCheck, text: "Driver Smith completed pre-trip inspection", meta: "42m ago" },
              { icon: Fuel, text: "Fuel purchase recorded — Truck #305", meta: "1h ago" },
              { icon: Wrench, text: "Maintenance completed — Truck #418", meta: "2h ago", tone: "success" },
            ]}
          />
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
          {[
            "Fuel prices are lower ahead on your current route — save an estimated $84.",
            "Truck #521 profitability dropped 12% this week. Review settlements?",
            "Driver Smith can accept another load after 4:30 PM based on HOS.",
            "Inspection deadline tomorrow — 2 trucks due.",
          ].map((s, i) => (
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
          <MiniChart label="Revenue" value="$142,850" delta="+12.4%" bars={[42, 65, 55, 78, 90, 72, 95]} tone="success" />
          <MiniChart label="Expenses" value="$48,220" delta="-3.1%" bars={[60, 55, 62, 50, 58, 48, 52]} tone="default" />
          <MiniChart label="Profit" value="$94,630" delta="+18.2%" bars={[35, 48, 42, 62, 74, 68, 82]} tone="success" />
          <MiniChart label="RPM" value="$2.45" delta="+0.08" bars={[40, 44, 42, 48, 52, 50, 56]} tone="default" />
          <MiniChart label="Fuel" value="$32,180" delta="-1.2%" bars={[55, 60, 58, 52, 50, 48, 46]} tone="default" />
          <MiniChart label="Miles" value="58,410" delta="+6.9%" bars={[50, 58, 55, 66, 72, 68, 78]} tone="default" />
        </div>
      </Section>

      {/* Recent lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Recent Loads" icon={Package}>
          <CompactList
            items={[
              { primary: "LD-2043 · Dallas → Atlanta", secondary: "Delivered · $2,450" },
              { primary: "LD-2042 · Phoenix → Denver", secondary: "In transit · $3,120" },
              { primary: "LD-2041 · Chicago → Nashville", secondary: "Assigned · $2,780" },
            ]}
          />
        </Panel>
        <Panel title="Recent Settlements" icon={Wallet}>
          <CompactList
            items={[
              { primary: "Driver Smith · Wk 29", secondary: "$4,820 · Paid" },
              { primary: "Driver Reyes · Wk 29", secondary: "$4,210 · Paid" },
              { primary: "Driver Kim · Wk 29", secondary: "$3,940 · Pending" },
            ]}
          />
        </Panel>
        <Panel title="Recent Maintenance" icon={Wrench}>
          <CompactList
            items={[
              { primary: "Truck #418 · Oil change", secondary: "Completed today" },
              { primary: "Truck #521 · Brake inspection", secondary: "Scheduled tomorrow" },
              { primary: "Truck #305 · Tire rotation", secondary: "Completed yesterday" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
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
        <div className="grid size-8 place-items-center rounded-lg bg-orange-500/10 text-orange-500">
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
  label, value, delta, bars, tone,
}: { label: string; value: string; delta: string; bars: number[]; tone: Tone }) {
  const positive = delta.trim().startsWith("+");
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums leading-tight">{value}</div>
      <div className={cn(
        "text-[11px] font-semibold",
        positive ? "text-emerald-500" : "text-muted-foreground",
      )}>
        {delta}
      </div>
      <div className="mt-2 flex h-10 items-end gap-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm",
              i === bars.length - 1
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
