#!/usr/bin/env node
// CLI entry point. Xem README.md để biết cách dùng.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
require('./src/loadEnv').loadEnv();
const { parseMonthlyReport } = require('./src/parser');
const { runBatch, printSummary } = require('./src/runner');
const { writeReportHtml, writeReviewHtml, writeErrorHtml } = require('./src/report');
const { updateMdLogStatus, updateCsvLogStatus } = require('./src/writeback');
const { CONSTANTS, getCredentials } = require('./src/config');
const blueprint = require('./src/blueprintActions');

// yyyymm_monthly-report.md -> đường dẫn file CSV daily-report cùng tháng,
// cùng thư mục. Trả về null nếu tên file không theo đúng quy ước
// "<yyyymm>_monthly-report.md" — không đoán mò, bỏ qua ghi CSV trong trường
// hợp đó.
function resolveCsvPath(mdPath) {
  const m = /^(\d{6})_monthly-report\.md$/i.exec(path.basename(mdPath));
  if (!m) return null;
  return path.join(path.dirname(mdPath), `${m[1]}_daily-report.csv`);
}

/**
 * Sau khi chạy batch xong: ghi ngược trạng thái log vào đúng block trong .md
 * nguồn + đúng (các) dòng CSV daily-report cùng tháng — không bao giờ xoá task
 * khỏi 2 file này, chỉ đổi field trạng thái, để Bảng Summary (Phần 1) luôn
 * khớp Phần 2 và biết được task nào đã log/chưa. Gộp theo `blockIndex` vì 1
 * ticket bị `splitOversizedTicket()` tách thành nhiều phần vẫn chỉ là 1 dòng
 * "LOG:" duy nhất trong .md — chỉ đánh dấu "Y" khi TẤT CẢ các phần đều thành
 * công (hoặc đã có sẵn trên Blueprint từ trước, xem `countsAsDone`).
 */
