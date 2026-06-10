import { useMemo, useState } from "react";
import { LocateFixed, Navigation, Play, Square, Truck, TreePine, AlertTriangle, Gauge, Clock, Route as RouteIcon, Wind, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeProgress, aheadOnRoute, mph, formatEta, formatMin, type LatLon } from "@/lib/route-progress";
import type { ActiveRoute } from "@/hooks/use-active-route";
import type { GeoCoords } from "@/hooks/use-geolocation";

type HazardItem = LatLon & { id: string; title: string; severity: string; category: string };
type PoiItem = LatLon & { id: string; name: string };

type Props = {
  active: boolean;
  onToggle: () => void;
  onRecenter: () => void;
  follow: boolean;
  setFollow: (v: boolean) => void;
  route: ActiveRoute | null;
  here: LatLon | null;
  geo: GeoCoords | null;
  hazards: HazardItem[];
  truckStops: PoiItem[];
  restAreas: PoiItem[];
  weighStations?: PoiItem[];
};

function Tile({ label, value, hint, icon, tone = "default" }: { label: string; value: string; hint?: string; icon: React.ReactNode; tone?: "default" | "warn" | "danger" | "ok" }) {
  const toneCls =
    tone === "danger" ? "border-destructive/40 bg-destructive/10 text-destructive"
    : tone === "warn" ? "border-warning/40 bg-warning/10 text-warning"
    : tone === "ok" ? "border-success/40 bg-success/10 text-success"
    : "border-border bg-card text-foreground";
  return (
    <div className={cn("rounded-xl border p-3 min-w-0", toneCls)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
        {icon}{label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums truncate">{value}</div>
      {hint && <div className="text-[11px] opacity-75 truncate">{hint}</div>}
    </div>
  );
}

export function DriveModePanel(p: Props) {
  const { active, onToggle, onRecenter, follow, setFollow, route, here, geo, hazards, truckStops, restAreas, weighStations } = p;
  const speedMph = mph(geo?.speedMps ?? null);
  const progress = useMemo(
    () => (route ? computeProgress(route.geometry, here, speedMph) : null),
    [route, here, speedMph],
  );
  const upcomingHazards = useMemo(
    () => (route ? aheadOnRoute(route.geometry, here, hazards, 10) : []),
    [route, here, hazards],
  );
  const nextTruckStop = useMemo(
    () => (route ? aheadOnRoute(route.geometry, here, truckStops, 5)[0] : undefined),
    [route, here, truckStops],
  );
  const nextRestArea = useMemo(
    () => (route ? aheadOnRoute(route.geometry, here, restAreas, 5)[0] : undefined),
    [route, here, restAreas],
  );
  const nextWeigh = useMemo(
    () => (route ? aheadOnRoute(route.geometry, here, weighStations, 5)[0] : undefined),
    [route, here, weighStations],
  );

  // Hazard categorization for the dashboard tiles.
  const windAhead = upcomingHazards.find((h) => /wind/i.test(h.category) || /wind/i.test(h.title));
  const closureAhead = upcomingHazards.find((h) => /closure/i.test(h.category));
  const weatherAhead = upcomingHazards.find((h) => /weather|storm|snow|rain|flood|tornado|thunder/i.test(h.category) || /weather|storm|snow|rain|flood|tornado|thunder/i.test(h.title));

  const [navMenu, setNavMenu] = useState(false);
  const launchExternalNav = (provider: "google" | "apple") => {
    if (!route) return;
    const o = route.geometry[0];
    const d = route.geometry[route.geometry.length - 1];
    if (!o || !d) return;
    const origin = `${o[1]},${o[0]}`;
    const dest = `${d[1]},${d[0]}`;
    const url =
      provider === "google"
        ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
        : `https://maps.apple.com/?saddr=${origin}&daddr=${dest}&dirflg=d`;
    window.open(url, "_blank", "noopener,noreferrer");
    setNavMenu(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 md:p-4 space-y-3">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold min-h-[48px] transition",
            active
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {active ? <><Square className="size-4" /> Stop drive mode</> : <><Play className="size-4" /> Start drive mode</>}
        </button>
        <button
          type="button"
          onClick={onRecenter}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium min-h-[48px] hover:bg-muted"
        >
          <LocateFixed className="size-4" /> Center on truck
        </button>
        <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 text-sm min-h-[48px]">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="size-4" />
          Auto-follow
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setNavMenu((v) => !v)}
            disabled={!route}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium min-h-[48px] hover:bg-muted disabled:opacity-50"
          >
            <Navigation className="size-4" /> Start navigation
          </button>
          {navMenu && route && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-popover shadow-lg z-[1100] overflow-hidden">
              <button onClick={() => launchExternalNav("google")} className="w-full text-left px-3 py-3 text-sm hover:bg-muted">Google Maps</button>
              <button onClick={() => launchExternalNav("apple")} className="w-full text-left px-3 py-3 text-sm hover:bg-muted">Apple Maps</button>
            </div>
          )}
        </div>
      </div>

      {!route && (
        <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          Analyze a route on the Dashboard to start live driving mode.
        </div>
      )}

      {/* Dashboard tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile
          icon={<Gauge className="size-3" />}
          label="Speed"
          value={speedMph != null ? `${Math.round(speedMph)} mph` : "—"}
          hint={geo?.headingDeg != null ? `${Math.round(geo.headingDeg)}°` : undefined}
        />
        <Tile
          icon={<RouteIcon className="size-3" />}
          label="Remaining"
          value={progress ? `${progress.remainingMi.toFixed(1)} mi` : "—"}
          hint={progress ? `${progress.percent.toFixed(0)}% done` : undefined}
        />
        <Tile
          icon={<Clock className="size-3" />}
          label="ETA"
          value={progress ? formatEta(progress.etaAt) : "—"}
          hint={progress?.etaMin != null ? formatMin(progress.etaMin) : "needs speed"}
        />
        <Tile
          icon={<Truck className="size-3" />}
          label="Traveled"
          value={progress ? `${progress.traveledMi.toFixed(1)} mi` : "—"}
          hint={progress ? `of ${progress.totalMi.toFixed(0)} mi` : undefined}
        />
        <Tile
          icon={<Wind className="size-3" />}
          label="Wind risk"
          value={windAhead ? `${windAhead.distanceAheadMi < 1 ? "<1" : Math.round(windAhead.distanceAheadMi)} mi` : "Clear"}
          hint={windAhead?.title}
          tone={windAhead ? (windAhead.severity === "critical" || windAhead.severity === "high" ? "danger" : "warn") : "ok"}
        />
        <Tile
          icon={<Cloud className="size-3" />}
          label="Weather"
          value={weatherAhead ? `${weatherAhead.distanceAheadMi < 1 ? "<1" : Math.round(weatherAhead.distanceAheadMi)} mi` : "Clear"}
          hint={weatherAhead?.title}
          tone={weatherAhead ? (weatherAhead.severity === "critical" || weatherAhead.severity === "high" ? "danger" : "warn") : "ok"}
        />
        <Tile
          icon={<AlertTriangle className="size-3" />}
          label="Closure"
          value={closureAhead ? `${closureAhead.distanceAheadMi < 1 ? "<1" : Math.round(closureAhead.distanceAheadMi)} mi` : "None"}
          hint={closureAhead?.title}
          tone={closureAhead ? "danger" : "ok"}
        />
        <Tile
          icon={<Truck className="size-3" />}
          label="Next stop"
          value={
            nextTruckStop
              ? `${nextTruckStop.distanceAheadMi < 1 ? "<1" : Math.round(nextTruckStop.distanceAheadMi)} mi`
              : "—"
          }
          hint={nextTruckStop?.name}
        />
      </div>

      {/* Upcoming stops list */}
      {(nextTruckStop || nextRestArea) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <NextStop icon={<Truck className="size-4 text-orange-500" />} label="Truck stop" item={nextTruckStop} />
          <NextStop icon={<TreePine className="size-4 text-emerald-500" />} label="Rest area" item={nextRestArea} />
        </div>
      )}

      {/* Upcoming hazards list */}
      {upcomingHazards.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" /> Upcoming hazards
          </div>
          <ul className="space-y-1.5">
            {upcomingHazards.slice(0, 5).map((h) => (
              <li key={"up-" + h.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "size-2 rounded-full shrink-0",
                    h.severity === "critical" || h.severity === "high" ? "bg-destructive" : "bg-warning",
                  )}
                />
                <span className="flex-1 min-w-0 truncate">{h.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {h.distanceAheadMi < 1 ? "<1 mi" : `${Math.round(h.distanceAheadMi)} mi`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NextStop({ icon, label, item }: { icon: React.ReactNode; label: string; item?: { name: string; distanceAheadMi: number } }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">{icon}{label}</div>
      {item ? (
        <>
          <div className="text-sm font-medium truncate mt-1">{item.name}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {item.distanceAheadMi < 1 ? "<1 mi" : `${Math.round(item.distanceAheadMi)} mi`} ahead
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground mt-1">None ahead</div>
      )}
    </div>
  );
}
