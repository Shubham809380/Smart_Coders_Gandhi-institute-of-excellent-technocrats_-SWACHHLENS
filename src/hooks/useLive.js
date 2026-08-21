import { useEffect, useRef, useState } from "react";

const LIVE_EVENTS = [
  "waste:new",
  "waste:updated",
  "waste:status:update",
  "complaint:escalated",
  "team:update",
  "team:deleted",
];

let sharedSource = null;
let sourceRefCount = 0;
const listeners = new Set();

function getEventSource() {
  if (sharedSource) return sharedSource;
  try {
    sharedSource = new EventSource("/api/events");
  } catch {
    return null;
  }
  sharedSource.onopen = () => {
    for (const l of listeners) l.onStatus?.(true);
  };
  sharedSource.onerror = () => {
    for (const l of listeners) l.onStatus?.(false);
    // EventSource reconnects automatically; nothing else to do.
  };
  for (const evt of LIVE_EVENTS) {
    sharedSource.addEventListener(evt, (e) => {
      let payload = null;
      try { payload = e.data ? JSON.parse(e.data) : null; } catch { payload = e.data; }
      for (const l of listeners) {
        if (!l.events || l.events.includes(evt)) {
          try { l.callback(evt, payload); } catch (err) { console.warn("[useLive] listener error:", err); }
        }
      }
    });
  }
  return sharedSource;
}

/**
 * Subscribes to live server-sent events with an automatic polling fallback so
 * the UI stays fresh even when the stream is unavailable.
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
    const es = getEventSource();
    if (es && es.readyState === 1) setConnected(true);
    return () => {
      listeners.delete(entry);
      sourceRefCount -= 1;
      if (sourceRefCount <= 0 && sharedSource) {
        sharedSource.close();
        sharedSource = null;
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
