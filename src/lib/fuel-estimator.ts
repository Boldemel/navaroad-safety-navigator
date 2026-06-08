// MPG estimates by truck type (loaded, mixed terrain)
const MPG_TABLE: Record<string, number> = {
  Sleeper: 6.5,
  "Day Cab": 6.8,
  "Box Truck": 9.0,
  Flatbed: 6.2,
  Tanker: 5.8,
  Reefer: 6.0,
};

export const DEFAULT_DIESEL_PRICE = 3.85; // USD/gal — national avg fallback

export function mpgFor(truck: string | null | undefined, loaded: boolean = true) {
  const base = (truck && MPG_TABLE[truck]) ?? 6.5;
  // Empty trucks get ~10% better MPG
  return loaded ? base : base * 1.1;
}

export function estimateFuel(distanceMi: number, truck: string | null | undefined, pricePerGal: number, loaded = true) {
  const mpg = mpgFor(truck, loaded);
  const gallons = distanceMi / mpg;
  const cost = gallons * pricePerGal;
  const costPerMile = cost / Math.max(distanceMi, 1);
  return { mpg, gallons, cost, costPerMile };
}
