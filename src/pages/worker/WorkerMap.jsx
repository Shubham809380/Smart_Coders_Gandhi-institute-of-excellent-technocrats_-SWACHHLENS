import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { workerService } from "../../services.js";
import { useTheme } from "../../contexts/ThemeContext.jsx";
const SEV_COLORS = { critical:"#E5484D", high:"#F97316", medium:"#F59E0B", low:"#34C77B" };
const SEV_BG = { critical:"#E5484D20", high:"#F9731620", medium:"#F59E0B20", low:"#34C77B20" };

function makeIcon(color) {
  return L.divIcon({
    className:'',
    iconSize:[28,28],
    iconAnchor:[14,14],
    popupAnchor:[0,-16],
    html:`<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
      <div style="width:8px;height:8px;background:#fff;border-radius:50%"></div>
    </div>`,
  });
}

function makeWorkerIcon() {
  return L.divIcon({
    className:'',
    iconSize:[24,24],
    iconAnchor:[12,12],
    html:`<div style="position:relative;width:24px;height:24px">
      <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid #4C8DFF;opacity:0.4;animation:pulse 2s infinite"></div>
      <div style="width:24px;height:24px;border-radius:50%;background:#4C8DFF;border:3px solid #fff;box-shadow:0 2px 12px rgba(76,141,255,0.5);display:flex;align-items:center;justify-content:center">
        <div style="width:6px;height:6px;background:#fff;border-radius:50%"></div>
      </div>
    </div>
    <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:0.4}50%{transform:scale(1.6);opacity:0}}</style>`,
  });
}

