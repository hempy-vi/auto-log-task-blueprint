# Workflow tự động log Task lên hệ thống Blueprint (CyberLogitec)

Đặc tả nghiệp vụ + hành vi UI thật (Webix) dùng làm tài liệu tham chiếu khi
sửa `src/blueprintActions.js`/`src/selectors.js`/`src/parser.js`. Mọi selector
trong tài liệu này đã được xác nhận qua test trực tiếp trên production —
không phải suy đoán từ giao diện.

## 1. Nguồn dữ liệu đầu vào

Input là `monthly-report/<yyyymm>_monthly-report.md` (sinh bởi skill
`/monthly-report`). File gồm 3 phần, parser chỉ đọc Phần 2 và Phần 3:
- **Phần 1 — "Bảng Summary Tháng"**: bảng tổng hợp theo ngày, chỉ để người đọc
  đối chiếu. **Bỏ qua hoàn toàn**, không dùng để tạo Task.
- **Phần 2 — "Danh sách Ticker Detail thông thường"**: danh sách ticket thật,
  điểm bắt đầu nhận biết = dòng đầu tiên bắt đầu bằng `🟢 **Dự án:`.
- **Phần 3 — "Ticket Đặc Biệt"**: 1 ticket "Monthly Report" có cấu trúc khác
  hẳn, xử lý riêng — xem mục 1.1.

Mỗi ticket THƯỜNG (Phần 2) trong file `.md` có cấu trúc:

```
🟢 **Dự án: <SITE>**                              → chỉ để nhóm hiển thị trong file, KHÔNG dùng làm giá trị site thật (xem cảnh báo casing bên dưới)
**N. <Title>**                                    → Title
📝 Detail: <toàn bộ khối text, có thể nhiều dòng/nhiều đoạn>
RELATED UI: <Site> | JOB TYPE: <Modification|Bug Fixing|Data Handling|Reporting|...>
PROCESS: Reporting                                → hằng số, luôn "Reporting"
ITERATION: Development                            → hằng số, luôn "Development"

**Effort Point (Total Vol: X | Total EP: Y):**
| Category | Job Details | Unit Point | Volume | Total |
|---|---|---|---|---|
| <Category> | <Job Details> | <UnitPoint> | <Volume> | <Total> |   → có thể nhiều dòng

**Time Worked (Total Time: Z hours):**
| PIC | Phase Name | Job Category | Working Time | Point | Date |
|---|---|---|---|---|---|
| Mr. Huy | Register | <JobCategory> | <hours> | <point> | <dd/mm/yyyy> |
                                                                                          → nhiều dòng, mỗi dòng = 1 lần "New" + "Save" trong Time Worked
                                                                                          → Phase Name LUÔN LÀ "Register" (khớp mặc định thật trên Blueprint)
```

⚠️ **Dòng `|---|---|---|---|---|` là dòng phân cách chuẩn Markdown table —
phải bỏ qua khi parse, không phải dữ liệu.**

⚠️ **`site` PHẢI lấy từ dòng `RELATED UI: <Site>`, KHÔNG lấy từ dòng `🟢
Dự án:`.** Dòng `🟢 **Dự án:**` luôn viết HOA TOÀN BỘ (vd `BK VINA`), trong
khi dòng `RELATED UI:` viết Title Case (vd `BK Vina`) — đây mới là dạng khớp
với tên hiển thị Site thật trên Blueprint (RELATED UI).

