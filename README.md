# FundThePitch - 專題模擬投資評分系統

> 一個用於畢業專題成果發表的互動評分投資系統

## 📋 專案概述

**FundThePitch** 是一個完整的投資評分系統，評審會將固定預算（10,000 元）投資給各組專題。系統提供：

- **評審投資介面 (Judge UI)**：評審分配預算、進行投資決策
- **現場儀表板 (Dashboard)**：大螢幕實時顯示投資分配的動態長條圖

## 🏗️ 技術架構

### 前端
- **框架**：React.js 18.2.0
- **狀態管理**：React Hooks (useState, useEffect)
- **圖表庫**：Recharts
- **HTTP 客戶端**：Axios
- **樣式**：標準 CSS (無 Tailwind CSS)

### 後端
- **框架**：FastAPI
- **伺服器**：Uvicorn
- **資料庫**：Mock Data（設計為 NoSQL 結構，便於未來遷移至 Google Cloud Firestore）

## 📁 專案結構

```
8000/
├── backend/
│   └── main.py              # FastAPI 應用程式
├── frontend/
│   ├── public/
│   │   └── index.html       # HTML 入口
│   ├── src/
│   │   ├── components/
│   │   │   ├── JudgeUI.tsx   # 評審投資介面
│   │   │   └── Dashboard.tsx # 現場儀表板
│   │   ├── styles/
│   │   │   └── App.css      # 全域樣式
│   │   ├── App.tsx          # 主應用元件
│   │   └── index.tsx        # React 進入點
│   └── package.json         # 前端依賴
├── README.md                # 專案說明
└── requirements.txt         # Python 依賴 (可選)
```

## 🚀 快速開始

### 前置條件
- Node.js >= 14.0
- Python >= 3.8
- npm 或 yarn

### 後端設定

1. **安裝 Python 依賴**
```bash
cd 8000
pip install fastapi uvicorn python-multipart
```

2. **運行 FastAPI 伺服器**
```bash
python backend/main.py
```

伺服器將在 `http://localhost:8000` 啟動。
API 文檔可訪問：`http://localhost:8000/docs`

### 前端設定

1. **安裝 Node 依賴**
```bash
cd frontend
npm install
```

2. **設定 API 端點** (可選)

編輯 `frontend/src/components/JudgeUI.tsx` 和 `Dashboard.tsx`，修改 API_BASE_URL：
```javascript
const API_BASE_URL = 'http://localhost:8000';  // 或您的伺服器地址
```

3. **運行前端開發伺服器**
```bash
npm start
```

應用將在 `http://localhost:3000` 打開。

## 📡 API 文檔

### 1. GET `/api/projects`
**功能**：取得所有專題列表與當前投資金額

**回應**：
```json
{
  "projects": [
    {
      "id": "proj_001",
      "name": "AI聊天機器人",
      "total_investment": 2500
    }
  ],
  "total_budget": 10000,
  "remaining_budget": 5000
```
  ## 🤖 自動化測試

  完整的自動化測試腳本可驗證整個業務流程：

  ```bash
  # macOS / Linux
  ./run_test.sh

  # Windows
  run_test.bat
  ```

  腳本會自動執行：
  - ✓ 啟動場次
  - ✓ 創建會場
  - ✓ 添加評審成員
  - ✓ 評審加入會場
  - ✓ 模擬投資決策
  - ✓ 查看投資結果
  - ✓ 關閉場次並生成摘要

  預設會使用姓名「管理員」登入管理員權限。詳細信息見 [TEST_AUTOMATION.md](TEST_AUTOMATION.md)

  ---

### 2. POST `/api/submit_investment`
**功能**：提交投資分配

**請求**：
```json
{
  "investments": {
    "proj_001": 2500,
    "proj_002": 2500,
    "proj_003": 2500,
    "proj_004": 2500
  },
  "judge_id": "judge_001"
}
```

**驗證規則**：
- ✅ 總投資金額必須等於 **10,000 元**
- ✅ 每個專題的投資金額必須 **> 0**
- ✅ 必須對 **所有專題** 進行投資

**成功回應**：
```json
{
  "success": true,
  "message": "投資分配成功！",
  "updated_projects": [ ... ]
}
```

**失敗回應**：
```json
{
  "detail": "投資總額必須等於 10000 元，目前為 9000 元"
}
```

