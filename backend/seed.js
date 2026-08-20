import { REPORT_STATUSES, ROLES } from "./constants.js";

const now = "2026-08-07T12:30:00+05:30";

export const seedUsers = {
  "user-citizen": {
    uid: "user-citizen",
    name: "Ananya Das",
    email: "citizen@swachhlens.app",
    phone: "+919876543210",
    role: ROLES.CITIZEN,
    wardId: "ward-12",
    isActive: true,
    language: "en",
    locationName: "Bhubaneswar, Unit 4",
    createdAt: "2026-08-01T09:00:00+05:30",
    updatedAt: now,
  },
  "user-admin": {
    uid: "user-admin",
    name: "Municipal Admin",
    email: "admin@swachhlens.app",
    phone: "+919812340000",
    role: ROLES.ADMIN,
    wardId: "ward-north",
    isActive: true,
    language: "en",
    locationName: "Region North",
    createdAt: "2026-07-20T10:00:00+05:30",
    updatedAt: now,
  },
  "user-worker": {
    uid: "user-worker",
    name: "Team Alpha",
    email: "worker@swachhlens.app",
    phone: "+919800001111",
    role: ROLES.CLEANUP_WORKER,
    wardId: "ward-12",
    isActive: true,
    language: "en",
    locationName: "Ward 12",
    createdAt: "2026-07-25T10:00:00+05:30",
    updatedAt: now,
  }
};

export const seedAuthAccounts = {
  "user-citizen": { uid: "user-citizen", email: "citizen@swachhlens.app", salt: "seed-citizen", passwordHash: "seed:citizen123" },
  "user-admin": { uid: "user-admin", email: "admin@swachhlens.app", salt: "seed-admin", passwordHash: "seed:admin123" },
  "user-worker": { uid: "user-worker", email: "worker@swachhlens.app", salt: "seed-worker", passwordHash: "seed:worker123" }
};

export const seedTeams = [
  {
    id: "team-07",
    name: "Sanitation Team 07",
    leaderId: "worker-leader-07",
    memberIds: ["worker-07-a", "worker-07-b", "worker-07-c", "worker-07-d"],
    wardIds: ["ward-12", "ward-13"],
    vehicle: { type: "Mini Tipper", capacity: "medium" },
    status: "available",
    currentLocation: { latitude: 20.2978, longitude: 85.8265, label: "Ward 12 Depot" },
    currentAssignmentId: null,
    completedToday: 6,
    averageResolutionTime: 78,
    etaMinutes: 12,
    distanceKm: 1.8,
    aiMatchScore: 94,
  },
  {
    id: "team-03",
    name: "Rapid Response 03",
    leaderId: "worker-leader-03",
    memberIds: ["worker-03-a", "worker-03-b", "worker-03-c"],
    wardIds: ["ward-north", "ward-09"],
    vehicle: { type: "Flatbed", capacity: "large" },
    status: "en_route",
    currentLocation: { latitude: 20.3018, longitude: 85.8215, label: "Unit 1 Market" },
    currentAssignmentId: "REP-992A",
    completedToday: 4,
    averageResolutionTime: 92,
    etaMinutes: 18,
    distanceKm: 3.1,
    aiMatchScore: 82,
  },
  {
    id: "team-alpha",
    name: "Team Alpha",
    leaderId: "user-worker",
    memberIds: ["worker-alpha-a", "worker-alpha-b", "worker-alpha-c", "worker-alpha-d"],
    wardIds: ["ward-12"],
    vehicle: { type: "Mini Tipper", capacity: "medium" },
    status: "assigned",
    currentLocation: { latitude: 20.2961, longitude: 85.8245, label: "1420 Main St" },
    currentAssignmentId: "REP-28491",
    completedToday: 3,
    averageResolutionTime: 86,
    etaMinutes: 15,
    distanceKm: 1.2,
    aiMatchScore: 91,
  }
];

