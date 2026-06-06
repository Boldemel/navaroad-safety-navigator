import { createFileRoute, Link } from "@tanstack/react-router";
import { Truck, Wind, Map, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Navaroad — Trucking Safety Intelligence" },
      { name: "description", content: "Real-time hazard, wind, and closure intelligence for professional drivers, owner operators, and small fleets." },
      { property: "og:title", content: "Navaroad — Trucking Safety Intelligence" },
      { property: "og:description", content: "Avoid dangerous conditions before you reach them." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-semibold">
          <div className="size-9 rounded-md bg-primary flex items-center justify-center">
            <Truck className="size-5 text-primary-foreground" />
          </div>
          Navaroad
        </div>
        <Button asChild><Link to="/auth">Sign in</Link></Button>
      </header>

      <section className="relative road-grid">
        <div className="max-w-7xl mx-auto px-6 py-24 lg:py-32 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3" /> Built for professional drivers
          </span>
          <h1 className="mt-6 text-4xl lg:text-6xl font-semibold tracking-tight max-w-3xl mx-auto">
            Know what's ahead. <span className="text-primary">Before it stops you.</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto">
            Navaroad surfaces wind risk, road closures, and driver hazard reports so you can re-route before you're stuck.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Button size="lg" asChild><Link to="/auth">Get started free</Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/auth">Sign in</Link></Button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-6">
        {[
          { icon: Map, title: "Route Analysis", body: "Run your origin → destination through live hazard data and get a safety score before you roll." },
          { icon: Wind, title: "Wind & Weather Risk", body: "Crosswind and storm alerts targeted at high-profile trailers — empty, loaded, or anywhere between." },
          { icon: AlertTriangle, title: "Driver Reports", body: "Crowd-sourced closures, debris, full lots, and accidents from drivers running the same lanes." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-6">
            <div className="size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
              <f.icon className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © Navaroad — Trucking Safety Intelligence
      </footer>
    </div>
  );
}
