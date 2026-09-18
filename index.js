#!/usr/bin/env node
// CLI entry point. Xem README.md để biết cách dùng.
const path = require('path');
const readline = require('readline');
require('./src/loadEnv').loadEnv();
const { parseMonthlyReport } = require('./src/parser');
const { runBatch, printSummary } = require('./src/runner');
const { writeReportHtml } = require('./src/report');
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

// Không truyền --report -> bắt buộc phải có MONTH trong .env để suy ra file
// (monthly-report/<MONTH>_monthly-report.md). Trước đây mặc định cứng về
// "202607_monthly-report.md" khi thiếu --report -- lỗi tiềm ẩn thật: quên cờ
// --report sẽ ÂM THẦM chạy nhầm báo cáo tháng cũ thay vì báo lỗi rõ ràng.
function resolveReportPath(args) {
  if (args.report) return path.resolve(args.report);
  if (!process.env.MONTH) {
    throw new Error(
      'Thiếu --report và không có MONTH trong .env — truyền đường dẫn file (--report monthly-report\\202609_monthly-report.md), hoặc đặt MONTH=202609 (ví dụ) trong .env rồi chạy lại.'
    );
  }
  return path.resolve(__dirname, 'monthly-report', `${process.env.MONTH}_monthly-report.md`);
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

  const reportPath = resolveReportPath(args);

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
  // Bọc TOÀN BỘ vòng đời trình duyệt (splash, login, batch, report) trong 1
  // try/finally duy nhất — lỗi ở BẤT KỲ bước nào (kể cả login/fallback thủ
  // công, vốn từng nằm ngoài phạm vi try/finally) vẫn phải đóng được trình
  // duyệt, tránh treo tiến trình Node vô thời hạn với 1 browser production
  // còn mở/đăng nhập mồ côi.
  try {
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
      console.log('Đăng nhập xong.');
    } catch (err) {
      console.warn(`Đăng nhập tự động lỗi (${err.message}) — chuyển sang đăng nhập thủ công.`);
      await page.goto(CONSTANTS.loginUrl);
      await waitForEnter('\nVui lòng đăng nhập thủ công trên trình duyệt, sau đó nhấn Enter ở đây để tiếp tục...\n');
    }
    // Điều hướng tới Requirement list SAU khi đăng nhập xong (tự động hoặc
    // thủ công) — tách khỏi try/catch phía trên để lỗi điều hướng không bị
    // hiểu nhầm thành "đăng nhập lỗi".
    await page.goto(CONSTANTS.requirementListUrl);

    const results = await runBatch(page, parsed, {
      statusForAll: args.status,
    });
    printSummary(results);
    // Tạo báo cáo HTML, mở ngay trên CHÍNH page Playwright đang dùng, rồi
    // GIỮ trình duyệt mở VÔ THỜI HẠN để người dùng tự xem (không gọi
    // browser.close() ở đây) — bắt sự kiện 'disconnected' để tự thoát sạch
    // khi người dùng đóng trình duyệt (đồng bộ cơ chế với
    // auto-submit-phase-blueprint). Lỗi ở bước tạo/mở báo cáo không được
    // chặn việc treo chờ này — kết quả đã in đủ ở console rồi.
    try {
      const htmlReportPath = writeReportHtml(results, path.resolve(__dirname, 'reports', 'report-last.html'));
      await page.goto(`file:///${htmlReportPath.replace(/\\/g, '/')}`);
      console.log(`\nĐã mở báo cáo kết quả: ${htmlReportPath}`);
    } catch (err) {
      console.warn(`Không tạo/mở được báo cáo (${err.message}) — kết quả vẫn đúng ở phần tổng kết console phía trên.`);
    }
    browser.on('disconnected', () => process.exit(0));
    await new Promise(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\nLỗi không xử lý được:', err.message);
  process.exitCode = 1;
});
