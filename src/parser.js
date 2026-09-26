// Parser cho file monthly-report (.md) -> mảng ticket JSON.
// Quy tắc parse đầy đủ tham khảo WORKFLOW.md mục 1 và 1.1.

const fs = require('fs');
const { CONSTANTS } = require('./config');

const SITE_HEADER_RE = /^🟢\s*\*\*Dự án:\s*(.+?)\*\*\s*$/;
const SPECIAL_HEADER_RE = /^🟢\s*\*{0,2}\s*TICKET ĐẶC BIỆT[:：]/;
const TITLE_RE = /^\*\*(\d+)\.\s+(.+?)\*\*\s*$/;
const RELATED_UI_RE = /^RELATED UI:\s*(.+?)\s*\|\s*JOB TYPE:\s*(.+?)\s*$/;
const SPECIAL_JOB_TYPE_RE = /^JOB TYPE:\s*(.+?)\s*$/;
const PROCESS_RE = /^PROCESS:\s*(.+?)\s*$/;
const ITERATION_RE = /^ITERATION:\s*(.+?)\s*$/;
const DETAIL_START_RE = /^📝\s*Detail:\s*(.*)$/;
// ⚠️ Field MỚI: đánh dấu ticket đã log lên
// Blueprint thành công hay chưa, để file .md có thể giữ ĐẦY ĐỦ mọi task
// trong tháng (không bao giờ xoá task đã log khỏi file) mà vẫn phân biệt
// được task nào cần chạy tiếp. Dòng này KHÔNG bắt buộc phải có sẵn trong
// file (file cũ trước tính năng này không có) — thiếu thì mặc định coi như
// "N" (chưa log).
const LOG_STATUS_RE = /^LOG:\s*(.+?)\s*$/;
// Field MỚI: URL(s) Blueprint thật của ticket này (nếu đã tạo, kể cả tạo dở
// dang chưa xong Time Worked/Effort Point) — nhiều URL cách nhau bởi ", " khi
// ticket gốc bị splitOversizedTicket() tách thành nhiều ticket con (mỗi con 1
// URL riêng, cùng chia sẻ 1 dòng BLUEPRINT: ở block gốc). Có field này giúp
// runner.js đi thẳng vào URL đã biết thay vì phải search lại trên Blueprint.
const BLUEPRINT_URL_RE = /^BLUEPRINT:\s*(.+?)\s*$/;
// Trích Jira ID từ khối Detail (do /monthly-report sinh ra dòng "**Link
// Jira:** https://.../browse/<ID>" khi ticket có Jira ID) — dùng làm khoá
// đối chiếu ngược lại CSV nguồn (daily-report) khi cập nhật trạng thái log.
const JIRA_ID_IN_DETAIL_RE = /Link Jira:\*{0,2}\s*https?:\/\/\S*\/browse\/([A-Za-z]+-\d+)/i;

// Bỏ dòng phân cách markdown table kiểu |---|---|---|
function isTableSeparator(line) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line.trim());
}

function splitTableRow(line) {
  let cells = line.trim();
  if (cells.startsWith('|')) cells = cells.slice(1);
  if (cells.endsWith('|')) cells = cells.slice(0, -1);
  return cells.split('|').map((c) => c.trim());
}

// Đọc 1 bảng markdown bắt đầu tại lines[startIdx] (dòng header "| A | B | ... |")
// Trả về { rows: [{col: val}], nextIdx } — nextIdx là dòng đầu tiên KHÔNG còn thuộc bảng.
function parseMarkdownTable(lines, startIdx) {
  const headerLine = lines[startIdx];
  if (!headerLine || !headerLine.trim().startsWith('|')) {
    return { rows: [], nextIdx: startIdx };
  }
  const headers = splitTableRow(headerLine);
  let idx = startIdx + 1;
  if (idx < lines.length && isTableSeparator(lines[idx])) idx += 1;
  const rows = [];
  while (idx < lines.length && lines[idx].trim().startsWith('|')) {
    const cells = splitTableRow(lines[idx]);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] !== undefined ? cells[i] : '';
    });
    rows.push(row);
    idx += 1;
  }
  return { rows, nextIdx: idx };
}

