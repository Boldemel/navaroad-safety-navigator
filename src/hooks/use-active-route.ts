import { useEffect, useState, useCallback } from "react";
import type { RouteAnalysis } from "@/lib/route-analysis.functions";

const KEY = "navaroad.activeRoute";
const EVT = "navaroad:active-route";

export type ActiveRoute = {
  origin: string;
  destination: string;
  geometry: Array<[number, number]>;
  result?: RouteAnalysis;
  input?: {
    origin: string;
    destination: string;
    truck?: string;
    trailer?: string;
    originCoords?: { lat: number; lon: number };
    destinationCoords?: { lat: number; lon: number };
  };
  savedAt: string;
};

function read(): ActiveRoute | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveRoute;
    if (!Array.isArray(parsed.geometry) || parsed.geometry.length < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveRoute(route: Omit<ActiveRoute, "savedAt">) {
  if (typeof window === "undefined") return;
  const payload: ActiveRoute = { ...route, savedAt: new Date().toISOString() };
  window.localStorage.setItem(KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function clearActiveRoute() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useActiveRoute(): ActiveRoute | null {
  const [route, setRoute] = useState<ActiveRoute | null>(null);
  const sync = useCallback(() => setRoute(read()), []);
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
  return route;
}
