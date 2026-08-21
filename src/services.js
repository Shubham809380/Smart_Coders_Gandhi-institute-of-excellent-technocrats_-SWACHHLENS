import {
    APP_STATES,
    draftTemplate,
    onboardingSlides,
    roleRoutes,
} from "./data.js";
import { uploadToCloudinary } from "./cloudinary.js";

const API_BASE = "/api";
const STORAGE_KEY = "swachhlens-client-state-v4";
const TOKEN_KEY = "swachhlens-session-token";
const SESSION_EXPIRED_KEY = "swachhlens-session-expired";
const MIN_SPLASH_MS = 1500;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function compressImage(dataUrl, maxDimension = 1024, quality = 0.75) {
    return new Promise((resolve) => {
        if (!dataUrl || !dataUrl.startsWith("data:image")) { resolve(dataUrl); return; }
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function nowIso() {
    return new Date().toISOString();
}

function readStoredState() {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (!saved) return {};
        return JSON.parse(saved);
    } catch {
        return {};
    }
}

function getToken() {
    return window.localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options.headers } });
    } catch (fetchErr) {
        const isNetwork = fetchErr?.name === "TypeError" || fetchErr?.message?.includes("fetch") || fetchErr?.message?.includes("network");
        if (isNetwork) throw new Error("Network error. Please check your internet connection and try again.");
        throw new Error(`Connection failed: ${fetchErr?.message || "Server unreachable"}`);
    }
    const data = await res.json();
    if (!res.ok) {
        const msg = data?.error?.message || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data;
}

const stored = readStoredState();

const state = {
    onboardingCompleted: typeof stored.onboardingCompleted !== "undefined" ? stored.onboardingCompleted : false,
    startup: { appState: APP_STATES.INITIALIZING, loading: true, error: "" },
    permissionStatus: {
        camera: stored.permissionStatus?.camera || "unknown",
        gallery: stored.permissionStatus?.gallery || "unknown",
        location: stored.permissionStatus?.location || "unknown",
        video: stored.permissionStatus?.video || "unknown",
        audio: stored.permissionStatus?.audio || "unknown",
        notifications: stored.permissionStatus?.notifications || "unknown",
    },
    reportDraft: clone(typeof stored.reportDraft !== "undefined" ? stored.reportDraft : draftTemplate),
    reports: [],
    teams: [],
    notifications: [],
    currentUser: null,
    notificationPromptShown: stored.notificationPromptShown || false,
    devicePermissionPromptShown: stored.devicePermissionPromptShown || false,
};

let authSubscribers = [];

function persistClientState() {
    try {
        const dataToStore = {
            onboardingCompleted: state.onboardingCompleted,
            permissionStatus: state.permissionStatus,
            reportDraft: state.reportDraft,
            notificationPromptShown: state.notificationPromptShown,
            devicePermissionPromptShown: state.devicePermissionPromptShown,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    } catch (e) {
        if (e.name === "QuotaExceededError" || e.code === 22) {
            console.warn("localStorage full — clearing draft image to free space");
            try {
                if (state.reportDraft?.image) state.reportDraft = { ...state.reportDraft, image: "" };
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    onboardingCompleted: state.onboardingCompleted,
                    permissionStatus: state.permissionStatus,
                    reportDraft: state.reportDraft,
                    notificationPromptShown: state.notificationPromptShown,
                    devicePermissionPromptShown: state.devicePermissionPromptShown,
                }));
            } catch { /* storage completely full, skip */ }
        } else {
            console.warn("persistClientState error:", e);
        }
    }
}

function roleToRoute(role) {
    return role ? roleRoutes[role] || "/home" : "/login";
}

function emitAuthChange() {
    const snapshot = authService.getSessionSnapshot();
    authSubscribers.forEach((cb) => cb(snapshot));
}

function buildFriendlyAuthError(error) {
    const message = String(error?.message || error || "");
    if (message.includes("already") || message.includes("exists")) return "An account with this email already exists.";
    if (message.includes("Google") || message.includes("google")) return message;
    if (message.includes("Incorrect") || message.includes("password")) return "Incorrect email or password.";
    if (message.includes("network") || message.includes("fetch") || message.includes("Failed")) return "Check your internet connection and try again.";
    return message || "Something went wrong. Please try again.";
}

