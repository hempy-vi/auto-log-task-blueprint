# auto-log-task-blueprint

Tool Node.js + Playwright tự động log Task từ `work-reports/*.md` lên hệ
thống Blueprint (CyberLogitec). Đặc tả nghiệp vụ đầy đủ nằm ở
[WORKFLOW.md](./WORKFLOW.md) — đọc file đó trước khi sửa code, đặc biệt mục 3
(hạn chế/rủi ro đã biết) và mục 4 (checklist tình trạng implement).

## Cấu trúc

```
src/parser.js            parse file .md -> JSON ticket
src/config.js            hằng số nghiệp vụ (PIC theo Phase, giới hạn Volume, v.v.)
src/selectors.js         TOÀN BỘ CSS selector thật -- đã xác nhận qua test thật trên production
src/blueprintActions.js  hành động Playwright trên hệ thống Blueprint (Bước 0 -> Bước 5)
src/runner.js            chạy batch nhiều ticket, chống trùng, tự phục hồi khi 1 ticket lỗi, tổng kết
src/loadEnv.js           nạp file .env (username/password đăng nhập)
src/report.js            sinh trang XEM TRƯỚC (chọn Năm/Tháng, Bảng Summary, cột Jira/Blueprint link, badge Log/Tạo dở, nút Xác nhận/Huỷ) VÀ trang BÁO CÁO KẾT QUẢ sau batch (cùng phong cách assets/splash.html)
src/writeback.js         ghi ngược trạng thái log (LOG: Y/N) + URL Blueprint thật (BLUEPRINT:) vào .md, cột Log Status + Blueprint URL vào CSV <yyyymm>_daily-report.csv sau khi chạy batch
scripts/backfill-blueprint-urls.js  tìm lại URL Blueprint cho ticket đã log ở tháng cũ (trước khi field BLUEPRINT: tồn tại) -- search theo title, đối chiếu Effort Point Total để gán đúng URL khi có nhiều ticket trùng title
scripts/smoke-test.js              điền form New Task bằng dữ liệu giả, KHÔNG Submit -- test nhanh selector/login còn sống không
scripts/test-create-real-task.js   tạo THẬT 1 ticket + hoàn tất Job Detail luôn (theo TICKET_TITLE/REPORT_FILE)
scripts/test-run-one-ticket.js     chạy đúng runner.js thật nhưng CHỈ 1 ticket, dừng lại trước ticket kế tiếp -- QC pipeline
scripts/test-run-titled-tickets.js chạy runner.js thật CHỈ với các ticket khớp TICKET_TITLE -- dùng cho ticket bị tách (Volume > 100)
scripts/test-full-job-detail.js    chạy lại Time Worked + Effort Point cho 1 ticket đã tồn tại (theo TICKET_URL/TICKET_TITLE)
scripts/test-set-effort-register.js  chạy lại riêng bước "100% Effort Point vào Register" cho 1 ticket đã tồn tại (theo TICKET_URL)
scripts/complete-tickets-by-title.js hoàn tất Job Detail cho NHIỀU ticket đã tạo sẵn cùng lúc (theo TICKET_URLS JSON + REPORT_FILE)
index.js                 CLI entry point
setup.bat                (Windows) cài dependency + tạo .env lần đầu
run.bat                  (Windows) tự relaunch ẨN qua run-hidden.vbs -- xem bên dưới
run-hidden.vbs           (Windows) chạy run.bat ẨN HOÀN TOÀN (không cửa sổ, không icon taskbar)
```

## Cài đặt (Windows — nhanh)

```
setup.bat
```

Chạy 1 lần trên mỗi máy: cài dependency (`npm install`), cài trình duyệt
Chromium cho Playwright, tự tạo `.env` từ `.env.example` nếu chưa có. Điền
`BLUEPRINT_USERNAME`/`BLUEPRINT_PASSWORD` thật vào `.env` trước khi chạy tiếp
(file `.env` đã nằm trong `.gitignore`, không bị commit lên git).

## Chạy (Windows — nhanh)

```
run.bat work-reports\202607_monthly-report.md
```

Hoặc không cần truyền gì cả — đặt `MONTH=202609` (ví dụ) trong `.env`, tool tự
suy ra file `work-reports\202609_monthly-report.md`:

```
run.bat
```

`run.bat` **luôn chạy ẩn hoàn toàn** (không cửa sổ cmd nào hiện ra, kể cả
thoáng qua) — tự relaunch chính nó qua `run-hidden.vbs` rồi thoát ngay lập
tức. Toàn bộ tương tác (xem trước danh sách ticket, xác nhận, xem báo cáo)
diễn ra **trong trình duyệt**, không còn console nào để gõ `Y`/đọc log nữa:

1. Trình duyệt tự mở, chạy màn hình chào rồi **tự đăng nhập** ngay (để link
   Blueprint ở bước sau bấm được luôn, không bị bung màn hình login Keycloak
   trơ trọi).
