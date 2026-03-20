#!/bin/bash

# FundThePitch 自動化測試運行腳本
# 用法: ./run_test.sh [API_BASE_URL]

set -e

# 檢查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 錯誤: 未找到 Python 3"
    echo "請先安裝 Python 3.8 或更新版本"
    exit 1
fi

# 檢查虛擬環境
if [ ! -d ".venv" ]; then
    echo "❌ 錯誤: 虛擬環境不存在"
    echo "請先運行: python3 -m venv .venv"
    exit 1
fi

# 激活虛擬環境
source .venv/bin/activate

# 安裝依賴
echo "📦 安裝依賴..."
pip install -q requests colorama

# 設定 API 基礎 URL
API_BASE_URL="${1:-http://localhost:8000}"

if [[ -z "${ADMIN_DISPLAY_NAME:-}" ]]; then
    export ADMIN_DISPLAY_NAME="管理員"
fi

echo "🚀 啟動自動化測試"
echo "📍 API 基礎 URL: $API_BASE_URL"
echo "👤 管理員姓名: $ADMIN_DISPLAY_NAME"
echo ""

# 運行測試
API_BASE_URL="$API_BASE_URL" python3 test_automation.py

exit $?
