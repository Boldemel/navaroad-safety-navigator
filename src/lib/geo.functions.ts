import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export type ReverseGeocodeResult = { label: string; lat: number; lon: number; provider: string };

/**
 * Reverse-geocode a lat/lon into a human label. Prefers TomTom Reverse
 * Geocoding API when TOMTOM_API_KEY is set; falls back to Nominatim (OSM).
 */
export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ReverseGeocodeResult> => {
    const { lat, lon } = data;
    const key = process.env.TOMTOM_API_KEY;
    if (key) {
      try {
        const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        if (res.ok) {
          const j = (await res.json()) as {
            addresses?: Array<{ address?: { freeformAddress?: string; municipality?: string; countrySubdivision?: string } }>;
          };
          const a = j.addresses?.[0]?.address;
          const label =
            a?.freeformAddress ??
            [a?.municipality, a?.countrySubdivision].filter(Boolean).join(", ") ??
            `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          return { label, lat, lon, provider: "TomTom" };
        }
      } catch {
        /* fall through */
      }
    }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=12`;
      const res = await fetch(url, { headers: { "User-Agent": "Navaroad/1.0 (reverse-geocode)" } });
      if (res.ok) {
        const j = (await res.json()) as { display_name?: string };
        if (j.display_name) return { label: j.display_name, lat, lon, provider: "Nominatim" };
      }
    } catch {
      /* ignore */
    }
    return { label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon, provider: "coords" };
  });
