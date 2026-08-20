import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { workerService } from "../../services.js";

const volOptions = ["small", "medium", "large", "very_large"];
const volLabels = { small: "Small", medium: "Medium", large: "Large", very_large: "Very Large" };

export default function CompleteCleanup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { reportId } = useParams();
  const [report, setReport] = useState(location.state?.report || null);
  const [step, setStep] = useState(1);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [volume, setVolume] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (report) setVolume(report.estimatedVolume || "medium");
  }, [report]);

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  const handleCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!report || !photoFile) return;
    setSubmitting(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(photoFile);
      });
      await workerService.updateReportStatus(report.id, "verification", { afterImage: dataUrl });
      await workerService.saveReportNotes(report.id, { workerNotes: notes, actualVolume: volume });
      setSubmitted(true);
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6 animate-bounce">
          <span className="material-symbols-outlined text-emerald-600 text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Cleanup Submitted!</h2>
        <p className="text-sm text-gray-500 text-center mb-8">Pending admin verification. You'll be notified once reviewed.</p>
        <button onClick={() => navigate("/worker/home")} className="w-full h-14 rounded-2xl bg-green-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all" style={{ boxShadow: "0 6px 20px -4px rgba(0,107,44,0.4)" }}>
          <span className="material-symbols-outlined text-[20px]">home</span>
          Back to Tasks
        </button>
      </div>
    );
  }

  const stepDots = [1, 2, 3];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="px-4 pt-[env(safe-area-inset-top)] flex items-center h-14">
          <button onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
            <span className="material-symbols-outlined text-gray-700">arrow_back</span>
          </button>
          <div className="flex-1 flex items-center justify-center gap-2">
            {stepDots.map((s) => (
              <div key={s} className={`h-2 rounded-full transition-all ${s === step ? "w-8 bg-green-600" : s < step ? "w-2 bg-green-400" : "w-2 bg-gray-300"}`} />
            ))}
          </div>
          <span className="text-xs font-bold text-gray-400">Step {step}/3</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-6 pb-6">
        {step === 1 && (
          <div className="flex flex-col flex-1">
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">Capture After Photo</h2>
            <p className="text-sm text-gray-500 mb-6">Take a photo of the cleaned area as proof of completion.</p>

            {!photoPreview ? (
              <button onClick={() => fileRef.current?.click()} className="w-full bg-white rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center active:border-green-400 transition-colors">
                <span className="material-symbols-outlined text-gray-300 block mx-auto mb-3" style={{ fontSize: "56px" }}>photo_camera</span>
                <span className="text-base font-bold text-gray-700 block">Tap to Take Photo</span>
                <span className="text-sm text-gray-400 mt-1 block">Camera only — no gallery upload</span>
              </button>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
                <img src={photoPreview} alt="After cleanup" className="w-full aspect-[4/3] object-cover" />
                <button onClick={() => { URL.revokeObjectURL(photoPreview); setPhotoFile(null); setPhotoPreview(null); }} className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-[20px]">close</span>
                </button>
                <div className="absolute bottom-3 left-3 bg-emerald-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-white text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-xs font-bold text-white">Photo Captured</span>
                </div>
              </div>
            )}

            <div className="flex-1" />
            <button disabled={!photoPreview} onClick={() => setStep(2)} className={`w-full h-16 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${photoPreview ? "bg-green-600 text-white shadow-lg" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`} style={photoPreview ? { boxShadow: "0 6px 20px -4px rgba(0,107,44,0.4)" } : {}}>
              Next
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col flex-1">
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">Confirm Details</h2>
            <p className="text-sm text-gray-500 mb-6">Verify the cleanup details before submitting.</p>

            {report?.image && (
              <div className="flex gap-3 mb-5">
                <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 relative">
                  <img src={report.image} alt="Before" className="w-full h-28 object-cover" />
                  <span className="absolute top-2 left-2 bg-black/55 text-[10px] font-bold text-white px-2 py-0.5 rounded">BEFORE</span>
                </div>
                <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 relative">
                  <img src={photoPreview} alt="After" className="w-full h-28 object-cover" />
                  <span className="absolute top-2 left-2 bg-emerald-600/90 text-[10px] font-bold text-white px-2 py-0.5 rounded">AFTER</span>
                </div>
              </div>
            )}

            <label className="text-sm font-bold text-gray-700 mb-2 block">Volume Cleared</label>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {volOptions.map((v) => (
                <button key={v} onClick={() => setVolume(v)} className={`h-12 rounded-xl font-bold text-sm border-2 transition-all ${volume === v ? "bg-green-50 border-green-500 text-green-800" : "bg-white border-gray-200 text-gray-600 active:bg-gray-50"}`}>
                  {volLabels[v]}
                </button>
              ))}
            </div>

            <label className="text-sm font-bold text-gray-700 mb-2 block">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes about the cleanup..." className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none h-24 focus:outline-none focus:border-green-500 bg-white mb-6" />

            <div className="flex gap-3 mt-auto">
              <button onClick={() => setStep(1)} className="flex-1 h-14 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center gap-1 active:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back
              </button>
              <button onClick={() => setStep(3)} className="flex-[2] h-14 rounded-2xl bg-green-600 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-[0.98] transition-all" style={{ boxShadow: "0 6px 20px -4px rgba(0,107,44,0.3)" }}>
                Review <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col flex-1">
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">Review & Submit</h2>
            <p className="text-sm text-gray-500 mb-6">Double-check everything before submitting.</p>

            <div className="flex gap-3 mb-5">
              {report?.image && (
                <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 relative">
                  <img src={report.image} alt="Before" className="w-full h-32 object-cover" />
                  <span className="absolute top-2 left-2 bg-black/55 text-[10px] font-bold text-white px-2 py-0.5 rounded">BEFORE</span>
                </div>
              )}
              <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 relative">
                <img src={photoPreview} alt="After" className="w-full h-32 object-cover" />
                <span className="absolute top-2 left-2 bg-emerald-600/90 text-[10px] font-bold text-white px-2 py-0.5 rounded">AFTER</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Waste Type</span>
                <span className="text-sm font-bold text-gray-800 capitalize">{(report?.wasteType || "other").replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Volume Cleared</span>
                <span className="text-sm font-bold text-gray-800 capitalize">{volLabels[volume]}</span>
              </div>
              {notes && (
                <div className="py-2">
                  <span className="text-sm text-gray-500 block mb-1">Notes</span>
                  <p className="text-sm text-gray-700">{notes}</p>
                </div>
              )}
            </div>

            <div className="flex-1" />

            <div className="flex gap-3 mt-auto">
              <button onClick={() => setStep(2)} className="flex-1 h-14 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center gap-1 active:bg-gray-200 transition-colors">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-[2] h-14 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60" style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 6px 20px -4px rgba(5,150,105,0.4)" }}>
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">send</span>
                    Submit Cleanup
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
    </div>
  );
}
