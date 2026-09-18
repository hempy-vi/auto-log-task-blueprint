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
  for (const line of blockLines) {
    const pm = PROCESS_RE.exec(line);
    if (pm) process = pm[1].trim();
    const im = ITERATION_RE.exec(line);
    if (im) iteration = im[1].trim();
  }

  const detail = extractDetail(blockLines, RELATED_UI_RE);

  return {
    type: 'regular',
    site,
    title,
    jobType,
    process,
    iteration,
    detail,
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
 * Theo yêu cầu của Huy (2026-08-29, xem config.CONSTANTS.maxVolumePerTicket):
 * 1 ticket không được vượt quá Volume 100 — đây là lý do nghiệp vụ, KHÔNG
 * phải giới hạn do tool tự phát hiện qua lỗi (tự động nhập Volume=217 cho
 * "P290 Import BOM from Excel" vẫn được Blueprint chấp nhận bình thường lúc
 * test). Ticket nào có 1 dòng Effort Point với Volume > 100 phải được TỰ
 * ĐỘNG tách thành nhiều ticket giống hệt nhau 100% (title, detail, site,
 * jobType, process, iteration) — CHỈ khác Effort Point (Volume chia nhỏ) và
 * Time Worked (chia theo đúng dòng tương ứng).
 *
 * ⚠️ SỬA LẠI TOÀN BỘ THUẬT TOÁN (2026-08-29, lần rà soát thứ 2) — bản đầu
 * dùng thuật toán tham lam "gom nhóm Time Worked theo tổng cột Point gần
 * bằng nhau nhất", có 3 lỗi thật đã CHẠY THỬ TRỰC TIẾP xác nhận: (1) điều
 * kiện đóng nhóm sớm có thể KHÔNG BAO GIỜ thoả với 1 số phân bố Point nhất
 * định (vd chỉ 1 dòng Time Worked, hoặc Point lệch nhau nhiều như [1,1,1000])
 * khiến TOÀN BỘ rơi vào 1 nhóm duy nhất — ticket "tách" ra vẫn giữ nguyên
 * Volume gốc, phá vỡ hoàn toàn mục đích tính năng; (2) kể cả khi gom nhóm
 * đúng số lượng, Volume mỗi phần tính theo tỉ lệ Point KHÔNG có giới hạn trần
 * — 1 nhóm có thể vẫn nhận Volume > 100; (3) nếu cột Point toàn bộ = 0/rỗng
 * thì chia cho `totalPoint=0` ra `NaN`, gõ thẳng chữ "NaN" vào ô Volume thật
 * trên Blueprint. Thuật toán MỚI tách 2 việc ra làm riêng, cả 2 đều tính
 * bằng CÔNG THỨC TOÁN HỌC đơn giản (không phụ thuộc giá trị Point nào, không
 * có nhánh điều kiện có thể không bao giờ đúng):
 * - Volume: chia đều `ep.volume` cho `partCount` phần bằng `splitEvenly()` —
 *   luôn ≤ maxVolume (vì partCount = ceil(volume/maxVolume) nên trung bình
 *   mỗi phần luôn ≤ maxVolume), luôn cộng lại đúng bằng volume gốc.
 * - Time Worked: chia đều SỐ DÒNG cho `partCount` phần liên tục theo đúng
 *   thứ tự trong file (dùng chung `splitEvenly()`) — nếu ít dòng hơn số phần
 *   cần chia (hiếm), các phần dư sẽ có 0 dòng Time Worked, KHÔNG lỗi.
 * Đánh đổi: không còn cố gắng khớp Volume với đúng "khối lượng ngày làm việc"
 * của từng nhóm theo cột Point nữa — chấp nhận được vì cột Point trong Time
 * Worked là DỮ LIỆU CHẾT (Blueprint tự tính lại Point thật khi Save, xem
 * WORKFLOW.md mục 2.5 lỗi #8), không ảnh hưởng gì tới dữ liệu ghi lên hệ
 * thống thật — đổi lấy thuật toán ĐÚNG TUYỆT ĐỐI trong MỌI trường hợp.
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
    for (let b = 0; b < boundaries.length; b += 1) {
      const cur = boundaries[b];
      if (cur.kind === 'site') {
        currentSite = cur.value;
        continue;
      }
      if (cur.kind === 'title') {
        // ⚠️ Dừng ở đúng boundary KẾ TIẾP (bất kể 'site' hay 'title' hay
        // 'end') — trước đây bỏ qua boundary 'site' để tìm 'title'/'end' tiếp
        // theo, khiến blockLines "nuốt" luôn dòng header site đứng ngay sau
        // ticket cuối cùng của mỗi nhóm site (hên là dòng đó không khớp bất
        // kỳ regex trích xuất field nào nên chưa gây sai field trên thực tế,
        // nhưng vẫn là tính sai boundary). currentSite vẫn cập nhật đúng ở
        // nhánh 'site' phía trên, không phụ thuộc vào end của ticket này.
        const end = b + 1 < boundaries.length ? boundaries[b + 1].idx : regularLines.length;
        const blockLines = regularLines.slice(cur.idx, end);
        tickets.push(parseRegularTicketBlock(blockLines, currentSite));
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
  // ⚠️ Ticket đặc biệt (Monthly Report) trước đây KHÔNG được tách khi > 100
  // Volume — lỗ hổng thật (gộp cả tháng Meeting/Sync vào 1 dòng Effort Point
  // hoàn toàn có thể vượt 100). Áp dụng CÙNG hàm tách, luôn trả về MẢNG
  // (rỗng nếu không có ticket đặc biệt) để không bỏ sót trường hợp này.
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
