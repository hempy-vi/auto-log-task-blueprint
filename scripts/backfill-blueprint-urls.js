// Backfill 1 lần: tìm lại URL Blueprint thật cho MỌI ticket của các tháng
// truyền vào (đã log lên Blueprint từ trước, chỉ chưa có field BLUEPRINT:
// trong .md vì tính năng này ra đời sau) — search theo title, ghi lại
// LOG:Y + BLUEPRINT:<url> vào .md và CSV cùng tháng. CHỈ ĐỌC trên Blueprint
// (search + double-click mở tab xem URL rồi đóng ngay) — không tạo/sửa gì.
require('../src/loadEnv').loadEnv();
const path = require('path');
const { chromium } = require('playwright');
const blueprint = require('../src/blueprintActions');
const { getCredentials } = require('../src/config');
const { parseMonthlyReport } = require('../src/parser');
const { updateMdLogStatus, updateCsvLogStatus } = require('../src/writeback');

const MONTHS = process.argv.slice(2);
if (MONTHS.length === 0) {
  console.error('Dùng: node scripts/backfill-blueprint-urls.js 202607 202608 202609');
  process.exit(1);
}

function resolveCsvPath(mdPath) {
  const m = /^(\d{6})_monthly-report\.md$/i.exec(path.basename(mdPath));
  return m ? path.join(path.dirname(mdPath), `${m[1]}_daily-report.csv`) : null;
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 30,
    args: ['--start-maximized', '--disable-gpu', '--disable-dev-shm-usage', '--disable-features=CalculateNativeWinOcclusion'],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  try {
    console.log('Đăng nhập...');
    await blueprint.login(page, getCredentials());
    await blueprint.gotoRequirementList(page);
    await blueprint.selectProjectAndCategory(page);
    await blueprint.selectAllStatuses(page);
    console.log('Đăng nhập xong, bắt đầu backfill.\n');

    for (const month of MONTHS) {
      const mdPath = path.resolve(__dirname, '..', 'work-reports', `${month}_monthly-report.md`);
      const csvPath = resolveCsvPath(mdPath);
      const { tickets } = parseMonthlyReport(mdPath);
      console.log(`=== ${month}: ${tickets.length} ticket ===`);

      // Gom theo title (1 lần search cho MỌI ticket con cùng title, do
      // splitOversizedTicket tạo ra nhiều bản cùng title) — tránh search
      // trùng lặp title giống hệt nhiều lần.
      const byTitle = new Map();
      for (const t of tickets) {
        if (!byTitle.has(t.title)) byTitle.set(t.title, []);
        byTitle.get(t.title).push(t);
      }

      const mdUpdates = [];
      let idx = 0;
      const totalTitles = byTitle.size;
      for (const [title, group] of byTitle.entries()) {
        idx += 1;
        const alreadyHaveAll = group.every((t) => t.blueprintUrl);
        if (alreadyHaveAll) {
          console.log(`[${idx}/${totalTitles}] "${title}" -> đã có URL sẵn, bỏ qua.`);
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const candidates = await blueprint.findExistingTicketUrls(page, title);
        if (candidates.length === 0) {
          console.warn(`[${idx}/${totalTitles}] "${title}" -> KHÔNG tìm thấy trên Blueprint (cần kiểm tra tay).`);
          continue;
        }

        let urls;
        if (candidates.length === group.length) {
          // ⚠️ KHÔNG gán theo thứ tự tìm thấy trên Blueprint (thứ tự đó
          // không đảm bảo khớp thứ tự ticket con trong .md) — đối chiếu theo
          // Effort Point Total THẬT của từng candidate với Total EP mong đợi
          // của từng ticket con (số riêng biệt mỗi phần do splitOversizedTicket
          // chia Volume không đều), chọn candidate khớp GẦN NHẤT rồi loại khỏi
          // danh sách còn lại (greedy, đủ dùng vì các phần luôn có Total EP
          // khác nhau trong thực tế).
          const remaining = [...candidates];
          urls = group.map((t) => {
            const expectedEp = t.effortPoints.reduce((acc, ep) => acc + (ep.total || 0), 0);
            let bestIdx = 0;
            let bestDiff = Infinity;
            remaining.forEach((c, i) => {
              const diff = Math.abs(c.effortPointTotal - expectedEp);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
              }
            });
            const [chosen] = remaining.splice(bestIdx, 1);
            if (bestDiff > 0) {
              console.warn(`  ⚠️ Khớp GẦN ĐÚNG (không khớp tuyệt đối): expected EP ${expectedEp}, chọn ${chosen.url} (EP thực tế ${chosen.effortPointTotal}, lệch ${bestDiff}) — nên kiểm tra tay.`);
            }
            return chosen.url;
          });
          console.log(`[${idx}/${totalTitles}] "${title}" -> ${urls.length} URL (đã đối chiếu theo Effort Point Total): ${urls.join(', ')}`);
        } else {
          console.warn(`[${idx}/${totalTitles}] "${title}" -> tìm thấy ${candidates.length} ticket nhưng .md có ${group.length} phần — SỐ LƯỢNG LỆCH, không tự gán (rủi ro sai), cần kiểm tra tay. Candidates: ${candidates.map((c) => `${c.url} (EP=${c.effortPointTotal})`).join(', ')}`);
          continue;
        }

        const rep = group[0];
        mdUpdates.push({ sourceLineStart: rep.sourceLineStart, sourceLineEnd: rep.sourceLineEnd, status: 'Y', blueprintUrls: urls });
        if (csvPath) {
          updateCsvLogStatus(csvPath, { jiraId: rep.jiraId, title: rep.title, site: rep.site }, 'Log thành công', urls[0]);
        }
      }

      if (mdUpdates.length > 0) updateMdLogStatus(mdPath, mdUpdates);
      console.log(`${month}: đã cập nhật ${mdUpdates.length}/${totalTitles} title.\n`);
    }
  } finally {
    await browser.close();
  }
})();
