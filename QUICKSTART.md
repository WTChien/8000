# 🚀 快速啟動指南 - FundThePitch

## 📦 前置條件

1. **Node.js** (>= 14.0) — `node --version`
2. **Python** (>= 3.8) — `python3 --version`
3. **Firebase 金鑰**：`backend/keys/fundthepitch-firebase-adminsdk-*.json` 必須存在

---

## 🎯 方案 A：自動啟動（推薦）

### macOS / Linux
```bash
cd /path/to/8000
chmod +x start.sh
./start.sh
```

### Windows
```cmd
cd C:\path\to\8000
start.bat
```

此腳本將自動：
- ✅ 安裝 Python 依賴（含 firebase-admin）
- ✅ 安裝 Node 依賴
- ✅ 啟動後端服務（port 8000）
- ✅ 啟動前端開發伺服器（port 3000）

---

## 🎯 方案 B：手動啟動

### 1️⃣ 後端（終端視窗一）

```bash
cd /path/to/8000

# 安裝 Python 依賴（含 Firestore SDK）
pip install -r requirements.txt

# 啟動後端
python backend/main.py
# 或
uvicorn backend.main:app --reload --port 8000
```

**預期輸出**：
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

✅ 後端：http://localhost:8000  
✅ API 文檔：http://localhost:8000/docs

> **Firestore**：預設使用 `backend/keys/` 下的服務帳號金鑰。  
> 若要停用（純記憶體模式）：`export USE_FIRESTORE=false`

### 2️⃣ 前端（終端視窗二）

```bash
cd frontend

# 安裝依賴（首次執行）
npm install

# 啟動開發伺服器
npm start
```

✅ 前端：http://localhost:3000

---

## 🌐 訪問應用

| 功能 | URL |
|------|-----|
| **應用主頁** | http://localhost:3000 |
| **API 文檔 (Swagger)** | http://localhost:8000/docs |

---

## 🖥️ 系統操作流程

### 評審流程
1. 在 Lobby 大廳輸入姓名登入
2. 從下拉列表選擇會場，點擊「加入會場」
3. 在投資介面中用滑桿 / 數字框分配各組金額（總計 10,000 元）
4. 點擊「**暫存**」可隨時儲存草稿；確認後點擊「**鎖定上傳**」完成投資
5. 鎖定提交後不可修改；如需解鎖請聯繫管理員

### 現場儀表板
1. 在登入後的 Lobby 點擊「現場儀表板」，或另開瀏覽器分頁直接前往
2. 選擇要顯示的會場
3. 儀表板每 2 秒自動輪詢更新圖表
4. 點擊「**簡報模式**」進入頒獎典禮排名揭曉流程：
   - 凍結輪詢
   - 可逐一手動揭曉或自動依序播放（由末位到第一名）
   - 第一名顯示彩帶爆破動畫

### 管理員流程
1. 以 Admin 帳號姓名登入（系統驗證角色）
2. 進入「場次管理」頁籤：
   - 「**啟動場次**」建立本次活動
   - 「**關閉場次**」封存並生成投資摘要
   - 封存場次可軟刪除（30 天內可還原）
3. 進入「**成員管理**」頁籤：
   - 選擇場次後新增評審姓名
   - 可解除評審的鎖定狀態，讓其重新提交
4. 在「**會場設定**」側邊欄（或各會場卡片）：
   - 建立 / 修改 / 刪除會場
   - 指定每個會場的專題名稱與評審成員

---

## 🔧 Firebase / Firestore 設定

### 使用自訂金鑰路徑
```bash
export FIREBASE_CREDENTIALS_PATH=/path/to/your-service-account.json
python backend/main.py
```

### 停用 Firestore（記憶體模式，適合測試）
```bash
export USE_FIRESTORE=false
python backend/main.py
```

### 環境變數一覽

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `USE_FIRESTORE` | `true` | 是否啟用 Firestore |
| `FIREBASE_CREDENTIALS_PATH` | `backend/keys/*.json` | Firebase 金鑰路徑 |
| `DEV_BYPASS_VERIFICATION` | `true` | 跳過 OTP 驗證（開發用）|
| `TOKEN_TTL_HOURS` | `48` | JWT Token 有效時數 |
| `CODE_TTL_SECONDS` | `300` | OTP 驗證碼有效秒數 |

---

## 🤖 自動化測試

```bash
# macOS / Linux
./run_test.sh

# Windows
run_test.bat

# 直接執行 Python
pip install requests colorama
python3 test_automation.py
```

環境變數自訂：
```bash
API_BASE_URL="http://your-server:8000" ADMIN_DISPLAY_NAME="管理員" ./run_test.sh
```

詳細文檔見 [TEST_AUTOMATION.md](TEST_AUTOMATION.md)

---

## 🏗️ 正式部署

### 前端靜態建置
```bash
cd frontend
npm run build
# 輸出到 frontend/build/，可直接用 Nginx / CDN 托管
```

### 後端部署範例
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1
```

---

## 📋 故障排除

### Port 已被占用
```bash
# macOS / Linux
lsof -i :8000 | grep LISTEN && kill -9 <PID>
lsof -i :3000 | grep LISTEN && kill -9 <PID>
```

### Firebase 初始化失敗
- 確認 `backend/keys/` 下有正確的 `.json` 金鑰檔案
- 或設定 `USE_FIRESTORE=false` 改用記憶體模式

### 前端 CORS / 連線失敗
- 確認後端在 `http://localhost:8000` 正在運行
- 檢查 `frontend/.env` 中 `REACT_APP_API_URL` 是否正確
- 打開瀏覽器 DevTools → Network 查看具體錯誤

### TypeScript 編譯錯誤
```bash
# 確認 typescript 版本（需 ^4.x）
cd frontend && cat node_modules/typescript/package.json | grep '"version"'
# 若版本錯誤，重新安裝
npm install
```
