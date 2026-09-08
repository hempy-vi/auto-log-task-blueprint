// Test tạo THẬT 1 task từ monthly-report.md.
// Chạy: node scripts/test-create-real-task.js
// Có thể chỉnh: TICKET_TITLE, REPORT_FILE (env var). Due Date dùng nguyên giá
// trị mặc định của popup, tự cộng ngày nếu gặp toast cảnh báo (xem submitNewTask).
require('../src/loadEnv').loadEnv();
const readline = require('readline');
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials, getConfirmationPic } = require('../src/config');
const { parseMonthlyReport } = require('../src/parser');
const SEL = require('../src/selectors');

const TICKET_TITLE = process.env.TICKET_TITLE || 'Remove Incorrect Bale ID';
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
  console.log('Ticket:', JSON.stringify(ticket, null, 2));
  console.log('Confirmation PIC:', getConfirmationPic(ticket.site));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 150,
    args: ['--start-maximized', '--disable-gpu', '--disable-dev-shm-usage', '--disable-features=CalculateNativeWinOcclusion'],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  try {
    console.log('\n1. Đăng nhập...');
    await blueprint.login(page, getCredentials());
    console.log('   OK.');

    console.log('2. Vào trang Requirement...');
    await blueprint.gotoRequirementList(page);
    console.log('   OK.');

    console.log('3. Chọn project "ERP Maintenance" > "Logistics"...');
    await blueprint.selectProjectAndCategory(page);
    console.log('   OK.');

    console.log('4. Bấm "New Task"...');
    await blueprint.openNewTaskForm(page);
    console.log('   OK.');

    console.log(`5. Điền form New Task với dữ liệu THẬT (${ticket.site} — ${ticket.title})...`);
    await blueprint.fillNewTaskForm(page, ticket);
    console.log('   OK — đã điền xong.');

    const detailText = await page.locator(SEL.newTaskForm.richTextEditor).innerText().catch(() => '(lỗi đọc)');
    console.log(`   Kiểm tra lại nội dung Detail đã gõ (${detailText.length} ký tự):`);
    console.log('   >>>', JSON.stringify(detailText.slice(0, 150)));
    if (!detailText || detailText.trim().length === 0) {
      throw new Error('Detail vẫn TRỐNG sau khi gõ — dừng lại, KHÔNG Submit.');
    }

    const beforeSubmitShot = process.env.SHOT_OUT || 'test-create-real-task-before-submit.png';
    await page.screenshot({ path: beforeSubmitShot, fullPage: true }).catch(() => {});
    console.log('   Screenshot trước khi Submit:', beforeSubmitShot);

    console.log('6. Bấm Submit...');
    await blueprint.submitNewTask(page);
    console.log('   OK — Submit thành công (không gặp toast cảnh báo Due Date).');
    await page.waitForTimeout(1500);
    const afterSubmitShot = beforeSubmitShot.replace(/\.png$/, '-after-submit.png');
    await page.screenshot({ path: afterSubmitShot, fullPage: true }).catch(() => {});
    console.log('   Screenshot ngay sau Submit:', afterSubmitShot);

    console.log('7. Double-click ticket vừa tạo để mở Detail (xác nhận đã tạo thành công)...');
    const detailPage = await blueprint.openCreatedTicketInNewTab(page, ticket.title);
    console.log('   URL ticket mới:', detailPage.url());
    console.log('   Title:', await detailPage.title().catch(() => '(không lấy được)'));
    const afterShot = beforeSubmitShot.replace(/\.png$/, '-created.png');
    await detailPage.screenshot({ path: afterShot, fullPage: true }).catch(() => {});
    console.log('   Screenshot ticket vừa tạo:', afterShot);

    console.log('8. Mở Job Detail, nhập Time Worked + Effort Point + chỉnh 100% Register...');
    await blueprint.openJobDetailModal(detailPage);
    await blueprint.addAllTimeWorked(detailPage, ticket.timeWorked);
    await blueprint.addAllEffortPoints(detailPage, ticket.effortPoints);
    await blueprint.setAllEffortPointToRegister(detailPage);
    console.log('   OK — hoàn tất toàn bộ ticket.');
  } catch (err) {
    console.error(`\nLỖI: ${err.message}`);
    const errShot = (process.env.SHOT_OUT || 'test-create-real-task-error.png');
    await page.screenshot({ path: errShot, fullPage: true }).catch(() => {});
    console.error('Screenshot lỗi:', errShot);
  }
  if (process.stdin.isTTY) {
    await waitForEnter('\nKiểm tra xong thì nhấn Enter để đóng trình duyệt...\n');
  } else {
    console.log('\n(Không tương tác — đóng trình duyệt luôn.)');
  }
  await browser.close();
}

main();
