# 👨‍💻 開發指南 - FundThePitch

## 🏗️ 架構概覽

```
Browser (React + TypeScript)
       ↓↑ REST API (Axios + JWT Bearer Token)
Backend (FastAPI + Python)
       ↓↑ 持久化 / 快取
Google Cloud Firestore  ←→  記憶體 fallback（USE_FIRESTORE=false）
```

- 前後端完全分離，透過 RESTful API 通信
- 所有需要身份的 API 以 `Authorization: Bearer <token>` 驗證
- 角色分為 `admin` 與 `judge`；不同角色看到不同介面與可用端點
- Firestore 與記憶體雙模式可透過 `USE_FIRESTORE` 環境變數切換

---

## 🔧 開發環境設定

### 推薦 IDE
- **VS Code** 搭配：ES7+ React snippets、Python、Prettier、REST Client

### 調試工具
- **Chrome DevTools**: F12（JavaScript & Network）
- **FastAPI Swagger UI**: http://localhost:8000/docs
- **Postman 集合**: `FundThePitch.postman_collection.json`（根目錄）

---

## 📂 項目結構詳解

### 後端結構
```
backend/
├── main.py              # 所有路由、業務邏輯、Pydantic 模型（約 2100 行）
├── firestore_db.py      # Firestore 讀寫封裝（可停用改用記憶體）
└── keys/
    └── *.json           # Firebase 服務帳號金鑰（勿上傳 Git）
```
├── routes/
│   ├── projects.py
│   ├── investments.py
│   └── judges.py
├── services/
│   └── investment_service.py
├── database/
│   └── firestore.py
└── tests/
    └── test_api.py
```

### 前端結構
```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── App.tsx          # 頂層：認證、視圖路由（lobby/judge/dashboard/admin）
│   ├── index.tsx        # React 進入點
│   ├── components/
│   │   ├── JudgeUI.tsx  # 評審投資介面（草稿暫存 + 鎖定提交）
│   │   └── Dashboard.tsx# 現場儀表板（比較圖 + 簡報模式排名揭曉）
│   └── styles/
│       └── App.css      # 全域樣式與動畫
├── .env                 # REACT_APP_API_URL
└── package.json         # 依賴：React 18、Recharts 2.10、Axios 1.6、TypeScript 4.9
```

---

## 🔄 開發工作流程

### 1. 添加新 API 端點

**後端 (backend/main.py)：**
```python
@app.post("/api/new_endpoint")
def new_endpoint(data: InputModel):
    """
    功能說明
    """
    # 業務邏輯
    return {"result": "data"}
```

**前端 (axios 調用)：**
```javascript
import axios from 'axios';

const response = await axios.post(
  `${API_BASE_URL}/api/new_endpoint`,
  data
);
```

### 2. 添加新 UI 元件

**創建新組件：**
```javascript
// src/components/NewComponent.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function NewComponent() {
  const [data, setData] = useState([]);

  useEffect(() => {
    // 組件掛載時的邏輯
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await axios.get(API_URL);
      setData(response.data);
    } catch (err) {
      console.error('Error:', err);
    }
  };

  return <div>...</div>;
}

export default NewComponent;
```

**在 App.tsx 中使用：**
```javascript
import NewComponent from './components/NewComponent';

function App() {
  return (
    <>
      <Navigation />
      <NewComponent />
    </>
  );
}
```

---

## 🚨 常見開發任務

### 添加新專題

**編輯 backend/main.py：**
```python
projects = [
    # ... 現有專題
    {
        "id": "proj_005",
        "name": "新專題名稱",
        "total_investment": 0
    }
]
```

### 修改驗證規則

**編輯 backend/main.py 中的 submit_investment 函數：**
```python
@app.post("/api/submit_investment")
def submit_investment(data: InvestmentData):
    # 添加新驗證邏輯
    if some_condition:
        raise HTTPException(status_code=400, detail="錯誤信息")
    # ...
```

### 改變圖表外觀

**編輯 frontend/src/components/Dashboard.tsx：**
```javascript
// 修改顏色
const COLOR_PALETTE = ['#新顏色1', '#新顏色2'];

// 修改圖表屬性
<BarChart data={chartData} margin={{ ... }}>
```

### 調整 CSS 樣式

**編輯 frontend/src/styles/App.css：**
```css
/* 修改段落樣式 */
.investment-item {
    padding: 新值;
    background-color: 新顏色;
    /* ... */
}
```

### 自訂成員管理 UI

**編輯 frontend/src/App.tsx - renderMemberManagement()：**
```typescript
// 修改會場分組邏輯
const groupedMembers: { [key: string]: Member[] } = {};
currentCampaign.venues.forEach((venue) => {
  groupedMembers[venue.id] = currentCampaign!.members.filter((m) => m.venue_id === venue.id);
});

// 自訂成員卡片樣式
<div className="member-card" onClick={() => setSelectedMember(member)}>
  {member.name}
</div>
```

**修改 CSS 樣式：**
```css
/** frontend/src/styles/App.css */
.member-card {
  /* 自訂卡片外觀 */
  border-color: #f0ad4e;  /* 黃金色邊框 */
  background-color: #2a3a4a;  /* 深藍背景 */
}

.member-card:hover {
  /* 自訂 Hover 效果 */
  transform: scale(1.05);
  box-shadow: 0 0 10px rgba(240, 173, 78, 0.3);
}
```

### 修改投資排名顯示

**編輯 frontend/src/App.tsx - 投資排名計算部分：**
```typescript
// 自訂排名計算邏輯
const projectTotals: { [key: string]: { total: number; project: any; venueId?: string } } = {};
Object.entries(selectedCampaignDetail.investment_data || {}).forEach(([judgeId, judgements]) => {
  // 自訂投資數據聚合邏輯
  Object.entries(judgements as Record<string, number>).forEach(([projectId, amount]) => {
    // ...
  });
});

