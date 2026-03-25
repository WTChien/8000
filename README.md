# FundThePitch - 專題模擬投資評分系統

> 一個用於畢業專題成果發表的互動評分投資系統

## 📋 專案概述

**FundThePitch** 是一個完整的投資評分系統，評審會將固定預算（10,000 元）投資給各組專題。系統提供：

- **Lobby 大廳**：評審登入、選擇會場並加入
- **評審投資介面 (Judge UI)**：評審分配預算、暫存草稿或鎖定提交
- **現場儀表板 (Dashboard)**：大螢幕實時顯示各會場投資動態，支援「頒獎典禮」逐一揭曉排名的簡報模式
- **管理員面板 (Admin)**：管理場次、會場、評審成員、查詢歷史封存資料

## 🏗️ 技術架構

### 前端
- **框架**：React 18.2.0 + **TypeScript**
- **狀態管理**：React Hooks (useState, useEffect, useCallback, useMemo)
- **圖表庫**：Recharts 2.10.0
- **HTTP 客戶端**：Axios 1.6.0
- **樣式**：標準 CSS（無 Tailwind CSS）

### 後端
- **框架**：FastAPI 0.104.1
- **伺服器**：Uvicorn 0.24.0
- **資料庫**：Google Cloud Firestore（透過 firebase-admin 6.6.0）
- **驗證**：JWT Bearer Token（自行管理 session），角色分為 `admin` / `judge`

## 📁 專案結構

```
8000/
├── backend/
│   ├── main.py              # FastAPI 應用程式（所有路由與業務邏輯）
│   ├── firestore_db.py      # Firestore 資料庫封裝層
│   └── keys/
│       └── fundthepitch-firebase-adminsdk-*.json  # Firebase 服務帳戶金鑰
├── frontend/
│   ├── public/
│   │   └── index.html       # HTML 入口
│   ├── src/
│   │   ├── components/
│   │   │   ├── JudgeUI.tsx  # 評審投資介面（草稿暫存 + 鎖定提交）
│   │   │   └── Dashboard.tsx# 現場儀表板（投資比較圖 + 簡報模式）
│   │   ├── styles/
│   │   │   └── App.css      # 全域樣式
│   │   ├── App.tsx          # 主應用元件（路由、Auth、Admin 面板）
│   │   └── index.tsx        # React 進入點
│   └── package.json
├── requirements.txt         # Python 依賴
├── test_automation.py       # 完整業務流程自動化測試
├── run_test.sh / run_test.bat
└── start.sh / start.bat     # 一鍵啟動腳本
```

## 🚀 快速開始

### 前置條件
- Node.js >= 14.0
- Python >= 3.8
- Firebase 服務帳戶金鑰（`backend/keys/` 目錄下的 `.json` 檔）

### 後端設定

1. **安裝 Python 依賴**
```bash
pip install -r requirements.txt
```

2. **確認 Firebase 金鑰**

確保 `backend/keys/fundthepitch-firebase-adminsdk-*.json` 存在。
若要停用 Firestore（純記憶體模式），可設定：
```bash
export USE_FIRESTORE=false
```

3. **運行 FastAPI 伺服器**
```bash
python backend/main.py
# 或
uvicorn backend.main:app --reload --port 8000
```

伺服器將在 `http://localhost:8000` 啟動。
API 文檔：`http://localhost:8000/docs`

### 前端設定

1. **安裝 Node 依賴**
```bash
cd frontend && npm install
```

2. **設定 API 端點**（可選）

在 `frontend/.env` 中設定（預設為 `http://localhost:8000`）：
```
REACT_APP_API_URL=http://localhost:8000
```

3. **開發模式**
```bash
npm start   # 開發伺服器 http://localhost:3000
```

4. **正式建置**
```bash
npm run build   # 靜態檔案輸出至 frontend/build/
```

## 📡 主要 API 端點

