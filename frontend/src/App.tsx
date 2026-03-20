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
  campaign_id?: string | null;
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
  campaign_id?: string | null;
}

interface AdminMember {
  identifier: string;
  display_name: string;
  role: Role;
  assigned_venue_id?: string | null;
  is_voted: boolean;
  campaign_year?: number | null;
  campaign_id?: string | null;
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

interface RecentlyDeletedCampaign extends SystemCampaign {
  deleted_at: string;
  restore_deadline: string;
  days_remaining: number;
}

interface AdminSystemState {
  current_campaign?: SystemCampaign | null;
  campaigns_by_year: Record<string, SystemCampaign[]>;
  recently_deleted_by_year: Record<string, RecentlyDeletedCampaign[]>;
}

interface AdminMembersResponse {
  members: AdminMember[];
  year: number;
  campaign_id?: string | null;
}

interface CampaignOption {
  id: string;
  year: number;
  label: string;
  status: 'active' | 'closed';
  started_at: string;
}


interface VenueProject {
  id: string;
  name: string;
  total_investment: number;
}

interface VenueProjectsResponse {
  projects: VenueProject[];
  total_budget: number;
  remaining_budget: number;
}

const normalizeDisplayName = (value: string): string => value.trim().replace(/\s+/g, ' ');
const buildNameIdentifier = (displayName: string): string => `name::${displayName.toLowerCase()}`;

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
  const [campaignLabelInput, setCampaignLabelInput] = useState('');
  const [selectedMemberCampaignId, setSelectedMemberCampaignId] = useState<string>('');
  const [adminSystemState, setAdminSystemState] = useState<AdminSystemState>({
    campaigns_by_year: {},
    recently_deleted_by_year: {}
  });
  const [adminTab, setAdminTab] = useState<AdminTab>('members');
  const [memberEditName, setMemberEditName] = useState<Record<string, string>>({});
  const [memberEditRole, setMemberEditRole] = useState<Record<string, Role>>({});
  const [setupVenueNameDraft, setSetupVenueNameDraft] = useState('');
  const [isVenueSetupOpen, setIsVenueSetupOpen] = useState(false);
  const [setupVenueId, setSetupVenueId] = useState('');
  const [setupProjectDraft, setSetupProjectDraft] = useState('');
  const [setupSelectedMemberIds, setSetupSelectedMemberIds] = useState<string[]>([]);
  const [setupNewMemberDraft, setSetupNewMemberDraft] = useState('');
  const [isSavingVenueSetup, setIsSavingVenueSetup] = useState(false);
  const [pendingArchiveDelete, setPendingArchiveDelete] = useState<SystemCampaign | null>(null);
  const [isDeletingArchive, setIsDeletingArchive] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isJoiningVenue, setIsJoiningVenue] = useState(false);
  const [isLeavingVenue, setIsLeavingVenue] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isCreatingVenue, setIsCreatingVenue] = useState(false);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);
  const [isStartingCampaign, setIsStartingCampaign] = useState(false);
  const [isClosingCampaign, setIsClosingCampaign] = useState(false);
  const [restoringCampaignId, setRestoringCampaignId] = useState<string | null>(null);
  const [permanentDeletingCampaignId, setPermanentDeletingCampaignId] = useState<string | null>(null);
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<RecentlyDeletedCampaign | null>(null);
  const [viewVenueId, setViewVenueId] = useState<string | null>(null);
  const [venueViewProjects, setVenueViewProjects] = useState<VenueProject[]>([]);
  const [isLoadingVenueView, setIsLoadingVenueView] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [unlockingMemberId, setUnlockingMemberId] = useState<string | null>(null);
  const [updatingMemberStatusId, setUpdatingMemberStatusId] = useState<string | null>(null);

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
  const campaignOptions = useMemo(() => {
    const rows: CampaignOption[] = [];
    const seen = new Set<string>();

    if (adminSystemState.current_campaign?.id) {
      rows.push(adminSystemState.current_campaign);
      seen.add(adminSystemState.current_campaign.id);
    }

    Object.values(adminSystemState.campaigns_by_year).forEach((campaigns) => {
      campaigns.forEach((campaign) => {
        if (!seen.has(campaign.id)) {
          rows.push(campaign);
          seen.add(campaign.id);
        }
      });
    });

    return rows.sort((a, b) => {
      const aTime = new Date(a.started_at).getTime();
      const bTime = new Date(b.started_at).getTime();
      return bTime - aTime;
    });
  }, [adminSystemState]);

  const selectedMemberCampaign = useMemo(
    () => campaignOptions.find((campaign) => campaign.id === selectedMemberCampaignId) || null,
    [campaignOptions, selectedMemberCampaignId]
  );

  const judgeMembers = members.filter((member) => member.role === 'judge');
  const setupVenue = venues.find((venue) => venue.id === setupVenueId) || null;

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
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    if (authHeaders) {
      try {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { headers: authHeaders });
      } catch {
        // Ignore logout network failures.
      }
    }

    clearAuth(true);
    setMessage('已登出');
    setIsLoggingOut(false);
  };

  const joinVenue = async () => {
    if (!authHeaders || !selectedVenueId || isJoiningVenue) {
      return;
    }
    setError(null);
    setMessage(null);

    try {
      setIsJoiningVenue(true);
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
    } finally {
      setIsJoiningVenue(false);
    }
  };

  const leaveVenue = async () => {
    if (!authHeaders || isLeavingVenue) {
      return;
    }
    setError(null);
    setMessage(null);

    try {
      setIsLeavingVenue(true);
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
    } finally {
      setIsLeavingVenue(false);
    }
  };

  const loadMembers = useCallback(async (campaignIdOverride?: string) => {
    if (!authHeaders || authUser?.role !== 'admin') {
      return;
    }
    const campaignId = campaignIdOverride || selectedMemberCampaignId || activeCampaign?.id || '';
    if (!campaignId) {
      setMembers([]);
      return;
    }
    try {
      setIsLoadingMembers(true);
      const response = await axios.get<AdminMembersResponse>(`${API_BASE_URL}/api/admin/members`, {
        headers: authHeaders,
        params: { campaign_id: campaignId }
      });
      setMembers(response.data.members);
      if (response.data.campaign_id) {
        setSelectedMemberCampaignId(response.data.campaign_id);
      }
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
    } finally {
      setIsLoadingMembers(false);
    }
  }, [authHeaders, authUser?.role, selectedMemberCampaignId, activeCampaign?.id, parseAxiosError]);

  const loadSystemState = useCallback(async () => {
    if (!authHeaders || authUser?.role !== 'admin') {
      return undefined;
    }
    try {
      const response = await axios.get<AdminSystemState>(`${API_BASE_URL}/api/admin/system-state`, {
        headers: authHeaders
      });
      const normalizedState: AdminSystemState = {
        current_campaign: response.data.current_campaign ?? null,
        campaigns_by_year: response.data.campaigns_by_year ?? {},
        recently_deleted_by_year: response.data.recently_deleted_by_year ?? {}
      };
      setAdminSystemState(normalizedState);
      const activeYear = normalizedState.current_campaign?.year;
      const activeId = normalizedState.current_campaign?.id;
      if (activeYear) {
        if (activeId) {
          setSelectedMemberCampaignId(activeId);
        }
        setAdminTab('venues');
      } else {
        if (!selectedMemberCampaignId) {
          const fallbackCampaign = Object.values(normalizedState.campaigns_by_year)
            .flat()
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
          if (fallbackCampaign?.id) {
            setSelectedMemberCampaignId(fallbackCampaign.id);
          }
        }
        setAdminTab('members');
      }
      return normalizedState;
    } catch (err: unknown) {
      setError('讀取場次狀態失敗：' + parseAxiosError(err));
      return undefined;
    }
  }, [authHeaders, authUser?.role, parseAxiosError, selectedMemberCampaignId]);

  const waitForSystemState = useCallback(
    async (
      isDone: (state: AdminSystemState) => boolean,
      retries = 10,
      delayMs = 350
    ): Promise<AdminSystemState | undefined> => {
      for (let i = 0; i < retries; i += 1) {
        const state = await loadSystemState();
        if (state && isDone(state)) {
          return state;
        }
        if (i < retries - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
      }
      return undefined;
    },
    [loadSystemState]
  );

  const loadAdminData = useCallback(async () => {
    const systemState = await loadSystemState();
    await loadVenues();
    const preferredCampaignId = systemState?.current_campaign?.id
      || selectedMemberCampaignId
      || Object.values(systemState?.campaigns_by_year ?? {})
        .flat()
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]?.id;
    await loadMembers(preferredCampaignId);
  }, [loadMembers, loadSystemState, loadVenues, selectedMemberCampaignId]);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      loadAdminData();
    }
  }, [authUser?.role, loadAdminData]);

  useEffect(() => {
    if (adminTab === 'venues' && activeCampaign?.id && selectedMemberCampaignId !== activeCampaign.id) {
      setSelectedMemberCampaignId(activeCampaign.id);
      loadMembers(activeCampaign.id);
    }
  }, [adminTab, activeCampaign?.id, selectedMemberCampaignId, loadMembers]);

  const createVenue = async () => {
    if (!authHeaders || !newVenueName.trim() || isCreatingVenue) {
      return;
    }
    try {
      setIsCreatingVenue(true);
      const venueName = newVenueName.trim();
      const response = await axios.post<Venue>(
        `${API_BASE_URL}/api/admin/venues`,
        { name: venueName, classroom: venueName },
        { headers: authHeaders }
      );
      setNewVenueName('');
      const newVenue = response.data;
      setSetupVenueId(newVenue.id);
      setSetupVenueNameDraft(venueName);
      setSetupProjectDraft('');
      setSetupSelectedMemberIds([]);
      setSetupNewMemberDraft('');
      setIsVenueSetupOpen(true);
      setMessage('會場新增成功，請繼續完成會場設定');
      await loadVenues();
    } catch (err: unknown) {
      setError('新增會場失敗：' + parseAxiosError(err));
    } finally {
      setIsCreatingVenue(false);
    }
  };

  const openVenueSetup = (venueId: string) => {
    const venue = venues.find((item) => item.id === venueId);
    const projectDraft = venue?.projects?.length ? venue.projects.join('\n') : '';
    const selected = judgeMembers
      .filter((member) => member.assigned_venue_id === venueId)
      .map((member) => member.identifier);
    setSetupVenueId(venueId);
    setSetupVenueNameDraft(venue?.classroom || venue?.name || '');
    setSetupProjectDraft(projectDraft);
    setSetupSelectedMemberIds(selected);
    setSetupNewMemberDraft('');
    setIsVenueSetupOpen(true);
  };

  const openVenueView = useCallback(async (venueId: string) => {
    setViewVenueId(venueId);
    setIsLoadingVenueView(true);
    setVenueViewProjects([]);
    try {
      const response = await axios.get<VenueProjectsResponse>(`${API_BASE_URL}/api/projects`, {
        params: { venue_id: venueId }
      });
      setVenueViewProjects(response.data.projects);
    } catch {
      setVenueViewProjects([]);
    } finally {
      setIsLoadingVenueView(false);
    }
  }, []);

  const saveVenueSetup = async () => {
    if (!authHeaders || !setupVenueId || !setupVenue) {
      return;
    }

    const projectNames = Array.from(
      new Set(
        setupProjectDraft
          .split(/\n+/)
          .map((name) => normalizeDisplayName(name))
          .filter(Boolean)
      )
    );
    if (projectNames.length === 0) {
      setError('請至少輸入 1 個專題組名稱');
      return;
    }

    const newMemberNames = Array.from(
      new Set(
        setupNewMemberDraft
          .split(/\n+/)
          .map((name) => normalizeDisplayName(name))
          .filter(Boolean)
      )
    );

    setIsSavingVenueSetup(true);
    setError(null);
    setMessage(null);

    try {
      const nameToSave = setupVenueNameDraft.trim();
      if (nameToSave && nameToSave !== (setupVenue.classroom || setupVenue.name)) {
        await axios.put(
          `${API_BASE_URL}/api/admin/venues/${encodeURIComponent(setupVenueId)}`,
          { name: nameToSave, classroom: nameToSave },
          { headers: authHeaders }
        );
      }
      await axios.patch(
        `${API_BASE_URL}/api/admin/venues/${encodeURIComponent(setupVenueId)}/projects`,
        { project_names: projectNames },
        { headers: authHeaders }
      );

      const memberIdentifiers = [...setupSelectedMemberIds];
      for (const displayName of newMemberNames) {
        try {
          await axios.post(
            `${API_BASE_URL}/api/admin/members`,
            { display_name: displayName, role: 'judge' },
            { headers: authHeaders, params: { campaign_id: selectedMemberCampaignId } }
          );
          memberIdentifiers.push(buildNameIdentifier(displayName));
        } catch (err: unknown) {
          const detail = parseAxiosError(err);
          if (detail.includes('已存在')) {
            memberIdentifiers.push(buildNameIdentifier(displayName));
          } else {
            throw err;
          }
        }
      }

      const uniqueIdentifiers = Array.from(new Set(memberIdentifiers));
      await Promise.all(
        uniqueIdentifiers.map((identifier) =>
          axios.patch(
            `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/status`,
            { assigned_venue_id: setupVenueId, is_voted: false },
            { headers: authHeaders, params: { campaign_id: selectedMemberCampaignId } }
          )
        )
      );

      setIsVenueSetupOpen(false);
      setSetupVenueId('');
      setSetupVenueNameDraft('');
      setSetupProjectDraft('');
      setSetupSelectedMemberIds([]);
      setSetupNewMemberDraft('');
      setMessage(`已完成會場設定`);
      await Promise.all([loadMembers(), loadVenues()]);
    } catch (err: unknown) {
      setError('儲存會場設定失敗：' + parseAxiosError(err));
    } finally {
      setIsSavingVenueSetup(false);
    }
  };

  const deleteVenue = async (venueId: string) => {
    if (!authHeaders || deletingVenueId === venueId) {
      return;
    }
    try {
      setDeletingVenueId(venueId);
      await axios.delete(`${API_BASE_URL}/api/admin/venues/${venueId}`, { headers: authHeaders });
      setMessage('會場已刪除');
      await loadVenues();
    } catch (err: unknown) {
      setError('刪除會場失敗：' + parseAxiosError(err));
    } finally {
      setDeletingVenueId(null);
    }
  };

  const startCampaign = async () => {
    if (!authHeaders || isStartingCampaign) {
      return;
    }

    try {
      setIsStartingCampaign(true);
      await axios.post(
        `${API_BASE_URL}/api/admin/system/start`,
        {
          label: campaignLabelInput.trim() || undefined,
        },
        { headers: authHeaders }
      );
      setMessage('本年度專題模擬投資系統已啟動');
      const latestState = await loadSystemState();
      const activeId = latestState?.current_campaign?.id || '';
      if (activeId) {
        setSelectedMemberCampaignId(activeId);
      }
      await Promise.all([loadMembers(activeId), loadVenues()]);
    } catch (err: unknown) {
      setError('啟動場次失敗：' + parseAxiosError(err));
    } finally {
      setIsStartingCampaign(false);
    }
  };

  const closeCampaign = async () => {
    if (!authHeaders || isClosingCampaign) {
      return;
    }
    try {
      setIsClosingCampaign(true);
      await axios.post(`${API_BASE_URL}/api/admin/system/close`, {}, { headers: authHeaders });
      setMessage('本回專題模擬投資系統已關閉並封存');
      const latestState = await loadSystemState();
      const fallbackCampaignId = selectedMemberCampaignId
        || Object.values(latestState?.campaigns_by_year ?? {})
          .flat()
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]?.id
        || '';
      if (fallbackCampaignId) {
        setSelectedMemberCampaignId(fallbackCampaignId);
      }
      await Promise.all([loadMembers(fallbackCampaignId), loadVenues()]);
    } catch (err: unknown) {
      setError('關閉場次失敗：' + parseAxiosError(err));
    } finally {
      setIsClosingCampaign(false);
    }
  };

  const deleteArchivedCampaign = async (campaign: SystemCampaign) => {
    if (!authHeaders) {
      return;
    }
    if (campaign.status !== 'closed') {
      setError('僅能刪除已封存場次');
      return;
    }
    try {
      setIsDeletingArchive(true);
      await axios.delete(`${API_BASE_URL}/api/admin/system/archives/${encodeURIComponent(campaign.id)}`, {
        headers: authHeaders,
        params: { year: campaign.year }
      });
      await waitForSystemState((state) => {
        const yearKey = String(campaign.year);
        const yearHistory = state.campaigns_by_year[yearKey] ?? [];
        const yearDeleted = state.recently_deleted_by_year[yearKey] ?? [];
        const stillInHistory = yearHistory.some((row) => row.id === campaign.id && row.status === 'closed');
        const movedToDeleted = yearDeleted.some((row) => row.id === campaign.id);
        return !stillInHistory && movedToDeleted;
      });
      setMessage(`已移至最近刪除：${campaign.label}`);
      setPendingArchiveDelete(null);
    } catch (err: unknown) {
      setError('刪除封存紀錄失敗：' + parseAxiosError(err));
    } finally {
      setIsDeletingArchive(false);
    }
  };

  const restoreArchivedCampaign = async (campaign: RecentlyDeletedCampaign) => {
    if (!authHeaders || restoringCampaignId === campaign.id) {
      return;
    }
    try {
      setRestoringCampaignId(campaign.id);
      await axios.post(
        `${API_BASE_URL}/api/admin/system/archives/${encodeURIComponent(campaign.id)}/restore`,
        {},
        { headers: authHeaders, params: { year: campaign.year } }
      );
      await waitForSystemState((state) => {
        const yearKey = String(campaign.year);
        const yearHistory = state.campaigns_by_year[yearKey] ?? [];
        const yearDeleted = state.recently_deleted_by_year[yearKey] ?? [];
        const inHistory = yearHistory.some((row) => row.id === campaign.id && row.status === 'closed');
        const stillDeleted = yearDeleted.some((row) => row.id === campaign.id);
        return inHistory && !stillDeleted;
      });
      setMessage(`已還原封存紀錄：${campaign.label}`);
    } catch (err: unknown) {
      setError('還原封存紀錄失敗：' + parseAxiosError(err));
    } finally {
      setRestoringCampaignId(null);
    }
  };

  const permanentDeleteRecentlyCampaign = async (campaign: RecentlyDeletedCampaign) => {
    if (!authHeaders || permanentDeletingCampaignId === campaign.id) {
      return;
    }
    try {
      setPermanentDeletingCampaignId(campaign.id);
      try {
        await axios.delete(
          `${API_BASE_URL}/api/admin/system/recently-deleted/${encodeURIComponent(campaign.id)}`,
          { headers: authHeaders, params: { year: campaign.year } }
        );
      } catch (primaryErr: unknown) {
        if (axios.isAxiosError(primaryErr) && primaryErr.response?.status === 404) {
          await axios.delete(
            `${API_BASE_URL}/api/admin/system/archives/${encodeURIComponent(campaign.id)}/permanent-delete`,
            { headers: authHeaders, params: { year: campaign.year } }
          );
        } else {
          throw primaryErr;
        }
      }
      await waitForSystemState((state) => {
        const yearKey = String(campaign.year);
        const yearDeleted = state.recently_deleted_by_year[yearKey] ?? [];
        return !yearDeleted.some((row) => row.id === campaign.id);
      });
      setMessage(`已永久刪除：${campaign.label}`);
      setPendingPermanentDelete(null);
    } catch (err: unknown) {
      setError('永久刪除失敗：' + parseAxiosError(err));
    } finally {
      setPermanentDeletingCampaignId(null);
    }
  };

  const updateMemberStatus = async (
    identifier: string,
    payload: { assigned_venue_id?: string | null; is_voted?: boolean }
  ) => {
    if (!authHeaders || updatingMemberStatusId === identifier) {
      return;
    }
    try {
      setUpdatingMemberStatusId(identifier);
      await axios.patch(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/status`,
        payload,
        { headers: authHeaders, params: { campaign_id: selectedMemberCampaignId } }
      );
      setMessage('評審狀態已更新');
      await loadMembers();
    } catch (err: unknown) {
      setError('更新評審狀態失敗：' + parseAxiosError(err));
    } finally {
      setUpdatingMemberStatusId(null);
    }
  };

  const updateMember = async (identifier: string) => {
    if (!authHeaders || updatingMemberId === identifier) {
      return;
    }
    try {
      setUpdatingMemberId(identifier);
      await axios.patch(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}`,
        {
          display_name: memberEditName[identifier],
          role: memberEditRole[identifier]
        },
        { headers: authHeaders, params: { campaign_id: selectedMemberCampaignId } }
      );
      setMessage('成員資料已更新');
      await loadMembers();
    } catch (err: unknown) {
      setError('更新成員失敗：' + parseAxiosError(err));
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const deleteMember = async (identifier: string) => {
    if (!authHeaders || deletingMemberId === identifier) {
      return;
    }
    try {
      setDeletingMemberId(identifier);
      await axios.delete(`${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}`, {
        headers: authHeaders,
        params: { campaign_id: selectedMemberCampaignId }
      });
      setMessage('成員已刪除');
      await loadMembers();
    } catch (err: unknown) {
      setError('刪除成員失敗：' + parseAxiosError(err));
    } finally {
      setDeletingMemberId(null);
    }
  };

  const unlockMember = async (identifier: string) => {
    if (!authHeaders || unlockingMemberId === identifier) {
      return;
    }
    try {
      setUnlockingMemberId(identifier);
      await axios.post(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/unlock`,
        {},
        { headers: authHeaders, params: { campaign_id: selectedMemberCampaignId } }
      );
      setMessage('已解除鎖定');
      await loadMembers();
    } catch (err: unknown) {
      setError('解除鎖定失敗：' + parseAxiosError(err));
    } finally {
      setUnlockingMemberId(null);
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
            <button className="active" onClick={joinVenue} disabled={isJoiningVenue}>
              {isJoiningVenue ? '加入中...' : '加入這個會場'}
            </button>
          )}
          {judgeStatus?.assigned_venue_id && !judgeStatus.is_voted && (
            <button onClick={leaveVenue} disabled={isLeavingVenue}>
              {isLeavingVenue ? '離開中...' : '離開目前會場'}
            </button>
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
          <h3>{isCampaignActive ? activeCampaign?.label : '建立新場次'}</h3>
          <div className="admin-launch-grid">
            <input
              className="investment-input"
              value={campaignLabelInput}
              onChange={(e) => setCampaignLabelInput(e.target.value)}
              placeholder="場次名稱，例如 資管系畢業專題"
              disabled={isCampaignActive}
            />
          </div>
          <div className="admin-launch-actions">
            <button className="submit-button" onClick={startCampaign} disabled={isCampaignActive || isStartingCampaign}>
              {isStartingCampaign ? '啟動中...' : '啟動本年度場次'}
            </button>
            {isCampaignActive && (
              <button onClick={closeCampaign} disabled={isClosingCampaign}>
                {isClosingCampaign ? '封存中...' : '關閉並封存本回'}
              </button>
            )}
          </div>
          <p className="admin-note">啟動時會使用當前西元年份並重置該年度評審狀態；關閉後會保留年度封存紀錄。</p>
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
          {Object.values(adminSystemState.campaigns_by_year).every(
            (campaigns) => !campaigns.some((campaign) => campaign.status === 'closed')
          ) && (
            <div className="investment-item admin-history-empty">
              <p>尚無場次紀錄</p>
            </div>
          )}
          {Object.entries(adminSystemState.campaigns_by_year)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .filter(([, campaigns]) => campaigns.some((campaign) => campaign.status === 'closed'))
            .map(([year, campaigns]) => (
              <div key={year} className="investment-item admin-history-card">
                <p className="admin-history-year">{year}</p>
                {campaigns
                  .filter((campaign) => campaign.status === 'closed')
                  .map((campaign) => (
                  <div key={campaign.id} className="admin-history-row">
                    <strong>{campaign.label}</strong>
                    <span>已封存</span>
                    <span>
                      {campaign.summary?.overall_total_investment !== undefined
                        ? `總投資 ${campaign.summary.overall_total_investment.toLocaleString()} 元`
                        : '尚無統計'}
                    </span>
                    <div className="admin-history-actions">
                      <button onClick={() => setPendingArchiveDelete(campaign)} disabled={isDeletingArchive}>
                        {isDeletingArchive && pendingArchiveDelete?.id === campaign.id ? '刪除中...' : '刪除封存紀錄'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </section>

      <section className="section admin-history-section">
        <div className="admin-section-heading">
          <div>
            <h3>最近刪除（30 天可還原）</h3>
            <p>避免誤刪除，封存紀錄會先進入最近刪除，超過 30 天才會自動清除。</p>
          </div>
        </div>
        <div className="admin-history-grid">
          {Object.keys(adminSystemState.recently_deleted_by_year).length === 0 && (
            <div className="investment-item admin-history-empty">
              <p>目前沒有最近刪除的封存紀錄。</p>
            </div>
          )}
          {Object.entries(adminSystemState.recently_deleted_by_year)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(([year, campaigns]) => (
              <div key={`deleted-${year}`} className="investment-item admin-history-card">
                <p className="admin-history-year">{year}</p>
                {campaigns.map((campaign) => (
                  <div key={`${campaign.id}-${campaign.deleted_at}`} className="admin-history-row admin-history-row-deleted">
                    <strong>{campaign.label}</strong>
                    <span>刪除時間：{new Date(campaign.deleted_at).toLocaleString('zh-Hant-TW')}</span>
                    <span>剩餘可還原天數：{campaign.days_remaining} 天</span>
                    <div className="admin-history-actions">
                      <button onClick={() => restoreArchivedCampaign(campaign)} disabled={restoringCampaignId === campaign.id || permanentDeletingCampaignId === campaign.id}>
                        {restoringCampaignId === campaign.id ? '還原中...' : '還原紀錄'}
                      </button>
                      <button
                        onClick={() => setPendingPermanentDelete(campaign)}
                        disabled={permanentDeletingCampaignId === campaign.id || restoringCampaignId === campaign.id}
                        style={{ marginLeft: 8, background: '#dc2626', color: '#fff', border: 'none' }}
                      >
                        {permanentDeletingCampaignId === campaign.id ? '刪除中...' : '立即刪除'}
                      </button>
                    </div>
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
            <p>以場次切換成員資料。評審狀態會綁定到指定場次，不會互相覆蓋。</p>
          </div>
          <div className="admin-year-picker">
            <label htmlFor="member-campaign">管理場次</label>
            <div className="input-group">
              <select
                id="member-campaign"
                className="investment-input"
                value={selectedMemberCampaignId}
                onChange={(e) => setSelectedMemberCampaignId(e.target.value)}
              >
                {campaignOptions.length === 0 && <option value="">尚無場次</option>}
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.year} / {campaign.label} ({campaign.status === 'active' ? '進行中' : '已封存'})
                  </option>
                ))}
              </select>
              <button onClick={() => loadMembers(selectedMemberCampaignId)} disabled={isLoadingMembers || !selectedMemberCampaignId}>
                {isLoadingMembers ? '讀取中...' : '讀取場次'}
              </button>
            </div>
          </div>
        </div>

        {judgeMembers.length === 0 && (
          <div className="investment-item">
            <p>{selectedMemberCampaign ? `${selectedMemberCampaign.year} / ${selectedMemberCampaign.label}` : '目前所選場次'} 尚無成員資料。</p>
          </div>
        )}

        {judgeMembers.map((member) => (
          <div key={`${selectedMemberCampaignId}-${member.identifier}`} className="investment-item">
            <p style={{ marginBottom: 8 }}>帳號：{member.identifier}</p>
            <p style={{ marginBottom: 8 }}>場次：{selectedMemberCampaign?.label || '未選擇'} / 狀態：{member.assigned_venue_id || '未加入會場'} / {member.is_voted ? '已確認送出' : '尚未送出'}</p>
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
                <button onClick={() => unlockMember(member.identifier)} disabled={unlockingMemberId === member.identifier}>
                  {unlockingMemberId === member.identifier ? '解除中...' : '解除鎖定'}
                </button>
              )}
              <button onClick={() => updateMember(member.identifier)} disabled={updatingMemberId === member.identifier}>
                {updatingMemberId === member.identifier ? '儲存中...' : '修改'}
              </button>
              <button onClick={() => deleteMember(member.identifier)} disabled={deletingMemberId === member.identifier}>
                {deletingMemberId === member.identifier ? '刪除中...' : '刪除'}
              </button>
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
                  placeholder="例如：LM503"
                />
                <button onClick={createVenue} disabled={isCreatingVenue}>{isCreatingVenue ? '新增中...' : '新增'}</button>
              </div>
            </div>

            <div className="venue-grid">
              {venues.map((venue) => (
                <div
                  key={venue.id}
                  className="venue-grid-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => openVenueView(venue.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openVenueView(venue.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="venue-card-header">
                    <span className="venue-card-name">{venue.classroom || venue.name}</span>
                    <div className="venue-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openVenueSetup(venue.id)}>修改</button>
                      <button onClick={() => deleteVenue(venue.id)} disabled={deletingVenueId === venue.id}>
                        {deletingVenueId === venue.id ? '刪除中...' : '刪除'}
                      </button>
                    </div>
                  </div>
                  <div className="venue-project-tags">
                    {venue.projects.length === 0 ? (
                      <p className="venue-no-member">尚無專題</p>
                    ) : (
                      venue.projects.map((project) => (
                        <span key={project} className="venue-project-tag">{project}</span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>}
        </>
      )}

      {viewVenueId && (() => {
        const viewVenue = venues.find((v) => v.id === viewVenueId);
        const venueJudges = members.filter((m) => m.role === 'judge' && m.assigned_venue_id === viewVenueId);
        const totalInvestment = venueViewProjects.reduce((s, p) => s + p.total_investment, 0);
        return (
          <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
            <div className="admin-modal venue-view-modal">
              <div className="venue-view-title-row">
                <h3>{viewVenue?.classroom || viewVenue?.name || viewVenueId}</h3>
                <span className="venue-view-classroom">教室：{viewVenue?.classroom || '未設定'}</span>
              </div>

              <div className="form-group">
                <label>專題組別與投資戰況</label>
                {isLoadingVenueView ? (
                  <p className="admin-modal-note">載入中...</p>
                ) : venueViewProjects.length === 0 ? (
                  <p className="admin-modal-note">尚無專題組別資料</p>
                ) : (
                  <div className="venue-view-projects">
                    {venueViewProjects.map((project) => {
                      const pct = totalInvestment > 0 ? (project.total_investment / totalInvestment) * 100 : 0;
                      return (
                        <div key={project.id} className="venue-view-project-row">
                          <span className="venue-view-project-name">{project.name}</span>
                          <div className="venue-view-bar-wrap">
                            <div className="venue-view-bar" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="venue-view-project-amount">${project.total_investment.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    <div className="venue-view-total-row">
                      <span>合計</span>
                      <span>${totalInvestment.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>評審狀態</label>
                <div className="venue-member-list">
                  {venueJudges.length === 0 ? (
                    <p className="venue-no-member">尚無評審</p>
                  ) : (
                    venueJudges.map((member) => (
                      <div key={member.identifier} className={`venue-member-badge ${member.is_voted ? 'locked' : 'editable'}`}>
                        <span className="venue-member-dot" />
                        <span className="venue-member-name">{member.display_name}</span>
                        <span className="venue-member-status">{member.is_voted ? '已鎖定' : '可編輯'}</span>
                        <div className="venue-member-btns">
                          {member.is_voted && (
                            <button
                              onClick={() => unlockMember(member.identifier)}
                              disabled={unlockingMemberId === member.identifier}
                            >
                              {unlockingMemberId === member.identifier ? '...' : '解鎖'}
                            </button>
                          )}
                          <button
                            onClick={() => updateMemberStatus(member.identifier, { assigned_venue_id: '', is_voted: false })}
                            disabled={updatingMemberStatusId === member.identifier}
                          >
                            {updatingMemberStatusId === member.identifier ? '...' : '移出'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="admin-modal-actions">
                <button onClick={() => setViewVenueId(null)}>關閉</button>
                <button
                  className="submit-button"
                  onClick={() => {
                    const targetId = viewVenueId;
                    setViewVenueId(null);
                    openVenueSetup(targetId);
                  }}
                >
                  編輯設定
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {isVenueSetupOpen && setupVenue && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h3>修改會場</h3>
            <p className="admin-modal-note">完成這一步後，評審登入會自動帶入指定會場，不需自己手動加入。</p>

            <div className="form-group">
              <label>教室名稱</label>
              <input
                className="investment-input"
                value={setupVenueNameDraft}
                onChange={(e) => setSetupVenueNameDraft(e.target.value)}
                placeholder="例如：LM503"
              />
            </div>

            <div className="form-group">
              <label>專題組（每行一筆）</label>
              <textarea
                className="investment-input admin-modal-textarea"
                value={setupProjectDraft}
                onChange={(e) => setSetupProjectDraft(e.target.value)}
                placeholder={'例如：\n智慧製造組\n互動媒體組\n資料科學組'}
              />
            </div>

            <div className="form-group">
              <label>從今年度成員加入評審</label>
              <select
                className="investment-input"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  setSetupSelectedMemberIds((prev) => Array.from(new Set([...prev, id])));
                }}
              >
                <option value="">- 點選選擇評審加入 -</option>
                {judgeMembers.filter((m) => !m.assigned_venue_id).length > 0 && (
                  <optgroup label="尚未指定會場">
                    {judgeMembers
                      .filter((m) => !m.assigned_venue_id)
                      .map((m) => (
                        <option key={m.identifier} value={m.identifier}>
                          {m.display_name}{setupSelectedMemberIds.includes(m.identifier) ? ' ✓' : ''}
                        </option>
                      ))}
                  </optgroup>
                )}
                {judgeMembers.filter((m) => m.assigned_venue_id && m.assigned_venue_id !== setupVenueId).length > 0 && (
                  <optgroup label="已指定其他會場">
                    {judgeMembers
                      .filter((m) => m.assigned_venue_id && m.assigned_venue_id !== setupVenueId)
                      .map((m) => (
                        <option key={m.identifier} value={m.identifier}>
                          {m.display_name}（目前：{m.assigned_venue_id}）{setupSelectedMemberIds.includes(m.identifier) ? ' ✓' : ''}
                        </option>
                      ))}
                  </optgroup>
                )}
                {judgeMembers.filter((m) => m.assigned_venue_id === setupVenueId).length > 0 && (
                  <optgroup label="已在此會場">
                    {judgeMembers
                      .filter((m) => m.assigned_venue_id === setupVenueId)
                      .map((m) => (
                        <option key={m.identifier} value={m.identifier}>
                          {m.display_name}（此會場）{setupSelectedMemberIds.includes(m.identifier) ? ' ✓' : ''}
                        </option>
                      ))}
                  </optgroup>
                )}
                {judgeMembers.length === 0 && <option disabled value="">目前沒有可選成員</option>}
              </select>

              <div className="setup-selected-chips">
                {setupSelectedMemberIds.length === 0 ? (
                  <p className="admin-modal-note" style={{ margin: 0, fontSize: 12 }}>尚未選擇任何評審</p>
                ) : (
                  setupSelectedMemberIds.map((id) => {
                    const m = judgeMembers.find((mem) => mem.identifier === id);
                    return (
                      <span key={id} className="setup-member-chip">
                        {m?.display_name || id}
                        <button
                          type="button"
                          onClick={() => setSetupSelectedMemberIds((prev) => prev.filter((x) => x !== id))}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            <div className="form-group">
              <label>新增成員並直接加入這個會場（每行一位姓名）</label>
              <textarea
                className="investment-input admin-modal-textarea"
                value={setupNewMemberDraft}
                onChange={(e) => setSetupNewMemberDraft(e.target.value)}
                placeholder={'例如：\n王小明\n陳老師'}
              />
            </div>

            <div className="admin-modal-actions">
              <button
                onClick={() => {
                  setIsVenueSetupOpen(false);
                  setSetupVenueId('');
                  setSetupVenueNameDraft('');
                  setSetupProjectDraft('');
                  setSetupSelectedMemberIds([]);
                  setSetupNewMemberDraft('');
                }}
                disabled={isSavingVenueSetup}
              >
                稍後再設
              </button>
              <button className="submit-button" onClick={saveVenueSetup} disabled={isSavingVenueSetup}>
                {isSavingVenueSetup ? '儲存中...' : '完成會場設定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPermanentDelete && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-confirm-modal">
            <h3>確認永久刪除？</h3>
            <p className="admin-modal-note">
              你即將永久刪除「{pendingPermanentDelete.label}」。
              此操作無法復原，紀錄不會進入最近刪除。
            </p>
            <div className="admin-modal-actions">
              <button
                onClick={() => setPendingPermanentDelete(null)}
                disabled={permanentDeletingCampaignId === pendingPermanentDelete.id}
              >
                取消
              </button>
              <button
                className="submit-button"
                style={{ background: '#dc2626' }}
                onClick={() => permanentDeleteRecentlyCampaign(pendingPermanentDelete)}
                disabled={permanentDeletingCampaignId === pendingPermanentDelete.id}
              >
                {permanentDeletingCampaignId === pendingPermanentDelete.id ? '刪除中...' : '確認永久刪除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingArchiveDelete && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-confirm-modal">
            <h3>確認刪除封存紀錄？</h3>
            <p className="admin-modal-note">
              你即將刪除「{pendingArchiveDelete.label}」。
              紀錄會先移到最近刪除，30 天內仍可還原。
            </p>
            <div className="admin-modal-actions">
              <button
                onClick={() => setPendingArchiveDelete(null)}
                disabled={isDeletingArchive}
              >
                取消
              </button>
              <button
                className="submit-button"
                onClick={() => deleteArchivedCampaign(pendingArchiveDelete)}
                disabled={isDeletingArchive}
              >
                {isDeletingArchive ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
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
              <button onClick={logout} disabled={isLoggingOut}>{isLoggingOut ? '登出中...' : '登出'}</button>
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
