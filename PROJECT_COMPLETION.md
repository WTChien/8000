# ✅ FundThePitch 專案完成狀態

## 專案名稱
**FundThePitch** - 專題模擬投資評分系統

---

## 📋 已完成功能

### ✅ 後端：FastAPI + Google Cloud Firestore

- [x] FastAPI 應用程式與 Uvicorn 伺服器
- [x] CORS 配置（允許所有來源，可針對生產環境收窄）
- [x] **Google Cloud Firestore 整合**（`firestore_db.py`）
  - 雙模式切換：`USE_FIRESTORE=true/false`
  - 啟動時自動從 Firestore 恢復活躍場次狀態
- [x] **JWT 自行實作的 Bearer Token 認證**
  - 角色分為 `admin` / `judge`
  - `require_roles()` 保護各端點
  - Token TTL 可調（預設 48 小時）
- [x] 完整認證 API（login / logout / verify OTP / me）
- [x] 場次管理 API（啟動 / 關閉 / 軟刪除 / 還原 / 永久刪除）
- [x] 會場管理 API（CRUD + 設定專題 / 評審）
- [x] 成員管理 API（新增 / 修改 / 刪除 / 解鎖）
- [x] 投資 API（草稿暫存 + 鎖定提交 + 個人投資查詢）
- [x] 場次封存時自動生成投資摘要與排名
- [x] 軟刪除場次 30 天後自動永久清除相關 verified_users
- [x] 完整 Pydantic 模型定義（輸入驗證 + 回應序列化）

---

### ✅ 前端：React 18 + TypeScript

#### App.tsx（頂層應用）
- [x] 視圖路由：`lobby` / `judge` / `dashboard` / `admin`
- [x] JWT 認證狀態（localStorage 持久化 + sessionStorage 快取 display name）
- [x] Session 自動恢復（頁面重整不需重新登入）
- [x] 角色導向視圖（admin 直接進 admin 面板，judge 進 Lobby）
- [x] Admin 面板：場次管理 / 會場管理 / 成員管理

#### JudgeUI.tsx — 評審投資介面
- [x] 固定 10,000 元預算分配
- [x] 數字輸入框 + 滑桿雙向同步
- [x] **草稿暫存**（`lock_submission: false`）：允許總額不足
- [x] **鎖定提交**（`lock_submission: true`）：總額須等於 10,000 元
- [x] 頁面載入時自動恢復伺服器已儲存的草稿
- [x] 上傳期間 Loading 遮罩，防止重複提交
- [x] 即時預算統計（已分配 / 剩餘 / 超額警示）

#### Dashboard.tsx — 現場儀表板
- [x] Recharts 動態長條圖，每 2 秒自動輪詢更新
- [x] **各評審個別投資金額明細**列表
- [x] **簡報（頒獎）模式**：
  - 凍結輪詢
  - 由末位逐一揭曉至第一名（1.2 秒間距自動播放 / 手動逐步）
  - 第一名彩帶爆破動畫

#### Admin 面板（App.tsx 內）
- [x] **場次管理**：啟動 / 關閉 / 查看歷史封存 / 軟刪除（30 天可還原）
- [x] **會場管理**：建立 / 修改 / 刪除會場，設定專題與評審名單
- [x] **成員管理**：新增評審、解除鎖定、按場次篩選
- [x] 封存場次詳情：完整投資排名（含各會場標籤）

#### 通用
- [x] TypeScript 全程型別檢查（.tsx）
- [x] `REACT_APP_API_URL` 環境變數統一管理 API 端點
- [x] 全域 CSS 樣式與動畫（`styles/App.css`）

---


### ✅ React 前端 - 主應用架構

### ✅ 工具與設定檔

- [x] `requirements.txt`：fastapi、uvicorn、firebase-admin、requests、colorama
- [x] `package.json`：React 18、Recharts 2.10、Axios 1.6、TypeScript 4.9、react-scripts 5
- [x] `start.sh` / `start.bat`：一鍵啟動前後端
- [x] `test_automation.py`：完整業務流程自動化測試
- [x] `run_test.sh` / `run_test.bat`：測試啟動腳本
- [x] `FundThePitch.postman_collection.json`：API 測試集合
- [x] 靜態前端建置輸出（`frontend/build/`）

---

## 🔖 技術版本

| 技術 | 版本 |
|------|------|
| Python | >= 3.8 |
| FastAPI | 0.104.1 |
| Uvicorn | 0.24.0 |
| firebase-admin | 6.6.0 |
| Node.js | >= 14.0 |
| React | 18.2.0 |
| TypeScript | ^4.9.5 |
| Recharts | ^2.10.0 |
| Axios | ^1.6.0 |

---

## 🚀 快速啟動

```bash
# 後端
pip install -r requirements.txt
python backend/main.py

# 前端
cd frontend && npm install && npm start
```

完整說明見 [QUICKSTART.md](QUICKSTART.md)
