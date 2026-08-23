import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../../components/BottomNav.jsx";
import { reportService, popSessionExpired } from "../../services.js";
import { formatWasteType } from "../../utils/helpers.js";
import { useLanguage } from "../../contexts/LanguageContext.jsx";

const SEVERITY_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#22c55e",
};

const STATUS_LABELS = {
  submitted: "Reported",
  under_review: "Under Review",
  assigned: "Assigned",
  en_route: "En Route",
  cleanup_in_progress: "Cleaning",
  verification: "Verifying",
  resolved: "Resolved",
  rejected: "Rejected",
};

const STATUS_COLORS = {
  submitted: "bg-gray-100 text-gray-600",
  under_review: "bg-amber-50 text-amber-600",
  assigned: "bg-blue-50 text-blue-600",
  en_route: "bg-blue-50 text-blue-600",
  cleanup_in_progress: "bg-blue-50 text-blue-600",
  verification: "bg-purple-50 text-purple-600",
  resolved: "bg-green-50 text-green-600",
  rejected: "bg-red-50 text-red-600",
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function MyReports() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [editComment, setEditComment] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (popSessionExpired()) setSessionExpired(true);
    reportService
      .getReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const activeReports = reports.filter(
    (r) => r.status !== "resolved" && r.status !== "rejected"
  );
  const resolvedReports = reports.filter(
    (r) => r.status === "resolved"
  );
  const displayReports = activeTab === "active" ? activeReports : resolvedReports;

  const handleEdit = (report) => {
    setEditComment(report.comment || report.citizenComment || "");
    setEditModal(report);
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    setEditSaving(true);
    try {
      const updated = await reportService.updateReport(editModal.id, { comment: editComment });
      setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setEditModal(null);
      showToast("Report updated successfully");
    } catch (err) {
      showToast(err.message || "Failed to update");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await reportService.deleteReport(deleteConfirm.id);
      setReports((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      showToast("Report deleted");
    } catch (err) {
      showToast(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-background min-h-screen max-w-lg mx-auto pb-24 landscape:min-h-0 landscape:h-auto landscape:pb-16">
      {sessionExpired && (
        <div className="mx-4 mt-3 flex items-start gap-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-4 py-3">
          <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">schedule</span>
          <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Your session has expired. Please log in again.</span>
        </div>
      )}

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm font-bold max-w-[85vw]">
          {toast}
        </div>
      )}

      <main className="relative w-full flex flex-col px-4 pt-safe landscape:px-8 landscape:pt-4">
        <div className="flex items-center justify-between pt-3 mb-4">
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">
            {t("myReports")}
          </h1>
          <span className="px-2.5 py-1 bg-primary/10 text-primary text-[12px] font-bold rounded-lg">
            {t("quickTotalCount", { n: reports.length })}
          </span>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all border ${
              activeTab === "active"
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-100"
            }`}
          >
            Active ({activeReports.length})
          </button>
          <button
            onClick={() => setActiveTab("resolved")}
            className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all border ${
              activeTab === "resolved"
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-100"
            }`}
          >
            Resolved ({resolvedReports.length})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-gray-300 text-[32px]">assignment</span>
            </div>
            <p className="text-[15px] font-bold text-gray-400 mb-1">
              {activeTab === "active" ? t("noActiveReports") : t("noResolvedReports")}
            </p>
            <p className="text-[13px] text-gray-300 font-medium">
              {activeTab === "active" ? "Submit a waste report to get started" : "Resolved reports will appear here"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 landscape:grid landscape:grid-cols-2 landscape:gap-4">
            {displayReports.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 active:scale-[0.98] transition-all duration-150 text-left w-full">
                <button
                  onClick={() => navigate("/tracking", { state: { reportId: r.id } })}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                      {r.image ? (
                        <div
                          className="w-full h-full bg-cover bg-center"
                          style={{ backgroundImage: `url('${r.image}')` }}
                        />
                      ) : (
                        <span className="material-symbols-outlined text-gray-300 text-[24px]">photo</span>
                      )}
                    </div>
                    <div
                      className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                      style={{ backgroundColor: SEVERITY_COLORS[r.severity] || "#6b7280" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                          STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STATUS_LABELS[r.status] || r.status?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <h4 className="text-[14px] font-bold text-gray-900 truncate">
                        {formatWasteType(r.wasteType)}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-500 font-medium flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {formatTimeAgo(r.createdAt || r.timestamp)}
                      </span>
                      {r.address && (
                        <span className="text-[11px] text-gray-400 font-medium truncate max-w-[150px]">
                          {r.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-300 text-[18px] shrink-0">
                    chevron_right
                  </span>
                </button>

                {r.status === "submitted" && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(r); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                      title="Edit comment"
                    >
                      <span className="material-symbols-outlined text-[18px] text-gray-400">edit</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(r); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete report"
                    >
                      <span className="material-symbols-outlined text-[18px] text-red-400">delete</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav active="reports" />

      {editModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] animate-[slideUp_0.2s_ease]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-gray-900">Edit Report</h3>
              <button onClick={() => setEditModal(null)} className="p-1 rounded-full hover:bg-gray-100">
                <span className="material-symbols-outlined text-gray-400">close</span>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
                        {formatWasteType(editModal.wasteType)} - {editModal.id}
            </p>
            <textarea
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
              placeholder="Add or update your comment..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setEditModal(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 animate-[scaleIn_0.2s_ease]">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500 text-[24px]">delete_forever</span>
            </div>
            <h3 className="text-lg font-extrabold text-gray-900 text-center mb-2">Delete Report?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              This will permanently delete report <span className="font-bold">{deleteConfirm.id}</span>. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
