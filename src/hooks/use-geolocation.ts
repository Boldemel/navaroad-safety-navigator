import { useCallback, useEffect, useRef, useState } from "react";

export type GeoCoords = {
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  at: string;
};
export type GeoState = {
  coords: GeoCoords | null;
  status: "idle" | "prompting" | "granted" | "denied" | "unavailable" | "error";
  error: string | null;
};

const STORAGE_KEY = "navaroad.geo.lastCoords";
const STALE_FIX_MS = 60 * 1000;
const MAX_USABLE_ACCURACY_M = 1_600;

function clearCachedCoords() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
}

function coordsFromPosition(pos: GeolocationPosition): GeoCoords {
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracyM: pos.coords.accuracy ?? null,
    speedMps: pos.coords.speed ?? null,
    headingDeg: pos.coords.heading ?? null,
    at: new Date(pos.timestamp).toISOString(),
  };
}

/**
 * Browser geolocation hook. By default it auto-requests a fresh fix on mount
 * so desktop and mobile both reflect the user's *current* location instead of
 * a stale localStorage cache. Pass `watch: true` for continuous updates.
 */
export function useGeolocation(opts: { watch?: boolean; auto?: boolean } = {}) {
  const { watch = false, auto = true } = opts;
  // Always start with null on both server and client to avoid hydration
  // mismatches; hydrate cached coords in an effect below.
  const [state, setState] = useState<GeoState>({
    coords: null,
    status: "idle",
    error: null,
  });
  const watchId = useRef<number | null>(null);
  const requestedRef = useRef(false);

  const setCoords = useCallback((pos: GeolocationPosition) => {
    const next = coordsFromPosition(pos);
    const age = Date.now() - new Date(next.at).getTime();
    if (!Number.isFinite(age) || age > STALE_FIX_MS) {
      clearCachedCoords();
      setState((s) => ({
        ...s,
        coords: null,
        status: "error",
        error: "Your browser returned an old location. Try again or enter the origin manually.",
      }));
      return;
    }
    if (next.accuracyM != null && next.accuracyM > MAX_USABLE_ACCURACY_M) {
      clearCachedCoords();
      setState((s) => ({
        ...s,
        coords: null,
        status: "error",
        error: "Your browser location is too imprecise for routing. Enter your origin manually or use mobile GPS.",
      }));
      return;
    }
    setState({ coords: next, status: "granted", error: null });
  }, []);

  const setError = useCallback((err: GeolocationPositionError) => {
    setState((s) => ({
      ...s,
      status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
      error:
        err.code === err.PERMISSION_DENIED
          ? "Location access is needed for live route safety alerts."
          : err.message || "Could not get your location.",
    }));
  }, []);

  const request = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setState((s) => ({ ...s, status: "unavailable", error: "Geolocation is not supported in this browser." }));
      return;
    }
    clearCachedCoords();
    setState((s) => ({ ...s, coords: null, status: "prompting", error: null }));
    navigator.geolocation.getCurrentPosition(setCoords, setError, {
      enableHighAccuracy: true,
      // Force a *fresh* fix — desktop browsers will otherwise hand back a
      // hours-old cached position that's hundreds of miles off.
      maximumAge: 0,
      timeout: 15_000,
    });
  }, [setCoords, setError]);

  // Never hydrate from localStorage for live driving/location workflows. A stale
  // desktop browser fix can be hundreds of miles off; always request a fresh fix.
  useEffect(() => {
    clearCachedCoords();
    if (!auto || requestedRef.current) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;
    requestedRef.current = true;
    request();
  }, [auto, request]);

  useEffect(() => {
    if (!watch || state.status !== "granted") return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(setCoords, setError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
    });
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [watch, state.status, setCoords, setError]);

  return { ...state, request };
}

/** Haversine distance in miles between two lat/lon points. */
export function distanceMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.7613; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