export const appService = {
    async initialize() {
        const startedAt = Date.now();
        state.startup = { appState: APP_STATES.INITIALIZING, loading: true, error: "" };
        const token = getToken();
        if (token) {
            let lastErr = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    const data = await api("/auth/me");
                    state.currentUser = data.currentUser;
                    const appState = data.role && data.role !== "citizen" ? APP_STATES.AUTHENTICATED_ADMIN : APP_STATES.AUTHENTICATED_CITIZEN;
                    state.startup = { appState, loading: false, error: "" };
                    lastErr = null;
                    break;
                } catch (err) {
                    lastErr = err;
                    if (attempt < 4) await delay(Math.min(1500 * (attempt + 1), 8000));
                }
            }
            if (lastErr) {
                const msg = String(lastErr?.message || "");
                const is401 = msg.includes("401") || msg.includes("Unauthorized") || msg.includes("sign in") || msg.includes("Please sign in");
                if (is401) {
                    setToken("");
                    state.currentUser = null;
                    try { sessionStorage.setItem(SESSION_EXPIRED_KEY, "1"); } catch {}
                    state.startup = { appState: APP_STATES.UNAUTHENTICATED, loading: false, error: "" };
                } else {
                    state.startup = { appState: APP_STATES.RECONNECTING, loading: false, error: "Server is waking up. Retrying..." };
                }
            }
        } else {
            state.startup = { appState: APP_STATES.UNAUTHENTICATED, loading: false, error: "" };
        }
        await delay(Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt)));
        persistClientState();
        return authService.getSessionSnapshot();
    },
    completeOnboarding() {
        state.onboardingCompleted = true;
        state.startup = { ...state.startup, appState: APP_STATES.UNAUTHENTICATED, loading: false, error: "" };
        persistClientState();
    },
    retryInitialization() { return this.initialize(); },
    startAutoRetry(maxRetries = 10) {
        let retries = 0;
        const tryAgain = async () => {
            if (retries >= maxRetries || !getToken()) return;
            retries++;
            await delay(5000);
            if (state.startup.appState !== APP_STATES.RECONNECTING) return;
            const snap = await this.initialize();
            if (snap.appState === APP_STATES.RECONNECTING) tryAgain();
        };
        tryAgain();
    },
    getStartup() { return clone(state.startup); },
    getOnboardingSlides() { return clone(onboardingSlides); },
};

export const authService = {
    subscribe(callback) {
        authSubscribers.push(callback);
        callback(this.getSessionSnapshot());
        return () => { authSubscribers = authSubscribers.filter((cb) => cb !== callback); };
    },
    getSessionSnapshot() {
        return {
            currentUser: clone(state.currentUser),
            userProfile: clone(state.currentUser),
            role: state.currentUser?.role || null,
            loading: state.startup.loading,
            appState: state.startup.appState,
            onboardingCompleted: state.onboardingCompleted,
            error: state.startup.error,
            isAuthenticated: Boolean(state.currentUser),
        };
    },
    getCurrentRole() { return state.currentUser?.role || "citizen"; },
    async login({ email, password }) {
        const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setToken(data.sessionToken);
        state.currentUser = data.currentUser;
        const appState = data.role && data.role !== "citizen" ? APP_STATES.AUTHENTICATED_ADMIN : APP_STATES.AUTHENTICATED_CITIZEN;
        state.startup = { appState, loading: false, error: "" };
        persistClientState();
        emitAuthChange();
        return this.getSessionSnapshot();
    },
    async signup({ name, email, password, phone = "", role = "citizen" }) {
        const data = await api("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password, phone, role }) });
        setToken(data.sessionToken);
        state.currentUser = data.currentUser;
        state.startup = { appState: APP_STATES.AUTHENTICATED_CITIZEN, loading: false, error: "" };
        persistClientState();
        emitAuthChange();
        return this.getSessionSnapshot();
    },
    async googleLogin(accessToken, role) {
        const payload = { accessToken: String(accessToken || "") };
        if (role) payload.role = role;
        const data = await api("/auth/google", { method: "POST", body: JSON.stringify(payload) });
        setToken(data.sessionToken);
        state.currentUser = data.currentUser;
        const appState = data.role && data.role !== "citizen" ? APP_STATES.AUTHENTICATED_ADMIN : APP_STATES.AUTHENTICATED_CITIZEN;
        state.startup = { appState, loading: false, error: "" };
        persistClientState();
        emitAuthChange();
        return this.getSessionSnapshot();
    },
    async logout() {
        try { await api("/auth/logout", { method: "POST" }); } catch {}
        setToken("");
        state.currentUser = null;
        state.reportDraft = clone(draftTemplate);
        state.startup = { appState: APP_STATES.UNAUTHENTICATED, loading: false, error: "" };
        persistClientState();
        emitAuthChange();
    },
    async resetPassword(email) {
        const data = await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ email }) });
        return { message: data.message || `A password reset email has been sent to ${email}.` };
    },
    getFriendlyError(error) { return buildFriendlyAuthError(error); },
};

