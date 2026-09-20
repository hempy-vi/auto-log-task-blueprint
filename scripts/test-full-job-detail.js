// Test đầy đủ Job Detail (Time Worked trước, Effort Point sau) bằng đúng
// code production (blueprintActions.addAllTimeWorked/addAllEffortPoints).
// Dùng ticket #2824 "Delete Specific Bales" (đi thẳng qua URL).
require('../src/loadEnv').loadEnv();
const readline = require('readline');
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials } = require('../src/config');
const SEL = require('../src/selectors');
const { parseMonthlyReport } = require('../src/parser');

const TICKET_URL = process.env.TICKET_URL || 'https://blueprint.cyberlogitec.com.vn/UI_PIM_001_1/PRQ20260829000000076';
const TICKET_TITLE = process.env.TICKET_TITLE || 'Delete Specific Bales';
const REPORT_FILE = process.env.REPORT_FILE || './monthly-report/202607_monthly-report.md';
const SHOT = process.env.SHOT_OUT || 'test-full-job-detail.png';

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

async function shot(page, suffix) {
  const p = SHOT.replace(/\.png$/, `-${suffix}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log('   Screenshot:', p);
}

async function main() {
  const { tickets } = parseMonthlyReport(REPORT_FILE);
  const ticket = tickets.find((t) => t.title.includes(TICKET_TITLE));

  const browser = await chromium.launch({ headless: false, slowMo: 150, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  try {
    console.log('1. Đăng nhập...');
    await blueprint.login(page, getCredentials());

    console.log(`2. Vào thẳng ticket: ${TICKET_URL}`);
    await page.goto(TICKET_URL);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    console.log('3. Mở modal Job Detail...');
    await blueprint.openJobDetailModal(page);
    await shot(page, '1-opened');

    if (process.env.SKIP_TIME_WORKED === '1') {
      console.log('4. Bỏ qua Time Worked (SKIP_TIME_WORKED=1 — ticket đã có sẵn dòng, tránh tạo trùng).');
    } else {
      console.log(`4. Nhập Time Worked (${ticket.timeWorked.length} dòng)...`);
      await blueprint.addAllTimeWorked(page, ticket.timeWorked);
      console.log('   OK.');
      await shot(page, '2-time-worked-done');
    }

    console.log(`5. Nhập Effort Point (${ticket.effortPoints.length} dòng)...`);
    await blueprint.addAllEffortPoints(page, ticket.effortPoints);
    console.log('   OK.');
    await page.waitForTimeout(1000);
    await shot(page, '3-effort-point-done');

    const modalStillOpen = await page.locator(SEL.jobDetailModal.root).isVisible().catch(() => false);
    console.log('   Modal Job Detail còn mở không?', modalStillOpen);
  } catch (err) {
    console.error(`\nLỖI: ${err.message}`);
    await shot(page, 'error');
  }
  if (process.stdin.isTTY) {
    await waitForEnter('\nNhấn Enter để đóng...\n');
  } else {
    console.log('\n(Không tương tác — đóng trình duyệt luôn.)');
  }
  await browser.close();
}

main();