// 自訂排序邏輯
const sortedProjects = Object.entries(projectTotals)
  .sort((a, b) => b[1].total - a[1].total)  // 按投資金額降序
  .map(([_, data]) => data);
```

---

## � 認證機制（已實作）

系統使用自行實作的 JWT（無第三方 Auth 服務）：

1. `POST /api/judges/login` → 傳回 `access_token`（JWT）
2. 前端將 token 存入 `localStorage`，後續請求加入 `Authorization: Bearer <token>` header
3. 後端 `get_current_user()` 解析 token，`require_roles()` 做角色保護
4. Token 預設有效 48 小時（`TOKEN_TTL_HOURS`）
5. 頁面重整時自動嘗試恢復 session（`/api/auth/me` 驗證現有 token）

---

## 🗄️ Firestore 資料結構（已整合）

Firestore 已與後端完全整合，透過 `FirestoreDB` 類別封裝：

| Collection | 說明 |
|-----------|------|
| `verified_users` | 已驗證用戶，key：`{year}::{identifier}` |
| `campaigns` | 場次記錄（active / closed） |
| `recently_deleted` | 軟刪除場次（30 天保留期）|
| `venue_projects` | 各會場的專題清單與投資金額 |
| `venue_judge_investments` | 各評審對各專題的個別投資明細 |

金鑰設定：
```bash
# 使用預設路徑（backend/keys/*.json）
python backend/main.py

# 或自訂路徑
export FIREBASE_CREDENTIALS_PATH=/path/to/key.json

# 停用 Firestore，改用純記憶體模式
export USE_FIRESTORE=false
```

---

## 🗑️ 場次刪除與級聯清理

刪除封存場次時：
1. 場次移入 `recently_deleted`（軟刪除，30 天可還原）
2. 30 天後系統自動永久刪除，同時清除該年份所有 `verified_users`

`POST /api/admin/system/archives/{id}/restore` 可在期限內還原。

---

## 📊 數據庫級聯刪除設計

**場次刪除流程**：
```
管理員刪除場次 → 驗證場次為 closed 狀態
  ↓
移入 recently_deleted（保留 30 天）
  ↓ （30 天後或管理員主動「永久刪除」）
永久刪除 → 清除該年份 verified_users → 清除 venue_projects / investments
```

相關 API：
- `DELETE /api/admin/system/archives/{id}` — 軟刪除
- `POST /api/admin/system/archives/{id}/restore` — 還原
- `DELETE /api/admin/system/archives/{id}/permanent-delete` — 永久刪除

---

## 📊 性能優化建議

### 前端
- 使用 React.memo 防止不必要重新渲染
- 使用 useMemo 緩存計算結果
- 代碼分割 (Code Splitting) 優化首屏加載
- 壓縮圖片資源

### 後端
- 添加數據庫索引提升查詢速度
- 實現結果緩存 (Redis)
- 異步處理耗時操作
- 使用 pagination 處理大量數據

---

## 🧪 測試最佳實踐

### 後端單元測試
```python
# tests/test_api.py
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_get_projects():
    response = client.get("/api/projects")
    assert response.status_code == 200
    assert "projects" in response.json()

def test_submit_investment_success():
    data = {
        "investments": {"proj_001": 2500, ...},
        "judge_id": "judge_001"
    }
    response = client.post("/api/submit_investment", json=data)
    assert response.status_code == 200
```

### 前端組件測試
```javascript
// src/components/__tests__/JudgeUI.test.js
import { render, screen } from '@testing-library/react';
import JudgeUI from '../JudgeUI';

test('renders submit button', () => {
  render(<JudgeUI />);
  const button = screen.getByText(/提交投資/i);
  expect(button).toBeInTheDocument();
});
```

---

## 📝 代碼風格指南

### Python (PEP 8)
```python
# ✅ 好
def calculate_remaining_budget(total_invested: float) -> float:
    """計算剩餘預算"""
    return 10000 - total_invested

# ❌ 不好
def calc(x):
    return 10000 - x
```

### JavaScript (ES6+)
```javascript
// ✅ 好
const getTotalInvested = () => {
  return Object.values(investments).reduce((a, b) => a + b, 0);
};

// ❌ 不好
function getTotal() {
  let sum = 0;
  for (let key in investments) {
    sum += investments[key];
  }
  return sum;
}
```

---

## 🐛 調試技巧

### 後端調試
```python
# 在 FastAPI 中添加日誌
import logging
logging.debug(f"投資數據: {investments}")

# 使用 print 輸出 (開發環境)
print("Debug point:", variable)
```

### 前端調試
```javascript
// Console 日誌
console.log('Projects:', projects);
console.error('Error:', error);

// React DevTools 擴展
// 監視組件狀態和 Props

// Network 標籤
// 查看 API 請求和回應
```

---

## 📚 有用資源

### 官方文檔
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Recharts](https://recharts.org/)
- [Axios](https://axios-http.com/)

### 社區資源
- Stack Overflow
- GitHub Issues
- Reddit (r/webdev, r/learnprogramming)

---

## 🎯 下一步推薦

1. **WebSocket 即時更新** → 取代 2 秒輪詢，改善延遲
2. **Firebase Authentication** → 整合 Google / Email 身份驗證
3. **Progressive Web App (PWA)** → 評審可「安裝」到手機桌面
4. **匯出功能** → PDF / CSV 投資摘要報表
5. **國際化** → i18n 多語言支持

---

祝開發愉快！如有問題，請參考 [QUICKSTART.md](QUICKSTART.md) 或 http://localhost:8000/docs。
