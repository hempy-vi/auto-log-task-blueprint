// Đọc file .env (KEY=VALUE mỗi dòng) và nạp vào process.env — không ghi đè
// biến môi trường đã có sẵn. Không dùng package ngoài để giữ dependency gọn.
const fs = require('fs');
const path = require('path');

function loadEnv(envPath = path.resolve(__dirname, '..', '.env')) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  });
}

module.exports = { loadEnv };