⚠️ **`detail` KHÔNG có cấu trúc cố định "1 dòng Detail + 1 dòng Solution".**
Một số ticket không có dòng "Solution:", một số dùng nhãn khác ("Investigation
& Action:"), một số có nhiều đoạn (Requirement/Issue/Solution). Quy tắc parse
đúng: lấy **toàn bộ text từ sau `📝 Detail:` cho tới ngay trước dòng `RELATED
UI:`** làm 1 khối `detail` duy nhất, không cố tách riêng theo nhãn.

### 1.1 Ticket Đặc Biệt "Monthly Report" (Phần 3)

Xuất hiện khi tháng đó có ít nhất 1 task chứa từ khoá Meeting/Sync/Discuss/
Internal/Training (quy tắc MERGE của `/monthly-report`) — không phải mọi
tháng đều có (vd `202608_monthly-report.md` không có phần này, parser trả
`specialTicket: null` bình thường, không phải lỗi). Khi có, luôn đúng 1
ticket duy nhất, ở cuối file. Cấu trúc khác ticket thường:

```
🟢 TICKET ĐẶC BIỆT: MONTHLY REPORT (Meetings & Syncs)
**1. Monthly Report**
📝 Detail:
Dear Managers,
I would like to report my Monthly Report with the following activities:
- [COMMON] ...
...
Best regards,
Huy Nguyen Quoc

JOB TYPE: Reporting                               → KHÔNG có "RELATED UI: <Site> |" phía trước như ticket thường
PROCESS: Reporting
ITERATION: Development
**Effort Point (...):** ...
**Time Worked (...):** ...
```

Khác biệt cần xử lý riêng trong parser:
- Nhận diện qua tiêu đề `🟢 TICKET ĐẶC BIỆT`, KHÔNG dựa vào dòng `RELATED UI:`
  (ticket này không có dòng đó).
- **Không có Site** → để trống RELATED UI trên form New Task, không mở popup
  Related UI cho ticket này.
- `detail` lấy nguyên văn toàn bộ đoạn email, không tách Issue/Solution.
- Cũng phải qua `splitOversizedTicket` như ticket thường nếu Volume > 100
  (xem `src/parser.js`).

**`process` luôn là `"Reporting"`, `iteration` luôn là `"Development"`** —
đọc trực tiếp từ file, không hardcode trong code.

**`important`**: luôn `"Normal"` (giá trị mặc định quan sát được trên form).

**`dueDate`**: mỗi ticket dùng NGUYÊN giá trị mặc định mà popup New Task tự
hiển thị khi mở form (định dạng hiển thị `MM/DD/YYYY`, xem
`readDisplayedDueDateIso()`). Nếu Submit gặp toast "Invalid Due Date"/"Due
Date is a holiday", tool tự đọc lại ngày đang hiển thị, cộng thêm 1 ngày, set
lại rồi thử Submit tiếp — lặp tới khi hết lỗi hoặc hết số lần thử
(`submitNewTask()`). `fillNewTaskForm()` không đụng vào Due Date.

### Bảng PIC theo Phase

| Phase | PIC | Ghi chú |
|---|---|---|
| Register | Huy Quoc Nguyen | Chính mình — tự động, script không cần set |
| Confirmation | Giau Doan | Cố định cho MỌI site (dev lead) — không còn phân theo BC từng site |
| Solving | Huy Quoc Nguyen | Chính mình |
| Finish | Phu Le | Cố định cho mọi site |

PIC mặc định hiển thị cho Confirmation/Solving/Finish khi mới mở form (trước
khi chọn Site) là giá trị ngẫu nhiên/lần dùng gần nhất của hệ thống — script
**luôn chủ động set cả 3 phase này**, không tin vào giá trị mặc định
(`setAllPhasePics()`). Riêng Register không cần set — luôn tự động là chính
người đang thao tác.

Đã bỏ bảng BC phụ trách theo từng site (từng dùng để tra Confirmation PIC)
— theo quyết định nghiệp vụ mới, Confirmation PIC là hằng số cố định
"Giau Doan" cho MỌI site, không còn phân biệt theo site nữa (xem
PHASE_PIC.confirmation trong src/config.js). Hệ quả: batch KHÔNG còn tự skip
ticket vì lý do "site ngoài phạm vi" như trước — mọi site trong
monthly-report.md đều được thử tạo ticket; nếu site đó không tồn tại thật
trong popup Related UI của Blueprint, lỗi sẽ lộ ra ở bước chọn Related UI
(Bước 1) và ticket đó rơi vào "Lỗi" trong tổng kết batch, không còn rơi vào
"Bỏ qua" như cơ chế cũ.

Lưu ý: `hours` dạng thập phân (vd 2.67) phải tách thành Hours + Minutes khi
điền form (2.67h = 2 giờ 40 phút). Dòng "Total Time: X hours" ở đầu mỗi bảng
chỉ để đối chiếu, không phải giá trị nhập trực tiếp.

## 2. Luồng thao tác trên UI

### Bước 0 — Trang danh sách Requirement
URL cố định: `https://blueprint.cyberlogitec.com.vn/UI_PIM_001`
- Bộ lọc trên cùng: dropdown chọn Project, "All Iteration", "All Job Types",
  ô ngày, ô search, checkbox "My Requirement", "Advance Search".
- Cây bên trái: các module con của Project đang chọn.
- Nút **"New Task"** để mở form tạo mới.
- Ô search có thể gõ thẳng **mã ticket** (vd `#<số ticket>`) để lọc/tìm lại 1
  ticket cụ thể.
- Mỗi ticket sau khi tạo có URL riêng dạng
  `https://blueprint.cyberlogitec.com.vn/UI_PIM_001_1/PRJ<yyyymmdd><seq>` —
  có thể lưu lại để quay lại nhanh, thay vì search lại.

#### Bắt buộc chọn đúng Project + module trước khi tạo task
Trang có 4 Project khả dụng: CAPA Management / **ERP Maintenance** / Factory
Maintenance / WorkFlow — chọn qua dropdown ở góc trên-trái (input
`role="combobox"` đầu tiên trên trang, mở popup Webix
`.webix_popup .webix_list_item`, click đúng text "ERP Maintenance"). Sau đó
chọn tiếp module **"Logistics"** trong cây bên trái.

Project mặc định của tài khoản là "CAPA Management", có luồng 6 phase hoàn
toàn khác (Register/1st Confirm/2nd Confirm/Approval/Focal Acceptance/...) —
không phải 4 phase Register/Confirmation/Solving/Finish mà toàn bộ nghiệp vụ
ở đây dựa vào. Nếu không chủ động chuyển sang "ERP Maintenance" > "Logistics"
trước, logic set PIC theo Phase sẽ sai vì phase không tồn tại đúng như vậy.

Chỉ cần làm bước này 1 lần khi bắt đầu batch, không lặp lại cho từng ticket.

### Bước 1 — Form "New Task"
Selector cụ thể xem `src/selectors.js` (`newTaskForm.*`):
- **JOB TYPE** — combobox type-ahead thật (`<input type="combo">`): click →
  `fill()` text → click option khớp trong popup Webix. Giá trị mặc định khi
  mở form mới không phải rỗng ("DBMS Execution") — luôn phải chủ động gõ lại.
- **IMPORTANT** — cùng cơ chế combo type-ahead. Giá trị luôn `"Normal"`.
- **ITERATION** — richselect TĨNH (1 `<div class="webix_inp_static">`, không
  phải `<input>`, không `fill()` được) — click để mở popup rồi chọn option.
  Giá trị luôn `"Development"`.
- **PROCESS** — combo type-ahead thật. Giá trị luôn `"Reporting"`.
- **DUE DATE** — richselect TĨNH, click mở popup lịch dạng calendar grid:
  `.webix_cal_month_name` (tên tháng), `.webix_cal_prev_button`/
  `.webix_cal_next_button` để đổi tháng, mỗi ô ngày có
  `aria-label="DD Month YYYY"` — click thẳng vào ô đúng ngày sau khi điều
  hướng tới đúng tháng/năm. Giờ (mặc định "17:30") không cần set.
- **CONFIDENTIAL** (toggle switch) — để mặc định OFF.
- **RELATED UI** = Site — nút bút chì ✏ (`#btnEditPgmUI`) cạnh label mặc định
  `visibility:hidden`, chỉ hiện khi hover vào label — phải `hover()` trước
  rồi mới `click()` được. Mở popup **"Related UI"** (1 popup duy nhất): ô
  search "Program Name"/"Program Code" + nút "Select", bên dưới là cây
  checkbox liệt kê sẵn tất cả site đã cấu hình dạng `Program Name | Program
  Code | Type`. Gõ tên site vào ô search để lọc bớt, tick đúng dòng, bấm
  Select.
  ⚠️ Ô search "Program Name" **phải dùng `pressSequentially()`**, không dùng
  `fill()` — `fill()` không kích hoạt search-as-you-type của Webix nên danh
  sách không lọc lại (đã sửa trong `setRelatedUiSite()`).
  ⚠️ Khi chọn đúng dòng site trong kết quả: dùng Locator API
  `.filter({hasText: /^tên$/i})` (khớp chính xác, không phân biệt hoa/thường),
  KHÔNG nhúng tên site vào chuỗi selector CSS dạng `:has-text()`/`:text-is()`
  — nhiều site có tên lồng nhau ("Samil"/"Samil Textile", "Dongil"/"Dongil
  Rubber", "Yujin"/"Yujin Kreves") sẽ khớp nhầm hoặc khớp nhiều dòng cùng lúc.
- Ô **Title** = `<textarea id="txtTit" placeholder="Write a title">` — id cố định.
- **Rich-text editor** = CKEditor thật (`.ck-editor__editable`,
  contenteditable chuẩn). ⚠️ **`page.fill()` không báo lỗi nhưng nội dung vẫn
  TRỐNG** — CKEditor tự đồng bộ lại DOM theo model nội bộ, ghi đè giá trị
  `fill()` vừa set. Phải click để focus rồi gõ bằng `pressSequentially()`
  (đã sửa trong `fillNewTaskForm()`).
- **Attachment**: `<input id="attachFilesSubmitRequirement" type="file" hidden>`
  + drop-zone `#dropAttachFileSubmit` — bỏ qua nếu task không có file.
- Nút **Submit** = `<button id="btnSubmit">` — id cố định.

#### Đổi PIC theo Phase
Panel Phase/PIC bên phải hiện diện ngay trong form New Task. Mỗi phase hiển
thị dạng ảnh đại diện + tên:
- Click vào ảnh đại diện (`<img onclick="showEditCombo(N)">`, N = vị trí
  1-based của phase) → hiện ra combobox type-ahead thật để gõ/chọn người mới.
- Với project "ERP Maintenance" > "Logistics": đúng 4 phase theo thứ tự
  Register(1)/Confirmation(2)/Solving(3)/Finish(4).

**Validation Due Date — 2 loại toast cảnh báo:**
1. "Warning! Invalid Due Date! It should be later than now." — ngày ở quá
   khứ hoặc chưa đủ xa so với hiện tại.
2. "Warning! The Due Date is a holiday. Please select it again!" — ngày rơi
   vào ngày lễ (có thể hiện 2 lần liên tiếp cho cùng 1 lần submit).

Cả 2 xử lý giống nhau: đóng toast (nút X) rồi thử +1 ngày, lặp lại tới khi
submit được (`submitNewTask()`, dùng chung 1 vòng lặp, giới hạn số lần lặp).

### Bước 2 — Trang Detail của ticket vừa tạo

Sau khi Submit thành công, popup "New Task" tự đóng, hệ thống tự set ô search
(`requirementList.searchInput`) thành mã ticket vừa tạo và bảng tự lọc còn
đúng 1 dòng. Script **double-click vào dòng đó** — hệ thống mở trang Detail ở
**1 TAB TRÌNH DUYỆT MỚI** (không phải điều hướng trong cùng tab). Dùng
`context.waitForEvent('page')` để bắt tab mới trước khi double-click, xem
`blueprintActions.openCreatedTicketInNewTab()`.

Header trang Detail:
- Hàng 1 (breadcrumb/text): **CATEGORY** = `ERP Maintenance ▸ Logistics`
  (Project ▸ Module nội bộ — khác với RELATED UI), **RELATED RQMT** (trống),
  **RELATED UI** = Site, **WATCHER** (trống).
- Hàng 2 (pill/badge, bấm để đổi giá trị): **ITERATION** `Development`,
  **PROCESS** `Reporting`, **DUE DATE**, **EFFORT POINT** (tự tính, readonly
  — tổng từ tab Effort Point), **STATUS** `Open`, **CLASSIFY** `Public`,
  **EDIT MODE** (giá trị "Unlock" — không cần đụng tới).
- RELATED UI (Site) đã set ngay từ form New Task ở Bước 1 — trang Detail chỉ
  hiển thị lại.
- **CATEGORY (module) là field RIÊNG, khác Site (RELATED UI)** — đã chọn ở
  Bước 0, không set lại ở đây. Cơ chế đổi nếu cần sửa ticket có sẵn: bấm
  breadcrumb CATEGORY → popup "Menu/Category" → chọn 1 mục trong cây → OK.
- Popup chọn Site tên chính xác là "Related UI" (1 popup duy nhất, xem chi
  tiết ở Bước 1).
- Bên trái: sơ đồ Phase Register → Confirmation → Solving → Finish, mỗi
  phase gắn 1 PIC + ngày giờ bắt đầu phase + tổng effort theo ngày.

### Bước 3 — Nhập Effort Point (modal "Job Detail", tab "Effort Point")

Mở modal: **KHÔNG click vào pill "EFFORT POINT"** (label không phản ứng gì
với click) mà phải click đúng vào **con SỐ hiển thị** ngay dưới label đó —
phần tử này có `onclick="showJobDetailPopup(event)"` cố định bất kể giá trị
số là gì. Modal có `view_id="popupJobDetail"` (ổn định) — xem
`ticketDetail.jobDetailModalOpenTrigger`.

Giao diện tab Effort Point là dạng **2 danh sách + nút chuyển** (dual-list
transfer) — selector thật ở `src/selectors.js` → `jobDetailModal.effortPoint.*`:
1. Cột trái **"Category"** (`view_id="categoryGrid"`): 6 mục cố định — Skill
   Improvement, Development, Testing, UX/UI Design, Reporting, Business
   Consult. Click chọn 1 category theo `effortPoints[].category`.
2. Cột giữa **"Job Details"** (`view_id="jobTypeGrid"`): danh sách con tương
   ứng category vừa chọn (2 cột: Job Details | Unit Point), mỗi dòng kèm sẵn
   Unit Point do hệ thống tự gán theo Job Details cụ thể — **không phải hằng
   số toàn cục** (vd Reporting → "Monthly Report" = 25, còn lại phần lớn =
   10). Script phải **đọc Unit Point thật hiển thị trên UI**, không hardcode
   =10 (⚠️ selector chính xác của ô Unit Point ứng với dòng đang chọn chưa
   xác nhận — hiện code bỏ qua bước verify này, không chặn tiến trình
   chính). Click chọn đúng dòng `jobDetails`.
3. Bấm nút mũi tên phải màu xanh (`view_id="btnAddright"`, nút trái
   `btnAddleft` để bỏ ngược lại) để chuyển mục đã chọn sang danh sách phải.
4. Cột phải (`view_id="totalPointGrid"`) hiện dòng vừa chuyển, nhóm theo
   Category (dạng cây thu/mở bằng `.webix_tree_folder`/`.webix_tree_close`),
   4 cột: Category | Unit Point | Volume | Total. Dòng mới chuyển sang mặc
   định Volume = 1.
   Ô Volume **không** phải `<input>`, không `fill()`/double-click được. Cơ
   chế đúng: **click 1 lần để chọn ô** (Webix thêm class `webix_row_select`),
   **gõ số mới trực tiếp bằng bàn phím** (tự ghi đè giá trị cũ) rồi **Enter**
   để xác nhận. Để xác định đúng ô khi có nhiều dòng, lấy `aria-rowindex` từ
   ô tên ở cột 1 (`resultRowNameCell`) rồi ghép với cột Volume
   (`aria-colindex="3"`) cùng `aria-rowindex` đó. Đã implement trong
   `addEffortPoint()`.
5. Hệ thống tự tính `Total = Unit Point × Volume`, cộng dồn vào
   `view_id="totalPoint"` (label "Total: X" ở chân modal) và badge EFFORT
   POINT trên header ticket.
6. Bấm **Save** (`view_id="btnSaveEffortPoint"`). Lặp lại từ bước 1 nếu
   ticket có nhiều dòng Effort Point.
7. Sau khi lưu, Activity log ghi thêm mục "ADDED POINT: <Category> / <Job
   Details> <Total>" — có thể dùng để verify thay vì chỉ chờ toast.

### Bước 4 — Nhập Time Worked (tab "Time Worked" cùng modal)

Bảng cột: `PIC | Phase Name | Job Category | Working Time | Point | Date`.
Với mỗi dòng trong `timeWorked` (selector: `jobDetailModal.timeWorked.*`):
1. Bấm **New** (`view_id="btnNew"`).
2. Sub-form hiện ra (`view_id="actualEffortForm"`):
   - PIC (`view_id="cbbPic"`): disabled, tự điền theo user đang đăng nhập.
   - **Phase Name** (`view_id="cbbPhsNm"`, combo type-ahead thật): mặc định
     thật của form KHÔNG phải "Register" mà là "Confirmation" — **phải luôn
     chủ động chọn "Register"** bằng combo type-ahead, không tin giá trị
     mặc định.
   - **Job Category** (`view_id="cbbCate"`, combo type-ahead thật).
   - **Date** (`view_id="dtPicker"`): richselect TĨNH, dùng chung cơ chế
     popup lịch calendar-grid với DUE DATE ở Bước 1 (`pickCalendarDate()`).
   - **Working Time**: 2 `<input>` THẬT riêng biệt Hour (`view_id="txtHour"`)
     và Minute (`view_id="txtMin"`) — `fill()` dùng trực tiếp được. Parser
     convert vd 3.5h → Hours=3, Minutes=30.
   - **Comment** (`view_id="cmt"`, `<textarea>` thật): optional.
3. Bấm **Save** (`view_id="btnSave"`) → toast xanh "Success!"/"Saved
   successfully!", row được thêm vào bảng, sub-form reset. Activity log ghi
   thêm "ADDED TIME WORKED: ..." (hoặc "UPDATED TIME WORKED" nếu sửa dòng có
   sẵn).
   ⚠️ Webix không xoá toast cũ khỏi DOM khi đóng (chỉ ẩn) — để biết chắc dòng
   MỚI đã lưu thành công (không nhầm với toast dòng trước còn hiển thị), đếm
   SỐ LƯỢNG phần tử toast trong DOM trước khi Save rồi chờ số lượng đó TĂNG
   LÊN sau Save, thay vì chỉ chờ 1 toast "visible".
   ⚠️ Bấm "New" xong đôi khi sub-form KHÔNG hiện ra (lỗi render Webix ngẫu
   nhiên). Cách phục hồi: đợi tối đa 5s, nếu sub-form không xuất hiện thì
   đóng popup Job Detail (chờ modal thật sự `hidden`) rồi mở lại, bấm New lại
   1 lần trước khi báo lỗi thật — không nuốt lỗi ở bước đóng modal.

Trạng thái nút Copy/Save/New/Delete thay đổi động: trên ticket mới (chưa có
dòng nào), ngay sau khi bấm New, New và Copy disabled, Save và Delete
enabled — không ảnh hưởng logic vì chỉ cần bấm Save.

### Thứ tự thao tác trong modal Job Detail
**Time Worked TRƯỚC, Effort Point SAU.** Bấm Save ở tab Time Worked KHÔNG
đóng popup (để còn bấm New nhập tiếp nhiều dòng), nhưng bấm Save ở tab
Effort Point (hành động cuối cùng trong modal) thì popup TỰ ĐỘNG ĐÓNG — không
cần tự đóng tay sau bước Effort Point. `runner.js` theo đúng thứ tự này.

### Bước 4.5 — Chỉnh lại Effort Point 100% vào phase Register

Sau khi Save Effort Point ở Bước 3, hệ thống **tự động chia** tổng điểm cho
cả 4 phase theo tỉ lệ NGÀY giữa các phase — không dồn hết vào Register như
mong muốn. Cách sửa (thao tác NGAY TRÊN TRANG DETAIL, sau khi đã đóng modal
Job Detail ở Bước 3/4):
1. Trang Detail có 1 mũi tên `#newtask-right` (`class="bp-newtask-next"`,
   `onclick="eventShowProcess()"`, dùng chung component với form New Task).
   Mặc định trang Detail hiển thị bảng "Type / Title / Important" ở giữa;
   bấm mũi tên này để chuyển sang bảng "Effort Point / Start Date / Due Date
   / Actual Date" theo từng Phase.
2. Bảng hiện ra 4 dòng tương ứng 4 phase, mỗi dòng có 1
   `<div class="effort-point" id="PSD...">` (id "Point Schedule Detail", ổn
   định cho tới khi tổng điểm đổi) chứa số điểm hiện tại (`<p class="effort">`).
3. Bấm trực tiếp vào SỐ (`.effort`) của 1 dòng → hiện ra `<input>` thật nằm
   trong `<div id="effrEdit${psdId}">` (id cố định, dùng
   `#effrEdit${psdId} input`). Đồng thời 2 icon xác nhận/huỷ hiện ra trong
   `#cfmChangePnt` (dùng chung cho cả bảng):
   - `.bp-cmm-undo` (`onclick="updatePoint(false,true,true)"`) — huỷ.
   - `.bp-cmm-confirm` (`onclick="updatePoint(true,true,true)"`) — lưu.
   ⚠️ Phải kèm `:visible` khi query `.bp-cmm-confirm`/`.bp-cmm-undo` — 2 class
   này bị tái sử dụng ở nhiều chỗ khác trên trang.
4. Đọc TỔNG điểm thật từ UI (cộng cả 4 dòng, không hardcode) rồi lặp lại
   bước 3 cho cả 4 dòng: điền TỔNG vào dòng Register, điền 0 vào 3 dòng còn
   lại (nhớ Tab/blur để hệ thống tính lại). Header cột "Effort Point" đổi
   tạm thời thành dạng "đã điền / tổng gốc" để tự kiểm tra khớp trước khi
   lưu — nếu 2 số không bằng nhau thì đừng bấm confirm.
5. Bấm `.bp-cmm-confirm` để lưu. Toast "Success! Saved successfully!" hiện
   ra, Activity log ghi thêm "UPDATED POINT: Phase Register: X (+delta),
   Phase Confirmation: 0 (-delta), Phase Solving: 0 (-delta), Phase Finish: 0
   (-delta)". Badge EFFORT POINT trên header giữ nguyên tổng cũ.

Đọc số phase + tổng điểm nên thử lại vài lần trước khi thao tác (panel có
thể chưa render đủ 4 dòng ngay sau khi bấm mũi tên) — nếu sau nhiều lần vẫn
không đủ 4 phase hoặc tổng vẫn là 0 thì dừng hẳn, không ghi gì
(`setAllEffortPointToRegister()`, gọi ngay sau `addAllEffortPoints()` trong
`runner.js`, trước khi đóng tab).

### Bước 5 — Cập nhật Status
Bấm pill STATUS trên header (đang "Open") → chọn giá trị tương ứng
(In-progress/Done) theo trạng thái cuối cùng của task. **Chưa implement** —
xem mục 3.

### Bước 6 — Xử lý nhiều ticket liên tiếp (batch)
- **Due Date**: mỗi ticket dùng nguyên giá trị mặc định của popup, tự cộng
  ngày nếu gặp toast lỗi (xem mục 1).
- **Thứ tự xử lý**: tuần tự theo đúng thứ tự xuất hiện trong file (Phần 2
  rồi tới Phần 3 — ticket Monthly Report luôn xử lý cuối cùng).
- **Chống tạo trùng (idempotency)**: trước khi tạo mới 1 ticket, search theo
  Title ở ô search trang Requirement để kiểm tra đã tồn tại chưa — hữu ích
  khi script bị lỗi/crash giữa chừng và phải chạy lại. Xem giới hạn thật ở
  mục 3.
- **Xử lý lỗi từng ticket**: nếu 1 ticket lỗi (site không tồn tại thật trong
  popup Related UI, timeout mạng, toast lỗi không mong đợi...) → ghi log lý
  do + bỏ qua ticket đó, tiếp tục ticket kế tiếp, không dừng cả batch — trừ
  lỗi hệ thống nghiêm trọng (mất kết nối, trình duyệt crash, hoặc chính bước
  phục hồi sau lỗi cũng thất bại).
- **Dọn trạng thái sau ticket lỗi**: quay lại trang Requirement, chọn lại
  Project/Category, đóng mọi tab/modal còn kẹt trước khi sang ticket kế
  tiếp — nếu bước dọn dẹp này cũng lỗi thì dừng cả batch (không âm thầm chạy
  tiếp trong trạng thái Project/Category không chắc chắn, có thể ghi PIC/
  Effort Point sai phase).
- **Báo cáo kết quả cuối**: in ra danh sách ticket đã tạo thành công (kèm
  URL) và danh sách ticket bị skip/lỗi (kèm lý do) để đối chiếu thủ công.

## 3. Hạn chế và rủi ro đã biết

- **Idempotency theo title không phân biệt các THÁNG khác nhau.**
  `countExistingTicketsByTitle` chỉ lọc theo text title trên Blueprint, không
  lọc theo tháng/ngày tạo. Nếu 1 title trùng với ticket đã tạo ở tháng trước
  (kể cả việc hoàn toàn khác), batch có thể skip nhầm ticket tháng hiện tại
  vì tưởng "đã đủ số bản". Sau mỗi lần chạy batch, nên đối chiếu tổng số
  ticket "OK" + "SKIP" với tổng số ticket đã parse; nếu có title từng xuất
  hiện ở tháng trước, kiểm tra lại thủ công xem ticket tháng hiện tại có thật
  sự được tạo hay không. Chưa có giải pháp code triệt để (Blueprint không có
  field nào phân biệt "ticket của batch này" với "ticket có sẵn từ tháng
  khác" — không thể dùng Due Date vì 2 tháng liên tiếp có thể trùng giá trị).
- **Idempotency cũng không phân biệt 2 ticket GỐC khác site nhưng trùng tên
  y hệt trong CÙNG 1 batch** (khác với ticket bị tách do Volume > 100, vốn đã
  xử lý đúng qua occurrence-index). Muốn sửa triệt để cần đọc thêm cột Related
  UI của từng dòng kết quả search để lọc theo site, hiện chưa làm — rủi ro
  thấp vì cần 2 ticket gốc trùng tên y hệt trong cùng 1 tháng.
- **Idempotency không phân biệt "ticket đã tồn tại" với "ticket đã HOÀN TẤT
  nghiệp vụ".** `countExistingTicketsByTitle` chỉ đếm theo title trên trang
  Requirement — ticket đã tồn tại và search được NGAY sau `submitNewTask()`
  thành công, trước khi Time Worked/Effort Point/Register được điền (các bước
  đó chạy sau, trên tab Detail riêng). Nếu 1 ticket lỗi giữa chừng SAU khi đã
  Submit (mất mạng, Webix render lỗi...), nó để lại 1 ticket "vỏ rỗng" đã tồn
  tại nhưng chưa có dữ liệu nghiệp vụ. Chạy lại batch để xử lý nốt ticket lỗi
  sẽ khiến ticket vỏ rỗng này bị SKIP NHẦM vĩnh viễn (đếm là "đã tồn tại"),
  mất dữ liệu Time Worked/Effort Point mà không có cảnh báo rõ ràng. Đã giảm
  thiểu (không giải quyết triệt để): khi 1 ticket lỗi SAU khi đã mở tab
  Detail, `runner.js` giờ lưu lại URL ticket vỏ rỗng đó vào
  `results.failed[].partialUrl` và in cảnh báo rõ ràng trong tổng kết — dùng
  `scripts/complete-tickets-by-title.js` với URL đó để hoàn tất tay, **KHÔNG
  chạy lại cả batch** cho những ticket này.
- **`countExistingTicketsByTitle` có rủi ro race-condition khi server chậm.**
  Sau khi search, chỉ chờ cố định 1500ms (không có wait tường minh chờ bảng
  kết quả render xong, vì kết quả có thể là 0 dòng — không có tín hiệu DOM
  chắc chắn nào để chờ) rồi `.count()` ngay. Nếu bảng chưa kịp render lúc tải
  cao (đúng kịch bản nhiều ticket liên tiếp trong batch), có thể đếm thiếu
  (0 thay vì ≥1) và TẠO TRÙNG ticket. 1500ms (tăng từ 500ms) giảm rủi ro
  nhưng không loại bỏ hoàn toàn.
- **Pill STATUS chưa implement** — xem mục 3 (README.md).
- **Selector chính xác ô Unit Point** trong `jobTypeGrid` (Bước 3) chưa xác
  nhận — chỉ là bước verify phụ, không chặn tiến trình chính.
- Ticket đặc biệt "Monthly Report": tổng điểm từng dòng Time Worked có thể
  lệch 1 so với Total EP khai báo do làm tròn khi chia tay ở bước viết báo
  cáo — không ảnh hưởng vì cột Point trong Time Worked không được code đọc
  tới (Blueprint tự tính lại khi Save).
- **`splitOversizedTicket` chỉ xử lý ticket có ĐÚNG 1 dòng Effort Point**
  (`src/parser.js`, `if (ticket.effortPoints.length !== 1) return [ticket]`)
  — ticket có 2+ dòng Effort Point mà 1 trong số đó Volume > 100 sẽ bị bỏ
  qua HOÀN TOÀN không tách, không báo lỗi/cảnh báo gì, và bị submit thẳng
  vượt giới hạn nghiệp vụ. Chưa gặp thật trong dữ liệu đã chạy (mọi tháng
  tới nay đều đúng 1 dòng Effort Point/ticket) nhưng là edge case chưa xử lý
  nếu tương lai có ticket nhiều dòng Effort Point.
- **`submitNewTask()` có nhánh retry thứ 3 ngoài 2 loại toast Due Date** (xem
  Bước 1 "Validation Due Date"): nếu bấm Submit mà KHÔNG thấy toast nào lẫn
  popup không tự đóng trong ~12s (nghi UI/mạng xử lý chậm, không phải do
  Due Date bị từ chối), tool tự bấm lại Submit với NGUYÊN Due Date cũ (không
  đổi ngày), đếm riêng bằng `submitRetries` (khác `dateRetries`), cap ở
  `maxRetries`, ném lỗi riêng nếu vẫn không thành công sau khi hết lượt thử.
- **Bước 4.5 (100% Effort Point vào Register) không tự đọc lại header
  "đã điền / tổng gốc" để xác nhận khớp trước khi bấm confirm** —
  `setAllEffortPointToRegister()` điền cả 4 ô rồi bấm confirm luôn, không
  có bước code tự kiểm tra 2 số bằng nhau (dù comment code có nhắc tới đúng
  cơ chế header này). Một lần `input.fill()` thất bại âm thầm trên 1 ô sẽ
  không bị chặn lại trước khi lưu. Chưa gặp thật, nhưng đây là gap giữa mô
  tả ở trên ("nếu 2 số không bằng nhau thì đừng bấm confirm") và code thật.

## 4. Tình trạng implement

✅ = có selector thật + test pass. ❌ = còn placeholder, chưa implement.

- [x] Đăng nhập (`login.*`)
- [x] Chọn Project "ERP Maintenance" + module "Logistics"
- [x] Nút "New Task" trên trang list
- [x] JOB TYPE / IMPORTANT / PROCESS (combo type-ahead) + ITERATION
      (richselect tĩnh) + DUE DATE (popup lịch)
- [x] RELATED UI (hover icon bút chì → popup "Related UI" → search + tick + Select)
- [x] Title + Rich-text editor (CKEditor)
- [x] Avatar PIC trên panel Phase → combo type-ahead
- [x] Xử lý 2 loại toast cảnh báo Due Date — dùng `Locator.or()` + đếm số
      lượng toast tăng lên để phát hiện (không dùng `.first()+visible`, vốn
      từng khiến toàn bộ nhánh này không bao giờ khớp được toast thật nào).
      Đúng về mặt code/logic, nhưng CHƯA có dịp test thật trên production
      (chưa từng bấm trúng ngày lỗi trong lúc chạy thật)
- [x] Search ticket theo tên/mã + double-click mở Detail ở tab mới
- [x] Modal "Job Detail" (mở qua con số EFFORT POINT, không phải pill)
- [x] Tab Effort Point (Category/Job Details/nút chuyển/Volume/Save)
- [x] Tab Time Worked (New/Phase Name/Job Category/Date/Hour-Minute/Save)
- [x] Thứ tự Time Worked trước → Effort Point sau, popup tự đóng sau Save Effort Point
- [x] Bước 4.5: chỉnh Effort Point 100% vào phase Register
- [x] Tự động tách ticket Volume > 100 thành nhiều ticket con (`splitOversizedTicket`)
- [x] Idempotency (`countExistingTicketsByTitle` + occurrence-index cho ticket bị tách) — xem giới hạn ở mục 3
- [x] Chạy full batch nhiều ticket liên tiếp, tự phục hồi khi 1 ticket lỗi
- [ ] Selector chính xác ô Unit Point trong `jobTypeGrid` (không chặn tiến trình)
- [ ] Pill STATUS + cách đổi giá trị — ⚠️ nếu dùng `--status`, `setStatus()`
      throw `NotImplementedError` ngay lập tức và `runner.js` re-throw để
      DỪNG CẢ BATCH (không chỉ skip 1 ticket), kể cả khi ticket đó đã tạo +
      nhập Time Worked/Effort Point thành công. Không dùng `--status` cho
      tới khi mục này xong.
