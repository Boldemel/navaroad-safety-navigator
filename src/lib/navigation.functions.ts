import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  originLat: z.number().min(-90).max(90),
  originLon: z.number().min(-180).max(180),
  destLat: z.number().min(-90).max(90),
  destLon: z.number().min(-180).max(180),
  truck: z.boolean().optional(),
  waypoints: z
    .array(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
    .max(8)
    .optional(),
});

export type NavInstruction = {
  message: string;
  maneuver: string;
  routeOffsetM: number;
  travelTimeS: number;
  point: { lat: number; lon: number };
};

export type TruckRoute = {
  distanceKm: number;
  durationMin: number;
  durationTrafficMin: number;
  geometry: Array<[number, number]>; // [lon,lat]
  instructions: NavInstruction[];
  provider: "TomTom" | "fallback";
};

function isValidCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function redactTomTomKey(url: string) {
  try {
    const u = new URL(url);
    if (u.searchParams.has("key")) u.searchParams.set("key", "REDACTED_TOMTOM_API_KEY");
    return u.toString();
  } catch {
    return url.replace(/([?&]key=)[^&]+/i, "$1REDACTED_TOMTOM_API_KEY");
  }
}

/**
 * Truck-grade route with turn-by-turn text instructions and live traffic ETA.
 * Falls back to a straight-line stub if no TomTom key is configured so the
 * UI keeps working in dev.
 */
export const getTruckRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<TruckRoute> => {
    if (!isValidCoordinate(data.originLat, data.originLon) || !isValidCoordinate(data.destLat, data.destLon)) {
      console.warn("Invalid TomTom navigation route coordinates", {
        origin: { lat: data.originLat, lon: data.originLon },
        destination: { lat: data.destLat, lon: data.destLon },
      });
      return fallbackRoute(data);
    }
    const key = process.env.TOMTOM_API_KEY;
    if (key) {
      try {
        const params = new URLSearchParams({
          traffic: "true",
          routeType: "fastest",
          instructionsType: "text",
          computeTravelTimeFor: "all",
          sectionType: "traffic",
          key,
        });
        if (data.truck !== false) params.set("travelMode", "truck");
        const wp = (data.waypoints ?? []).filter((w) => isValidCoordinate(w.lat, w.lon));
        const coords = [
          `${data.originLat},${data.originLon}`,
          ...wp.map((w) => `${w.lat},${w.lon}`),
          `${data.destLat},${data.destLon}`,
        ].join(":");
        const url =
          `https://api.tomtom.com/routing/1/calculateRoute/${coords}/json?${params.toString()}`;
        console.info("TomTom Routing API URL", { mode: data.truck === false ? "standard" : "truck", url: redactTomTomKey(url) });
        const res = await fetch(url);
        if (res.ok) {
          const j = (await res.json()) as {
            routes?: Array<{
              summary?: {
                lengthInMeters?: number;
                travelTimeInSeconds?: number;
                trafficDelayInSeconds?: number;
                liveTrafficIncidentsTravelTimeInSeconds?: number;
              };
              legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
              guidance?: {
                instructions?: Array<{
                  message?: string;
                  maneuver?: string;
                  routeOffsetInMeters?: number;
                  travelTimeInSeconds?: number;
                  point?: { latitude: number; longitude: number };
                }>;
              };
            }>;
          };
          const r = j.routes?.[0];
          if (r?.summary && r.legs?.length) {
            const coords: Array<[number, number]> = [];
            for (const leg of r.legs) for (const p of leg.points ?? []) coords.push([p.longitude, p.latitude]);
            const instructions: NavInstruction[] = (r.guidance?.instructions ?? [])
              .filter((i) => i.point && typeof i.point.latitude === "number")
              .map((i) => ({
                message: i.message ?? i.maneuver?.replace(/_/g, " ") ?? "Continue",
                maneuver: i.maneuver ?? "STRAIGHT",
                routeOffsetM: i.routeOffsetInMeters ?? 0,
                travelTimeS: i.travelTimeInSeconds ?? 0,
                point: { lat: i.point!.latitude, lon: i.point!.longitude },
              }));
            const baseS = r.summary.travelTimeInSeconds ?? 0;
            const trafficS = r.summary.liveTrafficIncidentsTravelTimeInSeconds ?? baseS;
            return {
              distanceKm: (r.summary.lengthInMeters ?? 0) / 1000,
              durationMin: baseS / 60,
              durationTrafficMin: trafficS / 60,
              geometry: coords,
              instructions,
              provider: "TomTom",
            };
          }
        } else {
          const body = await res.text().catch(() => "");
          console.warn("TomTom navigation routing failed", { status: res.status, body: body.slice(0, 500) });
        }
      } catch (e) {
        console.warn("TomTom navigation routing request failed", { error: (e as Error).message });
      }
    }
    return fallbackRoute(data);
  });

function fallbackRoute(data: z.infer<typeof Input>): TruckRoute {
  // Fallback: straight line + single "head to destination" instruction.
  return {
      distanceKm: haversineKm(data.originLat, data.originLon, data.destLat, data.destLon),
      durationMin: haversineKm(data.originLat, data.originLon, data.destLat, data.destLon) / 80 * 60,
      durationTrafficMin: haversineKm(data.originLat, data.originLon, data.destLat, data.destLon) / 80 * 60,
      geometry: [
        [data.originLon, data.originLat],
        [data.destLon, data.destLat],
      ],
      instructions: [
        {
          message: "Head toward destination",
          maneuver: "DEPART",
          routeOffsetM: 0,
          travelTimeS: 0,
          point: { lat: data.originLat, lon: data.originLon },
        },
        {
          message: "Arrive at destination",
          maneuver: "ARRIVE",
          routeOffsetM: 0,
          travelTimeS: 0,
          point: { lat: data.destLat, lon: data.destLon },
        },
      ],
      provider: "fallback",
    };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
