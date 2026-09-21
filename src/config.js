// Cấu hình nghiệp vụ cố định — tham khảo WORKFLOW.md mục 1.

// Tên đầy đủ người ĐANG DÙNG tool — mặc định "Huy Quoc Nguyen" (máy hiện
// tại). Đổi bằng cách set biến môi trường BLUEPRINT_FULL_NAME trong .env,
// không cần sửa config.js.
const CURRENT_USER_FULL_NAME = process.env.BLUEPRINT_FULL_NAME || 'Huy Quoc Nguyen';

const PHASE_PIC = {
  register: CURRENT_USER_FULL_NAME, // luôn là chính user đang thao tác, script không cần set
  // Confirmation luôn là dev lead "Giau Doan" cho MỌI site (thay bảng BC
  // phụ trách theo từng site trước đây).
  confirmation: 'Giau Doan',
  solving: CURRENT_USER_FULL_NAME,
  finish: 'Phu Le',
};

// Vị trí (1-based) của mỗi phase trong panel Phase/PIC — ĐÃ XÁC NHẬN qua
// video là có đúng 4 phase theo thứ tự này khi ở project "ERP Maintenance" >
// "Logistics". Cần đối chiếu lại ở lần chạy thật đầu tiên (xem selectors.js
// phaseList) vì tên/số lượng phase phụ thuộc project đang chọn.
const PHASE_INDEX = {
  register: 1,
  confirmation: 2,
  solving: 3,
  finish: 4,
};

// Hằng số áp dụng cho MỌI ticket (kể cả ticket đặc biệt) — WORKFLOW.md mục 1.
const CONSTANTS = {
  process: 'Reporting',
  iteration: 'Development',
  important: 'Normal',
  phaseNameForTimeWorked: 'Register',
  // Vào thẳng auth.cyberlogitec.com.vn chỉ ra trang "Welcome to Keycloak"
  // chung, không có form login. Phải vào app Blueprint để nó tự redirect
  // sang đúng form login (OIDC) — theo xác nhận của Huy.
  loginUrl: 'https://blueprint.cyberlogitec.com.vn',
  requirementListUrl: 'https://blueprint.cyberlogitec.com.vn/UI_PIM_001',

  // ⚠️ ĐÃ XÁC NHẬN (2026-08-29): trang Requirement có 4 project khả dụng
  // (CAPA Management/ERP Maintenance/Factory Maintenance/WorkFlow); project
  // ĐANG CHỌN quyết định cả luồng Phase (CAPA Management có 6 phase, khác
  // hẳn 4 phase Register/Confirmation/Solving/Finish mà WORKFLOW.md dựa
  // vào). Phải chủ động chọn đúng "ERP Maintenance" > "Logistics" trước khi
  // tạo task — không để mặc định vì có thể đang là project khác.
  projectName: 'ERP Maintenance',
  categoryTreeName: 'Logistics',

  // ⚠️ Theo yêu cầu của Huy (2026-08-29): 1 ticket KHÔNG được vượt quá Volume
  // 100 (lý do nghiệp vụ phía Blueprint, KHÔNG phải lỗi tool phát hiện — khi
  // test tự động nhập Volume=217 cho "P290 Import BOM from Excel", hệ thống
  // vẫn nhận bình thường, không báo lỗi gì). Ticket nào vượt mức này bị
  // parser.splitOversizedTicket() tự tách thành nhiều ticket con cùng title.
  maxVolumePerTicket: 100,
};

// ⚠️ ĐÃ XÁC NHẬN THẬT (2026-09-21): tên "Related UI" dùng trong từ điển
// /daily-report + /monthly-report đôi khi KHÁC với "Program Name" thật đăng
// ký trên Blueprint — popup "Related UI" search theo Program Name, không
// nhận diện được tên viết tắt trong từ điển báo cáo, trả về 0 kết quả dù đã
// chờ đủ lâu (không phải lỗi timing). Map ở đây để tra cứu tên THẬT trước khi
// gõ vào ô search — chỉ ảnh hưởng bước chọn Related UI, KHÔNG đổi tên hiển
// thị "LGL WMS" ở bất kỳ đâu khác (báo cáo, Detail...).
const SITE_NAME_ALIASES = {
  'LGL WMS': 'Lotte Global Logistics', // Program Code LGLV, xác nhận qua ảnh chụp popup thật
};

/** Trả về Program Name THẬT trên Blueprint cho 1 site trong từ điển báo cáo — nguyên văn nếu không có alias. */
function resolveSiteProgramName(site) {
  return SITE_NAME_ALIASES[site] || site;
}

/** Đọc username/password từ process.env (nạp qua src/loadEnv.js từ file .env). */
function getCredentials() {
  const username = process.env.BLUEPRINT_USERNAME;
  const password = process.env.BLUEPRINT_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'Thiếu BLUEPRINT_USERNAME/BLUEPRINT_PASSWORD. Tạo file .env (xem .env.example) ở thư mục gốc project.'
    );
  }
  return { username, password };
}

module.exports = {
  PHASE_PIC,
  PHASE_INDEX,
  CONSTANTS,
  getCredentials,
  resolveSiteProgramName,
};
