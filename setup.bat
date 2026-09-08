@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo   Setup auto-log-task-blueprint
echo ===============================================

where node >nul 2>nul
if errorlevel 1 (
  echo Chua tim thay Node.js - dang thu cai tu dong bang winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo [Loi] May nay khong co winget. Cai Node.js thu cong tai https://nodejs.org roi chay lai file nay.
    pause
    exit /b 1
  )

  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo [Loi] Cai Node.js qua winget that bai. Cai thu cong tai https://nodejs.org roi chay lai file nay.
    pause
    exit /b 1
  )

  rem winget vua cai xong nhung cua so nay chua nhan PATH moi - tu them thu muc cai mac dinh
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 (
    echo Da cai Node.js xong nhung cua so nay chua nhan duoc PATH moi.
    echo Dong cua so nay, mo Command Prompt moi roi chay lai setup.bat.
    pause
    exit /b 1
  )
  echo Da cai Node.js thanh cong.
)

call npm install
if errorlevel 1 (
  echo [Loi] npm install that bai.
  pause
  exit /b 1
)

call npx playwright install chromium
if errorlevel 1 (
  echo [Loi] Cai Chromium cho Playwright that bai.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo.
    echo Da tao file .env tu .env.example.
    echo MO FILE .env VA DIEN username/password Blueprint that truoc khi chay run.bat.
  )
) else (
  echo File .env da ton tai - khong ghi de.
)

echo.
echo Setup xong. Dung run.bat "duong-dan-file-report.md" de chay.
pause
