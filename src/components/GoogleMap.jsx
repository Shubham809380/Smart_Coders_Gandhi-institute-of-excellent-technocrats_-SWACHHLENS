import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
  resolved: '#6b7280',
};

const VEHICLE_STATUS_COLORS = {
  collecting: '#3b82f6',
  en_route: '#8b5cf6',
  idle: '#6b7280',
  maintenance: '#f59e0b',
};

const DEFAULT_CENTER = { lat: 20.2961, lng: 85.8245 };

function validCoord(val) {
  if (val == null) return false;
  const n = Number(val);
  return Number.isFinite(n);
}

function validLocation(loc) {
  if (!loc) return false;
  return validCoord(loc.lat) && validCoord(loc.lng) && Math.abs(Number(loc.lat)) <= 90 && Math.abs(Number(loc.lng)) <= 180;
}

function createHotspotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42"><path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26S32 28 32 16C32 7.16 24.84 0 16 0Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15" r="6" fill="#fff"/><path d="M16 11v8m-4-4h8" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -44],
  });
}

function createUserIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:18px;height:18px;border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 5px rgba(37,99,235,.22),0 2px 5px rgba(0,0,0,.25);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function createVehicleIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18 18.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm1.5-9H17V12h4.46L19.5 9.5zM6 18.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM20 8l3 4v5h-2c0 1.66-1.34 3-3 3s-3-1.34-3-3H9c0 1.66-1.34 3-3 3s-3-1.34-3-3H1V6c0-1.11.89-2 2-2h14v4h3z"/></svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

export default function GoogleMap({ center = DEFAULT_CENTER, zoom = 14, markers = [], userLocation = null, vehicles = [], onMarkerClick, onMarkerHover, onMapClick, className = '', onMapReady }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hotspotLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const vehicleLayerRef = useRef(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMarkerHoverRef = useRef(onMarkerHover);
  const onMapClickRef = useRef(onMapClick);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);

  onMarkerClickRef.current = onMarkerClick;
  onMarkerHoverRef.current = onMarkerHover;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;
    setMapError('');
    setMapReady(false);

    try {
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom,
        zoomControl: false,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      hotspotLayerRef.current = L.layerGroup().addTo(map);
      vehicleLayerRef.current = L.layerGroup().addTo(map);

      map.whenReady(() => {
        if (!cancelled) {
          mapRef.current = map;
          setMapReady(true);
          onMapReady?.(map);
        }
      });
    } catch {
      setMapError('Map could not initialize. Please retry.');
    }

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [retryNonce]);

  useEffect(() => {
    if (!mapReady || !hotspotLayerRef.current) return;
    hotspotLayerRef.current.clearLayers();
    markers
      .filter((m) => validLocation(m))
      .forEach((marker) => {
        const color = SEVERITY_COLORS[marker.severity] || '#6b7280';
        const icon = createHotspotIcon(color);
        const m = L.marker([Number(marker.lat), Number(marker.lng)], { icon });
        const popupContent = `<div style="padding:4px 2px;font-size:13px;font-weight:600;text-transform:capitalize;">${(marker.label || 'Waste Report').replace(/_/g, ' ')}</div>`;
        m.bindPopup(popupContent);
        m.on('click', () => onMarkerClickRef.current?.(marker));
        m.addTo(hotspotLayerRef.current);
      });
  }, [markers, mapReady]);

  useEffect(() => {
    if (!mapReady || !vehicleLayerRef.current) return;
    vehicleLayerRef.current.clearLayers();
    vehicles
      .filter((v) => validLocation(v))
      .forEach((vehicle) => {
        const color = VEHICLE_STATUS_COLORS[vehicle.status] || '#6b7280';
        const icon = createVehicleIcon(color);
        const m = L.marker([Number(vehicle.latitude), Number(vehicle.longitude)], { icon });
        const popupContent = `<div style="padding:4px 2px;font-size:12px;"><strong>${vehicle.name || vehicle.id}</strong><br/>Status: ${vehicle.status}<br/>Area: ${vehicle.assignedArea || 'N/A'}</div>`;
        m.bindPopup(popupContent);
        m.addTo(vehicleLayerRef.current);
      });
  }, [vehicles, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!userMarkerRef.current) {
      if (!validLocation(userLocation)) return;
      userMarkerRef.current = L.marker([Number(userLocation.lat), Number(userLocation.lng)], { icon: createUserIcon() })
        .addTo(mapRef.current);
    } else if (validLocation(userLocation)) {
      userMarkerRef.current.setLatLng([Number(userLocation.lat), Number(userLocation.lng)]);
    }
  }, [userLocation, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return undefined;
    const handler = (e) => {
      // Ignore clicks that landed on a marker/popup — Leaflet fires map click too.
      if (e?.originalEvent?.defaultPrevented) return;
      onMapClickRef.current?.();
    };
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReady && map && validLocation(center)) {
      map.flyTo([Number(center.lat), Number(center.lng)], map.getZoom(), { duration: 0.5 });
    }
  }, [center?.lat, center?.lng, mapReady]);

  const retry = useCallback(() => setRetryNonce((v) => v + 1), []);

  return (
    <div className={`relative ${className}`} style={{ minHeight: '200px', width: '100%', height: '100%' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {!mapReady && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 px-6 text-center z-10">
          <span className="material-symbols-outlined text-amber-600 text-3xl mb-2">map</span>
          <p className="text-sm font-bold text-slate-800">Map unavailable</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{mapError}</p>
          <button onClick={retry} className="mt-4 rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white">Retry map</button>
        </div>
      )}
    </div>
  );
}

export { DEFAULT_CENTER, SEVERITY_COLORS };
