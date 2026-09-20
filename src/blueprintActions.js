// Các hành động Playwright thao tác trên hệ thống Blueprint, ánh xạ 1-1 theo
// WORKFLOW.md mục 2 (Bước 0 -> Bước 6). Mỗi hàm ghi rõ đang tương ứng bước
// nào để dễ đối chiếu khi selectors.js được điền đầy đủ.
//
// KHÔNG cần sửa file này khi điền selector — chỉ cần sửa src/selectors.js.
// Chỉ sửa ở đây nếu phát hiện LOGIC/THỨ TỰ thao tác sai so với thực tế khi
// test tay (vd 1 bước cần thêm điều kiện rẽ nhánh mới).

const SEL = require('./selectors');
const { CONSTANTS, PHASE_PIC, PHASE_INDEX } = require('./config');

class NotImplementedError extends Error {
  constructor(what, workflowRef) {
    super(
      `Selector chưa được điền: "${what}". Xem WORKFLOW.md ${workflowRef} để lấy đúng locator qua F12, ` +
        `rồi sửa trong src/selectors.js (không sửa file khác).`
    );
    this.name = 'NotImplementedError';
  }
}

function assertReady(value, label, workflowRef) {
  if (typeof value === 'string' && value.startsWith('TODO_')) {
    throw new NotImplementedError(label, workflowRef);
  }
  return value;
}

/** Escape ký tự đặc biệt của regex trong 1 chuỗi thường (vd tên site) trước khi nhúng vào `new RegExp()`. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Đổi Detail (markdown nhẹ: chỉ `**bold**` + dòng trống = ngắt đoạn) sang
 * HTML thật để PASTE trực tiếp vào CKEditor — KHÔNG gõ từng ký tự
 * (pressSequentially) như trước. ĐÃ XÁC NHẬN THẬT trên ticket production
 * (#3635): khi gõ từng ký tự, CKEditor tự bắt cặp BẤT KỲ 2 dấu "_" nào trong
 * toàn đoạn văn thành in nghiêng rồi ăn mất cả 2 dấu — không cần cùng 1 từ,
 * miễn còn dấu "_" nào đó phía sau trong đoạn văn là bắt cặp luôn (vd
 * "SP_SEL_BIAS00011" -> "SP" + *SEL* nghiêng + "BIAS00011" hiển thị dính liền
 * "SPSELBIAS00011"; 2 lần xuất hiện "stock_qty" cách nhau cả câu cũng bị bắt
 * cặp chéo với nhau). Đây là do tính năng autoformat-khi-gõ của CKEditor,
 * CHỈ kích hoạt khi gõ thật (typing), KHÔNG kích hoạt khi paste — nên paste
 * HTML thật (dùng `<strong>` cho in đậm) né được hoàn toàn lỗi này mà vẫn giữ
 * đúng định dạng đậm mong muốn.
 */
function detailMarkdownToHtml(detail) {
  return detail
    .split(/\n\n+/) // dòng trống = ngắt đoạn (paragraph)
    .map((para) =>
      para
        .split('\n') // xuống dòng đơn trong cùng đoạn = <br>
        .map((line) => escapeHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'))
        .join('<br>')
    )
    .map((p) => `<p>${p}</p>`)
    .join('');
}

/**
 * Dán (paste) `detail` vào CKEditor tại `selector` bằng ClipboardEvent thật —
 * xem lý do ở `detailMarkdownToHtml()`. Không dùng clipboard OS thật (tránh
 * lệ thuộc quyền clipboard của browser) — tự dựng `DataTransfer` rồi dispatch
 * thẳng sự kiện `paste` lên đúng phần tử đang focus.
 */
async function pasteIntoRichTextEditor(page, selector, detail) {
  const html = detailMarkdownToHtml(detail);
  await page.click(selector);
  await page.evaluate(
    ({ sel, pastedHtml, pastedText }) => {
      const el = document.querySelector(sel);
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/html', pastedHtml);
      dataTransfer.setData('text/plain', pastedText);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }));
    },
    { sel: selector, pastedHtml: html, pastedText: detail }
  );
}

// ---------- Đăng nhập ----------

async function login(page, { username, password }) {
  // Lý do dùng loginUrl = app Blueprint (không phải domain auth.* trực
  // tiếp): xem comment ở CONSTANTS.loginUrl trong config.js.
  await page.goto(CONSTANTS.loginUrl);
  await page.fill(assertReady(SEL.login.usernameInput, 'login.usernameInput', 'Đăng nhập'), username);
  await page.fill(assertReady(SEL.login.passwordInput, 'login.passwordInput', 'Đăng nhập'), password);
  await page.click(assertReady(SEL.login.submitButton, 'login.submitButton', 'Đăng nhập'));
  await page.waitForLoadState('networkidle');
}

// ---------- Bước 0: trang Requirement ----------

async function gotoRequirementList(page) {
  await page.goto(CONSTANTS.requirementListUrl);
}

/**
 * Chọn đúng Project ("ERP Maintenance") + module trong cây bên trái
 * ("Logistics") — BẮT BUỘC gọi 1 lần trước khi tạo task, vì project đang
 * chọn quyết định cả luồng Phase/PIC (đã xác nhận: project khác nhau có số
 * lượng/tên phase khác nhau, vd "CAPA Management" có 6 phase thay vì 4).
 * Chỉ cần gọi 1 lần đầu batch — trạng thái filter giữ nguyên cho các ticket
 * sau (không cần gọi lại mỗi ticket).
 */
