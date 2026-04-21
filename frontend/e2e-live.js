const { chromium } = require('playwright');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 400,
    executablePath: 'C:\\Users\\shaoxian04\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe',
    args: ['--window-size=1280,900'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log('1) Login as patient');
  await page.goto('http://localhost:3000/login');
  await delay(800);
  await page.getByRole('button', { name: 'Sign in' }).click();

  console.log('2) Wait for portal list');
  await page.waitForURL('**/portal');
  await delay(1200);

  console.log('3) Open visit detail');
  await page.getByRole('link', { name: /Visit / }).first().click();
  await page.waitForURL(/\/portal\/visits\//);
  await delay(1500);

  console.log('4) Toggle to Bahasa Melayu');
  await page.getByRole('tab', { name: 'Bahasa Melayu' }).click();
  await delay(1800);

  console.log('5) Toggle back to English');
  await page.getByRole('tab', { name: 'English' }).click();
  await delay(1500);

  console.log('6) Back to portal');
  await page.getByRole('link', { name: '← All visits' }).click();
  await page.waitForURL('**/portal');
  await delay(1500);

  console.log('Done. Closing in 3s…');
  await delay(3000);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
