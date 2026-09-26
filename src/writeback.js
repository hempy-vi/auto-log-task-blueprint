// Ghi ngược trạng thái "đã log hay chưa" vào file .md nguồn + file CSV
// daily-report cùng tháng, SAU khi chạy batch xong (index.js gọi). Mục đích:
// file .md/CSV KHÔNG BAO GIỜ bị xoá task đã log — mỗi task luôn còn nguyên,
// chỉ đổi field trạng thái, để Bảng Summary (Phần 1) không bao giờ lệch khỏi
// Phần 2.
const fs = require('fs');

// ---------- Ghi ngược vào file .md ----------

const ITERATION_RE = /^ITERATION:\s*(.+?)\s*$/;
const LOG_STATUS_RE = /^LOG:\s*(.+?)\s*$/;
const BLUEPRINT_URL_RE = /^BLUEPRINT:\s*(.+?)\s*$/;

/**
 * Cập nhật field "LOG: Y/N" + "BLUEPRINT: <url(s)>" ngay trong file .md, tại
 * ĐÚNG vị trí block đã ghi lại lúc parse (`ticket.sourceLineStart`/
 * `sourceLineEnd`, xem src/parser.js). Gộp chung 1 hàm (thay vì 2 hàm cập
 * nhật riêng LOG/BLUEPRINT) vì cả 2 field cùng chèn dòng mới ở CÙNG 1 khối —
 * chèn riêng từng field theo 2 lượt sẽ làm sourceLineStart/End tính từ lượt
 * TRƯỚC bị sai lệch ở lượt SAU. Block chưa có dòng nào thì tự chèn ngay sau
 * "ITERATION:" (LOG trước, BLUEPRINT sau LOG).
 *
 * @param {string} mdPath
 * @param {{sourceLineStart: number, sourceLineEnd: number, status: 'Y'|'N', blueprintUrls?: string[]}[]} updates
 */
