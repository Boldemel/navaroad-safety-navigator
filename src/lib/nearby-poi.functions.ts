import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type NearbyPoi = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  type: "truck_stop" | "rest_area" | "parking" | "fuel";
  address: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  lat: number;
  lon: number;
  distanceMi: number;
  amenities: { showers: boolean; scales: boolean; diesel: boolean; parking: boolean };
};

const Input = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusMi: z.number().min(5).max(200).default(50),
  kind: z.enum(["truck_stop", "rest_area", "parking", "all"]).default("all"),
});

const TRUCK_BRANDS = /pilot|flying j|love'?s|\bta\b|travelcenter|petro|sapp|road ranger/i;
const REST_AREA = /rest area|rest stop|service area|welcome center/i;
const PARKING = /truck parking|truck lot/i;

function dist(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

type RawResult = {
  id?: string;
  poi?: { name?: string; brands?: Array<{ name: string }>; phone?: string; categories?: string[]; classifications?: Array<{ code?: string; names?: Array<{ name: string }> }> };
  address?: { freeformAddress?: string; municipality?: string; countrySubdivision?: string };
  position?: { lat: number; lon: number };
};

async function tomtomSearch(query: string, lat: number, lon: number, radiusMeters: number, key: string): Promise<RawResult[]> {
  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?lat=${lat}&lon=${lon}&radius=${radiusMeters}&limit=100&key=${key}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: RawResult[] };
    return j.results ?? [];
  } catch { return []; }
}

export const findNearbyTruckStops = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof Input>) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.TOMTOM_API_KEY;
    if (!key) return { connected: false, pois: [] as NearbyPoi[], message: "TomTom API key not configured" };
    const radiusMeters = Math.round(data.radiusMi * 1609.34);
    const queries: string[] = [];
    if (data.kind === "truck_stop" || data.kind === "all") queries.push("truck stop", "Pilot", "Flying J", "Loves Travel Stop", "TA Travel Center", "Petro");
    if (data.kind === "rest_area" || data.kind === "all") queries.push("rest area", "welcome center");
    if (data.kind === "parking" || data.kind === "all") queries.push("truck parking");

    const seen = new Map<string, NearbyPoi>();
    const all = await Promise.all(queries.map((q) => tomtomSearch(q, data.lat, data.lon, radiusMeters, key)));
    for (const list of all) {
      for (const r of list) {
        if (!r.position) continue;
        const name = r.poi?.name ?? "";
        const brand = r.poi?.brands?.[0]?.name ?? null;
        const hay = `${name} ${brand ?? ""}`.toLowerCase();
        let type: NearbyPoi["type"] | null = null;
        if (TRUCK_BRANDS.test(hay) || /truck stop|truckstop|travel cent/.test(hay)) type = "truck_stop";
        else if (REST_AREA.test(hay)) type = "rest_area";
        else if (PARKING.test(hay)) type = "parking";
        if (!type) continue;
        const id = r.id ?? `${r.position.lat},${r.position.lon}`;
        if (seen.has(id)) continue;
        const d = dist(data.lat, data.lon, r.position.lat, r.position.lon);
        if (d > data.radiusMi) continue;
        const isTruckBrand = TRUCK_BRANDS.test(hay);
        seen.set(id, {
          id,
          name: name || brand || "Unknown",
          brand,
          category: type,
          type,
          address: r.address?.freeformAddress ?? "",
          city: r.address?.municipality ?? null,
          state: r.address?.countrySubdivision ?? null,
          phone: r.poi?.phone ?? null,
          lat: r.position.lat,
          lon: r.position.lon,
          distanceMi: Math.round(d * 10) / 10,
          amenities: {
            showers: isTruckBrand,
            scales: /flying j|pilot|love|ta\b|petro/i.test(hay),
            diesel: type === "truck_stop",
            parking: true,
          },
        });
      }
    }
    const pois = [...seen.values()].sort((a, b) => a.distanceMi - b.distanceMi).slice(0, 60);
    return { connected: true, pois };
  });
