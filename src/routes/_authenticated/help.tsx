/**
 * Help Center — searchable how-to articles for every FleetOS module the
 * user is entitled to see. Entries come from `help-content.ts`; visibility
 * is filtered by the same module allowlist that powers navigation.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, HelpCircle, Search, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchHelp, type HelpArticle } from "@/lib/fleetos/help-content";
import { FLEETOS_MODULES } from "@/lib/fleetos/module-registry";
import { useAllowedModules } from "@/hooks/use-allowed-modules";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Help — Navaroad FleetOS" },
      {
        name: "description",
        content:
          "How to use every Navaroad FleetOS module: dispatch, loads, HOS, IFTA, fuel, maintenance, and more.",
      },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { allowed } = useAllowedModules();

  const visibleArticles = useMemo(() => {
    const all = searchHelp(q);
    if (!allowed) return all;
    // Only surface articles for modules the user's plan/role permits.
    const allowedIds = new Set(
      FLEETOS_MODULES.filter((m) =>
        m.alwaysAvailable || m.routes.some((r) => allowed.has(r)),
      ).map((m) => m.id),
    );
    return all.filter((a) => allowedIds.has(a.moduleId));
  }, [q, allowed]);

  const active: HelpArticle | undefined =
    visibleArticles.find((a) => a.moduleId === activeId) ?? visibleArticles[0];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
            <HelpCircle className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Help Center</h1>
            <p className="text-sm text-muted-foreground">
              Short how-to guides for every FleetOS module you have access to.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/assistant">
              <Sparkles className="size-4" /> Ask the Copilot
            </Link>
          </Button>
        </div>

        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search help — try 'assign a load', 'IFTA', 'HOS'…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-4">
          <nav className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b flex items-center gap-2">
              <BookOpen className="size-3.5" /> Modules
            </div>
            {visibleArticles.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No matches.</div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {visibleArticles.map((a) => {
                  const isActive = (active?.moduleId ?? "") === a.moduleId;
                  return (
                    <li key={a.moduleId}>
                      <button
                        type="button"
                        onClick={() => setActiveId(a.moduleId)}
                        className={
                          "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/60 last:border-0 " +
                          (isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-accent text-foreground")
                        }
                      >
                        <span className="truncate">{a.title}</span>
                        <ChevronRight className="size-4 opacity-60 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <article className="rounded-xl border border-border bg-card p-5">
            {active ? (
              <>
                <h2 className="text-xl font-semibold">{active.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{active.summary}</p>

                <div className="mt-5 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    How to use
                  </div>
                  <ol className="space-y-3">
                    {active.steps.map((s, i) => (
                      <li key={s.title} className="rounded-md border border-border p-3">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <span className="size-5 rounded-full bg-primary/15 text-primary text-[11px] flex items-center justify-center">
                            {i + 1}
                          </span>
                          {s.title}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 pl-7">
                          {s.body}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {active.related && active.related.length > 0 ? (
                  <div className="mt-5">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Related
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {active.related.map((rid) => (
                        <button
                          key={rid}
                          type="button"
                          onClick={() => setActiveId(rid)}
                          className="text-xs rounded-full border border-border px-2.5 py-1 hover:bg-accent"
                        >
                          {rid.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 pt-4 border-t flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link
                      to={`/assistant?q=${encodeURIComponent(`How do I use ${active.title}? Give me a 30-second tour.`)}`}
                    >
                      <Sparkles className="size-4" /> Ask Copilot about {active.title}
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No article selected.</div>
            )}
          </article>
        </div>
      </div>
    </AppShell>
  );
}
