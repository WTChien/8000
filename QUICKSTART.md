# 🚀 快速啟動指南 - FundThePitch

## 📦 安裝前置條件

確保您已安裝以下軟體：

1. **Node.js** (>= 14.0)
   - 下載：https://nodejs.org/
   - 驗證：`node --version` 和 `npm --version`

2. **Python** (>= 3.8)
   - 下載：https://www.python.org/
   - 驗證：`python --version` 或 `python3 --version`

## 🎯 方案 A：自動啟動（推薦）

### macOS / Linux
```bash
cd /Users/twinb00551172/Desktop/file/8000
chmod +x start.sh      # 給腳本執行權限
./start.sh             # 執行啟動腳本
```

### Windows
```cmd
cd C:\Users\...\Desktop\file\8000
start.bat              # 雙擊或執行批處理文件
```

此方法將自動：
- ✅ 安裝 Python 依賴
- ✅ 安裝 Node 依賴
- ✅ 啟動後端服務器
- ✅ 啟動前端開發伺服器

---

## 🎯 方案 B：手動啟動

### 1️⃣ 後端啟動（需要一個終端窗口）

```bash
# 進入項目根目錄
cd /Users/twinb00551172/Desktop/file/8000

# 安裝 Python 依賴（首次運行）
pip install -r requirements.txt

# 或手動安裝
pip install fastapi uvicorn python-multipart

# 啟動後端服務器
python backend/main.py
```

**預期輸出**：
```
INFO:     Started server process [1234]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

✅ 後端成功：http://localhost:8000

### 2️⃣ 前端啟動（需要另一個終端窗口）

```bash
# 切換到前端目錄
cd frontend

# 安裝 Node 依賴（首次運行）
npm install

# 啟動前端開發伺服器
npm start
```

**預期輸出**：
```
Compiled successfully!

You can now view fundthepitch in the browser.

  http://localhost:3000

Note that the development build is not optimized.
```

✅ 前端成功：http://localhost:3000

---

## 🌐 訪問應用

| 功能 | URL |
|------|-----|
| **應用主頁** | http://localhost:3000 |
| **API 文檔** | http://localhost:8000/docs |
| **後端根路由** | http://localhost:8000 |

---

## 💻 使用說明

### 評審投資介面 (Judge UI)
1. 點擊導航欄「評審投資介面」
2. 選擇評審身份（下拉菜單）
3. 為每個專題分配投資金額
4. 使用滑桿或數字輸入框調整金額
5. 確保剩餘預算為 0 元
6. 點擊「提交投資分配」

### 現場儀表板 (Dashboard)
1. 點擊導航欄「現場大螢幕儀表板」
2. 觀看實時更新的投資分配長條圖
3. 系統每 2 秒自動輪詢最新數據
4. 可查看詳細的投資分配清單

---

## 📋 故障排除

### 錯誤：Port 已被佔用

**後端 (8000)：**
```bash
# macOS / Linux
lsof -i :8000 | grep LISTEN
kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**前端 (3000)：**
```bash
# macOS / Linux
lsof -i :3000 | grep LISTEN
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### 錯誤：模組未找到 (ModuleNotFoundError)

```bash
# 確保在項目根目錄
pip install -r requirements.txt

# 或逐個安裝
pip install fastapi uvicorn python-multipart
```

### 錯誤：npm: command not found

```bash
# 檢查 Node.js 安裝
node --version

# 如未安裝，從這裡下載
https://nodejs.org/
```

### 前端無法連接後端

**檢查清單**：
1. ✅ 後端在 http://localhost:8000 正在運行
2. ✅ 前端 API URL 正確：
  - 編輯 `frontend/src/components/JudgeUI.tsx` 第 4 行
  - 編輯 `frontend/src/components/Dashboard.tsx` 第 4 行
3. ✅ 檢查瀏覽器開發者工具（F12）- Network 標籤

---

## 🔐 API 快速測試

使用 cURL 或 Postman 測試 API：

### 獲取專題列表
```bash
curl http://localhost:8000/api/projects
```

### 提交投資
```bash
curl -X POST http://localhost:8000/api/submit_investment \
  -H "Content-Type: application/json" \
  -d '{
    "investments": {
      "proj_001": 2500,
      "proj_002": 2500,
      "proj_003": 2500,
      "proj_004": 2500
    },
    "judge_id": "judge_001"
  }'
```

### 使用 FastAPI Swagger UI
訪問 http://localhost:8000/docs 進行互動式 API 測試

---

## 🔥 串接 Firestore (NoSQL)

目前後端已支援「Firestore / Mock Data」雙模式：
- `USE_FIRESTORE=true`：使用 Firestore
- `USE_FIRESTORE=false`（或未設定）：使用記憶體 Mock Data

### 1️⃣ 安裝新依賴

```bash
cd /Users/twinb00551172/Desktop/file/8000
pip install -r requirements.txt
```

### 2️⃣ 建立 GCP 服務帳號金鑰

1. 到 Google Cloud Console → IAM & Admin → Service Accounts
2. 建立服務帳號，賦予 Firestore 權限（例如 Cloud Datastore User）
3. 下載 JSON 金鑰，放到本機安全路徑（例如 `~/secrets/serviceAccountKey.json`）

### 3️⃣ 設定環境變數

macOS / Linux：

```bash
export USE_FIRESTORE=true
export FIREBASE_CREDENTIALS_PATH=~/secrets/serviceAccountKey.json
```

Windows (PowerShell)：

```powershell
$env:USE_FIRESTORE="true"
$env:FIREBASE_CREDENTIALS_PATH="C:\path\to\serviceAccountKey.json"
```

### 4️⃣ 啟動後端

```bash
python backend/main.py
```

後端啟動時若 Firestore 連線成功，API 會改讀寫以下 collection：
- `projects`
- `judges`

若 Firestore 初始化失敗，系統會自動 fallback 回 Mock Data。

---

## 📦 生產部署

### 前端構建
```bash
cd frontend
npm run build
# 輸出在 build/ 目錄
```

### 後端部署
```bash
# 使用 Gunicorn（生產級 WSGI 伺服器）
pip install gunicorn
gunicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## 🆓 免費部署選項

### 前端
- **Vercel**: https://vercel.com
- **Netlify**: https://www.netlify.com
- **GitHub Pages**: https://pages.github.com

### 後端
- **Render**: https://render.com
- **Heroku**: https://www.heroku.com
- **Google Cloud Run**: https://cloud.google.com/run
- **AWS Lambda**: https://aws.amazon.com/lambda

---

## 📞 支持

有任何問題？
- 查看 [README.md](README.md) 了解更多詳情
- 檢查 [API 文檔](http://localhost:8000/docs)
- 查看瀏覽器控制台错误信息

---

**祝您使用愉快！🎉**