async function selectProjectAndCategory(page) {
  await page.click(
    assertReady(SEL.requirementList.projectDropdownInput, 'requirementList.projectDropdownInput', 'Bước 0')
  );
  await page.click(assertReady(SEL.webixPopupItemByText(CONSTANTS.projectName), 'webixPopupItemByText(project)', 'Bước 0'));
  await page.waitForTimeout(500);

  await page.click(
    assertReady(
      SEL.requirementList.categoryTreeItem(CONSTANTS.categoryTreeName),
      'requirementList.categoryTreeItem',
      'Bước 0'
    )
  );
  await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Đếm số ticket ĐÃ TỒN TẠI có title khớp CHÍNH XÁC — dùng cho idempotency
 * check (Bước 6). Trả về SỐ LƯỢNG (không phải boolean) vì 1 ticket gốc có
 * Volume > 100 bị tách thành nhiều ticket con CÙNG title (xem
 * parser.splitOversizedTicket) — cần phân biệt "đã có 1/3 ticket con" với
 * "chưa có ticket con nào", không chỉ đơn thuần true/false.
 */
async function countExistingTicketsByTitle(page, title) {
  const searchInput = assertReady(SEL.requirementList.searchInput, 'requirementList.searchInput', 'Bước 0');
  await page.fill(searchInput, title);
  await page.click(assertReady(SEL.requirementList.searchButton, 'requirementList.searchButton', 'Bước 0'));
  await page.waitForLoadState('networkidle').catch(() => {});
  // ⚠️ Không có selector xác nhận để chờ tường minh "bảng đã lọc xong" (khác
  // với openCreatedTicketInNewTab, nơi CHẮC CHẮN có ít nhất 1 dòng để chờ) —
  // ở đây kết quả có thể là 0 dòng (trường hợp thường gặp nhất: ticket chưa
  // từng tạo), nên không thể chờ "dòng xuất hiện" làm điều kiện dừng. Dùng
  // cùng khoảng chờ cố định 1500ms đã dùng ở openCreatedTicketInNewTab cho
  // đúng thao tác lọc bảng này (thay vì 500ms) để giảm rủi ro đếm thiếu khi
  // server chậm — KHÔNG loại bỏ hoàn toàn rủi ro race condition, xem
  // WORKFLOW.md mục "Hạn chế và rủi ro đã biết".
  await page.waitForTimeout(1500);
  return page
    .locator(assertReady(SEL.requirementList.resultRowByText(title), 'requirementList.resultRowByText', 'Bước 0'))
    .count();
}

async function openNewTaskForm(page) {
  await page.click(assertReady(SEL.requirementList.newTaskButton, 'requirementList.newTaskButton', 'Bước 0'));
  await page.waitForSelector(assertReady(SEL.newTaskForm.titleInput, 'newTaskForm.titleInput', 'Bước 1'), {
    state: 'visible',
  });
}

// ---------- Bước 1: form New Task ----------

/** Combo type-ahead thật (JOB TYPE/IMPORTANT/PROCESS/PIC combo): gõ text rồi chọn option trong popup Webix. */
async function fillTypeAheadCombo(page, inputSelector, text, label) {
  await page.click(assertReady(inputSelector, label, 'Bước 1'));
  await page.fill(assertReady(inputSelector, label, 'Bước 1'), text);
  await page.waitForTimeout(300); // đợi Webix lọc option theo text vừa gõ
  await page.click(assertReady(SEL.webixPopupItemByText(text), `webixPopupItemByText(${text})`, 'Bước 1'));
}

/** Richselect/datepicker TĨNH (div, không phải input): click mở popup rồi chọn option theo text. */
async function selectFromStaticWebixControl(page, staticDisplaySelector, optionText, label) {
  await page.click(assertReady(staticDisplaySelector, label, 'Bước 1'));
  await page.waitForTimeout(300);
  await page.click(assertReady(SEL.webixPopupItemByText(optionText), `webixPopupItemByText(${optionText})`, 'Bước 1'));
}

async function setRelatedUiSite(page, site) {
  if (!site) return; // ticket đặc biệt không có site -> để trống, không thao tác gì (WORKFLOW.md mục 1.1)
  // Icon bút chì (#btnEditPgmUI) mặc định visibility:hidden, chỉ hiện khi
  // hover vào khu vực label "RELATED UI" (đã xác nhận từ HTML thật).
  await page.getByText('RELATED UI', { exact: true }).hover();
  await page.waitForTimeout(200);
  await page.click(assertReady(SEL.newTaskForm.relatedUiEditButton, 'newTaskForm.relatedUiEditButton', 'Bước 1/2'));
  // Popup "Related UI" đã xác nhận: 1 popup duy nhất, cây checkbox liệt kê
  // sẵn toàn bộ site kể cả chưa gõ tìm — gõ vào ô search để lọc bớt.
  // ⚠️ page.fill() KHÔNG kích hoạt search-as-you-type của Webix (đã xác nhận
  // thật: danh sách không lọc lại, phải click theo text trong cây CHƯA lọc —
  // vẫn chọn đúng vì Playwright tìm theo text bất kể có lọc hay không, nhưng
  // rủi ro nếu cây bị ảo hoá/scroll ẩn với danh sách site dài). Dùng
  // pressSequentially() để gõ từng ký tự thật, kích hoạt đúng sự kiện lọc.
  const programNameInput = assertReady(
    SEL.inquiryProgramPopup.programNameInput,
    'inquiryProgramPopup.programNameInput',
    'Bước 2'
  );
  await page.click(programNameInput);
  await page.locator(programNameInput).pressSequentially(site, { delay: 30 });
  await page.waitForTimeout(500);

  // Khớp CHÍNH XÁC tên site + KHÔNG phân biệt hoa/thường (báo cáo tháng do
  // người gõ tay, dễ lệch case như "kolon ind"/"KOLON VN" vs "Kolon Ind" thật)
  // — dùng regex neo đầu/cuối thay vì nhúng tên site vào chuỗi CSS selector,
  // để tránh vừa lỗi substring vừa lỗi phân biệt hoa/thường (xem ghi chú ở
  // selectors.js).
  const siteRow = page
    .locator(assertReady(SEL.inquiryProgramPopup.siteRow, 'inquiryProgramPopup.siteRow', 'Bước 2'))
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(site)}\\s*$`, 'i') });
  await siteRow.locator('input[type="checkbox"]').click();
  await page.click(assertReady(SEL.inquiryProgramPopup.selectButton, 'inquiryProgramPopup.selectButton', 'Bước 2'));
}

/**
 * Đặt PIC cho 1 phase theo VỊ TRÍ (1-based, xem config.PHASE_INDEX). Cơ chế
 * đã xác nhận từ HTML thật: click avatar (`showEditCombo(index)`) sẽ hiện ra
 * 1 combobox type-ahead (giống JOB TYPE) để gõ/chọn người mới.
 */
async function setPhasePicByIndex(page, index, picName) {
  if (!picName) return;
  await page.click(assertReady(SEL.phaseList.avatarByIndex(index), `phaseList.avatarByIndex(${index})`, 'Bước 1'));
  await fillTypeAheadCombo(page, SEL.phaseList.comboInputByIndex(index), picName, `phaseList.comboInputByIndex(${index})`);
}

/** Set PIC cho Confirmation/Solving/Finish theo đúng bảng ở WORKFLOW.md mục 1. Register không cần set (luôn là chính user). */
async function setAllPhasePics(page) {
  await setPhasePicByIndex(page, PHASE_INDEX.confirmation, PHASE_PIC.confirmation);
  await setPhasePicByIndex(page, PHASE_INDEX.solving, PHASE_PIC.solving);
  await setPhasePicByIndex(page, PHASE_INDEX.finish, PHASE_PIC.finish);
}

async function fillNewTaskForm(page, ticket) {
  await fillTypeAheadCombo(page, SEL.newTaskForm.jobType.input, ticket.jobType, 'newTaskForm.jobType.input');
  await fillTypeAheadCombo(page, SEL.newTaskForm.important.input, CONSTANTS.important, 'newTaskForm.important.input');
  await fillTypeAheadCombo(page, SEL.newTaskForm.process.input, ticket.process || CONSTANTS.process, 'newTaskForm.process.input');

  // ITERATION là richselect TĨNH (không fill được) — xem selectFromStaticWebixControl.
  await selectFromStaticWebixControl(
    page,
    SEL.newTaskForm.iteration.staticDisplay,
    ticket.iteration || CONSTANTS.iteration,
    'newTaskForm.iteration.staticDisplay'
  );

  // ⚠️ KHÔNG chủ động set Due Date nữa (theo yêu cầu của Huy 2026-08-29) — cứ
  // để nguyên giá trị MẶC ĐỊNH mà popup tự hiển thị khi mở form. `submitNewTask`
  // sẽ tự đọc lại giá trị này và cộng thêm ngày nếu gặp toast cảnh báo.

  await setRelatedUiSite(page, ticket.site);

  await page.fill(assertReady(SEL.newTaskForm.titleInput, 'newTaskForm.titleInput', 'Bước 1'), ticket.title);

  // ⚠️ CKEditor (contenteditable) KHÔNG nhận page.fill() — đã xác nhận thật:
  // fill() chạy không lỗi nhưng nội dung vẫn trống (CKEditor tự đồng bộ lại
  // DOM theo model nội bộ của nó, ghi đè giá trị fill() vừa set). Dùng paste
  // (pasteIntoRichTextEditor) thay vì gõ từng ký tự — xem lý do đầy đủ ở
  // detailMarkdownToHtml().
  const richTextEditor = assertReady(SEL.newTaskForm.richTextEditor, 'newTaskForm.richTextEditor', 'Bước 1');
  await pasteIntoRichTextEditor(page, richTextEditor, ticket.detail);

  // Áp dụng cho MỌI ticket, kể cả ticket đặc biệt (site=null): cả 3 phase
  // Confirmation/Solving/Finish đều cố định theo Bảng PIC ở config.js, không
  // còn phụ thuộc site nào (Confirmation = "Giau Doan" 100%, kể cả ticket
  // đặc biệt không có site).
  await setAllPhasePics(page);
}

/** yyyy-mm-dd + N ngày -> yyyy-mm-dd (dùng khi Due Date rơi vào ngày lễ/không hợp lệ). */
function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Điều hướng popup lịch Webix đang mở tới đúng tháng/năm rồi bấm đúng ngày. */
async function pickCalendarDate(page, isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number); // month: 1-12
  const dd = SEL.newTaskForm.dueDate;

  for (let guard = 0; guard < 24; guard += 1) {
    // eslint-disable-next-line no-await-in-loop
    const label = await page.locator(assertReady(dd.calendarMonthLabel, 'dueDate.calendarMonthLabel', 'Bước 1')).textContent();
    const [curMonthName, curYearStr] = (label || '').trim().split(' ');
    const curMonthIndex = MONTH_NAMES.indexOf(curMonthName); // 0-11
    const curYear = Number(curYearStr);
    const targetIndex = year * 12 + (month - 1);
    const curIndex = curYear * 12 + curMonthIndex;

    if (curIndex === targetIndex) break;
    const button = curIndex < targetIndex ? dd.calendarNextButton : dd.calendarPrevButton;
    // eslint-disable-next-line no-await-in-loop
    await page.click(assertReady(button, 'dueDate.calendarNext/PrevButton', 'Bước 1'));
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(150);
    if (guard === 23) throw new Error(`Không điều hướng lịch tới ${isoDate} được sau 24 lần bấm (kiểm tra lại logic).`);
  }

  const ariaLabel = `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]} ${year}`;
  await page.click(assertReady(dd.calendarDayByAriaLabel(ariaLabel), `dueDate.calendarDayByAriaLabel(${ariaLabel})`, 'Bước 1'));
}

/**
 * Set DUE DATE (popup lịch calendar-grid, đã xác nhận cấu trúc thật). Giờ
 * (dueTime) KHÔNG cần set — theo xác nhận của Huy, giá trị mặc định của form
 * (17:30) đã dùng được, không cần đụng tới.
 */
async function setDueDateAndTime(page, isoDate) {
  const staticDisplay = assertReady(SEL.newTaskForm.dueDate.staticDisplay, 'newTaskForm.dueDate.staticDisplay', 'Bước 1');
  // ⚠️ Chờ tường minh element hiển thị (timeout ngắn, báo lỗi rõ ràng) thay
  // vì click thẳng — nếu popup vừa render lại (vd ngay sau khi đóng toast
  // cảnh báo), element có thể tạm thời chưa sẵn sàng, click thẳng sẽ rơi vào
  // timeout mặc định ~30s mơ hồ thay vì lỗi rõ nguyên nhân.
  await page.locator(staticDisplay).waitFor({ state: 'visible', timeout: 8000 });
  await page.click(staticDisplay);
  await page.waitForTimeout(300);
  await pickCalendarDate(page, isoDate);
  await page.waitForTimeout(200);
}

/**
 * Đọc giá trị Due Date ĐANG HIỂN THỊ trên form (định dạng thật đã xác nhận:
 * "MM/DD/YYYY", vd "09/01/2026") -> yyyy-mm-dd. Dùng để biết ngày mặc định
 * ban đầu (không tự set) hoặc ngày vừa bị từ chối (để cộng thêm 1 ngày).
 */
async function readDisplayedDueDateIso(page) {
  const staticDisplay = assertReady(SEL.newTaskForm.dueDate.staticDisplay, 'newTaskForm.dueDate.staticDisplay', 'Bước 1');
  const locator = page.locator(staticDisplay);
  await locator.waitFor({ state: 'visible', timeout: 8000 });
  const text = await locator.textContent();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((text || '').trim());
  if (!m) {
    throw new Error(`Không đọc được Due Date đang hiển thị (giá trị thật: "${text}") — định dạng khác "MM/DD/YYYY" đã xác nhận trước đây.`);
  }
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Bấm Submit, xử lý 2 loại toast cảnh báo Due Date nếu xuất hiện (có thể lặp
 * lại). Lần Submit ĐẦU TIÊN dùng nguyên Due Date mặc định — không tự set
 * trước (theo yêu cầu của Huy 2026-08-29, xem fillNewTaskForm). Chỉ khi gặp
 * toast cảnh báo mới đọc lại ngày ĐANG HIỂN THỊ, cộng thêm 1 ngày rồi thử
 * lại — lặp cho tới khi hết lỗi hoặc hết `maxRetries`.
 */
async function submitNewTask(page, maxRetries = 5) {
  let currentDueDate = null; // chỉ đọc từ DOM khi thật sự cần (lần đầu gặp toast)
  let dateRetries = 0; // số lần đổi ngày do toast cảnh báo Due Date
  let submitRetries = 0; // số lần bấm lại Submit do không có toast lẫn không đóng popup (UI/mạng chậm)

  // 2 loại toast đã xác nhận thực tế: "Invalid Due Date! It should be later
  // than now." (dueDate ở quá khứ) và "The Due Date is a holiday..." (dueDate
  // rơi ngày lễ). ⚠️ Dùng `Locator.or()` để ghép 2 selector — nối bằng dấu
  // phẩy trong 1 chuỗi `text=...` KHÔNG hoạt động như OR trong Playwright
  // (chỉ engine `css` mới hỗ trợ danh sách OR qua dấu phẩy; với engine `text`
  // toàn bộ chuỗi sau dấu phẩy bị coi là literal text cần tìm, không bao giờ
  // khớp thật — đã gây ra bug: toàn bộ nhánh xử lý toast Due Date là dead
  // code trước khi sửa).
  const toast = page
    .locator(assertReady(SEL.holidayWarningToast, 'holidayWarningToast', 'Bước 1'))
    .or(page.locator(assertReady(SEL.dueDateHolidayToast, 'dueDateHolidayToast', 'Bước 1')));

  for (;;) {
    // ⚠️ Đếm SỐ LƯỢNG toast trước khi Submit rồi chờ số lượng TĂNG LÊN (cùng
    // kỹ thuật đã dùng ở addTimeWorkedRow) thay vì `.first().waitFor(visible)`
    // — Webix KHÔNG xoá toast cũ khỏi DOM khi đóng (chỉ ẩn đi), nên nếu 1
    // toast cũ (đã ẩn) đứng trước trong DOM, `.first()` sẽ mãi trỏ vào đúng
    // node ẩn đó và không bao giờ thấy toast MỚI đang hiển thị thật.
    const toastCountBefore = await toast.count();
    await page.click(assertReady(SEL.newTaskForm.submitButton, 'newTaskForm.submitButton', 'Bước 1'));

    let toastAppeared = false;
    for (let guard = 0; guard < 15; guard += 1) {
      // eslint-disable-next-line no-await-in-loop
      if ((await toast.count()) > toastCountBefore) {
        toastAppeared = true;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(200);
    }

    if (!toastAppeared) {
      // ⚠️ "Không có toast cảnh báo" KHÔNG ĐỦ để kết luận Submit thành công —
      // đã gặp thật: 1 lần bấm Submit không có toast nào hiện ra, hàm vẫn
      // trả về "thành công", nhưng ticket KHÔNG HỀ được tạo (kiểm tra lại
      // toàn bộ danh sách không thấy) — có thể do click Submit không thật sự
      // đăng ký (timing/UI chưa sẵn sàng). Xác nhận thêm: popup New Task phải
      // THẬT SỰ đóng (theo hành vi đã xác nhận: Submit thành công -> popup tự
      // đóng) trước khi tin là xong.
      // ⚠️ Timeout 12s (không phải 5s) — nếu server xử lý Submit chậm hơn 5s
      // (mạng chậm/tải cao), kết luận nhầm "click chưa đăng ký" rồi bấm
      // Submit LẦN NỮA trong khi request đầu vẫn đang xử lý có thể tạo TRÙNG
      // 2 ticket cho cùng 1 lần Submit. 12s không loại bỏ hoàn toàn rủi ro
      // này nhưng giảm đáng kể khả năng xảy ra.
      const modalClosed = await page
        .locator(assertReady(SEL.newTaskForm.titleInput, 'newTaskForm.titleInput', 'Bước 1'))
        .waitFor({ state: 'hidden', timeout: 12000 })
        .then(() => true)
        .catch(() => false);
      if (modalClosed) return currentDueDate; // submit thành công — trả về ngày cuối cùng thực dùng

      // Không có toast NHƯNG popup vẫn còn mở -> click Submit chưa thật sự có
      // tác dụng (hoặc đang xử lý chậm) -> thử bấm lại CÙNG ngày (không phải
      // do ngày sai nên không cần đổi ngày). Đếm RIÊNG với nguyên nhân "toast
      // Due Date" bên dưới để không cạn ngân sách lẫn nhau và để thông báo
      // lỗi cuối cùng phản ánh đúng nguyên nhân thật sự.
      submitRetries += 1;
      if (submitRetries >= maxRetries) {
        throw new Error(
          `Đã bấm Submit ${submitRetries} lần nhưng popup không đóng và cũng không thấy toast cảnh báo Due Date nào — nhiều khả năng do UI/mạng xử lý chậm, KHÔNG phải do Due Date bị từ chối.`
        );
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    // Đóng hết toast cảnh báo (có thể xuất hiện nhiều instance). Dùng
    // `.first()` lặp lại vì Webix KHÔNG xoá toast khỏi DOM khi đóng (chỉ ẩn
    // đi) — phần tử không hề "tụt chỉ số" khi đóng 1 toast, nhưng ở đây ta
    // chỉ cần bấm đủ số lần bằng `count()` hiện tại để cố gắng đóng từng
    // toast, không dựa vào kết quả đóng để suy luận gì thêm bên dưới.
    // eslint-disable-next-line no-await-in-loop
    for (let guard = 0; guard < 10 && (await toast.count()) > 0; guard += 1) {
      // eslint-disable-next-line no-await-in-loop
      await toast.first().locator('button', { hasText: 'X' }).click({ timeout: 2000 }).catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(200);
    }

    dateRetries += 1;
    if (dateRetries >= maxRetries) {
      throw new Error(
        `Due Date liên tục bị từ chối (toast cảnh báo) sau ${dateRetries} lần đổi ngày, ngày cuối cùng đã thử: ${currentDueDate} — có thể đang rơi vào đợt nghỉ lễ dài hơn dự kiến, kiểm tra lại thủ công.`
      );
    }
    // Né ngày lễ/ngày quá khứ: đọc lại ngày ĐANG HIỂN THỊ (lần đầu gặp toast
    // thì đây chính là ngày mặc định ban đầu chưa từng bị set tay), cộng
    // thêm 1 ngày rồi thử lại.
    // eslint-disable-next-line no-await-in-loop
    currentDueDate = addDays(currentDueDate || (await readDisplayedDueDateIso(page)), 1);
    // eslint-disable-next-line no-await-in-loop
    await setDueDateAndTime(page, currentDueDate);
  }
}

// ---------- Bước 2: trang Detail ----------

/**
 * Sau khi Submit thành công (WORKFLOW.md xác nhận thật): popup New Task tự
 * đóng, hệ thống tự set ô search = mã ticket vừa tạo và bảng tự lọc còn
 * đúng 1 dòng. Phải **double-click** vào dòng đó — hệ thống tự mở trang
 * Detail ở 1 TAB TRÌNH DUYỆT MỚI (không phải điều hướng trong cùng tab).
 * Playwright cần `context.waitForEvent('page')` để bắt tab mới này.
 */
async function openCreatedTicketInNewTab(page, title) {
  const context = page.context();
  await page.waitForTimeout(1500); // đợi bảng tự lọc xong sau khi popup đóng
  // Chờ chắc chắn dòng kết quả đã xuất hiện trước khi double-click — tránh
  // double-click hụt vào lúc bảng đang còn rỗng/đang load (đã gặp thật: click
  // "thành công" về mặt API nhưng không mở tab mới vì dòng chưa tồn tại).
  const rowSelector = SEL.requirementList.resultRowByText(title);
  await page.locator(rowSelector).first().waitFor({ state: 'visible', timeout: 15000 });
  const newPagePromise = context.waitForEvent('page', { timeout: 15000 });
  await page.dblclick(rowSelector);
  const newPage = await newPagePromise;
  await newPage.waitForLoadState('networkidle').catch(() => {});
  return newPage;
}

async function setStatus(page, status) {
  await page.click(assertReady(SEL.ticketDetail.statusPill, 'ticketDetail.statusPill', 'Bước 5'));
  await page.click(assertReady(SEL.ticketDetail.statusOption(status), 'ticketDetail.statusOption', 'Bước 5'));
}

async function openJobDetailModal(page) {
  await page.click(
    assertReady(SEL.ticketDetail.jobDetailModalOpenTrigger, 'ticketDetail.jobDetailModalOpenTrigger', 'Bước 3/4')
  );
  await page.waitForSelector(assertReady(SEL.jobDetailModal.root, 'jobDetailModal.root', 'Bước 3/4'), {
    state: 'visible',
  });
}

// ---------- Bước 3: tab Effort Point ----------

async function addEffortPoint(page, effortPoint) {
  await page.click(assertReady(SEL.jobDetailModal.effortPointTab, 'jobDetailModal.effortPointTab', 'Bước 3'));
  await page.click(
    assertReady(
      SEL.jobDetailModal.effortPoint.categoryListItem(effortPoint.category),
      'jobDetailModal.effortPoint.categoryListItem',
      'Bước 3'
    )
  );
  await page.click(
    assertReady(
      SEL.jobDetailModal.effortPoint.jobDetailsListItem(effortPoint.jobDetails),
      'jobDetailModal.effortPoint.jobDetailsListItem',
      'Bước 3'
    )
  );

  // Đọc Unit Point THẬT từ UI để verify — KHÔNG hardcode 10 (WORKFLOW.md Bước 3).
  // TODO: selector chính xác của ô Unit Point ứng với dòng đang chọn trong
  // jobTypeGrid chưa xác nhận (cần lấy đúng cell cùng hàng, cột "Unit Point").
  // Tạm thời best-effort — bỏ qua verify nếu chưa có selector, KHÔNG chặn
  // tiến trình (đây chỉ là bước kiểm tra an toàn, không phải bước bắt buộc).
  if (!String(SEL.jobDetailModal.effortPoint.unitPointDisplay).startsWith('TODO_')) {
    const unitPointText = await page.locator(SEL.jobDetailModal.effortPoint.unitPointDisplay).textContent();
    const unitPointOnUi = parseFloat((unitPointText || '').replace(/[^\d.]/g, '')) || 0;
    if (effortPoint.unitPoint && unitPointOnUi && unitPointOnUi !== effortPoint.unitPoint) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cảnh báo] Unit Point trên UI (${unitPointOnUi}) khác với file nguồn (${effortPoint.unitPoint}) ` +
          `cho "${effortPoint.jobDetails}" — kiểm tra lại trước khi nhập Volume.`
      );
    }
  }

  await page.click(
    assertReady(SEL.jobDetailModal.effortPoint.transferArrowButton, 'jobDetailModal.effortPoint.transferArrowButton', 'Bước 3')
  );
  await page.waitForTimeout(300);

  // ✅ Đã xác nhận thật: ô Volume KHÔNG nhận fill() (không phải <input>) —
  // phải click chọn ô rồi gõ bàn phím trực tiếp (tự ghi đè), rồi Enter.
  const nameCell = assertReady(
    SEL.jobDetailModal.effortPoint.resultRowNameCell(effortPoint.jobDetails),
    'jobDetailModal.effortPoint.resultRowNameCell',
    'Bước 3'
  );
  const rowIndex = await page.locator(nameCell).last().getAttribute('aria-rowindex');
  const volumeCell = assertReady(
    SEL.jobDetailModal.effortPoint.volumeInputInRightTable(rowIndex),
    'jobDetailModal.effortPoint.volumeInputInRightTable',
    'Bước 3'
  );
  await page.click(volumeCell);
  await page.keyboard.type(String(effortPoint.volume));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  await page.click(assertReady(SEL.jobDetailModal.effortPoint.saveButton, 'jobDetailModal.effortPoint.saveButton', 'Bước 3'));
  // ⚠️ Chưa có toast/selector xác nhận Save Effort Point đã được test thật
  // (khác Time Worked, nơi có toast "Saved successfully" rõ ràng để chờ) —
  // đợi networkidle làm giảm (không loại bỏ hẳn) rủi ro bước sau
  // (setAllEffortPointToRegister) đọc tổng điểm TRƯỚC KHI server ghi xong.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
}

