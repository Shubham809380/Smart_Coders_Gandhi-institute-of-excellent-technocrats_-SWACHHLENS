import {
    APP_STATES,
    permissionCopy,
    roleRoutes,
    severityColors,
    statusLabels,
} from "./data.js";
import {
    aiService,
    appService,
    authService,
    getStateSnapshot,
    notificationService,
    permissionService,
    reportService,
    teamService,
} from "./services.js";

const app = document.querySelector("#app");
const uiState = {
    adminDrawerOpen: false,
    onboardingIndex: 0,
    onboardingDirection: 1,
    authMode: "login",
    authError: "",
    authInfo: "",
    forgotMode: false,
    logoutConfirm: false,
    permissionPrompt: null,
    afterSubmitPrompt: false,
    authSubmitting: false,
    phoneMode: false,
    phoneSending: false,
    otpSent: false,
    toast: null,
    workerAfterPhoto: {
        reportId: "",
        dataUrl: "",
        fileName: "",
    },
};

const citizenNav = [
    ["/home", "home", "Home"],
    ["/explore", "explore", "Explore"],
    ["/report/capture", "photo_camera", "Report"],
    ["/reports", "assignment", "Reports"],
    ["/design-library", "palette", "Design"],
    ["/profile", "account_circle", "Profile"],
];
const adminNav = [
    ["/admin/dashboard", "dashboard", "Dashboard"],
    ["/admin/priority", "auto_awesome", "Priority"],
    ["/admin/complaints", "report_problem", "Complaints"],
    ["/admin/dispatch", "local_shipping", "Dispatch"],
    ["/admin/verification", "verified", "Verify"],
];
const workerNav = [
    ["/worker/tasks", "assignment", "Tasks"],
    ["/worker/map", "map", "Map"],
    ["/worker/history", "history", "History"],
    ["/profile", "account_circle", "Profile"],
];
const analysisSteps = [
    "Detecting waste",
    "Identifying category",
    "Estimating volume",
    "Calculating severity",
    "Checking duplicate reports",
];

