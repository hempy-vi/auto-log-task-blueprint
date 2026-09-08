@echo off
setlocal

if "%~1"=="" (
  echo Cach dung: run.bat "duong-dan-file-report.md"
  echo Vi du:     run.bat monthly-report\202609_monthly-report.md
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
echo Da chay xong - kiem tra lai bang tong ket phia tren (danh sach OK/SKIP/loi).
pause