### 3. GET `/api/judges`
**功能**：取得評審列表與投票狀態

### 4. GET `/`
**功能**：API 根端點與說明

## 🎨 前端功能特性

### 評審投資介面 (Judge UI)
- 📊 **預算分配**：使用滑桿和數字輸入框
- ✅ **即時驗證**：顯示剩餘預算，無效提交被禁用
- 🎯 **評審選擇**：下拉菜單選擇評審身份
- 📈 **預算摘要**：實時顯示已分配、剩餘及上限金額

### 現場儀表板 (Dashboard)
- 📊 **動態長條圖**：使用 Recharts 展示投資分配
- 🔄 **自動輪詢**：每 2 秒自動更新數據
- 🎨 **平滑動畫**：圖表更新時的過場效果
- 📋 **詳細清單**：表格顯示各專題投資分配
- 📈 **實時統計**：顯示總投資、投資專題數、最後更新時間

### 管理員面板
- 👥 **成員管理**：按會場分組顯示成員，點擊開啟詳細資料 modal
- ✏️ **成員編輯**：Modal 中支持修改成員資料（姓名、郵件、角色、會場分配）
- 📊 **場次管理**：場次運行中自動隱藏「啟動場次」按鈕
- 📋 **投資排名**：封存戰況中顯示全部專題投資金額排名，附帶會場標籤
- 🔐 **身份驗證**：Admin、Judge、Manager 等角色權限管理

## 🔄 數據流程

```
評審 → JudgeUI 表單 → POST /api/submit_investment → Backend 驗證 & 更新
                                                        ↓
                                              Mock Data 更新
                                                        ↓
Dashboard (polling 每 2 秒) ← GET /api/projects ← 取得最新數據
```

## 🛠️ Mock Data 設計

Mock Data 採用 NoSQL Document 結構設計，便於未來無縫遷移至 Google Cloud Firestore：

```python
# Projects Collection
projects = [
    {
        "id": "proj_001",
        "name": "AI聊天機器人",
        "total_investment": 0
    }
]

# Judges Collection
judges = [
    {
        "id": "judge_001",
        "name": "評審 A",
        "is_voted": False
    }
]
```

未來只需將記憶體中的數據持久化到 Firestore，無需更改 API 邏輯。

## 🎯 業務邏輯

### 投資分配規則
1. 每位評審擁有 **10,000 元** 的固定預算
2. 每個專題 **必須** 獲得投資（投資金額 > 0）
3. 預算必須 **完全分配**（總和 = 10,000）
4. 無法分配到超過預算的金額

### 驗證流程
- 前端：在 UI 中即時驗證，提供使用者反饋
- 後端：在 API 層驗證，確保資料完整性

## 📱 響應式設計

應用支援響應式設計，適配以下設備：
- 🖥️ 桌上型電腦（1920px+）
- 💻 平板（768px - 1024px）
- 📱 手機（480px - 768px）

## 🔮 未來擴展方案

### 資料庫集成 (Google Cloud Firestore)
```python
from firebase_admin import firestore

db = firestore.client()
projects_ref = db.collection('projects')
judges_ref = db.collection('judges')

# 無需改變 API，直接替換數據層
```

### 實時監聽 (WebSocket)
```javascript
// 替代每 2 秒 polling 的方案
const unsubscribe = db.collection('projects')
  .onSnapshot(snapshot => {
    // 更新圖表數據
  });
```

### 身份驗證
- Firebase Authentication
- JWT token 驗證
- 角色權限管理

## 📋 環境變數

創建 `.env` 文件（可選）：
```env
REACT_APP_API_URL=http://localhost:8000
```

## 🧪 測試 API

使用 cURL 測試：
```bash
# 獲取專題列表
curl http://localhost:8000/api/projects

# 提交投資
curl -X POST http://localhost:8000/api/submit_investment \
  -H "Content-Type: application/json" \
  -d '{
    "investments": {"proj_001": 2500, "proj_002": 2500, "proj_003": 2500, "proj_004": 2500},
    "judge_id": "judge_001"
  }'
```

## 📙 使用 FastAPI 自動文檔

訪問 `http://localhost:8000/docs` 使用 Swagger UI 測試所有 API。

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

MIT License

---

**系統名稱**：FundThePitch  
**版本**：1.0.0  
**最後更新**：2026 年 3 月