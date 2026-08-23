import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// Central event catalogue — the ONLY place transport event names are listed.
// Server side equivalents live in backend/router.js + socket-server/index.js.
export const LIVE_EVENTS = [
  "waste:new",            // new citizen report (admins)
  "waste:updated",        // report mutated: assignment/escalation/merge (admins)
  "waste:status:update",  // status lifecycle change (report room + admins + workers)
  "complaint:escalated",  // escalation raised (admins)
  "team:update",          // team roster changed (admins)
  "team:deleted",
  "worker:proximity",     // worker near a task site (admins)
  "worker:location",      // worker GPS ping (admins)
  "task:assigned",        // targeted: worker received an assignment
  "notification:new",     // targeted: persisted notification created
  "feedback:requested",   // targeted: citizen may now rate a resolved report
  "feedback:submitted",   // admins: citizen rated a cleanup
];

// Production realtime runs on Render (Socket.IO). When VITE_SOCKET_URL is not
// configured (e.g. plain local dev), fall back to the legacy SSE endpoint.
const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || "");
const TOKEN_KEY = "swachhlens-session-token";

if (!SOCKET_URL && import.meta.env.PROD) {
  console.warn("[useLive] VITE_SOCKET_URL is not set — falling back to SSE, which is unreliable on serverless hosting.");
}

let sharedSocket = null;
let sharedSource = null;
let sourceRefCount = 0;
const listeners = new Set();
const watchedReports = new Map(); // reportId -> refCount across all listeners

function readToken() {
  try { return window.localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

function setStatus(connected) {
  for (const l of listeners) l.onStatus?.(connected);
}

function dispatchEvent(evt, payload) {
  for (const l of listeners) {
    if (!l.events || l.events.includes(evt)) {
      try { l.callback(evt, payload); } catch (err) { console.warn("[useLive] listener error:", err); }
    }
  }
}

function attachEventListeners(socket) {
  for (const evt of LIVE_EVENTS) {
    socket.on(evt, (payload) => dispatchEvent(evt, payload ?? null));
  }
}

// --- Socket.IO transport (production + local dev with socket server) --------
function getSocket() {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    // Fresh token on every attempt so re-login/reconnect picks up new sessions.
    auth: (cb) => cb({ token: readToken() }),
  });
  sharedSocket.on("connect", () => {
    console.log("[useLive] socket connected:", sharedSocket.id);
    setStatus(true);
    // Re-join any report rooms after a reconnect.
    for (const [reportId, count] of watchedReports) {
      if (count > 0) emitWatch(reportId);
    }
  });
  sharedSocket.on("disconnect", (reason) => {
    console.log("[useLive] socket disconnected:", reason);
    setStatus(false);
  });
  sharedSocket.on("connect_error", (error) => {
    // Common during Render cold starts or right after session expiry.
    console.warn("[useLive] socket connection error:", error?.message || error);
    setStatus(false);
  });
  attachEventListeners(sharedSocket);
  return sharedSocket;
}

function emitWatch(reportId) {
  if (!sharedSocket || !sharedSocket.connected) return;
  sharedSocket.emit("report:watch", { reportId }, (res) => {
    if (!res?.ok) console.warn(`[useLive] report:watch denied for ${reportId}: ${res?.error || "unknown"}`);
  });
}

function watchReport(reportId) {
  const count = watchedReports.get(reportId) || 0;
  watchedReports.set(reportId, count + 1);
  if (count === 0) {
    getSocket();
    emitWatch(reportId);
  }
}

function unwatchReport(reportId) {
  const count = (watchedReports.get(reportId) || 0) - 1;
  if (count <= 0) {
    watchedReports.delete(reportId);
    try { sharedSocket?.emit("report:unwatch", { reportId }); } catch { /* closing */ }
  } else {
    watchedReports.set(reportId, count);
  }
}

// --- SSE fallback transport (legacy, unchanged behaviour) -------------------
function getSource() {
  if (sharedSource) return sharedSource;
  try {
    const token = readToken();
    sharedSource = new EventSource(token ? `/api/events?token=${encodeURIComponent(token)}` : "/api/events");
  } catch {
    return null;
  }
  sharedSource.onopen = () => setStatus(true);
  sharedSource.onerror = () => setStatus(false);
  // EventSource reconnects automatically; nothing else to do.
  for (const evt of LIVE_EVENTS) {
    sharedSource.addEventListener(evt, (e) => {
      let payload = null;
      try { payload = e.data ? JSON.parse(e.data) : null; } catch { payload = e.data; }
      dispatchEvent(evt, payload);
    });
  }
  return sharedSource;
}

/**
 * Subscribes to live server events (Socket.IO on Render, SSE fallback).
 *
 * Polling policy: the optional poll callback fires ONLY while the realtime
 * transport is disconnected — it is a resilience net, never the primary
 * update path. While connected, updates arrive exclusively via events.
 *
 * @param {(event: string, payload: any) => void} onEvent called on live event
 * @param {string[]} events events to listen for (default: all)
 * @param {{ pollMs?: number, poll?: () => void, reportId?: string }} options
 */
export function useLive(onEvent, events = LIVE_EVENTS, { pollMs = 30000, poll, reportId } = {}) {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onEvent);
  const pollRef = useRef(poll);
  cbRef.current = onEvent;
  pollRef.current = poll;

  useEffect(() => {
    const entry = { events, callback: (evt, payload) => cbRef.current?.(evt, payload), onStatus: setConnected };
    listeners.add(entry);
    sourceRefCount += 1;

    let transport = null;
    try {
      transport = SOCKET_URL ? getSocket() : getSource();
    } catch (err) {
      console.warn("[useLive] failed to open realtime transport:", err?.message || err);
    }

    if (!transport) {
      setStatus(false);
    } else if (SOCKET_URL) {
      setConnected(transport.connected === true);
    } else if (transport.readyState === 1) {
      setConnected(true);
    }

    if (reportId && SOCKET_URL) watchReport(reportId);

    return () => {
      listeners.delete(entry);
      if (reportId && SOCKET_URL) unwatchReport(reportId);
      sourceRefCount -= 1;
      if (sourceRefCount <= 0) {
        if (sharedSocket) { sharedSocket.disconnect(); sharedSocket = null; }
        if (sharedSource) { sharedSource.close(); sharedSource = null; }
        watchedReports.clear();
        sourceRefCount = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Resilience net: poll only while realtime is unavailable. When connected
  // this interval does nothing beyond a cheap boolean check.
  useEffect(() => {
    if (!pollMs || !poll) return undefined;
    const id = setInterval(() => {
      if (connected) return; // socket healthy — events are the update path
      try { pollRef.current?.(); } catch (err) { console.warn("[useLive] poll error:", err); }
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, poll, connected]);

  return { connected };
}
