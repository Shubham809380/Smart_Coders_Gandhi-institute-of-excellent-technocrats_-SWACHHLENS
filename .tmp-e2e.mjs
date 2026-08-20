const KEY = "swachhlens-client-state-v3";

async function login(page, email, password) {
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

async function seedSession(page, token, onboardingCompleted = true) {
  await page.evaluate(({ token, onboardingCompleted }) => {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    saved.sessionToken = token;
    saved.onboardingCompleted = onboardingCompleted;
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, { token, onboardingCompleted });
}

async function observeSplash(page) {
  await page.waitForSelector(".splash-screen", { timeout: 8000 });
  const t0 = Date.now();
  const phases = [];
  let reached = null;
  let splashTime = 0;
  while (Date.now() - t0 < 5000) {
    const snapshot = await page.evaluate(() => {
      const logo = document.querySelector(".splash-logo");
      const scan = document.querySelector(".splash-scan-ring");
      const glow = document.querySelector(".splash-glow");
      const flash = document.querySelector(".splash-lens-flash");
      const h1 = document.querySelector(".splash-copy h1");
      const p = document.querySelector(".splash-copy p");
      const loader = document.querySelector(".splash-loader");
      const exiting = document.querySelector(".splash-screen.splash-exit");
      const root = document.querySelector(".app-shell, .auth-shell");
      const rootEntering = root ? root.classList.contains("screen-enter") : false;
      return {
        hasSplash: Boolean(document.querySelector(".splash-screen")),
        logoOpacity: logo ? getComputedStyle(logo).opacity : null,
        logoAnim: logo ? getComputedStyle(logo).animationName : null,
        scanOpacity: scan ? getComputedStyle(scan).opacity : null,
        glowOpacity: glow ? getComputedStyle(glow).opacity : null,
        flashOpacity: flash ? getComputedStyle(flash).opacity : null,
        h1Opacity: h1 ? getComputedStyle(h1).opacity : null,
        pOpacity: p ? getComputedStyle(p).opacity : null,
        loaderShown: loader ? loader.classList.contains("show") : null,
        exiting: Boolean(exiting),
        rootEntering,
      };
    });
    if (reached === null && snapshot.hasSplash) reached = "splash";
    phases.push(snapshot);
    if (snapshot.hasSplash) splashTime = Date.now() - t0;
    if (!snapshot.hasSplash && snapshot.rootEntering) break;
    if (!snapshot.hasSplash && reached === "splash") { reached = "next"; break; }
    await page.waitForTimeout(180);
  }
  return { phases, splashTime, reached };
}

export default async function run(page) {
  const report = {};

  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const fresh = await observeSplash(page);
  report.freshUser = {
    ...fresh,
    sawOnboarding: (await page.evaluate(() => document.body.innerText)).includes("Report Waste Instantly"),
  };

  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ onboardingCompleted: true, sessionToken: "" }));
  }, KEY);
  await page.reload();
  const out = await observeSplash(page);
  report.loggedOut = {
    ...out,
    sawLogin: (await page.evaluate(() => document.body.innerText)).includes("Welcome back"),
  };

  const cit = await login(page, "citizen@swachhlens.app", "citizen123");
  await page.goto("http://127.0.0.1:4173/");
  await seedSession(page, cit);
  await page.reload();
  const c = await observeSplash(page);
  report.citizen = {
    ...c,
    reachedHome: (await page.evaluate(() => document.body.innerText)).includes("Report Waste"),
  };

  const adm = await login(page, "admin@swachhlens.app", "admin123");
  await page.goto("http://127.0.0.1:4173/");
  await seedSession(page, adm);
  await page.reload();
  const a = await observeSplash(page);
  report.admin = {
    ...a,
    reachedAdmin: (await page.evaluate(() => document.body.innerText)).includes("Operations Command Center"),
  };

  const wrk = await login(page, "worker@swachhlens.app", "worker123");
  await page.goto("http://127.0.0.1:4173/");
  await seedSession(page, wrk);
  await page.reload();
  const w = await observeSplash(page);
  report.worker = {
    ...w,
    reachedWorker: (await page.evaluate(() => document.body.innerText)).includes("Assigned Tasks"),
  };

  return report;
}
