const BASE = "http://127.0.0.1:4173/";

export default async function run(page, ui) {
  const report = { errors: [], pageErrors: [] };
  page.on("console", (msg) => { if (msg.type() === "error") report.errors.push(msg.text()); });
  page.on("pageerror", (err) => report.pageErrors.push(String(err)));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".onboarding-screen", { timeout: 8000 });
  await page.waitForTimeout(200);

  const slides = [];
  for (let i = 0; i < 3; i++) {
    const snap = await page.evaluate(() => ({
      svgCount: document.querySelectorAll(".onboarding-visual svg.scene-art").length,
      chipCount: document.querySelectorAll(".onboarding-visual .floating-card").length,
      label: (document.querySelector(".onboarding-copy .eyebrow") || {}).textContent || null,
      title: (document.querySelector(".onboarding-copy h2") || {}).textContent || null,
      body: (document.querySelector(".onboarding-copy p") || {}).textContent || null,
      cta: (document.querySelector(".onboarding-cta") || {}).textContent || null,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    slides.push(snap);
    const next = await page.$("[data-next-onboarding]");
    if (next) { await next.click(); await page.waitForTimeout(450); }
  }
  await page.waitForTimeout(300);
  const welcome = await page.evaluate(() => ({
    hasVisual: Boolean(document.querySelector(".welcome-visual svg.scene-art")),
    trust: Array.from(document.querySelectorAll(".trust-row li")).map((li) => li.textContent.trim()),
    hasWelcomeTitle: document.body.innerText.includes("A cleaner city starts with you."),
  }));
  await page.click("[data-go-signup]");
  await page.waitForTimeout(300);
  const signup = await page.evaluate(() => ({
    hasEyebrow: (document.querySelector(".auth-intro .eyebrow") || {}).textContent || null,
    benefits: Array.from(document.querySelectorAll(".benefit-row li")).map((li) => li.textContent.trim()),
    title: (document.querySelector(".auth-intro h2") || {}).textContent || null,
    submit: (document.querySelector(".auth-submit") || {}).textContent || null,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  return { slides, welcome, signup, errors: report.errors, pageErrors: report.pageErrors };
}
