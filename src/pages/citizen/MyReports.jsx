import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../../components/BottomNav.jsx";
import { reportService } from "../../services.js";

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
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");

  useEffect(() => {
    reportService
      .getReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeReports = reports.filter(
    (r) => r.status !== "resolved" && r.status !== "rejected"
  );
  const resolvedReports = reports.filter(
    (r) => r.status === "resolved"
  );

  const displayReports = activeTab === "active" ? activeReports : resolvedReports;

  return (
    <div className="bg-background min-h-screen max-w-lg mx-auto pb-24">
      <main className="relative w-full flex flex-col px-4 pt-safe">
        <div className="flex items-center justify-between pt-3 mb-4">
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">
            My Reports
          </h1>
          <span className="px-2.5 py-1 bg-primary/10 text-primary text-[12px] font-bold rounded-lg">
            {reports.length} total
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
              {activeTab === "active" ? "No active reports" : "No resolved reports"}
            </p>
            <p className="text-[13px] text-gray-300 font-medium">
              {activeTab === "active" ? "Submit a waste report to get started" : "Resolved reports will appear here"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {displayReports.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate("/tracking", { state: { reportId: r.id } })}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 active:scale-[0.98] transition-all duration-150 text-left w-full"
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
                    {(r.wasteType || "Waste Report").replace(/_/g, " ")}
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
            ))}
          </div>
        )}
      </main>

      <BottomNav active="reports" />
    </div>
  );
}
