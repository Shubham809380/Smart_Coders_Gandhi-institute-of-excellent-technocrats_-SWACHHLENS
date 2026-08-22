// Lightweight Server-Sent Events hub for live admin updates.
// Zero dependencies: works with the plain node:http server.
//
// In production the REST/AI APIs run on Vercel (serverless) while Socket.IO
// runs on Render. publish() therefore additionally forwards each event to the
// realtime service over an authenticated internal HTTP bridge
// (SOCKET_INTERNAL_URL + INTERNAL_API_SECRET). Locally, or when the variable
// is unset, only the SSE hub below is used.

const clients = new Set();

const FORWARD_URL = String(process.env.SOCKET_INTERNAL_URL || "");
const INTERNAL_SECRET = String(process.env.INTERNAL_API_SECRET || "");

let forwardFailures = 0;

// Fire-and-forget: a sleeping/restarting Render instance must never break an
// API mutation. Failures are logged sparsely to avoid noisy serverless logs.
function forwardToSocketServer(event, payload) {
  if (!FORWARD_URL || !INTERNAL_SECRET) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  fetch(FORWARD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    body: JSON.stringify({ event, payload }),
    signal: controller.signal,
  })
    .then((res) => {
      if (res.ok) {
        forwardFailures = 0;
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    })
    .catch((err) => {
      forwardFailures += 1;
      if (forwardFailures === 1 || forwardFailures % 20 === 0) {
        console.error(`[events] forward to socket-server failed (${forwardFailures}x):`, err?.message || err);
      }
    })
    .finally(() => clearTimeout(timer));
}

export function subscribe(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");

  const client = { res };
  clients.add(client);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* cleaned up on close */ }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

export function publish(event, payload = {}) {
  forwardToSocketServer(event, payload);
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try { client.res.write(frame); } catch {
      clients.delete(client);
    }
  }
}

export function clientCount() {
  return clients.size;
}
