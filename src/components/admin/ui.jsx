const ICON_PATHS = {
  map: ["M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z", "M9 4v14", "M15 6v14"],
  queue: ["M3 6h13", "M3 12h18", "M3 18h13", "M18 9l3 3-3 3"],
  layers: ["m12 2 8.5 4.5L12 11 3.5 6.5 12 2Z", "m3.5 12 8.5 4.5 8.5-4.5", "m3.5 17.5 8.5 4.5 8.5-4.5"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  recycle: ["m7 19-3-5 2.5-4.5", "M17 19l3-5-2.5-4.5", "M12 4l3 5h-6l3-5Z", "M4.5 14 3 19h10", "M20 14l1.5 5H12", "M9.5 19h5"],
  chart: ["M3 3v18h18", "M7 15v3", "M12 10v8", "M17 6v12"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z", "M12 1v2", "M12 21v2", "M4.2 4.2l1.4 1.4", "M18.4 18.4l1.4 1.4", "M1 12h2", "M21 12h2", "M4.2 19.8l1.4-1.4", "M18.4 5.6l1.4-1.4"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  monitor: ["M2 4h20v12H2z", "M8 20h8", "M12 16v4"],
  alert: ["m10.3 3.9-8.5 14.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z", "M12 9v4", "M12 17h.01"],
  check: ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "m22 4-10 10-3-3"],
  xCircle: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "m15 9-6 6", "m9 9 6 6"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
  upRight: ["M7 17 17 7", "M7 7h10v10"],
  downRight: ["m7 7 10 10", "M17 7v10H7"],
  flat: ["M5 12h14"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.35-4.35"],
  filter: ["M22 3H2l8 9.46V19l4 2v-8.54L22 3z"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"],
  plus: ["M5 12h14", "M12 5v14"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M10 11v6", "M14 11v6"],
  edit: ["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"],
  truck: ["M10 17h4V5H2v12h3", "M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1", "M7 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M17 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  sparkles: ["m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z", "M19 3v4", "M21 5h-4"],
  shieldAlert: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "M12 8v4", "M12 16h.01"],
  leaf: ["M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  eye: ["M2 12s3.54-7 10-7 10 7 10 7-3.54 7-10 7-10-7-10-7Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  pin: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  zap: ["M13 2 3 14h9l-1 8 10-12h-9l1-8Z"],
  loader: ["M21 12a9 9 0 1 1-6.22-8.56"],
  copy: ["M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  merge: ["m8 6 4-4 4 4", "M12 2v10.5", "m8 18 4 4 4-4", "M12 21v-3", "M5 8l3 3H3l2-3Z", "M19 8l-3 3h5l-2-3Z"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
  trendUp: ["m3 17 6-6 4 4 8-8", "M14 7h7v7"],
  trendDown: ["m3 7 6 6 4-4 8 8", "M21 10v7h-7"],
  flame: ["M12 22c4.42 0 8-3.58 8-8 0-3.5-2.5-6.5-4-8-.5 2-1.5 3-3 3 0-2-1-5-3-6 0 3-2 4.5-3 6.5S4 12 4 14c0 4.42 3.58 8 8 8Z"],
  idCard: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M19 8h-5", "M19 12h-8", "M19 16h-6"],
  settings: ["M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
};

export function Icon({ name, size = 18, className = "", strokeWidth = 2 }) {
  const paths = ICON_PATHS[name] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

const LEVEL_COLORS = {
  critical: "#E5484D",
  high: "#F0763B",
  medium: "#D9A40E",
  low: "#2FA96C",
};

export function priorityColor(levelOrScore) {
  if (typeof levelOrScore === "number") {
    if (levelOrScore >= 80) return LEVEL_COLORS.critical;
    if (levelOrScore >= 60) return LEVEL_COLORS.high;
    if (levelOrScore >= 35) return LEVEL_COLORS.medium;
    return LEVEL_COLORS.low;
  }
  return LEVEL_COLORS[levelOrScore] || LEVEL_COLORS.low;
}

export function PriorityRing({ score = 0, level = "low", size = 44, showLabel = true }) {
  const stroke = Math.max(3, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const color = priorityColor(level);
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }} title={`Priority ${clamped}/100 (${level})`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--adm-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - clamped / 100)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {showLabel && (
        <span className="absolute font-bold tabular-nums" style={{ fontSize: Math.max(10, size * 0.28), color }}>{clamped}</span>
      )}
    </div>
  );
}

const CHIP_TONES = {
  neutral: { bg: "var(--adm-surface-2)", fg: "var(--adm-muted)" },
  info: { bg: "rgba(0,168,150,0.12)", fg: "var(--adm-primary)" },
  ok: { bg: "rgba(22,163,74,0.12)", fg: "var(--adm-ok)" },
  warn: { bg: "rgba(217,119,6,0.14)", fg: "var(--adm-warn)" },
  danger: { bg: "rgba(220,38,38,0.12)", fg: "var(--adm-danger)" },
  outline: { bg: "transparent", fg: "var(--adm-muted)" },
};

export function Chip({ tone = "neutral", children, icon, dot = false, className = "" }) {
  const t = CHIP_TONES[tone] || CHIP_TONES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}
      style={{ background: t.bg, color: t.fg }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.fg }} />}
      {icon}
      {children}
    </span>
  );
}

export function StatusChip({ status }) {
  const map = {
    submitted: { tone: "info", label: "Submitted" },
    ai_analyzed: { tone: "info", label: "AI Checked" },
    under_review: { tone: "warn", label: "Under Review" },
    assigned: { tone: "info", label: "Assigned" },
    en_route: { tone: "info", label: "En Route" },
    cleanup_in_progress: { tone: "info", label: "Cleaning" },
    verification: { tone: "warn", label: "Verification" },
    resolved: { tone: "ok", label: "Resolved" },
    rejected: { tone: "neutral", label: "Rejected" },
    duplicate: { tone: "neutral", label: "Duplicate" },
    reopened: { tone: "danger", label: "Reopened" },
  };
  const cfg = map[status] || { tone: "neutral", label: status };
  return <Chip tone={cfg.tone} dot>{cfg.label}</Chip>;
}

export function SeverityChip({ severity }) {
  const map = { low: "ok", medium: "warn", high: "danger", critical: "danger" };
  return (
    <Chip tone={map[severity] || "neutral"} icon={severity === "critical" ? <Icon name="shieldAlert" size={11} /> : null}>
      {(severity || "unknown").replace(/^\w/, (ch) => ch.toUpperCase())}
    </Chip>
  );
}

export function TrendArrow({ direction = "flat", percent, goodDirection = "down", suffix = "" }) {
  const good = direction === goodDirection;
  const neutral = direction === "flat";
  const color = neutral ? "var(--adm-muted)" : good ? "var(--adm-ok)" : "var(--adm-danger)";
  const iconName = direction === "up" ? "upRight" : direction === "down" ? "downRight" : "flat";
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color }}>
      <Icon name={iconName} size={12} />
      {percent != null ? `${percent}%${suffix}` : direction}
    </span>
  );
}

