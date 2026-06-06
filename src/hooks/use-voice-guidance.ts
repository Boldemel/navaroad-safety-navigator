/**
 * Voice guidance — watches the active navigation session + live GPS and
 * announces turns at 2 mi / 1 mi / 0.5 mi / imminent, plus arrival.
 *
 * Mounted inside <NavigationBanner /> which lives in the app shell, so voice
 * guidance keeps running while the user views the Hazard Map or any other
 * page during navigation.
 */
import { useEffect, useRef } from "react";
import { useNavigationSession } from "@/hooks/use-navigation-session";
import { useGeolocation, distanceMiles } from "@/hooks/use-geolocation";
import { speak, cancelSpeech } from "@/lib/voice/voice-engine";
import { useVoiceSettings } from "@/lib/voice/voice-settings";

type Bucket = "2mi" | "1mi" | "0.5mi" | "now";
const BUCKETS: Array<{ name: Bucket; miles: number; phrase: (msg: string) => string }> = [
  { name: "2mi", miles: 2.0, phrase: (m) => `In 2 miles, ${m}.` },
  { name: "1mi", miles: 1.0, phrase: (m) => `In 1 mile, ${m}.` },
  { name: "0.5mi", miles: 0.5, phrase: (m) => `In a half mile, ${m}.` },
  { name: "now", miles: 0.15, phrase: (m) => `${m} now.` },
];

function instructionPhrase(msg: string): string {
  // TomTom messages already read well ("Turn left onto Northwoods Boulevard").
  // Normalize leading caps so they fit grammatically inside our wrappers.
  return msg.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, "");
}

export function useVoiceGuidance() {
  const session = useNavigationSession();
  const geo = useGeolocation({ watch: true });
  const [settings] = useVoiceSettings();

  // Track which (instruction index, bucket) we've already announced this trip.
  const spokenRef = useRef<Set<string>>(new Set());
  const arrivedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Reset announcement state when a new navigation session starts.
  useEffect(() => {
    if (!session) {
      spokenRef.current.clear();
      arrivedRef.current = false;
      sessionIdRef.current = null;
      cancelSpeech();
    } else if (sessionIdRef.current !== session.startedAt) {
      spokenRef.current.clear();
      arrivedRef.current = false;
      sessionIdRef.current = session.startedAt;
      // Opening line removed per user request — turn-by-turn guidance below still speaks.
    }
  }, [session]);

  // Per-tick announcement loop.
  useEffect(() => {
    if (!session || !geo.coords || settings.muted) return;
    const here = { lat: geo.coords.lat, lon: geo.coords.lon };

    // Destination arrival — within ~120 m of destination point.
    const destDist = distanceMiles(here, { lat: session.destination.lat, lon: session.destination.lon });
    if (destDist < 0.08 && !arrivedRef.current) {
      arrivedRef.current = true;
      speak("You have arrived at your destination.", {
        priority: "critical",
        dedupeKey: `arrive:${session.startedAt}`,
      });
      return;
    }

    // Walk upcoming instructions and check each distance bucket.
    for (let i = 0; i < session.instructions.length; i++) {
      const ins = session.instructions[i];
      if (!ins?.point) continue;
      if (/ARRIVE/i.test(ins.maneuver)) continue; // handled by destination arrival above
      const d = distanceMiles(here, ins.point);
      for (const b of BUCKETS) {
        if (d <= b.miles && d > b.miles - 0.25) {
          const key = `${session.startedAt}:${i}:${b.name}`;
          if (spokenRef.current.has(key)) continue;
          spokenRef.current.add(key);
          speak(b.phrase(instructionPhrase(ins.message)), {
            priority: b.name === "now" ? "high" : "normal",
            dedupeKey: key,
          });
        }
      }
    }
  }, [session, geo.coords?.lat, geo.coords?.lon, settings.muted]);

  // Best-effort screen wake-lock so voice guidance keeps reading while driving.
  // True background audio when the phone is locked requires the native app
  // (Capacitor) where the audio session can stay active.
  useEffect(() => {
    if (!session) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    type WakeLockSentinel = { release: () => Promise<void> };
    type NavWithWakeLock = Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } };
    const nav = navigator as NavWithWakeLock;
    (async () => {
      try {
        if (nav.wakeLock?.request) {
          lock = await nav.wakeLock.request("screen");
        }
      } catch {
        /* ignore — user can re-engage when the tab regains focus */
      }
      if (cancelled && lock) void lock.release();
    })();
    return () => {
      cancelled = true;
      if (lock) void lock.release();
    };
  }, [session?.startedAt]);
}

/**
 * Announce a hazard / weather alert — called from pages that detect the
 * hazard (Hazard Map, alerts page). Deduped by id so the same alert is not
 * re-spoken every render.
 */
export function announceHazard(alert: { id: string; title: string; severity?: string }) {
  const sev = (alert.severity ?? "").toLowerCase();
  const priority: "normal" | "high" | "critical" =
    sev === "critical" || sev === "extreme" ? "critical" : sev === "high" ? "high" : "normal";
  speak(alert.title, { priority, dedupeKey: `hazard:${alert.id}` });
}
