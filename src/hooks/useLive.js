import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const LIVE_EVENTS = [
  "waste:created",
  "waste:updated",
  "waste:status:update",
  "waste:deleted",
  "complaint:escalated",
  "team:update",
  "team:deleted",
];

let sharedSocket = null;
const listeners = new Set();

function getSocket() {
  if (sharedSocket) return sharedSocket;
  try {
    sharedSocket = io(window.location.origin, { transports: ["websocket", "polling"], reconnectionDelayMax: 15000 });
  } catch {
    return null;
  }
  for (const evt of LIVE_EVENTS) {
    sharedSocket.on(evt, (payload) => {
      for (const l of listeners) {
        if (l.events.includes(evt)) {
          try { l.callback(evt, payload); } catch (err) { console.warn("[useLive] listener error:", err); }
        }
      }
    });
  }
  return sharedSocket;
}

/**
 * Subscribes to live socket events with an automatic polling fallback so the UI
 * stays fresh even when websockets are blocked (e.g. some corporate proxies).
 *
 * @param {(event: string, payload: any) => void} onEvent called on socket event
 * @param {string[]} events socket events to listen for (default: all)
 * @param {{ pollMs?: number, poll?: () => void }} options polling fallback config
 */
export function useLive(onEvent, events = LIVE_EVENTS, { pollMs = 30000, poll } = {}) {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onEvent);
  const pollRef = useRef(poll);
  cbRef.current = onEvent;
  pollRef.current = poll;

  useEffect(() => {
    const socket = getSocket();
    const entry = { events, callback: (evt, payload) => cbRef.current?.(evt, payload) };
    listeners.add(entry);
    if (socket) {
      setConnected(socket.connected);
      const onConnect = () => setConnected(true);
      const onDisconnect = () => setConnected(false);
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      return () => {
        listeners.delete(entry);
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
      };
    }
    return () => listeners.delete(entry);
  }, [events]);

  useEffect(() => {
    if (!pollMs || !poll) return undefined;
    const id = setInterval(() => {
      try { pollRef.current?.(); } catch (err) { console.warn("[useLive] poll error:", err); }
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, poll]);

  return { connected };
}
