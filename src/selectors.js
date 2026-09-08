// Toàn bộ CSS selector/locator thật của hệ thống Blueprint (CyberLogitec).
//
// Đây là nơi DUY NHẤT cần sửa khi selector đổi. Phần logic ở
// blueprintActions.js/runner.js không cần đụng vào khi chỉ sửa selector.
//
// ⚠️ LƯU Ý QUAN TRỌNG: UI dựng bằng framework Webix — rất nhiều widget được
// Webix gán id DOM dạng số ngẫu nhiên/timestamp (vd `id="1787945521466"`),
// ĐỔI MỖI LẦN mở lại. TUYỆT ĐỐI không dùng các id này làm selector. Thay vào
// đó, Webix luôn gán kèm 1 thuộc tính `view_id="..."` CỐ ĐỊNH trên div bao
// ngoài mỗi widget — đây mới là thứ dùng để định vị (vd
// `[view_id="cbbJbTp"] input`). Đã xác nhận bằng cách dump HTML thật của
// modal "New Task" qua Playwright (scripts/dump-new-task-html.js).
//
// Các loại control khác nhau trong Webix cần cách thao tác khác nhau:
// - "combo" (input gõ được, type-ahead): page.fill() rồi click option hiện ra
//   trong popup `.webix_popup .webix_list_item` (dùng selectComboOption()).
// - "richselect" tĩnh (div webix_inp_static, KHÔNG phải input): phải click
//   để mở popup rồi chọn option, không fill() được trực tiếp.
// - "datepicker": click mở popup lịch (chưa khám phá đầy đủ cấu trúc).

