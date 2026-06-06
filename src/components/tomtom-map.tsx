import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";

// Fix default marker icons (Leaflet's defaults break with bundlers).
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  description?: string;
  color?: string;
};

function colorIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 0) return;
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
  }, [markers, map]);
  return null;
}

export function TomTomMap({
  tomtomKey,
  markers,
  showTraffic = true,
  height = "100%",
}: {
  tomtomKey: string | null;
  markers: MapMarker[];
  showTraffic?: boolean;
  height?: string;
}) {
  const validMarkers = useMemo(
    () => markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon)),
    [markers],
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div style={{ height, width: "100%" }} className="rounded-xl border border-border bg-sidebar/40 flex items-center justify-center text-xs text-muted-foreground">
        Loading map…
      </div>
    );
  }

  const tileUrl = tomtomKey
    ? `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${tomtomKey}`
    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution = tomtomKey
    ? '&copy; <a href="https://www.tomtom.com/">TomTom</a>'
    : '&copy; OpenStreetMap contributors';

  const center: [number, number] =
    validMarkers.length > 0 ? [validMarkers[0].lat, validMarkers[0].lon] : [39.5, -98.35];

  return (
    <div style={{ height, width: "100%" }} className="rounded-xl overflow-hidden border border-border">
      <MapContainer center={center} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer url={tileUrl} attribution={attribution} />
        {tomtomKey && showTraffic && (
          <>
            <TileLayer
              url={`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomKey}`}
              opacity={0.7}
            />
            <TileLayer
              url={`https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${tomtomKey}`}
              opacity={0.9}
            />
          </>
        )}
        {validMarkers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lon]} icon={m.color ? colorIcon(m.color) : defaultIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{m.title}</div>
                {m.description && <div className="text-xs mt-1 text-gray-600">{m.description}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds markers={validMarkers} />
      </MapContainer>
    </div>
  );
}