function updateMdLogStatus(mdPath, updates) {
  if (!updates || updates.length === 0) return;
  const content = fs.readFileSync(mdPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  // ⚠️ BẮT BUỘC xử lý từ DƯỚI LÊN (sourceLineStart giảm dần) — chèn thêm dòng
  // mới (khi block cũ chưa có) sẽ làm LỆCH toàn bộ chỉ số dòng phía SAU nó;
  // xử lý từ dưới lên đảm bảo các block đứng TRƯỚC (chỉ số nhỏ hơn, chưa xử
  // lý) không bị ảnh hưởng bởi việc chèn dòng ở các block sau.
  const sorted = [...updates].sort((a, b) => b.sourceLineStart - a.sourceLineStart);

  for (const { sourceLineStart, sourceLineEnd, status, blueprintUrls } of sorted) {
    let logLineIdx = -1;
    let blueprintLineIdx = -1;
    let iterationLineIdx = -1;
    for (let i = sourceLineStart; i < sourceLineEnd && i < lines.length; i += 1) {
      if (LOG_STATUS_RE.test(lines[i]) && logLineIdx === -1) logLineIdx = i;
      if (BLUEPRINT_URL_RE.test(lines[i]) && blueprintLineIdx === -1) blueprintLineIdx = i;
      if (ITERATION_RE.test(lines[i]) && iterationLineIdx === -1) iterationLineIdx = i;
    }

    if (logLineIdx !== -1) {
      lines[logLineIdx] = `LOG: ${status}`;
    } else if (iterationLineIdx !== -1) {
      lines.splice(iterationLineIdx + 1, 0, `LOG: ${status}`);
      logLineIdx = iterationLineIdx + 1;
      if (blueprintLineIdx !== -1 && blueprintLineIdx > iterationLineIdx) blueprintLineIdx += 1;
    }
    // Không tìm thấy cả LOG lẫn ITERATION (block dị dạng) -> bỏ qua field LOG,
    // không đoán mò chèn sai vị trí; field BLUEPRINT (nếu có) vẫn xử lý riêng.

    if (blueprintUrls && blueprintUrls.length > 0) {
      const value = `BLUEPRINT: ${blueprintUrls.join(', ')}`;
      if (blueprintLineIdx !== -1) {
        lines[blueprintLineIdx] = value;
      } else if (logLineIdx !== -1) {
        lines.splice(logLineIdx + 1, 0, value);
      } else if (iterationLineIdx !== -1) {
        lines.splice(iterationLineIdx + 1, 0, value);
      }
    }
  }

  fs.writeFileSync(mdPath, lines.join('\n'), 'utf-8');
}

// ---------- Đọc/ghi CSV (hỗ trợ field nhiều dòng trong dấu ngoặc kép) ----------

/** Parse CSV thô (RFC4180-ish, hỗ trợ field chứa \n/,/\" khi được bọc "..."). */
function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // bỏ qua, xử lý xuống dòng ở nhánh '\n'
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvField(value) {
  const s = String(value == null ? '' : value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stringifyCsv(rows) {
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}

const LOG_STATUS_HEADER = 'Log Status';
const LOG_STATUS_NOT_YET = 'Chưa log';
const BLUEPRINT_URL_HEADER = 'Blueprint URL';

/** Đảm bảo CSV có cột `headerName`, tự chèn ngay sau cột `afterHeader` (hoặc
 * cuối file nếu không tìm thấy) kèm `defaultValue` cho mọi dòng cũ — dùng
 * chung cho cả "Log Status" và "Blueprint URL" để tự nâng cấp file CSV cũ. */
function ensureColumn(rows, headerName, afterHeader, defaultValue) {
  const header = rows[0];
  let idx = header.indexOf(headerName);
  if (idx === -1) {
    const afterIdx = header.indexOf(afterHeader);
    idx = afterIdx !== -1 ? afterIdx + 1 : header.length;
    header.splice(idx, 0, headerName);
    for (let i = 1; i < rows.length; i += 1) rows[i].splice(idx, 0, defaultValue);
  }
  return idx;
}

/**
 * Cập nhật cột "Log Status" + "Blueprint URL" (tự chèn cột nếu CSV cũ chưa
 * có) — khớp theo Jira ID (nếu ticket có) hoặc theo cặp Title+Related UI y
 * hệt (nếu không có Jira ID, đúng quy tắc gộp của skill /monthly-report). 1
 * ticket Blueprint có thể khớp NHIỀU dòng CSV (nhiều ngày làm cùng 1 việc) —
 * cập nhật hết.
 *
 * @param {string} csvPath
 * @param {{jiraId?: string|null, title: string, site: string}} matcher
 * @param {string} statusText vd "Log thành công" hoặc "Log lỗi: <thông báo>"
 * @param {string} [blueprintUrl] URL Blueprint thật (bỏ qua nếu không truyền — giữ nguyên giá trị cũ)
 * @returns {number} số dòng CSV đã cập nhật (0 nếu không tìm thấy dòng khớp)
 */
function updateCsvLogStatus(csvPath, matcher, statusText, blueprintUrl) {
  if (!fs.existsSync(csvPath)) return 0;
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) return 0;

  const header = rows[0];
  const logColIdx = ensureColumn(rows, LOG_STATUS_HEADER, 'Jira ID', LOG_STATUS_NOT_YET);
  const urlColIdx = ensureColumn(rows, BLUEPRINT_URL_HEADER, 'Detail', '');

  const jiraIdx = header.indexOf('Jira ID');
  const titleIdx = header.indexOf('Title');
  const siteIdx = header.indexOf('Related UI');

  let updated = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    while (row.length <= Math.max(logColIdx, urlColIdx)) row.push('');
    const matchByJira = matcher.jiraId && jiraIdx !== -1 && row[jiraIdx] === matcher.jiraId;
    const matchByTitleSite =
      !matcher.jiraId &&
      titleIdx !== -1 &&
      siteIdx !== -1 &&
      row[titleIdx] === matcher.title &&
      row[siteIdx] === matcher.site;
    if (matchByJira || matchByTitleSite) {
      row[logColIdx] = statusText;
      if (blueprintUrl) row[urlColIdx] = blueprintUrl;
      updated += 1;
    }
  }

  if (updated > 0) fs.writeFileSync(csvPath, stringifyCsv(rows), 'utf-8');
  return updated;
}

module.exports = {
  updateMdLogStatus,
  updateCsvLogStatus,
  parseCsv,
  stringifyCsv,
  LOG_STATUS_HEADER,
  LOG_STATUS_NOT_YET,
  BLUEPRINT_URL_HEADER,
};
