@echo off
setlocal

if "%~1"=="/HIDDEN" goto :hidden

rem Khong truyen tham so -> de trong REPORT, node index.js se tu doc MONTH
rem trong .env va suy ra monthly-report\<MONTH>_monthly-report.md. Neu MONTH
rem cung khong co, node se bao loi ro rang o buoc dry-run ngay ben duoi.
rem lay duong dan tuyet doi TRUOC khi doi thu muc, de van dung neu ban
rem go duong dan tuong doi theo thu muc dang dung, khong phai thu muc chua .bat
set "REPORT="
if not "%~1"=="" set "REPORT=%~f1"
cd /d "%~dp0"

echo ===============================================
echo   Buoc 1: Dry-run (khong mo trinh duyet, chi kiem tra du lieu)
echo ===============================================
if "%REPORT%"=="" (
  echo ^(Khong truyen duong dan file - tu dong dung MONTH trong .env^)
  node index.js --dry-run
) else (
  node index.js --dry-run --report "%REPORT%"
)
if errorlevel 1 (
  echo.
  echo Dry-run bao loi - dung lai, KHONG chay that.
  echo Cach dung: run.bat "duong-dan-file-report.md"
  echo Hoac: dat MONTH=202609 ^(vi du^) trong .env roi chay run.bat khong can tham so.
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
if "%REPORT%"=="" (
  node index.js
) else (
  node index.js --report "%REPORT%"
)
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
rem Khong truyen path -> de trong REPORT, node se tu doc MONTH trong .env; neu
rem MONTH cung khong co thi loi se duoc ghi vao logs\run-last.log nhu binh thuong.
set "SCRIPT_DIR=%~dp0"
shift
set "REPORT="
if not "%~1"=="" set "REPORT=%~f1"
cd /d "%SCRIPT_DIR%"
if not exist logs mkdir logs
if "%REPORT%"=="" (
  node index.js > logs\run-last.log 2>&1
) else (
  node index.js --report "%REPORT%" > logs\run-last.log 2>&1
)
