import { useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Navigation2, X, Clock, MapPin, ArrowUpRight } from "lucide-react";
import { useNavigationSession, updateNavigationRoute, stopNavigation } from "@/hooks/use-navigation-session";
import { useGeolocation, distanceMiles } from "@/hooks/use-geolocation";
import { getTruckRoute } from "@/lib/navigation.functions";
import { saveActiveRoute } from "@/hooks/use-active-route";

function nearestIndex(here: { lat: number; lon: number }, geometry: Array<[number, number]>): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const [lon, lat] = geometry[i];
    const d = distanceMiles(here, { lat, lon });
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function remainingMilesFromIndex(idx: number, geometry: Array<[number, number]>): number {
  let mi = 0;
  for (let i = idx; i < geometry.length - 1; i++) {
    const [lonA, latA] = geometry[i];
    const [lonB, latB] = geometry[i + 1];
    mi += distanceMiles({ lat: latA, lon: lonA }, { lat: latB, lon: lonB });
  }
  return mi;
}

export function NavigationBanner() {
  const session = useNavigationSession();
  const geo = useGeolocation({ watch: true });
  const refetchFn = useServerFn(getTruckRoute);

  const here = geo.coords ? { lat: geo.coords.lat, lon: geo.coords.lon } : null;

  const stats = useMemo(() => {
    if (!session) return null;
    if (!here) {
      return {
        remainingMi: session.totalKm * 0.621371,
        etaMs: Date.now() + session.trafficDurationMin * 60_000,
        nextInstr: session.instructions[0] ?? null,
        nextDistMi: null as number | null,
      };
    }
    const idx = nearestIndex(here, session.geometry);
    const remainingMi = remainingMilesFromIndex(idx, session.geometry);
    const totalMi = session.totalKm * 0.621371;
    const fracRemaining = totalMi > 0 ? Math.max(0, Math.min(1, remainingMi / totalMi)) : 1;
    const etaMin = session.trafficDurationMin * fracRemaining;
    // Find the next instruction whose point lies ahead of our nearest index.
    const nextInstr =
      session.instructions.find((ins) => {
        const insIdx = nearestIndex(ins.point, session.geometry);
        return insIdx >= idx;
      }) ?? session.instructions[session.instructions.length - 1] ?? null;
    const nextDistMi = nextInstr ? distanceMiles(here, nextInstr.point) : null;
    return {
      remainingMi,
      etaMs: Date.now() + etaMin * 60_000,
      nextInstr,
      nextDistMi,
    };
  }, [session, here]);

  // Live re-route every 90s while moving — picks up traffic-adjusted ETA and
  // any TomTom incident reroutes.
  const refetch = useMutation({
    mutationFn: async (args: { lat: number; lon: number }) => {
      if (!session) return null;
      return refetchFn({
        data: {
          originLat: args.lat,
          originLon: args.lon,
          destLat: session.destination.lat,
          destLon: session.destination.lon,
          truck: session.truck,
        },
      });
    },
    onSuccess: (route) => {
      if (!route || !session) return;
      updateNavigationRoute({
        geometry: route.geometry,
        instructions: route.instructions,
        totalKm: route.distanceKm,
        baseDurationMin: route.durationMin,
        trafficDurationMin: route.durationTrafficMin,
      });
      saveActiveRoute({
        origin: session.origin.label,
        destination: session.destination.label,
        geometry: route.geometry,
      });
    },
  });

  useEffect(() => {
    if (!session || !here) return;
    const id = window.setInterval(() => {
      refetch.mutate({ lat: here.lat, lon: here.lon });
    }, 90_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.startedAt, here?.lat, here?.lon]);

  if (!session) return null;

  const eta = stats ? new Date(stats.etaMs) : null;
  const etaLabel = eta
    ? eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—";
  const remaining = stats?.remainingMi ?? 0;
  const nextMsg = stats?.nextInstr?.message ?? "Continue on route";
  const nextDist = stats?.nextDistMi;

  return (
    <div className="sticky top-0 z-40 border-b border-primary/30 bg-primary/10 backdrop-blur supports-[backdrop-filter]:bg-primary/15">
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-2 flex items-center gap-3 flex-wrap">
        <div className="size-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Navigation2 className="size-4" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[10px] uppercase tracking-wider text-primary/80 flex items-center gap-1">
            <ArrowUpRight className="size-3" />
            Next {nextDist != null ? `· ${nextDist < 0.1 ? "now" : nextDist < 1 ? `${Math.round(nextDist * 10) / 10} mi` : `${Math.round(nextDist)} mi`}` : ""}
          </div>
          <div className="text-sm font-semibold leading-tight truncate">{nextMsg}</div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-xs text-foreground/80 border-l border-primary/20 pl-3">
          <MapPin className="size-3.5 text-primary" />
          <span className="font-medium">{remaining < 1 ? "<1" : Math.round(remaining)} mi</span>
          <span className="text-muted-foreground">to destination</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-foreground/80 border-l border-primary/20 pl-3">
          <Clock className="size-3.5 text-primary" />
          <span className="font-medium">{etaLabel}</span>
          <span className="text-muted-foreground hidden sm:inline">ETA</span>
        </div>
        {session.truck && (
          <span className="hidden md:inline text-[10px] uppercase tracking-wider rounded border border-primary/30 bg-primary/10 text-primary px-2 py-0.5">
            Truck mode
          </span>
        )}
        <button
          type="button"
          onClick={() => stopNavigation()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card hover:bg-accent px-2 py-1 text-xs"
          aria-label="End navigation"
        >
          <X className="size-3.5" /> End
        </button>
      </div>
    </div>
  );
}
