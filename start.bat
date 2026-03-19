@echo off
setlocal enabledelayedexpansion

echo.
echo ==========================================
echo FundThePitch - 專題模擬投資評分系統
echo ==========================================
echo.

REM Check if directories exist
if not exist backend (
    echo ❌ 錯誤：找不到 backend 目錄
    pause
    exit /b 1
)

if not exist frontend (
    echo ❌ 錯誤：找不到 frontend 目錄
    pause
    exit /b 1
)

echo 開始啟動 FundThePitch...
echo.

REM Start backend
echo 1️⃣ 啟動後端服務器...
cd backend
python main.py
if errorlevel 1 (
    echo ❌ 錯誤：無法啟動後端，請檢查 Python 安裝
    pause
    exit /b 1
)
echo ✅ 後端服務器啟動
echo    URL: http://localhost:8000
echo    API 文檔: http://localhost:8000/docs
cd ..
echo.

REM Start frontend in a new window
echo 2️⃣ 啟動前端應用...
cd frontend
if not exist node_modules (
    echo    首次運行，正在安裝依賴...
    call npm install
)
start cmd /k npm start
cd ..

echo.
echo ==========================================
echo ✨ 系統已成功啟動！
echo ==========================================
echo.
echo 📍 前端地址: http://localhost:3000
echo 📍 後端地址: http://localhost:8000
echo 📍 API 文檔: http://localhost:8000/docs
echo.
pause
