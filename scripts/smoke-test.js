// Test nhanh từng bước nhỏ trong lúc điền dần src/selectors.js — KHÔNG đụng
// tới parser/data thật. Chạy: node scripts/smoke-test.js
//
// Hiện đang test tới: đăng nhập -> vào trang Requirement -> bấm "New Task".
// Sẽ tự dừng (báo NotImplementedError) ngay khi tới field JOB TYPE vì
// selector đó chưa điền — đó là điều BÌNH THƯỜNG ở bước này, không phải lỗi.
require('../src/loadEnv').loadEnv();
const readline = require('readline');
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials } = require('../src/config');

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
  const browser = await chromium.launch({ headless: false, slowMo: 150, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  try {
    console.log('1. Đăng nhập...');
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
    console.log('   OK — form New Task đã mở.');

    console.log('5. Điền form New Task (dữ liệu test)...');
    await blueprint.fillNewTaskForm(
      page,
      {
        type: 'regular',
        site: 'BK Vina',
        title: 'SMOKE TEST — xin bỏ qua',
        jobType: 'Modification',
        process: 'Reporting',
        iteration: 'Development',
        detail: 'Đây là dữ liệu test tự động, không phải task thật.',
      }
    );
    console.log('   OK — đã điền xong (chưa bấm Submit).');
    const successShot = (process.env.SMOKE_TEST_SCREENSHOT || 'debug-screenshot.png').replace('.png', '-success.png');
    await page.screenshot({ path: successShot, fullPage: true }).catch(() => {});
    console.log('   Screenshot:', successShot);
  } catch (err) {
    console.error(`\nDừng lại ở lỗi: ${err.message}`);
    console.error('URL hiện tại:', page.url());
    console.error('Title:', await page.title().catch(() => '(không lấy được)'));
    const debugPath = process.env.SMOKE_TEST_SCREENSHOT || 'debug-screenshot.png';
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    console.error('Đã lưu screenshot debug tại:', debugPath);

    // Tự động dump HTML của popup/window Webix đang hiển thị (nếu có) — hữu
    // ích để lấy selector cho bước TODO tiếp theo mà không cần script riêng.
    const fs = require('fs');
    const popupHtml = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.webix_window, .webix_popup'));
      const visible = nodes.filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return visible.map((n) => n.outerHTML).join('\n\n---NEXT-POPUP---\n\n');
    }).catch(() => '');
    if (popupHtml) {
      const htmlDebugPath = debugPath.replace(/\.png$/, '') + '.html';
      fs.writeFileSync(htmlDebugPath, popupHtml, 'utf-8');
      console.error('Đã lưu HTML popup đang mở tại:', htmlDebugPath, `(${popupHtml.length} ký tự)`);
    }
  }
  if (process.stdin.isTTY) {
    await waitForEnter('\nKiểm tra bằng mắt / mở F12 trên trình duyệt. Xong thì nhấn Enter để đóng...\n');
  } else {
    console.log('\n(Chạy không tương tác — đóng trình duyệt luôn, không chờ Enter.)');
  }
  await browser.close();
}

main();