// dd/mm/yyyy -> yyyy-mm-dd
function toIsoDate(ddmmyyyy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return ddmmyyyy.trim();
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseNumber(s) {
  const n = parseFloat(String(s).replace(/,/g, '').trim());
  return Number.isNaN(n) ? 0 : n;
}

function findTableStart(lines, fromIdx, headingRe) {
  for (let i = fromIdx; i < lines.length; i += 1) {
    if (headingRe.test(lines[i])) {
      // Bảng bắt đầu ở dòng kế tiếp không rỗng
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j += 1;
      return j;
    }
  }
  return -1;
}

function extractEffortPoints(lines) {
  const startIdx = findTableStart(lines, 0, /^\*\*Effort Point/);
  if (startIdx === -1) return [];
  const { rows } = parseMarkdownTable(lines, startIdx);
  return rows.map((r) => ({
    category: r['Category'] || '',
    jobDetails: r['Job Details'] || '',
    unitPoint: parseNumber(r['Unit Point']),
    volume: parseNumber(r['Volume']),
    total: parseNumber(r['Total']),
  }));
}

function extractTimeWorked(lines) {
  const startIdx = findTableStart(lines, 0, /^\*\*Time Worked/);
  if (startIdx === -1) return [];
  const { rows } = parseMarkdownTable(lines, startIdx);
  return rows.map((r) => ({
    pic: r['PIC'] || '',
    phaseName: r['Phase Name'] || '',
    jobCategory: r['Job Category'] || '',
    hours: parseNumber(r['Working Time']),
    point: parseNumber(r['Point']),
    date: toIsoDate(r['Date'] || ''),
  }));
}

// Lấy toàn bộ text từ sau "📝 Detail:" tới ngay trước dòng RELATED_UI_RE/SPECIAL_JOB_TYPE_RE
function extractDetail(lines, stopRe) {
  let startIdx = -1;
  let firstLineTail = '';
  for (let i = 0; i < lines.length; i += 1) {
    const m = DETAIL_START_RE.exec(lines[i]);
    if (m) {
      startIdx = i;
      firstLineTail = m[1];
      break;
    }
  }
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (stopRe.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const bodyLines = [];
  if (firstLineTail.trim() !== '') bodyLines.push(firstLineTail);
  for (let i = startIdx + 1; i < endIdx; i += 1) bodyLines.push(lines[i]);
  return bodyLines.join('\n').trim();
}

function parseRegularTicketBlock(blockLines, siteFromHeader) {
  let title = '';
  for (const line of blockLines) {
    const m = TITLE_RE.exec(line);
    if (m) {
      title = m[2].trim();
      break;
    }
  }

  // ⚠️ `site` PHẢI lấy từ dòng "RELATED UI:" (Title Case, khớp tên hiển thị
  // Site thật trên Blueprint) — KHÔNG lấy từ dòng "🟢 Dự án:" (ALL CAPS). Xem
  // WORKFLOW.md mục 1.
  let site = siteFromHeader;
  let jobType = '';
  for (const line of blockLines) {
    const m = RELATED_UI_RE.exec(line);
    if (m) {
      site = m[1].trim();
      jobType = m[2].trim();
      break;
    }
  }

  let process = '';
  let iteration = '';
  let logStatusRaw = 'N'; // mặc định "chưa log" nếu file cũ không có dòng LOG:
  let blueprintUrls = [];
  for (const line of blockLines) {
    const pm = PROCESS_RE.exec(line);
    if (pm) process = pm[1].trim();
    const im = ITERATION_RE.exec(line);
    if (im) iteration = im[1].trim();
    const lm = LOG_STATUS_RE.exec(line);
    if (lm) logStatusRaw = lm[1].trim();
    const bm = BLUEPRINT_URL_RE.exec(line);
    if (bm) blueprintUrls = bm[1].split(',').map((u) => u.trim()).filter(Boolean);
  }

  const detail = extractDetail(blockLines, RELATED_UI_RE);
  const jiraMatch = JIRA_ID_IN_DETAIL_RE.exec(detail);

  return {
    type: 'regular',
    site,
    title,
    jobType,
    process,
    iteration,
    detail,
    jiraId: jiraMatch ? jiraMatch[1] : null,
    alreadyLogged: /^Y$/i.test(logStatusRaw),
    blueprintUrls,
    blueprintUrl: blueprintUrls[0] || null,
    effortPoints: extractEffortPoints(blockLines),
    timeWorked: extractTimeWorked(blockLines),
  };
}

function parseSpecialTicketBlock(blockLines) {
  let title = '';
  for (const line of blockLines) {
    const m = TITLE_RE.exec(line);
    if (m) {
      title = m[2].trim();
      break;
    }
  }

  let jobType = '';
  for (const line of blockLines) {
    const m = SPECIAL_JOB_TYPE_RE.exec(line);
    if (m) {
      jobType = m[1].trim();
      break;
    }
  }

  let process = '';
  let iteration = '';
  for (const line of blockLines) {
    const pm = PROCESS_RE.exec(line);
    if (pm) process = pm[1].trim();
    const im = ITERATION_RE.exec(line);
    if (im) iteration = im[1].trim();
  }

  const detail = extractDetail(blockLines, SPECIAL_JOB_TYPE_RE);

  return {
    type: 'special',
    site: null,
    title,
    jobType,
    process,
    iteration,
    detail,
    effortPoints: extractEffortPoints(blockLines),
    timeWorked: extractTimeWorked(blockLines),
  };
}

/** Chia `total` thành `count` phần nguyên, mỗi phần chênh nhau tối đa 1, tổng luôn khớp chính xác `total`. */
function splitEvenly(total, count) {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * 1 ticket không được vượt quá Volume 100 (config.CONSTANTS.maxVolumePerTicket)
 * — giới hạn nghiệp vụ, không phải kỹ thuật (Blueprint vẫn chấp nhận Volume
 * lớn hơn). Ticket có 1 dòng Effort Point Volume > 100 được tự động tách
 * thành nhiều ticket giống hệt nhau (title, detail, site, jobType, process,
 * iteration), chỉ khác Effort Point (Volume chia đều bằng `splitEvenly()`,
 * luôn ≤ maxVolume, tổng khớp volume gốc) và Time Worked (chia đều số dòng
 * theo thứ tự file, cùng dùng `splitEvenly()`). Không cố khớp Volume theo cột
 * Point của Time Worked vì Point là dữ liệu Blueprint tự tính lại khi Save.
 */
function splitOversizedTicket(ticket, maxVolume = CONSTANTS.maxVolumePerTicket) {
  if (ticket.effortPoints.length !== 1) return [ticket]; // chỉ xử lý ca phổ biến nhất
  const ep = ticket.effortPoints[0];
  if (!(ep.volume > maxVolume)) return [ticket];
  if (ticket.timeWorked.length === 0) {
    throw new Error(
      `Ticket "${ticket.title}" có Volume ${ep.volume} > ${maxVolume} nhưng không có dòng Time Worked nào để chia nhóm — không tự tách được, cần chia tay.`
    );
  }

  const partCount = Math.ceil(ep.volume / maxVolume);
  const volumes = splitEvenly(ep.volume, partCount);
  const groupSizes = splitEvenly(ticket.timeWorked.length, partCount);

  const groups = [];
  let idx = 0;
  groupSizes.forEach((size) => {
    groups.push(ticket.timeWorked.slice(idx, idx + size));
    idx += size;
  });

  return groups.map((groupRows, i) => {
    const volume = volumes[i];
    return {
      ...ticket,
      timeWorked: groupRows,
      effortPoints: [{ ...ep, volume, total: ep.unitPoint * volume }],
      // Mỗi ticket con là 1 ticket THẬT riêng trên Blueprint -> lấy đúng URL
      // thứ i trong danh sách (nếu có sẵn từ dòng BLUEPRINT:), không phải cả
      // mảng dùng chung.
      blueprintUrl: (ticket.blueprintUrls || [])[i] || null,
    };
  });
}

/**
 * Parse file monthly-report.md thành { tickets, specialTicket }.
 * - tickets: mảng ticket thường (Phần 2), theo đúng thứ tự trong file.
 * - specialTicket: ticket "Monthly Report" (Phần 3), hoặc null nếu không có.
 *
 * Chiến lược: tách file thành 2 vùng độc lập trước (vùng ticket thường và
 * vùng ticket đặc biệt), rồi parse riêng từng vùng — tránh nhầm lẫn giữa
 * boundary "title" của ticket đặc biệt với boundary "title" của ticket
 * thường (2 loại boundary có thể đứng sát nhau ở ranh giới Phần 2/Phần 3).
 */
function parseMonthlyReport(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const specialStart = lines.findIndex((l) => SPECIAL_HEADER_RE.test(l));
  const regularLines = specialStart === -1 ? lines : lines.slice(0, specialStart);
  const specialLines = specialStart === -1 ? [] : lines.slice(specialStart);

  // ---- Vùng ticket thường ----
  const bodyStart = regularLines.findIndex((l) => SITE_HEADER_RE.test(l));
  const tickets = [];
  if (bodyStart !== -1) {
    const boundaries = [];
    for (let i = bodyStart; i < regularLines.length; i += 1) {
      if (SITE_HEADER_RE.test(regularLines[i])) {
        boundaries.push({ idx: i, kind: 'site', value: SITE_HEADER_RE.exec(regularLines[i])[1].trim() });
      } else if (TITLE_RE.test(regularLines[i])) {
        boundaries.push({ idx: i, kind: 'title' });
      }
    }
    boundaries.push({ idx: regularLines.length, kind: 'end' });

    let currentSite = null;
    let blockIndex = 0;
    for (let b = 0; b < boundaries.length; b += 1) {
      const cur = boundaries[b];
      if (cur.kind === 'site') {
        currentSite = cur.value;
        continue;
      }
      if (cur.kind === 'title') {
        // ⚠️ Dừng ở đúng boundary KẾ TIẾP (bất kể 'site', 'title' hay 'end')
        // — nếu bỏ qua boundary 'site' để tìm tiếp 'title'/'end', blockLines
        // sẽ nuốt luôn dòng header site đứng ngay sau ticket cuối của mỗi
        // nhóm site. currentSite vẫn cập nhật đúng ở nhánh 'site' phía trên,
        // không phụ thuộc end của ticket này.
        const end = b + 1 < boundaries.length ? boundaries[b + 1].idx : regularLines.length;
        const blockLines = regularLines.slice(cur.idx, end);
        const ticket = parseRegularTicketBlock(blockLines, currentSite);
        // `blockIndex`/`sourceLineStart`/`sourceLineEnd` dùng để GHI NGƯỢC
        // trạng thái log vào đúng vị trí trong file .md gốc sau khi chạy
        // batch (xem src/writeback.js) — không phải dữ liệu nghiệp vụ, chỉ
        // là toạ độ nội bộ. Ticket bị splitOversizedTicket() tách thành
        // nhiều ticket con vẫn giữ NGUYÊN các trường này (spread `...ticket`
        // trong splitOversizedTicket sao chép lại) vì chúng cùng trỏ về 1
        // block gốc duy nhất trong file .md.
        ticket.blockIndex = blockIndex;
        ticket.sourceLineStart = cur.idx;
        ticket.sourceLineEnd = end;
        tickets.push(ticket);
        blockIndex += 1;
      }
    }
  }

  // ---- Vùng ticket đặc biệt (nếu có) ----
  const specialTicket = specialLines.length > 0 ? parseSpecialTicketBlock(specialLines) : null;

  // Tự động tách ticket nào có Volume > 100 thành nhiều ticket con — xem
  // splitOversizedTicket() ở trên. Áp dụng ngay tại đây để MỌI nơi gọi
  // parseMonthlyReport() (dry-run, runner.js) đều thấy danh sách đã tách sẵn,
  // không cần sửa gì thêm ở nơi khác.
  const splitTickets = tickets.flatMap((t) => splitOversizedTicket(t));
  // ⚠️ Ticket đặc biệt (Monthly Report) cũng phải qua splitOversizedTicket
  // khi Volume > 100 (gộp nhiều Meeting/Sync có thể vượt giới hạn) — trả về
  // mảng specialTickets (rỗng nếu không có ticket đặc biệt).
  const specialTickets = specialTicket ? splitOversizedTicket(specialTicket) : [];

  // Guard chống lỗi im lặng: file không đúng định dạng monthly-report.md
  // (vd trỏ nhầm vào .xlsx) đọc bằng utf-8 sẽ ra chuỗi vô nghĩa, không khớp
  // bất kỳ regex nào ở trên — trước đây trả về {tickets:[], specialTicket:
  // null} y hệt 1 tháng hợp lệ không có gì để log, không có tín hiệu lỗi
  // nào. Chỉ ném lỗi khi file THẬT SỰ có nội dung (tránh vỡ trường hợp file
  // trống hợp lệ) nhưng parse ra rỗng hoàn toàn.
  if (splitTickets.length === 0 && !specialTicket && content.trim().length > 0) {
    throw new Error(
      `Không parse được ticket nào từ "${filePath}" dù file không rỗng — kiểm tra lại đúng định dạng monthly-report.md (không phải .xlsx/file khác) và đã có ít nhất 1 dòng "🟢 **Dự án: ..." hoặc "🟢 TICKET ĐẶC BIỆT".`
    );
  }

  return { tickets: splitTickets, specialTicket, specialTickets };
}

module.exports = { parseMonthlyReport, toIsoDate, splitOversizedTicket };
