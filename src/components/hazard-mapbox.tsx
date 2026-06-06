import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  layer: "api" | "driver";
  severity: string;
  title: string;
  source: string;
  description?: string;
};

type Props = {
  token: string;
  markers: MapMarker[];
};

function color(severity: string, layer: "api" | "driver"): string {
  if (severity === "critical") return "#ef4444";
  if (severity === "high") return layer === "driver" ? "#f59e0b" : "#3b82f6";
  if (severity === "medium") return "#f59e0b";
  return layer === "driver" ? "#facc15" : "#60a5fa";
}

export function HazardMapbox({ token, markers }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerObjsRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-98.5, 39.5], // US centroid default
      zoom: 3.2,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // clear old markers
    for (const m of markerObjsRef.current) m.remove();
    markerObjsRef.current = [];

    const valid = markers.filter(
      (m) => Number.isFinite(m.lat) && Number.isFinite(m.lon),
    );

    for (const m of valid) {
      const el = document.createElement("div");
      el.style.width = "18px";
      el.style.height = "18px";
      el.style.borderRadius = "50%";
      el.style.background = color(m.severity, m.layer);
      el.style.border = m.layer === "driver" ? "2px solid #fbbf24" : "2px solid #ffffff";
      el.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.4)";
      el.style.cursor = "pointer";

      const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div style="font-family:inherit;max-width:240px">
           <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(m.title)}</div>
           <div style="font-size:11px;opacity:.75;margin-bottom:4px">Source: ${escapeHtml(m.source)} · ${escapeHtml(m.severity)}</div>
           ${m.description ? `<div style="font-size:12px">${escapeHtml(m.description).slice(0, 200)}</div>` : ""}
         </div>`,
      );

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.lon, m.lat])
        .setPopup(popup)
        .addTo(map);
      markerObjsRef.current.push(marker);
    }

    if (valid.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const m of valid) bounds.extend([m.lon, m.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 600 });
    }
  }, [markers]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