function writeBackLogStatus(mdPath, allAttempted, results) {
  try {
    const csvPath = resolveCsvPath(mdPath);
    const successKeys = new Set(results.success.map((r) => r.ticket));
    const skippedByTicket = new Map(results.skipped.map((r) => [r.ticket, r.reason]));
    const failedByTicket = new Map(results.failed.map((r) => [r.ticket, r.error]));
    // URL thật lấy được TRONG lần chạy này — từ ticket tạo mới/hoàn tất thành
    // công (results.success[].url) HOẶC ticket tạo dở bị lỗi giữa chừng
    // (results.failed[].partialUrl, xem runner.js) — cả 2 đều là URL CÓ THẬT
    // trên Blueprint, đáng lưu lại dù ticket chưa xong, để lần chạy sau đi
    // thẳng vào URL này thay vì tạo trùng.
    const urlByTicket = new Map();
    results.success.forEach((r) => { if (r.url) urlByTicket.set(r.ticket, r.url); });
    results.failed.forEach((r) => { if (r.partialUrl) urlByTicket.set(r.ticket, r.partialUrl); });

    const byBlock = new Map(); // blockIndex -> { tickets: [...], allDone: bool, firstError: string|null }
    for (const ticket of allAttempted) {
      const key = ticket.blockIndex;
      if (!byBlock.has(key)) byBlock.set(key, { tickets: [], allDone: true, firstError: null });
      const group = byBlock.get(key);
      group.tickets.push(ticket);
      const reason = skippedByTicket.get(ticket);
      // "Đã tồn tại" = Blueprint tự báo đã có sẵn (idempotency) -> coi như
      // ĐÃ log thật, không phải lỗi. Mọi lý do skip khác (thiếu site...) và
      // mọi ticket trong results.failed đều tính là CHƯA xong.
      const countsAsDone = successKeys.has(ticket) || (reason && /đã tồn tại/i.test(reason));
      if (!countsAsDone) {
        group.allDone = false;
        if (!group.firstError) group.firstError = failedByTicket.get(ticket) || reason || 'Không rõ lý do';
      }
    }

    const mdUpdates = [];
    for (const group of byBlock.values()) {
      const rep = group.tickets[0]; // đại diện — mọi phần cùng blockIndex có cùng sourceLineStart/End/title/site/jiraId
      // Giữ URL cũ đã biết (ticket.blueprintUrl, đọc từ .md lúc parse) nếu
      // lần chạy này không phát sinh URL mới cho đúng phần đó (vd phần đó đã
      // đầy đủ từ trước, results.success vẫn có url nên vẫn lấy đúng — chỉ
      // fallback về url cũ khi ticket hoàn toàn không chạm tới, vd bị skip vì
      // lý do khác).
      const blueprintUrls = group.tickets.map((t) => urlByTicket.get(t) || t.blueprintUrl).filter(Boolean);
      mdUpdates.push({
        sourceLineStart: rep.sourceLineStart,
        sourceLineEnd: rep.sourceLineEnd,
        status: group.allDone ? 'Y' : 'N',
        blueprintUrls: blueprintUrls.length ? blueprintUrls : undefined,
      });
      if (csvPath) {
        const statusText = group.allDone ? 'Log thành công' : `Log lỗi: ${group.firstError}`;
        updateCsvLogStatus(csvPath, { jiraId: rep.jiraId, title: rep.title, site: rep.site }, statusText, blueprintUrls[0]);
      }
    }
    if (mdUpdates.length > 0) updateMdLogStatus(mdPath, mdUpdates);
  } catch (err) {
    console.warn(`Không ghi ngược được trạng thái log vào .md/CSV (${err.message}) — kết quả thật trên Blueprint không bị ảnh hưởng, chỉ 2 file theo dõi này có thể chưa cập nhật.`);
  }
}

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
// (work-reports/<MONTH>_monthly-report.md) — thiếu cả 2 phải báo lỗi rõ
// ràng, không được âm thầm suy đoán ra 1 tháng cũ. Dùng cho --dry-run (chỉ
// đọc/parse 1 file cụ thể, không qua trang chọn năm/tháng).
function resolveReportPath(args) {
  if (args.report) return path.resolve(args.report);
  if (!process.env.MONTH) {
    throw new Error(
      'Thiếu --report và không có MONTH trong .env — truyền đường dẫn file (--report work-reports\\202609_monthly-report.md), hoặc đặt MONTH=202609 (ví dụ) trong .env rồi chạy lại.'
    );
  }
  return path.resolve(__dirname, 'work-reports', `${process.env.MONTH}_monthly-report.md`);
}

