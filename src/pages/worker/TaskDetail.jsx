import { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { workerService, reportService } from "../../services.js";

const statusAction = {
  assigned: { label: "Accept Task", nextStatus: "en_route", color: "bg-green-600", shadow: "0 6px 20px -4px rgba(0,107,44,0.4)" },
  en_route: { label: "Start Cleanup", nextStatus: "cleanup_in_progress", color: "bg-blue-600", shadow: "0 6px 20px -4px rgba(37,99,235,0.4)" },
  cleanup_in_progress: { label: "Complete Cleanup", nextStatus: null, color: "bg-emerald-600", shadow: "0 6px 20px -4px rgba(5,150,105,0.4)" },
};

const issueOptions = [
  "Waste already cleared",
  "Location inaccessible",
  "Needs bigger team",
  "Safety hazard present",
  "Other",
];

export default function TaskDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { reportId } = useParams();
  const [report, setReport] = useState(location.state?.report || null);
  const [loading, setLoading] = useState(!location.state?.report);
  const [actionLoading, setActionLoading] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueReason, setIssueReason] = useState("");
  const [issueOtherText, setIssueOtherText] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!report && reportId) {
      reportService.getReportById(reportId).then((r) => { setReport(r); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [report, reportId]);

  const handleAction = async () => {
    if (!report) return;
    const action = statusAction[report.status];
    if (!action) return;

    if (action.nextStatus) {
      setActionLoading(true);
      try {
        const updated = await workerService.updateReportStatus(report.id, action.nextStatus);
        setReport(updated);
        setToast(`${action.label} successful!`);
        setTimeout(() => setToast(""), 2000);
      } catch (e) { console.error(e); }
      setActionLoading(false);
    } else {
      navigate(`/worker/complete/${report.id}`, { state: { report } });
    }
  };

  const handleReportIssue = async () => {
    const finalReason = issueReason === "Other" ? issueOtherText.trim() : issueReason;
    if (!finalReason || !report) return;
    setIssueSubmitting(true);
    try {
      await workerService.reportIssue(report.id, finalReason);
      setShowIssueModal(false);
      setIssueReason(""); setIssueOtherText("");
      setToast("Issue reported to admin");
      setTimeout(() => { navigate(-1); }, 1500);
    } catch (e) { console.error(e); }
    setIssueSubmitting(false);
  };

  const openMaps = () => {
    if (report?.latitude && report?.longitude) {
      window.open(`https://www.google.com/maps?q=${report.latitude},${report.longitude}`, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-4">
        <span className="material-symbols-outlined text-[48px] text-gray-300">error</span>
        <p className="text-gray-400 font-bold">Task not found</p>
        <button onClick={() => navigate(-1)} className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold">Go Back</button>
      </div>
    );
  }

  const action = statusAction[report.status];
  const isHazardous = report.severity === "critical" || report.wasteType === "hazardous_waste" || report.wasteType === "e_waste";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="px-4 pt-[env(safe-area-inset-top)] flex items-center h-14">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
            <span className="material-symbols-outlined text-gray-700">arrow_back</span>
          </button>
          <div className="flex-1 text-center">
            <span className="text-sm font-bold text-gray-900">Task Detail</span>
          </div>
          <span className="text-[11px] font-bold text-gray-400">{report.id?.slice(-8)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {report.image ? (
          <div className="relative w-full aspect-video bg-gray-100">
            <img src={report.image} alt="" className="w-full h-full object-cover" />
            <div className="absolute top-3 left-3 bg-black/55 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <span className="text-[11px] font-extrabold text-white uppercase">Before</span>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-video bg-gray-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-[40px] text-gray-300">photo</span>
          </div>
        )}

        {isHazardous && (
          <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 items-start">
            <span className="material-symbols-outlined text-red-500 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-red-800">Hazardous Material</span>
              <span className="text-xs text-red-600">Handle with extreme care. Follow safety protocols.</span>
            </div>
          </div>
        )}

        <div className="px-4 mt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-green-600 text-[20px]">location_on</span>
              <span className="text-sm font-bold text-gray-900">Location</span>
            </div>
            <p className="text-sm text-gray-600 mb-3">{report.address || "Unknown location"}</p>
            <button onClick={openMaps} className="w-full h-12 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center gap-2 active:bg-green-100 transition-colors">
              <span className="material-symbols-outlined text-green-700 text-[20px]">map</span>
              <span className="text-sm font-bold text-green-700">Open in Maps</span>
            </button>
          </div>
        </div>

        <div className="px-4 mt-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-green-600 text-[20px]">psychology</span>
              <span className="text-sm font-bold text-gray-900">AI Analysis</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-[11px] font-bold text-gray-400 uppercase">Type</span>
                <p className="text-sm font-bold text-gray-800 capitalize mt-0.5">{(report.wasteType || "other").replace(/_/g, " ")}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-[11px] font-bold text-gray-400 uppercase">Volume</span>
                <p className="text-sm font-bold text-gray-800 capitalize mt-0.5">{(report.estimatedVolume || "medium").replace(/_/g, " ")}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-[11px] font-bold text-gray-400 uppercase">Severity</span>
                <p className={`text-sm font-bold capitalize mt-0.5 ${report.severity === "critical" ? "text-red-600" : report.severity === "high" ? "text-orange-600" : report.severity === "medium" ? "text-amber-600" : "text-emerald-600"}`}>{report.severity || "low"}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <span className="text-[11px] font-bold text-gray-400 uppercase">Confidence</span>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{report.aiConfidence || 0}%</p>
              </div>
            </div>
            {report.recommendation && (
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                <span className="text-[11px] font-bold text-emerald-600 uppercase">Recommendation</span>
                <p className="text-sm text-emerald-800 mt-1 leading-relaxed">{report.recommendation}</p>
              </div>
            )}
          </div>
        </div>

        {report.comment && (
          <div className="px-4 mt-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-gray-500 text-[20px]">chat</span>
                <span className="text-sm font-bold text-gray-900">Citizen Note</span>
              </div>
              <div className="pl-3 border-l-2 border-green-300">
                <p className="text-sm text-gray-600 italic leading-relaxed">{report.comment}</p>
              </div>
            </div>
          </div>
        )}

        {report.statusTimeline && report.statusTimeline.length > 0 && (
          <div className="px-4 mt-3 mb-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <span className="text-sm font-bold text-gray-900 block mb-3">Status Timeline</span>
              <div className="flex flex-col gap-0">
                {report.statusTimeline.map((entry, i) => (
                  <div key={i} className="flex gap-3 relative">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full shrink-0 mt-1 ${i === report.statusTimeline.length - 1 ? "bg-green-600 ring-2 ring-green-200" : "bg-gray-300"}`} />
                      {i < report.statusTimeline.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                    </div>
                    <div className="pb-4">
                      <span className="text-sm font-bold text-gray-800 capitalize">{(entry.status || "").replace(/_/g, " ")}</span>
                      <span className="text-[11px] text-gray-400 block mt-0.5">{new Date(entry.at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)] z-40">
        {action && (
          <button
            onClick={handleAction}
            disabled={actionLoading}
            className="w-full h-16 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: action.nextStatus ? undefined : "linear-gradient(135deg, #059669, #10b981)", boxShadow: action.shadow }}
          >
            {actionLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span className="material-symbols-outlined text-[22px]">{report.status === "assigned" ? "check" : report.status === "en_route" ? "play_arrow" : "task_alt"}</span>
                {action.label}
              </>
            )}
          </button>
        )}
        <button
          onClick={() => setShowIssueModal(true)}
          className="w-full h-12 mt-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center gap-2 active:bg-gray-200 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">flag</span>
          Report Issue
        </button>
      </div>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm font-bold animate-bounce max-w-[85vw]">
          {toast}
        </div>
      )}

      {showIssueModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-gray-900">Report Issue</h3>
              <button onClick={() => setShowIssueModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-gray-500">close</span>
              </button>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {issueOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setIssueReason(opt)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${issueReason === opt ? "bg-green-50 border-2 border-green-500 text-green-800" : "bg-gray-50 border-2 border-transparent text-gray-700 active:bg-gray-100"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {issueReason === "Other" && (
              <textarea
                placeholder="Describe the issue..."
                value={issueOtherText}
                onChange={(e) => setIssueOtherText(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none h-20 mb-4 focus:outline-none focus:border-green-500"
              />
            )}
            <button
              onClick={handleReportIssue}
              disabled={(!issueReason || (issueReason === "Other" && !issueOtherText.trim())) || issueSubmitting}
              className="w-full h-14 rounded-2xl bg-red-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {issueSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Submit Report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