async function addAllEffortPoints(page, effortPoints) {
  for (const ep of effortPoints) {
    // eslint-disable-next-line no-await-in-loop
    await addEffortPoint(page, ep);
  }
}

// ---------- Bước 4: tab Time Worked ----------

function hoursToHourMinute(hours) {
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    m = 0;
    h += 1;
  }
  return { hour: h, minute: m };
}

async function addTimeWorkedRow(page, row) {
  const tw = SEL.jobDetailModal.timeWorked;
  // ĐÃ XÁC NHẬN THẬT (chẩn đoán trực tiếp trên ticket #3636): bấm "New" NGAY
  // sau khi click tab Time Worked (không chờ gì) là race condition — nút New
  // đã visible/enabled về mặt DOM nhưng Webix chưa kịp gắn lại event handler
  // sau khi chuyển tab, nên click "rơi" không có tác dụng, sub-form không bao
  // giờ hiện ra (dẫn tới timeout ở bước chờ `phaseNameInput` phía dưới, cả 2
  // lần thử — kể cả sau khi đóng/mở lại modal). Thêm 300ms chờ cho Webix
  // settle xong sau khi chuyển tab là hết hẳn — verify bằng script chẩn đoán
  // (không cần chờ mới THẬT xuất hiện tức thì sau khi bấm New).
  await page.click(assertReady(SEL.jobDetailModal.timeWorkedTab, 'jobDetailModal.timeWorkedTab', 'Bước 4'));
  await page.waitForTimeout(300);
  await page.click(assertReady(tw.newButton, 'jobDetailModal.timeWorked.newButton', 'Bước 4'));
  await page.waitForTimeout(300);

  // ⚠️ Đôi khi bấm "New" xong form con KHÔNG hiện ra (lỗi render Webix — gặp
  // thật khi theo dõi 1 batch chạy thật, ticket #2871: bảng Time Worked vẫn
  // trống, không có ô nhập nào xuất hiện). Cách Huy xử lý thủ công khi gặp:
  // ĐÓNG popup Job Detail rồi MỞ LẠI. Áp dụng y hệt ở đây — chỉ thử lại 1
  // lần, nếu vẫn không được thì throw lỗi rõ ràng thay vì treo 30s vô ích.
  const phaseNameInput = page.locator(
    assertReady(tw.phaseNameSelect, 'jobDetailModal.timeWorked.phaseNameSelect', 'Bước 4')
  );
  const appeared = await phaseNameInput
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    // ⚠️ KHÔNG nuốt lỗi ở bước đóng modal (trước đây `.catch(()=>{})` im lặng
    // bỏ qua) — nếu nút đóng không thật sự đóng được modal (selector sai/UI
    // kẹt), gọi `openJobDetailModal()` tiếp theo sẽ bấm nhầm vào trang Detail
    // đang bị modal cũ che, dễ ra lỗi mơ hồ hơn nhiều so với throw rõ ràng
    // ngay tại đây. Xác nhận modal ĐÃ THẬT SỰ đóng trước khi mở lại.
    await page.click(assertReady(SEL.jobDetailModal.closeButton, 'jobDetailModal.closeButton', 'Bước 4'));
    await page
      .locator(assertReady(SEL.jobDetailModal.root, 'jobDetailModal.root', 'Bước 4'))
      .waitFor({ state: 'hidden', timeout: 5000 });
    await openJobDetailModal(page);
    await page.click(assertReady(SEL.jobDetailModal.timeWorkedTab, 'jobDetailModal.timeWorkedTab', 'Bước 4'));
    await page.waitForTimeout(300); // xem ghi chú race-condition ở lần click tab đầu tiên phía trên
    await page.click(assertReady(tw.newButton, 'jobDetailModal.timeWorked.newButton', 'Bước 4'));
    await page.waitForTimeout(300);
    await phaseNameInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  // ⚠️ Phase Name mặc định KHÔNG PHẢI "Register" (đã xác nhận thật: mặc định
  // quan sát được là "Confirmation") — PHẢI luôn chủ động chọn, không tin
  // mặc định. Cả Phase Name và Job Category là combo type-ahead thật.
  await fillTypeAheadCombo(
    page,
    tw.phaseNameSelect,
    row.phaseName || CONSTANTS.phaseNameForTimeWorked,
    'jobDetailModal.timeWorked.phaseNameSelect'
  );
  await fillTypeAheadCombo(page, tw.jobCategorySelect, row.jobCategory, 'jobDetailModal.timeWorked.jobCategorySelect');

  // Date dùng chung cơ chế popup lịch với DUE DATE.
  await page.click(assertReady(tw.dateStaticDisplay, 'jobDetailModal.timeWorked.dateStaticDisplay', 'Bước 4'));
  await page.waitForTimeout(300);
  await pickCalendarDate(page, row.date);
  await page.waitForTimeout(200);

  // Hour/Minute là <input> thật — fill() dùng được trực tiếp.
  const { hour, minute } = hoursToHourMinute(row.hours);
  await page.fill(assertReady(tw.hourInput, 'jobDetailModal.timeWorked.hourInput', 'Bước 4'), String(hour));
  await page.fill(assertReady(tw.minuteInput, 'jobDetailModal.timeWorked.minuteInput', 'Bước 4'), String(minute));

  // ⚠️ Đếm số toast "Saved successfully" ĐANG CÓ trong DOM TRƯỚC khi Save —
  // Webix không xoá toast cũ khỏi DOM khi đóng (chỉ ẩn đi, xem ghi chú
  // webixPopupItemByText ở selectors.js), nên nếu nhập nhiều dòng liên tiếp,
  // toast cũ (dù đã ẩn) vẫn còn đó. waitForSelector({state:'visible'}) đơn
  // thuần bên dưới có thể vô tình khớp lại toast CŨ nếu nó hiện lên lại/còn
  // hiển thị, khiến dòng MỚI bị coi là lưu thành công dù thực ra lưu lỗi (vd
  // 1 combo type-ahead chưa kịp resolve) — bỏ sót dòng Time Worked âm thầm.
  // Đếm số lượng phần tử (không phụ thuộc trạng thái visible/hidden) rồi chờ
  // số lượng TĂNG LÊN là cách chắc chắn nhất để biết đây là toast MỚI, thay
  // vì dựa vào ngữ nghĩa visible/hidden của `text=` selector (chưa rõ có
  // tương thích hoàn toàn với các phần tử trùng lặp hay không).
  const successToast = assertReady(tw.successToast, 'jobDetailModal.timeWorked.successToast', 'Bước 4');
  const toastLocator = page.locator(successToast);
  const toastCountBefore = await toastLocator.count();
  await page.click(assertReady(tw.saveButton, 'jobDetailModal.timeWorked.saveButton', 'Bước 4'));
  for (let guard = 0; ; guard += 1) {
    // eslint-disable-next-line no-await-in-loop
    if ((await toastLocator.count()) > toastCountBefore) break;
    if (guard >= 50) {
      throw new Error('Không thấy toast "Saved successfully" MỚI xuất hiện sau khi Save (Bước 4, jobDetailModal.timeWorked.successToast).');
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(200);
  }
}

async function addAllTimeWorked(page, timeWorkedRows) {
  for (const row of timeWorkedRows) {
    // eslint-disable-next-line no-await-in-loop
    await addTimeWorkedRow(page, row);
  }
}

// ---------- Bước 5: chỉnh lại Effort Point 100% vào phase Register ----------

/**
 * Sau khi đã nhập xong Time Worked + Effort Point (Bước 3/4): hệ thống TỰ
 * ĐỘNG chia Effort Point cho 4 phase theo tỉ lệ ngày giữa các phase — SAI với
 * yêu cầu thực tế (Huy muốn dồn 100% vào Register). Hàm này đọc lại TỔNG điểm
 * thật từ UI (không hardcode), rồi chỉnh tay: Register = tổng, 3 phase còn
 * lại = 0. Đã xác nhận thật trên ticket #2823 (140 điểm: 7/14/112/7 -> 140/0/0/0).
 */
async function setAllEffortPointToRegister(page) {
  const split = SEL.ticketDetail.phaseSplit;
  await page.click(assertReady(SEL.ticketDetail.phaseSplitArrow, 'ticketDetail.phaseSplitArrow', 'Bước 5'));
  await page.waitForTimeout(500);

  const cells = page.locator(assertReady(split.effortPointCells, 'ticketDetail.phaseSplit.effortPointCells', 'Bước 5'));

  // Đọc số phase + tổng điểm THẬT từ UI, thử lại vài lần trước khi kết luận
  // sai — ngay sau khi bấm mũi tên chuyển panel, hoặc ngay sau khi Save Effort
  // Point (chưa có toast xác nhận đáng tin cậy cho bước đó, xem ghi chú ở
  // addEffortPoint), có thể panel/server CHƯA kịp render/phản ánh xong, khiến
  // count đọc được tạm thời khác 4 hoặc total tạm thời là 0 dù không có gì sai
  // thật sự. Chỉ kết luận lỗi thật (dừng hẳn, KHÔNG ghi gì) sau khi thử lại
  // nhiều lần vẫn vậy — để tránh vừa báo lỗi giả (count) vừa ghi đè 0/0/0/0
  // lên dữ liệu thật đã có trên ticket (total).
  let count = 0;
  let total = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    count = await cells.count();
    if (count === 4) {
      // eslint-disable-next-line no-await-in-loop
      const currentTexts = await cells.locator('.effort').allTextContents();
      total = currentTexts.reduce((sum, t) => sum + (parseFloat(t) || 0), 0);
      if (total > 0) break;
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(400);
  }
  if (count !== 4) {
    throw new Error(
      `Trang Detail đang hiển thị ${count} phase thay vì 4 (Register/Confirmation/Solving/Finish) sau nhiều lần thử — ` +
        'có thể đang sai Project/Category. Dừng lại, KHÔNG ghi đè Effort Point để tránh sai vị trí phase.'
    );
  }
  if (total <= 0) {
    throw new Error(
      'Tổng Effort Point đọc được từ UI là 0 sau nhiều lần thử — dừng lại, KHÔNG ghi đè để tránh xoá mất dữ liệu Effort Point thật đã nhập.'
    );
  }

  for (let i = 0; i < count; i += 1) {
    const targetValue = i === PHASE_INDEX.register - 1 ? total : 0;
    const cell = cells.nth(i);
    // eslint-disable-next-line no-await-in-loop
    await cell.locator('.effort').click();
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(200);
    // eslint-disable-next-line no-await-in-loop
    const psdId = await cell.getAttribute('id');
    const input = page.locator(
      assertReady(split.editInputByPsdId(psdId), 'ticketDetail.phaseSplit.editInputByPsdId', 'Bước 5')
    );
    // eslint-disable-next-line no-await-in-loop
    await input.fill(String(targetValue));
    // eslint-disable-next-line no-await-in-loop
    await input.press('Tab'); // trigger blur để hệ thống tự tính lại tổng "đã nhập / tổng gốc"
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(200);
  }

  await page.click(assertReady(split.confirmButton, 'ticketDetail.phaseSplit.confirmButton', 'Bước 5'));
  await page.waitForTimeout(800);
}

module.exports = {
  NotImplementedError,
  login,
  gotoRequirementList,
  selectProjectAndCategory,
  countExistingTicketsByTitle,
  openNewTaskForm,
  fillNewTaskForm,
  setDueDateAndTime,
  submitNewTask,
  openCreatedTicketInNewTab,
  setStatus,
  openJobDetailModal,
  addAllEffortPoints,
  addAllTimeWorked,
  hoursToHourMinute,
  setAllEffortPointToRegister,
};
