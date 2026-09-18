@echo off
setlocal

if "%~1"=="/HIDDEN" goto :hidden

if "%~1"=="" (
  echo Cach dung: run.bat "duong-dan-file-report.md"
  echo Vi du:     run.bat monthly-report\202609_monthly-report.md
  echo Chay AN ^(khong cua so, khong dry-run/xac nhan^): wscript run-hidden.vbs "duong-dan-file-report.md"
  pause
  exit /b 1
)

rem lay duong dan tuyet doi TRUOC khi doi thu muc, de van dung neu ban
rem go duong dan tuong doi theo thu muc dang dung, khong phai thu muc chua .bat
set "REPORT=%~f1"
cd /d "%~dp0"

echo ===============================================
echo   Buoc 1: Dry-run (khong mo trinh duyet, chi kiem tra du lieu)
echo ===============================================
node index.js --dry-run --report "%REPORT%"
if errorlevel 1 (
  echo.
  echo Dry-run bao loi - dung lai, KHONG chay that.
  pause
  exit /b 1
)

echo.
set /p CONFIRM=Du lieu tren da dung chua? Go Y roi Enter de chay THAT (mo trinh duyet, tao ticket that tren Blueprint):
if /i not "%CONFIRM%"=="Y" (
  echo Da huy, khong chay that.
  pause
  exit /b 0
)

echo.
echo ===============================================
echo   Buoc 2: Chay that
echo ===============================================
node index.js --report "%REPORT%"
if errorlevel 1 (
  echo.
  echo ================================================================
  echo   CHAY THAT BI LOI GIUA CHUNG - DOC KY LOG PHIA TREN
  echo   Co the co ticket da tao tren Blueprint nhung chua hoan tat.
  echo   KHONG chay lai file nay ngay - kiem tra tung dong loi/canh bao
  echo   phia tren (nhat la dong co chu "Da tao" "chua hoan tat").
  echo ================================================================
  pause
  exit /b 1
)

echo.
echo Da chay xong - bao cao chi tiet da tu mo trong trinh duyet cua Playwright.
echo Cua so nay se tu dong dong khi ban dong trinh duyet do.
exit /b 0

:hidden
rem Chay AN (goi lai qua run-hidden.vbs) - BAT BUOC da tu dry-run/kiem tra du
rem lieu truoc do, vi che do an khong co console de xem/go Y. "shift" lam
rem doi ca %0 (kiem chung thuc te) - phai luu %~dp0 vao bien TRUOC khi shift.
set "SCRIPT_DIR=%~dp0"
shift
if "%~1"=="" (
  cd /d "%SCRIPT_DIR%"
  if not exist logs mkdir logs
  echo Thieu duong dan file report - huy, khong chay gi ca. > logs\run-last.log
  exit /b 1
)
set "REPORT=%~f1"
cd /d "%SCRIPT_DIR%"
if not exist logs mkdir logs
node index.js --report "%REPORT%" > logs\run-last.log 2>&1
