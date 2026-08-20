import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { workerService, authService, profileService } from "../../services.js";

const MaterialIcon = ({ name, className = "" }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

export default function WorkerProfile() {
  const navigate = useNavigate();
  const [worker, setWorker] = useState(null);
  const [dutyStatus, setDutyStatus] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwords, setPasswords] = useState({
    current: "",
    newPassword: "",
    confirm: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [dutyLoading, setDutyLoading] = useState(false);

  useEffect(() => {
    async function loadWorker() {
      try {
        const data = await workerService.getProfile();
        setWorker(data);
        setDutyStatus(data?.dutyStatus ?? false);
      } catch {
        setWorker({
          name: "Worker",
          email: "worker@example.com",
          role: "Cleanup Worker",
          avatar: null,
        });
      }
    }
    loadWorker();
  }, []);

  const handleDutyToggle = async () => {
    const newStatus = !dutyStatus;
    setDutyLoading(true);
    try {
      await workerService.toggleDuty(newStatus);
      setDutyStatus(newStatus);
    } catch {
      setDutyStatus(dutyStatus);
    } finally {
      setDutyLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } finally {
      navigate("/login");
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwords.current || !passwords.newPassword || !passwords.confirm) {
      setPasswordError("All fields are required.");
      return;
    }
    if (passwords.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      await profileService.changePassword({
        currentPassword: passwords.current,
        newPassword: passwords.newPassword,
      });
      setPasswordSuccess("Password changed successfully.");
      setPasswords({ current: "", newPassword: "", confirm: "" });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess("");
      }, 1500);
    } catch (err) {
      setPasswordError(err?.message || "Failed to change password. Try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswords({ current: "", newPassword: "", confirm: "" });
    setPasswordError("");
    setPasswordSuccess("");
  };

  const initial = (worker?.name || "W").charAt(0).toUpperCase();

  const stats = [
    { label: "Tasks Done", value: "128", icon: "task_alt", color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Avg Time", value: "1.5h", icon: "schedule", color: "text-blue-600", bg: "bg-blue-100" },
    { label: "Approval", value: "92%", icon: "thumb_up", color: "text-amber-600", bg: "bg-amber-100" },
  ];

  const settingsRows = [
    { icon: "notifications", label: "Notifications", color: "text-gray-700", onClick: () => {} },
    { icon: "location_on", label: "Location Settings", color: "text-gray-700", badge: "Active", onClick: () => {} },
    { icon: "lock", label: "Change Password", color: "text-gray-700", onClick: () => setShowPasswordModal(true) },
    { icon: "help", label: "Help & Support", color: "text-gray-700", onClick: () => {} },
    { icon: "info", label: "About", color: "text-gray-700", onClick: () => {} },
    { icon: "logout", label: "Logout", color: "text-red-600", onClick: handleLogout },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-6">

        {/* Profile Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg mb-3">
            <span className="text-white text-3xl font-bold">{initial}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{worker?.name || "Worker"}</h1>
          <p className="text-sm text-gray-500 mb-2">{worker?.email || ""}</p>
          <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            {worker?.role || "Cleanup Worker"}
          </span>

          {/* Duty Toggle */}
          <button
            onClick={handleDutyToggle}
            disabled={dutyLoading}
            className={`relative inline-flex h-14 w-56 items-center justify-center rounded-full transition-colors duration-200 font-semibold text-base shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              dutyStatus
                ? "bg-emerald-500 text-white focus:ring-emerald-400"
                : "bg-gray-300 text-gray-600 focus:ring-gray-400"
            } ${dutyLoading ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
          >
            <MaterialIcon
              name={dutyStatus ? "toggle_on" : "toggle_off"}
              className="text-3xl absolute left-4"
            />
            {dutyLoading ? "Updating..." : dutyStatus ? "On Duty" : "Off Duty"}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-2xl p-3 flex flex-col items-center shadow-sm"
            >
              <div className={`${s.bg} ${s.color} rounded-full w-10 h-10 flex items-center justify-center mb-2`}>
                <MaterialIcon name={s.icon} className="text-xl" />
              </div>
              <span className="text-lg font-bold text-gray-900">{s.value}</span>
              <span className="text-xs text-gray-500 text-center leading-tight">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Settings Card */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
          {settingsRows.map((row, i) => (
            <button
              key={row.label}
              onClick={row.onClick}
              className={`w-full flex items-center gap-4 px-4 min-h-[56px] text-left active:bg-gray-50 transition-colors ${
                i < settingsRows.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <MaterialIcon name={row.icon} className={`text-xl ${row.color}`} />
              <span className={`flex-1 text-sm font-medium ${row.color}`}>{row.label}</span>
              {row.badge && (
                <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full mr-1">
                  {row.badge}
                </span>
              )}
              <MaterialIcon
                name="chevron_right"
                className={`text-xl ${row.color === "text-red-600" ? "text-red-400" : "text-gray-400"}`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Nav */}
      <WorkerBottomNav />

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Change Password</h2>

            {passwordError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="bg-emerald-50 text-emerald-600 text-sm rounded-lg px-3 py-2 mb-3">
                {passwordSuccess}
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closePasswordModal}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 active:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={passwordLoading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold active:bg-emerald-600 disabled:opacity-50"
              >
                {passwordLoading ? "Changing..." : "Change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