module.exports = {
  // --- Đăng nhập (https://auth.cyberlogitec.com.vn/, redirect từ blueprint.cyberlogitec.com.vn) ---
  login: {
    usernameInput: '#username',
    passwordInput: '#password',
    submitButton: '#submit-btn',
  },

  // --- Bước 0: trang Requirement (danh sách) ---
  requirementList: {
    newTaskButton:
      '#UI_PIM_001Body > div > div:nth-child(2) > div:nth-child(3) > div > div:nth-child(4) > div.webix_view.webix_layout_line > div:nth-child(2) > div > button',
    searchInput: '[placeholder="Requirement Name, Content, Ticket Number"]',
    searchButton: 'button:has-text("Search")',
    // ⚠️ PHẢI dùng text KHỚP CHÍNH XÁC (có ngoặc kép) — `text=${text}` không
    // ngoặc kép sẽ khớp THEO SUBSTRING (đã xác nhận qua review: các site có
    // tên lồng nhau như "Samil"/"Samil Textile", "Dongil"/"Dongil Rubber",
    // "Yujin"/"Yujin Kreves" khiến 2 ticket có title chứa nhau bị nhận nhầm
    // là "đã tồn tại" ở bước idempotency check dù thực ra là 2 ticket khác nhau).
    resultRowByText: (text) => `text="${text.replace(/"/g, '\\"')}"`, // double-click dòng kết quả để mở Detail ở tab mới

    // Dropdown chọn Project ở góc trên-trái trang (vd "CAPA Management" /
    // "ERP Maintenance" / "Factory Maintenance" / "WorkFlow"). CHƯA có
    // view_id cố định xác nhận được — dùng cách gián tiếp: nó là input
    // role="combobox" ĐẦU TIÊN trên trang (nằm trước các dropdown filter
    // khác như "All Iteration"). Nếu selector này sai/không ổn định, F12
    // lại để lấy view_id chính xác (xem cùng cách đã làm với các field khác).
    projectDropdownInput: 'input[role="combobox"]:visible >> nth=0',

    // Cây module bên trái (Data Model / Logistics / Human Resource /
    // Accounting với "ERP Maintenance"). Dùng text trực tiếp trong cây.
    categoryTreeItem: (name) => `text=${name}`,
  },

  // Popup dùng chung cho MỌI dropdown kiểu Webix richselect/combo (chọn
  // Project, ITERATION, option gợi ý của combo type-ahead...). Xuất hiện
  // dạng `.webix_popup` gắn vào cuối <body>, chứa `.webix_list_item`.
  // ⚠️ Webix không luôn xoá popup cũ khỏi DOM khi đóng (chỉ ẩn đi) — PHẢI có
  // `:visible` để tránh dính phải option của 1 popup cũ đã đóng nhưng còn
  // nằm ẩn trong DOM (đã xác nhận gặp thật khi test: 2 phần tử "Reporting"
  // cùng khớp, 1 cái là popup PROCESS cũ/JOB TYPE còn sót lại).
  webixPopupItemByText: (text) => `.webix_popup .webix_list_item:visible:has-text("${text}")`,

  // --- Bước 1: modal "New Task" ---
  newTaskForm: {
    // JOB TYPE — combobox type-ahead thật (input gõ được)
    jobType: { container: '[view_id="cbbJbTp"]', input: '[view_id="cbbJbTp"] input' },
    // IMPORTANT — cùng dạng input combo gõ được
    important: { container: '[view_id="cbbIpt"]', input: '[view_id="cbbIpt"] input' },
    // ITERATION — richselect TĨNH (div, không phải input) — phải click mở popup
    iteration: { container: '[view_id="cbbItrt"]', staticDisplay: '[view_id="cbbItrt"] .webix_inp_static' },
    // PROCESS — input combo gõ được (giống JOB TYPE)
    process: { container: '[view_id="cbbProc"]', input: '[view_id="cbbProc"] input' },
    // DUE DATE — datepicker TĨNH (div), click mở popup lịch dạng calendar.
    // Đã xác nhận cấu trúc popup thật: `.webix_cal_month_name` (text "September
    // 2026"), `.webix_cal_prev_button`/`.webix_cal_next_button` (điều hướng
    // tháng), mỗi ô ngày có `aria-label="DD Month YYYY"` (2 chữ số ngày, tên
    // tháng đầy đủ tiếng Anh, năm 4 chữ số) — chọn ngày trực tiếp qua aria-label.
    dueDate: {
      container: '[view_id="dueDt"]',
      staticDisplay: '[view_id="dueDt"] .webix_inp_static',
      calendarMonthLabel: '.webix_popup .webix_cal_month_name',
      calendarPrevButton: '.webix_popup .webix_cal_prev_button',
      calendarNextButton: '.webix_popup .webix_cal_next_button',
      calendarDayByAriaLabel: (ariaLabel) => `.webix_popup [aria-label="${ariaLabel}"]`,
    },
    // Giờ Due — cũng là control TĨNH (div), click mở popup chọn giờ
    dueTime: { container: '[view_id="timeDueDt"]', staticDisplay: '[view_id="timeDueDt"] .webix_inp_static' },

    confidentialToggle: '[view_id="switchConfidential"] input.webix_switch_toggle',

    // RELATED UI: bấm icon bút chì (✏) để mở popup Inquiry Program chọn Site
    relatedUiEditButton: '#btnEditPgmUI',
    relatedUiDisplay: '[view_id="displayPgmUI"]',

    titleInput: '#txtTit', // <textarea id="txtTit" placeholder="Write a title">
    richTextEditor: '[view_id="ckCell"] .ck-editor__editable', // CKEditor — contenteditable thật

    attachmentFileInput: '#attachFilesSubmitRequirement', // <input type="file" hidden>
    attachmentDropZone: '#dropAttachFileSubmit',

    submitButton: '#btnSubmit',
  },

  // Panel Phase/PIC bên phải form New Task. Mỗi phase là 1 item trong list
  // `view_id="lstPhsNew"`, ĐÁNH SỐ THEO VỊ TRÍ HIỂN THỊ (1-based, KHÔNG theo
  // tên phase — vì tên/số lượng phase phụ thuộc project đang chọn, xem
  // WORKFLOW.md mục 1.1/Bước 2). Với project "ERP Maintenance" > "Logistics"
  // (đã xác nhận qua video có đúng 4 phase): 1=Register, 2=Confirmation,
  // 3=Solving, 4=Finish — CẦN ĐỐI CHIẾU LẠI lần chạy thật đầu tiên vì mới
  // được suy luận theo thứ tự, chưa F12 trực tiếp trong đúng project này.
  //
  // Cơ chế đổi PIC (đã xác nhận từ HTML thật): mỗi item có ảnh đại diện
  // <img id="imgN" onclick="showEditCombo(N)"> — click vào ảnh sẽ ẩn tên
  // hiển thị (#usrNmN) và hiện ra 1 combobox thật (#comboN input, type-ahead
  // giống JOB TYPE) để gõ/chọn người mới.
  phaseList: {
    container: '[view_id="lstPhsNew"]',
    avatarByIndex: (i) => `#img${i}`,
    comboInputByIndex: (i) => `#combo${i} input`,
    displayNameByIndex: (i) => `#usrNm${i}`,
  },

  // Popup "Inquiry Program" (search Program Name/Code) — mở sau khi bấm
  // relatedUiEditButton. Cấu trúc chi tiết CHƯA dump được, giữ nguyên
  // placeholder cho tới khi test thật.
  existingUiPopup: {
    root: 'TODO_existingUiPopupRoot',
  },
  // Popup "Related UI" (đã xác nhận cấu trúc thật): ô search Program
  // Name/Code + cây checkbox liệt kê sẵn toàn bộ site đã cấu hình (không
  // cần search vẫn thấy — search chỉ để lọc bớt cho dễ tìm). Mỗi dòng site
  // là 1 `.webix_cell[aria-colindex="1"]` chứa `input[type=checkbox]` +
  // text tên site ngay trong cùng ô.
  inquiryProgramPopup: {
    programNameInput: '[placeholder="Program Name"]',
    programCodeInput: '[view_id="txtSearchPgmUICode"] input',
    selectButton: 'button:has-text("Select")',
    // ⚠️ KHÔNG nhúng tên site trực tiếp vào 1 chuỗi selector CSS — đã thử
    // `:has-text()` (khớp substring, gặp thật lỗi tick nhầm/"strict mode
    // violation" với các cặp tên lồng nhau: "Samil"/"Samil Textile",
    // "Dongil"/"Dongil Rubber", "Yujin"/"Yujin Kreves") rồi `:text-is()`
    // (khớp chính xác nhưng lại PHÂN BIỆT hoa/thường theo tài liệu Playwright,
    // mâu thuẫn với việc getConfirmationPic() không phân biệt hoa/thường —
    // sẽ tick nhầm/thất bại nếu tên site trong monthly-report.md lệch case so
    // với tên hiển thị thật, đúng kiểu lỗi "KOLON VN" vs "Kolon Ind" đã gặp).
    // ĐÚNG cách: lấy hết các dòng qua `siteRow`, rồi lọc CHÍNH XÁC + KHÔNG
    // phân biệt hoa/thường bằng `.filter({hasText: /^tên$/i})` ở
    // blueprintActions.js (xem setRelatedUiSite).
    siteRow: '.webix_cell[aria-colindex="1"]',
  },

  // Toast cảnh báo — đã xác nhận 2 loại khác nhau qua thực tế:
  holidayWarningToast: 'text=Invalid Due Date', // "Invalid Due Date! It should be later than now."
  dueDateHolidayToast: 'text=Due Date is a holiday', // "The Due Date is a holiday. Please select it again!"

  // --- Bước 2: trang Detail ---
  ticketDetail: {
    categoryBreadcrumb: 'TODO_categoryBreadcrumb', // click để mở popup Menu/Category
    menuCategoryPopup: {
      root: 'TODO_menuCategoryPopupRoot',
      treeItem: (name) => `TODO_menuCategoryTreeItem(${name})`,
      okButton: 'TODO_menuCategoryOkButton',
    },
    statusPill: 'TODO_statusPill',
    statusOption: (value) => `TODO_statusOption(${value})`, // vd 'In-progress' | 'Done'
    // Đã xác nhận thật: KHÔNG phải pill "EFFORT POINT" (label) — phải click
    // đúng vào SỐ hiển thị (vd "610"), div này có onclick cố định
    // `showJobDetailPopup(event)` bất kể giá trị số là gì.
    jobDetailModalOpenTrigger: '[onclick="showJobDetailPopup(event)"]',

    // --- Bước 5 (MỚI, sau Time Worked + Effort Point): chỉnh lại Effort Point
    // theo Phase. Mặc định hệ thống TỰ CHIA Effort Point cho 4 phase theo tỉ
    // lệ NGÀY giữa các phase (SAI với yêu cầu thực tế — Huy muốn dồn 100% vào
    // Register). Đã xác nhận thật trên ticket #2823 (140 điểm: mặc định tự
    // chia 7/14/112/7 theo ngày -> chỉnh tay lại thành 140/0/0/0).
    //
    // Mũi tên nằm ngay trên trang Detail (KHÔNG phải trong modal Job Detail),
    // chuyển bảng giữa 2 chế độ: "Type/Title/Important" (mặc định khi mới mở
    // trang) <-> "Effort Point/Start Date/Due Date/Actual Date" theo Phase.
    // Tên id "newtask-right" là tên hàm dùng chung của hệ thống (component
    // này được tái sử dụng ở cả New Task lẫn trang Detail), không phải bug.
    phaseSplitArrow: '#newtask-right', // onclick="eventShowProcess()"
    phaseSplit: {
      // 4 div `.effort-point` theo ĐÚNG thứ tự hiển thị Phase (Register/
      // Confirmation/Solving/Finish, index 0-based = config.PHASE_INDEX - 1).
      // Mỗi div có id ổn định dạng "PSD..." (Point Schedule Detail).
      effortPointCells: '.effort-point',
      // Bấm vào SỐ (thẻ .effort bên trong) sẽ ẩn div hiển thị, hiện ra 1
      // input thật nằm trong div id CỐ ĐỊNH `effrEdit${psdId}` (input bên
      // trong có id Webix động, KHÔNG dùng trực tiếp).
      editInputByPsdId: (psdId) => `#effrEdit${psdId} input`,
      // 2 icon xác nhận/huỷ DÙNG CHUNG cho cả bảng (chỉ 1 bộ, hiện ra khi có
      // ít nhất 1 dòng đang ở chế độ sửa). PHẢI kèm `:visible` — class
      // "bp-cmm-confirm"/"bp-cmm-undo" bị tái sử dụng ở nhiều nơi khác trên
      // trang (đã xác nhận thật: query không scope ra tới 13 phần tử trùng).
      confirmButton: '#cfmChangePnt .bp-cmm-confirm:visible',
      undoButton: '#cfmChangePnt .bp-cmm-undo:visible',
    },
  },

  // --- Bước 3 + 4: modal "Job Detail" --- Đã xác nhận cấu trúc thật (tab
  // Effort Point). Tab Time Worked CHƯA khám phá, còn TODO.
  jobDetailModal: {
    root: '[view_id="popupJobDetail"]',
    closeButton: '[view_id="popupJobDetail"] .headerCloseBtn',
    effortPointTab: '[button_id="plnEfrtPnt"]',
    timeWorkedTab: '[button_id="actEfrtPnt"]',

    effortPoint: {
      categoryListItem: (category) => `[view_id="categoryGrid"] .webix_cell:has-text("${category}")`,
      jobDetailsListItem: (jobDetails) => `[view_id="jobTypeGrid"] .webix_cell:has-text("${jobDetails}")`,
      unitPointDisplay: 'TODO_effortUnitPointDisplay', // đọc giá trị thật, KHÔNG hardcode 10 — cần xác nhận cột Unit Point tương ứng dòng đang chọn trong jobTypeGrid
      transferArrowButton: '[view_id="btnAddright"]', // chuyển SANG phải (thêm vào bảng kết quả)
      transferArrowButtonLeft: '[view_id="btnAddleft"]', // chuyển NGƯỢC lại (bỏ khỏi bảng kết quả)
      resultGrid: '[view_id="totalPointGrid"]',
      totalPointDisplay: '[view_id="totalPoint"]',
      // ✅ Đã xác nhận thật: dòng Job Details trong resultGrid là 1 hàng
      // "webix_cell" ứng với aria-rowindex chung cho cả 4 cột. Ô Volume
      // (aria-colindex="3") KHÔNG có input/nút edit hiện sẵn — cơ chế đúng là
      // "click chọn ô rồi gõ thẳng bằng bàn phím" (kiểu spreadsheet của
      // Webix): click 1 lần để chọn ô, gõ số mới (tự ghi đè, KHÔNG cần xoá
      // trước), rồi Enter để xác nhận. Double-click KHÔNG cần thiết.
      // resultRowByJobDetails() trả về ô cột 1 (tên) dùng để tra aria-rowindex.
      resultRowNameCell: (jobDetails) => `[view_id="totalPointGrid"] [aria-colindex="1"]:has-text("${jobDetails}")`,
      volumeInputInRightTable: (rowIndex) => `[view_id="totalPointGrid"] [aria-colindex="3"][aria-rowindex="${rowIndex}"]`,
      saveButton: '[view_id="btnSaveEffortPoint"]',
    },

    // ✅ Đã xác nhận đầy đủ qua HTML thật (2026-08-29) trên ticket #2824.
    timeWorked: {
      table: '[view_id="actualEffortGrid"]',
      form: '[view_id="actualEffortForm"]',
      newButton: '[view_id="btnNew"]',
      saveButton: '[view_id="btnSave"]',
      deleteButton: '[view_id="btnDel"]',
      copyButton: '[view_id="btnCopy"]',
      // PIC (view_id="cbbPic") luôn disabled — không cần đụng tới.
      // Phase Name/Job Category là combo type-ahead thật (giống JOB TYPE).
      // ⚠️ Phase Name mặc định KHÔNG PHẢI "Register" như tài liệu cũ giả định
      // (đó là vì ticket #2822 cũ vốn đã LƯU SẴN "Register" — data đã lưu,
      // không phải giá trị mặc định thật) — thực tế mặc định quan sát được
      // là "Confirmation". PHẢI luôn chủ động chọn "Register", không tin mặc định.
      phaseNameSelect: '[view_id="cbbPhsNm"] input',
      jobCategorySelect: '[view_id="cbbCate"] input',
      // Date dùng CHUNG cơ chế popup lịch với DUE DATE (xem newTaskForm.dueDate) —
      // các selector calendarMonthLabel/calendarPrevButton/... đều generic
      // (scope theo `.webix_popup` đang mở, không riêng cho DUE DATE).
      dateStaticDisplay: '[view_id="dtPicker"] .webix_inp_static',
      hourInput: '[view_id="txtHour"] input', // input thật, fill() dùng được
      minuteInput: '[view_id="txtMin"] input', // input thật, fill() dùng được
      commentTextarea: '[view_id="cmt"] textarea',
      successToast: 'text=Saved successfully', // "Success!" / "Saved successfully!" — CHƯA test thật cho tab này
    },
  },
};
