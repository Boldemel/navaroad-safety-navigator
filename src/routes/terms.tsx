import { createFileRoute, Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Navaroad" },
      { name: "description", content: "The terms that govern your use of the Navaroad trucking safety platform." },
    ],
  }),
  component: Terms,
});

function Terms() {
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

      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: June 8, 2026</p>

        <section className="mt-8 space-y-3 text-sm leading-relaxed">
          <h2 className="text-xl font-semibold">1. Acceptance</h2>
          <p>By creating an account or using Navaroad FleetOS you agree to these Terms of Service and our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>. If you do not agree, do not use the service.</p>

          <h2 className="text-xl font-semibold pt-4">2. Safety disclaimer — read this</h2>
          <p><strong>Navaroad is a decision-support tool, not a substitute for your own judgment.</strong> Routes, hazards, weather, weigh-station status, and other data are provided "as is" from third-party sources and other drivers and may be incomplete, delayed, or wrong. Always obey traffic laws, DOT regulations, posted signage, and your dispatcher's instructions. Do not interact with the app while driving.</p>

          <h2 className="text-xl font-semibold pt-4">3. Your account</h2>
          <p>You are responsible for keeping your credentials secure and for any activity under your account. Provide accurate truck dimensions — routing decisions depend on them.</p>

          <h2 className="text-xl font-semibold pt-4">4. Community hazard reports</h2>
          <p>You may submit hazard reports based on what you observe firsthand. Do not submit false, misleading, harassing, or unlawful content. We may remove reports and suspend accounts that violate this. Reports you submit become visible to other Navaroad drivers.</p>

          <h2 className="text-xl font-semibold pt-4">5. Acceptable use</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>No scraping, reverse engineering, or automated abuse of the service.</li>
            <li>No reselling Navaroad data without written permission.</li>
            <li>No interference with the service or other users.</li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">6. Termination</h2>
          <p>You can delete your account at any time from Profile → Delete account. We may suspend or terminate access for violations of these Terms.</p>

          <h2 className="text-xl font-semibold pt-4">7. Limitation of liability</h2>
          <p>To the maximum extent permitted by law, Navaroad Technologies LLC is not liable for any indirect, incidental, or consequential damages, lost revenue, or losses arising from reliance on the information the service provides. Your sole remedy is to stop using the service.</p>

          <h2 className="text-xl font-semibold pt-4">8. Changes</h2>
          <p>We may update these Terms. Material changes will be communicated in-app or by email. Continued use after the effective date constitutes acceptance.</p>

          <h2 className="text-xl font-semibold pt-4">9. Contact</h2>
          <p>Questions about these Terms of Service: <a className="text-primary hover:underline" href="mailto:legal@navaroad.com">legal@navaroad.com</a>.</p>
          <p className="text-xs text-muted-foreground pt-2">Navaroad Technologies LLC · PO Box 620676 · Oviedo, FL 32762</p>
        </section>

        <p className="mt-10 text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">← Back to home</Link>
        </p>
      </article>
    </div>
  );
}
