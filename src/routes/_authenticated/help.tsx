/**
 * Help Center — searchable, filterable how-to articles for every FleetOS
 * module the user is entitled to see.
 *
 * Filters:
 *   - Module category chips (Operations / Safety / Financial / …)
 *   - Topic dropdown (curated tags: hos-compliance, ifta-taxes, …)
 *   - Free-text search with relevance scoring (see searchHelp)
 *
 * When a search query is active, results are sorted by score and matched
 * steps are highlighted inside the article.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, HelpCircle, Search, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  HELP_TOPICS,
  searchHelp,
  type HelpSearchResult,
  type HelpTopic,
} from "@/lib/fleetos/help-content";
import {
  FLEETOS_MODULES,
  MODULE_CATEGORIES,
  type ModuleCategory,
} from "@/lib/fleetos/module-registry";
import { useAllowedModules } from "@/hooks/use-allowed-modules";
import { cn } from "@/lib/utils";

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

const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  operations: "Operations",
  safety_compliance: "Safety",
  financial: "Financial",
  fleet_maintenance: "Fleet",
  driver_tools: "Drivers",
  intelligence: "Intelligence",
  admin: "Admin",
};

function topicLabel(t: HelpTopic): string {
  return t.replace(/-/g, " ");
}

function HelpPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ModuleCategory | "all">("all");
  const [topic, setTopic] = useState<HelpTopic | "all">("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { allowed } = useAllowedModules();

  const allowedIds = useMemo(() => {
    if (!allowed) return null;
    return new Set(
      FLEETOS_MODULES.filter(
        (m) => m.alwaysAvailable || m.routes.some((r) => allowed.has(r)),
      ).map((m) => m.id),
    );
  }, [allowed]);

  const results: HelpSearchResult[] = useMemo(() => {
    const all = searchHelp({ query: q, category, topic });
    if (!allowedIds) return all;
    return all.filter((r) => allowedIds.has(r.article.moduleId));
  }, [q, category, topic, allowedIds]);

  const active: HelpSearchResult | undefined =
    results.find((r) => r.article.moduleId === activeId) ?? results[0];

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

        {/* Filters */}
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search help — try 'assign a load', 'IFTA', 'HOS'…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={topic} onValueChange={(v) => setTopic(v as HelpTopic | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics</SelectItem>
                {HELP_TOPICS.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {topicLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <CategoryChip
              label="All modules"
              active={category === "all"}
              onClick={() => setCategory("all")}
            />
            {MODULE_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                label={CATEGORY_LABELS[c]}
                active={category === c}
                onClick={() => setCategory(c)}
              />
            ))}
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>
              {results.length} {results.length === 1 ? "article" : "articles"}
              {q ? " · sorted by relevance" : ""}
            </span>
            {(q || category !== "all" || topic !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setCategory("all");
                  setTopic("all");
                }}
                className="underline hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-4">
          <nav className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b flex items-center gap-2">
              <BookOpen className="size-3.5" /> Results
            </div>
            {results.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No matching articles. Try clearing filters.
              </div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {results.map((r) => {
                  const isActive = (active?.article.moduleId ?? "") === r.article.moduleId;
                  return (
                    <li key={r.article.moduleId}>
                      <button
                        type="button"
                        onClick={() => setActiveId(r.article.moduleId)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/60 last:border-0",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-accent text-foreground",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate">{r.article.title}</div>
                          {q && r.matchedStepIndexes.length > 0 ? (
                            <div className="text-[10px] text-muted-foreground">
                              {r.matchedStepIndexes.length}{" "}
                              {r.matchedStepIndexes.length === 1 ? "step matches" : "steps match"}
                            </div>
                          ) : null}
                        </div>
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
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {active.article.category ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {CATEGORY_LABELS[active.article.category]}
                    </Badge>
                  ) : null}
                  {(active.article.tags ?? []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTopic(t)}
                      className="text-[10px] rounded-full border border-border px-2 py-0.5 hover:bg-accent capitalize text-muted-foreground"
                    >
                      {topicLabel(t)}
                    </button>
                  ))}
                </div>
                <h2 className="text-xl font-semibold">{active.article.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{active.article.summary}</p>

                <div className="mt-5 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    How to use
                  </div>
                  <ol className="space-y-3">
                    {active.article.steps.map((s, i) => {
                      const matched = q && active.matchedStepIndexes.includes(i);
                      return (
                        <li
                          key={s.title}
                          className={cn(
                            "rounded-md border p-3 transition-colors",
                            matched
                              ? "border-primary/40 bg-primary/5"
                              : "border-border",
                          )}
                        >
                          <div className="text-sm font-medium flex items-center gap-2">
                            <span className="size-5 rounded-full bg-primary/15 text-primary text-[11px] flex items-center justify-center">
                              {i + 1}
                            </span>
                            {s.title}
                            {matched ? (
                              <Badge variant="outline" className="text-[9px] ml-auto">
                                match
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 pl-7">
                            {s.body}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {active.article.related && active.article.related.length > 0 ? (
                  <div className="mt-5">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Related
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {active.article.related.map((rid) => (
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
                    <Link to="/assistant">
                      <Sparkles className="size-4" /> Ask Copilot about {active.article.title}
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

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-xs rounded-full px-3 py-1 border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
