export default async function run(page, ui) {
  await page.setViewportSize({ width: 375, height: 812 });
  
  // Test Admin Dashboard
  await page.goto('http://localhost:4173/admin/dashboard');
  await page.waitForSelector('main', { timeout: 10000 });
  const dashWidth = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? { offsetWidth: main.offsetWidth, marginLeft: getComputedStyle(main).marginLeft } : null;
  });
  await page.screenshot({ path: 'E:/ESSPL Project/test-admin-mobile.png' });

  // Test AI Priority Queue
  await page.goto('http://localhost:4173/admin/ai-priority-queue');
  await page.waitForSelector('main', { timeout: 10000 });
  await page.screenshot({ path: 'E:/ESSPL Project/test-priority-mobile.png' });

  // Test Smart Dispatch
  await page.goto('http://localhost:4173/admin/smart-dispatch');
  await page.waitForSelector('main', { timeout: 10000 });
  await page.screenshot({ path: 'E:/ESSPL Project/test-dispatch-mobile.png' });

  // Test Landing
  await page.goto('http://localhost:4173/landing');
  await page.waitForSelector('nav', { timeout: 10000 });
  await page.screenshot({ path: 'E:/ESSPL Project/test-landing-mobile.png' });

  // Test Login
  await page.goto('http://localhost:4173/login');
  await page.waitForSelector('form', { timeout: 10000 });
  await page.screenshot({ path: 'E:/ESSPL Project/test-login-mobile.png' });

  // Test Home
  await page.goto('http://localhost:4173/home');
  await page.waitForSelector('main', { timeout: 10000 });
  await page.screenshot({ path: 'E:/ESSPL Project/test-home-mobile.png' });

  return { 
    adminDashboard: dashWidth,
    message: 'Mobile screenshots captured at 375x812 viewport'
  };
}
