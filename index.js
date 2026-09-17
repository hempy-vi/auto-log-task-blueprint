#!/usr/bin/env node
// CLI entry point. Xem README.md để biết cách dùng.
const path = require('path');
const readline = require('readline');
require('./src/loadEnv').loadEnv();
const { parseMonthlyReport } = require('./src/parser');
const { runBatch, printSummary } = require('./src/runner');
const { CONSTANTS, getCredentials } = require('./src/config');
const blueprint = require('./src/blueprintActions');

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--report') args.report = argv[++i];
    else if (a === '--status') args.status = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

function printParsedSummary(parsed) {
  const specialTickets = parsed.specialTickets || (parsed.specialTicket ? [parsed.specialTicket] : []);
  console.log(`Đã parse được ${parsed.tickets.length} ticket thường + ${specialTickets.length} ticket đặc biệt.\n`);
  parsed.tickets.forEach((t, i) => {
    console.log(
      `${i + 1}. [${t.site}] ${t.title} — ${t.jobType} — ${t.effortPoints.length} dòng Effort Point, ${t.timeWorked.length} dòng Time Worked`
    );
  });
  specialTickets.forEach((t) => {
    console.log(`(đặc biệt) ${t.title} — ${t.effortPoints.length} dòng Effort Point, ${t.timeWorked.length} dòng Time Worked`);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const reportPath = args.report
    ? path.resolve(args.report)
    : path.resolve(__dirname, 'monthly-report', '202607_monthly-report.md');

  console.log(`Đang đọc file: ${reportPath}`);
  const parsed = parseMonthlyReport(reportPath);
  printParsedSummary(parsed);

  if (args.dryRun) {
    console.log('\n(--dry-run) Dừng tại đây, không mở trình duyệt.');
    return;
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: ['--start-maximized', '--disable-gpu', '--disable-dev-shm-usage', '--disable-features=CalculateNativeWinOcclusion'],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  // Màn hình chào (assets/splash.html) — thuần cosmetic, không ảnh hưởng
  // logic batch. Lỗi ở bước này (vd thiếu file) không được làm dừng cả batch.
  try {
    const splashPath = path.resolve(__dirname, 'assets', 'splash.html');
    await page.goto(`file:///${splashPath.replace(/\\/g, '/')}`);
    await page.waitForTimeout(10000); // khớp với thời lượng thanh loading 10s trong splash.html
  } catch (err) {
    console.warn(`Không hiện được màn hình chào (${err.message}) — bỏ qua, tiếp tục đăng nhập.`);
  }

  try {
    console.log('Đang đăng nhập tự động...');
    await blueprint.login(page, getCredentials());
    await page.goto(CONSTANTS.requirementListUrl);
    console.log('Đăng nhập xong.');
  } catch (err) {
    console.warn(`Đăng nhập tự động lỗi (${err.message}) — chuyển sang đăng nhập thủ công.`);
    await page.goto(CONSTANTS.loginUrl);
    await waitForEnter('\nVui lòng đăng nhập thủ công trên trình duyệt, sau đó nhấn Enter ở đây để tiếp tục...\n');
    await page.goto(CONSTANTS.requirementListUrl);
  }

  try {
    const results = await runBatch(page, parsed, {
      statusForAll: args.status,
    });
    printSummary(results);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\nLỗi không xử lý được:', err.message);
  process.exitCode = 1;
});
