import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// TomTom POI category IDs we use:
// 7311 = Truck Stop, 7395 = Rest Area, 7369 = Open Parking Area,
// 7311003 = Truck-friendly fuel, 7311004 = Truck wash
// Fuel chains (filtered by brand): Pilot, Flying J, Love's, TA, Petro.

const TRUCK_FUEL_BRANDS = ["Pilot", "Flying J", "Loves", "Love's", "TA", "TravelCenters", "Petro"];

const Input = z.object({
  geometry: z.array(z.tuple([z.number(), z.number()])).max(100000),
  kind: z.enum(["fuel", "parking"]),
  limit: z.number().int().min(1).max(50).optional(),
});

export type TruckPoi = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  address: string;
  lat: number;
  lon: number;
  distanceMi?: number | null;
  phone?: string | null;
};

export type TruckPoiResult = {
  connected: boolean;
  provider: string;
  message?: string;
  pois: TruckPoi[];
};

function sampleAlongRoute(geom: Array<[number, number]>, count: number) {
  if (geom.length === 0) return [] as Array<{ lat: number; lon: number }>;
  if (geom.length <= count) return geom.map(([lon, lat]) => ({ lat, lon }));
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / (count - 1)) * (geom.length - 1));
    const [lon, lat] = geom[idx];
    out.push({ lat, lon });
  }
  return out;
}

export const searchTruckPois = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<TruckPoiResult> => {
    const key = process.env.TOMTOM_API_KEY;
    if (!key) {
      return {
        connected: false,
        provider: "not_connected",
        message:
          data.kind === "fuel"
            ? "Fuel stop data not connected yet."
            : "Live truck parking availability not connected yet.",
        pois: [],
      };
    }
    if (data.geometry.length < 2) {
      return { connected: true, provider: "TomTom", pois: [] };
    }

    const samples = sampleAlongRoute(data.geometry, 5);
    const seen = new Map<string, TruckPoi>();

    // categorySet — Truck Stop covers both fuel + parking; add Rest Area + Open Parking for parking kind.
    const categorySet =
      data.kind === "fuel" ? "7311" : "7311,7395,7369";

    for (const s of samples) {
      const params = new URLSearchParams({
        key,
        lat: String(s.lat),
        lon: String(s.lon),
        radius: "40000", // 40 km around each sample
        limit: "20",
        categorySet,
      });
      const url = `https://api.tomtom.com/search/2/nearbySearch/.json?${params}`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const j = (await res.json()) as {
          results?: Array<{
            id?: string;
            poi?: { name?: string; brands?: Array<{ name: string }>; phone?: string; categories?: string[] };
            address?: { freeformAddress?: string };
            position?: { lat: number; lon: number };
            dist?: number;
          }>;
        };
        for (const r of j.results ?? []) {
          if (!r.position) continue;
          const brand = r.poi?.brands?.[0]?.name ?? null;
          const name = r.poi?.name ?? brand ?? "Truck stop";
          // For fuel: keep only major truck-friendly brands.
          if (data.kind === "fuel") {
            const hay = `${name} ${brand ?? ""}`.toLowerCase();
            if (!TRUCK_FUEL_BRANDS.some((b) => hay.includes(b.toLowerCase()))) continue;
          }
          const id = r.id ?? `${r.position.lat},${r.position.lon}`;
          if (seen.has(id)) continue;
          seen.set(id, {
            id,
            name,
            brand,
            category: r.poi?.categories?.[0] ?? "truck_stop",
            address: r.address?.freeformAddress ?? "",
            lat: r.position.lat,
            lon: r.position.lon,
            distanceMi: r.dist != null ? r.dist / 1609.34 : null,
            phone: r.poi?.phone ?? null,
          });
        }
      } catch {
        /* try next sample */
      }
    }

    return {
      connected: true,
      provider: "TomTom",
      pois: Array.from(seen.values()).slice(0, data.limit ?? 30),
    };
  });
