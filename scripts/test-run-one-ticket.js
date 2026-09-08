// Chạy đúng code production (blueprint.runBatch) nhưng CHỈ với 1 ticket duy
// nhất, rồi DỪNG LẠI (chờ Enter) trước khi làm gì tiếp — dùng để kiểm tra lại
// toàn bộ pipeline (tạo ticket -> Time Worked -> Effort Point -> 100%
// Register -> đóng tab) cho đúng 1 task thật trước khi chạy full batch.
// Chạy: node scripts/test-run-one-ticket.js
// Có thể chỉnh: TICKET_TITLE, REPORT_FILE (env var). Due Date dùng nguyên
// mặc định của popup, tự cộng ngày nếu gặp toast cảnh báo.
require('../src/loadEnv').loadEnv();
const readline = require('readline');
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials, CONSTANTS } = require('../src/config');
const { parseMonthlyReport } = require('../src/parser');
const { runBatch, printSummary } = require('../src/runner');

const TICKET_TITLE = process.env.TICKET_TITLE || 'Mobile App Inaccessibility (iOS & Android)';
const REPORT_FILE = process.env.REPORT_FILE || './monthly-report/202607_monthly-report.md';

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log(`Đang đọc ticket "${TICKET_TITLE}" từ ${REPORT_FILE}...`);
  const { tickets } = parseMonthlyReport(REPORT_FILE);
  const ticket = tickets.find((t) => t.title.includes(TICKET_TITLE));
  if (!ticket) {
    console.error(`Không tìm thấy ticket có title chứa "${TICKET_TITLE}".`);
    process.exit(1);
  }
  console.log('Sẽ chạy đúng 1 ticket này qua runner.js thật:', JSON.stringify({ site: ticket.site, title: ticket.title }));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: ['--start-maximized', '--disable-gpu', '--disable-dev-shm-usage', '--disable-features=CalculateNativeWinOcclusion'],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  try {
    console.log('\nĐang đăng nhập...');
    await blueprint.login(page, getCredentials());
    await page.goto(CONSTANTS.requirementListUrl);
    console.log('Đăng nhập xong.\n');

    const results = await runBatch(page, { tickets: [ticket], specialTicket: null }, {});
    printSummary(results);
  } catch (err) {
    console.error(`\nLỖI không xử lý được: ${err.message}`);
  }

  console.log('\n⏸  ĐÃ XONG TICKET NÀY (tab Detail đã đóng nếu thành công) — DỪNG LẠI Ở ĐÂY,');
  console.log('   CHƯA bấm "New Task" cho ticket kế tiếp. Tự kiểm tra kết quả trên trang');
  console.log('   Requirement đang mở, xong thì nhấn Enter để đóng trình duyệt.');
  if (process.stdin.isTTY) {
    await waitForEnter('\nNhấn Enter để đóng trình duyệt...\n');
  } else {
    console.log('(Không tương tác — giữ mở 60s rồi tự đóng.)');
    await page.waitForTimeout(60000).catch(() => {});
  }
  await browser.close();
}

main();
