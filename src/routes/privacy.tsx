import { createFileRoute, Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Navaroad" },
      { name: "description", content: "How Navaroad collects, uses, and protects driver data, location, and account information." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center px-6 max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <div className="size-9 rounded-md bg-primary flex items-center justify-center">
            <Truck className="size-5 text-primary-foreground" />
          </div>
          Navaroad
        </Link>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-invert prose-headings:tracking-tight prose-headings:font-semibold">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: June 8, 2026</p>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-xl font-semibold">1. Who we are</h2>
          <p>Navaroad Technologies LLC ("Navaroad", "we", "us") provides the Navaroad FleetOS platform — route analysis, hazard reporting, dispatch, compliance, fuel, maintenance, settlements, and profitability tools — to owner operators, small fleets, growing fleets, and enterprise carriers.</p>

          <h2 className="text-xl font-semibold pt-4">2. What we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account data:</strong> email, driver name, password (hashed), and authentication tokens from Google sign-in if used.</li>
            <li><strong>Truck profile:</strong> truck type, dimensions, weight, axles, hazmat status, and load status you enter.</li>
            <li><strong>Location data:</strong> your GPS coordinates while the app is open, used to power proximity hazard alerts, route analysis, and "nearby" features. We do not store a continuous location history.</li>
            <li><strong>Hazard reports:</strong> the content, severity, and approximate location of reports you submit.</li>
            <li><strong>Diagnostic data:</strong> error logs and basic device info to keep the service stable.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">3. How we use it</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide and improve the navigation, weather, hazard, dispatch, and fleet management features.</li>
            <li>To send notifications you enable (email, push, SMS for critical alerts).</li>
            <li>To moderate community hazard reports.</li>
            <li>To enforce our Terms and prevent abuse.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">4. Who we share with</h2>
          <p>We do not sell your personal data. We share limited data only with infrastructure providers needed to run the service: TomTom (maps, routing, geocoding), the National Weather Service (US weather alerts), OpenStreetMap (basemap data), and our hosting/database provider. Aggregated, de-identified hazard data may be visible to other drivers on the map.</p>

          <h2 className="text-xl font-semibold pt-4">5. Your rights</h2>
          <p>You can view and edit your profile at any time, and permanently delete your account and associated data from Profile → Delete account. Hazard reports remain visible to the community but are detached from your account on deletion.</p>

          <h2 className="text-xl font-semibold pt-4">6. Security</h2>
          <p>Passwords are hashed, transport is encrypted with TLS, and database access is restricted by row-level security. We check new passwords against the Have I Been Pwned breach database.</p>

          <h2 className="text-xl font-semibold pt-4">7. Children</h2>
          <p>Navaroad is intended for commercial drivers and is not directed to anyone under 18.</p>

          <h2 className="text-xl font-semibold pt-4">8. Contact</h2>
          <p>Questions or requests about this Privacy Policy: <a className="text-primary hover:underline" href="mailto:info@navaroad.com">info@navaroad.com</a>.</p>
          <p className="text-xs text-muted-foreground pt-2">Navaroad Technologies LLC · PO Box 620676 · Oviedo, FL 32762</p>
        </section>

        <p className="mt-10 text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">← Back to home</Link>
        </p>
      </article>
    </div>
  );
}
