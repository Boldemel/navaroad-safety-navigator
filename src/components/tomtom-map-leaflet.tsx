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

// Inline SVG glyphs (lucide path data) used inside divIcon markers so the map
// shows recognizable icons instead of plain dots.
const ICON_SVGS: Record<string, string> = {
  truck_stop:
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  rest_area:
    '<path d="M7 22v-7l-2-2"/><path d="M17 8 9 16"/><path d="M14 14a3 3 0 0 1 3 3"/><path d="M19 6c-2.5 0-6 1-6 6 0-5-3.5-6-6-6"/><path d="M14 8a4 4 0 1 1-8 0c0-2.2 2-4 4-4 1.1 0 2 .5 2 .5"/>',
  weigh_station:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  hazard:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  weather:
    '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  driver:
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  pin:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};

function glyphIcon(color: string, key?: string) {
  const svg = key && ICON_SVGS[key];
  if (!svg) {
    return L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }
  const html = `<div style="width:26px;height:26px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>
  </div>`;
  return L.divIcon({ className: "", html, iconSize: [26, 26], iconAnchor: [13, 13] });
}

function colorIcon(color: string) {
  return glyphIcon(color);
}

function FitBounds({ points, enabled = true }: { points: Array<[number, number]>; enabled?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [points, map, enabled]);
  return null;
}

function FollowLocation({
  center,
  zoom,
  trigger,
}: {
  center: { lat: number; lon: number } | null;
  zoom: number;
  trigger: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView([center.lat, center.lon], zoom, { animate: true });
  }, [center?.lat, center?.lon, trigger, map, zoom]);
  return null;
}


// TomTom API keys are alphanumeric ~30+ chars with no spaces. If the secret
// contains a prompt or other text, we fall back to OpenStreetMap tiles so the
// map still renders.
function isValidTomTomKey(k: string | null): k is string {
  return !!k && /^[A-Za-z0-9]{20,}$/.test(k.trim());
}

function truckArrowIcon(headingDeg: number | null) {
  const rot = headingDeg ?? 0;
  const html = `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;transform:rotate(${rot}deg);transform-origin:center">
    <div style="width:26px;height:26px;border-radius:9999px;background:#22c55e;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 14h6v8h4v-8h6Z"/></svg>
    </div>
  </div>`;
  return L.divIcon({ className: "", html, iconSize: [34, 34], iconAnchor: [17, 17] });
}

export default function TomTomMapClient({
  tomtomKey,
  markers,
  routeGeometry = [],
  currentLocation = null,
  headingDeg = null,
  showTraffic = true,
  height = "100%",
  follow = false,
  followZoom = 14,
  recenterToken = 0,
}: {
  tomtomKey: string | null;
  markers: MapMarker[];
  routeGeometry?: Array<[number, number]>; // [lon, lat]
  currentLocation?: { lat: number; lon: number } | null;
  headingDeg?: number | null;
  showTraffic?: boolean;
  height?: string;
  follow?: boolean;
  followZoom?: number;
  recenterToken?: number;
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
    () => {
      const pts: Array<[number, number]> = [...routeLatLngs, ...validMarkers.map((m) => [m.lat, m.lon] as [number, number])];
      if (currentLocation) pts.push([currentLocation.lat, currentLocation.lon]);
      return pts;
    },
    [routeLatLngs, validMarkers, currentLocation],
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
          <Marker key={m.id} position={[m.lat, m.lon]} icon={m.color || m.iconKey ? glyphIcon(m.color ?? "#3b82f6", m.iconKey) : defaultIcon}>

            <Popup>
              <div className="text-sm">
                <div className="font-medium">{m.title}</div>
                {m.description && <div className="text-xs mt-1 text-gray-600">{m.description}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
        {currentLocation && (
          <Marker position={[currentLocation.lat, currentLocation.lon]} icon={truckArrowIcon(headingDeg)}>
            <Popup>
              <div className="text-sm font-medium">You are here</div>
              <div className="text-xs text-gray-600">{currentLocation.lat.toFixed(4)}, {currentLocation.lon.toFixed(4)}</div>
            </Popup>
          </Marker>
        )}
        <FitBounds points={fitPoints} enabled={!follow} />
        {follow && <FollowLocation center={currentLocation} zoom={followZoom} trigger={recenterToken} />}
      </MapContainer>

      {!keyOk && tomtomKey && (
        <div className="absolute top-2 right-2 z-[1000] rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-[11px] px-2 py-1">
          TomTom key invalid — using OpenStreetMap fallback
        </div>
      )}
    </div>
  );
}

