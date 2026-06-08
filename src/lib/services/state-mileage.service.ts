// State mileage estimator — samples points along a route geometry, reverse-
// geocodes via TomTom to identify the US/CA state for each sample, and
// distributes total miles proportional to the segment length in each state.
//
// Returns [] if no API key is available or all lookups fail — callers should
// treat an empty result as "state breakdown unavailable".

export type StateSlice = { state: string; miles: number };

type SampleWithState = { lat: number; lon: number; cum: number; state: string | null };

function haversineMi(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 3958.8;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.asin(Math.sqrt(s));
}

async function reverseGeocodeState(lat: number, lon: number, key: string): Promise<string | null> {
  try {
    const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${encodeURIComponent(key)}&radius=100&returnSpeedLimit=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      addresses?: Array<{ address?: { countrySubdivisionCode?: string; countrySubdivision?: string; countryCode?: string } }>;
    };
    const a = json.addresses?.[0]?.address;
    if (!a) return null;
    const sub = a.countrySubdivisionCode ?? a.countrySubdivision ?? null;
    if (!sub) return null;
    // TomTom returns codes like "US-UT" or sometimes just "UT".
    const parts = sub.split("-");
    const code = (parts[parts.length - 1] || "").toUpperCase();
    return code.length >= 2 && code.length <= 3 ? code : null;
  } catch {
    return null;
  }
}

export async function computeStateMileage(
  geometry: Array<[number, number]>,
  totalMiles: number,
  sampleCount = 14,
): Promise<StateSlice[]> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key || geometry.length < 2 || totalMiles <= 0) return [];

  // Build cumulative distances along the polyline.
  const cum: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    const [lon1, lat1] = geometry[i - 1];
    const [lon2, lat2] = geometry[i];
    cum.push(cum[i - 1] + haversineMi(lat1, lon1, lat2, lon2));
  }
  const polyTotal = cum[cum.length - 1];
  if (polyTotal <= 0) return [];

  // Pick evenly spaced samples by distance.
  const samples: SampleWithState[] = [];
  const n = Math.max(2, Math.min(sampleCount, geometry.length));
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * polyTotal;
    let idx = 1;
    while (idx < cum.length - 1 && cum[idx] < target) idx++;
    const segLen = cum[idx] - cum[idx - 1];
    const frac = segLen > 0 ? (target - cum[idx - 1]) / segLen : 0;
    const [lon1, lat1] = geometry[idx - 1];
    const [lon2, lat2] = geometry[idx];
    samples.push({
      lat: lat1 + (lat2 - lat1) * frac,
      lon: lon1 + (lon2 - lon1) * frac,
      cum: target,
      state: null,
    });
  }

  // Reverse-geocode in parallel (small N, TomTom handles fine).
  const states = await Promise.all(samples.map((s) => reverseGeocodeState(s.lat, s.lon, key)));
  states.forEach((st, i) => (samples[i].state = st));

  // Assign each midpoint between samples to the closer sample's state.
  // Compute weights = distance covered while "in" that state.
  const weights = new Map<string, number>();
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const span = b.cum - a.cum;
    if (span <= 0) continue;
    if (a.state && a.state === b.state) {
      weights.set(a.state, (weights.get(a.state) ?? 0) + span);
    } else {
      // Split half/half when the two endpoints disagree.
      if (a.state) weights.set(a.state, (weights.get(a.state) ?? 0) + span / 2);
      if (b.state) weights.set(b.state, (weights.get(b.state) ?? 0) + span / 2);
    }
  }

  const totalWeight = Array.from(weights.values()).reduce((s, v) => s + v, 0);
  if (totalWeight <= 0) return [];

  const result: StateSlice[] = Array.from(weights.entries())
    .map(([state, w]) => ({ state, miles: Math.round(((w / totalWeight) * totalMiles) * 10) / 10 }))
    .filter((s) => s.miles > 0)
    .sort((a, b) => b.miles - a.miles);

  return result;
}
