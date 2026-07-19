import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Map, CloudSun, PackageCheck, Radio, Users, Clock, Fuel, Wrench,
  ClipboardCheck, FileText, DollarSign, Receipt, TrendingUp, Sparkles,
  Truck, ShieldCheck, Navigation, AlertTriangle, FolderCheck, Building2,
  ArrowRight, Check,
} from "lucide-react";
import { NavaroadFleetOSLogo, NavaroadMark } from "@/components/brand/logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Navaroad FleetOS | AI Operating System for Trucking" },
      {
        name: "description",
        content:
          "Navaroad FleetOS is the AI operating system for trucking. GPS, dispatch, loads, HOS, IFTA, fuel, maintenance, inspections, settlements, and profitability in one platform.",
      },
      { property: "og:title", content: "Navaroad FleetOS | AI Operating System for Trucking" },
      {
        property: "og:description",
        content:
          "One platform for fleet, drivers, loads, compliance, and profitability. Built for owner operators through enterprise fleets.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://navaroad.com/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://navaroad.com/" }],
  }),
  component: Landing,
});

const MODULES = [
  { icon: Navigation, name: "GPS Navigation" },
  { icon: Map, name: "Route Analysis" },
  { icon: CloudSun, name: "Weather Intelligence" },
  { icon: AlertTriangle, name: "Hazard Alerts" },
  { icon: PackageCheck, name: "Load Management" },
  { icon: Radio, name: "Dispatch Management" },
  { icon: Users, name: "Driver Management" },
  { icon: Truck, name: "Fleet Management" },
  { icon: Clock, name: "HOS Compliance" },
  { icon: FileText, name: "IFTA Reporting" },
  { icon: Fuel, name: "Fuel Management" },
  { icon: Wrench, name: "Maintenance" },
  { icon: ClipboardCheck, name: "Inspections" },
  { icon: FolderCheck, name: "Driver Documents" },
  { icon: DollarSign, name: "Expense Tracking" },
  { icon: Receipt, name: "Settlements" },
  { icon: TrendingUp, name: "Profitability Analysis" },
  { icon: Sparkles, name: "AI Copilot" },
];

