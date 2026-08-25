// Camera photos are 3-8MB raw — far past Vercel's request limits and slow to
// upload on mobile data. Downscale+re-encode before anything leaves the device.
export function fileToCompressedDataUrl(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("No photo selected.")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the captured photo."));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not process the captured photo."));
      img.onload = () => {
        try {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (err) {
          reject(new Error("Could not compress the captured photo."));
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function haversineKm(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad((b.latitude || b.lat) - (a.latitude || a.lat));
  const dLon = toRad((b.longitude || b.lng) - (a.longitude || a.lng));
  const lat1 = toRad(a.latitude || a.lat);
  const lat2 = toRad(b.latitude || b.lat);
  return R * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2));
}

export function timeSince(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Human-readable waste classification: "mixed_trash"/"other" → "Mixed Waste",
// "plastic_waste" → "Plastic Waste", etc.
export function formatWasteType(wasteType) {
  const raw = String(wasteType || '').replace(/_/g, ' ').trim();
  if (!raw) return 'Waste';
  if (raw.toLowerCase() === 'other') return 'Mixed Waste';
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Full date/time for a timestamp, e.g. "23 Aug 2026, 04:12 pm".
export function formatDateTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return '';
  }
}
