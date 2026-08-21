import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { adminService } from "../../services.js";
import { useTheme } from "../../contexts/ThemeContext.jsx";
import { Icon, Chip, relativeTime } from "./ui.jsx";
import { useLive } from "../../hooks/useLive.js";

const NAV_SECTIONS = [
  {
    label: "Operations",
    items: [
      { to: "/admin/dashboard", icon: "layers", label: "Overview" },
      { to: "/admin/map", icon: "map", label: "Live Map" },
      { to: "/admin/queue", icon: "queue", label: "Priority Queue" },
    ],
  },
  {
    label: "Quality",
    items: [
      { to: "/admin/duplicates", icon: "copy", label: "Duplicate Review" },
      { to: "/admin/verification", icon: "eye", label: "Verification" },
    ],
  },
  {
    label: "Resources",
    items: [
      { to: "/admin/teams", icon: "users", label: "Teams & Fleet" },
      { to: "/admin/recycling", icon: "recycle", label: "Recycling" },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/admin/alerts", icon: "bell", label: "Alerts" },
      { to: "/admin/analytics", icon: "chart", label: "Analytics" },
    ],
  },
];

const PAGE_TITLES = Object.fromEntries(
  NAV_SECTIONS.flatMap((s) => s.items).map((i) => [i.to, i.label])
);

const LAST_SEEN_KEY = "swachhlens-admin-alerts-last-seen";

function ThemeSwitcher() {
  const { mode, setThemeMode } = useTheme();
  const options = [
    { value: "light", icon: "sun", label: "Light" },
    { value: "dark", icon: "moon", label: "Dark" },
    { value: "system", icon: "monitor", label: "System" },
  ];
  return (
    <div className="flex items-center rounded-lg p-0.5 gap-0.5" style={{ background: "var(--adm-surface-2)" }} role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={mode === o.value}
          title={`${o.label} theme`}
          onClick={() => setThemeMode(o.value)}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
          style={{
            background: mode === o.value ? "var(--adm-surface)" : "transparent",
            color: mode === o.value ? "var(--adm-primary)" : "var(--adm-muted)",
            boxShadow: mode === o.value ? "0 1px 4px rgba(0,0,0,0.18)" : "none",
          }}
        >
          <Icon name={o.icon} size={14} />
        </button>
      ))}
    </div>
  );
}

function AlertBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [lastSeen, setLastSeen] = useState(() => {
    try { return Number(localStorage.getItem(LAST_SEEN_KEY) || 0); } catch { return 0; }
  });
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    try { setAlerts(await adminService.getAlerts()); } catch {}
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  useLive(() => load(), ["waste:new", "complaint:escalated"], { pollMs: 0 });

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = alerts.filter((a) => new Date(a.createdAt).getTime() > lastSeen).length;

  const markSeen = () => {
    const now = Date.now();
    try { localStorage.setItem(LAST_SEEN_KEY, String(now)); } catch {}
    setLastSeen(now);
  };

  const kindIcon = { escalation: "zap", hazard: "shieldAlert", critical: "alert" };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); if (!open) markSeen(); }}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg adm-btn-ghost"
        aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "var(--adm-danger)" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto adm-scroll adm-card z-50" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="px-4 py-3 border-b adm-border-c flex items-center justify-between">
            <span className="text-sm font-bold adm-text">Alerts</span>
            <Chip tone="info">{alerts.length}</Chip>
          </div>
          {alerts.length === 0 && <p className="px-4 py-6 text-sm text-center adm-muted">No active alerts.</p>}
          {alerts.slice(0, 12).map((a) => (
            <button
              key={`${a.kind}-${a.id}-${a.createdAt}`}
              onClick={() => { setOpen(false); navigate(`/admin/complaints/${a.reportId}`); }}
              className="w-full text-left px-4 py-3 flex gap-3 items-start border-b adm-border-c hover:bg-[var(--adm-surface-2)] transition-colors"
            >
              <span className="mt-0.5 shrink-0" style={{ color: a.kind === "escalation" ? "var(--adm-warn)" : a.kind === "hazard" ? "var(--adm-danger)" : "var(--adm-primary)" }}>
                <Icon name={kindIcon[a.kind] || "bell"} size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold adm-text truncate">{a.title}</span>
                <span className="block text-xs adm-muted truncate">{a.body}</span>
                <span className="block text-[10px] mt-0.5" style={{ color: "var(--adm-muted)" }}>{relativeTime(a.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const title = PAGE_TITLES[location.pathname] || (location.pathname.startsWith("/admin/complaints/") ? "Complaint Detail" : "Admin");

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen" style={{ background: "var(--adm-bg)", color: "var(--adm-text)" }}>
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 flex flex-col border-r adm-border-c transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ background: "var(--adm-surface)" }}
      >
        <div className="h-14 flex items-center gap-2 px-5 border-b adm-border-c shrink-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg text-white font-black text-sm" style={{ background: "var(--adm-primary)" }}>S</span>
          <div className="leading-tight">
            <p className="font-extrabold text-sm tracking-tight">SwachhLens</p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--adm-muted)" }}>Admin Console</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto adm-scroll py-3 px-3 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--adm-muted)" }}>{section.label}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${isActive ? "" : "hover:bg-[var(--adm-surface-2)]"}`
                      }
                      style={({ isActive }) => ({
                        background: isActive ? "rgba(0,168,150,0.12)" : undefined,
                        color: isActive ? "var(--adm-primary)" : "var(--adm-text)",
                      })}
                    >
                      <Icon name={item.icon} size={16} />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t adm-border-c shrink-0">
          <Link to="/profile" className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--adm-surface-2)] transition-colors">
            <span className="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold" style={{ background: "var(--adm-primary-strong)" }}>MA</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold truncate">Municipal Admin</span>
              <span className="block text-[11px] truncate" style={{ color: "var(--adm-muted)" }}>admin@swachhlens.app</span>
            </span>
          </Link>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main column */}
      <div className="lg:pl-60 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 lg:px-6 border-b adm-border-c" style={{ background: "var(--adm-bg)" }}>
          <button className="lg:hidden adm-btn-ghost flex items-center justify-center w-9 h-9 rounded-lg" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <h1 className="font-extrabold text-base tracking-tight truncate">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitcher />
            <AlertBell />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