export default function WorkerMap() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workerLoc, setWorkerLoc] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [proximityAlerts, setProximityAlerts] = useState([]);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const workerMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastPingRef = useRef(0);
  const refreshAlertsRef = useRef(() => {});

  const T = isDark
    ? { bg:'#0B1220', surface:'#161B26', border:'#232A3A', text:'#E8ECF1', muted:'#8791A3', accent:'#34C77B', tileUrl:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' }
    : { bg:'#F5F7FA', surface:'#FFFFFF', border:'#E4E8EE', text:'#12151C', muted:'#5B6472', accent:'#00a843', tileUrl:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' };

  const initMap = useCallback((center) => {
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }
    if (!mapRef.current) return;
    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer(T.tileUrl, { maxZoom:19 }).addTo(map);
    L.control.zoom({ position:'bottomright' }).addTo(map);
    map.on("click", () => setSelectedTask(null));
    mapInstance.current = map;
    return map;
  }, [isDark]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const data = await workerService.getTasks();
        if (!cancelled) setTasks(data.tasks || []);
      } catch {}
      setLoading(false);
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const opts = { enableHighAccuracy:true, timeout:10000, maximumAge:30000 };
    let initialSet = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat:pos.coords.latitude, lng:pos.coords.longitude };
        setWorkerLoc(loc);
        if (!initialSet) { initialSet = true; initMap(loc); }
      },
      () => {},
      opts
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat:pos.coords.latitude, lng:pos.coords.longitude };
        setWorkerLoc(loc);
        if (mapInstance.current && workerMarkerRef.current) {
          workerMarkerRef.current.setLatLng([loc.lat, loc.lng]);
        } else if (mapInstance.current) {
          workerMarkerRef.current = L.marker([loc.lat, loc.lng], { icon:makeWorkerIcon(), zIndexOffset:1000 }).addTo(mapInstance.current);
        }
        // Ping the server at most every 15s so proximity alerts stay fresh.
        const now = Date.now();
        if (now - lastPingRef.current > 15000) {
          lastPingRef.current = now;
          workerService.pingLocation(loc.lat, loc.lng)
            .then(() => refreshAlertsRef.current())
            .catch(() => {});
        }
      },
      () => {},
      opts
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [initMap]);

  useEffect(() => {
    if (!mapInstance.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const bounds = [];
    tasks.forEach(t => {
      if (!t.latitude || !t.longitude) return;
      const color = SEV_COLORS[t.severity] || '#8791A3';
      const marker = L.marker([t.latitude, t.longitude], { icon:makeIcon(color) })
        .addTo(mapInstance.current)
        .bindPopup(`<div style="min-width:180px;font-family:Inter,sans-serif">
          <div style="font-weight:700;font-size:13px;text-transform:capitalize;margin-bottom:4px">${(t.wasteType||'waste').replace(/_/g,' ')}</div>
          <div style="font-size:11px;color:#8791A3;margin-bottom:6px">${t.address||'Unknown'}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
            <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${SEV_BG[t.severity]||'#8791A320'};color:${color}">${(t.severity||'medium').toUpperCase()}</span>
            <span style="font-size:10px;color:#8791A3;font-weight:600">${t.priorityScore||0} pts</span>
          </div>
          <button onclick="window.__workerMapNav('${t.id}')" style="width:100%;padding:8px;border-radius:8px;background:${T.accent};color:#fff;border:none;font-weight:700;font-size:12px;cursor:pointer">View Task</button>
        </div>`, { className:'' });
      marker.on('click', () => setSelectedTask(t));
      markersRef.current.push(marker);
      bounds.push([t.latitude, t.longitude]);
    });
    if (workerLoc) bounds.push([workerLoc.lat, workerLoc.lng]);
    if (bounds.length > 1) mapInstance.current.fitBounds(bounds, { padding:[50,50], maxZoom:15 });
    else if (workerLoc && tasks.length === 0) mapInstance.current.setView([workerLoc.lat, workerLoc.lng], 14);
  }, [tasks, workerLoc, isDark]);

  useEffect(() => {
    if (workerLoc && mapInstance.current && !workerMarkerRef.current) {
      workerMarkerRef.current = L.marker([workerLoc.lat, workerLoc.lng], { icon:makeWorkerIcon(), zIndexOffset:1000 })
        .addTo(mapInstance.current)
        .bindPopup('<div style="font-weight:700;font-size:12px">Your Location</div>');
    }
  }, [workerLoc]);

  useEffect(() => {
    window.__workerMapNav = (id) => {
      const t = tasks.find(x => x.id === id);
      if (t) navigate(`/worker/tasks/${id}`, { state:{ report:t } });
    };
    return () => { delete window.__workerMapNav; };
  }, [tasks, navigate]);

  useEffect(() => {
    let cancelled = false;
    const refreshAlerts = async () => {
      try {
        const alerts = await workerService.getProximityAlerts();
        if (!cancelled) setProximityAlerts(alerts);
      } catch {}
    };
    refreshAlertsRef.current = refreshAlerts;
    refreshAlerts();
    const id = setInterval(refreshAlerts, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const dismissAlert = async (reportId) => {
    setProximityAlerts((prev) => prev.filter((a) => a.reportId !== reportId));
    try { await workerService.dismissProximityAlert(reportId); } catch {}
  };

  const navigateToTask = (t) => {
    if (t.latitude && t.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${t.latitude},${t.longitude}`, '_blank');
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-20" style={{ background:T.bg, transition:'background-color 0.25s ease' }}>
      <div className="sticky top-0 z-40" style={{ background:T.surface, borderBottom:`1px solid ${T.border}` }}>
        <div className="px-4 pt-[env(safe-area-inset-top)] pb-3">
          <div className="flex items-center gap-3 pt-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:`${T.accent}18` }}>
              <span className="material-symbols-outlined text-[20px]" style={{ color:T.accent }}>map</span>
            </div>
            <div>
              <h1 className="text-lg font-extrabold" style={{ color:T.text }}>Task Map</h1>
              <span className="text-xs font-bold" style={{ color:T.muted }}>{tasks.length} assigned tasks</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 mx-4 mt-4 rounded-2xl overflow-hidden relative" ref={mapRef} style={{ minHeight:'55vh', border:`1px solid ${T.border}` }}>
        {proximityAlerts.length > 0 && (
          <div className="absolute top-3 left-3 right-3 z-[600] flex flex-col gap-2">
            {proximityAlerts.slice(0, 3).map((a) => (
              <div key={a.reportId} className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background:T.surface, border:`1px solid ${T.border}`, boxShadow:'0 6px 18px rgba(0,0,0,0.18)' }}>
                <span className="material-symbols-outlined text-[20px] shrink-0" style={{ color:'#F5A623' }}>near_me</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold truncate" style={{ color:T.text }}>
                    {(a.wasteType || 'waste').replace(/_/g,' ')} · {a.distanceMeters < 1000 ? `${a.distanceMeters}m` : `${(a.distanceMeters/1000).toFixed(1)}km`} away
                  </p>
                  <p className="text-[10px] font-semibold truncate" style={{ color:T.muted }}>{a.address || a.reportId}</p>
                </div>
                <button onClick={() => { const t = tasks.find(x => x.id === a.reportId); if (t) navigateToTask(t); }}
                  className="px-2.5 py-1.5 rounded-lg text-white text-[10px] font-bold shrink-0 active:scale-95 transition-transform" style={{ background:T.accent }}>
                  Go
                </button>
                <button onClick={() => dismissAlert(a.reportId)} aria-label="Dismiss alert" className="p-1 shrink-0 active:scale-90 transition-transform">
                  <span className="material-symbols-outlined text-[16px]" style={{ color:T.muted }}>close</span>
                </button>
              </div>
            ))}
          </div>
        )}
        {!workerLoc && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30" style={{ background:T.bg }}>
            <span className="material-symbols-outlined text-[40px] mb-2" style={{ color:T.muted }}>location_off</span>
            <p className="text-sm font-bold mb-1" style={{ color:T.text }}>Location unavailable</p>
            <p className="text-xs text-center px-8 mb-4" style={{ color:T.muted }}>Enable location access to see your position on the map</p>
            <button onClick={() => {
              if (navigator.geolocation) navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const loc = { lat:pos.coords.latitude, lng:pos.coords.longitude };
                  setWorkerLoc(loc);
                  if (!mapInstance.current) initMap(loc);
                },
                () => {},
                { enableHighAccuracy:true, timeout:8000 }
              );
            }} className="px-5 py-2.5 text-white text-sm font-bold rounded-xl active:scale-95 transition-all" style={{ background:T.accent }}>
              Try Again
            </button>
          </div>
        )}
        {!loading && tasks.length === 0 && workerLoc && (
          <div className="absolute top-4 left-4 right-4 z-30 rounded-xl px-4 py-3 flex items-center gap-2" style={{ background:T.surface, border:`1px solid ${T.border}`, boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color:T.muted }}>info</span>
            <span className="text-xs font-bold" style={{ color:T.muted }}>No tasks assigned — map centered on your location</span>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-30" style={{ background:`${T.bg}80` }}>
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor:T.accent, borderTopColor:'transparent' }} />
          </div>
        )}
      </div>

      {selectedTask && (
        <div className="fixed bottom-20 left-4 right-4 z-30 rounded-2xl shadow-xl p-4" style={{ background:T.surface, border:`1px solid ${T.border}`, animation:'slideUp 0.3s ease' }}>
          <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background:SEV_BG[selectedTask.severity]||SEV_BG.medium }}>
              <span className="material-symbols-outlined text-[20px]" style={{ color:SEV_COLORS[selectedTask.severity]||'#F5A623' }}>delete</span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-extrabold capitalize block" style={{ fontFamily:'"Space Grotesk",sans-serif', color:T.text }}>{(selectedTask.wasteType || "waste").replace(/_/g, " ")}</span>
              <span className="text-xs truncate block mt-0.5" style={{ color:T.muted }}>{selectedTask.address || "Unknown"}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background:SEV_BG[selectedTask.severity]||SEV_BG.medium, color:SEV_COLORS[selectedTask.severity]||'#F5A623' }}>
                  {(selectedTask.severity || "medium").toUpperCase()}
                </span>
                <span className="text-[11px] font-bold" style={{ color:T.muted }}>{selectedTask.priorityScore||0} pts</span>
              </div>
            </div>
            <button onClick={() => setSelectedTask(null)} aria-label="Dismiss" className="p-1 -m-1 shrink-0 active:scale-90 transition-transform">
              <span className="material-symbols-outlined text-[18px]" style={{ color:T.muted }}>close</span>
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => navigateToTask(selectedTask)}
              className="flex-1 h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background:T.accent }}>
              <span className="material-symbols-outlined text-[18px]">navigation</span>
              Navigate
            </button>
            <button onClick={() => navigate(`/worker/tasks/${selectedTask.id}`, { state:{ report:selectedTask } })}
              className="flex-1 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: isDark ? '#1C2233' : '#F0F3F7', color:T.text, border:`1px solid ${T.border}` }}>
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              View Task
            </button>
          </div>
        </div>
      )}

      <WorkerBottomNav active="map" />
    </div>
  );
}
