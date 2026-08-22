import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const LIVE_EVENTS = [
  "waste:new",
  "waste:updated",
  "waste:status:update",
  "complaint:escalated",
  "team:update",
  "team:deleted",
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
  });
  sharedSocket.on("disconnect", (reason) => {
    console.log("[useLive] socket disconnected:", reason);
    setStatus(false);
  });
  sharedSocket.on("connect_error", (error) => {
    // Common during Render cold starts or right after session expiry.
    // Automatic reconnection keeps trying; polling fallback keeps data fresh.
    console.warn("[useLive] socket connection error:", error?.message || error);
    setStatus(false);
  });
  for (const evt of LIVE_EVENTS) {
    sharedSocket.on(evt, (payload) => dispatchEvent(evt, payload ?? null));
  }
  return sharedSocket;
}

// --- SSE fallback transport (legacy, unchanged behaviour) -------------------
function getSource() {
  if (sharedSource) return sharedSource;
  try {
    sharedSource = new EventSource("/api/events");
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
 * Subscribes to live server events (Socket.IO on Render, SSE fallback) with an
 * automatic polling fallback so the UI stays fresh even when the stream is
 * unavailable.
 *
 * @param {(event: string, payload: any) => void} onEvent called on live event
 * @param {string[]} events events to listen for (default: all)
 * @param {{ pollMs?: number, poll?: () => void }} options polling fallback config
 */
export function useLive(onEvent, events = LIVE_EVENTS, { pollMs = 30000, poll } = {}) {
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

    return () => {
      listeners.delete(entry);
      sourceRefCount -= 1;
      if (sourceRefCount <= 0) {
        if (sharedSocket) { sharedSocket.disconnect(); sharedSocket = null; }
        if (sharedSource) { sharedSource.close(); sharedSource = null; }
        sourceRefCount = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pollMs || !poll) return undefined;
    const id = setInterval(() => {
      try { pollRef.current?.(); } catch (err) { console.warn("[useLive] poll error:", err); }
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, poll]);

  return { connected };
}
