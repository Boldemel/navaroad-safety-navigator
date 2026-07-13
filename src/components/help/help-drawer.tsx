/**
 * Contextual Help drawer.
 *
 * Opened from the "?" button in the AppShell. Shows the help article for
 * the current route (via the module registry) and offers two shortcuts:
 *  - "Ask Copilot about this page" — deep-links to /assistant with a
 *    pre-filled question about the current module.
 *  - "Browse all help" — opens the full /help center.
 *
 * Reusable component: no direct route dependencies, safe to reuse on any
 * screen wrapped by AppShell.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, HelpCircle, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getModuleForRoute } from "@/lib/fleetos/module-registry";
import { getHelpArticle } from "@/lib/fleetos/help-content";

export function HelpDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mod = getModuleForRoute(pathname);
  const article = mod ? getHelpArticle(mod.id) : undefined;

  const askUrl = article
    ? `/assistant?q=${encodeURIComponent(`How do I use ${article.title}? Give me a 30-second tour.`)}`
    : "/assistant";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-left">
            <HelpCircle className="size-5 text-primary" />
            {article ? `Help — ${article.title}` : "Help"}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            {article ? (
              <>
                <p className="text-sm text-muted-foreground">{article.summary}</p>
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    How to use
                  </div>
                  <ol className="space-y-3">
                    {article.steps.map((s, i) => (
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
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                No help article for this screen yet. Browse the help center for guides
                across every module.
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3 flex flex-col gap-2">
          <Button asChild onClick={() => onOpenChange(false)}>
            <Link to={askUrl}>
              <Sparkles className="size-4" /> Ask Copilot about this page
            </Link>
          </Button>
          <Button variant="outline" asChild onClick={() => onOpenChange(false)}>
            <Link to="/help">
              <BookOpen className="size-4" /> Browse all help
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
