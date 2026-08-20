const KEY = "swachhlens-client-state-v3";
const BASE = "http://127.0.0.1:4173/";

export default async function run(page, ui) {
  const report = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => report.pageErrors.push(String(err)));
  page.on("requestfailed", (req) => report.failedRequests.push(req.url()));

  async function login(email, password) {
    return page.evaluate(async ({ email, password }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      return data.sessionToken || "";
    }, { email, password });
  }

  async function seed(token, onboardingCompleted = true) {
    await page.evaluate(({ token, onboardingCompleted, KEY }) => {
      const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
      saved.sessionToken = token;
      saved.onboardingCompleted = onboardingCompleted;
      localStorage.setItem(KEY, JSON.stringify(saved));
    }, { token, onboardingCompleted, KEY });
  }

  async function observeSplash() {
    await page.waitForSelector(".splash-screen", { timeout: 8000 });
    const t0 = Date.now();
    const phases = [];
    let whiteFlash = false;
    let prematureContent = null;
    let overflowSeen = false;
    let reached = null;
    let splashTime = 0;
    let bg = null;
    while (Date.now() - t0 < 6000) {
      const snap = await page.evaluate(() => {
        const logo = document.querySelector(".splash-logo");
        const scan = document.querySelector(".splash-scan-ring");
        const glow = document.querySelector(".splash-glow");
        const flash = document.querySelector(".splash-lens-flash");
        const h1 = document.querySelector(".splash-copy h1");
        const p = document.querySelector(".splash-copy p");
        const loader = document.querySelector(".splash-loader");
        const exiting = document.querySelector(".splash-screen.splash-exit");
        const root = document.querySelector(".app-shell, .auth-shell");
        return {
          hasSplash: Boolean(document.querySelector(".splash-screen")),
          hasStatic: Boolean(document.querySelector(".splash-static")),
          logoOpacity: logo ? Number(getComputedStyle(logo).opacity).toFixed(2) : null,
          logoScale: logo ? getComputedStyle(logo).transform : null,
          scanOpacity: scan ? Number(getComputedStyle(scan).opacity).toFixed(2) : null,
          glowOpacity: glow ? Number(getComputedStyle(glow).opacity).toFixed(2) : null,
          flashOpacity: flash ? Number(getComputedStyle(flash).opacity).toFixed(2) : null,
          h1Opacity: h1 ? Number(getComputedStyle(h1).opacity).toFixed(2) : null,
          pOpacity: p ? Number(getComputedStyle(p).opacity).toFixed(2) : null,
          loaderShown: loader ? loader.classList.contains("show") : null,
          exiting: Boolean(exiting),
          rootEntering: root ? root.classList.contains("screen-enter") : false,
          bodyBg: getComputedStyle(document.body).backgroundColor,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          text: document.body.innerText.slice(0, 60),
        };
      });
      bg = snap.bodyBg;
      if (snap.bodyBg !== "rgb(248, 251, 248)") whiteFlash = true;
      if (snap.hasSplash && snap.scrollW > snap.clientW) overflowSeen = true;
      const t = snap.text.toLowerCase();
      if (snap.hasSplash && !prematureContent && (t.includes("welcome back") || t.includes("create account") || t.includes("report waste") || t.includes("report waste instantly"))) {
        prematureContent = snap.text;
      }
      if (reached === null && snap.hasSplash) reached = "splash";
      phases.push(snap);
      if (snap.hasSplash) splashTime = Date.now() - t0;
      if (!snap.hasSplash && snap.rootEntering) { reached = "entered"; break; }
      if (!snap.hasSplash && reached === "splash") { reached = "next"; break; }
      await page.waitForTimeout(90);
    }
    return { phases, splashTime, reached, whiteFlash, prematureContent, overflowSeen, bg };
  }

  // 1. Fresh user
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const fresh = await observeSplash();
  const freshText = await page.evaluate(() => document.body.innerText);
  report.freshUser = {
    ...fresh,
    sawOnboarding: freshText.includes("Report Waste Instantly"),
    noLoginFlash: !freshText.includes("Welcome back"),
  };

  // 2. Returning logged-out user
  await page.goto(BASE);
  await page.evaluate((KEY) => {
    localStorage.setItem(KEY, JSON.stringify({ onboardingCompleted: true, sessionToken: "" }));
  }, KEY);
  await page.reload();
  const out = await observeSplash();
  const outText = await page.evaluate(() => document.body.innerText);
  report.loggedOut = {
    ...out,
    sawLogin: outText.includes("Welcome back"),
    sawOnboarding: outText.includes("Report Waste Instantly"),
  };

  // 3. Citizen
  const cit = await login("citizen@swachhlens.app", "citizen123");
  await page.goto(BASE);
  await seed(cit);
  await page.reload();
  const c = await observeSplash();
  const cText = await page.evaluate(() => document.body.innerText);
  report.citizen = {
    ...c,
    reachedHome: cText.includes("See waste around you?"),
    noOnboarding: !cText.includes("Report Waste Instantly"),
    noLogin: !cText.includes("Welcome back"),
  };

  // 4. Admin
  const adm = await login("admin@swachhlens.app", "admin123");
  await page.goto(BASE);
  await seed(adm);
  await page.reload();
  const a = await observeSplash();
  const aText = await page.evaluate(() => document.body.innerText);
  report.admin = {
    ...a,
    reachedAdmin: aText.includes("Operations Command Center"),
  };

  // 5. Worker
  const wrk = await login("worker@swachhlens.app", "worker123");
  await page.goto(BASE);
  await seed(wrk);
  await page.reload();
  const w = await observeSplash();
  const wText = await page.evaluate(() => document.body.innerText);
  report.worker = {
    ...w,
    reachedWorker: wText.includes("Assigned Tasks"),
  };

  // 6. Reduced motion (fresh user)
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const rm = await observeSplash();
  const rmAnim = await page.evaluate(() => {
    const logo = document.querySelector(".splash-logo");
    return logo ? getComputedStyle(logo).animationName : null;
  }).catch(() => null);
  report.reducedMotion = { ...rm, logoAnimationName: rmAnim };

  return report;
}
