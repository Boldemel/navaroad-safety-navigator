import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  query: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});

export type AddressSuggestion = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  country: string | null;
  provider: string;
};

/**
 * Autocomplete address/place search. Prefers TomTom when TOMTOM_API_KEY is set,
 * otherwise falls back to OSM Nominatim.
 */
export const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AddressSuggestion[]> => {
    const key = process.env.TOMTOM_API_KEY;
    const { query, lat, lon } = data;

    if (key) {
      try {
        const params = new URLSearchParams({
          key,
          limit: "6",
          typeahead: "true",
          countrySet: "US,CA",
        });
        if (lat != null && lon != null) {
          params.set("lat", String(lat));
          params.set("lon", String(lon));
        }
        const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params}`;
        const res = await fetch(url);
        if (res.ok) {
          const j = (await res.json()) as {
            results?: Array<{
              id?: string;
              type?: string;
              poi?: { name?: string };
              address?: {
                freeformAddress?: string;
                municipality?: string;
                countrySubdivision?: string;
                countrySubdivisionName?: string;
                country?: string;
                countryCode?: string;
              };
              position?: { lat: number; lon: number };
            }>;
          };
          const out: AddressSuggestion[] = [];
          for (const r of j.results ?? []) {
            if (!r.position) continue;
            const a = r.address ?? {};
            const labelBase = r.poi?.name
              ? `${r.poi.name}, ${a.freeformAddress ?? ""}`.replace(/, $/, "")
              : a.freeformAddress ?? `${r.position.lat}, ${r.position.lon}`;
            out.push({
              id: r.id ?? `${r.position.lat},${r.position.lon}`,
              label: labelBase,
              lat: r.position.lat,
              lon: r.position.lon,
              city: a.municipality ?? null,
              state: a.countrySubdivisionName ?? a.countrySubdivision ?? null,
              country: a.country ?? a.countryCode ?? null,
              provider: "TomTom",
            });
          }
          if (out.length > 0) return out;
        }
      } catch {
        /* fall through */
      }
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Navaroad/1.0 (autocomplete)", "Accept-Language": "en" },
      });
      if (!res.ok) return [];
      const j = (await res.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        address?: { city?: string; town?: string; village?: string; state?: string; country?: string; country_code?: string };
      }>;
      return j.map((r) => ({
        id: String(r.place_id),
        label: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        city: r.address?.city ?? r.address?.town ?? r.address?.village ?? null,
        state: r.address?.state ?? null,
        country: r.address?.country ?? r.address?.country_code ?? null,
        provider: "Nominatim",
      }));
    } catch {
      return [];
    }
  });
