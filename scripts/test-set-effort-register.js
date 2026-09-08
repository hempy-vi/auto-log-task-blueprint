// Chạy đúng blueprint.setAllEffortPointToRegister() (code production) trên 1
// ticket đã có sẵn Time Worked + Effort Point, để dồn 100% điểm vào Register.
require('../src/loadEnv').loadEnv();
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials } = require('../src/config');

const TICKET_URL = process.env.TICKET_URL;
if (!TICKET_URL) {
  console.error('Thiếu env TICKET_URL.');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 150, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  try {
    console.log('1. Đăng nhập...');
    await blueprint.login(page, getCredentials());

    console.log(`2. Vào ticket: ${TICKET_URL}`);
    await page.goto(TICKET_URL);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    console.log('3. Chỉnh Effort Point 100% vào Register (blueprint.setAllEffortPointToRegister)...');
    await blueprint.setAllEffortPointToRegister(page);
    console.log('   OK.');

    const finalEfforts = await page.locator('.effort-point .effort').allTextContents();
    console.log('   Effort Point 4 phase sau khi lưu:', finalEfforts);
    await page.screenshot({ path: 'test-set-effort-register-done.png', fullPage: true }).catch(() => {});
  } catch (err) {
    console.error(`\nLỖI: ${err.message}`);
    await page.screenshot({ path: 'test-set-effort-register-error.png', fullPage: true }).catch(() => {});
  }
  await page.waitForTimeout(3000).catch(() => {});
  await browser.close().catch(() => {});
}

main();
