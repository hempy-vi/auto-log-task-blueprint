@echo off
if "%~1"=="/HIDDEN" goto :body

rem Chuyen sang chay AN HOAN TOAN (khong cua so, khong icon taskbar) qua
rem run-hidden.vbs cung thu muc - cua so hien tai thoat ngay lap tuc. Toan bo
rem tuong tac xem truoc/xac nhan/bao cao gio nam TRONG trinh duyet (xem
rem index.js + src/report.js), khong con can console de go Y/N nua.
wscript.exe "%~dp0run-hidden.vbs" %*
exit /b

:body
rem Chay AN thuc su (goi lai qua run-hidden.vbs, tham so dau la "/HIDDEN").
rem Khong can truyen duong dan file/thang gi nua - trang xem truoc tu quet
rem het work-reports/*_monthly-report.md va cho chon Nam/Thang ngay trong
rem trinh duyet (xem index.js + src/report.js). Loi (vd khong tim thay file
rem nao) se duoc ghi vao logs\run-last.log thay vi hien ra console (khong
rem con console nao de hien ca).
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
if not exist logs mkdir logs
node index.js > logs\run-last.log 2>&1