export const seedReports = [
  {
    id: "REP-28491",
    citizenId: "user-citizen",
    media: {
      imageUrl: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1200&q=80",
      videoUrl: "",
      thumbnailUrl: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=400&q=80",
      storagePath: "reports/user-citizen/REP-28491/before.jpg"
    },
    location: {
      latitude: 20.2961,
      longitude: 85.8245,
      address: "452 Main St, Alleyway",
      wardId: "ward-12",
      locality: "Unit 4"
    },
    citizenComment: "The pile has grown since yesterday evening.",
    aiAnalysis: {
      wasteType: "plastic_waste",
      confidence: 94,
      estimatedVolume: "large",
      estimatedVolumeRange: "2.0 - 2.8 cubic meters",
      severity: "high",
      potentialRisks: ["Blocked alleyway", "Pedestrian obstruction"],
      recommendation: "Assign mini tipper and 4-worker team within 30 minutes."
    },
    priority: {
      score: 88,
      level: "high",
      reasons: ["Large waste volume", "Road obstruction", "Recent duplicate support"]
    },
    duplicate: {
      isPotentialDuplicate: false,
      primaryReportId: null,
      similarityScore: 0.18,
      distanceMeters: 0
    },
    status: REPORT_STATUSES.ASSIGNED,
    assignedTeamId: "team-07",
    afterMedia: { imageUrl: "", storagePath: "" },
    createdAt: "2026-08-07T09:14:00+05:30",
    updatedAt: "2026-08-07T10:02:00+05:30",
    statusTimeline: [
      { status: REPORT_STATUSES.SUBMITTED, at: "2026-08-07T09:14:00+05:30" },
      { status: REPORT_STATUSES.AI_ANALYZED, at: "2026-08-07T09:15:00+05:30" },
      { status: REPORT_STATUSES.UNDER_REVIEW, at: "2026-08-07T09:45:00+05:30" },
      { status: REPORT_STATUSES.ASSIGNED, at: "2026-08-07T10:02:00+05:30" }
    ]
  },
  {
    id: "REP-992A",
    citizenId: "user-citizen",
    media: {
      imageUrl: "https://images.unsplash.com/photo-1584473457493-17c9d39d1f68?auto=format&fit=crop&w=1200&q=80",
      videoUrl: "",
      thumbnailUrl: "https://images.unsplash.com/photo-1584473457493-17c9d39d1f68?auto=format&fit=crop&w=400&q=80",
      storagePath: "reports/user-citizen/REP-992A/before.jpg"
    },
    location: {
      latitude: 20.3018,
      longitude: 85.8215,
      address: "Behind City Hospital, Sector 2",
      wardId: "ward-north",
      locality: "Sector 2"
    },
    citizenComment: "Sharp materials and red bags are visible.",
    aiAnalysis: {
      wasteType: "hazardous_waste",
      confidence: 97,
      estimatedVolume: "very_large",
      estimatedVolumeRange: "2.8 - 3.5 cubic meters",
      severity: "critical",
      potentialRisks: ["Hazardous material", "Hospital proximity"],
      recommendation: "Escalate to hazardous waste unit immediately."
    },
    priority: {
      score: 96,
      level: "critical",
      reasons: ["Hazardous waste detected", "Hospital nearby", "Very large waste volume"]
    },
    duplicate: {
      isPotentialDuplicate: true,
      primaryReportId: "REP-28491",
      similarityScore: 0.42,
      distanceMeters: 480
    },
    status: REPORT_STATUSES.UNDER_REVIEW,
    assignedTeamId: null,
    afterMedia: { imageUrl: "", storagePath: "" },
    createdAt: "2026-08-07T11:20:00+05:30",
    updatedAt: "2026-08-07T11:26:00+05:30",
    statusTimeline: [
      { status: REPORT_STATUSES.SUBMITTED, at: "2026-08-07T11:20:00+05:30" },
      { status: REPORT_STATUSES.AI_ANALYZED, at: "2026-08-07T11:22:00+05:30" },
      { status: REPORT_STATUSES.UNDER_REVIEW, at: "2026-08-07T11:26:00+05:30" }
    ]
  },
  {
    id: "REP-18012",
    citizenId: "user-citizen",
    media: {
      imageUrl: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=1200&q=80",
      videoUrl: "",
      thumbnailUrl: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=400&q=80",
      storagePath: "reports/user-citizen/REP-18012/before.jpg"
    },
    location: {
      latitude: 20.2955,
      longitude: 85.8310,
      address: "Centennial Park",
      wardId: "ward-12",
      locality: "Park Belt"
    },
    citizenComment: "The bin is full every evening.",
    aiAnalysis: {
      wasteType: "overflowing_bin",
      confidence: 89,
      estimatedVolume: "medium",
      estimatedVolumeRange: "0.8 - 1.4 cubic meters",
      severity: "medium",
      potentialRisks: ["Fly infestation"],
      recommendation: "Standard truck and two-worker pickup this shift."
    },
    priority: {
      score: 63,
      level: "medium",
      reasons: ["Overflow recurring in a public area"]
    },
    duplicate: {
      isPotentialDuplicate: false,
      primaryReportId: null,
      similarityScore: 0.12,
      distanceMeters: 0
    },
    status: REPORT_STATUSES.RESOLVED,
    assignedTeamId: "team-03",
    afterMedia: {
      imageUrl: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80",
      storagePath: "cleanup/REP-18012/after.jpg"
    },
    createdAt: "2026-08-05T14:32:00+05:30",
    updatedAt: "2026-08-06T10:15:00+05:30",
    statusTimeline: [
      { status: REPORT_STATUSES.SUBMITTED, at: "2026-08-05T14:32:00+05:30" },
      { status: REPORT_STATUSES.AI_ANALYZED, at: "2026-08-05T14:34:00+05:30" },
      { status: REPORT_STATUSES.UNDER_REVIEW, at: "2026-08-05T14:50:00+05:30" },
      { status: REPORT_STATUSES.ASSIGNED, at: "2026-08-05T15:05:00+05:30" },
      { status: REPORT_STATUSES.EN_ROUTE, at: "2026-08-05T15:15:00+05:30" },
      { status: REPORT_STATUSES.CLEANUP_IN_PROGRESS, at: "2026-08-05T15:32:00+05:30" },
      { status: REPORT_STATUSES.VERIFICATION, at: "2026-08-05T16:10:00+05:30" },
      { status: REPORT_STATUSES.RESOLVED, at: "2026-08-06T10:15:00+05:30" }
    ]
  }
];

export const seedNotifications = [
  {
    id: "note-1",
    userId: "user-citizen",
    title: "Team assigned",
    body: "Sanitation Team 07 has been assigned to your latest report.",
    createdAt: "2026-08-07T12:18:00+05:30"
  },
  {
    id: "note-2",
    userId: "user-admin",
    title: "Hazard alert",
    body: "A new hazardous waste complaint needs review.",
    createdAt: "2026-08-07T12:05:00+05:30"
  }
];

export function createSeedState() {
  return {
    users: seedUsers,
    authAccounts: seedAuthAccounts,
    profileByEmail: Object.fromEntries(Object.values(seedUsers).map((profile) => [profile.email.toLowerCase(), profile.uid])),
    sessions: {},
    reports: seedReports,
    teams: seedTeams,
    notifications: seedNotifications,
    activityLogs: [],
    assignments: [],
    meta: { createdAt: now, updatedAt: now }
  };
}