export function Skeleton({ w = "100%", h = 14, className = "", style = {} }) {
  return <div className={`adm-skeleton ${className}`} style={{ width: w, height: h, ...style }} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} h={26} w={c === 0 ? 44 : `${Math.max(12, 88 / cols)}%`} style={{ flex: c === 0 ? "none" : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "layers", title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: "var(--adm-surface-2)", color: "var(--adm-muted)" }}>
        <Icon name={icon} size={22} />
      </div>
      <p className="font-semibold adm-text">{title}</p>
      {body && <p className="text-sm mt-1 max-w-sm" style={{ color: "var(--adm-muted)" }}>{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(220,38,38,0.12)", color: "var(--adm-danger)" }}>
        <Icon name="alert" size={22} />
      </div>
      <p className="font-semibold adm-text">Failed to load</p>
      <p className="text-sm mt-1 max-w-sm" style={{ color: "var(--adm-muted)" }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold adm-btn-primary">
          <Icon name="refresh" size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function Spinner({ size = 16, className = "" }) {
  return <Icon name="loader" size={size} className={`animate-spin ${className}`} />;
}

export function relativeTime(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

export function wasteTypeLabel(type) {
  return String(type || "other").split("_").map((w) => w.replace(/^\w/, (c) => c.toUpperCase())).join(" ");
}

export function volumeLabel(volume) {
  return String(volume || "").replace("very_large", "Very Large").replace(/^\w/, (c) => c.toUpperCase());
}
