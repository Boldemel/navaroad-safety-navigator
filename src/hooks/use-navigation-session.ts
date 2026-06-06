import { useCallback, useEffect, useState } from "react";
import type { NavInstruction } from "@/lib/navigation.functions";

const KEY = "navaroad.navSession";
const EVT = "navaroad:nav-session";

export type NavSession = {
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string };
  geometry: Array<[number, number]>; // [lon,lat]
  instructions: NavInstruction[];
  totalKm: number;
  baseDurationMin: number;
  trafficDurationMin: number;
  truck: boolean;
  startedAt: string;
  updatedAt: string;
};

function read(): NavSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavSession;
    if (!Array.isArray(parsed.geometry) || parsed.geometry.length < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(session: NavSession | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function startNavigation(
  s: Omit<NavSession, "startedAt" | "updatedAt">,
): NavSession {
  const now = new Date().toISOString();
  const full: NavSession = { ...s, startedAt: now, updatedAt: now };
  write(full);
  return full;
}

export function updateNavigationRoute(
  patch: Partial<Pick<NavSession, "geometry" | "instructions" | "totalKm" | "baseDurationMin" | "trafficDurationMin">>,
) {
  const cur = read();
  if (!cur) return;
  write({ ...cur, ...patch, updatedAt: new Date().toISOString() });
}

export function stopNavigation() {
  write(null);
}

export function useNavigationSession(): NavSession | null {
  const [s, setS] = useState<NavSession | null>(null);
  const sync = useCallback(() => setS(read()), []);
  useEffect(() => {
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT, sync);
    };
  }, [sync]);
  return s;
}