### 認證
| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/judges/login` | 以姓名登入（judge / admin）|
| POST | `/api/auth/login` | 以識別碼（email/phone）登入 |
| POST | `/api/auth/request-verification` | 請求 OTP 驗證碼 |
| POST | `/api/auth/verify` | 驗證 OTP 並取得 Token |
| POST | `/api/auth/logout` | 登出（撤銷 Token）|
| GET  | `/api/auth/me` | 取得目前登入使用者資訊 |

### 評審操作
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/judges/status` | 取得評審狀態（會場、是否已鎖定）|
| GET  | `/api/judges/my-investment` | 取得本人已存投資分配 |
| POST | `/api/judges/join-venue` | 加入指定會場 |
| POST | `/api/judges/leave-venue` | 離開當前會場 |
| POST | `/api/submit_investment` | 提交投資分配（`lock_submission: true` 為鎖定，`false` 為草稿）|

### 資料查詢
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/projects?venue_id=` | 取得會場專題列表與各評審投資明細 |
| GET  | `/api/venues` | 取得所有會場 |
| GET  | `/api/judges` | 取得評審列表與投票狀態（相容舊介面）|

### 管理員（需 admin token）
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/admin/system-state` | 場次總覽（當前 + 歷史 + 軟刪除）|
| POST | `/api/admin/system/start` | 啟動新場次 |
| POST | `/api/admin/system/close` | 關閉並封存當前場次 |
| DELETE | `/api/admin/system/archives/{id}` | 軟刪除封存場次（30 天內可還原）|
| POST | `/api/admin/system/archives/{id}/restore` | 還原軟刪除場次 |
| DELETE | `/api/admin/system/archives/{id}/permanent-delete` | 永久刪除 |
| GET/POST | `/api/admin/venues` | 查詢 / 新增會場 |
| PUT/PATCH/DELETE | `/api/admin/venues/{id}` | 更新 / 設定專題 / 刪除會場 |
| GET/POST | `/api/admin/members` | 查詢 / 新增成員 |
| PATCH/DELETE | `/api/admin/members/{identifier}` | 更新 / 刪除成員 |
| POST | `/api/admin/members/{identifier}/unlock` | 解除評審鎖定 |
| POST | `/api/admin/reset-round` | 重置當前輪次投資數據 |

### `POST /api/submit_investment` 詳細說明

**請求**：
```json
{
  "investments": { "proj_001": 3000, "proj_002": 4000, "proj_003": 3000 },
  "lock_submission": true
}
```

**驗證規則（鎖定模式）**：
- ✅ 總金額必須等於 **10,000 元**
- ✅ 每個專題金額必須 **≥ 0**

**草稿模式**（`lock_submission: false`）：
- 允許金額不足 10,000，僅暫存供後續修改

## 🤖 自動化測試

```bash
# macOS / Linux
./run_test.sh

# Windows
run_test.bat
```

詳細說明見 [TEST_AUTOMATION.md](TEST_AUTOMATION.md)

## 🎨 前端功能

### Lobby 大廳
- 姓名登入（JWT Token 存於 localStorage）
- 選擇會場後加入，自動切換至評審介面
- Session 自動恢復（頁面重整不需重新登入）

### 評審投資介面 (JudgeUI)
- 每位評審固定 **10,000 元** 預算
- 數字輸入框 + 滑桿雙向同步調整
- **草稿暫存**（`lock_submission: false`）：可分次修改，不限總額
- **鎖定提交**（`lock_submission: true`）：總額必須等於 10,000 元，提交後不可修改
- 頁面載入時自動恢復已儲存的草稿
- 上傳期間顯示 Loading 指示器防止重複提交

### 現場儀表板 (Dashboard)
- **即時投資比較圖**：Recharts 動態長條圖，每 2 秒輪詢更新
- **各評審投資明細**：在圖表下方列出每位評審對各組的個別投資金額
- **簡報（頒獎典禮）模式**：
  - 凍結輪詢、逐一揭曉排名（由末位到第一名）
  - 第一名有彩帶爆破動畫特效
  - 可手動逐步揭曉或自動播放

### 管理員面板 (Admin)
- **場次管理**：啟動 / 關閉場次，查看歷史封存，軟刪除（30 天可還原）
- **會場管理**：新增 / 編輯 / 刪除會場，設定會場專題與評審名單
- **成員管理**：新增評審、修改資料、解除鎖定、按場次篩選
- **歷史查閱**：封存場次含完整投資排名與各會場摘要

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