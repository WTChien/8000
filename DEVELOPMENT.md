# 👨‍💻 開發指南 - FundThePitch

## 🏗️ 架構概覽

```
Browser (React App)
       ↓↑ REST API (Axios)
Backend (FastAPI)
       ↓↑ Memory/DB
Mock Data (NoSQL Structure)
```

### 前後端分離原則
- 前端只負責 UI 和用戶交互
- 後端負責業務邏輯和數據驗證
- 通過 RESTful API 進行通信

---

## 🔧 開發環境設定

### 推薦 IDE
- **VS Code**: https://code.visualstudio.com
  - 推薦擴展：
    - ES7+ React/Redux/React-Native snippets
    - Python
    - REST Client
    - Prettier - Code formatter

### 調試工具
- **Chrome DevTools**: F12 (JavaScript & Network)
- **FastAPI Swagger UI**: http://localhost:8000/docs
- **Postman**: 進行 API 測試

---

## 📂 項目結構詳解

### 後端結構
```
backend/
├── main.py              # 主應用 (所有代碼在此)
│   ├── FastAPI 初始化
│   ├── CORS 配置
│   ├── Mock Data
│   ├── Pydantic 模型
│   └── API 路由
```

**未來可擴展為：**
```
backend/
├── main.py              # 應用進入點
├── config.py            # 配置
├── models/
│   ├── project.py
│   └── judge.py
├── schemas/
│   ├── project.py
│   └── investment.py
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
│   └── index.html       # HTML 模板
├── src/
│   ├── components/
│   │   ├── JudgeUI.tsx   # 評審投資介面
│   │   └── Dashboard.tsx # 儀表板
│   ├── styles/
│   │   └── App.css      # 全域樣式
│   ├── App.tsx          # 主元件 (路由)
│   ├── index.tsx        # React 進入點
│   └── utils/           # 工具函數
├── .env                 # 環境變數
└── package.json
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

## 🔗 集成 Google Cloud Firestore

### 步驟 1：安裝依賴
```bash
pip install firebase-admin
```

### 步驟 2：創建 database/firestore.py
```python
import firebase_admin
from firebase_admin import credentials, firestore

# 初始化 Firebase
cred = credentials.Certificate('path/to/serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

class FirestoreDB:
    @staticmethod
    def get_projects():
        docs = db.collection('projects').stream()
        return [doc.to_dict() for doc in docs]
    
    @staticmethod
    def update_project(project_id, data):
        db.collection('projects').document(project_id).update(data)
```

### 步驟 3：修改 main.py
```python
from database.firestore import FirestoreDB

@app.get("/api/projects")
def get_projects():
    # 替換記憶體數據
    projects = FirestoreDB.get_projects()
    return ProjectsListResponse(...)
```

---

## 🔐 添加身份驗證 (JWT)

### 安裝依賴
```bash
pip install python-jose passlib python-dotenv
```

### 創建 auth.py
```python
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import Depends, HTTPException

SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

### 在路由中使用
```python
@app.post("/api/submit_investment")
def submit_investment(data: InvestmentData, token: str = Header()):
    user = verify_token(token)
    # 使用 user 信息進行業務邏輯
    # ...
```

---

## 📊 數據庫級聯刪除設計

### Firestore 實現

**在 firestore_db.py 中添加的方法：**
```python
def delete_verified_users_by_year(self, campaign_year: int) -> int:
    """Delete all verified users associated with a specific campaign year."""
    if not self.enabled or self._client is None:
        return 0

    docs = self._client.collection("verified_users").stream()
    deleted_count = 0
    for doc in docs:
        row = doc.to_dict() or {}
        if row.get("campaign_year") == campaign_year:
            doc.reference.delete()
            deleted_count += 1
    return deleted_count
```

### 場次刪除時的級聯邏輯

**修改後的 delete_archived_campaign() 函數：**
```python
@app.delete("/api/admin/system/archives/{campaign_id}")
def delete_archived_campaign(
    campaign_id: str,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    # ... 驗證邏輯 ...
    
    # 級聯刪除關聯的成員數據
    if db.enabled:
        db.delete_verified_users_by_year(target_year)
    else:
        # 內存模式：清理該年份的所有成員
        verified_users_to_remove = [
            key for key in list(verified_users.keys())
            if key.startswith(f"{target_year}::")
        ]
        for key in verified_users_to_remove:
            verified_users.pop(key, None)
    
    # ... 後續邏輯 ...
```

### 工作流程

```
刪除場次 → 驗證年份 → 級聯刪除成員
                    ├─ Firestore: delete verified_users collection docs
                    └─ 內存模式: remove keys from verified_users dict
                           ↓
                    更新場次狀態 → 返回成功
```

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

1. **集成真實數據庫** → Google Cloud Firestore
2. **添加身份驗證** → Firebase Auth 或 JWT
3. **實時更新** → WebSocket 或 Firebase Realtime
4. **數據分析** → 添加投票統計功能
5. **移動適配** → Progressive Web App (PWA)
6. **國際化** → i18n 多語言支持

---

祝開發愉快！如有問題，請參考官方文檔或提交 Issue。
