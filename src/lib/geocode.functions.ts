import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  query: z.string().min(2).max(500),
});

export type GeocodeHit = {
  label: string;
  lat: number;
  lon: number;
  provider: "TomTom" | "Nominatim";
};

/**
 * Forward-geocode a free-form location string into lat/lon. Prefers TomTom
 * Search when configured, falls back to Nominatim (OSM). Returns null when
 * nothing usable comes back — callers should keep the original text.
 */
export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<GeocodeHit | null> => {
    const q = data.query.trim();
    if (!q) return null;

    const key = process.env.TOMTOM_API_KEY;
    if (key) {
      try {
        const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(q)}.json?limit=1&key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        if (res.ok) {
          const j = (await res.json()) as {
            results?: Array<{
              position?: { lat: number; lon: number };
              address?: { freeformAddress?: string };
            }>;
          };
          const r = j.results?.[0];
          if (r?.position) {
            return {
              label: r.address?.freeformAddress ?? q,
              lat: r.position.lat,
              lon: r.position.lon,
              provider: "TomTom",
            };
          }
        }
      } catch {
        /* fall through to Nominatim */
      }
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Navaroad/1.0 (geocode)", "Accept-Language": "en" },
      });
      if (res.ok) {
        const j = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
        const hit = j[0];
        if (hit) {
          return {
            label: hit.display_name,
            lat: parseFloat(hit.lat),
            lon: parseFloat(hit.lon),
            provider: "Nominatim",
          };
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  });
