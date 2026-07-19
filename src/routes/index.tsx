import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Truck, Map, CloudSun, PackageCheck, Radio, Users, Clock, Fuel,
  Wrench, ClipboardCheck, FileText, DollarSign, Receipt, TrendingUp,
  Sparkles, ShieldCheck, Building2, UserCog, HeadphonesIcon, Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Navaroad FleetOS | AI-Powered Trucking and Fleet Management Software" },
      {
        name: "description",
        content:
          "Navaroad FleetOS combines fleet management, truck navigation, dispatch, loads, HOS, IFTA, maintenance, inspections, fuel, expenses, profitability, and built-in AI in one trucking platform.",
      },
      { property: "og:title", content: "Navaroad FleetOS | AI-Powered Trucking and Fleet Management Software" },
      {
        property: "og:description",
        content:
          "The AI-powered operating system for modern trucking. Manage fleet, drivers, loads, routes, compliance, maintenance, fuel, and profitability from one connected platform.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://navaroad.com/" },
    ],
    links: [{ rel: "canonical", href: "https://navaroad.com/" }],
  }),
  component: Landing,
});



const FLEET_FEATURES = [
  { icon: Map, title: "GPS and Route Analysis", body: "Commercial routing with live hazard, weather, and safety scoring for every trip." },
  { icon: CloudSun, title: "Weather and Hazard Intelligence", body: "Wind, storms, closures, and driver-reported hazards along your lanes." },
  { icon: PackageCheck, title: "Load Management", body: "Create, assign, and track loads from pickup to delivery with full revenue history." },
  { icon: Radio, title: "Dispatch Management", body: "Airline-style dispatcher workspace with live status, timelines, and AI recommendations." },
  { icon: Users, title: "Driver and Team Management", body: "Organize your team, roles, permissions, pay, and per-driver performance." },
  { icon: Clock, title: "Hours-of-Service Tracking", body: "Duty status, cycle usage, and remaining drive time in one clear view." },
  { icon: FileText, title: "IFTA Mileage Reporting", body: "Automatic per-state mileage and gallons ready for quarterly filing." },
  { icon: Fuel, title: "Fuel Management", body: "Log fills, monitor price per gallon and MPG, and spot fuel trends by truck." },
  { icon: Wrench, title: "Maintenance Tracking", body: "PM schedules, repair history, and cost per truck to keep the fleet moving." },
  { icon: ClipboardCheck, title: "Inspections and Defects", body: "DVIRs, defect tracking, and inspection history for every unit." },
  { icon: FileText, title: "Driver Documents", body: "CDL, medical card, and compliance documents with expiration alerts." },
  { icon: DollarSign, title: "Expenses and Revenue", body: "Track every dollar in and out by category, vendor, driver, and truck." },
  { icon: Receipt, title: "Settlements", body: "Driver pay, deductions, and settlement statements without the spreadsheets." },
  { icon: TrendingUp, title: "Profitability Analysis", body: "See true profit by fleet, truck, driver, and load." },
  { icon: Sparkles, title: "Built-In AI Assistant", body: "Ask the Navaroad Copilot about routes, loads, compliance, and profitability." },
];

const WHO_ITS_FOR = [
  { icon: Truck, label: "Owner-Operators" },
  { icon: Building2, label: "Small Fleets" },
  { icon: TrendingUp, label: "Growing Fleets" },
  { icon: UserCog, label: "Fleet Managers" },
  { icon: Radio, label: "Dispatchers" },
  { icon: ShieldCheck, label: "Safety Managers" },
  { icon: Wrench, label: "Maintenance Teams" },
  { icon: Calculator, label: "Accountants & Operations" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border">
        <div className="h-full max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <div className="size-9 rounded-md bg-primary flex items-center justify-center">
              <Truck className="size-5 text-primary-foreground" />
            </div>
            <span>NAVAROAD</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <a href="#features">Features</a>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/auth" search={{ mode: "signin" }}>Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth" search={{ mode: "signup" }}>Access FleetOS</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative road-grid">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-32 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3" /> Navaroad FleetOS
          </span>
          <div className="mt-6 text-sm font-semibold tracking-[0.3em] text-muted-foreground">NAVAROAD</div>
          <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight max-w-4xl mx-auto">
            The AI-Powered Operating System <span className="text-primary">for Modern Trucking</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Manage your fleet, drivers, loads, routes, compliance, maintenance, fuel, expenses,
            profitability, and daily operations from one connected platform.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild>
              <Link to="/auth" search={{ mode: "signup" }}>Start 7-Day Free Trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/auth" search={{ mode: "signin" }}>Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* COMPLETE FLEET OPERATIONS */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            One Platform. Every Fleet Operation.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every tool your fleet needs, connected through one shared data model and one AI engine.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLEET_FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-colors">
              <div className="size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TRANSPORTATION INFORMATION */}
      <section className="border-y border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Know What's Ahead <span className="text-primary">Before It Stops You</span>
          </h2>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto">
            Navaroad gives professional drivers and fleets access to commercial route analysis,
            road and weather hazards, closures, incident information, truck parking, truck stops,
            fuel locations, weigh stations, and route optimization.
          </p>
        </div>
      </section>

      {/* PROFITABILITY */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="inline-flex size-12 rounded-md bg-primary/15 text-primary items-center justify-center mx-auto">
          <TrendingUp className="size-6" />
        </div>
        <h2 className="mt-6 text-3xl sm:text-4xl font-semibold tracking-tight">
          Know What Every Truck Is <span className="text-primary">Really Earning</span>
        </h2>
        <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto">
          Measure revenue, expenses, fuel, maintenance, settlements, and profitability across your
          fleet or by truck, driver, and load.
        </p>
      </section>

      {/* BUILT-IN AI */}
      <section className="border-y border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <div className="inline-flex size-12 rounded-md bg-primary/15 text-primary items-center justify-center mx-auto">
            <Sparkles className="size-6" />
          </div>
          <h2 className="mt-6 text-3xl sm:text-4xl font-semibold tracking-tight">
            AI Built Into FleetOS
          </h2>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto">
            Use the built-in Navaroad assistant to ask questions about routes, loads, drivers,
            compliance, maintenance, expenses, and profitability.
          </p>
        </div>
      </section>

      {/* WHO IT IS FOR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Built For Every Role in Trucking</h2>
          <p className="mt-4 text-muted-foreground">From solo owner-operators to full operations teams.</p>
        </div>
        <div className="mt-12 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {WHO_ITS_FOR.map((r) => (
            <div key={r.label} className="rounded-xl border border-border bg-card p-6 text-center">
              <div className="mx-auto size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
                <r.icon className="size-5" />
              </div>
              <div className="mt-4 font-medium text-sm">{r.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Run Your Fleet From <span className="text-primary">One Connected System</span>
          </h2>
          <div className="mt-8">
            <Button size="lg" asChild>
              <a href={APP_URL}>Access Navaroad FleetOS</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground space-y-2">
        <div className="flex items-center justify-center gap-4">
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
        </div>
        <div>© Navaroad FleetOS — The AI-Powered Operating System for Modern Trucking</div>
      </footer>
    </div>
  );
}
