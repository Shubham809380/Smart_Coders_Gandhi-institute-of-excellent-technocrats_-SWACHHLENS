import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportService, permissionService } from '../../services.js';

export default function CaptureWaste() {
  const navigate = useNavigate();
  const [flashVisible, setFlashVisible] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [preview, setPreview] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualError, setManualError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  // Video uploads: the poster frame feeds the AI, the clip rides along to the report.
  const [videoClip, setVideoClip] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    startCamera();
    getLocation();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    // A fresh stream always starts with the torch off — keep the button honest.
    setTorchOn(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
      const track = stream.getVideoTracks?.()[0];
      if (track && typeof track.getCapabilities === 'function' && track.getCapabilities().torch) {
        setTorchSupported(true);
      } else {
        setTorchSupported(false);
      }
    } catch {
      setCameraError('Camera access denied. Use gallery to upload a photo or a short video.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Constraint rejected — the device lied about torch support.
      setTorchSupported(false);
      setTorchOn(false);
    }
  };

  const getLocation = async () => {
    setLocationLoading(true);
    const result = await permissionService.requestLocation();
    if (result.location) {
      setLocation(result.location);
    } else {
      setShowManualLocation(true);
    }
    setLocationLoading(false);
  };

  const applyManualLocation = () => {
    setManualError('');
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) { setManualError('Latitude must be between -90 and 90.'); return; }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) { setManualError('Longitude must be between -180 and 180.'); return; }
    setLocation({
      latitude: lat,
      longitude: lng,
      timestamp: new Date().toISOString(),
      // Left blank on purpose — the backend reverse-geocodes coordinates on submit.
      address: '',
      source: 'manual',
    });
    setShowManualLocation(false);
  };

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const maxDim = 1024;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.75);
  }, []);

  const handleShutterClick = () => {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    if (navigator.vibrate) navigator.vibrate(50);
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 120);
    setPreview(dataUrl);
    stopCamera();
  };

  const handleConfirm = async () => {
    if (!preview) return;
    if (!location) return;
    await reportService.updateDraft({
      image: preview,
      video: videoClip || '',
      mediaType: videoClip ? 'video' : 'image',
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        // Empty address => backend reverse-geocodes coordinates on submit.
        address: location.address || '',
        source: location.source || 'gps',
      },
    });
    navigate('/analyzing');
  };

  const handleRetake = () => {
    setPreview(null);
    setVideoClip('');
    startCamera();
  };

  // Short clips (3-10s) are fine; anything bigger would blow past the server's
  // upload body limit once base64-inflated, so stop it here with a clear reason.
  const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });

  // Pulls one representative frame out of a clip — the AI pipeline is
  // image-based, so this poster does the analysis while the clip is attached.
  const extractVideoFrame = (videoDataUrl) => new Promise((resolve, reject) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.playsInline = true;
    el.src = videoDataUrl;
    const cleanup = () => { el.onloadedmetadata = null; el.onseeked = null; el.onerror = null; el.src = ''; };
    el.onloadedmetadata = () => {
      try {
        el.currentTime = Math.min(1, Math.max(0.1, (el.duration || 1) / 2));
      } catch {
        resolve(null);
      }
    };
    el.onseeked = () => {
      try {
        const maxDim = 1024;
        let w = el.videoWidth;
        let h = el.videoHeight;
        if (!w || !h) { cleanup(); resolve(null); return; }
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(el, 0, 0, w, h);
        cleanup();
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      } catch {
        cleanup();
        resolve(null);
      }
    };
    el.onerror = () => { cleanup(); reject(new Error('This video format is not supported. Please use an MP4 clip.')); };
  });

  const handleGallerySelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.type.startsWith('video/')) {
      if (file.size > MAX_VIDEO_BYTES) {
        alert('Video is too large. Please choose a short clip (3-4 seconds, under 8MB).');
        return;
      }
      try {
        const videoDataUrl = await readAsDataUrl(file);
        const frame = await extractVideoFrame(videoDataUrl);
        if (!frame) {
          // The AI pipeline is image-based — without a usable frame we can't analyze.
          alert('Could not read this video. Please use an MP4 clip or take a photo.');
          return;
        }
        setVideoClip(videoDataUrl);
        setPreview(frame);
        stopCamera();
      } catch (err) {
        setVideoClip('');
        alert(err.message || 'Could not read this video. Please try another file.');
      }
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image is too large. Please select an image under 10MB.');
      return;
    }
    try {
      const imageDataUrl = await readAsDataUrl(file);
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setPreview(canvas.toDataURL('image/jpeg', 0.75));
        setVideoClip('');
        stopCamera();
      };
      img.onerror = () => alert('Could not read this image. Please try another file.');
      img.src = imageDataUrl;
    } catch {
      alert('Could not read this image. Please try another file.');
    }
  };

  return (
    <div className="bg-background min-h-screen">
      <header className="fixed top-0 w-full z-50 bg-white/88" style={{ backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
        <div className="h-16 px-4 flex items-center gap-3 pt-safe">
          <button onClick={() => { stopCamera(); navigate(-1); }} className="w-10 h-10 -ml-2 flex items-center justify-center rounded-xl active:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-on-surface text-[22px]">arrow_back</span>
          </button>
          <h1 className="text-[18px] font-bold text-on-surface">Report Waste</h1>
        </div>
      </header>

      <main className="relative w-full pt-16 min-h-screen flex flex-col">
        <div className="px-4 pb-3 pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#515c71] tracking-wide uppercase">Step 1 of 3</span>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-[3px] bg-primary rounded-full" />
              <div className="w-8 h-[3px] bg-surface-container-highest rounded-full" />
              <div className="w-8 h-[3px] bg-surface-container-highest rounded-full" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-bold text-on-background">Capture the Waste</h2>
            <p className="text-[14px] text-on-surface-variant">Keep the complete waste area visible.</p>
          </div>
        </div>

        <div className="relative flex-1 mx-4 mb-4 rounded-3xl overflow-hidden bg-black shadow-lg min-h-[320px]" style={{ boxShadow: '0 12px 40px -8px rgba(0,0,0,0.25)' }}>
          {preview ? (
            <>
              {videoClip ? (
                <video className="absolute inset-0 w-full h-full object-contain bg-black" src={videoClip} controls playsInline />
              ) : (
                <img className="absolute inset-0 w-full h-full object-cover" src={preview} alt="Captured waste" />
              )}
              {videoClip && (
                <span className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/55 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-white">
                  <span className="material-symbols-outlined text-[13px]">videocam</span>
                  Video attached
                </span>
              )}
            </>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container-highest gap-5 z-10">
                  <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant text-[32px]">photo_camera</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-on-surface-variant text-[14px] text-center px-10 font-medium">{cameraError}</p>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-primary text-on-primary px-6 py-2.5 rounded-2xl text-[14px] font-bold shadow-md active:scale-95 transition-transform">
                      Choose from Gallery
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />

          {flashVisible && (
            <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-[fadeOut_300ms_ease-out_forwards]" style={{ animation: 'fadeOut 300ms ease-out forwards' }} />
          )}

          {!preview && cameraReady && (
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div className="relative w-52 h-52">
                <div className="absolute top-0 left-0 w-10 h-10 rounded-tl-2xl border-t-[3px] border-l-[3px] border-cyan-400/80" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.5))' }} />
                <div className="absolute top-0 right-0 w-10 h-10 rounded-tr-2xl border-t-[3px] border-r-[3px] border-cyan-400/80" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.5))' }} />
                <div className="absolute bottom-0 left-0 w-10 h-10 rounded-bl-2xl border-b-[3px] border-l-[3px] border-cyan-400/80" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.5))' }} />
                <div className="absolute bottom-0 right-0 w-10 h-10 rounded-br-2xl border-b-[3px] border-r-[3px] border-cyan-400/80" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.5))' }} />
              </div>
            </div>
          )}

          {!preview && (
            <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
              <button
                onClick={() => (location ? undefined : setShowManualLocation(true))}
                className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3.5 py-2 rounded-2xl pointer-events-auto"
              >
                <span className={`material-symbols-outlined text-[16px] ${location ? 'text-green-400' : 'text-amber-300'}`} style={{ fontVariationSettings: "'FILL' 1" }}>{location ? 'location_on' : 'location_off'}</span>
                <span className="text-[12px] font-bold text-white">
                  {locationLoading ? 'Detecting...' : location ? (location.source === 'manual' ? 'Pinned location' : 'Location detected') : 'Set location'}
                </span>
              </button>
              {location && location.source === 'manual' && (
                <button onClick={() => setShowManualLocation(true)} className="bg-black/40 backdrop-blur-md px-3 py-2 rounded-2xl pointer-events-auto text-[11px] font-bold text-white">Edit pin</button>
              )}
            </div>
          )}

          {!preview && (
            <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-center pointer-events-none">
              <div className="bg-black/50 backdrop-blur-md text-white/90 px-4 py-3 rounded-2xl flex items-start gap-3 max-w-sm">
                <span className="material-symbols-outlined text-[18px] text-cyan-300 mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
                <p className="text-[12px] font-medium leading-relaxed">Include nearby objects to help AI estimate size.</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface pb-safe z-20 relative" style={{ boxShadow: '0 -4px 20px -4px rgba(0,0,0,0.06)', borderRadius: '24px 24px 0 0' }}>
          {!preview ? (
            <div className="flex items-center justify-between px-6 py-6 pb-8">
              <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-surface-container hover:bg-surface-container-high transition-all active:scale-90 shadow-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>photo_library</span>
              </button>
              <button onClick={handleShutterClick} className="relative w-[72px] h-[72px] flex items-center justify-center rounded-full group active:scale-90 transition-transform duration-150">
                <div className="absolute inset-0 rounded-full border-[3px] border-surface-container-highest" />
                <div className="w-[60px] h-[60px] rounded-full transition-all duration-200 group-hover:scale-105" style={{ background: 'linear-gradient(135deg, #006b2c, #06b6d4)', boxShadow: '0 4px 16px rgba(0,107,44,0.35)' }} />
              </button>
              {torchSupported ? (
                <button onClick={toggleTorch} className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all active:scale-90 shadow-sm ${torchOn ? 'bg-primary text-white' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined text-[22px]">{torchOn ? 'flash_on' : 'flash_off'}</span>
                </button>
              ) : (
                <div className="w-12 h-12" />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-4 pb-8">
              <button onClick={handleRetake} className="flex-1 bg-surface-container-high text-on-surface text-[14px] font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:bg-surface-variant transition-colors">
                <span className="material-symbols-outlined text-[20px]">replay</span>
                Retake
              </button>
              <button
                onClick={handleConfirm}
                disabled={!location}
                className="flex-1 text-white text-[14px] font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
                style={{ background: location ? 'linear-gradient(135deg, #006b2c, #06b6d4)' : '#9ca3af', boxShadow: location ? '0 8px 24px -4px rgba(0,107,44,0.35)' : 'none' }}
              >
                {location ? (
                  <>
                    Analyze with AI
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">location_off</span>
                    Location required
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleGallerySelect} />

      {showManualLocation && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !location && setShowManualLocation(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-safe shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-11 h-11 rounded-2xl bg-surface-container flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[24px]">location_on</span>
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-on-surface">Set report location</h3>
                <p className="text-[12px] text-on-surface-variant">GPS unavailable — enter coordinates manually.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#515c71] uppercase tracking-wide">Latitude</span>
                <input
                  type="number" step="any" inputMode="decimal" value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)} placeholder="e.g. 20.2961"
                  className="px-4 py-3 rounded-2xl bg-surface-container text-[15px] font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#515c71] uppercase tracking-wide">Longitude</span>
                <input
                  type="number" step="any" inputMode="decimal" value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)} placeholder="e.g. 85.8245"
                  className="px-4 py-3 rounded-2xl bg-surface-container text-[15px] font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
            </div>
            {manualError && <p className="text-[12px] font-semibold text-red-600 mt-2">{manualError}</p>}
            <div className="flex items-center gap-3 mt-5">
              {!location && (
                <button
                  onClick={getLocation}
                  disabled={locationLoading}
                  className="flex-1 bg-surface-container-high text-on-surface text-[14px] font-bold py-3.5 rounded-2xl active:bg-surface-variant transition-colors disabled:opacity-60"
                >
                  {locationLoading ? 'Detecting…' : 'Retry GPS'}
                </button>
              )}
              <button
                onClick={applyManualLocation}
                className="flex-1 text-white text-[14px] font-bold py-3.5 rounded-2xl active:scale-[0.98] transition-transform"
                style={{ background: 'linear-gradient(135deg, #006b2c, #06b6d4)' }}
              >
                Use this pin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