// Quét TOÀN BỘ work-reports/*_monthly-report.md để trang xem trước cho chọn
// năm/tháng (không giới hạn đúng 1 tháng cố định nữa) — sắp XẤU tăng dần
// theo YYYYMM (chuỗi 6 số so sánh được trực tiếp, không cần parse ngày).
function scanAvailableMonths() {
  const dir = path.resolve(__dirname, 'work-reports');
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    return [];
  }
  return files
    .map((f) => /^(\d{6})_monthly-report\.md$/i.exec(f))
    .filter(Boolean)
    .map((m) => ({ month: m[1], mdPath: path.join(dir, m[0]) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Chờ user bấm nút Xác nhận/Huỷ ở trang review.html (window.__reviewDecision
 * do report.js gán) — thay cho việc gõ Y/N ở console, cần thiết khi chạy qua
 * run.bat ẩn hoàn toàn cửa sổ cmd (xem run-hidden.vbs). Không giới hạn
 * timeout vì đây là quyết định của người, có thể mất bao lâu cũng được.
 * Nếu người dùng đóng thẳng cửa sổ trình duyệt giữa chừng (không bấm nút
 * nào), coi như huỷ thay vì để lỗi "target closed" văng ra ngoài.
 */
async function waitForReviewDecision(page) {
  try {
    const handle = await page.waitForFunction(() => window.__reviewDecision, null, { timeout: 0 });
    return await handle.jsonValue();
  } catch (err) {
    return { action: 'cancel' };
  }
}

/**
 * Chờ tới khi NGƯỜI DÙNG tự đóng trình duyệt rồi mới thoát process — dùng ở
 * cuối cùng (sau khi hiện trang huỷ/report) để trình duyệt còn đó cho người
 * xem, đồng thời cmd (đang ẩn qua run-hidden.vbs) chỉ đóng theo SAU khi
 * trình duyệt đã đóng. ⚠️ PHẢI kiểm tra `isConnected()` trước khi gắn
 * listener — nếu trình duyệt đã đóng NGAY TRƯỚC lúc gọi hàm này (vd lỗi ở
 * bước waitForReviewDecision làm page/browser chết trước), sự kiện
 * 'disconnected' đã bắn ra RỒI và sẽ không bao giờ bắn lại, gắn listener sau
 * đó sẽ treo vĩnh viễn không bao giờ resolve.
 */
function waitForBrowserCloseAndExit(browser) {
  return new Promise(() => {
    if (!browser.isConnected()) {
      process.exit(0);
      return;
    }
    browser.on('disconnected', () => process.exit(0));
  });
}

/**
 * Ép cửa sổ Chrome hiện ra thật sự (ShowWindow + SetForegroundWindow) — cần
 * thiết vì đã xác nhận qua WinAPI thật (2026-09-26, run.bat qua đúng luồng
 * run-hidden.vbs): cửa sổ Chrome đôi khi bị tạo ra ở trạng thái ẩn
 * (IsWindowVisible=False) dù tiến trình chạy bình thường, kích thước cửa sổ
 * đúng — không tái hiện được ổn định 100% (có lần hiện đúng, có lần ẩn), có
 * vẻ là race condition trong cách Windows/Chrome xử lý trạng thái show-window
 * kế thừa từ tiến trình cha bị ẩn (run-hidden.vbs). Chủ động ép hiện ngay sau
 * khi mở trình duyệt để KHÔNG còn phụ thuộc vào hành vi này nữa — tìm
 * chrome.exe là con TRỰC TIẾP của tiến trình Node hiện tại (process.pid,
 * không dùng browser.process() vì Playwright bản đang dùng không có API đó).
 * Bỏ qua lỗi (vd không phải Windows) — không được chặn batch chỉ vì bước
 * cosmetic này.
 */
function forceShowBrowserWindow() {
  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ALTB_Win {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
}
"@
$chromePid = (Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid} and Name='chrome.exe'" -ErrorAction SilentlyContinue | Select-Object -First 1).ProcessId
if ($chromePid) {
  [ALTB_Win]::EnumWindows({ param($h, $l)
    $winPid = 0
    [ALTB_Win]::GetWindowThreadProcessId($h, [ref]$winPid) | Out-Null
    if ($winPid -eq $chromePid -and -not [ALTB_Win]::IsWindowVisible($h)) {
      [ALTB_Win]::ShowWindow($h, 5) | Out-Null
      [ALTB_Win]::SetForegroundWindow($h) | Out-Null
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
}
`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true, stdio: 'ignore' });
  } catch (err) {
    console.warn(`Không ép hiện được cửa sổ trình duyệt (${err.message}) — nếu không thấy trình duyệt, kiểm tra Task Manager.`);
  }
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

  // --dry-run: giữ hành vi CŨ (1 file cụ thể qua --report/MONTH) — dùng để
  // debug nhanh 1 tháng, không cần bung cả trang chọn năm/tháng.
  if (args.dryRun) {
    let parsed, parseError;
    try {
      const reportPath = resolveReportPath(args);
      console.log(`Đang đọc file: ${reportPath}`);
      parsed = parseMonthlyReport(reportPath);
    } catch (err) {
      parseError = err;
    }
    if (parseError) {
      console.error(`\nLỗi: ${parseError.message}`);
      process.exitCode = 1;
      return;
    }
    printParsedSummary(parsed);
    console.log('\n(--dry-run) Dừng tại đây, không mở trình duyệt.');
    return;
  }

  // Quét + parse TOÀN BỘ tháng có sẵn trong work-reports/ (không cố định 1
  // tháng nữa — trang xem trước cho chọn năm/tháng, xem report.js). Lỗi
  // parse ở 1 tháng chỉ bỏ qua tháng đó (kèm cảnh báo), không làm hỏng các
  // tháng khác — chỉ khi KHÔNG tháng nào parse được mới coi là lỗi (hiện
  // trang lỗi thay vì "bấm chẳng có gì xảy ra", xem writeErrorHtml).
  const available = scanAvailableMonths();
  const monthsData = [];
  for (const { month, mdPath } of available) {
    try {
      monthsData.push({ month, mdPath, parsed: parseMonthlyReport(mdPath) });
    } catch (err) {
      console.warn(`Bỏ qua tháng ${month} (lỗi parse: ${err.message}).`);
    }
  }
  monthsData.forEach((m) => printParsedSummary(m.parsed));
  const scanError =
    monthsData.length === 0
      ? new Error(
          available.length === 0
            ? 'Không tìm thấy file nào dạng work-reports/<yyyymm>_monthly-report.md.'
            : `Tìm thấy ${available.length} file nhưng KHÔNG file nào parse được — xem log phía trên.`
        )
      : null;
  const defaultMonth = process.env.MONTH && monthsData.some((m) => m.month === process.env.MONTH) ? process.env.MONTH : undefined;

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
    if (process.platform === 'win32') forceShowBrowserWindow();

    if (scanError) {
      console.error(`\nLỗi đọc/parse file báo cáo: ${scanError.message}`);
      const errPath = writeErrorHtml(scanError.message, path.resolve(__dirname, 'reports', 'review-last.html'));
      await page.goto(`file:///${errPath.replace(/\\/g, '/')}`);
      await waitForBrowserCloseAndExit(browser);
      return; // không bao giờ tới đây thật sự (hàm trên không resolve), chỉ để rõ ý cho người đọc
    }

    // Màn hình chào (assets/splash.html) — thuần cosmetic, không ảnh hưởng
    // logic batch. Lỗi ở bước này (vd thiếu file) không được làm dừng cả batch.
    try {
      const splashPath = path.resolve(__dirname, 'assets', 'splash.html');
      await page.goto(`file:///${splashPath.replace(/\\/g, '/')}`);
      await page.waitForTimeout(10000); // khớp với thời lượng thanh loading 10s trong splash.html
    } catch (err) {
      console.warn(`Không hiện được màn hình chào (${err.message}) — bỏ qua, tiếp tục đăng nhập.`);
    }

    // ⚠️ Đăng nhập TRƯỚC khi hiện trang xem trước (không phải sau như thiết
    // kế cũ) — trang xem trước có link Blueprint thật cho từng ticket, bấm
    // vào trước khi đăng nhập chỉ ra màn hình login Keycloak trơ trọi (đã
    // xác nhận qua ảnh chụp thật 2026-09-26), vô nghĩa với người dùng.
    try {
      console.log('Đang đăng nhập tự động...');
      await blueprint.login(page, getCredentials());
      console.log('Đăng nhập xong.');
    } catch (err) {
      // ⚠️ KHÔNG dùng readline/console để chờ người dùng nữa (không có ý
      // nghĩa gì khi cmd đang ẩn hoàn toàn, stdin không gắn với ai cả) — chờ
      // THẲNG cho tới khi trình duyệt tự điều hướng về đúng domain Blueprint
      // (xảy ra tự nhiên ngay khi đăng nhập tay xong, do OIDC/Keycloak tự
      // redirect ngược lại app), không cần tín hiệu nào khác từ người dùng.
      console.warn(`Đăng nhập tự động lỗi (${err.message}) — chuyển sang đăng nhập thủ công, chờ tới khi đăng nhập xong.`);
      await page.goto(CONSTANTS.loginUrl);
      await page.waitForURL((url) => url.hostname === new URL(CONSTANTS.requirementListUrl).hostname, { timeout: 0 });
    }

    // Bước XEM TRƯỚC + XÁC NHẬN ngay trong trình duyệt — thay hẳn cho việc
    // in danh sách + gõ Y/N ở console (không còn console để gõ khi chạy ẩn
    // qua run.bat/run-hidden.vbs). Chờ vô thời hạn cho tới khi người dùng
    // bấm 1 trong 2 nút ở review-last.html.
    if (process.platform === 'win32') forceShowBrowserWindow(); // ép hiện lại lần nữa cho chắc, phòng bị ẩn lại giữa chừng
    const reviewPath = writeReviewHtml(
      monthsData.map(({ month, parsed }) => ({ month, parsed })),
      path.resolve(__dirname, 'reports', 'review-last.html'),
      defaultMonth
    );
    await page.goto(`file:///${reviewPath.replace(/\\/g, '/')}`);
    const decision = await waitForReviewDecision(page);
    if (decision.action !== 'confirm') {
      console.log('\nĐã huỷ ở trang xem trước (không bấm Xác nhận) — KHÔNG log ticket nào.');
      // Tự đóng browser luôn thay vì chờ người dùng đóng tay — bấm "Huỷ" mà
      // trình duyệt vẫn đứng yên khiến người dùng tưởng nút không có tác
      // dụng gì. Đợi 1.2s để kịp thấy thông báo "Đã huỷ..." trên trang trước
      // khi cửa sổ biến mất.
      await page.waitForTimeout(1200).catch(() => {});
      return;
    }

    const chosen = monthsData.find((m) => m.month === decision.month);
    if (!chosen) {
      throw new Error(`Không tìm thấy dữ liệu đã parse cho tháng "${decision.month}" (bug hoặc file bị xoá giữa chừng).`);
    }
    const reportPath = chosen.mdPath;
    const parsed = chosen.parsed;
    console.log(`\nĐã chọn tháng ${decision.month} (${reportPath}).`);

    // Điều hướng tới Requirement list SAU khi đăng nhập xong (tự động hoặc
    // thủ công) — tách khỏi try/catch phía trên để lỗi điều hướng không bị
    // hiểu nhầm thành "đăng nhập lỗi".
    await page.goto(CONSTANTS.requirementListUrl);

    // ⚠️ Ticket đã đánh dấu "LOG: Y" từ trước (field đọc ở src/parser.js) —
    // KHÔNG đẩy vào runBatch nữa (đỡ tốn 1 lượt search trùng vô ích trên
    // Blueprint), nhưng VẪN hiện đầy đủ ở trang xem trước lẫn báo cáo cuối
    // (dồn vào results.skipped) — đúng yêu cầu "liệt kê đầy đủ task, phân
    // loại được task nào đã log". specialTickets không áp dụng field này.
    const toRun = parsed.tickets.filter((t) => !t.alreadyLogged);
    const preLogged = parsed.tickets.filter((t) => t.alreadyLogged);
    const results = await runBatch(page, { ...parsed, tickets: toRun }, {
      statusForAll: args.status,
    });
    preLogged.forEach((ticket) => {
      results.skipped.push({ ticket, reason: 'Đã log từ trước (theo file .md, LOG: Y)' });
    });
    printSummary(results);
    // Ghi ngược trạng thái Y/N vào .md + CSV cùng tháng (không xoá task nào)
    // — CHỈ áp dụng cho các ticket vừa thật sự chạy qua runBatch (toRun);
    // preLogged giữ nguyên trạng thái Y sẵn có, không cần ghi lại.
    writeBackLogStatus(reportPath, toRun, results);
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
    await waitForBrowserCloseAndExit(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\nLỗi không xử lý được:', err.message);
  process.exitCode = 1;
});
