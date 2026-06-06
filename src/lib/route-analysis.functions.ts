import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  origin: z.string().trim().min(2).max(200),
  destination: z.string().trim().min(2).max(200),
  truck: z.string().max(60).optional(),
  trailer: z.string().max(60).optional(),
});

export type RouteAnalysis = {
  origin: { name: string; lat: number; lon: number };
  destination: { name: string; lat: number; lon: number };
  distanceKm: number;
  durationMin: number;
  geometry: Array<[number, number]>; // [lon,lat]
  weather: Array<{
    label: string;
    lat: number;
    lon: number;
    tempC: number | null;
    windKph: number | null;
    gustKph: number | null;
    precipMm: number | null;
    condition: string;
  }>;
  risks: Array<{ type: "wind" | "precip" | "closure" | "hazard" | "temp"; severity: "low" | "medium" | "high" | "critical"; message: string }>;
  score: number;
};

async function geocode(query: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Navaroad/1.0 (route-analysis)", "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`Geocoding failed for "${query}"`);
  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!json.length) throw new Error(`Could not find location "${query}"`);
  return { name: json[0].display_name, lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon) };
}

async function route(o: { lat: number; lon: number }, d: { lat: number; lon: number }) {
  const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=simplified&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routing service unavailable");
  const json = (await res.json()) as any;
  if (!json.routes?.length) throw new Error("No route found between locations");
  const r = json.routes[0];
  return {
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    geometry: r.geometry.coordinates as Array<[number, number]>,
  };
}

async function weatherAt(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&wind_speed_unit=kmh&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = (await res.json()) as any;
  const c = j.current ?? {};
  return {
    tempC: c.temperature_2m ?? null,
    windKph: c.wind_speed_10m ?? null,
    gustKph: c.wind_gusts_10m ?? null,
    precipMm: c.precipitation ?? null,
    condition: wmoToText(c.weather_code),
  };
}

function wmoToText(code: number | undefined): string {
  if (code == null) return "Unknown";
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Unknown";
}

export const analyzeRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<RouteAnalysis> => {
    const [o, d2] = await Promise.all([geocode(data.origin), geocode(data.destination)]);
    const r = await route(o, d2);

    // Sample 3 points: start, mid, end
    const mid = r.geometry[Math.floor(r.geometry.length / 2)] ?? [(<number>o.lon + d2.lon) / 2, (o.lat + d2.lat) / 2];
    const samples = [
      { label: "Origin", lat: o.lat, lon: o.lon },
      { label: "Midpoint", lat: mid[1], lon: mid[0] },
      { label: "Destination", lat: d2.lat, lon: d2.lon },
    ];
    const weather = await Promise.all(
      samples.map(async (s) => ({ ...s, ...(await weatherAt(s.lat, s.lon)) ?? { tempC: null, windKph: null, gustKph: null, precipMm: null, condition: "Unknown" } }))
    );

    // Compute risks
    const risks: RouteAnalysis["risks"] = [];
    let penalty = 0;
    for (const w of weather) {
      if ((w.gustKph ?? 0) >= 75) { risks.push({ type: "wind", severity: "critical", message: `Severe wind gusts ${Math.round(w.gustKph!)} km/h near ${w.label}` }); penalty += 25; }
      else if ((w.gustKph ?? 0) >= 55 || (w.windKph ?? 0) >= 45) { risks.push({ type: "wind", severity: "high", message: `High wind ${Math.round(w.gustKph ?? w.windKph!)} km/h near ${w.label}` }); penalty += 12; }
      else if ((w.windKph ?? 0) >= 30) { risks.push({ type: "wind", severity: "medium", message: `Moderate wind near ${w.label}` }); penalty += 5; }

      if ((w.precipMm ?? 0) >= 5) { risks.push({ type: "precip", severity: "high", message: `Heavy precipitation near ${w.label}` }); penalty += 10; }
      else if ((w.precipMm ?? 0) >= 1) { risks.push({ type: "precip", severity: "medium", message: `Rain near ${w.label}` }); penalty += 4; }

      if (w.condition === "Snow") { risks.push({ type: "precip", severity: "high", message: `Snow near ${w.label}` }); penalty += 12; }
      if (w.condition === "Thunderstorm") { risks.push({ type: "precip", severity: "critical", message: `Thunderstorms near ${w.label}` }); penalty += 18; }
      if (w.condition === "Fog") { risks.push({ type: "precip", severity: "medium", message: `Fog near ${w.label}` }); penalty += 6; }

      if ((w.tempC ?? 99) <= -5) { risks.push({ type: "temp", severity: "medium", message: `Freezing temps (${Math.round(w.tempC!)}°C) near ${w.label}` }); penalty += 6; }
    }

    // Trailer risk
    const trailer = data.trailer ?? "";
    const trailerRisk = ["Dry Van", "Reefer", "Curtain Side"].includes(trailer) ? 6 : 2;
    penalty += trailerRisk;

    const score = Math.max(20, Math.min(99, 98 - penalty));
    return {
      origin: o,
      destination: d2,
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      geometry: r.geometry,
      weather,
      risks,
      score,
    };
  });