const TIERS = [
  {
    name: "Owner Operator",
    price: "$29",
    tagline: "One truck, total control.",
    features: ["All 18 modules", "IFTA & HOS automation", "AI Copilot", "Mobile + web"],
  },
  {
    name: "Small Fleet",
    price: "$79",
    tagline: "Up to 10 power units.",
    features: ["Dispatch workspace", "Driver payroll & settlements", "Profitability by truck", "Priority support"],
    highlight: true,
  },
  {
    name: "Growth Fleet",
    price: "$199",
    tagline: "Scale from 10 to 50 units.",
    features: ["Multi-dispatcher", "Advanced analytics", "Custom roles", "API access"],
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-black text-white antialiased selection:bg-orange-500/30">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <NavaroadFleetOSLogo size={26} tone="dark" />
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/auth" className="hidden text-sm font-medium text-zinc-400 hover:text-white sm:inline">Sign In</Link>
            <Link
              to="/auth"
              className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-black shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 sm:text-sm"
            >
              Access FleetOS
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-5 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="pointer-events-none absolute top-0 right-0 h-72 w-72 rounded-full bg-orange-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 -left-20 h-64 w-64 rounded-full bg-orange-600/10 blur-[100px]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <span className="mb-6 inline-block rounded-full border border-orange-500/30 bg-orange-500/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-orange-400">
            The AI Operating System for Trucking
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            One platform to run <span className="text-orange-500">every mile</span> of your fleet.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Navigation, dispatch, loads, compliance, fuel, maintenance, settlements, and profitability — unified and powered by AI. Built for owner operators through enterprise fleets.
          </p>
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/auth"
              className="rounded-xl bg-orange-500 px-6 py-4 text-center text-base font-bold text-black shadow-xl shadow-orange-500/30 transition active:scale-95"
            >
              Start 7-Day Free Trial
            </Link>
            <Link
              to="/auth"
              className="rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-center text-base font-medium text-white transition hover:bg-white/10"
            >
              Sign In
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-500">Full access to your selected plan. Cancel anytime before day 7.</p>
        </div>
      </section>

      {/* Everything Your Fleet Needs */}
      <section className="border-t border-white/5 bg-zinc-950/60 px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-500">The Platform</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Everything your fleet needs.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500 sm:text-base">
              18 enterprise modules. One interface. Zero context-switching.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {MODULES.map((m, i) => (
              <div
                key={m.name}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-orange-500/40 hover:bg-zinc-900"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-400 transition group-hover:bg-orange-500/20">
                    <m.icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[10px] text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="text-xs font-semibold leading-tight sm:text-sm">{m.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Built Into Every Workflow */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-600/20 via-orange-900/10 to-transparent p-8 sm:p-12">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />
            <div className="relative grid gap-10 md:grid-cols-2 md:items-center">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-400">Intelligence Layer</span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">AI built into every workflow.</h2>
                <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">
                  Navaroad Copilot recommends dispatch assignments, flags compliance risk, forecasts fuel spend, and drafts settlements. Three automation levels — recommend, approve, or auto-rule.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-zinc-400">
                  <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" /> Role-aware context across every module</li>
                  <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" /> Voice input and read-aloud replies</li>
                  <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" /> Persistent memory across sessions</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Copilot · Live</span>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="rounded-lg bg-white/5 p-3 text-zinc-300">Which trucks are under 60% profitability this week?</div>
                  <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-orange-100">
                    3 trucks flagged: <span className="font-semibold">#412, #418, #521</span>. Main driver: fuel cost variance. Want me to draft a settlement review?
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black">Draft review</button>
                    <button className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400">Show trucks</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Profitability Dashboard */}
      <section className="border-t border-white/5 bg-zinc-950/60 px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-500">Real-Time Analytics</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Know exactly what each mile earns.</h2>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Net Profit · Last 7 Days</div>
                <div className="mt-1 text-3xl font-extrabold sm:text-4xl">$142,850</div>
                <div className="text-xs font-semibold text-green-400">+12.4% vs prior week</div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <div className="font-mono text-[10px] uppercase text-zinc-500">RPM</div>
                  <div className="text-lg font-bold">$2.45</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase text-zinc-500">Fuel %</div>
                  <div className="text-lg font-bold text-orange-400">22.4%</div>
                </div>
              </div>
            </div>
            <div className="flex h-40 items-end gap-2 sm:gap-3">
              {[42, 65, 55, 78, 90, 72, 95].map((h, i) => (
                <div key={i} className="group relative flex-1">
                  <div
                    className={`rounded-t-md ${i === 6 ? "bg-orange-500" : "bg-zinc-800 group-hover:bg-zinc-700"} transition-all`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2 text-center font-mono text-[10px] text-zinc-600 sm:gap-3">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d}>{d}</div>)}
            </div>
          </div>
        </div>
      </section>

      {/* Built For Every Fleet Size */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-500">Built For Scale</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Owner operators through enterprise fleets.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { icon: Truck, name: "Owner Operator", body: "One truck. Full-power tools without enterprise pricing." },
              { icon: Users, name: "Small Fleet", body: "2–10 units. Dispatch, driver pay, and compliance covered." },
              { icon: TrendingUp, name: "Growth Fleet", body: "10–50 units. Multi-dispatcher, deep analytics, API access." },
              { icon: Building2, name: "Enterprise", body: "50+ units. Custom roles, integrations, dedicated success." },
            ].map(t => (
              <div key={t.name} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition hover:border-orange-500/40">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-orange-500/10 text-orange-400">
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="mb-2 font-bold">{t.name}</div>
                <p className="text-sm text-zinc-400">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-white/5 bg-zinc-950/60 px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-500">Pricing</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Transparent plans. 7-day free trial.</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-zinc-500">Every plan includes the AI Copilot and all 18 modules. Enterprise available on request.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {TIERS.map(t => (
              <div
                key={t.name}
                className={`relative rounded-3xl border p-8 ${
                  t.highlight
                    ? "border-orange-500/50 bg-gradient-to-b from-orange-500/10 to-transparent shadow-2xl shadow-orange-500/10"
                    : "border-zinc-800 bg-zinc-900/60"
                }`}
              >
                {t.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
                    Most Popular
                  </div>
                )}
                <div className="mb-1 text-sm font-semibold text-orange-400">{t.name}</div>
                <div className="mb-1 text-4xl font-extrabold">{t.price}<span className="text-base font-medium text-zinc-500">/mo</span></div>
                <p className="mb-6 text-sm text-zinc-500">{t.tagline}</p>
                <ul className="mb-8 space-y-2 text-sm text-zinc-300">
                  {t.features.map(f => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth"
                  className={`block rounded-xl py-3 text-center text-sm font-bold transition ${
                    t.highlight
                      ? "bg-orange-500 text-black hover:bg-orange-400"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-500">Operators</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Built with drivers, dispatchers, and owners.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { quote: "Cut our dispatch overhead almost in half. The AI catches things a human would miss at 2am.", who: "Terminal Manager", where: "Midwest Reefer Fleet" },
              { quote: "Finally know what each truck actually earns. IFTA takes minutes now, not a weekend.", who: "Owner Operator", where: "48-state OTR" },
              { quote: "One platform replaced four subscriptions. Our drivers actually use it.", who: "Director of Operations", where: "Regional Flatbed" },
            ].map((t, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                <ShieldCheck className="mb-4 h-5 w-5 text-orange-400" />
                <p className="mb-4 text-sm leading-relaxed text-zinc-200">"{t.quote}"</p>
                <div className="text-xs font-semibold text-white">{t.who}</div>
                <div className="text-xs text-zinc-500">{t.where}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-white/5 px-5 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Ready to run your fleet on <span className="text-orange-500">FleetOS</span>?
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-base text-zinc-400">
            Start a 7-day free trial. Full access to every module and the AI Copilot. No commitment.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-4 text-base font-bold text-black shadow-2xl shadow-orange-500/40 transition active:scale-95"
            >
              Access FleetOS <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/auth"
              className="rounded-xl border border-white/10 px-8 py-4 text-base font-medium text-white hover:bg-white/5"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-zinc-600 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="grid h-5 w-5 place-items-center rounded bg-orange-500 text-[10px] font-black text-black">N</div>
            <span className="font-bold tracking-tight text-zinc-400">NAVAROAD FLEETOS</span>
          </div>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/auth" className="hover:text-white">Sign In</Link>
          </div>
          <div>© {new Date().getFullYear()} Navaroad</div>
        </div>
      </footer>
    </div>
  );
}
