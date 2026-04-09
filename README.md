<!-- markdownlint-disable -->

# FundThePitch — 專題模擬投資評分系統

FundThePitch 是一套專為畢業專題成果發表設計的互動式投資評分系統。每位評審持有固定預算（10,000 元），透過模擬投資的方式對各組專題打分。系統即時統計各會場投資結果，並提供簡報揭榜模式供頒獎典禮使用。

---

## 目錄

- [系統架構](#系統架構)
- [角色模型](#角色模型)
- [快速開始](#快速開始)
- [系統使用流程](#系統使用流程)
  - [最高管理員流程](#最高管理員流程)
  - [系所管理員流程](#系所管理員流程)
  - [評審流程](#評審流程)
  - [戰況儀表板](#戰況儀表板)
- [管理員面板功能說明](#管理員面板功能說明)
- [登入與識別碼機制](#登入與識別碼機制)
- [場次與成員作用域](#場次與成員作用域)
- [主要 API](#主要-api)
- [環境變數](#環境變數)
- [專案結構](#專案結構)

---

## 系統架構

| 層級 | 技術 |
|------|------|
| 前端 | React 18、TypeScript、Axios、Recharts、XLSX |
| 後端 | FastAPI、Uvicorn、ReportLab（PDF 報告） |
| 資料庫 | Google Cloud Firestore（透過 `firebase-admin`）|
| 認證 | Bearer Token（in-memory session） |
| 靜態服務 | 後端直接 serve `frontend/build/`（預設） |

後端預設執行於 **Port 9000**。前端開發伺服器執行於 **Port 3000**。

---

## 角色模型

| 角色 | 說明 |
|------|------|
| `super_admin` | 全系統唯一最高管理者。可管理所有管理員、啟動/關閉場次、管理全域成員與封存記錄。 |
| `admin` | 系所管理員。可在所屬場次下管理會場與評審。 |
| `judge` | 評審。加入指定會場後，可提交 10,000 元投資分配。 |

補充規則：
- `super_admin` 與 `admin` 為**全域帳號**，不綁定特定場次。
- `judge` 會依**場次作用域**保存（格式：`campaign_<id>__<identifier>`）。
- 若尚未啟動場次，評審資料會落在**年份作用域**（如 `2026__<identifier>`）。
- `super_admin` 使用含邀請 token 的網址登入時，身份不會被降級為 `judge`，仍以最高管理員進入系統。

---

## 快速開始

### 前置條件

- Python 3.8 以上
- Node.js 14 以上
- Firebase 服務帳戶金鑰放置於 `backend/keys/`

### 一鍵啟動（macOS / Linux）

```bash
./start.sh
```

Windows 使用：

```bat
start.bat
```

啟動後：
- 後端：`http://localhost:9000`
- API 文件（Swagger）：`http://localhost:9000/docs`
- 前端（開發模式）：`http://localhost:3000`

### 手動啟動

**後端：**

```bash
source .venv/bin/activate
pip install -r requirements.txt
python backend/main.py
```

**前端（開發模式）：**

```bash
cd frontend
npm install
npm start
```

**前端（正式建置）：**

```bash
cd frontend
npm run build
```

建置完成後靜態檔案輸出至 `frontend/build/`，後端會自動 serve。

### 環境設定

在 `frontend/.env` 設定 API 位址（預設已為 `http://localhost:9000`）：

```env
REACT_APP_API_URL=http://localhost:9000
```

---

## 系統使用流程

### 最高管理員流程

> `super_admin` 為系統唯一最高管理者，負責統籌所有場次與成員。

#### 1. 初始建立

後端啟動時，若設定了環境變數 `SUPER_ADMIN_NAME`，系統會自動建立對應的 `super_admin` 帳號：

```bash
export SUPER_ADMIN_NAME="王小明"
python backend/main.py
```

或在管理員面板「成員管理」手動新增帳號。

#### 2. 登入

開啟前端頁面，在登入畫面輸入 `super_admin` 帳號的姓名，系統自動識別角色並進入管理員面板。

#### 3. 場次管理

進入管理員面板後，預設顯示「場次管理」分頁：

1. **啟動新場次**：點擊「啟動場次」，輸入場次名稱（如 `113 學年度專題發表`），系統建立新的 `campaign_id`。
2. **產生邀請連結**：場次啟動後，系統為該場次產生邀請 token。可複製連結或顯示 QR Code，發給各系所管理員或評審。評審透過此連結登入，帳號會自動綁定到該場次。
3. **關閉場次**：點擊「關閉場次」，系統封存當前場次資料，包含所有會場投資結果的摘要快照。
4. **封存紀錄**：關閉後的場次移入「封存紀錄」分頁，可軟刪除（30 天內可還原）或永久刪除。

#### 4. 成員管理

切換至「成員管理」分頁：

- 檢視所有評審與管理員清單，可依**角色 / 場次 / 會場 / 鎖定狀態**篩選排序。
- 新增評審或系所管理員（輸入姓名、選擇角色）。
- 編輯成員姓名或角色。
- 重設評審的投票鎖定（解鎖後評審可重新提交投資）。
- 將評審拖拉到指定管理員下，完成管理者綁定。

#### 5. 會場管理

切換至「會場管理」分頁：

- 新增會場（輸入會場名稱與教室號碼）。
- 下載 Excel 範本、匯入會場資料（專題組/評審）快速建置。
- 設定各會場的參賽專題名稱。
- 將評審指派到特定會場。
- 刪除不需要的會場。

---

### 系所管理員流程

> `admin` 負責管理特定場次下的會場與評審。

#### 1. 登入

使用 `super_admin` 提供的邀請連結（含 `?invite_token=...`），前往登入頁面輸入帳號姓名，系統會自動：
- 認證帳號並綁定到對應場次。
- 以 `admin` 角色進入管理員面板。

#### 2. 管理會場與評審

- 在「會場管理」分頁新增、編輯、刪除所屬場次的會場。
- 設定各會場的專題列表。
- 在「成員管理」分頁管理評審：新增、解鎖、指派會場等操作。

---

### 評審流程

> `judge` 在指定會場對各組專題進行模擬投資。

#### 1. 進入系統

有兩種方式登入：

**方式一：一般登入**
直接在 Lobby 頁面輸入姓名，系統建立或恢復帳號（自動判斷場次作用域）。

**方式二：邀請連結登入**
透過管理員提供的邀請連結（如 `http://localhost:3000?invite_token=abc123`）進入，登入後帳號自動綁定到對應場次。

#### 2. Lobby 大廳

登入後進入 Lobby：

1. 若已綁定會場，系統顯示目前狀態，可直接點擊「進入評審」。
2. 若尚未加入會場，從下拉選單選擇會場後點擊「加入」。
3. 若尚未啟動場次，頁面顯示「目前尚未啟動場次，請稍候」。

#### 3. 評審投資

進入評審介面（Judge UI）後：

1. 頁面顯示本會場所有參賽專題。
2. 每位評審擁有固定預算 **10,000 元**。
3. 對各專題輸入投資金額，合計不可超過 10,000 元。
4. **暫存草稿**：點擊「暫存」，儲存目前輸入，允許反覆修改。草稿不計入即時統計。
5. **鎖定送出**：點擊「確認送出」，投資結果鎖定並計入統計，鎖定後不可自行修改（需管理員解鎖）。
6. 離線或重新整理頁面後，系統自動載回已儲存的草稿或已鎖定結果。

#### 4. 完成後

投資鎖定後介面顯示「已送出」狀態，等待所有評審完成後由管理員揭榜。

---

### 戰況儀表板

> 供司儀、現場工作人員或大螢幕即時展示用。

1. 從 Lobby 進入 Dashboard，或由管理員直接開啟頁面投影。
2. 頁面顯示：
   - 各會場各專題目前累積投資金額（長條圖）。
   - 各評審投資明細表格（顯示是否已鎖定）。
3. **簡報揭榜模式**：逐步揭露各會場結果，適合典禮現場使用。

---

## 管理員面板功能說明

### 場次管理

| 操作 | 說明 |
|------|------|
| 啟動場次 | 建立新場次，輸入名稱後立即生效，產生邀請 token |
| 關閉場次 | 封存當前場次，自動快照所有投資結果 |
| 複製邀請連結 | 複製含邀請 token 的 URL |
| 顯示 QR Code | 以 QR Code 顯示邀請連結，適合投影使用 |

### 會場管理

| 操作 | 說明 |
|------|------|
| 新增會場 | 填寫會場名稱與教室號碼 |
| 編輯會場 | 修改名稱或教室 |
| 設定專題 | 輸入本會場的參賽專題名稱清單 |
| 指派評審 | 將成員拖拉至指定會場 |
| 刪除會場 | 移除會場（不影響已封存資料） |

### 成員管理

| 操作 | 說明 |
|------|------|
| 查看清單 | 列出所有成員，可依角色 / 場次 / 會場 / 鎖定狀態排序 |
| 場次篩選 | 可指定查看某一場次；若目前無進行中場次，預設為「請選擇場次」且不顯示成員 |
| 新增成員 | 填寫姓名，選擇角色（`judge` 或 `admin`） |
| 編輯成員 | 修改姓名或角色 |
| 解除鎖定 | 重置評審已鎖定的投資，使其可重新提交 |
| 管理者綁定 | 拖拉評審到管理員下完成綁定，附確認 modal |

### 封存紀錄

| 操作 | 說明 |
|------|------|
| 查看歷史場次 | 依年份分組顯示所有已關閉場次與投資結果摘要 |
| 下載 PDF 報告 | 匯出結構化封存報告（總排名、各會場各組與評審分配明細） |
| 軟刪除 | 移至「最近刪除」，30 天內可還原 |
| 還原 | 將軟刪除的場次還原至封存清單 |
| 永久刪除 | 無法還原，連同 Firestore 資料一併移除 |

---

## 登入與識別碼機制

### 姓名登入（主要方式）

前端送出 `POST /api/judges/login`，傳入 `display_name`（可附 `invite_token`）。

後端將姓名轉為內部 identifier：

```
name::{display_name.lower()}
```

範例：
- 輸入 `王小明` → identifier：`name::王小明`
- 輸入 `Alice` → identifier：`name::alice`

### Email / 手機登入

使用 `POST /api/auth/login`，支援 email 或 `09XXXXXXXX` 格式手機號碼，需先透過 OTP 驗證。

### Firestore 文件 ID 說明

`verified_users` 集合的文件 ID 格式為 `{scope}__{identifier}`：

| 範例文件 ID | 說明 |
|------------|------|
| `2026__name::alice` | 未啟動場次時，依當前年份建立 |
| `campaign_abc123__name::alice` | 場次啟動後，依 campaign_id 建立 |
| `global__name::alice` | `super_admin` 或 `admin` 的全域帳號 |

Firebase Console 看到的文件 ID 是內部識別碼，顯示名稱仍為輸入的姓名。

---

## 場次與成員作用域

### 未啟動場次

- 仍可新增成員，資料綁定至當年年份（如 `2026`）。
- `super_admin` 可預先建立管理員與評審。
- 評審無法加入會場（會場需在場次啟動後才可使用）。

### 場次啟動中

- 評審透過邀請連結登入後，帳號自動綁定至該 `campaign_id`。
- 會場、專題、投資資料均屬於當前場次。
- 可同時存在多個場次（例如不同系所各自啟動）。

### 場次關閉後

- 所有投資結果封存為快照。
- 可在「封存紀錄」查閱歷史資料。
- 評審仍可登入查看結果，但無法修改投資。

---

## 主要 API

### 認證

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/judges/login` | 以姓名登入，必要時自動建立帳號（可附 `invite_token`） |
| POST | `/api/auth/login` | 以 email / 手機號碼登入 |
| POST | `/api/auth/request-verification` | 請求 OTP 驗證碼 |
| POST | `/api/auth/verify` | 驗證 OTP，取得 Token |
| POST | `/api/auth/logout` | 登出，撤銷 Token |
| GET  | `/api/auth/me` | 取得目前登入使用者資訊 |

### 評審操作

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/judges/status` | 取得評審狀態（會場、是否已鎖定） |
| GET  | `/api/judges/my-investment` | 取得本人已儲存的投資分配 |
| POST | `/api/judges/join-venue` | 加入指定會場 |
| POST | `/api/judges/leave-venue` | 離開目前會場 |
| POST | `/api/submit_investment` | 提交投資分配（`lock_submission: true` 鎖定，`false` 草稿） |

### 資料查詢

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/projects?venue_id=` | 取得會場專題列表與各評審投資明細 |
| GET  | `/api/venues` | 取得所有會場 |
| GET  | `/api/judges` | 取得評審列表與投票狀態 |

### 管理員（需 `admin` 或 `super_admin` token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/admin/system-state` | 場次總覽（當前 + 歷史 + 軟刪除） |
| POST | `/api/admin/system/start` | 啟動新場次 |
| POST | `/api/admin/system/close` | 關閉並封存當前場次 |
| GET | `/api/admin/system/archives/{id}/report-pdf` | 下載該封存場次 PDF 報告 |
| DELETE | `/api/admin/system/archives/{id}` | 軟刪除封存場次 |
| POST | `/api/admin/system/archives/{id}/restore` | 還原軟刪除場次 |
| DELETE | `/api/admin/system/archives/{id}/permanent-delete` | 永久刪除場次 |
| GET / POST | `/api/admin/venues` | 查詢 / 新增會場 |
| PUT / PATCH / DELETE | `/api/admin/venues/{id}` | 更新 / 設定專題 / 刪除會場 |
| GET / POST | `/api/admin/members` | 查詢 / 新增成員 |
| PATCH / DELETE | `/api/admin/members/{identifier}` | 更新 / 刪除成員 |
| PATCH | `/api/admin/members/{identifier}/status` | 更新會場指派、送出狀態或管理者綁定 |
| POST | `/api/admin/members/{identifier}/unlock` | 解除評審投票鎖定 |

---

## 環境變數

### 後端

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `USE_FIRESTORE` | `true` | 設為 `false` 可改用純記憶體模式（重啟後資料消失） |
| `FIREBASE_CREDENTIALS_PATH` | `backend/keys/fundthepitch-firebase-adminsdk-*.json` | Firebase 金鑰路徑 |
| `DEV_BYPASS_VERIFICATION` | `true` | 開發模式下略過 OTP 驗證 |
| `TOKEN_TTL_HOURS` | `48` | Session Token 存活時間（小時） |
| `CODE_TTL_SECONDS` | `300` | OTP 有效時間（秒） |
| `VERIFIED_ACCESS_DAYS` | `2` | 驗證後帳號可用天數 |
| `ARCHIVE_RETENTION_DAYS` | `30` | 軟刪除封存資料的保留天數 |
| `SUPER_ADMIN_NAME` | 空字串 | 啟動時若無既有 `super_admin`，自動以此姓名建立 |

> 備註：封存 PDF 下載功能需安裝 `reportlab`（已列於 `requirements.txt`）。

### 前端

| 變數 | 說明 |
|------|------|
| `REACT_APP_API_URL` | 後端 API Base URL，預設 `http://localhost:9000` |

---

## 待辦提醒

- 後續預計調整 **評審登入後的教學引導流程**（judge tutorial after login），明天再續改。

## 專案結構

```text
8000/
├── backend/
│   ├── main.py               # FastAPI 主程式，所有 API 路由與業務邏輯
│   ├── firestore_db.py       # Firestore 資料庫封裝層
│   └── keys/
│       └── fundthepitch-firebase-adminsdk-*.json
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.tsx           # 主應用，含所有頁面與狀態管理
│   │   ├── index.tsx
│   │   ├── components/
│   │   │   ├── Dashboard.tsx # 戰況儀表板
│   │   │   └── JudgeUI.tsx   # 評審投資介面
│   │   └── styles/
│   │       └── App.css
│   ├── build/                # 正式建置輸出（npm run build）
│   └── package.json
├── requirements.txt
├── start.sh                  # macOS/Linux 一鍵啟動腳本
├── start.bat                 # Windows 一鍵啟動腳本
└── README.md
```

---

## 常見問題

**Q：前端無法連到後端？**
確認 `frontend/.env` 中 `REACT_APP_API_URL=http://localhost:9000`，並確認後端已正常啟動。

**Q：Firebase Console 顯示的文件 ID 很奇怪？**
這是正常的，文件 ID 包含場次作用域前綴（如 `campaign_abc__name::alice`），顯示名稱仍為輸入的姓名。

**Q：評審提交後想修改怎麼辦？**
管理員至「成員管理」找到該評審，點擊「解除鎖定」即可讓評審重新提交。

**Q：為什麼「成員管理」會看到封存場次成員？**
目前設計為僅在你手動選擇該封存場次時才顯示；若無進行中場次，預設為「請選擇場次」且列表為空。

**Q：下載封存 PDF 失敗怎麼辦？**
請先確認後端已重啟且 `reportlab` 已安裝；若場次已被移到最近刪除，系統仍可從該紀錄產生 PDF。

**Q：想在不使用 Firestore 的情況下測試？**
設定環境變數 `USE_FIRESTORE=false` 啟動後端，所有資料存在記憶體中，重啟後清空。

**Q：`super_admin` 用邀請連結登入會變成評審？**
不會。系統優先識別全域 `super_admin` 身份，即使使用含邀請 token 的連結登入，介面也會以最高管理員呈現。
