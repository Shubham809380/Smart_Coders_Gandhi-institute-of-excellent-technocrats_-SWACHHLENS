// Web Push (VAPID) delivery on top of the plain node:http stack.
// Subscriptions live in the push_subscriptions table; sends are fire-and-forget
// so a push outage can never fail an API mutation.
import webpush from "web-push";
import { store } from "./store.js";

const PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || "");
const PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || "");

if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@swachhlens.app", PUBLIC_KEY, PRIVATE_KEY);
  } catch (err) {
    console.error("[push] invalid VAPID config:", err?.message || err);
  }
}

export function pushConfigured() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export function getPushPublicKey() {
  return PUBLIC_KEY;
}

export async function sendPushToUser(userId, payload) {
  if (!pushConfigured() || !userId) return;
  let subs = [];
  try {
    subs = await store.getPushSubscriptionsForUsers([userId]);
  } catch (err) {
    console.error("[push] load subscriptions failed:", err?.message || err);
    return;
  }
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          try { await store.deletePushSubscription(sub.endpoint); } catch { /* best effort */ }
        }
      }
    })
  );
}
