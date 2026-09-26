// Bổ sung Time Worked + Effort Point + 100% Register cho các ticket ĐÃ TẠO
// SẴN (Submit thành công) nhưng lỗi giữa chừng ở bước Job Detail — khớp theo
// title với TICKET_URLS (JSON: {"title": "url", ...}) truyền qua env.
// Dùng đúng dữ liệu đã parse từ REPORT_FILE, không gõ tay số liệu.
require('../src/loadEnv').loadEnv();
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials } = require('../src/config');
const { parseMonthlyReport } = require('../src/parser');

const REPORT_FILE = process.env.REPORT_FILE || (process.env.MONTH && `./work-reports/${process.env.MONTH}_monthly-report.md`);
if (!REPORT_FILE) throw new Error('Thiếu REPORT_FILE hoặc MONTH trong .env.');
const TICKET_URLS = JSON.parse(process.env.TICKET_URLS || '{}');

async function main() {
  const { tickets } = parseMonthlyReport(REPORT_FILE);
  const entries = Object.entries(TICKET_URLS);
  if (entries.length === 0) {
    console.error('Thiếu env TICKET_URLS (JSON {"title": "url"}).');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,
    args: ['--start-maximized', '--disable-gpu', '--disable-dev-shm-usage', '--disable-features=CalculateNativeWinOcclusion'],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  try {
    console.log('Đăng nhập...');
    await blueprint.login(page, getCredentials());

    for (const [title, url] of entries) {
      const ticket = tickets.find((t) => t.title === title);
      if (!ticket) {
        console.error(`\n❌ Không tìm thấy ticket title="${title}" trong ${REPORT_FILE} — bỏ qua.`);
        continue;
      }
      console.log(`\n=== ${url} — "${title}" ===`);
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(800);

      console.log('  Mở Job Detail...');
      await blueprint.openJobDetailModal(page);
      console.log(`  Nhập Time Worked (${ticket.timeWorked.length} dòng)...`);
      await blueprint.addAllTimeWorked(page, ticket.timeWorked);
      console.log(`  Nhập Effort Point (${ticket.effortPoints.length} dòng)...`);
      await blueprint.addAllEffortPoints(page, ticket.effortPoints);
      console.log('  Chỉnh 100% Register...');
      await blueprint.setAllEffortPointToRegister(page);
      console.log('  OK.');
    }
    console.log('\n✅ Hoàn tất.');
  } catch (err) {
    console.error(`\nLỖI: ${err.message}`);
    await page.screenshot({ path: 'complete-tickets-error.png', fullPage: true }).catch(() => {});
  }

  await page.waitForTimeout(1500).catch(() => {});
  await browser.close().catch(() => {});
}

main();
