import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../../components/BottomNav.jsx';
import GoogleMap, { DEFAULT_CENTER, SEVERITY_COLORS } from '../../components/GoogleMap.jsx';
import { reportService, vehicleService } from '../../services.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical', color: '#ef4444' },
  { key: 'high', label: 'High', color: '#f97316' },
  { key: 'medium', label: 'Medium', color: '#f59e0b' },
  { key: 'low', label: 'Low', color: '#22c55e' },
];

const SEVERITY_BG = {
  critical: 'bg-red-50 border-red-200',
  high: 'bg-orange-50 border-orange-200',
  medium: 'bg-amber-50 border-amber-200',
  low: 'bg-green-50 border-green-200',
};

const SEVERITY_TEXT = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-amber-600',
  low: 'text-green-600',
};

const STATUS_LABEL = {
  submitted: 'Reported',
  under_review: 'Pending',
  assigned: 'Assigned',
  en_route: 'En Route',
  in_progress: 'In Progress',
  cleanup_in_progress: 'Cleanup',
  verification: 'Verifying',
  resolved: 'Resolved',
};

const STATUS_CHIP = {
  submitted: 'bg-gray-100 text-gray-600',
  under_review: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-50 text-blue-600',
  en_route: 'bg-blue-50 text-blue-600',
  in_progress: 'bg-blue-50 text-blue-600',
  cleanup_in_progress: 'bg-blue-50 text-blue-600',
  verification: 'bg-purple-50 text-purple-600',
  resolved: 'bg-green-50 text-green-600',
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ExploreMap() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const mapInstanceRef = useRef(null);
  const touchStartY = useRef(0);
  const hasCenteredOnInitialLocation = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      Promise.all([
        reportService.getReports().catch(() => []),
        vehicleService.getVehicles().catch(() => []),
      ]).then(([rData, vData]) => {
        if (cancelled) return;
        setReports(rData || []);
        setVehicles(vData || []);
        setLoading(false);
      });
    };
    refresh();
    const intervalId = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      return undefined;
    }
    setLocationStatus('locating');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        if (!hasCenteredOnInitialLocation.current) {
          hasCenteredOnInitialLocation.current = true;
        }
        setLocationStatus('tracking');
      },
      (err) => {
        if (err.code === 1) setLocationStatus('denied');
        else if (err.code === 2) setLocationStatus('unavailable');
        else setLocationStatus('timeout');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (activeFilter !== 'all' && r.severity !== activeFilter) return false;
      if (r.status === 'resolved' || r.status === 'rejected') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const waste = (r.wasteType || '').replace(/_/g, ' ').toLowerCase();
        const addr = (r.address || '').toLowerCase();
        if (!waste.includes(q) && !addr.includes(q)) return false;
      }
      return true;
    });
  }, [reports, activeFilter, searchQuery]);

  const mapMarkers = useMemo(() => {
    return filteredReports
      .filter((r) => validCoord(r.latitude) && validCoord(r.longitude))
      .map((r) => ({
        lat: r.latitude,
        lng: r.longitude,
        severity: r.severity,
        label: r.wasteType?.replace(/_/g, ' ') || 'Waste Report',
        id: r.id,
      }));
  }, [filteredReports]);

  const vehicleMarkers = useMemo(() => {
    return vehicles
      .filter((v) => validCoord(v.latitude) && validCoord(v.longitude))
      .map((v) => ({
        latitude: v.latitude,
        longitude: v.longitude,
        name: v.name || v.id,
        status: v.status,
        assignedArea: v.assignedArea,
      }));
  }, [vehicles]);

  const handleMapReady = useCallback((map) => {
    mapInstanceRef.current = map;
  }, []);

  const handleMarkerClick = useCallback((marker) => {
    const report = filteredReports.find((r) => r.id === marker.id);
    if (report) {
      setSelectedReport(report);
      setSheetOpen(false);
    }
  }, [filteredReports]);

  const handleSheetItemTap = useCallback((report) => {
    if (report.latitude && report.longitude && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([report.latitude, report.longitude], 16, { duration: 0.5 });
    }
    setSelectedReport(report);
  }, []);

  const handleRecenter = useCallback(() => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([userLocation.lat, userLocation.lng], 15, { duration: 0.5 });
    }
  }, [userLocation]);

  const handleEnableLocation = useCallback(() => {
    setLocationStatus('locating');
    let settled = false;
    const tid = setTimeout(function () {
      if (!settled) { settled = true; setLocationStatus('timeout'); }
    }, 12000);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        if (!settled) {
          settled = true;
          clearTimeout(tid);
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          hasCenteredOnInitialLocation.current = true;
          setLocationStatus('tracking');
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([loc.lat, loc.lng], 15, { duration: 0.5 });
          }
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(tid);
          if (err.code === 1) setLocationStatus('denied');
          else setLocationStatus('unavailable');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.changedTouches[0].screenY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const deltaY = e.changedTouches[0].screenY - touchStartY.current;
    if (deltaY > 80) setSheetOpen(false);
  }, []);

  const handleNavigateTracking = useCallback((reportId) => {
    setSheetOpen(false);
    setSelectedReport(null);
    navigate('/tracking', { state: { reportId } });
  }, [navigate]);

  const report = selectedReport;
  const reportLat = report?.latitude;
  const reportLng = report?.longitude;
  const distKm = userLocation && reportLat && reportLng
    ? haversineDistance(userLocation.lat, userLocation.lng, reportLat, reportLng)
    : null;

  const locationDenied = locationStatus === 'denied' || locationStatus === 'unavailable' || locationStatus === 'timeout';
  const locationUnsupported = locationStatus === 'unsupported';
  const mapCenter = userLocation || DEFAULT_CENTER;

  return (
    <div className="bg-background h-screen w-full relative overflow-hidden flex flex-col">

      {locationDenied && !userLocation && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <div className="text-center px-8 max-w-sm">
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
              <span className="material-symbols-outlined text-red-400 text-[40px]">location_off</span>
            </div>
            <h3 className="text-[18px] font-extrabold text-gray-900 mb-2">Location access required</h3>
            <p className="text-[13px] text-gray-500 font-medium mb-6 leading-relaxed">
              SwachhLens needs your location to show nearby waste hotspots and track cleanup vehicles on the map.
            </p>
            <button
              onClick={handleEnableLocation}
              className="w-full py-3.5 bg-primary text-white rounded-2xl text-[14px] font-bold active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
            >
              Enable Location
            </button>
            <button
              onClick={() => setLocationStatus('idle')}
              className="w-full py-3 text-gray-400 text-[13px] font-semibold mt-2"
            >
              Use without location
            </button>
          </div>
        </div>
      )}

      {locationUnsupported && !userLocation && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <div className="text-center px-8 max-w-sm">
            <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
              <span className="material-symbols-outlined text-amber-400 text-[40px]">warning</span>
            </div>
            <h3 className="text-[18px] font-extrabold text-gray-900 mb-2">GPS not available</h3>
            <p className="text-[13px] text-gray-500 font-medium mb-6 leading-relaxed">
              Your browser does not support geolocation. You can still view waste hotspots but distances will not be shown.
            </p>
            <button
              onClick={() => setLocationStatus('idle')}
              className="w-full py-3.5 bg-primary text-white rounded-2xl text-[14px] font-bold active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-0">
        <GoogleMap
          center={mapCenter}
          zoom={14}
          markers={mapMarkers}
          userLocation={userLocation}
          vehicles={vehicleMarkers}
          onMarkerClick={handleMarkerClick}
          onMapClick={() => setSelectedReport(null)}
          onMapReady={handleMapReady}
          className="w-full h-full"
        />
      </div>

      <div className="relative z-10 pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="px-4 pt-3 pb-1 flex flex-col gap-3">
          <div className="flex items-center gap-2.5 pointer-events-auto">
            <div className="flex-1 flex items-center bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg px-4 py-3 border border-black/[0.04]">
              <span className="material-symbols-outlined text-gray-400 mr-3 text-[20px]">search</span>
              <input
                className="bg-transparent border-none outline-none text-[14px] text-gray-900 placeholder:text-gray-400 w-full font-medium"
                placeholder="Search waste hotspots..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="ml-1 p-1">
                  <span className="material-symbols-outlined text-gray-400 text-[18px]">close</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 hide-scrollbar pointer-events-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`flex-shrink-0 px-4 py-2 rounded-2xl text-[13px] font-bold transition-all duration-200 active:scale-95 border ${
                  activeFilter === f.key
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                    : 'bg-white/95 backdrop-blur text-gray-600 border-gray-100 hover:bg-white shadow-sm'
                }`}
              >
                {f.key !== 'all' && (
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: activeFilter === f.key ? '#fff' : f.color }}
                  />
                )}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute left-4 top-[130px] z-10 pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg px-3.5 py-2.5 border border-black/[0.04] flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_fire_department
          </span>
          <div className="flex flex-col">
            <span className="text-[12px] font-extrabold text-gray-900 leading-none">{filteredReports.length}</span>
            <span className="text-[10px] text-gray-500 font-medium leading-tight">hotspots</span>
          </div>
        </div>
      </div>

      <div className="absolute right-4 top-[130px] z-10 pointer-events-auto flex flex-col gap-2">
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg active:scale-95 transition-all border border-black/[0.04]"
        >
          <span className="material-symbols-outlined text-gray-600 text-[20px]">add</span>
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg active:scale-95 transition-all border border-black/[0.04]"
        >
          <span className="material-symbols-outlined text-gray-600 text-[20px]">remove</span>
        </button>
        <div className="h-1" />
        <button
          onClick={handleRecenter}
          className="w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg active:scale-95 transition-all border border-black/[0.04]"
          disabled={!userLocation}
          title={!userLocation ? 'Location not available' : 'Locate me'}
        >
          <span className={`material-symbols-outlined text-[20px] ${userLocation ? 'text-primary' : 'text-gray-300'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
            my_location
          </span>
        </button>
      </div>

      {report && reportLat && reportLng && (
        <div className="absolute left-0 right-0 bottom-[148px] z-20 px-4 pointer-events-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-start gap-3 p-3.5">
              <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                {report.image ? (
                  <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${report.image}')` }} />
                ) : (
                  <span className="material-symbols-outlined text-gray-300 text-[28px]">photo</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border ${SEVERITY_BG[report.severity] || 'bg-gray-50 border-gray-200'} ${SEVERITY_TEXT[report.severity] || 'text-gray-600'}`}>
                    {report.severity}
                  </span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${STATUS_CHIP[report.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[report.status] || report.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <h4 className="text-[14px] font-bold text-gray-900 truncate">
                  {(report.wasteType || 'Waste Report').replace(/_/g, ' ')}
                </h4>
                <div className="flex items-center gap-3 mt-0.5">
                  {distKm != null && (
                    <span className="text-[11px] text-gray-500 font-medium flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[12px]">near_me</span>
                      {formatDistance(distKm)}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-500 font-medium flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    {formatTimeAgo(report.timestamp || report.createdAt)}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedReport(null)} className="p-1 shrink-0">
                <span className="material-symbols-outlined text-gray-400 text-[18px]">close</span>
              </button>
            </div>
            <button
              onClick={() => handleNavigateTracking(report.id)}
              className="w-full py-2.5 bg-primary/5 text-primary text-[13px] font-bold border-t border-gray-100 active:bg-primary/10 transition-colors"
            >
              View Details
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`absolute bottom-[68px] left-0 w-full bg-white rounded-t-[28px] shadow-[0_-8px_32px_rgba(0,0,0,0.12)] z-30 transition-transform duration-300 ease-out flex flex-col ${
          sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-80px)]'
        }`}
        style={{ maxHeight: '60vh' }}
      >
        <div
          className="w-full flex flex-col items-center pt-3 pb-2 cursor-pointer shrink-0"
          onClick={() => setSheetOpen(!sheetOpen)}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full mb-2" />
          <div className="flex items-center justify-between w-full px-5">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[16px] font-extrabold text-gray-900">Nearby Hotspots</h3>
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-bold rounded-lg">
                {filteredReports.length}
              </span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-[20px]">
              {sheetOpen ? 'expand_more' : 'expand_less'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-gray-300 text-[32px]">map</span>
              </div>
              <p className="text-[15px] font-bold text-gray-400 mb-1">No hotspots found</p>
              <p className="text-[13px] text-gray-300 font-medium">
                {activeFilter !== 'all' || searchQuery ? 'Try a different filter or search' : 'Reports will appear here'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredReports.map((r) => {
                const sev = r.severity || 'medium';
                const rLat = r.latitude;
                const rLng = r.longitude;
                const dist = userLocation && rLat && rLng
                  ? haversineDistance(userLocation.lat, userLocation.lng, rLat, rLng)
                  : null;
                return (
                  <button
                    key={r.id}
                    onClick={() => handleSheetItemTap(r)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex items-center gap-3 active:scale-[0.98] transition-all duration-150 text-left w-full"
                  >
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                        {r.image ? (
                          <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${r.image}')` }} />
                        ) : (
                          <span className="material-symbols-outlined text-gray-300 text-[22px]">photo</span>
                        )}
                      </div>
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: SEVERITY_COLORS[sev] || '#6b7280' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border ${SEVERITY_BG[sev]} ${SEVERITY_TEXT[sev]}`}>
                          {sev}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${STATUS_CHIP[r.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[r.status] || r.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h4 className="text-[14px] font-bold text-gray-900 truncate">
                        {(r.wasteType || 'Waste Report').replace(/_/g, ' ')}
                      </h4>
                      <div className="flex items-center gap-3 mt-0.5">
                        {dist != null && (
                          <span className="text-[11px] text-gray-500 font-medium flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[12px]">near_me</span>
                            {formatDistance(dist)}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-500 font-medium flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">schedule</span>
                          {formatTimeAgo(r.timestamp || r.createdAt)}
                        </span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-gray-300 text-[18px] shrink-0">chevron_right</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BottomNav active="explore" />

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function validCoord(val) {
  if (val == null) return false;
  const n = Number(val);
  return Number.isFinite(n) && Math.abs(n) <= 180;
}
