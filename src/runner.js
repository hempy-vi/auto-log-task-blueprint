// Điều phối batch nhiều ticket — WORKFLOW.md Bước 6.
const blueprint = require('./blueprintActions');

/**
 * @param {import('playwright').Page} page
 * @param {{tickets: object[], specialTickets?: object[], specialTicket?: object|null}} parsed
 * @param {{statusForAll?: string}} options
 */
async function runBatch(page, parsed, options) {
  // ⚠️ Dùng `specialTickets` (MẢNG, đã qua splitOversizedTicket — xem
  // parser.js) thay vì `specialTicket` (đơn, CHƯA qua tách) — nếu ticket đặc
  // biệt (Monthly Report) có Volume > 100 mà lỡ dùng bản chưa tách thì sẽ vi
  // phạm ngay giới hạn Volume/ticket của Blueprint. Vẫn hỗ trợ gọi cũ (test
  // scripts truyền `specialTicket: null` trực tiếp) qua fallback bên dưới.
  const specialTickets = parsed.specialTickets || (parsed.specialTicket ? [parsed.specialTicket] : []);
  const allTickets = [...parsed.tickets, ...specialTickets];

  const results = { success: [], skipped: [], failed: [] };

  // Bắt buộc chọn đúng Project "ERP Maintenance" > "Logistics" 1 lần trước
  // khi tạo bất kỳ task nào — project sai sẽ làm sai toàn bộ luồng Phase/PIC.
  await blueprint.selectProjectAndCategory(page);

  // ⚠️ Idempotency check theo SỐ LƯỢNG, không phải boolean — 1 ticket gốc có
  // Volume > 100 bị parser tự tách thành nhiều ticket con CÙNG title (xem
  // parser.splitOversizedTicket). Đếm "thứ tự xuất hiện" của mỗi title trong
  // danh sách (1-based) và so với số lượng THẬT SỰ đã tồn tại trên Blueprint
  // (đọc 1 LẦN DUY NHẤT cho mỗi title, ngay khi gặp lần đầu, để phản ánh
  // đúng trạng thái TRƯỚC batch — không tính luôn ticket vừa tạo trong batch
  // này). Ticket con thứ k chỉ bị skip nếu đã có ÍT NHẤT k ticket cùng title.
  const occurrenceSoFar = new Map();
  const existingCountByTitle = new Map();

  for (let i = 0; i < allTickets.length; i += 1) {
    const ticket = allTickets[i];
    const label = `[${i + 1}/${allTickets.length}] ${ticket.title}`;

    if (ticket.type === 'regular' && !ticket.site) {
      results.skipped.push({ ticket, reason: 'Không xác định được site (RELATED UI rỗng bất thường)' });
      // eslint-disable-next-line no-console
      console.warn(`${label} -> SKIP: thiếu site`);
      continue;
    }

    const occurrenceIndex = (occurrenceSoFar.get(ticket.title) || 0) + 1;
    occurrenceSoFar.set(ticket.title, occurrenceIndex);

    let detailPage = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      if (!existingCountByTitle.has(ticket.title)) {
        // eslint-disable-next-line no-await-in-loop
        existingCountByTitle.set(ticket.title, await blueprint.countExistingTicketsByTitle(page, ticket.title));
      }
      const existingCount = existingCountByTitle.get(ticket.title);
      if (occurrenceIndex <= existingCount) {
        results.skipped.push({ ticket, reason: `Đã tồn tại (idempotency check, bản thứ ${occurrenceIndex}/${existingCount} đã có sẵn)` });
        // eslint-disable-next-line no-console
        console.log(`${label} -> SKIP: đã tồn tại (bản thứ ${occurrenceIndex})`);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await blueprint.openNewTaskForm(page);
      // eslint-disable-next-line no-await-in-loop
      await blueprint.fillNewTaskForm(page, ticket);
      // eslint-disable-next-line no-await-in-loop
      await blueprint.submitNewTask(page);

      // Sau Submit: popup tự đóng, hệ thống tự search ra đúng 1 dòng (ticket
      // vừa tạo) trên `page`. Double-click dòng đó mở trang Detail ở TAB MỚI.
      // eslint-disable-next-line no-await-in-loop
      detailPage = await blueprint.openCreatedTicketInNewTab(page, ticket.title);

      // Thứ tự CỐ Ý: Time Worked trước (Save không đóng popup, có thể bấm New
      // thêm dòng khác), Effort Point sau cùng (theo yêu cầu của Huy — Save ở
      // đây là hành động cuối, popup TỰ ĐỘNG đóng nên không cần đóng tay).
      // eslint-disable-next-line no-await-in-loop
      await blueprint.openJobDetailModal(detailPage);
      // eslint-disable-next-line no-await-in-loop
      await blueprint.addAllTimeWorked(detailPage, ticket.timeWorked);
      // eslint-disable-next-line no-await-in-loop
      await blueprint.addAllEffortPoints(detailPage, ticket.effortPoints);

      // Bước 5 (MỚI): hệ thống tự chia Effort Point cho 4 phase theo tỉ lệ
      // ngày — chỉnh tay lại 100% dồn vào Register theo yêu cầu của Huy.
      // eslint-disable-next-line no-await-in-loop
      await blueprint.setAllEffortPointToRegister(detailPage);

      if (options.statusForAll) {
        // eslint-disable-next-line no-await-in-loop
        await blueprint.setStatus(detailPage, options.statusForAll);
      }

      const url = detailPage.url();
      results.success.push({ ticket, url });
      // eslint-disable-next-line no-console
      console.log(`${label} -> OK (${url})`);
      // eslint-disable-next-line no-await-in-loop
      await detailPage.close();
      detailPage = null;
    } catch (err) {
      // ⚠️ Nếu lỗi xảy ra SAU khi đã mở tab Detail (vd giữa lúc nhập Time
      // Worked/Effort Point), tab đó sẽ bị BỎ QUÊN (không rơi vào nhánh
      // thành công nên không có lệnh close() nào chạy tới) — đã gặp thật:
      // tích luỹ nhiều tab bỏ quên qua nhiều ticket lỗi liên tiếp là nghi
      // phạm chính khiến cả trình duyệt bị crash giữa batch. Luôn dọn tab
      // này trước khi xử lý tiếp, bất kể lỗi gì.
      // ⚠️ Tab Detail đã mở nghĩa là submitNewTask() ĐÃ THÀNH CÔNG — ticket
      // "vỏ rỗng" này đã tồn tại thật trên Blueprint (search theo title thấy
      // ngay) dù chưa có Time Worked/Effort Point. Lưu lại URL TRƯỚC khi đóng
      // tab: countExistingTicketsByTitle() ở lần chạy batch SAU chỉ đếm theo
      // title (không phân biệt ticket đã hoàn tất hay còn dở dang), nên ticket
      // này sẽ bị SKIP NHẦM là "đã tồn tại" nếu chạy lại cả batch — phải dùng
      // scripts/complete-tickets-by-title.js với URL này để hoàn tất tay.
      const partialUrl = detailPage && !detailPage.isClosed() ? detailPage.url() : null;
      if (detailPage && !detailPage.isClosed()) {
        // eslint-disable-next-line no-await-in-loop
        await detailPage.close().catch(() => {});
      }
      results.failed.push({ ticket, error: err.message, partialUrl });
      // eslint-disable-next-line no-console
      console.error(`${label} -> LỖI: ${err.message}`);
      if (partialUrl) {
        // eslint-disable-next-line no-console
        console.error(`   ⚠️ Ticket ĐÃ ĐƯỢC TẠO trên Blueprint (${partialUrl}) nhưng chưa hoàn tất Job Detail — KHÔNG chạy lại batch này để retry (sẽ bị skip nhầm). Dùng scripts/complete-tickets-by-title.js với URL trên.`);
      }
      if (err.name === 'NotImplementedError') {
        // Selector chưa sẵn sàng -> dừng cả batch ngay, không có ý nghĩa chạy tiếp.
        throw err;
      }
      if (page.isClosed()) {
        // Trình duyệt/tab chính đã chết hẳn — không còn gì để phục hồi, dừng
        // cả batch luôn thay vì để TOÀN BỘ ticket còn lại lỗi dây chuyền vô
        // nghĩa (đã gặp thật: 1 lần crash làm 20+ ticket sau đó lỗi liên tiếp).
        // eslint-disable-next-line no-console
        console.error('Trình duyệt/tab chính đã bị đóng — dừng batch tại đây.');
        break;
      }
      // Dọn lại trạng thái sạch trước khi sang ticket kế tiếp: 1 lỗi giữa
      // chừng (vd RELATED UI không tìm thấy site) có thể để lại modal New
      // Task còn mở/kẹt (`webix_modal` che hết click), làm ticket kế tiếp
      // cũng lỗi theo dù bản thân nó không có vấn đề gì. Quay lại thẳng
      // trang Requirement (bỏ qua modal kẹt).
      // ⚠️ KHÔNG được nuốt lỗi ở chính bước phục hồi này (trước đây
      // `.catch(()=>{})` im lặng bỏ qua) — nếu chọn lại Project/Category thất
      // bại giữa chừng, các ticket SAU ĐÓ sẽ ghi PIC/Effort Point vào SAI vị
      // trí phase (vì các hàm này chọn theo VỊ TRÍ, không theo tên) mà không
      // hề báo lỗi, coi như "thành công". Tiếp tục chạy trong trạng thái
      // không chắc chắn còn nguy hiểm hơn dừng hẳn batch.
      try {
        // eslint-disable-next-line no-await-in-loop
        await blueprint.gotoRequirementList(page);
        // eslint-disable-next-line no-await-in-loop
        await blueprint.selectProjectAndCategory(page);
      } catch (recoveryErr) {
        // eslint-disable-next-line no-console
        console.error(`Không phục hồi được trạng thái sạch sau lỗi (${recoveryErr.message}) — dừng batch tại đây để tránh ghi sai dữ liệu cho các ticket sau.`);
        break;
      }
    }
  }

  return results;
}

function printSummary(results) {
  // eslint-disable-next-line no-console
  console.log('\n===== TỔNG KẾT =====');
  // eslint-disable-next-line no-console
  console.log(`Thành công: ${results.success.length}`);
  results.success.forEach((r) => console.log(`  - ${r.ticket.title} -> ${r.url}`));
  // eslint-disable-next-line no-console
  console.log(`Bỏ qua: ${results.skipped.length}`);
  results.skipped.forEach((r) => console.log(`  - ${r.ticket.title} (${r.reason})`));
  // eslint-disable-next-line no-console
  console.log(`Lỗi: ${results.failed.length}`);
  results.failed.forEach((r) => {
    console.log(`  - ${r.ticket.title}: ${r.error}`);
    if (r.partialUrl) {
      console.log(`      ⚠️ ĐÃ TẠO trên Blueprint nhưng CHƯA hoàn tất Job Detail: ${r.partialUrl}`);
      console.log('      KHÔNG chạy lại batch này cho ticket trên (sẽ bị skip nhầm vì idempotency chỉ check theo title) — dùng scripts/complete-tickets-by-title.js.');
    }
  });
}

module.exports = { runBatch, printSummary };
