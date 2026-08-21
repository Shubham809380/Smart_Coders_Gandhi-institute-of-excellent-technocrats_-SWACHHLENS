// Lightweight Server-Sent Events hub for live admin updates.
// Zero dependencies: works with the plain node:http server.

const clients = new Set();

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
