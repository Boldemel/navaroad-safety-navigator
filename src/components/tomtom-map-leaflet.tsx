import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import type { MapMarker } from "./tomtom-map";

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

function colorIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [points, map]);
  return null;
}

// TomTom API keys are alphanumeric ~30+ chars with no spaces. If the secret
// contains a prompt or other text, we fall back to OpenStreetMap tiles so the
// map still renders.
function isValidTomTomKey(k: string | null): k is string {
  return !!k && /^[A-Za-z0-9]{20,}$/.test(k.trim());
}

export default function TomTomMapClient({
  tomtomKey,
  markers,
  routeGeometry = [],
  showTraffic = true,
  height = "100%",
}: {
  tomtomKey: string | null;
  markers: MapMarker[];
  routeGeometry?: Array<[number, number]>; // [lon, lat]
  showTraffic?: boolean;
  height?: string;
}) {
  const validMarkers = useMemo(
    () => markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon)),
    [markers],
  );
  const routeLatLngs = useMemo<Array<[number, number]>>(
    () => routeGeometry.filter((p) => Array.isArray(p) && p.length === 2).map(([lon, lat]) => [lat, lon]),
    [routeGeometry],
  );
  const fitPoints = useMemo<Array<[number, number]>>(
    () => [...routeLatLngs, ...validMarkers.map((m) => [m.lat, m.lon] as [number, number])],
    [routeLatLngs, validMarkers],
  );

  const keyOk = isValidTomTomKey(tomtomKey);
  const tileUrl = keyOk
    ? `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${tomtomKey}`
    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution = keyOk
    ? '&copy; <a href="https://www.tomtom.com/">TomTom</a>'
    : '&copy; OpenStreetMap contributors';

  const center: [number, number] =
    routeLatLngs[0] ?? (validMarkers.length > 0 ? [validMarkers[0].lat, validMarkers[0].lon] : [39.5, -98.35]);

  return (
    <div style={{ height, width: "100%" }} className="rounded-xl overflow-hidden border border-border relative">
      <MapContainer center={center} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer url={tileUrl} attribution={attribution} />
        {keyOk && showTraffic && (
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
        {routeLatLngs.length >= 2 && (
          <Polyline positions={routeLatLngs} pathOptions={{ color: "#3b82f6", weight: 5, opacity: 0.85 }} />
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
        <FitBounds points={fitPoints} />
      </MapContainer>
      {!keyOk && tomtomKey && (
        <div className="absolute top-2 right-2 z-[1000] rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-[11px] px-2 py-1">
          TomTom key invalid — using OpenStreetMap fallback
        </div>
      )}
    </div>
  );
}
