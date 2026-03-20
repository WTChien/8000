@echo off
REM FundThePitch 自動化測試運行腳本 (Windows)
REM 用法: run_test.bat [API_BASE_URL]

setlocal enabledelayedexpansion

REM 檢查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 錯誤: 未找到 Python
    echo 請先安裝 Python 3.8 或更新版本
    exit /b 1
)

REM 檢查虛擬環境
if not exist ".venv" (
    echo ❌ 錯誤: 虛擬環境不存在
    echo 請先運行: python -m venv .venv
    exit /b 1
)

REM 激活虛擬環境
call .venv\Scripts\activate.bat

REM 安裝依賴
echo 📦 安裝依賴...
pip install -q requests colorama

REM 設定 API 基礎 URL
if "%1"=="" (
    set "API_BASE_URL=http://localhost:8000"
) else (
    set "API_BASE_URL=%1"
)

if "%ADMIN_DISPLAY_NAME%"=="" (
    set "ADMIN_DISPLAY_NAME=管理員"
)

echo 🚀 啟動自動化測試
echo 📍 API 基礎 URL: !API_BASE_URL!
echo 👤 管理員姓名: !ADMIN_DISPLAY_NAME!
echo.

REM 運行測試
set "API_BASE_URL=!API_BASE_URL!"
python test_automation.py

endlocal
