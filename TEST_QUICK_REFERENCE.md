# 🚀 FundThePitch 自動化測試 - 快速參考

## 📋 文件清單

| 文件 | 說明 |
|------|------|
| `test_automation.py` | Python 自動化測試腳本（核心）|
| `run_test.sh` | Linux/macOS 運行腳本 |
| `run_test.bat` | Windows 運行腳本 |
| `TEST_AUTOMATION.md` | 完整文檔和指南 |

## ⚡ 快速命令

### 運行完整測試

```bash
# macOS / Linux
./run_test.sh

# Windows
run_test.bat
```

### 使用自訂配置

```bash
# 自訂後端地址
API_BASE_URL=http://192.168.1.100:8000 ./run_test.sh

# 自訂 Admin 帳戶
ADMIN_DISPLAY_NAME=管理員 ./run_test.sh

# 同時自訂多個參數
API_BASE_URL=http://example.com:8000 ADMIN_DISPLAY_NAME=管理員 ./run_test.sh
```

### 直接運行 Python

```bash
pip install requests colorama
python3 test_automation.py
```

### 保存測試結果

```bash
# macOS / Linux
./run_test.sh | tee test_results_$(date +%Y%m%d_%H%M%S).log

# Windows
run_test.bat > test_results_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log
```

## 📊 測試流程

1. ✓ 檢查後端服務器連接
2. ✓ Admin 登錄
3. ✓ 啟動新場次
4. ✓ 創建兩個會場（A場、B場）
5. ✓ 添加三位評審（評審 A、B、C）
6. ✓ 評審登錄並加入會場
7. ✓ 所有評審進行投資模擬（每人 10,000 元分配）
8. ✓ 查看實時投資數據
9. ✓ 關閉場次並生成摘要

## 🎯 環境要求

- ✓ Python 3.8+
- ✓ 後端服務器運行中
- ✓ 虛擬環境已激活（`.venv`）

## 📦 自動安裝依賴

運行 `run_test.sh` 或 `run_test.bat` 時會自動安裝：
- `requests` - HTTP 請求庫
- `colorama` - 彩色輸出

或手動安裝：
```bash
pip install -r requirements.txt
```

## 🐛 故障排除

### 無法連接後端
```bash
# 檢查後端是否運行
curl http://localhost:8000/docs

# 啟動後端（如未運行）
cd /Users/twinb00551172/Desktop/file/8000
.venv/bin/uvicorn backend.main:app --reload
```

### Admin 登錄失敗
```bash
# 檢查預設帳戶是否可用
# 預設: 管理員
# 或使用自訂管理員姓名啟動測試
ADMIN_DISPLAY_NAME=你的管理員姓名 ./run_test.sh
```

### 模組未找到
```bash
# 重新激活虛擬環境並安裝依賴
source .venv/bin/activate  # macOS/Linux
.venv\Scripts\activate.bat  # Windows
pip install requests colorama
```

## 📝 典型輸出

```
======= FundThePitch 自動化測試 =======

✓ 後端服務器運行中
✓ Admin 登錄成功
✓ 場次啟動成功
✓ 共創建 2 個會場
✓ 共添加 3 位評審
✓ 投資提交成功
✓ 投資數據獲取成功
✓ 場次關閉成功

========== 測試完成摘要 ==========
✓ 完整業務流程測試完成
ℹ 場次 ID: campaign-2026-abc123
ℹ 會場數量: 2
ℹ 評審數量: 3

========== 測試成功 ✓ ==========
```

## 📚 完整文檔

詳見 [TEST_AUTOMATION.md](TEST_AUTOMATION.md)

---

**上次更新**: 2026 年 3 月 20 日