export const permissionService = {
    getStatuses() { return clone(state.permissionStatus); },
    async requestLocation() {
        if (!navigator.geolocation) {
            state.permissionStatus.location = "blocked";
            persistClientState();
            return { status: "blocked", location: null };
        }
        const result = await new Promise((resolve) => {
            let resolved = false;
            const timeoutId = setTimeout(function () {
                if (!resolved) {
                    resolved = true;
                    resolve({ status: "denied", location: null, error: "Location request timed out" });
                }
            }, 10000);
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        resolve({
                            status: "granted",
                            location: {
                                latitude: pos.coords.latitude,
                                longitude: pos.coords.longitude,
                                timestamp: nowIso(),
                                address: "Detected location " + pos.coords.latitude.toFixed(4) + ", " + pos.coords.longitude.toFixed(4),
                            },
                        });
                    }
                },
                (err) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        const msg = err.code === 1 ? "Location permission denied" : err.code === 2 ? "Location unavailable" : "Location request timed out";
                        resolve({ status: state.permissionStatus.location === "denied" ? "blocked" : "denied", location: null, error: msg });
                    }
                },
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
            );
        });
        state.permissionStatus.location = result.status;
        persistClientState();
        return result;
    },
    markCameraGranted() { state.permissionStatus.camera = "granted"; state.permissionStatus.video = "granted"; persistClientState(); },
    markGalleryGranted() { state.permissionStatus.gallery = "granted"; persistClientState(); },
    markVideoGranted() { state.permissionStatus.video = "granted"; state.permissionStatus.camera = "granted"; persistClientState(); },
    markAudioGranted() { state.permissionStatus.audio = "granted"; persistClientState(); },
    async requestDevicePermissions() {
        state.devicePermissionPromptShown = true;
        const locationResult = await this.requestLocation();
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                state.permissionStatus.camera = "blocked"; state.permissionStatus.video = "blocked"; state.permissionStatus.audio = "blocked";
                persistClientState();
                return { location: locationResult, audio: "blocked", video: "blocked", camera: "blocked" };
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach((t) => t.stop());
            state.permissionStatus.camera = "granted"; state.permissionStatus.video = "granted"; state.permissionStatus.audio = "granted";
            persistClientState();
            return { location: locationResult, audio: "granted", video: "granted", camera: "granted" };
        } catch {
            state.permissionStatus.camera = "denied"; state.permissionStatus.video = "denied"; state.permissionStatus.audio = "denied";
            persistClientState();
            return { location: locationResult, audio: "denied", video: "denied", camera: "denied" };
        }
    },
    async requestNotifications() {
        if (!("Notification" in window)) { state.permissionStatus.notifications = "blocked"; persistClientState(); return "blocked"; }
        const permission = await Notification.requestPermission();
        const status = permission === "granted" ? "granted" : permission === "denied" ? "denied" : "unknown";
        state.permissionStatus.notifications = status; state.notificationPromptShown = true;
        persistClientState();
        return status;
    },
    skipNotificationPrompt() { state.notificationPromptShown = true; persistClientState(); },
    shouldPromptNotifications() { return !state.notificationPromptShown && state.permissionStatus.notifications !== "granted"; },
    shouldPromptDevicePermissions() {
        if (state.devicePermissionPromptShown) return false;
        const s = state.permissionStatus;
        return s.location === "unknown" || s.camera === "unknown" || s.video === "unknown" || s.audio === "unknown";
    },
};

