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
rem Khong truyen duong dan file -> de trong REPORT, node se tu doc MONTH
rem trong .env de suy ra file; loi (thieu ca --report lan MONTH, parse loi...)
rem se duoc ghi vao logs\run-last.log thay vi hien ra console (khong con
rem console nao de hien ca).
set "SCRIPT_DIR=%~dp0"
set "REPORT="
if not "%~2"=="" set "REPORT=%~f2"
cd /d "%SCRIPT_DIR%"
if not exist logs mkdir logs
if "%REPORT%"=="" (
  node index.js > logs\run-last.log 2>&1
) else (
  node index.js --report "%REPORT%" > logs\run-last.log 2>&1
)
