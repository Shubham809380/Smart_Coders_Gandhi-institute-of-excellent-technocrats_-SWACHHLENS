export default async function run(page, ui) {
  const errors = [];
  const consoleLogs = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleLogs.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => ({
    title: document.title,
    bodyLen: document.body?.innerHTML?.length,
    bodySnippet: document.body?.innerHTML?.substring(0, 500),
    rootLen: document.getElementById('root')?.innerHTML?.length,
  }));

  return { consoleLogs, errors, result };
}
