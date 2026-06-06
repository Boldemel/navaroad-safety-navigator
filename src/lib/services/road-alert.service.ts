// RoadAlertService — DOT / road condition alerts.
//
// PLACEHOLDER: No nationwide free DOT API exists. State 511 systems vary,
// and most production setups use HERE Traffic, TomTom Incidents, MapBox
// Incidents, or per-state 511 feeds (often key-gated).
//
// To connect a real provider:
//   1. Add the provider's API key as a Lovable secret (e.g. HERE_API_KEY).
//   2. Read it inside fetchRoadAlerts() via process.env.HERE_API_KEY.
//   3. Map provider records into the RoadAlert shape below.
//
// Until then this service returns an empty list — the app shows zero
// closures/construction rather than fabricated demo data.

export type RoadAlert = {
  id: string;
  source: "dot";
  provider: string;
  category: "road_closure" | "construction" | "detour" | "chain_restriction" | "incident";
  severity: "low" | "medium" | "high" | "critical";
  roadway: string; // e.g. "I-80 EB MP 215"
  location: string; // human description
  description: string;
  recommendedAction: string;
  lat?: number;
  lon?: number;
  updatedAt: string; // ISO
};

export async function fetchRoadAlerts(_opts?: {
  bbox?: [number, number, number, number]; // [minLon,minLat,maxLon,maxLat]
  state?: string;
}): Promise<RoadAlert[]> {
  // TODO: integrate HERE Traffic / TomTom Incidents / state 511 feed.
  return [];
}
