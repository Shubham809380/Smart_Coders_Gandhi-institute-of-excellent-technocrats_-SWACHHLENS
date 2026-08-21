import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../../contexts/ThemeContext.jsx";

const STATUS_COLORS = {
  submitted: "#4C8DFF",
  ai_analyzed: "#4C8DFF",
  under_review: "#D9A40E",
  assigned: "#00A896",
  en_route: "#00A896",
  cleanup_in_progress: "#00A896",
  verification: "#8B5CF6",
  reopened: "#E5484D",
};

const HEAT_PALETTE = [
  [26, 107, 158],
  [0, 168, 150],
  [217, 164, 14],
  [240, 118, 59],
  [229, 72, 77],
];

function blendPalette(t) {
  const clamped = Math.max(0, Math.min(0.999, t));
  const idx = clamped * (HEAT_PALETTE.length - 1);
  const lo = HEAT_PALETTE[Math.floor(idx)];
  const hi = HEAT_PALETTE[Math.ceil(idx)];
  const f = idx - Math.floor(idx);
  return [lo[0] + (hi[0] - lo[0]) * f, lo[1] + (hi[1] - lo[1]) * f, lo[2] + (hi[2] - lo[2]) * f];
}

export default function HeatMap({ cells = [], reports = [], center = [20.2961, 85.8245], zoom = 13, onPinClick, height = "100%" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const canvasRef = useRef(null);
  const { resolved } = useTheme();

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center, zoom, zoomControl: true, preferCanvas: true });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer follows theme
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) map.removeLayer(layerRef.current);
    const url = resolved === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    layerRef.current = L.tileLayer(url, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
  }, [resolved]);

  // Canvas heat layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (canvasRef.current) { canvasRef.current.remove(); canvasRef.current = null; }
    if (!cells.length) return;

    const canvas = document.createElement("canvas");
    canvas.className = "leaflet-zoom-hide";
    canvas.style.pointerEvents = "none";
    map.getPane("overlayPane").appendChild(canvas);
    canvasRef.current = canvas;

    const maxIntensity = Math.max(0.001, ...cells.map((c) => c.intensity));

    const draw = () => {
      const size = map.getSize();
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size.x, size.y);
      const rBase = Math.max(26, Math.round(size.x / 40));
      for (const cell of cells) {
        const pt = map.latLngToContainerPoint([cell.latitude, cell.longitude]);
        const t = Math.min(1, cell.intensity / maxIntensity);
        const r = rBase * (0.65 + 0.55 * t);
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
        grad.addColorStop(0, `rgba(0,0,0,${0.35 + 0.65 * t})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
      }
      const img = ctx.getImageData(0, 0, size.x, size.y);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (!a) continue;
        const [cr, cg, cb] = blendPalette(a / 255);
        d[i] = cr;
        d[i + 1] = cg;
        d[i + 2] = cb;
        d[i + 3] = Math.min(215, a * 1.05);
      }
      ctx.putImageData(img, 0, 0);
    };

    const reset = () => {
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      draw();
    };

    reset();
    map.on("moveend zoomend resize viewreset", reset);
    map.on("zoomstart movestart", () => { canvas.style.opacity = "0"; });
    map.on("zoomend moveend", () => { canvas.style.opacity = "1"; });

    return () => {
      map.off("moveend zoomend resize viewreset", reset);
      canvas.remove();
      if (canvasRef.current === canvas) canvasRef.current = null;
    };
  }, [cells]);

  // Status pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.layerGroup();
    for (const report of reports) {
      if (!report.latitude || !report.longitude) continue;
      const color = STATUS_COLORS[report.status] || "#8AA099";
      const marker = L.circleMarker([report.latitude, report.longitude], {
        radius: 6,
        weight: 2,
        color: "#ffffff",
        fillColor: color,
        fillOpacity: 0.95,
      });
      marker.bindTooltip(`${report.id} · ${report.wasteType.replace(/_/g, " ")}`, { direction: "top", offset: [0, -6] });
      marker.on("click", () => onPinClick?.(report));
      group.addLayer(marker);
    }
    group.addTo(map);
    return () => { group.remove(); };
  }, [reports, onPinClick]);

  return <div ref={containerRef} style={{ width: "100%", height }} className="rounded-xl overflow-hidden z-0" />;
}
