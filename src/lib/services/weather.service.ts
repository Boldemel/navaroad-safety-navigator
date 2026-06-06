// WeatherService — fetches live weather + severe weather alerts.
// Current weather: open-meteo (free, no key).
// Severe weather alerts: National Weather Service (api.weather.gov, US, free, no key).
// Swap providers here without touching the rest of the app.

export type CurrentWeather = {
  tempC: number | null;
  windKph: number | null;
  gustKph: number | null;
  precipMm: number | null;
  visibilityKm: number | null;
  condition: string;
};

export type WeatherAlert = {
  id: string;
  source: "weather_api";
  provider: string; // e.g. "NWS"
  event: string; // "Tornado Warning"
  category:
    | "high_wind"
    | "tornado"
    | "winter_storm"
    | "flood"
    | "thunderstorm"
    | "visibility"
    | "severe_weather";
  severity: "low" | "medium" | "high" | "critical";
  areaDesc: string;
  headline: string;
  description: string;
  recommendedAction: string;
  effective: string; // ISO
  expires: string | null;
  lat: number | null;
  lon: number | null;
};

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

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
): Promise<CurrentWeather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility&wind_speed_unit=kmh&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = (await res.json()) as { current?: Record<string, number> };
  const c = j.current ?? {};
  return {
    tempC: c.temperature_2m ?? null,
    windKph: c.wind_speed_10m ?? null,
    gustKph: c.wind_gusts_10m ?? null,
    precipMm: c.precipitation ?? null,
    visibilityKm: c.visibility != null ? Math.round((c.visibility / 1000) * 10) / 10 : null,
    condition: wmoToText(c.weather_code),
  };
}

function categorize(event: string): WeatherAlert["category"] {
  const e = event.toLowerCase();
  if (e.includes("tornado")) return "tornado";
  if (e.includes("wind")) return "high_wind";
  if (e.includes("winter") || e.includes("snow") || e.includes("blizzard") || e.includes("ice"))
    return "winter_storm";
  if (e.includes("flood")) return "flood";
  if (e.includes("thunderstorm")) return "thunderstorm";
  if (e.includes("fog") || e.includes("dust") || e.includes("smoke")) return "visibility";
  return "severe_weather";
}

function mapSeverity(s: string | undefined): WeatherAlert["severity"] {
  switch ((s ?? "").toLowerCase()) {
    case "extreme":
      return "critical";
    case "severe":
      return "high";
    case "moderate":
      return "medium";
    default:
      return "low";
  }
}

function recommend(category: WeatherAlert["category"]): string {
  switch (category) {
    case "tornado":
      return "Shelter immediately. Do not drive into the storm path.";
    case "high_wind":
      return "High-profile vehicles slow down or stage. Avoid exposed bridges and passes.";
    case "winter_storm":
      return "Carry chains. Reduce speed. Consider delaying departure.";
    case "flood":
      return "Avoid flooded roads. Re-route via higher ground.";
    case "thunderstorm":
      return "Reduce speed and increase following distance. Watch for hail.";
    case "visibility":
      return "Use low beams, slow down, and increase following distance.";
    default:
      return "Monitor conditions and adjust route as needed.";
  }
}

function mapFeatures(
  feats: Array<{ id: string; properties: Record<string, string> }>,
): WeatherAlert[] {
  return feats.map((f) => {
    const p = f.properties;
    const category = categorize(p.event ?? "");
    return {
      id: f.id,
      source: "weather_api" as const,
      provider: "NWS",
      event: p.event ?? "Weather Alert",
      category,
      severity: mapSeverity(p.severity),
      areaDesc: p.areaDesc ?? "Unknown area",
      headline: p.headline ?? p.event ?? "Weather Alert",
      description: (p.description ?? "").slice(0, 600),
      recommendedAction: p.instruction?.slice(0, 400) || recommend(category),
      effective: p.effective ?? p.sent ?? new Date().toISOString(),
      expires: p.expires ?? null,
    };
  });
}

/**
 * Fetch active severe-weather alerts from the National Weather Service.
 * If `area` is provided (US state code, e.g. "CA"), the query is scoped.
 */
export async function fetchSevereWeatherAlerts(area?: string): Promise<WeatherAlert[]> {
  const qs = new URLSearchParams({ status: "actual", message_type: "alert" });
  if (area) qs.set("area", area);
  const url = `https://api.weather.gov/alerts/active?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Navaroad/1.0 (safety-engine)", Accept: "application/geo+json" },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    features?: Array<{ id: string; properties: Record<string, string> }>;
  };
  return mapFeatures((j.features ?? []).slice(0, 100));
}

/**
 * Fetch active NWS alerts that cover a specific lat/lon point.
 * Returns [] for points outside NWS coverage (non-US) or when the API fails.
 */
export async function fetchAlertsForPoint(lat: number, lon: number): Promise<WeatherAlert[]> {
  const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Navaroad/1.0 (safety-engine)", Accept: "application/geo+json" },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    features?: Array<{ id: string; properties: Record<string, string> }>;
  };
  return mapFeatures(j.features ?? []);
}
