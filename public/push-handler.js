// Web Push handlers — imported into the generated service worker via
// workbox.importScripts in vite.config.js.
// "push": render the OS notification. "notificationclick": deep-link into the
// app (e.g. /tracking?reportId=...) instead of dumping the user on the home page.

const ICON_URL = "/push-icon.svg";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "SwachhLens", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "SwachhLens";
  const options = {
    body: payload.body || "",
    icon: ICON_URL,
    badge: ICON_URL,
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        // Already have the app open? Focus it and navigate to the deep link.
        if ("focus" in client) {
          await client.focus();
          try {
            if (client.navigate && client.url !== target) await client.navigate(target);
          } catch { /* cross-origin or disposed client */ }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
