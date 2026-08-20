import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../logo.svg";
import { authService, adminService } from "../services.js";

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", path: "/admin/dashboard" },
  { key: "complaints", label: "Complaints", icon: "report_problem", path: "/admin/complaints" },
  { key: "verification", label: "Verification", icon: "fact_check", path: "/admin/verification" },
  { key: "duplicates", label: "Duplicates", icon: "content_copy", path: "/admin/duplicates" },
  { key: "workers", label: "Workers", icon: "groups", path: "/admin/workers" },
  { key: "analytics", label: "Analytics", icon: "analytics", path: "/admin/analytics" },
];

export default function AdminSidebar({ active = "dashboard" }) {
  const navigate = useNavigate();
  const [offlineMode, setOfflineMode] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [complaintCount, setComplaintCount] = useState(0);

  useEffect(() => {
    const snapshot = authService.getSessionSnapshot();
    setAdminUser(snapshot.currentUser);
    adminService.getComplaints({ status: "submitted" }).then((d) => setComplaintCount(d.total || 0)).catch(() => {});
  }, []);

  const isActiveItem = (key) => active === key;

  const renderNavItem = (item) => {
    const isActive = isActiveItem(item.key);
    let itemClasses = "flex items-center gap-md px-md py-sm rounded-lg transition-all group";
    if (isActive) {
      itemClasses += " bg-primary-container text-on-primary-container shadow-sm";
    } else {
      itemClasses += " text-on-surface-variant hover:bg-surface-container hover:text-on-surface";
    }
    return (
      <button
        key={item.key}
        onClick={() => { navigate(item.path); setMobileOpen(false); }}
        className={itemClasses}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="material-symbols-outlined">{item.icon}</span>
        <span className="font-label-md text-label-md flex-1 text-left">{item.label}</span>
        {item.key === "complaints" && complaintCount > 0 && (
          <span className="font-label-sm text-label-sm bg-error-container text-on-error-container px-2 py-0.5 rounded-full">
            {complaintCount}
          </span>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <>
      <div className="h-20 flex items-center gap-xs px-lg">
        <img alt="SwachhLens" className="h-8 w-8 object-contain rounded-lg" src={logo} />
        <span className="font-title-md text-title-md text-primary">SwachhLens</span>
      </div>
      <nav className="flex-1 flex flex-col gap-xxs px-sm">
        {navItems.map(renderNavItem)}
      </nav>
      <div className="px-sm pb-lg flex flex-col gap-md">
        <div className="flex items-center justify-between px-md py-sm">
          <div className="flex items-center gap-md">
            <span className="material-symbols-outlined text-on-surface-variant">wifi_off</span>
            <span className="font-label-md text-label-md text-on-surface-variant">Offline Mode</span>
          </div>
          <button
            onClick={() => setOfflineMode(!offlineMode)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${offlineMode ? "bg-primary" : "bg-surface-container-highest"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-on-primary shadow-sm transition-transform duration-200 ${offlineMode ? "translate-x-5" : ""}`} />
          </button>
        </div>
        <div className="flex items-center gap-md px-md py-sm rounded-lg hover:bg-surface-container transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-tertiary-container text-[20px]">person</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-surface">
              {adminUser?.name || "Admin"}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {adminUser?.role?.replace(/_/g, " ") || "Administrator"}
            </span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-[60] w-11 h-11 flex bg-surface-container rounded-full shadow-md items-center justify-center lg:hidden"
      >
        <span className="material-symbols-outlined text-on-surface">menu</span>
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-[69] lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-72 bg-surface-container-low shadow-[1px_0_0_0_rgba(0,0,0,0.05)] z-50 flex-col">
        {sidebarContent}
      </aside>
      <aside className={`fixed left-0 top-0 h-full w-72 bg-surface-container-low shadow-[1px_0_0_0_rgba(0,0,0,0.05)] z-[70] flex flex-col overflow-y-auto transition-transform duration-300 lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-end p-4">
          <button onClick={() => setMobileOpen(false)} className="w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {sidebarContent}
      </aside>
    </>
  );
}
