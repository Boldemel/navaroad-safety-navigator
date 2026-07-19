import { createFileRoute } from "@tanstack/react-router";
import { LOGO_VARIATIONS } from "@/components/brand/logo-variations";

export const Route = createFileRoute("/brand-logo")({
  component: BrandLogoPreview,
  head: () => ({
    meta: [
      { title: "Navaroad — Logo Variations" },
      { name: "description", content: "Five refined variations of the Navaroad Road Monogram N." },
    ],
  }),
});

function BrandLogoPreview() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Navaroad Logo — 5 Refined Variations</h1>
          <p className="text-muted-foreground">
            Concept #2 (Road Monogram N), refined for enterprise tech. Each variation shown in
            monochrome, black, white, and orange accent.
          </p>
        </header>

        <div className="grid gap-6">
          {LOGO_VARIATIONS.map(({ id, name, component: Mark, note }) => (
            <div key={id} className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-semibold">
                    {id.toUpperCase()} — {name}
                  </h2>
                  <p className="text-sm text-muted-foreground">{note}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Accent orange on dark */}
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-black p-8 min-h-[180px]">
                  <div className="text-white">
                    <Mark size={96} />
                  </div>
                  <span className="text-xs text-white/60">Primary (orange accent)</span>
                </div>
                {/* Pure white on dark */}
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-black p-8 min-h-[180px]">
                  <Mark size={96} monoColor="#ffffff" />
                  <span className="text-xs text-white/60">White mono</span>
                </div>
                {/* Pure black on white */}
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-white p-8 min-h-[180px]">
                  <Mark size={96} monoColor="#000000" />
                  <span className="text-xs text-black/60">Black mono</span>
                </div>
                {/* Orange mono */}
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-white p-8 min-h-[180px]">
                  <Mark size={96} monoColor="hsl(24 95% 55%)" />
                  <span className="text-xs text-black/60">Orange mono</span>
                </div>
              </div>

              {/* Scale test */}
              <div className="flex items-end gap-6 rounded-lg bg-black p-6 text-white">
                <div className="flex flex-col items-center gap-1">
                  <Mark size={16} />
                  <span className="text-[10px] text-white/50">16</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Mark size={24} />
                  <span className="text-[10px] text-white/50">24</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Mark size={32} />
                  <span className="text-[10px] text-white/50">32</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Mark size={48} />
                  <span className="text-[10px] text-white/50">48</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Mark size={64} />
                  <span className="text-[10px] text-white/50">64</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