export const reportService = {
    async getReports() {
        const data = await api("/reports");
        state.reports = data.reports || [];
        return clone(state.reports);
    },
    async getReportById(id) {
        const data = await api(`/reports/${id}`);
        return data.report;
    },
    updateDraft(partial) {
        if (partial.image && partial.image.startsWith("data:image")) {
            return compressImage(partial.image, 1024, 0.75).then((compressed) => {
                state.reportDraft = { ...state.reportDraft, ...partial, image: compressed };
                persistClientState();
                return clone(state.reportDraft);
            });
        }
        state.reportDraft = { ...state.reportDraft, ...partial };
        persistClientState();
        return Promise.resolve(clone(state.reportDraft));
    },
    getDraft() { return clone(state.reportDraft); },
    resetDraft() { state.reportDraft = clone(draftTemplate); persistClientState(); },
    async createReport(payload) {
        const mediaType = payload.mediaType || "image";
        let image = payload.image || "";
        if (image && image.startsWith("data:")) {
            try { await uploadToCloudinary(image, "swachhlens/complaints"); } catch {}
        }
        const data = await api("/reports", {
            method: "POST",
            body: JSON.stringify({
                image, video: payload.video || "",
                aiResult: payload.aiResult,
                location: payload.location,
                comment: payload.comment || "",
            }),
        });
        const report = data.report;
        state.reports.unshift(report);
        persistClientState();
        return clone(report);
    },
    async updateReportStatus(id, status, extra = {}) {
        const body = { status };
        if (extra.afterImage) body.afterImage = extra.afterImage;
        const data = await api(`/reports/${id}/status`, { method: "PATCH", body: JSON.stringify(body) });
        return data.report;
    },
    async saveAfterPhoto(id, afterImage) {
        return this.updateReportStatus(id, "verification", { afterImage });
    },
    async updateReport(id, updates) {
        const data = await api(`/reports/${id}`, { method: "PUT", body: JSON.stringify(updates) });
        const idx = state.reports.findIndex((r) => r.id === id);
        if (idx !== -1) state.reports[idx] = data.report;
        return clone(data.report);
    },
    async deleteReport(id) {
        await api(`/reports/${id}`, { method: "DELETE" });
        state.reports = state.reports.filter((r) => r.id !== id);
        return true;
    },
};

export const aiService = {
    async analyzeWaste(draft) {
        if (!draft.image) throw new Error("Please capture or upload a photo first.");
        const steps = ["Detecting waste boundaries", "Classifying waste type", "Estimating volume", "Checking severity level", "Generating priority score"];
        for (const step of steps) { await delay(300); draft.onProgress?.(step); }
        const data = await api("/ai/analyze", {
            method: "POST",
            body: JSON.stringify({ image: draft.image || "", comment: draft.comment || "", location: draft.location || {}, mediaType: draft.mediaType || "image" }),
        });
        return data;
    },
};

export const teamService = {
    async getTeams() {
        const data = await api("/teams");
        state.teams = data.teams || [];
        return clone(state.teams);
    },
    async assignTeam(reportId, teamId) {
        await api("/teams/assign", { method: "POST", body: JSON.stringify({ reportId, teamId }) });
        return { success: true };
    },
};

export const notificationService = {
    async getNotifications() {
        try {
            const data = await api("/notifications");
            state.notifications = data.notifications || [];
            return clone(state.notifications);
        } catch {
            return clone(state.notifications);
        }
    },
};

