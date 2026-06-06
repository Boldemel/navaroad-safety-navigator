import { lazy, Suspense, useEffect, useState } from "react";

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  description?: string;
  color?: string;
};

const InnerMap = lazy(() => import("./tomtom-map-leaflet"));

export function TomTomMap(props: {
  tomtomKey: string | null;
  markers: MapMarker[];
  routeGeometry?: Array<[number, number]>;
  currentLocation?: { lat: number; lon: number } | null;
  showTraffic?: boolean;
  height?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fallback = (
    <div
      style={{ height: props.height ?? "100%", width: "100%" }}
      className="rounded-xl border border-border bg-sidebar/40 flex items-center justify-center text-xs text-muted-foreground"
    >
      Loading map…
    </div>
  );
  if (!mounted) return fallback;
  return (
    <Suspense fallback={fallback}>
      <InnerMap {...props} />
    </Suspense>
  );
}
