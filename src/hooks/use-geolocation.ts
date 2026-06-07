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

function readCached(): GeoCoords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GeoCoords) : null;
  } catch {
    return null;
  }
}

/**
 * Browser geolocation hook. Lazy — call `request()` from a user gesture to
 * trigger the permission prompt. `watch: true` keeps an active watchPosition
 * so the dashboard / hazard map can react to the driver moving.
 */
export function useGeolocation(opts: { watch?: boolean } = {}) {
  const { watch = false } = opts;
  const [state, setState] = useState<GeoState>(() => ({
    coords: readCached(),
    status: "idle",
    error: null,
  }));
  const watchId = useRef<number | null>(null);

  const setCoords = useCallback((pos: GeolocationPosition) => {
    const next: GeoCoords = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? null,
      speedMps: pos.coords.speed ?? null,
      headingDeg: pos.coords.heading ?? null,
      at: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
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
    setState((s) => ({ ...s, status: "prompting", error: null }));
    navigator.geolocation.getCurrentPosition(setCoords, setError, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 15_000,
    });
  }, [setCoords, setError]);

  useEffect(() => {
    if (!watch || state.status !== "granted") return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(setCoords, setError, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
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
