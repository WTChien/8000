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
const DISPLAY_NAME_SESSION_KEY = 'fundthepitch_display_name';

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
  campaign_year?: number | null;
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
  campaign_year?: number | null;
}

interface AdminMember {
  identifier: string;
  display_name: string;
  role: Role;
  assigned_venue_id?: string | null;
  is_voted: boolean;
  campaign_year?: number | null;
}

interface SystemCampaign {
  id: string;
  year: number;
  label: string;
  status: 'active' | 'closed';
  started_at: string;
  closed_at?: string | null;
  summary?: {
    overall_total_investment?: number;
  };
}

interface AdminSystemState {
  current_campaign?: SystemCampaign | null;
  campaigns_by_year: Record<string, SystemCampaign[]>;
}

interface AdminMembersResponse {
  members: AdminMember[];
  year: number;
}

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('lobby');
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatus | null>(null);

  const [displayNameInput, setDisplayNameInput] = useState<string>(() => sessionStorage.getItem(DISPLAY_NAME_SESSION_KEY) || '');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);

  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [dashboardVenueId, setDashboardVenueId] = useState('');
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const [members, setMembers] = useState<AdminMember[]>([]);
  const [newVenueName, setNewVenueName] = useState('');
  const [campaignYearInput, setCampaignYearInput] = useState(String(new Date().getFullYear()));
  const [campaignLabelInput, setCampaignLabelInput] = useState('');
  const [selectedMemberYear, setSelectedMemberYear] = useState(String(new Date().getFullYear()));
  const [adminSystemState, setAdminSystemState] = useState<AdminSystemState>({ campaigns_by_year: {} });
  const [adminTab, setAdminTab] = useState<AdminTab>('members');
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

  const activeCampaign = adminSystemState.current_campaign ?? null;
  const isCampaignActive = Boolean(activeCampaign);
  const managementYear = activeCampaign?.year ?? (Number.parseInt(selectedMemberYear, 10) || new Date().getFullYear());
  const judgeMembers = members.filter((member) => member.role === 'judge');

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
      setSelectedVenueId((prev) => {
        if (prev && response.data.some((venue) => venue.id === prev)) {
          return prev;
        }
        return firstVenueId || '';
      });
      setDashboardVenueId((prev) => {
        if (prev && response.data.some((venue) => venue.id === prev)) {
          return prev;
        }
        return firstVenueId || '';
      });
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
        setDashboardVenueId((prev) => prev || nextVenueId);
      }
      setAuthUser((prev) => {
        if (!prev) {
          return prev;
        }
        const nextUser = {
          ...prev,
          venue_id: nextVenueId,
          campaign_year: response.data.campaign_year ?? prev.campaign_year ?? null
        };
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

  useEffect(() => {
    if (authUser?.role === 'admin' && !isCampaignActive && currentView === 'lobby') {
      setCurrentView('admin');
    }
  }, [authUser?.role, currentView, isCampaignActive]);

  const clearAuth = useCallback((clearDisplayName: boolean) => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    if (clearDisplayName) {
      sessionStorage.removeItem(DISPLAY_NAME_SESSION_KEY);
      setDisplayNameInput('');
    }
    setAuthToken(null);
    setAuthUser(null);
    setJudgeStatus(null);
    setCurrentView('lobby');
  }, []);

  const saveAuth = useCallback((auth: AuthResponse, showMessage = true) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, auth.access_token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth.user));
    sessionStorage.setItem(DISPLAY_NAME_SESSION_KEY, auth.user.display_name);
    setDisplayNameInput(auth.user.display_name);
    setAuthToken(auth.access_token);
    setAuthUser(auth.user);
    setMessage(showMessage ? `登入成功，歡迎 ${auth.user.display_name}` : null);
    setError(null);
    setCurrentView(auth.user.role === 'admin' ? 'admin' : 'lobby');
  }, []);

  const loginWithDisplayName = useCallback(async (rawName: string, showMessage = true): Promise<boolean> => {
    const normalizedName = rawName.trim();
    if (!normalizedName) {
      if (showMessage) {
        setError('請輸入評審姓名');
      }
      return false;
    }

    try {
      const response = await axios.post<AuthResponse>(`${API_BASE_URL}/api/judges/login`, {
        display_name: normalizedName
      });
      saveAuth(response.data, showMessage);
      return true;
    } catch (err: unknown) {
      if (showMessage) {
        setError('登入失敗：' + parseAxiosError(err));
      }
      return false;
    }
  }, [parseAxiosError, saveAuth]);

  const loginWithName = async () => {
    if (isLoggingIn) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsLoggingIn(true);

    try {
      await loginWithDisplayName(displayNameInput, true);
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    const restoreSession = async () => {
      if (isLoggingIn || isRestoringSession) {
        return;
      }

      const storedName = sessionStorage.getItem(DISPLAY_NAME_SESSION_KEY) || '';

      if (authToken) {
        try {
          await axios.get<AuthUser>(`${API_BASE_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          return;
        } catch (err: unknown) {
          if (!axios.isAxiosError(err) || err.response?.status !== 401) {
            return;
          }
          clearAuth(false);
        }
      }

      if (!storedName || authUser) {
        return;
      }

      setIsRestoringSession(true);
      const restored = await loginWithDisplayName(storedName, false);
      if (!restored) {
        clearAuth(false);
      }
      setIsRestoringSession(false);
    };

    restoreSession();
  }, [authToken, authUser, clearAuth, isLoggingIn, isRestoringSession, loginWithDisplayName]);

  const logout = async () => {
    if (authHeaders) {
      try {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { headers: authHeaders });
      } catch {
        // Ignore logout network failures.
      }
    }

    clearAuth(true);
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

  const loadMembers = useCallback(async (yearOverride?: number) => {
    if (!authHeaders || authUser?.role !== 'admin') {
      return;
    }
    const year = yearOverride ?? managementYear;
    try {
      const response = await axios.get<AdminMembersResponse>(`${API_BASE_URL}/api/admin/members`, {
        headers: authHeaders,
        params: { year }
      });
      setMembers(response.data.members);
      setSelectedMemberYear(String(response.data.year));
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
  }, [authHeaders, authUser?.role, managementYear, parseAxiosError]);

  const loadSystemState = useCallback(async () => {
    if (!authHeaders || authUser?.role !== 'admin') {
      return undefined;
    }
    try {
      const response = await axios.get<AdminSystemState>(`${API_BASE_URL}/api/admin/system-state`, {
        headers: authHeaders
      });
      setAdminSystemState(response.data);
      const activeYear = response.data.current_campaign?.year;
      if (activeYear) {
        setSelectedMemberYear(String(activeYear));
        setCampaignYearInput(String(activeYear));
        setAdminTab('venues');
      } else {
        setAdminTab('members');
      }
      return response.data;
    } catch (err: unknown) {
      setError('讀取場次狀態失敗：' + parseAxiosError(err));
      return undefined;
    }
  }, [authHeaders, authUser?.role, parseAxiosError]);

  const loadAdminData = useCallback(async () => {
    const systemState = await loadSystemState();
    await loadVenues();
    await loadMembers(systemState?.current_campaign?.year);
  }, [loadMembers, loadSystemState, loadVenues]);

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

  const startCampaign = async () => {
    if (!authHeaders) {
      return;
    }
    const parsedYear = Number.parseInt(campaignYearInput, 10);
    if (Number.isNaN(parsedYear)) {
      setError('請輸入正確年份');
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/api/admin/system/start`,
        {
          year: parsedYear,
          label: campaignLabelInput.trim() || undefined,
        },
        { headers: authHeaders }
      );
      setMessage('本年度專題模擬投資系統已啟動');
      setSelectedMemberYear(String(parsedYear));
      await Promise.all([loadSystemState(), loadMembers(parsedYear), loadVenues()]);
    } catch (err: unknown) {
      setError('啟動場次失敗：' + parseAxiosError(err));
    }
  };

  const closeCampaign = async () => {
    if (!authHeaders) {
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/api/admin/system/close`, {}, { headers: authHeaders });
      setMessage('本回專題模擬投資系統已關閉並封存');
      await Promise.all([loadSystemState(), loadMembers(Number.parseInt(selectedMemberYear, 10) || new Date().getFullYear()), loadVenues()]);
    } catch (err: unknown) {
      setError('關閉場次失敗：' + parseAxiosError(err));
    }
  };

  const updateMemberStatus = async (
    identifier: string,
    payload: { assigned_venue_id?: string | null; is_voted?: boolean }
  ) => {
    if (!authHeaders) {
      return;
    }
    try {
      await axios.patch(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/status`,
        payload,
        { headers: authHeaders, params: { year: managementYear } }
      );
      setMessage('評審狀態已更新');
      await loadMembers();
    } catch (err: unknown) {
      setError('更新評審狀態失敗：' + parseAxiosError(err));
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
        { headers: authHeaders, params: { year: managementYear } }
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
        headers: authHeaders,
        params: { year: managementYear }
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
        { headers: authHeaders, params: { year: managementYear } }
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
        <p>
          {isCampaignActive
            ? '先看每個會場資訊再選擇加入，包含教室、評審老師與該會場專題組別。'
            : '目前尚未啟動專題會，尚無會場資料可選擇。'}
        </p>
      </section>

      <section className="section judge-form">
        <div className="form-group">
          <label>目前登入者</label>
          <p><strong>{authUser?.display_name}</strong></p>
        </div>

        {isCampaignActive && selectedVenue && (
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

        {isCampaignActive && <div className="lobby-grid">
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
                <p>會議廳：{venue.classroom}</p>
                <p>評審人數：{venue.judges.length}</p>
                <p>專題組數：{venue.projects.length}</p>
              </button>
            );
          })}
        </div>}

        {isCampaignActive && <div className="nav-buttons" style={{ marginTop: 12 }}>
          {!judgeStatus?.assigned_venue_id && (
            <button className="active" onClick={joinVenue}>加入這個會場</button>
          )}
          {judgeStatus?.assigned_venue_id && !judgeStatus.is_voted && (
            <button onClick={leaveVenue}>離開目前會場</button>
          )}
        </div>}
      </section>
    </div>
  );

  const renderAdmin = () => (
    <div className="container admin-shell">
      <section className="section admin-hero">
        <div className="admin-hero-copy">
          <span className="admin-kicker">ADMIN CONSOLE</span>
          <h2>{isCampaignActive ? '場次進行中' : '尚未啟動專題會'}</h2>
          <p>
            {isCampaignActive
              ? `目前正在管理 ${activeCampaign?.year} 年 ${activeCampaign?.label}，可處理會場與評審狀態。`
              : '先完成年度設定與成員整理，再正式啟動本次專題模擬投資評分。未啟動前不顯示會場管理。'}
          </p>
        </div>

        <div className="admin-launch-panel">
          <div className="admin-status-badge">
            {isCampaignActive ? `進行中 ${activeCampaign?.year}` : '等待啟動'}
          </div>
          <h3>{isCampaignActive ? activeCampaign?.label : '建立下一個年度場次'}</h3>
          <div className="admin-launch-grid">
            <input
              className="investment-input"
              value={campaignYearInput}
              onChange={(e) => setCampaignYearInput(e.target.value)}
              placeholder="年份，例如 2026"
              disabled={isCampaignActive}
            />
            <input
              className="investment-input"
              value={campaignLabelInput}
              onChange={(e) => setCampaignLabelInput(e.target.value)}
              placeholder="場次名稱，例如 資管系畢業專題"
              disabled={isCampaignActive}
            />
          </div>
          <div className="admin-launch-actions">
            <button className="submit-button" onClick={startCampaign} disabled={isCampaignActive}>
              啟動本年度場次
            </button>
            {isCampaignActive && (
              <button onClick={closeCampaign}>
                關閉並封存本回
              </button>
            )}
          </div>
          <p className="admin-note">啟動時會重置該年度評審狀態；關閉後會保留年度封存紀錄。</p>
        </div>
      </section>

      <section className="section admin-history-section">
        <div className="admin-section-heading">
          <div>
            <h3>歷年封存紀錄</h3>
            <p>每年度的投資總額與場次狀態會保留在這裡。</p>
          </div>
        </div>
        <div className="admin-history-grid">
          {Object.keys(adminSystemState.campaigns_by_year).length === 0 && (
            <div className="investment-item admin-history-empty">
              <p>尚無場次紀錄</p>
            </div>
          )}
          {Object.entries(adminSystemState.campaigns_by_year)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(([year, campaigns]) => (
              <div key={year} className="investment-item admin-history-card">
                <p className="admin-history-year">{year}</p>
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="admin-history-row">
                    <strong>{campaign.label}</strong>
                    <span>{campaign.status === 'active' ? '進行中' : '已封存'}</span>
                    <span>
                      {campaign.summary?.overall_total_investment !== undefined
                        ? `總投資 ${campaign.summary.overall_total_investment.toLocaleString()} 元`
                        : '尚無統計'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </section>

      {(!isCampaignActive || adminTab === 'members') && <section className="section judge-form">
        <div className="admin-section-heading admin-member-toolbar">
          <div>
            <h3>成員管理</h3>
            <p>以年份切換成員資料。不同年度同名評審彼此獨立，不會沿用舊年度狀態。</p>
          </div>
          <div className="admin-year-picker">
            <label htmlFor="member-year">管理年份</label>
            <div className="input-group">
              <input
                id="member-year"
                className="investment-input"
                value={selectedMemberYear}
                onChange={(e) => setSelectedMemberYear(e.target.value)}
                disabled={isCampaignActive}
              />
              <button onClick={() => loadMembers(Number.parseInt(selectedMemberYear, 10) || new Date().getFullYear())}>
                讀取年份
              </button>
            </div>
          </div>
        </div>

        {judgeMembers.length === 0 && (
          <div className="investment-item">
            <p>{managementYear} 年目前尚無成員資料。</p>
          </div>
        )}

        {judgeMembers.map((member) => (
          <div key={`${managementYear}-${member.identifier}`} className="investment-item">
            <p style={{ marginBottom: 8 }}>帳號：{member.identifier}</p>
            <p style={{ marginBottom: 8 }}>年度：{managementYear} / 狀態：{member.assigned_venue_id || '未加入會場'} / {member.is_voted ? '已確認送出' : '尚未送出'}</p>
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

      {isCampaignActive && (
        <>
          <div className="section admin-tab-strip">
            <div className="nav-buttons admin-tabs">
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
          </div>

          {adminTab === 'venues' && <section className="section judge-form">
            <h3>會場管理（僅在場次啟動後開放）</h3>
            <p style={{ marginBottom: 12 }}>啟動後才需要處理會場、教室與各會場評審鎖定狀態。</p>
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

                <div style={{ marginTop: 12 }}>
                  <p style={{ marginBottom: 8 }}>
                    <strong>{venue.name}</strong> 會場評審狀態
                  </p>
                  {members
                    .filter((member) => member.role === 'judge' && member.assigned_venue_id === venue.id)
                    .map((member) => (
                      <div key={`${venue.id}-${member.identifier}`} className="input-group" style={{ marginBottom: 8 }}>
                        <input className="investment-input" value={member.display_name} readOnly />
                        <input
                          className="investment-input"
                          value={member.is_voted ? '已鎖定' : '可編輯'}
                          readOnly
                        />
                        {member.is_voted && (
                          <button onClick={() => updateMemberStatus(member.identifier, { is_voted: false })}>
                            解除鎖定
                          </button>
                        )}
                        <button onClick={() => updateMemberStatus(member.identifier, { assigned_venue_id: '', is_voted: false })}>
                          移出會場
                        </button>
                      </div>
                    ))}
                  {members.filter((member) => member.role === 'judge' && member.assigned_venue_id === venue.id).length === 0 && (
                    <p>此會場目前沒有已加入的評審。</p>
                  )}
                </div>
              </div>
            ))}
          </section>}
        </>
      )}
    </div>
  );

  const hasVenue = Boolean(authUser?.venue_id);
  const canSeeDashboard = isCampaignActive && Boolean(dashboardVenueId);
  const joinedVenueId = judgeStatus?.assigned_venue_id || authUser?.venue_id || null;

  return (
    <div className="app-container">
      {!isPresentationMode && (
        <div className="navigation">
          <h1>FundThePitch - 專題模擬投資評分系統</h1>
          {authUser && (
            <div className="nav-buttons">
              {authUser.role === 'admin' && (
                <button
                  onClick={() => setCurrentView('admin')}
                  className={currentView === 'admin' ? 'active' : ''}
                >
                  管理員
                </button>
              )}
              <button
                disabled={!isCampaignActive}
                onClick={() => setCurrentView('lobby')}
                className={currentView === 'lobby' ? 'active' : ''}
              >
                會場選擇
              </button>
              <button
                disabled={!isCampaignActive || !hasVenue}
                onClick={() => setCurrentView('judge')}
                className={currentView === 'judge' ? 'active' : ''}
              >
                評審投資
              </button>
              <button
                disabled={!isCampaignActive}
                onClick={() => setCurrentView('dashboard')}
                className={currentView === 'dashboard' ? 'active' : ''}
              >
                會場投資戰況
              </button>
              <button onClick={logout}>登出</button>
            </div>
          )}
        </div>
      )}

      <div className={isPresentationMode ? "content-presentation" : "content"}>
        {!isPresentationMode && error && <div className="error-message">{error}</div>}
        {!isPresentationMode && message && <div className="success-message">{message}</div>}

        {!authUser && renderLogin()}

        {authUser && currentView === 'lobby' && renderLobby()}

        {authUser && currentView === 'judge' && authToken && hasVenue && isCampaignActive && (
          <JudgeUI
            authToken={authToken}
            authUser={authUser}
            venueId={authUser.venue_id as string}
            isLocked={Boolean(judgeStatus?.is_voted)}
            onLeaveVenue={leaveVenue}
            onSubmitted={refreshJudgeStatus}
          />
        )}

        {authUser && currentView === 'judge' && !isCampaignActive && (
          <div className="container" style={{ maxWidth: 920 }}>
            <section className="section">
              <h3>評審投資</h3>
              <p>目前尚未啟動專題會，暫無投資與會場資料。</p>
            </section>
          </div>
        )}

        {authUser && currentView === 'dashboard' && canSeeDashboard && (
          <div>
            {!isPresentationMode && (
              <div className="container" style={{ maxWidth: 920, marginBottom: 16 }}>
                <section className="section">
                  <h3>跨會場投資戰況</h3>
                  <p style={{ marginBottom: 12 }}>所有人都可查看所有會場，即時切換觀察投資走勢。</p>
                  <div className="lobby-grid dashboard-venue-grid">
                    {venues.map((venue) => {
                      const isOwnVenue = joinedVenueId === venue.id;
                      return (
                        <button
                          key={venue.id}
                          type="button"
                          className={`lobby-card dashboard-venue-card ${dashboardVenueId === venue.id ? 'active' : ''} ${isOwnVenue ? 'my-venue' : ''}`}
                          onClick={() => setDashboardVenueId(venue.id)}
                        >
                          <h3>{venue.name}</h3>
                          <p>教室：{venue.classroom}</p>
                          <p>老師數：{venue.judges.length}</p>
                          <p>專題數：{venue.projects.length}</p>
                          {isOwnVenue && <p className="my-venue-label">我的會場</p>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}
            <Dashboard 
              venueId={dashboardVenueId}
              isPresentationMode={isPresentationMode}
              onPresentationModeChange={setIsPresentationMode}
            />
          </div>
        )}

        {authUser && currentView === 'dashboard' && !canSeeDashboard && (
          <div className="container" style={{ maxWidth: 920 }}>
            <section className="section">
              <h3>跨會場投資戰況</h3>
              <p>目前尚未建立可查看的會場，請先由管理員新增會場。</p>
            </section>
          </div>
        )}

        {authUser && currentView === 'admin' && authUser.role === 'admin' && renderAdmin()}
      </div>
    </div>
  );
}

export default App;
