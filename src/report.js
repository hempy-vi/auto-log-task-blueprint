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
    max-width: 1040px;
    margin: 0 auto;
    padding: 48px 28px 64px;
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

module.exports = { writeReportHtml };
