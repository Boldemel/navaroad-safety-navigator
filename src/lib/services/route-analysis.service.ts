// RouteAnalysisService — geocoding + routing.
// Geocoding: Nominatim (OSM, free, fair-use).
// Routing: OSRM public demo server.
// Swap to Mapbox Directions / HERE Routing by replacing these functions.

export type GeoPoint = { name: string; lat: number; lon: number };
export type RoutedPath = {
  distanceKm: number;
  durationMin: number;
  geometry: Array<[number, number]>; // [lon,lat]
};

export async function geocode(query: string): Promise<GeoPoint> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Navaroad/1.0 (route-analysis)", "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`Geocoding service unavailable. Try again in a moment.`);
  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!json.length) {
    throw new Error(
      `Could not find "${query}". Check the spelling and try a format like "City, ST" (e.g. "Salt Lake City, UT").`,
    );
  }
  return { name: json[0].display_name, lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon) };
}

export async function getRoute(o: GeoPoint, d: GeoPoint): Promise<RoutedPath> {
  // Prefer TomTom Routing API when a key is configured (truck-grade traffic data).
  // Falls back to OSRM public demo server otherwise.
  const key = process.env.TOMTOM_API_KEY;
  let tomtomError: string | null = null;
  if (key) {
    // Try truck routing first; if TomTom can't route truck end-to-end across
    // regions (NO_ROUTE_FOUND / ProductId mismatch), retry with car routing.
    const attempts: Array<{ label: string; qs: string }> = [
      { label: "truck", qs: `travelMode=truck&traffic=true&routeType=fastest&computeTravelTimeFor=all` },
      { label: "car", qs: `travelMode=car&traffic=true&routeType=fastest` },
    ];
    for (const attempt of attempts) {
      try {
        const url =
          `https://api.tomtom.com/routing/1/calculateRoute/` +
          `${o.lat},${o.lon}:${d.lat},${d.lon}/json?${attempt.qs}&key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        if (res.ok) {
          const j = (await res.json()) as {
            routes?: Array<{
              summary?: { lengthInMeters?: number; travelTimeInSeconds?: number };
              legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
            }>;
          };
          const r = j.routes?.[0];
          if (r?.summary && r.legs?.length) {
            const coords: Array<[number, number]> = [];
            for (const leg of r.legs) for (const p of leg.points ?? []) coords.push([p.longitude, p.latitude]);
            return {
              distanceKm: (r.summary.lengthInMeters ?? 0) / 1000,
              durationMin: (r.summary.travelTimeInSeconds ?? 0) / 60,
              geometry: coords,
            };
          }
          tomtomError = `TomTom ${attempt.label}: no route`;
        } else {
          const body = await res.text().catch(() => "");
          tomtomError = `TomTom ${attempt.label} ${res.status}: ${body.slice(0, 200)}`;
          console.warn("TomTom routing failed", { mode: attempt.label, status: res.status, body: body.slice(0, 500) });
          // Only retry next attempt on NO_ROUTE_FOUND / ProductId mismatch.
          if (!/NO_ROUTE_FOUND|ProductId/i.test(body)) break;
        }
      } catch (e) {
        tomtomError = `TomTom ${attempt.label} request failed: ${(e as Error).message}`;
        console.warn(tomtomError);
        break;
      }
    }
  }


  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = (await res.json()) as {
      routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>;
    };
    if (!json.routes?.length) throw new Error("No route found between locations");
    const r = json.routes[0];
    return {
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
      geometry: r.geometry.coordinates,
    };
  } catch (e) {
    const detail = tomtomError ? ` (TomTom: ${tomtomError}; OSRM: ${(e as Error).message})` : ` (${(e as Error).message})`;
    throw new Error(`Routing service unavailable${detail}`);
  }
}


/** Pick N evenly-spaced sample points along a route for weather checks. */
export function sampleRoute(
  geometry: Array<[number, number]>,
  count: number,
): Array<{ lat: number; lon: number }> {
  if (geometry.length === 0 || count <= 0) return [];
  if (geometry.length <= count) return geometry.map(([lon, lat]) => ({ lat, lon }));
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / (count - 1)) * (geometry.length - 1));
    const [lon, lat] = geometry[idx];
    out.push({ lat, lon });
  }
  return out;
}
