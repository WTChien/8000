#!/bin/bash

echo "=========================================="
echo "FundThePitch - 專題模擬投資評分系統"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if backend and frontend directories exist
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ 錯誤：請確保在專案根目錄運行此腳本"
    exit 1
fi

echo -e "${BLUE}開始啟動 FundThePitch...${NC}"
echo ""

# Start backend
echo -e "${GREEN}1️⃣ 啟動後端服務器...${NC}"
cd backend
if ! command -v python3 &> /dev/null; then
    echo "❌ 錯誤：找不到 Python3，請確保已安裝 Python"
    exit 1
fi

python3 main.py &
BACKEND_PID=$!
echo -e "${GREEN}✅ 後端服務器啟動 (PID: $BACKEND_PID)${NC}"
echo "   URL: http://localhost:8000"
echo "   API 文檔: http://localhost:8000/docs"
sleep 2
cd ..
echo ""

# Start frontend
echo -e "${GREEN}2️⃣ 啟動前端應用...${NC}"
cd frontend
if ! command -v npm &> /dev/null; then
    echo "❌ 錯誤：找不到 npm，請確保已安裝 Node.js"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "   首次運行，正在安裝依賴..."
    npm install
fi

npm start &
FRONTEND_PID=$!
echo -e "${GREEN}✅ 前端應用啟動${NC}"
echo "   URL: http://localhost:3000"
sleep 2
cd ..
echo ""

echo -e "${GREEN}=========================================="
echo "✨ 系統已成功啟動！${NC}"
echo "=========================================="
echo ""
echo "📍 前端地址: http://localhost:3000"
echo "📍 後端地址: http://localhost:8000"
echo "📍 API 文檔: http://localhost:8000/docs"
echo ""
echo "⌨️  按 Ctrl+C 停止所有服務"
echo ""

# Wait for all background processes
wait
