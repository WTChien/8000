@echo off
setlocal enabledelayedexpansion
for /f "tokens=2 delims=:." %%i in ('chcp') do set "_oldcp=%%i"
chcp 65001 >nul

echo.
echo ==========================================
echo FundThePitch - 專題模擬投資評分系統
echo ==========================================
echo.

REM Check if directories exist
if not exist backend (
    echo [ERROR] 找不到 backend 目錄
    pause
    exit /b 1
)

if not exist frontend (
    echo [ERROR] 找不到 frontend 目錄
    pause
    exit /b 1
)

echo 開始啟動 FundThePitch...
echo.

REM Create logs directory
if not exist logs mkdir logs

REM Start backend
echo [1/2] 啟動後端服務器（背景執行）...
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 缺少 Python 套件 fastapi
    echo         請先執行: python -m pip install -r requirements.txt
    if defined _oldcp chcp %_oldcp% >nul
    pause
    exit /b 1
)

start /b python backend\main.py > logs\backend.log 2>&1
echo [OK] 後端服務器啟動
echo    URL: http://localhost:9000
echo    API 文檔: http://localhost:9000/docs
echo.

REM Start frontend
echo [2/2] 啟動前端應用（背景執行）...
if not exist frontend\node_modules (
    echo    首次運行，正在安裝依賴...
    cd frontend
    call npm install
    cd ..
)
start /b cmd /c "cd /d %~dp0frontend && npm start > ..\logs\frontend.log 2>&1"

echo.
echo ==========================================
echo [OK] 系統已成功啟動！
echo ==========================================
echo.
echo Frontend: http://localhost:3000
echo Backend : http://localhost:9000
echo API Docs: http://localhost:9000/docs
echo.
if defined _oldcp chcp %_oldcp% >nul
pause
