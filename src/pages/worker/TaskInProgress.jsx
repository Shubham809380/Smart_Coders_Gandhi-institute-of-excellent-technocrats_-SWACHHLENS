import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { reportService } from "../../services.js";
import { fileToCompressedDataUrl } from "../../utils/helpers.js";
import SafeImage from "../../components/SafeImage.jsx";

export default function TaskInProgress() {
  const navigate = useNavigate();
  const location = useLocation();
  const report = location.state?.report || {};
  const [elapsed, setElapsed] = useState(0);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const formatTime = (totalSeconds) => {
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const handleAfterPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    const url = URL.createObjectURL(file);
    setPhotoFile(file);
    setPhotoPreview(url);
    e.target.value = "";
  };

  const removePhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleComplete = async () => {
    if (!report.id || !photoFile) return;
    setUploading(true);
    setSubmitError("");
    try {
      // Compress on-device first: raw camera photos (3-8MB) inflate past the
      // server's request body limit as base64 and the upload silently dies.
      const dataUrl = await fileToCompressedDataUrl(photoFile);
      await reportService.updateReportStatus(report.id, "verification", {
        afterImage: dataUrl,
      });
      navigate("/worker/tasks");
    } catch (err) {
      console.error("Failed to complete task:", err);
      setSubmitError(err?.message || "Upload failed. Check your connection and try again.");
      setUploading(false);
    }
  };

  const isHazardous =
    report.severity === "critical" ||
    report.wasteType === "hazardous_waste" ||
    report.wasteType === "e_waste";

  const recommendation = report.recommendation || "Follow standard cleanup procedures.";

  const steps = [
    recommendation,
    "Document the cleaned area with before and after photos.",
    "Segregate waste into appropriate bins before transport.",
    "Confirm the site is safe and clear of debris.",
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div
        className="sticky top-0 z-30"
        style={{
          background: "linear-gradient(135deg, #006b2c, #00a843)",
          boxShadow: "0 4px 20px -4px rgba(0,107,44,0.35)",
        }}
      >
        <div className="px-4 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-white">
                arrow_back
              </span>
            </button>
            <span className="text-sm font-bold text-white tracking-wide">
              Cleanup In Progress
            </span>
            <span className="text-xs font-extrabold text-white/80 font-mono tracking-widest">
              {formatTime(elapsed)}
            </span>
          </div>
        </div>
      </div>

      {isHazardous && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 items-start relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #dc2626 0, #dc2626 1px, transparent 1px, transparent 8px)",
            }}
          />
          <span
            className="material-symbols-outlined text-red-500 shrink-0 relative z-10"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            warning
          </span>
          <div className="flex flex-col gap-0.5 relative z-10">
            <span className="text-sm font-bold text-red-800">
              Hazardous Materials Detected
            </span>
            <span className="text-xs text-red-600 leading-relaxed">
              Requires Level B PPE. Handle with extreme care. Follow the AI
              disposal plan below strictly.
            </span>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 items-start">
          <span
            className="material-symbols-outlined text-red-500 shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            error
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-red-800">
              Could not upload the after photo
            </span>
            <span className="text-xs text-red-600 leading-relaxed">
              {submitError} Your progress is saved — pick the photo again and retry.
            </span>
          </div>
        </div>
      )}

      <div className="px-4 mt-5 flex-1 pb-4 flex flex-col gap-5">
        {report.image && (
          <div>
            <h2 className="text-base font-extrabold text-on-surface mb-3">
              Reference: Initial State
            </h2>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <SafeImage
                className="w-full h-full object-cover"
                alt="Before cleanup"
                src={report.image}
              />
              <div className="absolute top-3 left-3 bg-black/55 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                <span className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                  Before
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="material-symbols-outlined text-emerald-600"
              style={{ fontVariationSettings: "'FILL' 1", fontSize: "20px" }}
            >
              auto_awesome
            </span>
            <h3 className="text-sm font-bold text-emerald-700">
              AI Disposal Plan
            </h3>
          </div>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-extrabold text-emerald-700">
                    {i + 1}
                  </span>
                </div>
                <span className="text-sm text-on-surface-variant leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h2 className="text-base font-extrabold text-on-surface mb-3">
            After Photo
          </h2>
          {!photoPreview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 p-8 text-center active:border-emerald-300 transition-colors"
            >
              <span className="material-symbols-outlined text-gray-300 block mx-auto mb-3">
                photo_camera
              </span>
              <span className="text-sm font-bold text-on-surface block">
                Upload After Photo
              </span>
              <span className="text-xs text-on-surface-variant mt-1 block">
                Tap to take or choose a photo
              </span>
            </button>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-gray-100">
                <img
                  className="w-full h-full object-cover"
                  alt="After cleanup"
                  src={photoPreview}
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-bold text-on-surface truncate">
                  {photoFile?.name || "after_cleanup.jpg"}
                </span>
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "14px",
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    check_circle
                  </span>
                  Verified
                </span>
              </div>
              <button
                onClick={removePhoto}
                className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 active:bg-gray-200 transition-colors"
              >
                <span
                  className="material-symbols-outlined text-gray-500"
                  style={{ fontSize: "18px" }}
                >
                  close
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-6 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button
          disabled={!photoPreview || uploading}
          onClick={handleComplete}
          className={`w-full h-14 rounded-2xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
            photoPreview && !uploading
              ? "text-white cursor-pointer active:scale-[0.98]"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
          style={
            photoPreview && !uploading
              ? {
                  background: "linear-gradient(135deg, #006b2c, #00a843)",
                  boxShadow: "0 6px 20px -4px rgba(0,107,44,0.35)",
                }
              : {}
          }
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Completing...
            </>
          ) : (
            <>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "20px" }}
              >
                check_circle
              </span>
              Mark as Completed
            </>
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleAfterPhoto}
      />
    </div>
  );
}
