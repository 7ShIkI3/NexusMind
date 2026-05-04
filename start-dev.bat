@echo off
:: NexusMind - Quick development start script for Windows
title NexusMind

echo.
echo  [NexusMind] Starting...
echo.

set "REPO_DIR=%~dp0"
set "REPO_DIR=%REPO_DIR:~0,-1%"

:: Check python
python --version >nul 2>&1
if errorlevel 1 (
  python3 --version >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Python not found. Run install.bat first.
    pause
    exit /b 1
  )
  set "PYTHON=python3"
) else (
  set "PYTHON=python"
)

:: Check node
node --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Run install.bat first.
  pause
  exit /b 1
)

cd /d "%REPO_DIR%\backend"

if not exist "venv\" (
  echo [INFO] Virtual environment not found. Run install.bat first.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo [INFO] Created backend\.env from template. Edit it to configure AI providers.
  )
)

if not exist "data\" mkdir data
if not exist "extensions\installed\" mkdir extensions\installed

echo [INFO] Starting backend on http://localhost:8000 ...
start "NexusMind Backend" cmd /k "cd /d "%REPO_DIR%\backend" && call venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 >nul

cd /d "%REPO_DIR%\frontend"
echo [INFO] Starting frontend on http://localhost:3000 ...
start "NexusMind Frontend" cmd /k "cd /d "%REPO_DIR%\frontend" && npm run dev"

echo.
echo  [OK] NexusMind is starting!
echo.
echo       Frontend:  http://localhost:3000
echo       Backend:   http://localhost:8000
echo       API Docs:  http://localhost:8000/docs
echo.
echo  Close this window or the terminal windows to stop NexusMind.
echo.
pause
