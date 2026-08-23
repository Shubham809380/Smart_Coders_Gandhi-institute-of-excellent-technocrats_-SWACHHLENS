import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { workerService, authService, profileService } from "../../services.js";
import { useTheme } from "../../contexts/ThemeContext.jsx";

const MaterialIcon = ({ name, className = "", style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
);

export default function WorkerProfile() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [worker, setWorker] = useState(null);
  const [dutyStatus, setDutyStatus] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", newPassword: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [dutyLoading, setDutyLoading] = useState(false);

  useEffect(() => {
    async function loadWorker() {
      try {
        const snapshot = authService.getSessionSnapshot();
        const u = snapshot.currentUser;
        setWorker(u || { name: "Worker", email: "", role: "cleanup_worker" });
        const [taskData, histData] = await Promise.all([
          workerService.getTasks().catch(() => ({ tasks: [], dutyStatus: "off_duty" })),
          workerService.getHistory().catch(() => []),
        ]);
        setTasks(taskData.tasks || []);
        setDutyStatus(taskData.dutyStatus === "on_duty");
        setHistory(Array.isArray(histData) ? histData : []);
      } catch {
        setWorker({ name: "Worker", email: "", role: "cleanup_worker" });
      }
      setLoading(false);
    }
    loadWorker();
  }, []);

  const handleDutyToggle = async () => {
    const newStatus = !dutyStatus;
    setDutyLoading(true);
    setDutyStatus(newStatus);
    try {
      await workerService.toggleDuty(newStatus);
    } catch {
      setDutyStatus(!newStatus);
    } finally {
      setDutyLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await authService.logout(); } finally { navigate("/login"); }
  };

  const handlePasswordChange = async () => {
    setPasswordError(""); setPasswordSuccess("");
    if (!passwords.current || !passwords.newPassword || !passwords.confirm) { setPasswordError("All fields are required."); return; }
    if (passwords.newPassword.length < 6) { setPasswordError("New password must be at least 6 characters."); return; }
    if (passwords.newPassword !== passwords.confirm) { setPasswordError("Passwords do not match."); return; }
    setPasswordLoading(true);
    try {
      await profileService.changePassword({ currentPassword: passwords.current, newPassword: passwords.newPassword });
      setPasswordSuccess("Password changed successfully.");
      setPasswords({ current: "", newPassword: "", confirm: "" });
      setTimeout(() => { setShowPasswordModal(false); setPasswordSuccess(""); }, 1500);
    } catch (err) { setPasswordError(err?.message || "Failed to change password."); }
    finally { setPasswordLoading(false); }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswords({ current: "", newPassword: "", confirm: "" });
    setPasswordError(""); setPasswordSuccess("");
  };

  const initial = (worker?.name || "W").charAt(0).toUpperCase();
  const completedTasks = history.filter(t => t.status === "resolved").length;
  const activeTasks = tasks.length;
  const totalAll = completedTasks + activeTasks;
  const approvalRate = completedTasks > 0 ? Math.round((completedTasks / Math.max(totalAll, 1)) * 100) : 0;

  const T = isDark
    ? { bg:'#0B1220', surface:'#161B26', border:'#232A3A', text:'#E8ECF1', muted:'#8791A3', accent:'#4C8DFF' }
    : { bg:'#F5F7FA', surface:'#FFFFFF', border:'#E4E8EE', text:'#12151C', muted:'#5B6472', accent:'#2E6BD6' };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background:T.bg }}>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor:T.accent, borderTopColor:'transparent' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background:T.bg, fontFamily:'"Inter",sans-serif', transition:'background-color 0.25s ease' }}>
      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-6">

        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg mb-3"
            style={{ background:'linear-gradient(135deg, #006b2c, #00a843)' }}>
            <span className="text-white text-3xl font-bold">{initial}</span>
          </div>
          <h1 className="text-xl font-bold" style={{ fontFamily:'"Space Grotesk",sans-serif', color:T.text }}>{worker?.name || "Worker"}</h1>
          <p className="text-sm mb-2" style={{ color:T.muted }}>{worker?.email || ""}</p>
          <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-4"
            style={{ background:'rgba(52,199,123,0.12)', color:'#34C77B' }}>
            {worker?.role === 'cleanup_worker' ? 'Cleanup Worker' : worker?.role || 'Worker'}
          </span>

          <button
            onClick={handleDutyToggle}
            disabled={dutyLoading}
            className="relative inline-flex h-14 w-56 items-center justify-center rounded-full transition-colors duration-200 font-semibold text-base shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: dutyStatus ? '#34C77B' : (isDark ? '#2a3550' : '#D1D5DB'),
              color: dutyStatus ? '#fff' : (isDark ? '#8791A3' : '#6B7280'),
              opacity: dutyLoading ? 0.6 : 1,
              cursor: dutyLoading ? 'wait' : 'pointer',
            }}
          >
            <MaterialIcon name={dutyStatus ? "toggle_on" : "toggle_off"} className="text-3xl absolute left-4" />
            {dutyLoading ? "Updating..." : dutyStatus ? "On Duty" : "Off Duty"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label:"Tasks Done", value:completedTasks, icon:"task_alt", color:"#34C77B", bg:"rgba(52,199,123,0.12)" },
            { label:"Active", value:activeTasks, icon:"pending", color:T.accent, bg:`${T.accent}18` },
            { label:"Approval", value:`${approvalRate}%`, icon:"thumb_up", color:"#F5A623", bg:"rgba(245,166,35,0.12)" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl p-3 flex flex-col items-center" style={{ background:T.surface, border:`1px solid ${T.border}` }}>
              <div className="rounded-full w-10 h-10 flex items-center justify-center mb-2" style={{ background:s.bg }}>
                <MaterialIcon name={s.icon} className="text-xl" style={{ color:s.color }} />
              </div>
              <span className="text-lg font-bold" style={{ color:T.text, fontFamily:'"JetBrains Mono",monospace' }}>{s.value}</span>
              <span className="text-xs text-center leading-tight" style={{ color:T.muted }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl overflow-hidden mb-6" style={{ background:T.surface, border:`1px solid ${T.border}` }}>
          {[
            { icon:"notifications", label:"Notifications", color:T.muted, onClick:()=>{} },
            { icon:"location_on", label:"Location Settings", color:T.muted, badge:"Active", onClick:()=>{} },
            { icon:"lock", label:"Change Password", color:T.muted, onClick:()=>setShowPasswordModal(true) },
            { icon:"help", label:"Help & Support", color:T.muted, onClick:()=>{} },
            { icon:"info", label:"About", color:T.muted, onClick:()=>{} },
            { icon:"logout", label:"Logout", color:"#E5484D", onClick:handleLogout },
          ].map((row, i, arr) => (
            <button
              key={row.label}
              onClick={row.onClick}
              className="w-full flex items-center gap-4 px-4 min-h-[56px] text-left active:opacity-70 transition-opacity"
              style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none' }}
            >
              <MaterialIcon name={row.icon} className="text-xl" style={{ color:row.color }} />
              <span className="flex-1 text-sm font-medium" style={{ color:row.color }}>{row.label}</span>
              {row.badge && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full mr-1"
                  style={{ background:'rgba(52,199,123,0.12)', color:'#34C77B' }}>
                  {row.badge}
                </span>
              )}
              <MaterialIcon name="chevron_right" className="text-xl" style={{ color:isDark ? '#3a4560' : '#D1D5DB' }} />
            </button>
          ))}
        </div>
      </div>

      <WorkerBottomNav active="profile" />

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background:'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl w-full max-w-sm p-6 shadow-2xl" style={{ background:T.surface }}>
            <h2 className="text-lg font-bold mb-4" style={{ fontFamily:'"Space Grotesk",sans-serif', color:T.text }}>Change Password</h2>
            {passwordError && <div className="text-sm rounded-lg px-3 py-2 mb-3" style={{ background:'rgba(229,72,77,0.1)', color:'#E5484D' }}>{passwordError}</div>}
            {passwordSuccess && <div className="text-sm rounded-lg px-3 py-2 mb-3" style={{ background:'rgba(52,199,123,0.1)', color:'#34C77B' }}>{passwordSuccess}</div>}
            <div className="space-y-3 mb-5">
              {[{ label:"Current Password", key:"current", placeholder:"Enter current password" },
                { label:"New Password", key:"newPassword", placeholder:"Enter new password" },
                { label:"Confirm New Password", key:"confirm", placeholder:"Confirm new password" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium mb-1" style={{ color:T.muted }}>{f.label}</label>
                  <input type="password" value={passwords[f.key]} placeholder={f.placeholder}
                    onChange={(e) => setPasswords({ ...passwords, [f.key]: e.target.value })}
                    className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ border:`1px solid ${T.border}`, background:T.bg, color:T.text, '--tw-ring-color':T.accent }} />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={closePasswordModal} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border:`1px solid ${T.border}`, color:T.muted }}>Cancel</button>
              <button onClick={handlePasswordChange} disabled={passwordLoading}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background:'#34C77B' }}>
                {passwordLoading ? "Changing..." : "Change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
