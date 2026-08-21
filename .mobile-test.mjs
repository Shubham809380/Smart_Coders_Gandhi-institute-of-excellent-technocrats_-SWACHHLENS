import puppeteer from "puppeteer-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:5173";
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
page.on("console", (m) => { const t = m.text(); if (/error|warn|fail/i.test(t)) console.log("[console]", t.slice(0, 250)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));

await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[type="password"]', { timeout: 30000 });
await page.type('input[type="email"], input[placeholder*="mail" i]', "admin@swachhlens.app", { delay: 6 });
await page.type('input[type="password"]', "admin123", { delay: 6 });
await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^sign in$/i.test(x.innerText.trim()))?.click());
try { await page.waitForFunction(() => location.pathname.startsWith("/admin"), { timeout: 30000 }); } catch {}
await settle(5000);

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(`${BASE}/admin/teams`, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await settle(6000);

const info = await page.evaluate(() => {
  const main = document.querySelector("main");
  return {
    url: location.pathname,
    mainText: main ? main.innerText.replace(/\n+/g, " | ").slice(0, 400) : "NO MAIN",
    mainLen: main ? main.innerHTML.length : 0,
    bodyLen: document.body.innerHTML.length,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "C:/Users/VICTUS/AppData/Local/Temp/opencode/ss-teams-mobile.png" });

// desktop compare
await page.setViewport({ width: 1280, height: 900 });
await settle(3000);
const info2 = await page.evaluate(() => {
  const main = document.querySelector("main");
  return { mainLen: main ? main.innerHTML.length : 0, mainText: main ? main.innerText.slice(0, 150) : "" };
});
console.log("DESKTOP:", JSON.stringify(info2));

await browser.close();
console.log("DONE");
