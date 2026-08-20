import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar";
import { adminService } from "../../services";

const STATUS_COLORS = {
  submitted: "bg-gray-400",
  ai_analyzed: "bg-blue-500",
  under_review: "bg-amber-500",
  assigned: "bg-indigo-500",
  en_route: "bg-purple-500",
  cleanup_in_progress: "bg-orange-500",
  resolved: "bg-green-500",
  rejected: "bg-red-500",
};

const SEVERITY_COLORS = {
  critical: { bg: "bg-red-500", text: "text-red-600", ring: "ring-red-200" },
  high: { bg: "bg-orange-500", text: "text-orange-600", ring: "ring-orange-200" },
  medium: { bg: "bg-amber-500", text: "text-amber-600", ring: "ring-amber-200" },
  low: { bg: "bg-green-500", text: "text-green-600", ring: "ring-green-200" },
};

const CATEGORY_COLORS = [
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-lime-500",
];

const WARD_COLORS = [
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-lime-500",
];

function formatLabel(str) {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStatus(str) {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function Analytics() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const result = await adminService.getAnalytics();
        setData(result);
      } catch (err) {
        setError(err.message || "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function handleExport() {
    if (!data) return;
    setExporting(true);

    const rows = [];

    rows.push(["SwachhLens Analytics Report"]);
    rows.push(["Generated", new Date().toLocaleString("en-IN")]);
    rows.push([]);

    rows.push(["Summary"]);
    rows.push(["Total Complaints", data.total]);
    rows.push([]);

    rows.push(["Status Breakdown"]);
    rows.push(["Status", "Count"]);
    (data.byStatus || []).forEach((item) => {
      rows.push([formatStatus(item.status), item.count]);
    });
    rows.push([]);

    rows.push(["Category Breakdown"]);
    rows.push(["Category", "Count"]);
    (data.byCategory || []).forEach((item) => {
      rows.push([formatLabel(item.category), item.count]);
    });
    rows.push([]);

    rows.push(["Severity Breakdown"]);
    rows.push(["Severity", "Count"]);
    (data.bySeverity || []).forEach((item) => {
      rows.push([formatLabel(item.severity), item.count]);
    });
    rows.push([]);

    rows.push(["Ward Breakdown"]);
    rows.push(["Ward", "Count"]);
    (data.byWard || []).forEach((item) => {
      rows.push([item.ward, item.count]);
    });
    rows.push([]);

    rows.push(["Timeline (Last 30 Days)"]);
    rows.push(["Date", "Count"]);
    (data.timeline || []).forEach((item) => {
      rows.push([item.date, item.count]);
    });

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `swachhlens-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AdminSidebar />
        <div className="flex-1 flex items-center justify-center ml-0 lg:ml-72 pl-16 lg:pl-0">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 font-medium">Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen bg-gray-50">
        <AdminSidebar />
        <div className="flex-1 flex items-center justify-center ml-0 lg:ml-72 pl-16 lg:pl-0">
          <div className="flex flex-col items-center gap-4 text-center px-4">
            <span className="material-symbols-outlined text-6xl text-red-400">
              error
            </span>
            <p className="text-red-600 font-semibold text-lg">
              Failed to load analytics
            </p>
            <p className="text-gray-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const maxStatusCount = Math.max(
    ...((data.byStatus || []).map((s) => s.count) || [1]),
    1
  );
  const maxWardCount = Math.max(
    ...((data.byWard || []).map((w) => w.count) || [1]),
    1
  );
  const maxCategoryCount = Math.max(
    ...((data.byCategory || []).map((c) => c.count) || [1]),
    1
  );
  const maxTimelineCount = Math.max(
    ...((data.timeline || []).map((t) => t.count) || [1]),
    1
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AdminSidebar />

      <div className="flex-1 ml-0 lg:ml-72 pl-16 lg:pl-0 overflow-y-auto">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="md:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                  Analytics & Reports
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                  Complaint insights and performance metrics
                </p>
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-2xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[20px]">
                {exporting ? "hourglass_top" : "download"}
              </span>
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600">
                    inventory_2
                  </span>
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Total
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {(data.total || 0).toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total Complaints</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-green-600">
                    check_circle
                  </span>
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Done
                </span>
              </div>
              <p className="text-3xl font-bold text-green-600">
                {(
                  data.byStatus?.find((s) => s.status === "resolved")?.count || 0
                ).toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-gray-500 mt-1">Resolved</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600">
                    pending
                  </span>
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Active
                </span>
              </div>
              <p className="text-3xl font-bold text-amber-600">
                {(
                  (data.byStatus?.find((s) => s.status === "cleanup_in_progress")
                    ?.count || 0) +
                  (data.byStatus?.find((s) => s.status === "en_route")?.count ||
                    0) +
                  (data.byStatus?.find((s) => s.status === "assigned")?.count ||
                    0)
                ).toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-gray-500 mt-1">In Progress</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-red-600">
                    warning
                  </span>
                </div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Urgent
                </span>
              </div>
              <p className="text-3xl font-bold text-red-600">
                {(
                  data.bySeverity?.find((s) => s.severity === "critical")
                    ?.count || 0
                ).toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-gray-500 mt-1">Critical</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Complaints by Status */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-emerald-600">
                  bar_chart
                </span>
                <h2 className="text-lg font-semibold text-gray-900">
                  Complaints by Status
                </h2>
              </div>
              <div className="space-y-3">
                {(data.byStatus || []).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">
                    No data available
                  </p>
                ) : (
                  (data.byStatus || []).map((item) => (
                    <div key={item.status} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-36 truncate shrink-0 text-right">
                        {formatStatus(item.status)}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            STATUS_COLORS[item.status] || "bg-gray-400"
                          } transition-all duration-700 ease-out flex items-center justify-end pr-3`}
                          style={{
                            width: `${
                              Math.max((item.count / maxStatusCount) * 100, 4)
                            }%`,
                          }}
                        >
                          {item.count / maxStatusCount > 0.15 && (
                            <span className="text-xs font-semibold text-white">
                              {item.count}
                            </span>
                          )}
                        </div>
                      </div>
                      {item.count / maxStatusCount <= 0.15 && (
                        <span className="text-xs font-semibold text-gray-500 w-8">
                          {item.count}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Complaints by Category */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-emerald-600">
                  category
                </span>
                <h2 className="text-lg font-semibold text-gray-900">
                  Complaints by Category
                </h2>
              </div>
              {(data.byCategory || []).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">
                  No data available
                </p>
              ) : (
                <div className="flex items-end gap-2 h-52 px-2 overflow-x-auto">
                  {(data.byCategory || []).map((item, idx) => {
                    const height =
                      Math.max((item.count / maxCategoryCount) * 100, 4);
                    return (
                      <div
                        key={item.category}
                        className="flex flex-col items-center gap-1 min-w-[48px] flex-1 group"
                      >
                        <span className="text-xs font-semibold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.count}
                        </span>
                        <div
                          className={`w-full max-w-[40px] rounded-t-lg ${
                            CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
                          } transition-all duration-500 ease-out relative group-hover:opacity-90`}
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[10px] text-gray-500 font-medium text-center leading-tight -rotate-45 origin-top-left mt-1 whitespace-nowrap">
                          {formatLabel(item.category)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Second row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Complaints by Severity */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-emerald-600">
                  priority_high
                </span>
                <h2 className="text-lg font-semibold text-gray-900">
                  Complaints by Severity
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-6">
                {(data.bySeverity || []).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4 col-span-2">
                    No data available
                  </p>
                ) : (
                  (data.bySeverity || []).map((item) => {
                    const cfg =
                      SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.medium;
                    return (
                      <div
                        key={item.severity}
                        className="flex flex-col items-center gap-3"
                      >
                        <div
                          className={`relative w-20 h-20 rounded-full ${cfg.ring} ring-4 flex items-center justify-center`}
                        >
                          <div
                            className={`absolute inset-1 rounded-full ${cfg.bg} opacity-15`}
                          />
                          <span
                            className={`relative text-xl font-bold ${cfg.text}`}
                          >
                            {item.count}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {item.severity}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Complaints by Ward */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-emerald-600">
                  map
                </span>
                <h2 className="text-lg font-semibold text-gray-900">
                  Complaints by Ward
                </h2>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {(data.byWard || []).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">
                    No data available
                  </p>
                ) : (
                  (data.byWard || []).map((item, idx) => (
                    <div
                      key={item.ward}
                      className="flex items-center gap-3 group"
                    >
                      <span className="text-sm text-gray-600 w-28 truncate shrink-0 text-right">
                        {item.ward}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            WARD_COLORS[idx % WARD_COLORS.length]
                          } transition-all duration-700 ease-out`}
                          style={{
                            width: `${
                              Math.max(
                                (item.count / maxWardCount) * 100,
                                3
                              )
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-500 w-8 text-right">
                        {item.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-emerald-600">
                show_chart
              </span>
              <h2 className="text-lg font-semibold text-gray-900">
                Daily Complaints (Last 30 Days)
              </h2>
            </div>
            {(data.timeline || []).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">
                No timeline data available
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-px min-w-[360px] sm:min-w-[500px] h-40 px-2 pb-6 relative">
                  {/* Y-axis lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="border-t border-gray-100 w-full"
                      />
                    ))}
                  </div>

                  {(data.timeline || []).map((item, idx) => {
                    const height =
                      Math.max((item.count / maxTimelineCount) * 100, 2);
                    return (
                      <div
                        key={idx}
                        className="flex flex-col items-center flex-1 relative group"
                        style={{ height: "100%" }}
                      >
                        <div className="absolute -top-7 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                          {formatDate(item.date)}: {item.count}
                        </div>
                        <div className="flex-1 w-full flex items-end justify-center">
                          <div
                            className="w-full max-w-[18px] bg-emerald-500 rounded-t hover:bg-emerald-600 transition-colors cursor-pointer"
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        {idx % 5 === 0 && (
                          <span className="absolute -bottom-5 text-[9px] text-gray-400 whitespace-nowrap">
                            {formatDate(item.date)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