const designScreens = [
    { id: "home", label: "Home", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/home/code.html", blurb: "Community overview and AI-powered reporting entry" },
    { id: "capture", label: "Capture Waste", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/capture_waste/code.html", blurb: "Mobile reporting flow with capture and location steps" },
    { id: "analyzing", label: "Analyzing Waste", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/analyzing_waste/code.html", blurb: "Live AI scan and analysis progress states" },
    { id: "ai-results", label: "AI Results", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/ai_results/code.html", blurb: "Risk, waste type, and recommendation review" },
    { id: "success", label: "Success", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/success/code.html", blurb: "Submission confirmation and status tracking" },
    { id: "explore", label: "Explore Map", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/explore_map/code.html", blurb: "Map view with nearby hotspots and filters" },
    { id: "tracking", label: "Tracking Cleanup", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/tracking_cleanup/code.html", blurb: "Live follow-up for assigned reports and cleanup teams" },
    { id: "task-progress", label: "Task In Progress", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/task_in_progress/code.html", blurb: "Worker task flow with evidence and status updates" },
    { id: "team-tasks", label: "Team Tasks", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/team_tasks/code.html", blurb: "Crew assignment and completion dashboard" },
    { id: "admin-dashboard", label: "Admin Dashboard", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/admin_dashboard/code.html", blurb: "Municipal command centre and operational metrics" },
    { id: "priority-queue", label: "AI Priority Queue", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/ai_priority_queue/code.html", blurb: "Priority ranking and complaint triage screen" },
    { id: "smart-dispatch", label: "Smart Dispatch Detail", path: "/stitch_swachhlens_ai_waste_response_ecosystem/stitch_swachhlens_ai_waste_response_ecosystem/smart_dispatch_detail/code.html", blurb: "Recommended dispatch team and on-ground route detail" },
];

let slowLoaderTimer = null;

function scheduleSlowLoader() {
    window.clearTimeout(slowLoaderTimer);
    slowLoaderTimer = window.setTimeout(() => {
        const startup = appService.getStartup();
        if (!document.querySelector(".splash-screen") || startup.error || !startup.loading) return;
        const loader = document.querySelector(".splash-loader");
        if (loader) loader.classList.add("show");
    }, 1900);
}

function fmtDate(value) {
    return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function currentPath() {
    return window.location.hash.replace(/^#/, "") || "/home";
}

function navigate(path) {
    uiState.adminDrawerOpen = false;
    window.location.hash = path;
}

function ensureHash(path) {
    if (currentPath() !== path) navigate(path);
}

function severityColor(severity) {
    return severityColors[severity] ? severityColors[severity] : "var(--text)";
}

function logoMark(id = "logo") {
    return `<svg class="logo-mark" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SwachhLens logo">
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#047857"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
    <linearGradient id="${id}-lens" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F0FDFA"/>
      <stop offset="1" stop-color="#ECFEFF"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="88" height="88" rx="24" fill="url(#${id}-bg)"/>
  <circle class="logo-orbit" cx="48" cy="48" r="33.5" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-dasharray="3 8" stroke-linecap="round"/>
  <circle class="logo-orbit-dot" cx="81.5" cy="48" r="3" fill="#ffffff"/>
  <circle cx="48" cy="48" r="26.5" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="3"/>
  <circle cx="48" cy="48" r="19.5" fill="url(#${id}-lens)"/>
  <path d="M43.5 41.5 Q46 46 48 41.5 Q50 46 52.5 41.5" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.85"/>
  <line x1="46.5" y1="31.5" x2="46.5" y2="60.5" stroke="#E2E8F0" stroke-width="1.5"/>
  <circle cx="38" cy="48" r="4" fill="#475569"/>
  <circle cx="44" cy="54" r="3.4" fill="#334155"/>
  <circle cx="36.5" cy="56" r="2.7" fill="#64748B"/>
  <path d="M53.5 51 Q57 55 52.5 58" stroke="#059669" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <path d="M54 47.5 Q59.5 45 60.5 40.5 Q55.5 41.5 54 47.5Z" fill="#10B981"/>
  <path d="M55 54 Q50.5 52.5 48 49.5 Q52 50.5 55 54Z" fill="#34D399"/>
</svg>`;
}

function routeLink(path, label, icon, active, prominent = false) {
    return `<button class="nav-link ${active ? "active" : ""} ${prominent ? "prominent" : ""}" data-nav="${path}"><span class="material-symbols-outlined">${icon}</span><span>${label}</span></button>`;
}

function severityBadge(report) {
    const color = severityColor(report.severity);
    return `<span class="badge" style="background:${color}1f;color:${color}">${report.severity}</span>`;
}

function statusBadge(status) {
    return `<span class="badge badge-soft">${typeof statusLabels[status] !== "undefined" ? statusLabels[status] : status}</span>`;
}

function stickyActions(content) {
    return `<div class="two-col sticky-actions">${content}</div>`;
}

function mediaPreview(reportLike, className = "hero-image") {
    if (!reportLike) return "";
    const src = reportLike.mediaType === "video" ? reportLike.video : reportLike.image;
    if (!src) return "";
    if (reportLike.mediaType === "video") return `<video class="${className}" src="${src}" controls playsinline></video>`;
    return `<img class="${className}" src="${src}" alt="Waste evidence" />`;
}

function shell({ title, subtitle = "", body = "", mode = "citizen", showLogout = false }) {
    const path = currentPath();
    const nav = mode === "admin" ? adminNav : mode === "worker" ? workerNav : citizenNav;
    const desktopAdmin = mode === "admin" ? `<aside class="sidebar"><div class="brand"><span class="brand-logo">${logoMark("sl-nav")}</span><span>SwachhLens</span></div>${nav.map(([p, i, l]) => routeLink(p, l, i, path.startsWith(p))).join("")}</aside>` : "";
    const mobileAdmin = mode === "admin" ? `<div class="drawer-backdrop ${uiState.adminDrawerOpen ? "open" : ""}" data-close-drawer="1"></div><aside class="mobile-drawer ${uiState.adminDrawerOpen ? "open" : ""}"><div class="drawer-head"><strong>SwachhLens Admin</strong><button class="icon-button" data-close-drawer="1"><span class="material-symbols-outlined">close</span></button></div>${nav.map(([p, i, l]) => routeLink(p, l, i, path.startsWith(p))).join("")}</aside>` : "";
    const mobileNav = mode === "admin" ? "" : `<nav class="bottom-nav ${mode}">${nav.map(([p, i, l]) => routeLink(p, l, i, path === p || (p !== "/home" && path.startsWith(p)), mode === "citizen" && p === "/report/capture")).join("")}</nav>`;
    return `<div class="app-shell ${mode}">${desktopAdmin}${mobileAdmin}<div class="app-main"><header class="topbar"><div class="topbar-copy">${mode === "admin" ? `<button class="icon-button drawer-toggle" data-open-drawer="1"><span class="material-symbols-outlined">menu</span></button>` : ""}<div class="eyebrow">${mode === "admin" ? "Municipal Panel" : mode === "worker" ? "Cleanup Worker" : "Citizen Flow"}</div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div><div class="topbar-actions">${showLogout ? `<button class="button secondary compact" data-open-logout="1">Logout</button>` : ""}</div></header><main class="content">${body}</main></div>${mobileNav}</div>`;
}
function overlayModal() {
  if (uiState.permissionPrompt) {
    const copy = permissionCopy[uiState.permissionPrompt.kind] || permissionCopy.device;
    const kind = uiState.permissionPrompt.kind;
    const iconMap = {
      device: "location_on",
      location: "location_on",
      camera: "photo_camera",
      gallery: "collections",
      notifications: "notifications_active",
    };
    const icon = iconMap[kind] || "shield";
    const focusItems = {
      device: ["Location", "Camera", "Video", "Files & Photos"],
      location: ["Location"],
      camera: ["Camera"],
      gallery: ["Photos & Videos"],
      notifications: ["Push notifications"],
    }[kind] || ["Access"];
    return `<div class="overlay permission-overlay"><div class="dialog-card permission-dialog"><div class="permission-top"><span class="permission-icon"><span class="material-symbols-outlined">${icon}</span></span><h3>${copy.title}</h3></div><div class="permission-focus">${focusItems.map((item) => `<span class="permission-chip">${item}</span>`).join("")}</div><p class="permission-footnote">${copy.body}</p><div class="permission-options"><button type="button" class="permission-option selected" data-permission-continue="1">${copy.primary || "Allow"}</button><button type="button" class="permission-option" data-permission-cancel="1">${copy.secondary || "Not now"}</button></div></div></div>`;
  }
  if (uiState.logoutConfirm) {
    return `<div class="overlay"><div class="dialog-card"><h3>Are you sure you want to log out?</h3><div class="two-col"><button class="button ghost" data-close-logout="1">Cancel</button><button class="button primary" data-confirm-logout="1">Logout</button></div></div></div>`;
  }
  return "";
}

function renderToast() {
  if (!uiState.toast) return "";
  const { title, message, kind = "info" } = uiState.toast;
  return `<div class="toast toast-${kind}" role="status" aria-live="polite"><div class="toast-icon">${kind === "success" ? "check_circle" : kind === "warning" ? "warning" : "notifications"}</div><div class="toast-copy"><strong>${title}</strong><span>${message}</span></div><button class="toast-close" type="button" data-dismiss-toast="1" aria-label="Dismiss notification"><span class="material-symbols-outlined">close</span></button></div>`;
}
function renderSplash() {
  const startup = appService.getStartup();
  return `<section class="splash-screen"><div class="splash-bg-glow"></div><div class="splash-shape-bottom"></div><div class="splash-particles"><span></span><span></span><span></span></div><div class="splash-logo-wrap"><div class="splash-scan-ring"></div><div class="splash-lens-flash"></div><div class="splash-glow"></div><div class="splash-logo">${logoMark("sl-splash")}</div><div class="splash-copy"><h1>SwachhLens</h1><p>See Waste. Report Smart.</p></div></div><div class="splash-loader"><div class="splash-progress-track"><div class="splash-progress-fill"></div></div><small>Getting things ready…</small></div>${startup.error ? `<div class="splash-error"><div class="splash-error-card"><h3>Something went wrong</h3><p>We couldn't start SwachhLens right now.</p><button class="button secondary" data-retry-init="1">Try Again</button></div></div>` : ""}</section>`;
}
function sceneReport(s = "ob") {
  return `<svg class="scene-art" viewBox="0 0 320 300" role="img" aria-label="Capture waste with the SwachhLens camera">
  <defs>
    <linearGradient id="${s}-s1bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eaf8f1"/></linearGradient>
    <linearGradient id="${s}-s1screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6f8e5"/><stop offset="1" stop-color="#d3f3fb"/></linearGradient>
    <linearGradient id="${s}-s1cta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#06b6d4"/></linearGradient>
    <filter id="${s}-s1sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="20" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.22"/></filter>
  </defs>
  <rect width="320" height="300" rx="36" fill="url(#${s}-s1bg)"/>
  <circle cx="52" cy="44" r="40" fill="#16a34a" opacity="0.08"/>
  <circle cx="276" cy="252" r="52" fill="#06b6d4" opacity="0.10"/>
  <circle cx="168" cy="272" r="24" fill="#16a34a" opacity="0.07"/>
  <g transform="translate(92 30) rotate(-7 76 120)">
    <rect width="152" height="240" rx="26" fill="#ffffff" filter="url(#${s}-s1sh)"/>
    <rect x="5" y="5" width="142" height="230" rx="22" fill="#f8fafc"/>
    <rect x="12" y="12" width="128" height="216" rx="16" fill="url(#${s}-s1screen)"/>
    <circle cx="76" cy="40" r="8" fill="#06b6d4" opacity="0.35"/>
    <rect x="40" y="58" width="72" height="72" rx="9" fill="none" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="76" cy="94" r="22" fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.9"/>
    <circle cx="76" cy="94" r="3" fill="#22c55e"/>
    <g stroke="#06b6d4" stroke-width="4" stroke-linecap="round" fill="none">
      <path d="M40 44 V52 H32"/>
      <path d="M112 44 V52 H120"/>
      <path d="M40 148 V140 H32"/>
      <path d="M112 148 V140 H120"/>
    </g>
    <g>
      <ellipse cx="52" cy="192" rx="24" ry="6" fill="#0f172a" opacity="0.10"/>
      <rect x="36" y="160" width="28" height="32" rx="6" fill="#22c55e"/>
      <rect x="36" y="151" width="28" height="10" rx="5" fill="#16a34a"/>
      <rect x="66" y="172" width="17" height="26" rx="4.5" fill="#0ea5e9"/>
      <rect x="66" y="172" width="17" height="11" rx="4.5" fill="#38bdf8"/>
      <circle cx="92" cy="180" r="10" fill="#f59e0b"/>
      <circle cx="92" cy="180" r="4" fill="#fbbf24"/>
      <rect x="82" y="182" width="6" height="14" rx="3" fill="#16a34a"/>
    </g>
    <circle cx="76" cy="214" r="13" fill="#ffffff" stroke="#06b6d4" stroke-width="3.5"/>
    <circle cx="76" cy="214" r="8.5" fill="url(#${s}-s1cta)"/>
  </g>
  <path d="M236 92 v22" stroke="#06b6d4" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
  <circle cx="236" cy="82" r="5" fill="#06b6d4"/>
  <circle cx="236" cy="82" r="9" fill="#06b6d4" opacity="0.25"/>
</svg>`;
}
function sceneAnalyze(s = "ob") {
  return `<svg class="scene-art" viewBox="0 0 320 300" role="img" aria-label="AI analyzing a waste photo">
  <defs>
    <linearGradient id="${s}-s2bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f2fbf6"/></linearGradient>
    <linearGradient id="${s}-s2sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdeff8"/><stop offset="1" stop-color="#e9faf0"/></linearGradient>
    <linearGradient id="${s}-s2cta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#06b6d4"/></linearGradient>
    <filter id="${s}-s2sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.20"/></filter>
  </defs>
  <rect width="320" height="300" rx="36" fill="url(#${s}-s2bg)"/>
  <circle cx="64" cy="240" r="46" fill="#16a34a" opacity="0.08"/>
  <circle cx="264" cy="44" r="42" fill="#06b6d4" opacity="0.09"/>
  <g stroke="#06b6d4" stroke-width="1.4" opacity="0.5" fill="none">
    <path d="M56 66 L96 44 L134 72 L104 100 Z"/>
    <path d="M96 44 L118 24"/>
    <circle cx="118" cy="24" r="3.5" fill="#06b6d4"/>
  </g>
  <g filter="url(#${s}-s2sh)">
    <rect x="40" y="40" width="240" height="196" rx="26" fill="#ffffff"/>
    <rect x="52" y="52" width="216" height="122" rx="18" fill="url(#${s}-s2sky)"/>
    <circle cx="86" cy="76" r="12" fill="#fde68a"/>
    <path d="M52 122 q28 -18 60 -6 t64 -4 t104 -6 v68 h-228 z" fill="#d9f3e1" opacity="0.85"/>
    <g>
      <ellipse cx="182" cy="150" rx="40" ry="9" fill="#0f172a" opacity="0.12"/>
      <rect x="152" y="114" width="34" height="38" rx="7" fill="#16a34a"/>
      <rect x="152" y="104" width="34" height="11" rx="5.5" fill="#047857"/>
      <rect x="188" y="126" width="22" height="32" rx="5.5" fill="#0ea5e9"/>
      <circle cx="214" cy="124" r="12" fill="#f59e0b"/>
      <circle cx="214" cy="124" r="4.5" fill="#fbbf24"/>
    </g>
    <g class="art-scan"><rect x="66" y="0" width="188" height="3" rx="1.5" fill="url(#${s}-s2cta)" opacity="0.9"/></g>
    <g stroke="#22c55e" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.9">
      <path d="M62 62 V56 H56"/>
      <path d="M258 62 V56 H264"/>
      <path d="M62 164 V170 H56"/>
      <path d="M258 164 V170 H264"/>
    </g>
    <rect x="52" y="174" width="216" height="50" rx="18" fill="#ffffff"/>
    <rect x="66" y="188" width="204" height="22" rx="11" fill="#f0fdf4"/>
    <rect x="66" y="188" width="122" height="22" rx="11" fill="url(#${s}-s2cta)" opacity="0.85"/>
    <circle cx="80" cy="199" r="7" fill="#ffffff" opacity="0.9"/>
  </g>
</svg>`;
}
function sceneTrack(s = "ob") {
  return `<svg class="scene-art" viewBox="0 0 320 300" role="img" aria-label="Cleanup tracked to completion">
  <defs>
    <linearGradient id="${s}-s3bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eff9f4"/></linearGradient>
    <linearGradient id="${s}-s3cta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#06b6d4"/></linearGradient>
    <filter id="${s}-s3sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.18"/></filter>
  </defs>
  <rect width="320" height="300" rx="36" fill="url(#${s}-s3bg)"/>
  <circle cx="74" cy="242" r="46" fill="#06b6d4" opacity="0.09"/>
  <circle cx="268" cy="50" r="38" fill="#16a34a" opacity="0.08"/>
  <g filter="url(#${s}-s3sh)">
    <circle cx="160" cy="112" r="64" fill="#e9f9f0"/>
    <circle cx="160" cy="112" r="56" fill="url(#${s}-s3cta)"/>
    <circle cx="160" cy="112" r="44" fill="#ffffff"/>
    <path class="art-check" d="M141 114 l14 14 l28 -32" fill="none" stroke="url(#${s}-s3cta)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g fill="#06b6d4" opacity="0.85">
    <path d="M260 96 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z"/>
    <path d="M86 58 l2.4 6.4 6.4 2.4 -6.4 2.4 -2.4 6.4 -2.4 -6.4 -6.4 -2.4 6.4 -2.4 z" opacity="0.7"/>
    <circle cx="70" cy="146" r="3"/>
    <circle cx="252" cy="150" r="2.5"/>
  </g>
  <g transform="translate(60 214)">
    <rect width="200" height="12" rx="6" fill="#e6f0eb"/>
    <rect width="136" height="12" rx="6" fill="url(#${s}-s3cta)"/>
    <circle cx="136" cy="6" r="9" fill="#ffffff" stroke="url(#${s}-s3cta)" stroke-width="3.5"/>
  </g>
  <g transform="translate(56 252)">
    <rect x="0" y="14" width="208" height="2" rx="1" fill="#d5e6dc"/>
    <circle cx="0" cy="15" r="7" fill="url(#${s}-s3cta)"/>
    <circle cx="69" cy="15" r="7" fill="url(#${s}-s3cta)"/>
    <circle cx="139" cy="15" r="7" fill="url(#${s}-s3cta)"/>
    <circle cx="208" cy="15" r="7" fill="#ffffff" stroke="url(#${s}-s3cta)" stroke-width="3"/>
    <path d="M203.6 12.6 l3.4 3.4 6 -6.8" fill="none" stroke="url(#${s}-s3cta)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}
function renderOnboardingVisual(slide) {
  if (slide.id === "onboard-1") {
    return `<div class="onboarding-visual camera-scene">${sceneReport()}<div class="floating-card waste-pin"><span class="material-symbols-outlined">location_on</span><strong>Waste spot</strong><small>Tagged live</small></div><div class="floating-card capture-chip"><span class="material-symbols-outlined">photo_camera</span><small>Photo or video</small></div></div>`;
  }
  if (slide.id === "onboard-2") {
    return `<div class="onboarding-visual ai-scene">${sceneAnalyze()}<div class="chip-row onboard-chips"><span class="result-chip">Plastic Waste</span><span class="result-chip">~5 kg volume</span><span class="result-chip priority">High Priority</span></div><div class="floating-card ai-badge"><span class="material-symbols-outlined">auto_awesome</span><small>AI Review</small></div></div>`;
  }
  return `<div class="onboarding-visual cleanup-scene">${sceneTrack()}<div class="floating-card city-badge"><span class="material-symbols-outlined">task_alt</span><small>Cleaner city</small></div></div>`;
}

function setOnboardingIndex(nextIndex, direction = 1) {
  const slides = appService.getOnboardingSlides();
  uiState.onboardingIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
  uiState.onboardingDirection = direction;
  renderApp();
}

function renderOnboarding() {
  const slides = appService.getOnboardingSlides();
  const slide = slides[uiState.onboardingIndex];
  const isLast = uiState.onboardingIndex === slides.length - 1;
  const directionClass = uiState.onboardingDirection < 0 ? "reverse" : "forward";
  return `<section class="auth-shell onboarding-shell"><div class="onboarding-screen"><div class="onboarding-bg bg-left"></div><div class="onboarding-bg bg-right"></div><header class="onboarding-topbar"><div class="onboarding-brand"><div class="mini-logo">SL</div><span>SwachhLens</span></div><button class="text-action onboarding-skip" type="button" data-skip-onboarding="1" aria-label="Skip onboarding">Skip</button></header><div class="onboarding-stage ${directionClass}" data-onboarding-track="1"><div class="onboarding-hero">${renderOnboardingVisual(slide)}</div><div class="onboarding-copy">${slide.label ? `<div class="eyebrow cyan">${slide.label}</div>` : ""}<h2>${slide.title}</h2><p>${slide.body}</p></div></div><footer class="onboarding-footer"><div class="page-indicator" aria-label="Onboarding progress">${slides.map((item, index) => `<span class="${index === uiState.onboardingIndex ? "active" : ""}" aria-label="Step ${index + 1} of ${slides.length}${index === uiState.onboardingIndex ? ", current step" : ""}"></span>`).join("")}</div><button class="button primary onboarding-cta" type="button" ${isLast ? 'data-complete-onboarding="1"' : 'data-next-onboarding="1"'}>${isLast ? "Get Started" : "Next"}</button></footer></div></section>`;
}
function authField({ name, type = "text", label, icon, autocomplete = "", inputMode = "", required = true, optional = false, password = false }) {
  const attrs = [
    `name="${name}"`,
    `type="${type}"`,
    `placeholder=" "`,
    autocomplete ? `autocomplete="${autocomplete}"` : "",
    inputMode ? `inputmode="${inputMode}"` : "",
    required && !optional ? "required" : "",
  ].filter(Boolean).join(" ");
  return `<label class="auth-input-field ${password ? "password-field" : ""}"><span class="material-symbols-outlined input-icon">${icon}</span><input ${attrs} /><span class="floating-label">${label}</span>${password ? `<button type="button" class="icon-button inline auth-visibility" data-toggle-password="1"><span class="material-symbols-outlined">visibility</span></button>` : ""}</label>`;
}
function renderWelcome() {
  return `<section class="auth-shell auth-screen welcome-screen"><div class="welcome-card"><div class="welcome-brand-row"><div class="auth-brand-mark"><div class="mini-logo">${logoMark("sl-welcome")}</div><span>SwachhLens</span></div><span class="welcome-badge">Citizen reporting</span></div><div class="welcome-visual-wrap"><div class="welcome-visual">${sceneReport("wm")}</div></div><div class="welcome-hero"><div class="eyebrow cyan">Community-first reporting</div><h2>A cleaner city starts with you.</h2><p>Report waste in seconds, get AI-assisted triage, and track the cleanup from start to finish.</p></div><div class="welcome-feature-grid"><div class="feature-pill"><span class="material-symbols-outlined">verified</span><span>AI-verified</span></div><div class="feature-pill"><span class="material-symbols-outlined">bolt</span><span>Fast reporting</span></div><div class="feature-pill"><span class="material-symbols-outlined">track_changes</span><span>Live updates</span></div><div class="feature-pill"><span class="material-symbols-outlined">groups</span><span>Community action</span></div></div><div class="welcome-actions"><button class="button primary" data-go-signup="1">Create Account</button><button class="button secondary" data-go-login="1">Sign In</button></div></div></section>`;
}
function renderAuth() {
  const isSignup = uiState.authMode === "signup";
  const forgotMode = uiState.forgotMode;
  const phoneMode = uiState.phoneMode;
  const submitLabel = forgotMode ? "Send Reset Link" : isSignup ? "Create Account" : "Sign In";
  const title = phoneMode ? "Phone sign-in" : forgotMode ? "Reset your password" : isSignup ? "Create your account" : "Welcome back";
  const subtitle = phoneMode
    ? "Enter your phone number and we will send a one-time verification code."
    : forgotMode
      ? "Enter your email and we will send you a password reset link."
      : isSignup
        ? "Join your community in keeping the city cleaner."
        : "Sign in to continue making your city cleaner.";
  const phoneSection = !forgotMode && !isSignup ? `
    <div class="social-divider"><span></span><em>or sign in with phone</em><span></span></div>
    <div class="phone-otp-section">
      ${!uiState.otpSent
        ? `<label class="auth-input-field"><span class="material-symbols-outlined input-icon">phone</span><input name="phone" type="tel" placeholder=" " autocomplete="tel" inputmode="tel" required /><span class="floating-label">Phone number</span></label><button type="button" class="button secondary phone-send-btn" data-send-otp="1" ${uiState.phoneSending ? "disabled" : ""}>${uiState.phoneSending ? '<span class="button-spinner"></span><span>Sending…</span>' : "Send OTP"}</button>`
        : `<div class="alert info">OTP sent. Enter the 6-digit code below.</div><label class="auth-input-field"><span class="material-symbols-outlined input-icon">pin</span><input name="otpCode" type="text" placeholder=" " inputmode="numeric" pattern="[0-9]*" maxlength="6" required autocomplete="one-time-code" /><span class="floating-label">Enter OTP code</span></label><button type="button" class="button primary" data-verify-otp="1">Verify & Sign In</button>`}
      <div id="recaptcha-container"></div>
    </div>` : "";
  return `<section class="auth-shell auth-screen refined-auth-screen"><div class="auth-brand-mark top-brand"><div class="mini-logo">${logoMark("sl-auth")}</div><span>SwachhLens</span></div><div class="auth-intro">${phoneMode ? `<button class="inline-back" type="button" data-back-to-login="1"><span class="material-symbols-outlined">arrow_back</span></button>` : forgotMode ? `<button class="inline-back" type="button" data-back-to-login="1"><span class="material-symbols-outlined">arrow_back</span></button>` : `<div class="eyebrow cyan">${isSignup ? "Join SwachhLens" : "Welcome to SwachhLens"}</div>`}<h2>${title}</h2><p>${subtitle}</p></div>${isSignup && !forgotMode ? `<ul class="benefit-row">${[["Free for citizens", "verified"], ["AI-verified reports", "auto_awesome"], ["Live cleanup tracking", "track_changes"]].map(([label, icon]) => `<li><span class="material-symbols-outlined">${icon}</span>${label}</li>`).join("")}</ul>` : ""}${uiState.authError ? `<div class="alert error">${uiState.authError}</div>` : ""}${uiState.authInfo ? `<div class="alert info">${uiState.authInfo}</div>` : ""}${phoneMode ? `<div class="phone-otp-section">${!uiState.otpSent ? `<label class="auth-input-field"><span class="material-symbols-outlined input-icon">phone</span><input name="phone" type="tel" placeholder=" " autocomplete="tel" inputmode="tel" required /><span class="floating-label">Phone number</span></label><button type="button" class="button primary phone-send-btn" data-send-otp="1" ${uiState.phoneSending ? "disabled" : ""}>${uiState.phoneSending ? '<span class="button-spinner"></span><span>Sending…</span>' : "Send OTP"}</button>` : `<div class="alert info">OTP sent. Enter the 6-digit code below.</div><label class="auth-input-field"><span class="material-symbols-outlined input-icon">pin</span><input name="otpCode" type="text" placeholder=" " inputmode="numeric" pattern="[0-9]*" maxlength="6" required autocomplete="one-time-code" /><span class="floating-label">Enter OTP code</span></label><button type="button" class="button primary" data-verify-otp="1">Verify & Sign In</button>`}<div id="recaptcha-container"></div></div>` : `<form id="authForm" class="form-stack auth-form auth-form-premium">${forgotMode ? authField({ name: "email", type: "email", label: "Email address", icon: "mail", autocomplete: "email" }) : `${isSignup ? authField({ name: "name", label: "Full Name", icon: "person", autocomplete: "name" }) : ""}${authField({ name: "email", type: "email", label: "Email address", icon: "mail", autocomplete: "email" })}${isSignup ? authField({ name: "password", type: "password", label: "Password", icon: "lock", autocomplete: "new-password", password: true }) : authField({ name: "password", type: "password", label: "Password", icon: "lock", autocomplete: "current-password", password: true })}${isSignup ? `<div class="password-strength"><div class="strength-bar"><span id="passwordStrengthBar"></span></div><small id="passwordStrengthText">At least 8 characters</small></div>${authField({ name: "confirmPassword", type: "password", label: "Confirm Password", icon: "verified_user", autocomplete: "new-password", password: true })}` : `<button type="button" class="text-action align-right" data-forgot-password="1">Forgot password?</button>`}`}<button class="button primary auth-submit" type="submit" ${uiState.authSubmitting ? "disabled" : ""}>${uiState.authSubmitting ? `<span class="button-spinner"></span><span>${submitLabel}</span>` : submitLabel}</button>${forgotMode ? `<button type="button" class="button ghost" data-back-to-login="1">Back to Sign In</button>` : `${!isSignup ? `<div class="social-divider"><span></span><em>or continue with</em><span></span></div><button type="button" class="button social-button" data-google-auth="1"><span class="google-mark">G</span><span>Continue with Google</span></button>${phoneSection}` : ""}<div class="auth-switch-row"><span>${isSignup ? "Already have an account?" : "New to SwachhLens?"}</span><button type="button" class="text-action" data-toggle-auth="1">${isSignup ? "Sign In" : "Create Account"}</button></div>`}</form>`}</section>`;
}
function startupGate() {
  const startup = appService.getStartup();
  const path = currentPath();
  if (path === "/design-library") return renderDesignLibrary();
  if (startup.appState === APP_STATES.INITIALIZING) return renderSplash();
  if (startup.appState === APP_STATES.FIRST_TIME_USER) return renderOnboarding();
  if (startup.appState === APP_STATES.ACCOUNT_DISABLED) return `<section class="auth-shell"><div class="auth-card"><h2>Account unavailable</h2><p>Your account is currently disabled. Please contact the appropriate administrator.</p><button class="button secondary" data-open-logout="1">Return</button></div></section>`;
  if ([APP_STATES.UNAUTHENTICATED, APP_STATES.NETWORK_ERROR, APP_STATES.STARTUP_ERROR].includes(startup.appState)) {
    return uiState.authMode === "welcome" ? renderWelcome() : renderAuth();
  }
  const snap = authService.getSessionSnapshot();
  if (!snap.currentUser) return uiState.authMode === "welcome" ? renderWelcome() : renderAuth();
  return null;
}
function protectRoute(profile) {
  const path = currentPath();
  const role = profile && profile.role;
  if (path === "/design-library") return true;
  if (!profile) {
    if (!["/login", "/signup", "/reset-password", ""].includes(path)) {
      return false;
    }
    return true;
  }
  if (path.startsWith("/admin") && !(role === "admin" || role === "super_admin" || role === "ward_officer" || role === "sanitation_supervisor")) {
    return false;
  }
  if (path.startsWith("/worker") && role !== "cleanup_worker") {
    return false;
  }
  return true;
}
function renderAdminDashboard() {
  const reports = reportService.getReports();
  const teams = teamService.getTeams();
  return shell({
    title: "Operations Command Center",
    subtitle: "Real-time overview of municipal waste management operations.",
    mode: "admin",
    body: `<section class="stats-grid admin"><article class="stat-card"><span>Open Complaints</span><strong>${reports.filter((item) => item.status !== "resolved").length}</strong></article><article class="stat-card critical"><span>Critical Complaints</span><strong>${reports.filter((item) => item.severity === "critical").length}</strong></article><article class="stat-card"><span>Resolved Today</span><strong>${reports.filter((item) => item.status === "resolved").length}</strong></article><article class="stat-card"><span>Teams Available</span><strong>${teams.filter((item) => item.status === "available").length}</strong></article></section><section class="panel"><div class="section-head"><h3>Requires Immediate Attention</h3><button class="button ghost" data-nav="/admin/priority">View All</button></div>${reports.filter((item) => item.priorityScore >= 80).map((report) => `<article class="list-card clickable" data-nav="/admin/complaints/${report.id}"><img src="${report.image}" alt="${report.wasteType}" /><div><div class="card-head"><strong>${report.wasteType}</strong>${severityBadge(report)}</div><p>${report.address}</p><div class="inline-meta"><span>Priority ${report.priorityScore}</span>${statusBadge(report.status)}</div></div></article>`).join("")}</section>`,
    showLogout: true,
  });
}
function renderAdminPriority() {
  const reports = reportService.getReports().sort((a, b) => b.priorityScore - a.priorityScore);
  return shell({
    title: "AI Priority Queue",
    subtitle: "Explainable, sortable queue for high-impact complaints.",
    mode: "admin",
    body: `<section class="panel">${reports.map((report) => `<article class="list-card clickable" data-nav="/admin/complaints/${report.id}"><img src="${report.image}" alt="${report.wasteType}" /><div><div class="card-head"><strong>${report.wasteType}</strong><span class="badge">Priority ${report.priorityScore}</span></div><p>${report.address}</p><div class="info-line">Why this priority? ${report.potentialRisk}</div></div></article>`).join("")}</section>`,
    showLogout: true,
  });
}
function renderAdminComplaint(id) {
  const report = reportService.getReportById(id);
  const teams = teamService.getTeams();
  return shell({
    title: `Complaint ${report.id}`,
    subtitle: "Review, modify, assign, or escalate the AI recommendation.",
    mode: "admin",
    body: `<section class="panel form-stack">${mediaPreview(report)}<div class="metrics-grid"><article><span>Waste Type</span><strong>${report.wasteType}</strong></article><article><span>AI Confidence</span><strong>${report.aiConfidence}%</strong></article><article><span>Volume</span><strong>${report.estimatedVolume}</strong></article><article><span>Priority</span><strong>${report.priorityScore}</strong></article></div><div class="info-card"><strong>Risk</strong><p>${report.potentialRisk}</p></div><div class="info-card"><strong>Recommendation</strong><p>${report.recommendation}</p></div><select id="teamAssign"><option value="">Choose a team</option>${teams.map((team) => `<option value="${team.id}">${team.name} - ${team.vehicle} - ${team.aiMatchScore}% match</option>`).join("")}</select>${stickyActions(`<button class="button secondary" data-nav="/admin/dispatch/${report.id}">Smart Dispatch</button><button class="button primary" data-assign-report="${report.id}">Assign Team</button>`)}</section>`,
    showLogout: true,
  });
}
function renderDispatch(id) {
  const report = reportService.getReportById(id);
  const teams = teamService.getTeams().sort((a, b) => b.aiMatchScore - a.aiMatchScore);
  return shell({
    title: "Smart Dispatch",
    subtitle: "Recommended response unit based on location, load, and equipment fit.",
    mode: "admin",
    body: `<section class="panel form-stack"><div class="info-card accent"><strong>${report.wasteType}</strong><p>${report.address}</p></div>${teams.map((team, index) => `<article class="info-card"><strong>${team.name} ${index === 0 ? "- Recommended" : ""}</strong><p>${team.vehicle} - ${team.members} workers - ${team.distanceKm} km - ETA ${team.etaMinutes} min - Match ${team.aiMatchScore}%</p></article>`).join("")}<button class="button primary" data-smart-dispatch="${report.id}" data-team="${teams[0] && teams[0].id ? teams[0].id : ""}">Dispatch Recommended Team</button></section>`,
    showLogout: true,
  });
}
function renderVerification() {
  const reports = reportService.getReports().filter((report) => report.status === "verification" || report.afterImage);
  return shell({
    title: "Verification Queue",
    subtitle: "Before and after evidence waiting for municipal sign-off.",
    mode: "admin",
    body: `<section class="panel">${reports.length ? reports.map((report) => `<article class="list-card"><img src="${report.afterImage || report.image}" alt="${report.wasteType}" /><div><div class="card-head"><strong>${report.wasteType}</strong>${statusBadge(report.status)}</div><p>${report.address}</p><button class="button secondary" data-verify-report="${report.id}">Verify & Resolve</button></div></article>`).join("") : `<div class="empty-state">No reports are waiting for verification.</div>`}</section>`,
    showLogout: true,
  });
}
function renderWorkerTasks() {
  const reports = reportService.getReports().filter((report) => report.assignedTeam);
  return shell({
    title: "Assigned Tasks",
    subtitle: "Priority-based cleanup queue for the active field team.",
    mode: "worker",
    body: `<section class="panel">${reports.length ? reports.map((report) => `<article class="list-card clickable" data-nav="/worker/tasks/${report.id}"><img src="${report.image}" alt="${report.wasteType}" /><div><div class="card-head"><strong>${report.wasteType}</strong>${severityBadge(report)}</div><p>${report.address}</p><div class="inline-meta"><span>${report.estimatedVolume}</span>${statusBadge(report.status)}</div></div></article>`).join("") : `<div class="empty-state">No active cleanup tasks are assigned right now.</div>`}</section>`,
    showLogout: true,
  });
}
function renderWorkerTask(id) {
  const report = reportService.getReportById(id);
  const preview = uiState.workerAfterPhoto.reportId === report.id ? uiState.workerAfterPhoto.dataUrl : "";
  const afterImage = preview || report.afterImage;
  const canComplete = report.status === "cleanup_in_progress" && Boolean(afterImage);
  return shell({
    title: "Task In Progress",
    subtitle: "Move the job from assigned through verification with evidence.",
    mode: "worker",
    body: `<section class="panel form-stack">${mediaPreview(report)}<div class="timeline-card vertical-timeline">${["assigned", "en_route", "cleanup_in_progress"].map((status) => `<button class="timeline-node action-node ${report.status === status ? "done" : ""}" data-worker-status="${status}" data-report="${report.id}">${statusLabels[status]}</button>`).join("")}</div><div class="info-card accent"><strong>After Cleanup Evidence</strong><p>Upload a clear after photo once cleanup is finished. You can only complete the task after cleanup has started and the after photo is attached.</p></div>${afterImage ? `<img class="hero-image after-photo-preview" src="${afterImage}" alt="After cleanup evidence" />` : ""}<label class="upload-field"><span>Upload After Photo</span><input type="file" accept="image/*" id="afterImageInput" data-report-id="${report.id}" /></label><button class="button primary" data-worker-complete="${report.id}" ${canComplete ? "" : "disabled"}>Mark Complete</button></section>`,
    showLogout: true,
  });
}
function renderAuthenticatedApp(state) {
  const raw = window.location.hash.replace(/^#/, "");
  const path = raw || "/home";
  const role = state.currentRole;
  const routes = [
    [/^\/home$/, renderHome],
    [/^\/report\/capture$/, renderCapture],
    [/^\/report\/analyzing$/, renderAnalyzing],
    [/^\/report\/result$/, renderResult],
    [/^\/report\/review$/, renderReview],
    [/^\/report\/success\/(.+)$/, (match) => renderSuccess(match[1])],
    [/^\/reports$/, renderReports],
    [/^\/reports\/(.+)$/, (match) => renderReportDetail(match[1])],
    [/^\/explore$/, renderExplore],
    [/^\/design-library$/, renderDesignLibrary],
    [/^\/notifications$/, renderNotifications],
    [/^\/profile$/, renderProfile],
    [/^\/admin\/dashboard$/, renderAdminDashboard],
    [/^\/admin\/priority$/, renderAdminPriority],
    [/^\/admin\/complaints$/, renderAdminPriority],
    [/^\/admin\/complaints\/(.+)$/, (match) => renderAdminComplaint(match[1])],
    [/^\/admin\/dispatch\/(.+)$/, (match) => renderDispatch(match[1])],
    [/^\/admin\/dispatch$/, renderAdminPriority],
    [/^\/admin\/verification$/, renderVerification],
    [/^\/worker\/tasks$/, renderWorkerTasks],
    [/^\/worker\/tasks\/(.+)$/, (match) => renderWorkerTask(match[1])],
    [/^\/worker\/map$/, renderExplore],
    [/^\/worker\/history$/, renderReports],
  ];
  if (!state.currentUser) {
    if (path === "/design-library") return renderDesignLibrary();
    if (path === "/signup") { uiState.authMode = "signup"; }
    if (path === "/reset-password") { uiState.forgotMode = true; }
    return renderAuth();
  }
  if (!protectRoute(state.currentUser)) {
    const target = roleRoutes[state.currentUser.role] || "/home";
    if (currentPath() !== target) navigate(target);
    const targetMatch = routes.find(([regex]) => regex.test(target));
    return targetMatch ? targetMatch[1](target.match(targetMatch[0])) : renderHome();
  }
  if (!raw || raw === "/") {
    const target = roleRoutes[role];
    if (currentPath() !== target) navigate(target);
    const targetMatch = routes.find(([regex]) => regex.test(target));
    return targetMatch ? targetMatch[1](target.match(targetMatch[0])) : renderHome();
  }
  if (["/login", "/signup", "/reset-password"].includes(path)) {
    ensureHash(roleRoutes[role]);
    return renderHome();
  }
  const match = routes.find(([regex]) => regex.test(path));
  return match ? match[1](path.match(match[0])) : renderHome();
}
let splashExiting = false;
function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
async function beginSplashExit() {
    if (splashExiting) return;
    splashExiting = true;
    const splash = document.querySelector(".splash-screen");
    if (splash) {
        splash.classList.add("splash-exit");
        await delay(prefersReducedMotion() ? 0 : 330);
    }
    splashExiting = false;
    const stale = document.querySelector(".splash-screen");
    if (stale) stale.remove();
    renderApp(true);
}
function renderApp(entering = false) {
  const state = getStateSnapshot();
  const appState = state.startup.appState;
  if (currentPath() === "/design-library") {
    app.innerHTML = `${renderDesignLibrary()}${renderToast()}${overlayModal()}`;
    attachHandlers();
    return;
  }
  if (appState === APP_STATES.INITIALIZING) {
    app.innerHTML = `${renderSplash()}${overlayModal()}`;
    attachHandlers();
    scheduleSlowLoader();
    return;
  }
  if (document.querySelector(".splash-screen")) {
    if ([APP_STATES.NETWORK_ERROR, APP_STATES.STARTUP_ERROR].includes(appState)) {
      app.innerHTML = `${renderSplash()}${overlayModal()}`;
      attachHandlers();
      return;
    }
    beginSplashExit();
    return;
  }
  const gated = startupGate();
  const markup = gated || (state.currentUser ? renderAuthenticatedApp(state) : renderAuth());
  app.innerHTML = `${markup}${renderToast()}${overlayModal()}`;
  if (entering) {
    const root = app.firstElementChild;
    if (root) root.classList.add("screen-enter");
  }
  attachHandlers();
}
async function handlePermissionContinue() {
  const prompt = uiState.permissionPrompt;
  if (!prompt) return;
  if (prompt.kind === "device") {
    const result = await permissionService.requestDevicePermissions();
    if (result.location.location) reportService.updateDraft({ location: result.location.location });
    uiState.permissionPrompt = null;
    if (result.camera === "granted" || result.video === "granted" || result.audio === "granted" || result.location.status === "granted") {
      showToast("Permissions enabled", "Location, camera, video and audio are ready for reporting.", "success", 3200);
    } else {
      showToast("Permissions skipped", "You can enable them later from Settings.", "warning", 3200);
    }
    if ("Notification" in window && permissionService.shouldPromptNotifications()) {
      uiState.permissionPrompt = { kind: "notifications" };
    }
    renderApp();
    return;
  }
  if (prompt.kind === "location") {
    const result = await permissionService.requestLocation();
    if (result.location) reportService.updateDraft({ location: result.location });
    uiState.permissionPrompt = null;
    renderApp();
    return;
  }
  if (prompt.kind === "notifications") {
    await permissionService.requestNotifications();
    uiState.permissionPrompt = null;
    uiState.afterSubmitPrompt = false;
    renderApp();
    return;
  }
  if (prompt.kind === "camera") {
    permissionService.markCameraGranted();
    const target = document.querySelector(prompt.target);
    if (target) target.click();
  }
  if (prompt.kind === "gallery") {
    permissionService.markGalleryGranted();
    const target = document.querySelector(prompt.target);
    if (target) target.click();
  }
  uiState.permissionPrompt = null;
  renderApp();
}
function renderHome() {
  const state = getStateSnapshot();
  const reports = state.reports.filter((r) => r.userId === state.currentUser.uid);
  const active = reports.filter((r) => r.status !== "resolved").length;
  return shell({
    title: `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}`,
    subtitle: "Let's make your neighborhood cleaner.",
    body: `<section class="hero-card"><div class="eyebrow cyan">AI Powered Reporting</div><h2>See waste around you? Capture it and SwachhLens will handle the rest.</h2><button class="button primary" data-nav="/report/capture">Report Waste</button></section><section class="stats-grid"><article class="stat-card"><span>Your Reports</span><strong>${reports.length}</strong></article><article class="stat-card"><span>Resolved</span><strong>${reports.filter((r) => r.status === "resolved").length}</strong></article><article class="stat-card"><span>In Progress</span><strong>${active}</strong></article></section><section class="panel"><div class="section-head"><h3>Nearby Reports</h3><button class="button ghost" data-nav="/explore">View Map</button></div>${reports.slice(0, 2).map((report) => `<article class="list-card"><img src="${report.image}" alt="${report.wasteType}" /><div><div class="card-head"><strong>${report.wasteType}</strong>${severityBadge(report)}</div><p>${report.address}</p><div class="inline-meta">${statusBadge(report.status)}<span>${fmtDate(report.createdAt)}</span></div></div></article>`).join("")}</section>`,
    showLogout: true,
  });
}
function renderCapture() {
  const draft = reportService.getDraft();
  const permissions = permissionService.getStatuses();
  const locationText = draft.location && draft.location.address ? draft.location.address : (permissions.location === "denied" || permissions.location === "blocked" ? "Choose location manually if GPS is unavailable." : "Location will be captured when needed.");
  return shell({
    title: "Capture the Waste",
    subtitle: "Keep the complete waste area visible.",
    body: `<section class="capture-stage"><div class="camera-card">${mediaPreview(draft, "preview-fill") || `<div class="camera-placeholder"><span class="material-symbols-outlined">photo_camera</span><p>Take a photo or record a short video.</p></div>`}<div class="targeting-reticle"></div></div><div class="panel"><div class="step-indicator"><span class="active"></span><span></span><span></span></div><div class="permission-summary"><span>Camera: ${permissions.camera}</span><span>Location: ${permissions.location}</span></div><div class="two-col"><button class="button primary" data-request-media="camera-image">Take Photo</button><button class="button secondary" data-request-media="gallery-image">Upload Photo</button></div><div class="two-col"><button class="button secondary" data-request-media="camera-video">Record Video</button><button class="button ghost" data-request-media="gallery-video">Upload Video</button></div><input id="cameraImageInput" type="file" accept="image/*" capture="environment" hidden /><input id="galleryImageInput" type="file" accept="image/*" hidden /><input id="cameraVideoInput" type="file" accept="video/*" capture="environment" hidden /><input id="galleryVideoInput" type="file" accept="video/*" hidden /><div class="info-card"><strong>Location</strong><p>${locationText}</p></div><div class="two-col"><button class="button secondary" data-request-location="1">Capture Location</button><button class="button ghost" data-nav="/report/review">Choose Manually</button></div><textarea id="commentInput" rows="4" placeholder="Optional note for the municipal team">${draft.comment ? draft.comment : ""}</textarea>${stickyActions(`<button class="button ghost" data-reset-draft="1">Reset</button><button class="button primary" data-nav="${draft.image || draft.video ? "/report/analyzing" : "/report/capture"}" ${(draft.image || draft.video) ? "" : "disabled"}>Analyze Waste</button>`)}</div></section>`,
    showLogout: true,
  });
}
function renderAnalyzing() {
  const draft = reportService.getDraft();
  const progress = draft.analysisStage || "Preparing AI scan";
  return shell({
    title: "AI Waste Analysis",
    subtitle: "We're turning the captured report into actionable municipal data.",
    body: `<section class="panel"><div class="analysis-hero">${mediaPreview(draft)}<div><div class="eyebrow cyan">Live AI Scan</div><h3>${progress}</h3><div class="progress-stack">${analysisSteps.map((step) => `<div class="progress-step ${progress === step ? "active" : ""}">${step}</div>`).join("")}</div></div></div></section>`,
    showLogout: true,
  });
}
function renderResult() {
  const draft = reportService.getDraft();
  const result = draft.aiResult;
  const duplicate = draft.duplicateMatch;
  return shell({
    title: "AI Results",
    subtitle: "Review the analysis before submitting the report.",
    body: `<section class="panel form-stack"><div class="analysis-hero">${mediaPreview(draft)}<div class="metrics-grid"><article><span>Waste Type</span><strong>${result.wasteType}</strong></article><article><span>Confidence</span><strong>${result.confidence}%</strong></article><article><span>Estimated Volume</span><strong>${result.estimatedVolume}</strong></article><article><span>Severity</span><strong>${result.severity}</strong></article></div></div><div class="info-card"><strong>Potential Risk</strong><p>${result.potentialRisk}</p></div><div class="info-card"><strong>AI Recommendation</strong><p>${result.recommendation}</p></div>${duplicate ? `<div class="info-card accent"><strong>Similar Report Found</strong><div class="list-card compact"><img src="${duplicate.image}" alt="Similar report" /><div><p>${duplicate.distance}</p><p>${duplicate.age} • ${duplicate.status}</p></div></div><div class="two-col"><button class="button secondary" data-nav="/reports/${duplicate.reportId}">Support Existing Report</button><button class="button ghost" data-nav="/report/review">Create New Report</button></div></div>` : ""}${stickyActions(`<button class="button ghost" data-nav="/report/capture">Retake</button><button class="button primary" data-nav="/report/review">Continue</button>`)}</section>`,
    showLogout: true,
  });
}
function renderReview() {
  const draft = reportService.getDraft();
  return shell({
    title: "Review Report",
    subtitle: "Check the captured media, location, and AI result before sending.",
    body: `<section class="panel form-stack">${mediaPreview(draft)}<div class="info-card"><strong>Location</strong><p>${draft.location && draft.location.address ? draft.location.address : "Manual location can be added here if permission is denied."}</p></div><div class="info-card"><strong>Citizen Comment</strong><p>${draft.comment || "No additional note added."}</p></div><div class="info-card"><strong>AI Classification</strong><p>${draft.aiResult && draft.aiResult.wasteType ? draft.aiResult.wasteType : "Pending analysis"}</p></div><textarea id="manualAddress" rows="3" placeholder="If needed, add or correct the location">${draft.location && draft.location.address ? draft.location.address : ""}</textarea>${stickyActions(`<button class="button secondary" data-nav="/report/result">Edit AI Result</button><button class="button primary" data-submit-report="1" ${draft.aiResult ? "" : "disabled"}>Submit Report</button>`)}</section>`,
    showLogout: true,
  });
}
function renderSuccess(id) {
  const report = reportService.getReportById(id) || getStateSnapshot().reports[0];
  const shouldShowNotificationPrompt = Boolean(uiState.permissionPrompt && uiState.permissionPrompt.kind === "notifications") || Boolean(uiState.afterSubmitPrompt && "Notification" in window && Notification.permission !== "granted" && permissionService.shouldPromptNotifications());
  return shell({
    title: "Report Submitted",
    subtitle: "Your issue has been added to the response workflow.",
    body: `<section class="panel success-panel"><div class="success-badge">Success</div><h2>${report.id}</h2><p>Priority score ${report.priorityScore} - ${statusLabels[report.status]}</p><div class="timeline-card vertical-timeline">${["submitted", "ai_analyzed", "under_review", "assigned", "resolved"].map((status) => `<div class="timeline-node ${report.statusTimeline.some((item) => item.status === status) ? "done" : ""}">${statusLabels[status]}</div>`).join("")}</div>${shouldShowNotificationPrompt ? `<div class="info-card accent"><strong>Stay updated about your report</strong><p>Enable notifications to know when a cleanup team is assigned or your report is resolved.</p><div class="two-col"><button class="button ghost" data-skip-notifications="1">Not Now</button><button class="button primary" data-enable-notifications="1">Enable Notifications</button></div></div>` : ""}${stickyActions(`<button class="button secondary" data-nav="/reports/${report.id}">Track Report</button><button class="button ghost" data-nav="/home">Back Home</button>`)}</section>`,
    showLogout: true,
  });
}
function renderReports() {
  const state = getStateSnapshot();
  const reports = state.reports.filter((report) => report.userId === state.currentUser.uid || state.currentRole !== "citizen");
  return shell({
    title: "My Reports",
    subtitle: "Track every report from AI analysis through cleanup verification.",
    body: `<section class="panel">${reports.length ? reports.map((report) => `<article class="list-card clickable" data-nav="/reports/${report.id}"><img src="${report.image || report.afterImage}" alt="${report.wasteType}" /><div><div class="card-head"><strong>${report.wasteType}</strong>${severityBadge(report)}</div><p>${report.address}</p><div class="inline-meta">${statusBadge(report.status)}<span>${fmtDate(report.createdAt)}</span></div></div></article>`).join("") : `<div class="empty-state">No reports yet. Create your first report to start tracking cleanup progress.</div>`}</section>`,
    showLogout: true,
  });
}
function renderReportDetail(id) {
  const report = reportService.getReportById(id);
  if (!report) return renderHome();
  const team = teamService.getTeams().find((item) => item.id === report.assignedTeam);
  return shell({
    title: "Report Details",
    subtitle: "Live timeline and cleanup progress for your complaint.",
    body: `<section class="panel form-stack">${mediaPreview(report)}<div class="info-card"><strong>${report.id}</strong><p>${report.address}</p></div><div class="info-card accent"><strong>${statusLabels[report.status]}</strong><p>${team ? `${team.name} - ${team.vehicle} - ETA ${team.etaMinutes} min` : "Awaiting team assignment"}</p></div><div class="timeline-card vertical-timeline">${report.statusTimeline.map((item) => `<div class="timeline-node done">${statusLabels[item.status]}<small>${fmtDate(item.at)}</small></div>`).join("")}</div></section>`,
    showLogout: true,
  });
}
function renderExplore() {
  const reports = reportService.getReports();
  return shell({
    title: "Explore Map",
    subtitle: "Live issue coverage, severity filters, and hotspot intelligence.",
    body: `<section class="chip-row"><button class="chip active">All</button><button class="chip">Plastic</button><button class="chip">Organic</button><button class="chip">High Priority</button><button class="chip">Near Me</button></section><section class="map-panel"><div class="fake-map">${reports.slice(0, 6).map((report, index) => `<button class="map-pin ${report.severity}" style="top:${18 + index * 11}%;left:${25 + (index % 3) * 22}%;" data-nav="/reports/${report.id}">${index + 1}</button>`).join("")}</div><div class="panel mobile-sheet"><div class="bottom-sheet-head"><strong>Nearby reports</strong><span>${reports.length} items</span></div>${reports.slice(0, 4).map((report) => `<article class="list-card compact clickable" data-nav="/reports/${report.id}"><img src="${report.image}" alt="${report.wasteType}" /><div><strong>${report.wasteType}</strong><p>${report.address}</p></div></article>`).join("")}</div></section>`,
    showLogout: true,
  });
}
function renderNotifications() {
  const notifications = notificationService.getNotifications();
  return shell({
    title: "Notifications",
    subtitle: "Important report and dispatch updates.",
    body: `<section class="panel">${notifications.length ? notifications.map((note) => `<article class="info-card"><strong>${note.title}</strong><p>${note.body}</p><small>${note.time}</small></article>`).join("") : `<div class="empty-state">You are all caught up. New updates will appear here.</div>`}</section>`,
    showLogout: true,
  });
}
function renderDesignLibrary() {
  return shell({
    title: "Design Library",
    subtitle: "Browse the full SwachhLens UI/UX concept pack built inside this project.",
    body: `<section class="design-grid">${designScreens.map((screen) => `
      <article class="design-card">
        <div class="design-card__badge">${screen.label}</div>
        <p>${screen.blurb}</p>
        <div class="design-card__actions">
          <a class="button secondary compact" href="${screen.path}" target="_blank" rel="noreferrer">Open screen</a>
          <button class="button ghost compact" type="button" data-open-design="${screen.path}">Preview</button>
        </div>
      </article>
    `).join("")}</section>`,
    showLogout: true,
  });
}
function renderProfile() {
  const state = getStateSnapshot();
  const permissions = permissionService.getStatuses();
  return shell({
    title: "Profile",
    subtitle: "Manage your account, permissions, and update preferences.",
    body: `<section class="panel form-stack"><div class="profile-card"><div class="avatar">${state.currentUser.name[0]}</div><div><strong>${state.currentUser.name}</strong><p>${state.currentUser.email}</p></div></div><div class="info-card"><strong>Role</strong><p>${state.currentUser.role.replace("_", " ")}</p></div><div class="info-card"><strong>Permissions</strong><p>Camera: ${permissions.camera} - Location: ${permissions.location} - Notifications: ${permissions.notifications}</p></div><button class="button secondary" data-nav="/notifications">View Notifications</button><button class="button ghost" data-open-logout="1">Logout</button></section>`,
    showLogout: false,
  });
}
function showToast(title, message, kind = "info", duration = 3200) {
  uiState.toast = { title, message, kind };
  renderApp();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    uiState.toast = null;
    renderApp();
  }, duration);
}

function attachHandlers() {
  document.querySelectorAll("[data-nav]").forEach((node) => node.addEventListener("click", () => navigate(node.dataset.nav)));
  document.querySelectorAll("[data-open-design]").forEach((node) => node.addEventListener("click", () => {
    window.open(node.dataset.openDesign, "_blank", "noopener,noreferrer");
  }));
  document.querySelectorAll("[data-dismiss-toast]").forEach((node) => node.addEventListener("click", () => {
    uiState.toast = null;
    renderApp();
  }));
  document.querySelectorAll("[data-open-drawer]").forEach((node) => node.addEventListener("click", () => {
    uiState.adminDrawerOpen = true;
    renderApp();
  }));
  document.querySelectorAll("[data-close-drawer]").forEach((node) => node.addEventListener("click", () => {
    uiState.adminDrawerOpen = false;
    uiState.permissionPrompt = null;
    renderApp();
  }));
  document.querySelectorAll("[data-retry-init]").forEach((node) => node.addEventListener("click", () => appService.retryInitialization().then(renderApp)));
  document.querySelectorAll("[data-next-onboarding]").forEach((node) => node.addEventListener("click", () => {
    setOnboardingIndex(uiState.onboardingIndex + 1, 1);
  }));
  document.querySelectorAll("[data-skip-onboarding],[data-complete-onboarding]").forEach((node) => node.addEventListener("click", () => {
    appService.completeOnboarding();
    uiState.authMode = "welcome";
    uiState.forgotMode = false;
    uiState.onboardingDirection = 1;
    ensureHash("/login");
    renderApp();
  }));
  document.querySelectorAll("[data-onboarding-track]").forEach((node) => {
    let startX = 0;
    let startY = 0;
    node.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });
    node.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaY) > 48 || Math.abs(deltaX) < 50) return;
      if (deltaX < 0) setOnboardingIndex(uiState.onboardingIndex + 1, 1);
      if (deltaX > 0) setOnboardingIndex(uiState.onboardingIndex - 1, -1);
    }, { passive: true });
  });
  document.querySelectorAll("[data-go-login]").forEach((node) => node.addEventListener("click", () => {
    uiState.authMode = "login";
    uiState.forgotMode = false;
    uiState.phoneMode = false;
    uiState.otpSent = false;
    uiState.authError = "";
    uiState.authInfo = "";
    renderApp();
  }));
  document.querySelectorAll("[data-go-signup]").forEach((node) => node.addEventListener("click", () => {
    uiState.authMode = "signup";
    uiState.forgotMode = false;
    uiState.phoneMode = false;
    uiState.otpSent = false;
    uiState.authError = "";
    uiState.authInfo = "";
    renderApp();
  }));
  document.querySelectorAll("[data-toggle-auth]").forEach((node) => node.addEventListener("click", () => {
    uiState.authMode = uiState.authMode === "signup" ? "login" : "signup";
    uiState.authError = "";
    uiState.authInfo = "";
    uiState.phoneMode = false;
    uiState.otpSent = false;
    renderApp();
  }));
  document.querySelectorAll("[data-forgot-password]").forEach((node) => node.addEventListener("click", () => {
    uiState.forgotMode = true;
    uiState.authError = "";
    uiState.authInfo = "";
    uiState.phoneMode = false;
    uiState.otpSent = false;
    renderApp();
  }));
  document.querySelectorAll("[data-back-to-login]").forEach((node) => node.addEventListener("click", () => {
    uiState.forgotMode = false;
    uiState.phoneMode = false;
    uiState.otpSent = false;
    uiState.authError = "";
    uiState.authInfo = "";
    renderApp();
  }));
  document.querySelectorAll("[data-toggle-password]").forEach((node) => node.addEventListener("click", () => {
    const parent = node.parentElement;
  const input = parent ? parent.querySelector("input") : null;
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    node.querySelector("span").textContent = input.type === "password" ? "visibility" : "visibility_off";
  }));
  const authForm = document.querySelector("#authForm");
  if (authForm) {
    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      uiState.authError = "";
      uiState.authInfo = "";
      const form = new FormData(authForm);
      const email = String(form.get("email") || "").trim();
      const password = String(form.get("password") || "");
      const confirmPassword = String(form.get("confirmPassword") || "");
      const name = String(form.get("name") || "").trim();
      if (!email) {
        uiState.authError = "Please enter your email address.";
        renderApp();
        return;
      }
      if (!uiState.forgotMode && !password) {
        uiState.authError = "Please enter your password.";
        renderApp();
        return;
      }
      if (uiState.authMode === "signup" && !name) {
        uiState.authError = "Please enter your full name.";
        renderApp();
        return;
      }
      uiState.authSubmitting = true;
      renderApp();
      try {
        if (uiState.forgotMode) {
          const response = await authService.resetPassword(email);
          uiState.authInfo = response.message;
          uiState.authSubmitting = false;
          renderApp();
          return;
        }
        if (uiState.authMode === "signup") {
          if (password.length < 8) throw new Error("Password must be at least 8 characters.");
          if (password !== confirmPassword) throw new Error("Passwords do not match.");
          await authService.signup({ name, email, phone: String(form.get("phone") || ""), password });
        } else {
          await authService.login({ email, password });
        }
        uiState.authSubmitting = false;
        renderApp();
      } catch (error) {
        uiState.authSubmitting = false;
        uiState.authError = authService.getFriendlyError(error.message || error);
        renderApp();
      }
    });
  }
  document.querySelectorAll("[data-open-logout]").forEach((node) => node.addEventListener("click", () => {
    uiState.logoutConfirm = true;
    renderApp();
  }));
  document.querySelectorAll("[data-close-logout]").forEach((node) => node.addEventListener("click", () => {
    uiState.logoutConfirm = false;
    renderApp();
  }));
  document.querySelectorAll("[data-confirm-logout]").forEach((node) => node.addEventListener("click", async () => {
    uiState.logoutConfirm = false;
    uiState.afterSubmitPrompt = false;
    uiState.phoneMode = false;
    uiState.otpSent = false;
    await authService.logout();
    uiState.authMode = "login";
    uiState.forgotMode = false;
    ensureHash("/login");
    renderApp();
  }));
  document.querySelectorAll("[data-google-auth]").forEach((node) => node.addEventListener("click", async () => {
    uiState.authError = "";
    uiState.authInfo = "Signing in with Google…";
    renderApp();
    try {
      await authService.googleLogin();
      uiState.authInfo = "";
      uiState.authError = "";
      renderApp();
    } catch (error) {
      uiState.authInfo = "";
      uiState.authError = authService.getFriendlyError(error.message || error);
      renderApp();
    }
  }));
  document.querySelectorAll("[data-send-otp]").forEach((node) => node.addEventListener("click", async () => {
    const phoneInput = document.querySelector("input[name=\"phone\"]");
    const phone = phoneInput ? phoneInput.value.trim() : "";
    if (!phone) { uiState.authError = "Please enter your phone number."; renderApp(); return; }
    uiState.authError = "";
    uiState.authInfo = "";
    uiState.phoneSending = true;
    renderApp();
    try {
      await authService.sendOtp(phone);
      uiState.phoneSending = false;
      uiState.otpSent = true;
      uiState.authInfo = "";
      renderApp();
    } catch (error) {
      uiState.phoneSending = false;
      uiState.authError = authService.getFriendlyError(error.message || error);
      renderApp();
    }
  }));
  document.querySelectorAll("[data-verify-otp]").forEach((node) => node.addEventListener("click", async () => {
    const otpInput = document.querySelector("input[name=\"otpCode\"]");
    const code = otpInput ? otpInput.value.trim() : "";
    if (!code || code.length < 4) { uiState.authError = "Please enter the OTP code."; renderApp(); return; }
    uiState.authError = "";
    uiState.authInfo = "Verifying…";
    uiState.authSubmitting = true;
    renderApp();
    try {
      await authService.verifyOtp(code);
      uiState.authSubmitting = false;
      uiState.authInfo = "";
      uiState.otpSent = false;
      uiState.phoneMode = false;
      renderApp();
    } catch (error) {
      uiState.authSubmitting = false;
      uiState.authInfo = "";
      uiState.authError = authService.getFriendlyError(error.message || error);
      renderApp();
    }
  }));
  const passwordInput = document.querySelector("input[name=\"password\"]");
  if (passwordInput && uiState.authMode === "signup") {
    const bar = document.querySelector("#passwordStrengthBar");
    const text = document.querySelector("#passwordStrengthText");
    const updateStrength = () => {
      const value = passwordInput.value || "";
      let score = 0;
      if (value.length >= 8) score++;
      if (/[A-Z]/.test(value)) score++;
      if (/[0-9]/.test(value)) score++;
      if (/[^A-Za-z0-9]/.test(value)) score++;
      const width = [0, 28, 52, 76, 100][score];
      const labels = ["At least 8 characters", "Weak", "Fair", "Strong", "Very strong"];
      if (bar) bar.style.width = `${width}%`;
      if (text) text.textContent = labels[score];
    };
    passwordInput.addEventListener("input", updateStrength);
    updateStrength();
  }
  document.querySelectorAll("[data-request-media]").forEach((node) => node.addEventListener("click", () => {
    const map = {
      "camera-image": { kind: "camera", target: "#cameraImageInput" },
      "gallery-image": { kind: "gallery", target: "#galleryImageInput" },
      "camera-video": { kind: "camera", target: "#cameraVideoInput" },
      "gallery-video": { kind: "gallery", target: "#galleryVideoInput" },
    };
    uiState.permissionPrompt = map[node.dataset.requestMedia];
    renderApp();
  }));
  document.querySelectorAll("[data-request-location]").forEach((node) => node.addEventListener("click", () => {
    uiState.permissionPrompt = { kind: "location" };
    renderApp();
  }));
  document.querySelectorAll("[data-permission-cancel]").forEach((node) => node.addEventListener("click", () => {
    const promptKind = uiState.permissionPrompt && uiState.permissionPrompt.kind;
    if (promptKind === "notifications") {
      permissionService.skipNotificationPrompt();
      uiState.afterSubmitPrompt = false;
      uiState.permissionPrompt = null;
      showToast("Notifications paused", "You can turn them on later when needed.", "info", 2800);
      renderApp();
      return;
    }
    uiState.permissionPrompt = null;
    renderApp();
  }));
  document.querySelectorAll("[data-permission-continue]").forEach((node) => node.addEventListener("click", handlePermissionContinue));
  document.querySelectorAll("[data-enable-notifications]").forEach((node) => node.addEventListener("click", async () => {
    uiState.permissionPrompt = { kind: "notifications" };
    renderApp();
    await handlePermissionContinue();
  }));
  document.querySelectorAll("[data-skip-notifications]").forEach((node) => node.addEventListener("click", () => {
    permissionService.skipNotificationPrompt();
    uiState.afterSubmitPrompt = false;
    renderApp();
  }));
  const afterImageInput = document.querySelector("#afterImageInput");
  if (afterImageInput) {
    afterImageInput.addEventListener("change", () => {
      const [file] = afterImageInput.files || [];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        uiState.workerAfterPhoto = {
          reportId: afterImageInput.dataset.reportId || "",
          dataUrl: String(reader.result || ""),
          fileName: file.name,
        };
        renderApp();
      };
      reader.readAsDataURL(file);
    });
  }
  [["#cameraImageInput", "image"], ["#galleryImageInput", "image"], ["#cameraVideoInput", "video"], ["#galleryVideoInput", "video"]].forEach(([selector, mediaType]) => {
    const input = document.querySelector(selector);
    if (!input) return;
    input.addEventListener("change", () => {
      const [file] = input.files || [];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        reportService.updateDraft({ image: mediaType === "image" ? reader.result : "", video: mediaType === "video" ? reader.result : "", mediaType, imageName: file.name });
        renderApp();
      };
      reader.readAsDataURL(file);
    });
  });
  const commentInput = document.querySelector("#commentInput");
  if (commentInput) commentInput.addEventListener("input", () => reportService.updateDraft({ comment: commentInput.value }));
  document.querySelectorAll("[data-reset-draft]").forEach((node) => node.addEventListener("click", () => {
    reportService.resetDraft();
    renderApp();
  }));
  if (currentPath() === "/report/analyzing") {
    const draft = reportService.getDraft();
    if (draft.image || draft.video) {
      aiService.analyzeWaste({ ...draft, onProgress: (stage) => reportService.updateDraft({ analysisStage: stage }) }).then(({ result, duplicateMatch }) => {
        reportService.updateDraft({ aiResult: result, duplicateMatch, analysisStage: "Analysis complete" });
        navigate("/report/result");
      });
    }
  }
  document.querySelectorAll("[data-submit-report]").forEach((node) => node.addEventListener("click", async () => {
    const manualAddressInput = document.querySelector("#manualAddress");
    const manualAddress = manualAddressInput ? manualAddressInput.value.trim() : "";
    const draft = reportService.getDraft();
    if (manualAddress) {
      reportService.updateDraft({
        location: {
          ...(draft.location || {}),
          address: manualAddress,
          timestamp: draft.location && draft.location.timestamp ? draft.location.timestamp : new Date().toISOString(),
        },
      });
    }
    const report = await reportService.createReport(reportService.getDraft());
    reportService.resetDraft();
    uiState.afterSubmitPrompt = true;
    showToast("Report submitted", `Complaint ${report.id} is now in the review queue.`, "success", 3400);
    if ("Notification" in window && Notification.permission !== "granted" && permissionService.shouldPromptNotifications()) {
      uiState.permissionPrompt = { kind: "notifications" };
    }
    navigate(`/report/success/${report.id}`);
    renderApp();
  }));
  document.querySelectorAll("[data-assign-report]").forEach((node) => node.addEventListener("click", async () => {
    const select = document.querySelector("#teamAssign");
    if (!select || !select.value) return;
    try {
      await teamService.assignTeam(node.dataset.assignReport, select.value);
      showToast("Team assigned", "Cleanup team has been dispatched successfully.", "success", 3000);
      navigate(`/admin/dispatch/${node.dataset.assignReport}`);
    } catch (err) {
      showToast("Error", err.message || "Failed to assign team.", "error", 3000);
    }
  }));
  document.querySelectorAll("[data-smart-dispatch]").forEach((node) => node.addEventListener("click", async () => {
    try {
      await teamService.assignTeam(node.dataset.smartDispatch, node.dataset.team);
      showToast("Dispatched", "Team has been dispatched.", "success", 3000);
      navigate("/worker/tasks");
    } catch (err) {
      showToast("Error", err.message || "Failed to dispatch.", "error", 3000);
    }
  }));
  document.querySelectorAll("[data-worker-status]").forEach((node) => node.addEventListener("click", async () => {
    try {
      await reportService.updateReportStatus(node.dataset.report, node.dataset.workerStatus);
      renderApp();
    } catch (err) {
      showToast("Error", err.message || "Failed to update status.", "error", 3000);
    }
  }));
  document.querySelectorAll("[data-worker-complete]").forEach((node) => node.addEventListener("click", async () => {
    const reportId = node.dataset.workerComplete;
    const report = reportService.getReportById(reportId);
    const afterImage = uiState.workerAfterPhoto.reportId === reportId ? uiState.workerAfterPhoto.dataUrl : (report && report.afterImage ? report.afterImage : "");
    if (!afterImage || !report || report.status !== "cleanup_in_progress") return;
    try {
      await reportService.saveAfterPhoto(reportId, afterImage);
      uiState.workerAfterPhoto = { reportId: "", dataUrl: "", fileName: "" };
      showToast("Complete", "Report marked complete with after photo.", "success", 3000);
      navigate("/worker/history");
    } catch (err) {
      showToast("Error", err.message || "Failed to complete.", "error", 3000);
    }
  }));
  document.querySelectorAll("[data-verify-report]").forEach((node) => node.addEventListener("click", async () => {
    try {
      await reportService.updateReportStatus(node.dataset.verifyReport, "resolved");
      showToast("Resolved", "Report has been verified and resolved.", "success", 3000);
      navigate(`/reports/${node.dataset.verifyReport}`);
    } catch (err) {
      showToast("Error", err.message || "Failed to resolve.", "error", 3000);
    }
  }));
}

async function boot() {
  await appService.initialize();
  authService.subscribe(() => renderApp());
  if (permissionService.shouldPromptDevicePermissions()) {
    uiState.permissionPrompt = { kind: "device" };
  }
  renderApp();
}

boot();
window.addEventListener("hashchange", () => {
  if (document.querySelector(".splash-screen")) return;
  renderApp();
});