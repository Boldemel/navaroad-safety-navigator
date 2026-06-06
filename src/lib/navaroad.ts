export const HAZARD_TYPES = [
  { value: "accident", label: "Accident" },
  { value: "high_wind", label: "High Winds" },
  { value: "road_closure", label: "Road Closure" },
  { value: "construction", label: "Construction" },
  { value: "debris", label: "Debris" },
  { value: "parking_full", label: "Parking Full" },
  { value: "flooding", label: "Flooding" },
  { value: "severe_weather", label: "Severe Weather" },
] as const;

export const SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

export const TRUCK_TYPES = [
  "Day Cab",
  "Sleeper",
  "Box Truck",
  "Straight Truck",
  "Heavy Haul",
];

export const TRAILER_TYPES = [
  "Dry Van",
  "Reefer",
  "Flatbed",
  "Step Deck",
  "Tanker",
  "Lowboy",
  "Car Hauler",
  "Bulk / Hopper",
];

export function hazardLabel(value: string) {
  return HAZARD_TYPES.find((h) => h.value === value)?.label ?? value;
}

export function severityClasses(sev: string) {
  switch (sev) {
    case "critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "high":
      return "bg-primary/15 text-primary border-primary/30";
    case "medium":
      return "bg-warning/15 text-warning border-warning/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
