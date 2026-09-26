// Sinh trang báo cáo HTML sau khi chạy batch xong (WORKFLOW.md — bước cuối
// cùng của `node index.js`/`run.bat`). Layout đồng bộ với màn hình chào
// (assets/splash.html): dùng chung bảng màu + nền lưới blueprint.
const fs = require('fs');
const path = require('path');

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function renderRow(cells) {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

function renderSuccessRows(list) {
  return list
    .map((r) =>
      renderRow([
        escapeHtml(r.ticket && r.ticket.title),
        escapeHtml((r.ticket && r.ticket.site) || '-'),
        `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a>`,
      ])
    )
    .join('\n');
}

function renderSkippedRows(list) {
  return list
    .map((r) =>
      renderRow([
        escapeHtml(r.ticket && r.ticket.title),
        escapeHtml((r.ticket && r.ticket.site) || '-'),
        escapeHtml(r.reason),
      ])
    )
    .join('\n');
}

function renderFailedRows(list) {
  return list
    .map((r) =>
      renderRow([
        escapeHtml(r.ticket && r.ticket.title),
        escapeHtml((r.ticket && r.ticket.site) || '-'),
        escapeHtml(r.error),
        r.partialUrl
          ? `<a href="${escapeHtml(r.partialUrl)}" target="_blank" rel="noopener">${escapeHtml(r.partialUrl)}</a> (đã tạo, chưa hoàn tất Job Detail)`
          : '-',
      ])
    )
    .join('\n');
}

function renderSection(title, badgeClass, rows, headCols, emptyText) {
  const body = rows || `<tr><td colspan="${headCols.length}" class="empty">${emptyText}</td></tr>`;
  return `
      <section class="panel">
        <h2><span class="tag ${badgeClass}"></span>${title}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr>${headCols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>
              ${body}
            </tbody>
          </table>
        </div>
      </section>`;
}

/**
 * Ghi trang báo cáo HTML kết quả 1 lần chạy batch ra `outPath`.
 * @param {{success: object[], skipped: object[], failed: object[]}} results
 * @param {string} outPath đường dẫn tuyệt đối file .html sẽ ghi ra
 * @returns {string} chính `outPath` (để tiện log/mở trình duyệt ngay sau khi gọi)
 */
function writeReportHtml(results, outPath) {
  const success = results.success || [];
  const skipped = results.skipped || [];
  const failed = results.failed || [];
  const total = success.length + skipped.length + failed.length;
  const overallOk = failed.length === 0;
  const now = new Date();
  const timeStr = now.toLocaleString('vi-VN');

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Auto Log Task Blueprint — Báo cáo</title>
<style>
  :root {
    --ink: #eaf2ff;
    --sub: #9db4d9;
    --accent: #4fa6ff;
    --accent-2: #7c5cff;
    --ok: #34e28a;
    --warn: #ffc24f;
    --bad: #ff6767;
    --line: rgba(140, 180, 255, 0.16);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; min-height: 100%;
    background: radial-gradient(1200px 800px at 15% 10%, #132349 0%, transparent 60%),
                radial-gradient(1000px 700px at 85% 90%, #1a1440 0%, transparent 55%),
                linear-gradient(160deg, #060a16 0%, #0a1226 45%, #0b1730 100%);
    background-attachment: fixed;
    color: var(--ink);
    font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  }

  /* Lưới bản vẽ kỹ thuật (blueprint grid) làm nền — đồng bộ với splash.html */
  .grid {
    position: fixed; inset: 0;
    background-image:
      linear-gradient(var(--line) 1px, transparent 1px),
      linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 46px 46px;
    -webkit-mask-image: radial-gradient(1400px 900px at 50% 0%, black 40%, transparent 82%);
            mask-image: radial-gradient(1400px 900px at 50% 0%, black 40%, transparent 82%);
    opacity: 0.9;
    pointer-events: none;
  }

  .wrap {
    position: relative;
    max-width: 1400px;
    margin: 0 auto;
    padding: 48px 32px 64px;
  }

  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 16px 7px 10px;
    border-radius: 999px;
    background: rgba(79,166,255,0.12);
    border: 1px solid rgba(79,166,255,0.35);
    color: var(--accent);
    font-size: 12.5px; letter-spacing: 0.06em; text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 22px;
  }
  .badge .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: ${overallOk ? 'var(--ok)' : 'var(--bad)'};
    box-shadow: 0 0 0 3px ${overallOk ? 'rgba(52,226,138,0.18)' : 'rgba(255,103,103,0.2)'};
  }

  h1 {
    font-size: clamp(28px, 4vw, 38px);
    line-height: 1.18;
    font-weight: 750;
    letter-spacing: -0.01em;
    background: linear-gradient(95deg, #ffffff 0%, #cfe0ff 42%, var(--accent) 78%, var(--accent-2) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    margin-bottom: 10px;
  }

  .meta {
    font-size: 13.5px;
    color: var(--sub);
    margin-bottom: 34px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 36px;
  }
  .stat-card {
    position: relative;
    padding: 20px 20px 18px;
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(18,28,54,0.72), rgba(10,16,32,0.68));
    border: 1px solid rgba(150, 190, 255, 0.22);
    box-shadow: 0 20px 60px -24px rgba(0,0,0,0.6);
    backdrop-filter: blur(14px);
  }
  .stat-card .num { font-size: 32px; font-weight: 750; margin-bottom: 4px; }
  .stat-card .label { font-size: 12.5px; color: var(--sub); letter-spacing: 0.03em; text-transform: uppercase; }
  .stat-card.ok .num { color: var(--ok); }
  .stat-card.warn .num { color: var(--warn); }
  .stat-card.bad .num { color: var(--bad); }

  .panel {
    position: relative;
    padding: 24px 26px 20px;
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(18,28,54,0.6), rgba(10,16,32,0.56));
    border: 1px solid rgba(150, 190, 255, 0.18);
    box-shadow: 0 20px 60px -30px rgba(0,0,0,0.55);
    backdrop-filter: blur(12px);
    margin-bottom: 22px;
  }
  .panel h2 {
    display: flex; align-items: center; gap: 10px;
    font-size: 16.5px; font-weight: 650;
    color: var(--ink);
    margin-bottom: 16px;
  }
  .panel h2 .tag { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .tag.ok { background: var(--ok); box-shadow: 0 0 0 3px rgba(52,226,138,0.18); }
  .tag.warn { background: var(--warn); box-shadow: 0 0 0 3px rgba(255,194,79,0.18); }
  .tag.bad { background: var(--bad); box-shadow: 0 0 0 3px rgba(255,103,103,0.18); }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  thead th {
    text-align: left;
    font-size: 11.5px; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--sub); font-weight: 600;
    padding: 0 10px 10px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  tbody td {
    padding: 10px 10px;
    border-bottom: 1px solid rgba(140, 180, 255, 0.08);
    color: var(--ink);
    vertical-align: top;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody td.empty { color: var(--sub); font-style: italic; text-align: center; padding: 18px 10px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  footer {
    margin-top: 30px;
    font-size: 12px;
    color: #6f84ad;
    letter-spacing: 0.03em;
    text-align: center;
  }
  footer b { color: #9fb6e6; font-weight: 600; }

  @media (max-width: 640px) {
    .stats { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="wrap">
    <div class="badge">
      <span class="dot"></span>
      ${overallOk ? 'Batch hoàn tất' : 'Batch hoàn tất — có lỗi'}
    </div>
    <h1>Báo cáo chạy Auto Log Task Blueprint</h1>
    <div class="meta">Chạy lúc ${escapeHtml(timeStr)} — tổng ${total} ticket được xử lý.</div>

    <div class="stats">
      <div class="stat-card ok">
        <div class="num">${success.length}</div>
        <div class="label">Thành công</div>
      </div>
      <div class="stat-card warn">
        <div class="num">${skipped.length}</div>
        <div class="label">Bỏ qua</div>
      </div>
      <div class="stat-card bad">
        <div class="num">${failed.length}</div>
        <div class="label">Lỗi</div>
      </div>
    </div>

    ${renderSection(
      `Thành công (${success.length})`,
      'ok',
      success.length ? renderSuccessRows(success) : '',
      ['Title', 'Site', 'URL ticket'],
      'Không có ticket nào thành công.'
    )}

    ${renderSection(
      `Bỏ qua (${skipped.length})`,
      'warn',
      skipped.length ? renderSkippedRows(skipped) : '',
      ['Title', 'Site', 'Lý do bỏ qua'],
      'Không có ticket nào bị bỏ qua.'
    )}

    ${renderSection(
      `Lỗi (${failed.length})`,
      'bad',
      failed.length ? renderFailedRows(failed) : '',
      ['Title', 'Site', 'Lỗi', 'Ticket dở dang (nếu có)'],
      'Không có ticket nào bị lỗi.'
    )}

    <footer>Auto Log Task Blueprint — Copyright &copy; ${now.getFullYear()} by <b>Hempy</b></footer>
  </div>
</body>
</html>
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

function sumBy(list, key) {
  return (list || []).reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
}

// Ngày dùng để sort + hiện ở cột Date — lấy ngày làm việc GẦN NHẤT trong
// Time Worked (ticket gộp nhiều ngày thì lấy ngày cuối, phản ánh đúng lúc
// task được cập nhật/hoàn tất sau cùng). '' nếu ticket không có dòng nào.
function latestWorkDate(ticket) {
  const dates = (ticket.timeWorked || []).map((r) => r.date).filter(Boolean);
  return dates.length ? dates.sort().at(-1) : '';
}

function formatDateVi(isoDate) {
  if (!isoDate) return '-';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Ticket gộp nhiều ngày (Time Worked > 1 dòng, các dòng khác ngày nhau) hiện
// dạng khoảng "dd/mm – dd/mm" thay vì chỉ ngày cuối — tránh hiểu lầm là chỉ
// làm đúng 1 ngày khi thực tế đã merge nhiều ngày làm việc.
function formatDateRange(ticket) {
  const dates = [...new Set((ticket.timeWorked || []).map((r) => r.date).filter(Boolean))].sort();
  if (dates.length === 0) return '-';
  if (dates.length === 1) return formatDateVi(dates[0]);
  return `${formatDateVi(dates[0])} – ${formatDateVi(dates.at(-1))}`;
}

// Bảng Summary Tháng (Phần 1 của monthly-report.md) — tổng giờ/điểm THEO
// NGÀY, tính trực tiếp từ Time Worked của MỌI ticket (kể cả ticket đặc biệt)
// trong file .md, không phải số liệu tay chép lại — nên luôn khớp với danh
// sách ticket ở phần dưới, kể cả sau khi ticket đã được đánh dấu LOG:Y (parser
// không xoá ticket khỏi .md, chỉ đổi field, nên Time Worked vẫn còn nguyên).
function buildDailySummary(allTickets) {
  const byDate = new Map();
  for (const t of allTickets) {
    for (const row of t.timeWorked || []) {
      if (!row.date) continue;
      const cur = byDate.get(row.date) || { hours: 0, points: 0 };
      cur.hours += Number(row.hours) || 0;
      cur.points += Number(row.point) || 0;
      byDate.set(row.date, cur);
    }
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function renderSummaryTable(allTickets) {
  const days = buildDailySummary(allTickets);
  const totalHours = days.reduce((acc, [, v]) => acc + v.hours, 0);
  const totalPoints = days.reduce((acc, [, v]) => acc + v.points, 0);
  const rows = days
    .map(([date, v]) => {
      const status = v.hours >= 8 ? '<span class="log-badge log-yes">Đủ 8h</span>' : '<span class="log-badge log-no">Thiếu giờ</span>';
      return renderRow([escapeHtml(formatDateVi(date)), `${v.hours} hours`, `${Math.round(v.points)} EP`, status]);
    })
    .join('\n');
  return `<div class="table-wrap">
        <table>
          <thead><tr><th>Ngày làm việc</th><th>Tổng số giờ</th><th>Tổng điểm</th><th>Trạng thái</th></tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="4" class="empty">Không có dữ liệu Time Worked.</td></tr>`}
            <tr class="total-row"><td>Tổng cộng</td><td>${totalHours} hours</td><td>${Math.round(totalPoints)} EP</td><td>-</td></tr>
          </tbody>
        </table>
      </div>`;
}

function sortByDateAsc(entries) {
  return [...entries].sort((a, b) => latestWorkDate(a.ticket).localeCompare(latestWorkDate(b.ticket)));
}

function renderJiraCell(jiraId) {
  if (!jiraId) return '<span class="log-badge log-warn">⚠ Thiếu Jira</span>';
  const url = `https://pim.cyberlogitec.com/jira/browse/${jiraId}`;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(jiraId)}</a>`;
}

function renderBlueprintCell(t) {
  if (!t.blueprintUrl) return '-';
  return `<a href="${escapeHtml(t.blueprintUrl)}" target="_blank" rel="noopener">Xem ticket ↗</a>`;
}

function renderReviewRow(t, isSpecial) {
  const effortPointSum = sumBy(t.effortPoints, 'total');
  const timeWorkedSum = sumBy(t.timeWorked, 'hours');
  // Đã có URL Blueprint (ticket THẬT đã tồn tại) nhưng vẫn nằm ở bảng "Chưa
  // log" -> ticket "tạo dở" (Submit thành công nhưng lỗi giữa chừng trước
  // khi kịp nhập Time Worked/Effort Point, xem case PRQ289 2026-09-25) — tool
  // sẽ TỰ ĐỘNG hoàn tất nốt phần thiếu ở lần chạy tới (xem runner.js), không
  // tạo ticket mới trùng lặp.
  const partialBadge = !t.alreadyLogged && t.blueprintUrl
    ? '<span class="log-badge log-warn">🔧 Tạo dở — sẽ tự hoàn tất</span>'
    : '';
  return renderRow([
    escapeHtml(formatDateRange(t)),
    escapeHtml(t.title) + (partialBadge ? `<br/>${partialBadge}` : ''),
    escapeHtml(isSpecial ? '(đặc biệt)' : t.site || '-'),
    escapeHtml(t.jobType || '-'),
    renderJiraCell(t.jiraId),
    String(effortPointSum),
    String(timeWorkedSum),
    renderBlueprintCell(t),
  ]);
}

function renderReviewTable(entries, emptyText) {
  const rows = entries.map(({ ticket, isSpecial }) => renderReviewRow(ticket, isSpecial)).join('\n');
  const totalEp = entries.reduce((acc, { ticket }) => acc + sumBy(ticket.effortPoints, 'total'), 0);
  const totalHours = entries.reduce((acc, { ticket }) => acc + sumBy(ticket.timeWorked, 'hours'), 0);
  const totalRow = entries.length
    ? `<tr class="total-row"><td colspan="5">Tổng cộng (${entries.length} ticket)</td><td>${Math.round(totalEp * 100) / 100}</td><td>${Math.round(totalHours * 100) / 100}</td><td>-</td></tr>`
    : '';
  return `<div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Site</th><th>Job Type</th><th>Jira</th><th>Effort Point</th><th>Time Worked</th><th>Blueprint</th></tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="8" class="empty">${emptyText}</td></tr>`}
            ${totalRow}
          </tbody>
        </table>
      </div>`;
}

function monthMetaOf(parsed) {
  const tickets = parsed.tickets || [];
  const specialTickets = parsed.specialTickets || (parsed.specialTicket ? [parsed.specialTicket] : []);
  return { total: tickets.length + specialTickets.length, regular: tickets.length, special: specialTickets.length };
}

/**
 * Render phần nội dung (Summary + Chưa log + Đã log) của 1 tháng, bọc trong 1
 * `<div class="month-section" data-month="...">` — TẤT CẢ tháng đều được
 * render sẵn ra HTML tĩnh ngay từ đầu (không render lại bằng JS khi đổi
 * tháng), JS chỉ toggle `display` giữa các section theo tháng đang chọn ở
 * dropdown — đơn giản/an toàn hơn nhiều so với dựng lại bảng bằng JS.
 */
function renderMonthSection(month, parsed, isDefault) {
  const tickets = parsed.tickets || [];
  const specialTickets = parsed.specialTickets || (parsed.specialTicket ? [parsed.specialTicket] : []);
  const allTickets = [...tickets, ...specialTickets];

  const entries = [
    ...tickets.map((ticket) => ({ ticket, isSpecial: false })),
    ...specialTickets.map((ticket) => ({ ticket, isSpecial: true })),
  ];
  // Tách hẳn "Chưa log" / "Đã log" thành 2 bảng riêng thay vì trộn chung 1
  // bảng có cột badge — mục đích chính của trang là rà soát ticket SẮP log,
  // để "Chưa log" lẫn trong đống "Đã log" (thường đông hơn nhiều về cuối
  // tháng) thì mỗi lần mở phải dò tìm. "Đã log" gộp vào 1 panel có thể đóng
  // lại (collapsible), mặc định đóng để không rối mắt.
  const pending = sortByDateAsc(entries.filter((e) => !e.ticket.alreadyLogged));
  const logged = sortByDateAsc(entries.filter((e) => e.ticket.alreadyLogged));

  return `<div class="month-section" data-month="${month}"${isDefault ? '' : ' style="display:none;"'}>
    <div class="panel">
      <h2>📊 Bảng Summary Tháng (Working Time &amp; Total Point)</h2>
      ${renderSummaryTable(allTickets)}
    </div>

    <div class="panel">
      <h2>Chưa log (${pending.length})</h2>
      ${renderReviewTable(pending, 'Không có ticket nào cần log.')}
    </div>

    <details class="panel">
      <summary>Đã log trước đó (${logged.length}) <span class="sub">— bấm để xem lại</span></summary>
      ${renderReviewTable(logged, 'Chưa có ticket nào được log.')}
    </details>
  </div>`;
}

/**
 * Ghi trang XEM TRƯỚC danh sách ticket sẽ log lên Blueprint CHO MỌI THÁNG có
 * sẵn file .md (không cố định 1 tháng nữa) — kèm dropdown chọn Năm/Tháng và 2
 * nút Xác nhận/Huỷ, thay cho việc gõ Y/N ở console (cần thiết khi chạy qua
 * run.bat ẩn hoàn toàn cửa sổ cmd, xem run-hidden.vbs). `index.js` chờ quyết
 * định bằng `page.waitForFunction(() => window.__reviewDecision)` — giờ trả
 * về OBJECT `{action: 'confirm'|'cancel', month?: string}` thay vì string
 * đơn, để index.js biết ĐÚNG tháng người dùng chọn trước khi bấm Xác nhận.
 * @param {{month: string, parsed: object}[]} monthsData mọi tháng tìm thấy trong work-reports/
 * @param {string} outPath
 * @param {string} [defaultMonth] tháng mặc định hiện sẵn (mặc định: tháng gần nhất)
 * @returns {string} chính outPath
 */
function writeReviewHtml(monthsData, outPath, defaultMonth) {
  const sorted = [...monthsData].sort((a, b) => a.month.localeCompare(b.month));
  const chosenMonth =
    defaultMonth && sorted.some((m) => m.month === defaultMonth) ? defaultMonth : sorted.length ? sorted[sorted.length - 1].month : null;

  const monthMeta = {};
  sorted.forEach((m) => {
    monthMeta[m.month] = monthMetaOf(m.parsed);
  });
  const sections = sorted.map((m) => renderMonthSection(m.month, m.parsed, m.month === chosenMonth)).join('\n');
  const initialMeta = chosenMonth ? monthMeta[chosenMonth] : { total: 0, regular: 0, special: 0 };

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Auto Log Task Blueprint — Xem trước</title>
<style>
  :root {
    --ink: #eaf2ff;
    --sub: #9db4d9;
    --accent: #4fa6ff;
    --accent-2: #7c5cff;
    --ok: #34e28a;
    --warn: #ffc24f;
    --bad: #ff6767;
    --line: rgba(140, 180, 255, 0.16);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; min-height: 100%;
    background: radial-gradient(1200px 800px at 15% 10%, #132349 0%, transparent 60%),
                radial-gradient(1000px 700px at 85% 90%, #1a1440 0%, transparent 55%),
                linear-gradient(160deg, #060a16 0%, #0a1226 45%, #0b1730 100%);
    background-attachment: fixed;
    color: var(--ink);
    font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  }
  .grid {
    position: fixed; inset: 0;
    background-image:
      linear-gradient(var(--line) 1px, transparent 1px),
      linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 46px 46px;
    -webkit-mask-image: radial-gradient(1400px 900px at 50% 0%, black 40%, transparent 82%);
            mask-image: radial-gradient(1400px 900px at 50% 0%, black 40%, transparent 82%);
    opacity: 0.9;
    pointer-events: none;
  }
  .wrap { position: relative; max-width: 1400px; margin: 0 auto; padding: 48px 32px 64px; }
  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 16px 7px 10px; border-radius: 999px;
    background: rgba(79,166,255,0.12); border: 1px solid rgba(79,166,255,0.35);
    color: var(--accent); font-size: 12.5px; letter-spacing: 0.06em;
    text-transform: uppercase; font-weight: 600; margin-bottom: 22px;
  }
  .badge .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warn); box-shadow: 0 0 0 3px rgba(255,194,79,0.18); }
  h1 {
    font-size: clamp(28px, 4vw, 38px); line-height: 1.18; font-weight: 750; letter-spacing: -0.01em;
    background: linear-gradient(95deg, #ffffff 0%, #cfe0ff 42%, var(--accent) 78%, var(--accent-2) 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; margin-bottom: 10px;
  }
  .meta { font-size: 13.5px; color: var(--sub); margin-bottom: 30px; }
  .actions { display: flex; gap: 16px; margin-bottom: 34px; flex-wrap: wrap; }
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    font: inherit; font-weight: 700; font-size: 15px; cursor: pointer;
    padding: 16px 28px; min-width: 230px; border-radius: 14px; border: 1px solid transparent;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, opacity 0.15s ease;
  }
  button:hover { transform: translateY(-2px); }
  button:active { transform: translateY(0) scale(0.97); }
  button:disabled { cursor: default; opacity: 0.5; transform: none; }
  #btnConfirm {
    background: linear-gradient(135deg, #3cf0a0, #17b869);
    color: #04170d;
    box-shadow: 0 16px 32px -12px rgba(52,226,138,0.55), inset 0 1px 0 rgba(255,255,255,0.35);
  }
  #btnConfirm:hover:not(:disabled) { box-shadow: 0 20px 40px -10px rgba(52,226,138,0.65), inset 0 1px 0 rgba(255,255,255,0.4); }
  #btnCancel {
    background: linear-gradient(180deg, rgba(255,103,103,0.16), rgba(255,103,103,0.05));
    border: 1px solid rgba(255,103,103,0.4);
    color: #ffc2c2;
    box-shadow: 0 16px 32px -18px rgba(255,103,103,0.4);
  }
  #btnCancel:hover:not(:disabled) { background: linear-gradient(180deg, rgba(255,103,103,0.24), rgba(255,103,103,0.08)); border-color: rgba(255,103,103,0.65); }
  .panel {
    position: relative; padding: 24px 26px 20px; border-radius: 18px;
    background: linear-gradient(180deg, rgba(18,28,54,0.6), rgba(10,16,32,0.56));
    border: 1px solid rgba(150, 190, 255, 0.18); box-shadow: 0 20px 60px -30px rgba(0,0,0,0.55);
    backdrop-filter: blur(12px); margin-bottom: 22px;
  }
  .panel h2 { display: flex; align-items: center; gap: 10px; font-size: 16.5px; font-weight: 650; margin-bottom: 16px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  thead th {
    text-align: left; font-size: 11.5px; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--sub); font-weight: 600; padding: 0 10px 10px; border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  tbody td { padding: 10px 10px; border-bottom: 1px solid rgba(140, 180, 255, 0.08); color: var(--ink); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody td.empty { color: var(--sub); font-style: italic; text-align: center; padding: 18px 10px; }
  /* Cột Jira (5) và Blueprint (8) — chỉ chứa mã ngắn/link "Xem ticket ↗",
     không cần bó hẹp theo % chung của bảng, cho rộng hẳn ra để không bị
     xuống hàng giữa chừng. */
  td:nth-child(5), th:nth-child(5), td:nth-child(8), th:nth-child(8) { white-space: nowrap; width: 1%; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .log-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 650; white-space: nowrap; }
  .log-badge.log-yes { background: rgba(52,226,138,0.14); border: 1px solid rgba(52,226,138,0.4); color: #6fe8ac; }
  .log-badge.log-no { background: rgba(150,190,255,0.08); border: 1px solid rgba(150,190,255,0.22); color: var(--sub); }
  .log-badge.log-warn { background: rgba(255,194,79,0.14); border: 1px solid rgba(255,194,79,0.4); color: var(--warn); }
  tr.total-row td { font-weight: 700; color: var(--ink); border-top: 1px solid var(--line); border-bottom: none; }
  details.panel { padding: 0; }
  details.panel > summary {
    list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px;
    padding: 24px 26px 20px; font-size: 16.5px; font-weight: 650; color: var(--ink);
  }
  details.panel > summary::-webkit-details-marker { display: none; }
  details.panel > summary::before { content: '▸'; color: var(--sub); transition: transform 0.15s ease; }
  details.panel[open] > summary::before { transform: rotate(90deg); }
  details.panel > summary .sub { font-weight: 400; color: var(--sub); font-size: 13px; }
  details.panel > .table-wrap { padding: 0 26px 20px; }
  #statusMsg { margin-top: 18px; font-size: 13.5px; color: var(--sub); text-align: center; }
  footer { margin-top: 30px; font-size: 12px; color: #6f84ad; letter-spacing: 0.03em; text-align: center; }
  footer b { color: #9fb6e6; font-weight: 600; }
  .selector-row { display: flex; gap: 14px; flex-wrap: wrap; }
  .selector-row select {
    font: inherit; font-size: 14.5px; font-weight: 600; color: var(--ink); cursor: pointer;
    padding: 12px 16px; min-width: 160px; border-radius: 12px;
    background: rgba(18,28,54,0.72); border: 1px solid rgba(150, 190, 255, 0.3);
    appearance: none; -webkit-appearance: none;
    background-image: linear-gradient(45deg, transparent 50%, var(--sub) 50%), linear-gradient(135deg, var(--sub) 50%, transparent 50%);
    background-position: calc(100% - 18px) center, calc(100% - 13px) center;
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
  }
  .selector-row select:hover { border-color: rgba(150, 190, 255, 0.55); }
  .selector-row select:focus { outline: none; border-color: var(--accent); }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="wrap">
    <div class="badge"><span class="dot"></span> Cần xác nhận trước khi Log</div>
    <h1 id="pageTitle">Xem trước ${initialMeta.total} ticket sẽ log lên Blueprint</h1>
    <div class="meta" id="pageMeta">${initialMeta.regular} ticket thường + ${initialMeta.special} ticket đặc biệt — kiểm tra kỹ trước khi bấm Xác nhận, hành động này sẽ tạo ticket THẬT trên production.</div>

    <div class="panel">
      <h2>📅 Chọn năm / tháng</h2>
      <div class="selector-row">
        <select id="yearSelect"></select>
        <select id="monthSelect"></select>
      </div>
    </div>

    <div class="actions">
      <button id="btnConfirm"><span aria-hidden="true">✓</span> Xác nhận — bắt đầu Log</button>
      <button id="btnCancel"><span aria-hidden="true">✕</span> Huỷ, không log gì cả</button>
    </div>

    ${sections || '<div class="panel">Không tìm thấy file *_monthly-report.md nào trong work-reports/.</div>'}

    <div id="statusMsg"></div>
    <footer>Auto Log Task Blueprint — Copyright &copy; ${new Date().getFullYear()} by <b>Hempy</b></footer>
  </div>

  <script>
    window.__reviewDecision = null;
    var MONTH_META = ${JSON.stringify(monthMeta)};
    var MONTHS = ${JSON.stringify(sorted.map((m) => m.month))};
    var currentMonth = ${JSON.stringify(chosenMonth)};

    function monthLabel(mm) { return 'Tháng ' + mm.slice(4, 6) + '/' + mm.slice(0, 4); }

    function updateHeader() {
      var meta = MONTH_META[currentMonth] || { total: 0, regular: 0, special: 0 };
      document.getElementById('pageTitle').textContent = 'Xem trước ' + meta.total + ' ticket sẽ log lên Blueprint';
      document.getElementById('pageMeta').textContent = meta.regular + ' ticket thường + ' + meta.special + ' ticket đặc biệt — kiểm tra kỹ trước khi bấm Xác nhận, hành động này sẽ tạo ticket THẬT trên production.';
    }

    function showMonth(mm) {
      currentMonth = mm;
      document.querySelectorAll('.month-section').forEach(function (el) {
        el.style.display = el.getAttribute('data-month') === mm ? '' : 'none';
      });
      updateHeader();
    }

    function populateYearSelect() {
      var years = [];
      MONTHS.forEach(function (mm) {
        var y = mm.slice(0, 4);
        if (years.indexOf(y) === -1) years.push(y);
      });
      years.sort().reverse();
      var sel = document.getElementById('yearSelect');
      sel.innerHTML = '';
      years.forEach(function (y) {
        var opt = document.createElement('option');
        opt.value = y;
        opt.textContent = 'Năm ' + y;
        sel.appendChild(opt);
      });
    }

    function populateMonthSelect() {
      var year = document.getElementById('yearSelect').value;
      var sel = document.getElementById('monthSelect');
      sel.innerHTML = '';
      MONTHS.filter(function (mm) { return mm.slice(0, 4) === year; })
        .sort()
        .reverse()
        .forEach(function (mm) {
          var opt = document.createElement('option');
          opt.value = mm;
          opt.textContent = monthLabel(mm);
          sel.appendChild(opt);
        });
    }

    if (currentMonth) {
      populateYearSelect();
      document.getElementById('yearSelect').value = currentMonth.slice(0, 4);
      populateMonthSelect();
      document.getElementById('monthSelect').value = currentMonth;

      document.getElementById('yearSelect').addEventListener('change', function () {
        populateMonthSelect();
        document.getElementById('monthSelect').dispatchEvent(new Event('change'));
      });
      document.getElementById('monthSelect').addEventListener('change', function () {
        showMonth(document.getElementById('monthSelect').value);
      });
    } else {
      document.getElementById('btnConfirm').disabled = true;
    }

    function lockButtons() {
      document.getElementById('btnConfirm').disabled = true;
      document.getElementById('btnCancel').disabled = true;
    }
    document.getElementById('btnConfirm').addEventListener('click', function () {
      window.__reviewDecision = { action: 'confirm', month: currentMonth };
      lockButtons();
      document.getElementById('btnConfirm').textContent = 'Đang xử lý...';
      document.getElementById('statusMsg').textContent = 'Đã xác nhận (' + monthLabel(currentMonth) + ') — cửa sổ này sẽ tự chuyển tiếp trong giây lát...';
    });
    document.getElementById('btnCancel').addEventListener('click', function () {
      window.__reviewDecision = { action: 'cancel' };
      lockButtons();
      document.getElementById('statusMsg').textContent = 'Đã huỷ — không có ticket nào được log. Có thể đóng cửa sổ này.';
    });
  </script>
</body>
</html>
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

/**
 * Ghi trang báo lỗi khi đọc/parse file .md thất bại TRƯỚC KHI kịp mở trang
 * xem trước — bắt buộc phải có trang này vì khi chạy ẩn qua run.bat/
 * run-hidden.vbs không còn console nào để hiện lỗi, nếu không mở trình duyệt
 * ở bước này, người dùng bấm run.bat sẽ thấy "không có phản ứng gì" dù thực
 * chất tiến trình đã chạy xong và ghi lỗi vào logs/run-last.log.
 * @param {string} message nội dung lỗi (err.message)
 * @param {string} outPath
 * @returns {string} chính outPath
 */
function writeErrorHtml(message, outPath) {
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Auto Log Task Blueprint — Lỗi</title>
<style>
  :root { --ink: #eaf2ff; --sub: #9db4d9; --bad: #ff6767; --line: rgba(140, 180, 255, 0.16); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; min-height: 100%;
    background: radial-gradient(1200px 800px at 15% 10%, #132349 0%, transparent 60%),
                radial-gradient(1000px 700px at 85% 90%, #1a1440 0%, transparent 55%),
                linear-gradient(160deg, #060a16 0%, #0a1226 45%, #0b1730 100%);
    background-attachment: fixed;
    color: var(--ink);
    font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  }
  .wrap { position: relative; max-width: 760px; margin: 0 auto; padding: 64px 28px; }
  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 16px 7px 10px; border-radius: 999px;
    background: rgba(255,103,103,0.12); border: 1px solid rgba(255,103,103,0.4);
    color: var(--bad); font-size: 12.5px; letter-spacing: 0.06em;
    text-transform: uppercase; font-weight: 600; margin-bottom: 22px;
  }
  .badge .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bad); box-shadow: 0 0 0 3px rgba(255,103,103,0.2); }
  h1 { font-size: clamp(24px, 4vw, 32px); font-weight: 750; margin-bottom: 18px; color: #ffd6d6; }
  .panel {
    padding: 22px 24px; border-radius: 16px;
    background: linear-gradient(180deg, rgba(18,28,54,0.6), rgba(10,16,32,0.56));
    border: 1px solid rgba(255,103,103,0.28);
    font-size: 14.5px; line-height: 1.6; color: var(--ink);
    white-space: pre-wrap; word-break: break-word;
  }
  .hint { margin-top: 20px; font-size: 13px; color: var(--sub); }
  footer { margin-top: 30px; font-size: 12px; color: #6f84ad; text-align: center; }
  footer b { color: #9fb6e6; font-weight: 600; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="badge"><span class="dot"></span> Không đọc/parse được file báo cáo</div>
    <h1>Không thể mở trang xem trước</h1>
    <div class="panel">${escapeHtml(message)}</div>
    <div class="hint">Sửa lại file/biến MONTH rồi chạy lại run.bat. Đóng cửa sổ này khi đã xem xong.</div>
    <footer>Auto Log Task Blueprint — Copyright &copy; ${new Date().getFullYear()} by <b>Hempy</b></footer>
  </div>
</body>
</html>
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

module.exports = { writeReportHtml, writeReviewHtml, writeErrorHtml };
