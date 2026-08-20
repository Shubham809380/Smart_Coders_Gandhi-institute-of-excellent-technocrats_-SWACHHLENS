import fs from "node:fs";

const BASE = "http://127.0.0.1:4173/";
const KEY = "swachhlens-client-state-v3";

export default async function run(page, ui) {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".onboarding-screen", { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "shots/onboard-1.png" });

  await page.click("[data-next-onboarding]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/onboard-2.png" });

  await page.click("[data-next-onboarding]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/onboard-3.png" });

  await page.click("[data-complete-onboarding]");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shots/welcome.png" });

  await page.click("[data-go-signup]");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shots/signup.png" });

  const text = await page.evaluate(() => document.body.innerText.slice(0, 400));
  return { text };
}
