# 🤖 FundThePitch 自動化測試指南

完整的自動化測試腳本，用於驗證系統的完整業務流程。

## 📋 測試流程

該腳本將自動執行以下步驟：

1. **✓ 檢查後端服務器** - 驗證 API 連接
2. **✓ Admin 登錄** - 使用 admin 帳戶登錄
3. **✓ 啟動場次** - 建立新的評分場次
4. **✓ 添加會場** - 建立多個會場（A場、B場）
5. **✓ 添加評審成員** - 建立多位評審（評審 A、B、C）
6. **✓ 評審加入會場** - 評審加入指定會場
7. **✓ 評審投資模擬** - 模擬每位評審的投資決策
8. **✓ 查看投資數據** - 獲取並顯示當前投資狀況
9. **✓ 關閉場次** - 歸檔場次並生成摘要
10. **✓ 顯示測試結果** - 完整的測試摘要報告

## 🚀 快速開始

### 前置條件

- Python 3.8+
- 後端服務器正在運行（http://localhost:8000）
- Firebase 金鑰已配置（或 `USE_FIRESTORE=false`）

### macOS / Linux

```bash
cd /path/to/8000

# 給腳本執行權限
chmod +x run_test.sh

# 運行測試（使用預設 API 端點）
./run_test.sh

# 或指定自訂 API 端點
./run_test.sh http://your-server.com:8000
```

### Windows

```cmd
cd C:\...\Desktop\file\8000

REM 運行測試（使用預設 API 端點）
run_test.bat

REM 或指定自訂 API 端點
run_test.bat http://your-server.com:8000
```

### Python 直接運行

```bash
# 安裝依賴
pip install requests colorama

# 運行測試
python3 test_automation.py

# 或使用自訂 API 端點
API_BASE_URL=http://your-server.com:8000 python3 test_automation.py
```

## 📊 輸出示例

```
======================================================================
                    FundThePitch 自動化測試
======================================================================

ℹ 後端 API: http://localhost:8000
ℹ 年份: 2026

>>> 1️⃣  檢查後端服務器
ℹ GET http://localhost:8000/docs
✓ Response: 200
✓ 後端服務器運行中: http://localhost:8000

>>> 2️⃣  Admin 登錄
ℹ POST http://localhost:8000/api/judges/login
  Payload: {"display_name": "管理員"}
✓ Response: 200
✓ 管理員登入成功

>>> 3️⃣  啟動場次
ℹ POST http://localhost:8000/api/admin/system/start
  Payload: {"label": "2026 專題模擬投資評分"}
✓ Response: 200
✓ 場次啟動成功
ℹ Campaign ID: campaign-2026-abc123
{
  "id": "campaign-2026-abc123",
  "year": 2026,
  "label": "2026 專題模擬投資評分",
  "status": "active",
  ...
}

>>> 4️⃣  添加會場
ℹ 創建會場: A場會場
ℹ POST http://localhost:8000/api/admin/venues
✓ Response: 200
✓ 會場 'A場會場' 創建成功 (ID: venue-001)
ℹ 創建會場: B場會場
✓ Response: 200
✓ 會場 'B場會場' 創建成功 (ID: venue-002)
✓ 共創建 2 個會場

>>> 5️⃣  添加評審成員
ℹ 添加成員: 評審 A
✓ Response: 200
✓ 成員 '評審 A' 添加成功 (ID: name::評審_A)
ℹ 添加成員: 評審 B
✓ Response: 200
✓ 成員 '評審 B' 添加成功 (ID: name::評審_B)
ℹ 添加成員: 評審 C
✓ Response: 200
✓ 成員 '評審 C' 添加成功 (ID: name::評審_C)
✓ 共添加 3 位評審

>>> 評審加入會場流程
ℹ 評審 '評審 A' 登錄
✓ Response: 200
✓ 評審登錄成功
ℹ 評審加入會場
✓ Response: 200
✓ 評審已加入會場

>>> 6️⃣  評審投資模擬
ℹ 發現 4 個專案
ℹ 投資分配: {'proj_001': 2500, 'proj_002': 2500, 'proj_003': 2500, 'proj_004': 2500}
ℹ 評審 '評審 A' 提交投資
✓ Response: 200
✓ 投資提交成功
{
  "success": true,
  "message": "投資分配成功！",
  ...
}

>>> 7️⃣  查看投資數據
ℹ GET http://localhost:8000/api/projects
✓ Response: 200
✓ 投資數據獲取成功
{
  "projects": [
    {
      "id": "proj_001",
      "name": "AI聊天機器人",
      "total_investment": 7500
    },
    ...
  ],
  "total_budget": 10000,
  "remaining_budget": 2500,
  ...
}

>>> 8️⃣  關閉場次
ℹ POST http://localhost:8000/api/admin/system/close
✓ Response: 200
✓ 場次關閉成功
{
  "id": "campaign-2026-abc123",
  "status": "closed",
  "summary": {
    "total_investments": 7500,
    "participating_judges": 3,
    ...
  }
}

======================================================================
                    測試完成摘要
======================================================================
✓ ✓ 完整業務流程測試完成
ℹ 場次 ID: campaign-2026-abc123
ℹ 會場數量: 2
ℹ 評審數量: 3
ℹ 場次摘要:
{
  "total_investments": 7500,
  "participating_judges": 3,
  ...
}

======================================================================
                        測試成功 ✓
======================================================================
```

