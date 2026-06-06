export const FAVORITE_CATEGORIES = [
  { value: "home_terminal", label: "Home terminal" },
  { value: "yard", label: "Yard" },
  { value: "shipper", label: "Shipper" },
  { value: "receiver", label: "Receiver" },
  { value: "truck_stop", label: "Favorite truck stop" },
  { value: "fuel_stop", label: "Fuel stop" },
  { value: "other", label: "Other" },
] as const;

export type FavoriteCategory = (typeof FAVORITE_CATEGORIES)[number]["value"];

export function favoriteCategoryLabel(v: string) {
  return FAVORITE_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}
