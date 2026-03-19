import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import JudgeUI from './components/JudgeUI';
import Dashboard from './components/Dashboard';

type ViewMode = 'lobby' | 'judge' | 'dashboard' | 'admin';
type AdminTab = 'venues' | 'members';

type Role = 'admin' | 'judge';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const TOKEN_STORAGE_KEY = 'fundthepitch_auth_token';
const USER_STORAGE_KEY = 'fundthepitch_auth_user';

interface Venue {
  id: string;
  name: string;
  classroom: string;
  judges: string[];
  projects: string[];
}

interface AuthUser {
  user_id: string;
  identifier: string;
  role: Role;
  display_name: string;
  venue_id?: string | null;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

interface JudgeStatus {
  identifier: string;
  display_name: string;
  role: Role;
  assigned_venue_id?: string | null;
  is_voted: boolean;
}

interface AdminMember {
  identifier: string;
  display_name: string;
  role: Role;
  assigned_venue_id?: string | null;
  is_voted: boolean;
}

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('lobby');
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatus | null>(null);

  const [displayNameInput, setDisplayNameInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [dashboardVenueId, setDashboardVenueId] = useState('');

  const [members, setMembers] = useState<AdminMember[]>([]);
  const [newVenueName, setNewVenueName] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<Role>('judge');
  const [adminTab, setAdminTab] = useState<AdminTab>('venues');
  const [memberEditName, setMemberEditName] = useState<Record<string, string>>({});
  const [memberEditRole, setMemberEditRole] = useState<Record<string, Role>>({});
  const [venueEditName, setVenueEditName] = useState<Record<string, string>>({});
  const [venueEditClassroom, setVenueEditClassroom] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authHeaders = useMemo(() => {
    if (!authToken) {
      return undefined;
    }
    return { Authorization: `Bearer ${authToken}` };
  }, [authToken]);

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId),
    [venues, selectedVenueId]
  );

  const parseAxiosError = useCallback((err: unknown): string => {
    if (!axios.isAxiosError(err)) {
      return '未知錯誤';
    }
    return ((err.response?.data as { detail?: string } | undefined)?.detail || err.message);
  }, []);

  const loadVenues = useCallback(async () => {
    try {
      const response = await axios.get<Venue[]>(`${API_BASE_URL}/api/venues`);
      setVenues(response.data);
      const names: Record<string, string> = {};
      const classrooms: Record<string, string> = {};
      for (const venue of response.data) {
        names[venue.id] = venue.name;
        classrooms[venue.id] = venue.classroom;
      }
      setVenueEditName(names);
      setVenueEditClassroom(classrooms);
      const firstVenueId = response.data[0]?.id;
      if (firstVenueId) {
        setSelectedVenueId((prev) => prev || firstVenueId);
        setDashboardVenueId((prev) => prev || firstVenueId);
      }
    } catch (err: unknown) {
      setError('讀取會場資料失敗：' + parseAxiosError(err));
    }
  }, [parseAxiosError]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  const refreshJudgeStatus = useCallback(async (headers = authHeaders) => {
    if (!headers) {
      return;
    }

    try {
      const response = await axios.get<JudgeStatus>(`${API_BASE_URL}/api/judges/status`, {
        headers
      });
      setJudgeStatus(response.data);

      const nextVenueId = response.data.assigned_venue_id || null;
      if (nextVenueId) {
        setDashboardVenueId(nextVenueId);
      }
      setAuthUser((prev) => {
        if (!prev) {
          return prev;
        }
        const nextUser = { ...prev, venue_id: nextVenueId };
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
        return nextUser;
      });
    } catch (err: unknown) {
      setError('讀取評審狀態失敗：' + parseAxiosError(err));
    }
  }, [authHeaders, parseAxiosError]);

  useEffect(() => {
    if (!authHeaders) {
      return;
    }
    refreshJudgeStatus(authHeaders);
  }, [authHeaders, refreshJudgeStatus]);

  const saveAuth = (auth: AuthResponse) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, auth.access_token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth.user));
    setAuthToken(auth.access_token);
    setAuthUser(auth.user);
    setMessage(`登入成功，歡迎 ${auth.user.display_name}`);
    setError(null);
    setCurrentView('lobby');
  };

  const loginWithName = async () => {
    if (isLoggingIn) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsLoggingIn(true);

    try {
      const response = await axios.post<AuthResponse>(`${API_BASE_URL}/api/judges/login`, {
        display_name: displayNameInput
      });
      saveAuth(response.data);
    } catch (err: unknown) {
      setError('登入失敗：' + parseAxiosError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    if (authHeaders) {
      try {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { headers: authHeaders });
      } catch {
        // Ignore logout network failures.
      }
    }

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setAuthToken(null);
    setAuthUser(null);
    setJudgeStatus(null);
    setCurrentView('lobby');
    setMessage('已登出');
  };

  const joinVenue = async () => {
    if (!authHeaders || !selectedVenueId) {
      return;
    }
    setError(null);
    setMessage(null);

    try {
      await axios.post(
        `${API_BASE_URL}/api/judges/join-venue`,
        { venue_id: selectedVenueId },
        { headers: authHeaders }
      );

      const nextUser: AuthUser = {
        ...(authUser as AuthUser),
        venue_id: selectedVenueId
      };
      setAuthUser(nextUser);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
      setDashboardVenueId(selectedVenueId);
      await refreshJudgeStatus();
      setCurrentView('judge');
      setMessage('加入會場成功');
    } catch (err: unknown) {
      setError('加入會場失敗：' + parseAxiosError(err));
    }
  };

  const leaveVenue = async () => {
    if (!authHeaders) {
      return;
    }
    setError(null);
    setMessage(null);

    try {
      await axios.post(`${API_BASE_URL}/api/judges/leave-venue`, {}, { headers: authHeaders });
      const nextUser = authUser ? { ...authUser, venue_id: null } : authUser;
      if (nextUser) {
        setAuthUser(nextUser);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
      }
      await refreshJudgeStatus();
      setCurrentView('lobby');
      setMessage('已離開會場，請重新選擇會議廳');
    } catch (err: unknown) {
      setError('離開會場失敗：' + parseAxiosError(err));
    }
  };

  const loadMembers = useCallback(async () => {
    if (!authHeaders || authUser?.role !== 'admin') {
      return;
    }
    try {
      const response = await axios.get<{ members: AdminMember[] }>(`${API_BASE_URL}/api/admin/members`, {
        headers: authHeaders
      });
      setMembers(response.data.members);
      const names: Record<string, string> = {};
      const roles: Record<string, Role> = {};
      for (const member of response.data.members) {
        names[member.identifier] = member.display_name;
        roles[member.identifier] = member.role;
      }
      setMemberEditName(names);
      setMemberEditRole(roles);
    } catch (err: unknown) {
      setError('讀取成員失敗：' + parseAxiosError(err));
    }
  }, [authHeaders, authUser?.role, parseAxiosError]);

  const loadAdminData = useCallback(async () => {
    await loadVenues();
    await loadMembers();
  }, [loadMembers, loadVenues]);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      loadAdminData();
    }
  }, [authUser?.role, loadAdminData]);

  const createVenue = async () => {
    if (!authHeaders || !newVenueName.trim()) {
      return;
    }
    try {
      await axios.post(
        `${API_BASE_URL}/api/admin/venues`,
        { name: newVenueName, classroom: '待公布教室' },
        { headers: authHeaders }
      );
      setNewVenueName('');
      setMessage('會場新增成功');
      await loadVenues();
    } catch (err: unknown) {
      setError('新增會場失敗：' + parseAxiosError(err));
    }
  };

  const updateVenue = async (venueId: string) => {
    if (!authHeaders) {
      return;
    }
    const name = (venueEditName[venueId] || '').trim();
    const classroom = (venueEditClassroom[venueId] || '').trim();
    if (!name) {
      return;
    }
    try {
      await axios.put(
        `${API_BASE_URL}/api/admin/venues/${venueId}`,
        { name, classroom: classroom || '待公布教室' },
        { headers: authHeaders }
      );
      setMessage('會場名稱已更新');
      await loadVenues();
    } catch (err: unknown) {
      setError('更新會場失敗：' + parseAxiosError(err));
    }
  };

  const deleteVenue = async (venueId: string) => {
    if (!authHeaders) {
      return;
    }
    try {
      await axios.delete(`${API_BASE_URL}/api/admin/venues/${venueId}`, { headers: authHeaders });
      setMessage('會場已刪除');
      await loadVenues();
    } catch (err: unknown) {
      setError('刪除會場失敗：' + parseAxiosError(err));
    }
  };

  const createMember = async () => {
    if (!authHeaders || !newMemberName.trim()) {
      return;
    }
    try {
      await axios.post(
        `${API_BASE_URL}/api/admin/members`,
        { display_name: newMemberName, role: newMemberRole },
        { headers: authHeaders }
      );
      setNewMemberName('');
      setNewMemberRole('judge');
      setMessage('成員新增成功');
      await loadMembers();
    } catch (err: unknown) {
      setError('新增成員失敗：' + parseAxiosError(err));
    }
  };

  const updateMember = async (identifier: string) => {
    if (!authHeaders) {
      return;
    }
    try {
      await axios.patch(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}`,
        {
          display_name: memberEditName[identifier],
          role: memberEditRole[identifier]
        },
        { headers: authHeaders }
      );
      setMessage('成員資料已更新');
      await loadMembers();
    } catch (err: unknown) {
      setError('更新成員失敗：' + parseAxiosError(err));
    }
  };

  const deleteMember = async (identifier: string) => {
    if (!authHeaders) {
      return;
    }
    try {
      await axios.delete(`${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}`, {
        headers: authHeaders
      });
      setMessage('成員已刪除');
      await loadMembers();
    } catch (err: unknown) {
      setError('刪除成員失敗：' + parseAxiosError(err));
    }
  };

  const unlockMember = async (identifier: string) => {
    if (!authHeaders) {
      return;
    }
    try {
      await axios.post(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/unlock`,
        {},
        { headers: authHeaders }
      );
      setMessage('已解除鎖定');
      await loadMembers();
    } catch (err: unknown) {
      setError('解除鎖定失敗：' + parseAxiosError(err));
    }
  };

  const renderLogin = () => (
    <div className="container" style={{ maxWidth: 720, marginTop: 36 }}>
      <section className="section">
        <h2>登入</h2>
        <p>請先輸入評審姓名，系統將以姓名建立本次登入身份。</p>
      </section>

      <section className="section judge-form">
        <div className="form-group">
          <label>評審姓名</label>
          <input
            className="investment-input"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            placeholder="例如：王老師"
          />
        </div>

        <button className="submit-button" onClick={loginWithName} disabled={isLoggingIn}>
          {isLoggingIn ? (
            <span className="button-loading">
              <span className="button-spinner" aria-hidden="true"></span>
              正在登入中...
            </span>
          ) : '進入系統'}
        </button>
      </section>
    </div>
  );

  const renderLobby = () => (
    <div className="container" style={{ maxWidth: 820, marginTop: 24 }}>
      <section className="section">
        <h2>選擇專題發表廳</h2>
        <p>先看每個會場資訊再選擇加入，包含教室、評審老師與該會場專題組別。</p>
      </section>

      <section className="section judge-form">
        <div className="form-group">
          <label>目前登入者</label>
          <p><strong>{authUser?.display_name}</strong></p>
        </div>

        {selectedVenue && (
          <div className="investment-item">
            <h3 style={{ marginBottom: 8 }}>{selectedVenue.name}</h3>
            <p style={{ marginBottom: 8 }}>教室：<strong>{selectedVenue.classroom}</strong></p>
            <p style={{ marginBottom: 8 }}>
              目前老師：
              <strong>{selectedVenue.judges.length > 0 ? ` ${selectedVenue.judges.join('、')}` : ' 尚無老師加入'}</strong>
            </p>
            <p style={{ marginBottom: 8 }}>專題組別：</p>
            <div className="lobby-tags">
              {selectedVenue.projects.map((project) => (
                <span key={project} className="lobby-tag">{project}</span>
              ))}
            </div>
          </div>
        )}

        <div className="lobby-grid">
          {venues.map((venue) => {
            const joinedVenueId = judgeStatus?.assigned_venue_id || authUser?.venue_id || null;
            const isLockedToAnotherVenue = Boolean(joinedVenueId && joinedVenueId !== venue.id);
            return (
              <button
                key={venue.id}
                type="button"
                className={`lobby-card ${selectedVenueId === venue.id ? 'active' : ''}`}
                disabled={isLockedToAnotherVenue}
                onClick={() => setSelectedVenueId(venue.id)}
              >
                <h3>{venue.name}</h3>
                <p>教室：{venue.classroom}</p>
                <p>老師數：{venue.judges.length}</p>
                <p>專題數：{venue.projects.length}</p>
              </button>
            );
          })}
        </div>

        <div className="nav-buttons" style={{ marginTop: 12 }}>
          {!judgeStatus?.assigned_venue_id && (
            <button className="active" onClick={joinVenue}>加入這個會場</button>
          )}
          {judgeStatus?.assigned_venue_id && !judgeStatus.is_voted && (
            <button onClick={leaveVenue}>離開目前會場</button>
          )}
        </div>
      </section>
    </div>
  );

  const renderAdmin = () => (
    <div className="container">
      <section className="section">
        <h2>管理員控制台</h2>
        <p>可管理會場與評審成員，並可手動解除評審鎖定狀態。</p>
        <div className="nav-buttons admin-tabs" style={{ marginTop: 12 }}>
          <button
            className={adminTab === 'venues' ? 'active' : ''}
            onClick={() => setAdminTab('venues')}
          >
            會場管理
          </button>
          <button
            className={adminTab === 'members' ? 'active' : ''}
            onClick={() => setAdminTab('members')}
          >
            成員管理
          </button>
        </div>
      </section>

      {adminTab === 'venues' && <section className="section judge-form">
        <h3>會場管理（新增 / 修改 / 刪除）</h3>
        <div className="form-group">
          <label>新增會場</label>
          <div className="input-group">
            <input
              className="investment-input"
              value={newVenueName}
              onChange={(e) => setNewVenueName(e.target.value)}
              placeholder="例如：C 會場"
            />
            <button onClick={createVenue}>新增</button>
          </div>
        </div>
        {venues.map((venue) => (
          <div key={venue.id} className="investment-item">
            <div className="input-group">
              <input
                className="investment-input"
                value={venueEditName[venue.id] ?? venue.name}
                onChange={(e) => setVenueEditName((prev) => ({ ...prev, [venue.id]: e.target.value }))}
              />
              <input
                className="investment-input"
                value={venueEditClassroom[venue.id] ?? venue.classroom}
                onChange={(e) => setVenueEditClassroom((prev) => ({ ...prev, [venue.id]: e.target.value }))}
                placeholder="教室名稱"
              />
              <button onClick={() => updateVenue(venue.id)}>修改</button>
              <button onClick={() => deleteVenue(venue.id)}>刪除</button>
            </div>
          </div>
        ))}
      </section>}

      {adminTab === 'members' && <section className="section judge-form">
        <h3>成員管理（新增 / 修改 / 刪除）</h3>
        <div className="investment-item">
          <div className="input-group">
            <input
              className="investment-input"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="評審姓名"
            />
            <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value as Role)}>
              <option value="judge">judge</option>
              <option value="admin">admin</option>
            </select>
            <button onClick={createMember}>新增</button>
          </div>
        </div>

        {members.map((member) => (
          <div key={member.identifier} className="investment-item">
            <p style={{ marginBottom: 8 }}>帳號：{member.identifier}</p>
            <p style={{ marginBottom: 8 }}>狀態：{member.assigned_venue_id || '未加入會場'} / {member.is_voted ? '已確認送出' : '尚未送出'}</p>
            <div className="input-group">
              <input
                className="investment-input"
                value={memberEditName[member.identifier] ?? member.display_name}
                onChange={(e) => setMemberEditName((prev) => ({ ...prev, [member.identifier]: e.target.value }))}
              />
              <select
                value={memberEditRole[member.identifier] ?? member.role}
                onChange={(e) => setMemberEditRole((prev) => ({ ...prev, [member.identifier]: e.target.value as Role }))}
              >
                <option value="judge">judge</option>
                <option value="admin">admin</option>
              </select>
              {member.is_voted && (
                <button onClick={() => unlockMember(member.identifier)}>解除鎖定</button>
              )}
              <button onClick={() => updateMember(member.identifier)}>修改</button>
              <button onClick={() => deleteMember(member.identifier)}>刪除</button>
            </div>
          </div>
        ))}
      </section>}
    </div>
  );

  const hasVenue = Boolean(authUser?.venue_id);
  const canSeeDashboard = authUser?.role === 'admin' ? Boolean(dashboardVenueId) : hasVenue;

  return (
    <div className="app-container">
      <div className="navigation">
        <h1>FundThePitch - 專題模擬投資評分系統</h1>
        {authUser && (
          <div className="nav-buttons">
            <button
              onClick={() => setCurrentView('lobby')}
              className={currentView === 'lobby' ? 'active' : ''}
            >
              會場選擇
            </button>
            <button
              disabled={!hasVenue}
              onClick={() => setCurrentView('judge')}
              className={currentView === 'judge' ? 'active' : ''}
            >
              評審投資
            </button>
            <button
              disabled={authUser.role !== 'admin' && !hasVenue}
              onClick={() => setCurrentView('dashboard')}
              className={currentView === 'dashboard' ? 'active' : ''}
            >
              會場投資戰況
            </button>
            {authUser.role === 'admin' && (
              <button
                onClick={() => setCurrentView('admin')}
                className={currentView === 'admin' ? 'active' : ''}
              >
                管理員
              </button>
            )}
            <button onClick={logout}>登出</button>
          </div>
        )}
      </div>

      <div className="content">
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        {!authUser && renderLogin()}

        {authUser && currentView === 'lobby' && renderLobby()}

        {authUser && currentView === 'judge' && authToken && hasVenue && (
          <JudgeUI
            authToken={authToken}
            authUser={authUser}
            venueId={authUser.venue_id as string}
            isLocked={Boolean(judgeStatus?.is_voted)}
            onLeaveVenue={leaveVenue}
            onSubmitted={refreshJudgeStatus}
          />
        )}

        {authUser && currentView === 'dashboard' && canSeeDashboard && (
          <div>
            {authUser.role === 'admin' && (
              <div className="container" style={{ maxWidth: 920, marginBottom: 16 }}>
                <section className="section">
                  <h3>管理員觀看會場戰況</h3>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>切換會場</label>
                    <select value={dashboardVenueId} onChange={(e) => setDashboardVenueId(e.target.value)}>
                      {venues.map((venue) => (
                        <option key={venue.id} value={venue.id}>{venue.name}</option>
                      ))}
                    </select>
                  </div>
                </section>
              </div>
            )}
            <Dashboard venueId={authUser.role === 'admin' ? dashboardVenueId : (authUser.venue_id as string)} />
          </div>
        )}

        {authUser && currentView === 'admin' && authUser.role === 'admin' && renderAdmin()}
      </div>
    </div>
  );
}

export default App;