## 🎯 環境變數配置

### 自訂管理員姓名

```bash
# macOS / Linux
export ADMIN_DISPLAY_NAME="管理員"
./run_test.sh

# Windows
set ADMIN_DISPLAY_NAME=管理員
run_test.bat

# Python 直接運行
ADMIN_DISPLAY_NAME="管理員" python3 test_automation.py
```

### 自訂 API 端點

```bash
# macOS / Linux
API_BASE_URL="http://your-server.com:8000" ./run_test.sh

# Windows
set API_BASE_URL=http://your-server.com:8000
run_test.bat

# Python 直接運行
API_BASE_URL="http://your-server.com:8000" python3 test_automation.py
```

## 🔧 故障排除

### 錯誤: 無法連接後端服務器

```
✗ 無法連接後端服務器: Connection refused
```

**解決方案**：
1. 確保後端服務器正在運行
2. 檢查 API 端點是否正確
3. 驗證防火牆設置

```bash
# 檢查後端是否運行
curl http://localhost:8000/docs

# 啟動後端（如未運行）
cd /Users/twinb00551172/Desktop/file/8000
.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 錯誤: 管理員登入失敗

```
✗ 登入者 '管理員' 目前角色是 judge，不是 admin。
```

**解決方案**：
1. 確認系統中的「管理員」姓名已被授權為 admin
2. 如需改用其他管理員名稱，設定 `ADMIN_DISPLAY_NAME`
3. 重新執行腳本

### 錯誤: 虛擬環境不存在

```
❌ 錯誤: 虛擬環境不存在
```

**解決方案**：
```bash
cd /Users/twinb00551172/Desktop/file/8000
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# 或
.venv\Scripts\activate.bat  # Windows
pip install -r requirements.txt
```

### 錯誤: 模組未找到

```
ModuleNotFoundError: No module named 'requests'
```

**解決方案**：
```bash
pip install requests colorama
```

## 📝 日誌和調試

### 查看詳細日誌

目前腳本會自動輸出詳細信息，包括：
- ✓ 每個 API 請求的 HTTP 方法和端點
- ✓ 請求的 Payload
- ✓ 回應狀態碼和數據
- ✓ 成功/失敗消息和彩色標記

### 保存日誌到文件

```bash
# macOS / Linux
./run_test.sh > test_results.log 2>&1

# Windows
run_test.bat > test_results.log 2>&1

# Python 直接運行
python3 test_automation.py | tee test_results.log
```

## 🔄 循環測試

### 重複執行測試 (macOS/Linux)

```bash
# 執行 5 次測試
for i in {1..5}; do
  echo "執行測試週期 $i..."
  ./run_test.sh
  sleep 2  # 間隔 2 秒
done
```

### 重複執行測試 (Windows)

```batch
REM 執行 5 次測試
for /L %%i in (1,1,5) do (
  echo 執行測試週期 %%i...
  run_test.bat
  timeout /t 2
)
```

## 📊 測試結果驗證

### 驗證投資數據的正確性

1. **總投資額** - 應該等於 評審數 × 10,000
2. **專案分配** - 每個專題都應該有投資
3. **剩餘預算** - 場次摘要應顯示客觀的統計數據

### 檢查 Firestore (如適用)

```bash
# 進入 Google Cloud Console
# 導航到 Firestore Database
# 檢查以下 collection：
# - projects
# - judges
# - venues
# - campaign_states
```

## 🎓 使用該腳本進行開發

該自動化測試腳本可用於：

- ✓ 驗證新的 API 端點
- ✓ 測試業務邏輯的完整流程
- ✓ 進行回歸測試（確保改動不破壞現有功能）
- ✓ 性能測試（為多個評審生成大量投資數據）
- ✓ 自動化 CI/CD 流程

## 📞 支援

有任何問題？
- 檢查 [README.md](README.md) 獲取更多詳情
- 查看 [DEVELOPMENT.md](DEVELOPMENT.md) 了解架構
- 檢查腳本輸出中的詳細錯誤信息

---

**版本**: 1.0.0  
**最後更新**: 2026 年 3 月