export const adminService = {
    async getDashboard() {
        const data = await api("/admin/dashboard");
        return data.dashboard;
    },
    async getComplaints(filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
        const qs = params.toString();
        const data = await api(`/admin/complaints${qs ? "?" + qs : ""}`);
        return data;
    },
    async getComplaint(id) {
        const data = await api(`/admin/complaints/${encodeURIComponent(id)}`);
        return data.report;
    },
    async updateComplaint(id, updates) {
        const data = await api(`/admin/complaints/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(updates) });
        return data.report;
    },
    async assignComplaint(id, teamId) {
        const data = await api(`/admin/complaints/${encodeURIComponent(id)}/assign`, { method: "PATCH", body: JSON.stringify({ teamId }) });
        return data;
    },
    async escalateComplaint(id) {
        const data = await api(`/admin/complaints/${encodeURIComponent(id)}/escalate`, { method: "PATCH" });
        return data.report;
    },
    async markDuplicate(id, primaryReportId) {
        const data = await api(`/admin/complaints/${encodeURIComponent(id)}/duplicate`, { method: "PATCH", body: JSON.stringify({ primaryReportId }) });
        return data.report;
    },
    async routeToRecycler(id, partner) {
        const data = await api(`/admin/complaints/${encodeURIComponent(id)}/recycle`, { method: "PATCH", body: JSON.stringify({ partner }) });
        return data.report;
    },
    async verifyWithAI(id) {
        const data = await api(`/admin/complaints/${encodeURIComponent(id)}/verify-ai`, { method: "POST" });
        return data;
    },
    async bulkAssign(reportIds, teamId) {
        const data = await api("/admin/bulk-assign", { method: "POST", body: JSON.stringify({ reportIds, teamId }) });
        return data;
    },
    async getHotspotCells() {
        const data = await api("/admin/hotspots");
        return data.cells || [];
    },
    async getAlerts(limit = 40) {
        const data = await api(`/admin/alerts?limit=${encodeURIComponent(limit)}`);
        return data.alerts || [];
    },
    async getRecyclingQueue() {
        const data = await api("/admin/complaints?recyclable=true&sort=priority");
        return data.reports || [];
    },
    async getTeamsWithLoad() {
        const data = await api("/admin/teams");
        return data.teams || [];
    },
    async createTeam(payload) {
        const data = await api("/admin/teams", { method: "POST", body: JSON.stringify(payload) });
        return data.team;
    },
    async updateTeam(id, updates) {
        const data = await api(`/admin/teams/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(updates) });
        return data.team;
    },
    async deleteTeam(id) {
        return api(`/admin/teams/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    async dismissDuplicateGroup(groupId) {
        return api("/admin/duplicates/dismiss", { method: "POST", body: JSON.stringify({ groupId }) });
    },
    async getUsers() {
        const data = await api("/admin/users");
        return data.users;
    },
    async updateUser(uid, updates) {
        const data = await api(`/admin/users/${uid}`, { method: "PUT", body: JSON.stringify(updates) });
        return data.user;
    },
    async getVerificationQueue() {
        const data = await api("/admin/verification-queue");
        return data.reports;
    },
    async getDuplicateGroups() {
        const data = await api("/admin/duplicates");
        return data.groups;
    },
    async mergeDuplicates(groupId, keepId) {
        return api("/admin/duplicates/merge", { method: "POST", body: JSON.stringify({ groupId, keepId }) });
    },
    async getAnalytics() {
        const data = await api("/admin/analytics");
        return data.analytics;
    },
    async getActivityLogs() {
        const data = await api("/admin/activity-logs");
        return data.logs;
    },
    async getWorkerStats() {
        const data = await api("/admin/workers");
        return data.workers;
    },
    async toggleWorkerDuty(uid, dutyStatus) {
        const data = await api(`/admin/workers/${encodeURIComponent(uid)}/duty`, {
            method: "PATCH",
            body: JSON.stringify({ dutyStatus }),
        });
        return data.user;
    },
};

export const vehicleService = {
    async getVehicles() {
        const data = await api("/vehicles");
        return data.vehicles || [];
    },
    async getVehicleById(id) {
        const data = await api(`/vehicles/${id}`);
        return data.vehicle;
    },
};

export const heartbeatService = {
    _interval: null,
    start() {
        if (this._interval) return;
        this._interval = setInterval(async () => {
            try { await api("/heartbeat", { method: "POST" }); } catch {}
        }, 30 * 60 * 1000);
    },
    stop() {
        if (this._interval) { clearInterval(this._interval); this._interval = null; }
    },
};

export const profileService = {
    async updateProfile({ name, phone }) {
        const data = await api("/auth/profile", {
            method: "PUT",
            body: JSON.stringify({ name, phone }),
        });
        state.currentUser = { ...state.currentUser, ...data.currentUser };
        persistClientState();
        emitAuthChange();
        return data.currentUser;
    },
    async changePassword({ currentPassword, newPassword }) {
        const data = await api("/auth/change-password", {
            method: "POST",
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        return data;
    },
};

export const citizenDashboardService = {
    async getDashboard() {
        const data = await api("/citizen/dashboard");
        return data;
    },
};

export const workerService = {
    async getTasks() {
        const data = await api("/worker/tasks");
        return data;
    },
    async getHistory() {
        const data = await api("/worker/history");
        return data.tasks || [];
    },
    async toggleDuty(dutyStatus) {
        const data = await api("/worker/duty", { method: "PUT", body: JSON.stringify({ dutyStatus }) });
        return data.user;
    },
    async updateReportStatus(id, status, extra = {}) {
        const body = { status };
        if (extra.afterImage) body.afterImage = extra.afterImage;
        const data = await api(`/reports/${id}/status`, { method: "PATCH", body: JSON.stringify(body) });
        return data.report;
    },
    async saveReportNotes(reportId, notes) {
        const data = await api("/worker/report-notes", { method: "PUT", body: JSON.stringify({ reportId, ...notes }) });
        return data.report;
    },
    async reportIssue(reportId, reason) {
        const data = await api("/worker/report-issue", { method: "POST", body: JSON.stringify({ reportId, reason }) });
        return data.report;
    },
};

export function getStateSnapshot() {
    return {
        onboardingCompleted: state.onboardingCompleted,
        startup: clone(state.startup),
        permissionStatus: clone(state.permissionStatus),
        reportDraft: clone(state.reportDraft),
        reports: clone(state.reports),
        teams: clone(state.teams),
        notifications: clone(state.notifications),
        currentUser: clone(state.currentUser),
        currentRole: state.currentUser?.role || null,
        routeForCurrentRole: roleToRoute(state.currentUser?.role),
    };
}

export function popSessionExpired() {
    try {
        const v = sessionStorage.getItem(SESSION_EXPIRED_KEY);
        if (v) { sessionStorage.removeItem(SESSION_EXPIRED_KEY); return true; }
    } catch {}
    return false;
}
