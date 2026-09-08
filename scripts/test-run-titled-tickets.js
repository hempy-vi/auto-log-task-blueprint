// Chạy blueprint.runBatch() CHỈ với các ticket có title khớp TICKET_TITLE
// (dùng includes, không cần chính xác tuyệt đối) — hữu ích cho ticket đã bị
// tách thành nhiều bản (xem parser.splitOversizedTicket): idempotency check
// theo SỐ LƯỢNG sẽ tự skip đúng số bản đã có sẵn, chỉ tạo thêm phần còn thiếu.
// Due Date dùng nguyên mặc định của popup, tự cộng ngày nếu gặp toast cảnh báo.
// Chạy: TICKET_TITLE="..." REPORT_FILE=... node scripts/test-run-titled-tickets.js
require('../src/loadEnv').loadEnv();
const readline = require('readline');
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials, CONSTANTS } = require('../src/config');
const { parseMonthlyReport } = require('../src/parser');
const { runBatch, printSummary } = require('../src/runner');

const TICKET_TITLE = process.env.TICKET_TITLE;
const REPORT_FILE = process.env.REPORT_FILE || './monthly-report/202607_monthly-report.md';
if (!TICKET_TITLE) {
  console.error('Thiếu env TICKET_TITLE.');
  process.exit(1);
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

async function main() {
  const { tickets } = parseMonthlyReport(REPORT_FILE);
  const matched = tickets.filter((t) => t.title.includes(TICKET_TITLE));
  if (matched.length === 0) {
    console.error(`Không tìm thấy ticket nào có title chứa "${TICKET_TITLE}".`);
    process.exit(1);
  }
  console.log(`Tìm thấy ${matched.length} ticket khớp "${TICKET_TITLE}":`);
  matched.forEach((t, i) => console.log(`  ${i + 1}. Volume=${t.effortPoints[0]?.volume}, ${t.timeWorked.length} dòng Time Worked`));

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

    const results = await runBatch(page, { tickets: matched, specialTicket: null }, {});
    printSummary(results);
  } catch (err) {
    console.error(`\nLỖI không xử lý được: ${err.message}`);
  }

  if (process.stdin.isTTY) {
    await waitForEnter('\nNhấn Enter để đóng trình duyệt...\n');
  } else {
    console.log('(Không tương tác — giữ mở 30s rồi tự đóng.)');
    await page.waitForTimeout(30000).catch(() => {});
  }
  await browser.close();
}

main();