2. Hiện trang **xem trước**, quét toàn bộ file `work-reports/*_monthly-report.md`
   có sẵn — chọn **Năm/Tháng** ở đầu trang (mặc định tháng gần nhất), xem
   Bảng Summary + 2 bảng "Chưa log"/"Đã log trước đó" (title, site, job type,
   Jira, Effort Point, Time Worked, link **Blueprint** — ticket "tạo dở"
   (Submit thành công nhưng lỗi giữa chừng) có badge "🔧 Tạo dở — sẽ tự hoàn
   tất") — đọc kỹ trước khi bấm.
3. Bấm **"✓ Xác nhận — bắt đầu Log"** để chạy batch cho ĐÚNG tháng đang chọn
   ở dropdown (tạo ticket THẬT trên production), hoặc **"✕ Huỷ, không log gì
   cả"** / đóng thẳng trình duyệt để dừng lại.
4. Sau khi xác nhận: chạy batch (giao diện Blueprint thật hiện ra như bình
   thường) → trang **báo cáo kết quả** (thống kê + danh sách chi tiết Thành
   công/Bỏ qua/Lỗi).
5. Đóng trình duyệt khi xem xong — tiến trình chạy nền (đang ẩn) tự thoát
   sạch ngay sau đó, không cần thao tác gì thêm.

stdout/stderr (log kỹ thuật, không phải nơi xác nhận) được ghi vào
`logs/run-last.log` để đối chiếu khi cần debug (file này là UTF-8 — nếu mở
bằng PowerShell `Get-Content` phải thêm `-Encoding UTF8`, còn mở bằng VS
Code/Notepad hiện đại thì tự nhận đúng, không cần làm gì thêm).

## Cài đặt / chạy thủ công (không dùng .bat, hoặc không phải Windows)

```
npm install
npx playwright install chromium
```

```
node index.js --dry-run --report ./work-reports/202607_monthly-report.md
```

In ra danh sách ticket đã parse được kèm site, job type, số dòng Effort
Point/Time Worked — **luôn chạy lệnh này trước** mỗi lần đổi file
monthly-report để phát hiện sớm title trùng lặp, sai site/job type, v.v.
trước khi đụng tới trình duyệt thật.

```
node index.js --report ./work-reports/202607_monthly-report.md
```

- Due Date: KHÔNG cần truyền gì — mỗi ticket dùng nguyên giá trị MẶC ĐỊNH mà
  popup New Task tự hiển thị lúc mở form. Nếu Blueprint báo lỗi (ngày lễ/ngày
  quá khứ), tool tự đọc lại ngày đang hiển thị, cộng thêm 1 ngày rồi thử lại,
  lặp tới khi Submit thành công (xem `submitNewTask()`). Giờ Due luôn dùng
  mặc định 17:30 của form, không có tuỳ chọn đổi giờ.
- `--status <value>`: ⚠️ **ĐỪNG DÙNG** — selector `ticketDetail.statusPill`
  vẫn còn là placeholder chưa điền, nên chỉ cần 1 lần dùng cờ này là
  `NotImplementedError` sẽ ném ra và **DỪNG CẢ BATCH ngay lập tức** (không
  phải chỉ bỏ qua 1 ticket) — kể cả khi ticket đó đã tạo + nhập Time
  Worked/Effort Point thành công trên production trước đó (bị ghi nhận nhầm
  thành "lỗi" trong tổng kết). Xem WORKFLOW.md mục 4.

Trình duyệt mở lên, hiện **trang xem trước** danh sách ticket kèm 2 nút Xác
nhận/Huỷ (xem mục "Chạy (Windows — nhanh)" ở trên — hành vi giống hệt dù chạy
qua `run.bat` hay gọi `node index.js` trực tiếp, vì bước này nằm trong
`index.js`, không phải trong `.bat`). Sau khi xác nhận, tool tự đăng nhập bằng
`BLUEPRINT_USERNAME`/`BLUEPRINT_PASSWORD` trong `.env`. Nếu đăng nhập tự động
lỗi, tool tự chuyển hẳn sang trang đăng nhập Keycloak và **tự chờ** (không
cần bấm gì ở terminal) tới khi bạn đăng nhập tay xong — nhận biết bằng việc
trình duyệt tự điều hướng về lại đúng domain Blueprint sau khi Keycloak xác
thực thành công.

Mỗi ticket trải qua đủ 5 bước tự động: tạo task (New Task form) → Submit →
mở Detail ở tab mới → nhập Time Worked → nhập Effort Point → chỉnh lại Effort
Point 100% vào phase Register. 1 ticket lỗi giữa chừng sẽ được ghi log +
tự dọn trạng thái (quay lại trang Requirement, chọn lại Project/Category) rồi
tiếp tục ticket kế tiếp, không dừng cả batch — trừ khi chính bước dọn dẹp đó
cũng lỗi, hoặc trình duyệt bị crash hẳn.

### Test/tiện ích thủ công cho 1 ticket cụ thể

```
node scripts/smoke-test.js
TICKET_URL=<url ticket> node scripts/test-set-effort-register.js
TICKET_URL=<url ticket> TICKET_TITLE="<title đúng trong monthly-report>" node scripts/test-full-job-detail.js
TICKET_TITLE="<title>" REPORT_FILE=./work-reports/<file>.md node scripts/test-create-real-task.js
TICKET_TITLE="<title>" REPORT_FILE=./work-reports/<file>.md node scripts/test-run-one-ticket.js
REPORT_FILE=./work-reports/<file>.md TICKET_URLS='{"<title>":"<url>"}' node scripts/complete-tickets-by-title.js
```

Dùng khi 1 ticket bị lỗi giữa batch và cần làm lại riêng lẻ, không muốn chạy
lại toàn bộ file. Due Date luôn dùng mặc định của popup (không có env var để
đổi) — xem mục "Chạy thật" ở trên.

## Việc còn thiếu (xem đầy đủ ở WORKFLOW.md mục 4)

- Pill STATUS + cách đổi giá trị — chưa khám phá, `--status` hiện chưa dùng được.
- Selector chính xác ô Unit Point trong `jobTypeGrid` — chỉ là bước verify
  phụ, không chặn tiến trình chính.
- Toast cảnh báo Due Date rơi ngày lễ/quá khứ (`submitNewTask`) — đã implement
  nhưng chưa từng được test thật (chưa từng bấm trúng ngày lỗi trong lúc
  test), selector nút đóng toast chưa xác nhận 100% khớp DOM thật.
