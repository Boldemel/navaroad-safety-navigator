import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Bookmark, Trash2, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  listSavedRoutes,
  deleteSavedRoute,
  setPendingRoute,
  type SavedRoute,
} from "@/lib/saved-routes";

function scoreClass(score: number | null) {
  if (score == null) return "text-muted-foreground border-border";
  if (score >= 80) return "text-success border-success/40";
  if (score >= 60) return "text-warning border-warning/40";
  return "text-destructive border-destructive/40";
}

export function SavedRoutesCard() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["saved-routes"],
    queryFn: listSavedRoutes,
  });

  async function remove(id: string) {
    try {
      await deleteSavedRoute(id);
      qc.invalidateQueries({ queryKey: ["saved-routes"] });
      toast.success("Saved route removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove route.");
    }
  }

  function load(r: SavedRoute) {
    setPendingRoute({
      origin: r.origin,
      destination: r.destination,
      truck: r.truck_type,
      trailer: r.trailer_type,
    });
    router.navigate({ to: "/dashboard" });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bookmark className="size-4 text-primary" />
        <h2 className="font-semibold">Saved Routes</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Save a route from the Dashboard after analyzing it. Load it here to re-run with current conditions.
      </p>

      <div className="pt-1">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading saved routes…</div>
        ) : routes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No saved routes yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {routes.map((r) => (
              <li key={r.id} className="py-2.5 flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="text-sm font-medium truncate">
                    {r.origin} <span className="text-muted-foreground">→</span> {r.destination}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[r.truck_type, r.trailer_type].filter(Boolean).join(" · ") || "no truck profile"} ·
                    {" "}saved {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                {r.safety_score != null && (
                  <span
                    className={`text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${scoreClass(r.safety_score)}`}
                    title="Safety score at save time"
                  >
                    <ShieldCheck className="size-3" />
                    {r.safety_score}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => load(r)}
                  className="text-primary hover:underline text-[11px] inline-flex items-center gap-1 px-1"
                  aria-label="Load route on dashboard"
                >
                  Load <ArrowRight className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
