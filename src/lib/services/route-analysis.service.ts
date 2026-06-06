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
  if (!res.ok) throw new Error(`Geocoding failed for "${query}"`);
  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!json.length) throw new Error(`Could not find location "${query}"`);
  return { name: json[0].display_name, lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon) };
}

export async function getRoute(o: GeoPoint, d: GeoPoint): Promise<RoutedPath> {
  const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=simplified&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routing service unavailable");
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
