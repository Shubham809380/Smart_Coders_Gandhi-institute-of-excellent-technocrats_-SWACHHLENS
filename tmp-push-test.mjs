const BASE = "http://127.0.0.1:3211/api";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {}
    await sleep(2000);
  }
  throw new Error("server did not start");
}

await waitForServer();
console.log("server up");

// 1. login as citizen
let res = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "citizen@swachhlens.app", password: "citizen123" }),
});
const login = await res.json();
if (!res.ok || !login.sessionToken) throw new Error("login failed: " + JSON.stringify(login));
const auth = { "Content-Type": "application/json", Authorization: `Bearer ${login.sessionToken}` };
console.log("1. citizen login OK role=" + login.role);

// 2. subscribe without auth -> must be rejected
res = await fetch(`${BASE}/push/subscribe`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subscription: { endpoint: "https://fcm.googleapis.com/fake/test-endpoint-xyz", keys: { p256dh: "k", auth: "a" } } }),
});
const noAuth = await res.json();
console.log(`2. subscribe unauthenticated -> ${res.status} ${noAuth?.error?.code || ""}`);

// 3. subscribe with auth -> ok
res = await fetch(`${BASE}/push/subscribe`, { method: "POST", headers: auth, body: JSON.stringify({ subscription: { endpoint: "https://fcm.googleapis.com/fake/test-endpoint-xyz", keys: { p256dh: "k", auth: "a" } } }) });
console.log(`3. subscribe authenticated -> ${res.status} ${JSON.stringify(await res.json())}`);

// 4. re-subscribe same endpoint (upsert) -> ok
res = await fetch(`${BASE}/push/subscribe`, { method: "POST", headers: auth, body: JSON.stringify({ subscription: { endpoint: "https://fcm.googleapis.com/fake/test-endpoint-xyz", keys: { p256dh: "k2", auth: "a2" } } }) });
console.log(`4. re-subscribe upsert -> ${res.status} ${JSON.stringify(await res.json())}`);

// 5. unsubscribe -> ok
res = await fetch(`${BASE}/push/unsubscribe`, { method: "POST", headers: auth, body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fake/test-endpoint-xyz" }) });
console.log(`5. unsubscribe -> ${res.status} ${JSON.stringify(await res.json())}`);

// 6. admin login with promoted gmail? password unknown - skip. Instead verify /auth/me works and status-change trigger path exists via report flow:
// create a report then transition its status to fire sendPushToUser code path (no real sub -> should not crash)
res = await fetch(`${BASE}/reports`, {
  method: "POST", headers: auth,
    body: JSON.stringify({
      imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      location: { latitude: 20.2961, longitude: 85.8245, address: "Test push trigger" },
      aiResult: { wasteType: "household", quantity: "small", confidence: 0.9, priorityScore: 3 },
      description: "push-trigger test",
    }),
});
const created = await res.json();
const rid = created?.report?.id;
console.log(`6. create report -> ${res.status} id=${rid}`);
if (!rid) throw new Error("report create failed");

// admin transitions status -> exercises sendPushToUser + createNotification
res = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@swachhlens.app", password: "admin123" }) });
const adminLogin = await res.json();
const adminAuth = { "Content-Type": "application/json", Authorization: `Bearer ${adminLogin.sessionToken}` };
res = await fetch(`${BASE}/reports/${rid}/status`, { method: "PATCH", headers: adminAuth, body: JSON.stringify({ status: "under_review" }) });
console.log(`7a. status submitted->under_review -> ${res.status}`);
if (res.ok) {
  res = await fetch(`${BASE}/reports/${rid}/status`, { method: "PATCH", headers: adminAuth, body: JSON.stringify({ status: "assigned" }) });
  console.log(`7b. status under_review->assigned -> ${res.status} (exercises sendPushToUser path)`);
}

// cleanup: delete the test report directly via DELETE (citizen owns it)
res = await fetch(`${BASE}/reports/${rid}`, { method: "DELETE", headers: auth });
console.log(`8. delete test report -> ${res.status}`);

console.log("ALL PUSH API TESTS DONE");
