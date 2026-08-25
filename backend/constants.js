export const APP_STATES = {
  INITIALIZING: "INITIALIZING",
  FIRST_TIME_USER: "FIRST_TIME_USER",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  AUTHENTICATED_CITIZEN: "AUTHENTICATED_CITIZEN",
  AUTHENTICATED_ADMIN: "AUTHENTICATED_ADMIN",
  AUTHENTICATED_WORKER: "AUTHENTICATED_WORKER",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  NETWORK_ERROR: "NETWORK_ERROR",
  STARTUP_ERROR: "STARTUP_ERROR",
};

export const ROLES = {
  CITIZEN: "citizen",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  WARD_OFFICER: "ward_officer",
  SANITATION_SUPERVISOR: "sanitation_supervisor",
  CLEANUP_WORKER: "cleanup_worker",
};

export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.WARD_OFFICER, ROLES.SANITATION_SUPERVISOR];

export const REPORT_STATUSES = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  AI_ANALYZING: "ai_analyzing",
  AI_ANALYZED: "ai_analyzed",
  UNDER_REVIEW: "under_review",
  ASSIGNED: "assigned",
  EN_ROUTE: "en_route",
  CLEANUP_IN_PROGRESS: "cleanup_in_progress",
  VERIFICATION: "verification",
  RESOLVED: "resolved",
  REOPENED: "reopened",
  REJECTED: "rejected",
  DUPLICATE: "duplicate",
};

export const STATUS_LABELS = {
  [REPORT_STATUSES.SUBMITTED]: "Report Received",
  [REPORT_STATUSES.AI_ANALYZED]: "AI Checked",
  [REPORT_STATUSES.UNDER_REVIEW]: "Authority Review",
  [REPORT_STATUSES.ASSIGNED]: "Cleanup Team Assigned",
  [REPORT_STATUSES.EN_ROUTE]: "Team En Route",
  [REPORT_STATUSES.CLEANUP_IN_PROGRESS]: "Cleanup Started",
  [REPORT_STATUSES.VERIFICATION]: "Verification",
  [REPORT_STATUSES.RESOLVED]: "Resolved",
  [REPORT_STATUSES.REOPENED]: "Reopened",
};

export const PRIORITY_WEIGHTS = {
  volume: { small: 8, medium: 18, large: 28, very_large: 36 },
  severity: { low: 8, medium: 18, high: 30, critical: 40 },
  hazardousWaste: 18,
  drainBlockage: 20,
  hospitalNearby: 14,
  schoolNearby: 10,
  waterBodyNearby: 16,
  marketNearby: 8,
  roadObstruction: 12,
  duplicateSupport: 8,
  ageOver24Hours: 6,
};

// Sensitive location keywords for address-based detection.
// Covers English, Hindi, and Odia keywords used in Indian municipal contexts.
export const SENSITIVE_LOCATION_KEYWORDS = {
  hospital: ["hospital", "clinic", "dispensary", "nursing home", "medical center", "अस्पताल", "हॉस्पिटल", "ଡାକ୍ତରଖାନା"],
  school: ["school", "college", "university", "academy", "vidyalaya", "intercollege", "विद्यालय", "स्कूल", "ବିଦ୍ୟାଳୟ"],
  waterBody: ["river", "lake", "pond", "nala", "drain", "canal", "stream", "nullah", "water body", "wetland", "flood", "waterlog", "waterlogg",
    "नदी", "तालाब", "नाला", "नहर", "जलाशय", "ନଦୀ", "ପୋଖରୀ", "ନାଳା"],
  market: ["market", "bazaar", "haat", "mandi", "shopping", "mall", "बाज़ार", "मंडी", "ବଜାର"],
};

export const ALLOWED_SIGNUP_FIELDS = ["name", "email", "phone", "password"];

export const ROLE_ROUTES = {
  [ROLES.CITIZEN]: "/home",
  [ROLES.ADMIN]: "/admin/dashboard",
  [ROLES.SUPER_ADMIN]: "/admin/dashboard",
  [ROLES.WARD_OFFICER]: "/admin/dashboard",
  [ROLES.SANITATION_SUPERVISOR]: "/admin/dashboard",
  [ROLES.CLEANUP_WORKER]: "/worker/tasks",
};

export function roleToAppState(role) {
  if (ADMIN_ROLES.includes(role)) return APP_STATES.AUTHENTICATED_ADMIN;
  if (role === ROLES.CLEANUP_WORKER) return APP_STATES.AUTHENTICATED_WORKER;
  return APP_STATES.AUTHENTICATED_CITIZEN;
}
