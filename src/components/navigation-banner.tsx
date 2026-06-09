import { useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Navigation2, X, Clock, MapPin, Volume2, VolumeX,
  ArrowUp, ArrowUpRight, ArrowUpLeft, ArrowRight, ArrowLeft, CornerUpRight, CornerUpLeft, RotateCw,
} from "lucide-react";
import { useNavigationSession, updateNavigationRoute, stopNavigation } from "@/hooks/use-navigation-session";
import { useGeolocation, distanceMiles } from "@/hooks/use-geolocation";
import { getTruckRoute, type NavInstruction } from "@/lib/navigation.functions";
import { saveActiveRoute, clearActiveRoute } from "@/hooks/use-active-route";
import { useVoiceGuidance } from "@/hooks/use-voice-guidance";
import { useVoiceSettings } from "@/lib/voice/voice-settings";
import { cancelSpeech } from "@/lib/voice/voice-engine";

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

function instructionIcon(ins: NavInstruction | null) {
  const msg = (ins?.message ?? "").toLowerCase();
  if (msg.includes("u-turn") || msg.includes("uturn")) return RotateCw;
  if (msg.includes("sharp right")) return CornerUpRight;
  if (msg.includes("sharp left")) return CornerUpLeft;
  if (msg.includes("slight right") || msg.includes("bear right")) return ArrowUpRight;
  if (msg.includes("slight left") || msg.includes("bear left")) return ArrowUpLeft;
  if (msg.includes("right")) return ArrowRight;
  if (msg.includes("left")) return ArrowLeft;
  return ArrowUp;
}

function fmtDist(mi: number | null | undefined): string {
  if (mi == null) return "";
  if (mi < 0.1) return "now";
  if (mi < 0.2) return `${Math.round(mi * 5280)} ft`;
  if (mi < 1) return `${(Math.round(mi * 10) / 10).toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export function NavigationBanner() {
  const session = useNavigationSession();
  const geo = useGeolocation({ watch: true });
  const refetchFn = useServerFn(getTruckRoute);
  const [voice, setVoice] = useVoiceSettings();
  useVoiceGuidance();

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
  const Icon = instructionIcon(stats?.nextInstr ?? null);

  const speedMph = geo.coords?.speed != null && geo.coords.speed >= 0
    ? Math.round(geo.coords.speed * 2.23694)
    : null;

  // Minutes until arrival (for footer)
  const minsLeft = eta ? Math.max(0, Math.round((eta.getTime() - Date.now()) / 60000)) : null;
  const arriveIn = minsLeft != null
    ? minsLeft < 60 ? `${minsLeft} min` : `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`
    : "—";

  return (
    <div className="sticky top-0 z-40 shadow-lg">
      {/* GARMIN-STYLE GREEN TURN BANNER */}
      <div className="bg-success text-success-foreground">
        <div className="max-w-7xl mx-auto px-3 md:px-5 py-3 flex items-center gap-3">
          {/* Big turn arrow + distance */}
          <div className="flex flex-col items-center justify-center shrink-0 min-w-[72px]">
            <Icon className="size-9 md:size-10" strokeWidth={2.5} />
            <div className="text-base md:text-lg font-bold tabular-nums leading-none mt-1">
              {fmtDist(nextDist)}
            </div>
          </div>

          {/* Instruction text */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest opacity-80 leading-tight">
              Next maneuver
            </div>
            <div className="text-base md:text-lg font-bold leading-tight truncate">
              {nextMsg}
            </div>
            <div className="text-xs opacity-80 truncate mt-0.5 flex items-center gap-1">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{session.destination.label}</span>
            </div>
          </div>

          {/* Mute toggle */}
          <button
            type="button"
            onClick={() => {
              const nextMuted = !voice.muted;
              setVoice({ muted: nextMuted });
              if (nextMuted) cancelSpeech();
            }}
            className="size-9 rounded-full bg-success-foreground/15 hover:bg-success-foreground/25 flex items-center justify-center transition-colors shrink-0"
            aria-label={voice.muted ? "Unmute voice guidance" : "Mute voice guidance"}
            aria-pressed={!voice.muted}
            title={voice.muted ? "Voice muted" : "Voice on"}
          >
            {voice.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              stopNavigation();
              clearActiveRoute();
              cancelSpeech();
            }}
            className="size-9 rounded-full bg-success-foreground/15 hover:bg-success-foreground/25 flex items-center justify-center transition-colors shrink-0"
            aria-label="End navigation"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* DARK STATS FOOTER — speed · ETA · remaining */}
      <div className="bg-zinc-900 text-zinc-100 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto px-3 md:px-5 py-2 grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-400">Speed</div>
            <div className="text-base font-bold tabular-nums leading-tight">
              {speedMph != null ? speedMph : "—"}
              <span className="text-[10px] font-medium text-zinc-400 ml-0.5">mph</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-400">Distance</div>
            <div className="text-base font-bold tabular-nums leading-tight">
              {remaining < 1 ? "<1" : Math.round(remaining)}
              <span className="text-[10px] font-medium text-zinc-400 ml-0.5">mi</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-400">Arrive in</div>
            <div className="text-base font-bold tabular-nums leading-tight">{arriveIn}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-400 flex items-center justify-center gap-0.5">
              <Clock className="size-2.5" /> ETA
            </div>
            <div className="text-base font-bold tabular-nums leading-tight">{etaLabel}</div>
          </div>
        </div>
        {session.truck && (
          <div className="text-center pb-1">
            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-success">
              <Navigation2 className="size-2.5" /> Truck routing active
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
