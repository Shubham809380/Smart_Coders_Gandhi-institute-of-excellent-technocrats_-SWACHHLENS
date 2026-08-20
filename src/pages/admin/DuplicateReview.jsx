import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar.jsx";
import { adminService } from "../../services.js";

export default function DuplicateReview() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [selectedReports, setSelectedReports] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    async function fetchGroups() {
      try {
        const data = await adminService.getDuplicateGroups();
        setGroups(data);
        const initial = {};
        data.forEach((g) => {
          if (g.reports.length > 0) initial[g.groupId] = g.reports[0].id;
        });
        setSelectedReports(initial);
      } catch (err) {
        console.error("Failed to load duplicate groups", err);
      } finally {
        setLoading(false);
      }
    }
    fetchGroups();
  }, []);

  const handleSelect = (groupId, reportId) => {
    setSelectedReports((prev) => ({ ...prev, [groupId]: reportId }));
  };

  const handleKeepSelected = async (groupId) => {
    const keepId = selectedReports[groupId];
    if (!keepId) return;
    setActionLoading(groupId);
    try {
      await adminService.mergeDuplicates(groupId, keepId);
      setGroups((prev) => prev.filter((g) => g.groupId !== groupId));
      setSelectedReports((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    } catch (err) {
      console.error("Failed to merge duplicates", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkSeparate = async (groupId) => {
    setActionLoading(groupId);
    try {
      setGroups((prev) => prev.filter((g) => g.groupId !== groupId));
      setSelectedReports((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    } catch (err) {
      console.error("Failed to mark as separate", err);
    } finally {
      setActionLoading(null);
    }
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const similarityColor = (score) => {
    if (score >= 90) return "bg-red-100 text-red-700";
    if (score >= 75) return "bg-amber-100 text-amber-700";
    return "bg-yellow-100 text-yellow-700";
  };

  const statusBadge = (status) => {
    const map = {
      pending: "bg-yellow-100 text-yellow-700",
      verified: "bg-blue-100 text-blue-700",
      resolved: "bg-green-100 text-green-700",
      rejected: "bg-gray-100 text-gray-500",
    };
    return map[status] || "bg-gray-100 text-gray-500";
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 ml-0 md:ml-64 p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-700 mb-4 transition-colors"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                  Duplicate Review
                </h1>
                <p className="text-gray-500 mt-1">
                  {loading
                    ? "Loading..."
                    : `${groups.length} group${groups.length !== 1 ? "s" : ""} flagged by AI`}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-2 rounded-xl text-sm font-medium">
                <span className="material-symbols-outlined text-lg">auto_awesome</span>
                AI Detected
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
              <span className="text-gray-400 text-sm">Loading duplicate groups...</span>
            </div>
          )}

          {!loading && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-green-600 text-4xl">
                  check_circle
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">No duplicates found</h3>
              <p className="text-gray-400 text-sm text-center max-w-sm">
                All complaints have been reviewed. No potential duplicates were detected by AI.
              </p>
            </div>
          )}

          {!loading && groups.length > 0 && (
            <div className="space-y-6">
              {groups.map((group) => (
                <div
                  key={group.groupId}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${similarityColor(
                          group.maxSimilarity
                        )}`}
                      >
                        {group.maxSimilarity}% match
                      </span>
                      <span className="text-sm text-gray-500">
                        {group.count} report{group.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={actionLoading === group.groupId}
                        onClick={() => handleMarkSeparate(group.groupId)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">
                          split_scene
                        </span>
                        Mark as Separate
                      </button>
                      <button
                        disabled={actionLoading === group.groupId}
                        onClick={() => handleKeepSelected(group.groupId)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-50"
                      >
                        {actionLoading === group.groupId ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-base">
                            merge
                          </span>
                        )}
                        Keep Selected
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-50">
                    {group.reports.map((report) => (
                      <div
                        key={report.id}
                        className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                          selectedReports[group.groupId] === report.id
                            ? "bg-green-50/60"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`group-${group.groupId}`}
                          checked={selectedReports[group.groupId] === report.id}
                          onChange={() => handleSelect(group.groupId, report.id)}
                          className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500 cursor-pointer"
                        />
                        <img
                          src={report.imageUrl}
                          alt="Waste report"
                          className="w-12 h-12 rounded-xl object-cover bg-gray-100 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-gray-900 capitalize">
                              {report.wasteType}
                            </span>
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge(
                                report.status
                              )}`}
                            >
                              {report.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 truncate">
                            {report.location}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                          {timeAgo(report.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
