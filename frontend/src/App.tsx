import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import JudgeUI from './components/JudgeUI';
import Dashboard from './components/Dashboard';

type ViewMode = 'lobby' | 'judge' | 'dashboard' | 'admin';
type AdminTab = 'campaigns' | 'venues' | 'members' | 'archives';
type MemberSortTag = 'role' | 'campaign' | 'venue' | 'lock';

type Role = 'super_admin' | 'admin' | 'judge';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:9000';
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
  manager_identifier?: string | null;
  managed_campaign_id?: string | null;
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
  invite_token?: string | null;
  summary?: {
    overall_total_investment?: number;
    venues?: Array<{
      venue_id: string;
      venue_name: string;
      total_investment: number;
      judge_count?: number;
      locked_count?: number;
      projects?: Array<{
        project_id: string;
        project_name: string;
        total_investment: number;
        rank?: number;
      }>;
    }>;
    overall_project_ranking?: Array<{
      venue_id: string;
      venue_name: string;
      project_id: string;
      project_name: string;
      total_investment: number;
      rank?: number;
    }>;
  };
}

interface RecentlyDeletedCampaign extends SystemCampaign {
  deleted_at: string;
  restore_deadline: string;
  days_remaining: number;
}

interface AdminSystemState {
  current_campaign?: SystemCampaign | null;
  active_campaigns_list?: SystemCampaign[];
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

interface CampaignInviteInfo {
  id: string;
  year: number;
  label: string;
  status: 'active' | 'closed';
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
const normalizeIdentifierForDisplay = (identifier: string): string => identifier.replace(/^name::/i, '');
const formatMemberIdentity = (identifier: string, displayName: string): string => {
  const shownIdentifier = normalizeIdentifierForDisplay(identifier).trim();
  const shownName = displayName.trim();

  if (!shownIdentifier) {
    return shownName;
  }
  if (!shownName) {
    return shownIdentifier;
  }

  // If identifier is the name-based key (name::xxx), avoid duplicate rendering like "gg-GG".
  if (identifier.startsWith('name::') && shownIdentifier.toLowerCase() === shownName.toLowerCase()) {
    return shownName;
  }

  return `${shownIdentifier}-${shownName}`;
};
const isAdminRole = (role?: Role | null): boolean => role === 'super_admin' || role === 'admin';
const isSuperAdmin = (role?: Role | null): boolean => role === 'super_admin';
const roleLabel = (role?: Role | null): string => {
  if (role === 'super_admin') return '最高管理者';
  if (role === 'admin') return '系所管理者';
  return '評審';
};

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
    active_campaigns_list: [],
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
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);
  const [isCreatingVenue, setIsCreatingVenue] = useState(false);
  const [deletingVenueId, setDeletingVenueId] = useState<string | null>(null);
  const [pendingVenueDelete, setPendingVenueDelete] = useState<Venue | null>(null);
  const [selectedHistoryCampaign, setSelectedHistoryCampaign] = useState<SystemCampaign | null>(null);
  const [isStartingCampaign, setIsStartingCampaign] = useState(false);
  const [closingCampaignId, setClosingCampaignId] = useState<string | null>(null);
  const [restoringCampaignId, setRestoringCampaignId] = useState<string | null>(null);
  const [permanentDeletingCampaignId, setPermanentDeletingCampaignId] = useState<string | null>(null);
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<RecentlyDeletedCampaign | null>(null);
  const [viewVenueId, setViewVenueId] = useState<string | null>(null);
  const [qrInviteCampaign, setQrInviteCampaign] = useState<SystemCampaign | null>(null);
  const [venueViewProjects, setVenueViewProjects] = useState<VenueProject[]>([]);
  const [isLoadingVenueView, setIsLoadingVenueView] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [unlockingMemberId, setUnlockingMemberId] = useState<string | null>(null);
  const [assigningMemberId, setAssigningMemberId] = useState<string | null>(null);
  const [draggingCampaignMemberId, setDraggingCampaignMemberId] = useState<string | null>(null);
  const [draggingJudgeId, setDraggingJudgeId] = useState<string | null>(null);
  const [pendingMoveJudge, setPendingMoveJudge] = useState<{ judge: AdminMember; managerIdentifier: string | null; managerName: string } | null>(null);
  const [loadingMoveJudge, setLoadingMoveJudge] = useState<AdminMember | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'judge' | 'admin'>('judge');
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [memberEditManager, setMemberEditManager] = useState<Record<string, string>>({});
  const [memberSortTag, setMemberSortTag] = useState<MemberSortTag>('role');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [groupImportPreview, setGroupImportPreview] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Invite-link state: populated when the user arrives via ?c=TOKEN
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteCampaign, setInviteCampaign] = useState<CampaignInviteInfo | null>(null);

  // Refs that always reflect the latest render values, used inside useCallbacks
  // to avoid those callbacks being recreated on every state change (infinite loop prevention).
  const selectedMemberCampaignIdRef = useRef<string>('');
  const activeCampaignIdRef = useRef<string | undefined>(undefined);
  const isCampaignActiveRef = useRef<boolean>(false);
  const userCampaignIdRef = useRef<string | undefined>(undefined);
  const inviteTokenRef = useRef<string | null>(null);

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
  const adminHasActiveCampaign = Boolean(activeCampaign);
  const isSuperAdminUser = isSuperAdmin(authUser?.role);
  const currentUserCampaignId = judgeStatus?.campaign_id || authUser?.campaign_id || null;
  const isJudgeCampaignActive = Boolean(currentUserCampaignId || inviteCampaign?.status === 'active');
  const isCampaignActive = isAdminRole(authUser?.role) ? adminHasActiveCampaign : isJudgeCampaignActive;
  const canBrowseVenues = isCampaignActive || isSuperAdminUser;
  const canManageVenues = isCampaignActive || isSuperAdminUser;
  const canStartAnotherCampaign = isSuperAdmin(authUser?.role) || !adminHasActiveCampaign;
  // Keep refs in sync so callbacks always read the latest values.
  selectedMemberCampaignIdRef.current = selectedMemberCampaignId;
  activeCampaignIdRef.current = activeCampaign?.id;
  isCampaignActiveRef.current = adminHasActiveCampaign;
  userCampaignIdRef.current = currentUserCampaignId || undefined;
  inviteTokenRef.current = inviteToken;
  const campaignOptions = useMemo(() => {
    const rows: CampaignOption[] = [];
    const seen = new Set<string>();

    (adminSystemState.active_campaigns_list ?? []).forEach((campaign) => {
      if (!seen.has(campaign.id)) {
        rows.push(campaign);
        seen.add(campaign.id);
      }
    });

    if (adminSystemState.current_campaign?.id) {
      if (!seen.has(adminSystemState.current_campaign.id)) {
        rows.push(adminSystemState.current_campaign);
        seen.add(adminSystemState.current_campaign.id);
      }
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

  const displayedActiveCampaigns = useMemo(() => {
    const allActive = adminSystemState.active_campaigns_list ?? [];
    if (isSuperAdmin(authUser?.role)) {
      return allActive;
    }
    if (!activeCampaign) {
      return [];
    }
    return allActive.filter((campaign) => campaign.id === activeCampaign.id);
  }, [adminSystemState.active_campaigns_list, authUser?.role, activeCampaign]);

  const venueCampaignOptions = useMemo(() => {
    const activeById = new Map((adminSystemState.active_campaigns_list ?? []).map((campaign) => [campaign.id, campaign]));
    if (!isSuperAdmin(authUser?.role)) {
      return activeCampaign ? [activeCampaign] : [];
    }
    return Array.from(activeById.values()).sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }, [adminSystemState.active_campaigns_list, authUser?.role, activeCampaign]);

  const judgeMembers = members.filter((member) => member.role === 'judge');
  const adminMembers = members.filter((member) => member.role === 'admin');
  const managerNameByIdentifier = useMemo(() => {
    const rows: Record<string, string> = {};
    adminMembers.forEach((member) => {
      rows[member.identifier] = member.display_name;
    });
    return rows;
  }, [adminMembers]);
  const venueJudgeGroups = useMemo(() => {
    const grouped: Record<string, AdminMember[]> = {};
    judgeMembers.forEach((member) => {
      const key = member.assigned_venue_id || '__unassigned__';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(member);
    });
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-Hant'));
    });
    return grouped;
  }, [judgeMembers]);
  const campaignMemberStats = useMemo(() => {
    const stats: Record<string, { managers: number; judges: number }> = {};
    members.forEach((member) => {
      const key = member.role === 'admin'
        ? (member.managed_campaign_id || '')
        : (member.campaign_id || '');
      if (!key) {
        return;
      }
      if (!stats[key]) {
        stats[key] = { managers: 0, judges: 0 };
      }
      if (member.role === 'admin') {
        stats[key].managers += 1;
      } else if (member.role === 'judge') {
        stats[key].judges += 1;
      }
    });
    return stats;
  }, [members]);

  const venueMemberStats = useMemo(() => {
    const stats: Record<string, { managers: number; judges: number }> = {};
    venues.forEach((venue) => {
      const judges = venueJudgeGroups[venue.id] || [];
      const managerSet = new Set(
        judges
          .map((judge) => judge.manager_identifier || '')
          .filter((identifier) => Boolean(identifier))
      );
      stats[venue.id] = {
        managers: managerSet.size,
        judges: judges.length,
      };
    });
    return stats;
  }, [venues, venueJudgeGroups]);

  const sortedMembersByTag = useMemo(() => {
    const tagValue = (member: AdminMember): string => {
      if (memberSortTag === 'role') {
        return member.role === 'admin' ? '1-admin' : '2-judge';
      }
      if (memberSortTag === 'campaign') {
        const campaignTag = member.role === 'admin'
          ? (member.managed_campaign_id || '')
          : (member.campaign_id || '');
        return campaignTag || 'zz-unassigned';
      }
      if (memberSortTag === 'venue') {
        return member.assigned_venue_id || 'zz-unassigned';
      }
      return member.is_voted ? '1-locked' : '2-editable';
    };

    return [...members].sort((a, b) => {
      const aTag = tagValue(a);
      const bTag = tagValue(b);
      if (aTag !== bTag) {
        return aTag.localeCompare(bTag, 'zh-Hant');
      }
      return a.display_name.localeCompare(b.display_name, 'zh-Hant');
    });
  }, [members, memberSortTag]);
  const setupVenue = venues.find((venue) => venue.id === setupVenueId) || null;

  const parseAxiosError = useCallback((err: unknown): string => {
    if (!axios.isAxiosError(err)) {
      return '發生錯誤，請聯絡系統管理員';
    }
    return '發生錯誤，請聯絡系統管理員';
  }, []);

  const loadVenues = useCallback(async (campaignId?: string) => {
    try {
      const preferredCampaignId = campaignId
        || activeCampaignIdRef.current
        || userCampaignIdRef.current
        || selectedMemberCampaignIdRef.current
        || undefined;
      const response = await axios.get<Venue[]>(`${API_BASE_URL}/api/venues`, {
        params: preferredCampaignId ? { campaign_id: preferredCampaignId } : undefined,
      });
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

  useEffect(() => {
    if (!authUser || isAdminRole(authUser.role)) {
      return;
    }
    const scopedCampaignId = judgeStatus?.campaign_id || authUser.campaign_id || undefined;
    loadVenues(scopedCampaignId);
  }, [authUser, judgeStatus?.campaign_id, loadVenues]);

  useEffect(() => {
    const initInviteFromUrl = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = (params.get('c') || '').trim();
      if (!token) {
        return;
      }

      setInviteToken(token);
      try {
        const response = await axios.get<CampaignInviteInfo>(`${API_BASE_URL}/api/campaign/invite/${encodeURIComponent(token)}`);
        setInviteCampaign(response.data);
      } catch (err: unknown) {
        setError('邀請連結載入失敗：' + parseAxiosError(err));
      }
    };

    initInviteFromUrl();
  }, [parseAxiosError]);

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
        if (response.data.role === 'judge') {
          setCurrentView((prev) => (prev === 'lobby' ? 'judge' : prev));
        }
      }
      setAuthUser((prev) => {
        if (!prev) {
          return prev;
        }
        const nextCampaignYear = response.data.campaign_year ?? prev.campaign_year ?? null;
        const nextCampaignId = response.data.campaign_id ?? prev.campaign_id ?? null;
        if (prev.venue_id === nextVenueId && prev.campaign_year === nextCampaignYear && prev.campaign_id === nextCampaignId) {
          return prev; // nothing changed; avoid creating a new object reference
        }
        const nextUser = {
          ...prev,
          venue_id: nextVenueId,
          campaign_year: nextCampaignYear,
          campaign_id: nextCampaignId,
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
    if (isAdminRole(authUser?.role) && !isSuperAdmin(authUser?.role) && !isCampaignActive && currentView === 'lobby') {
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
    setMessage(showMessage ? `登入成功，歡迎${roleLabel(auth.user.role)} ${auth.user.display_name}` : null);
    setError(null);
    if (isAdminRole(auth.user.role)) {
      setCurrentView('admin');
    } else if (auth.user.venue_id) {
      setCurrentView('judge');
      setDashboardVenueId((prev) => prev || auth.user.venue_id || '');
    } else {
      setCurrentView('lobby');
    }
  }, []);

  const loginWithDisplayName = useCallback(async (rawName: string, showMessage = true): Promise<boolean> => {
    const normalizedInput = rawName.trim();
    if (!normalizedInput) {
      if (showMessage) {
        setError('請輸入員編或姓名');
      }
      return false;
    }

    try {
      const response = await axios.post<AuthResponse>(`${API_BASE_URL}/api/judges/login`, {
        display_name: normalizedInput,
        invite_token: inviteTokenRef.current || undefined,
      });
      saveAuth(response.data, showMessage);
      return true;
    } catch (err: unknown) {
      if (showMessage) {
        setError('登入失敗。' + parseAxiosError(err));
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
    if (!authHeaders || !isAdminRole(authUser?.role)) {
      return;
    }
    const campaignId = campaignIdOverride || selectedMemberCampaignIdRef.current || activeCampaignIdRef.current || '';
    // super_admin can fetch members without a campaign (returns global admin members)
    if (!campaignId && !isSuperAdmin(authUser?.role)) {
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
      } else if (isSuperAdmin(authUser?.role) && !isCampaignActiveRef.current) {
        // super_admin fetched global admins — no campaign_id to set
      }
      const names: Record<string, string> = {};
      const roles: Record<string, Role> = {};
      const managers: Record<string, string> = {};
      for (const member of response.data.members) {
        names[member.identifier] = member.display_name;
        roles[member.identifier] = member.role;
        managers[member.identifier] = member.manager_identifier || '';
      }
      setMemberEditName(names);
      setMemberEditRole(roles);
      setMemberEditManager(managers);
    } catch (err: unknown) {
      setError('讀取成員失敗：' + parseAxiosError(err));
    } finally {
      setIsLoadingMembers(false);
    }
  }, [authHeaders, authUser?.role, parseAxiosError]);

  const loadSystemState = useCallback(async () => {
    if (!authHeaders || !isAdminRole(authUser?.role)) {
      return undefined;
    }
    try {
      const response = await axios.get<AdminSystemState>(`${API_BASE_URL}/api/admin/system-state`, {
        headers: authHeaders
      });
      const normalizedState: AdminSystemState = {
        current_campaign: response.data.current_campaign ?? null,
        active_campaigns_list: response.data.active_campaigns_list ?? [],
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
        setAdminTab((prev) => (prev === 'archives' ? prev : 'members'));
      } else {
        if (!selectedMemberCampaignIdRef.current) {
          const fallbackCampaign = [...(normalizedState.active_campaigns_list ?? []), ...Object.values(normalizedState.campaigns_by_year)
            .flat()]
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
          if (fallbackCampaign?.id) {
            setSelectedMemberCampaignId(fallbackCampaign.id);
          }
        }
        setAdminTab((prev) => (prev === 'archives' ? prev : 'members'));
      }
      return normalizedState;
    } catch (err: unknown) {
      setError('讀取場次狀態失敗：' + parseAxiosError(err));
      return undefined;
    }
  }, [authHeaders, authUser?.role, parseAxiosError]);

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
    try {
      setIsLoadingAdminData(true);
      const systemState = await loadSystemState();
      const preferredCampaignId = systemState?.current_campaign?.id
        || systemState?.active_campaigns_list?.[0]?.id
        || selectedMemberCampaignIdRef.current
        || Object.values(systemState?.campaigns_by_year ?? {})
          .flat()
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]?.id;
      await loadVenues(preferredCampaignId);
      await loadMembers(preferredCampaignId);
    } finally {
      setIsLoadingAdminData(false);
    }
  }, [loadMembers, loadSystemState, loadVenues]);

  useEffect(() => {
    if (isAdminRole(authUser?.role) && currentView === 'admin') {
      loadAdminData();
    }
  }, [authUser?.role, currentView, loadAdminData]);

  useEffect(() => {
    if (adminTab === 'venues' && selectedMemberCampaignId) {
      loadMembers(selectedMemberCampaignId);
      loadVenues(selectedMemberCampaignId);
    }
  }, [adminTab, selectedMemberCampaignId, loadMembers, loadVenues]);

  useEffect(() => {
    if (adminTab !== 'venues' || selectedMemberCampaignId || venueCampaignOptions.length === 0) {
      return;
    }
    setSelectedMemberCampaignId(venueCampaignOptions[0].id);
  }, [adminTab, selectedMemberCampaignId, venueCampaignOptions]);

  useEffect(() => {
    if (adminTab !== 'members') {
      return;
    }
    if (isSuperAdmin(authUser?.role)) {
      loadMembers('');
      return;
    }
    const scopeCampaignId = selectedMemberCampaignId || activeCampaign?.id || '';
    if (scopeCampaignId) {
      loadMembers(scopeCampaignId);
    }
  }, [adminTab, authUser?.role, selectedMemberCampaignId, activeCampaign?.id, loadMembers]);

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
        { headers: authHeaders, params: selectedMemberCampaignId ? { campaign_id: selectedMemberCampaignId } : undefined }
      );
      setNewVenueName('');
      const newVenue = response.data;
      setSetupVenueId(newVenue.id);
      setSetupVenueNameDraft(venueName);
      setSetupProjectDraft('');
      setGroupImportPreview([]);
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
    setGroupImportPreview([]);
    setSetupSelectedMemberIds(selected);
    setSetupNewMemberDraft('');
    setIsVenueSetupOpen(true);
  };

  const parseGroupImportFile = async (file: File) => {
    const text = await file.text();
    const rows = Array.from(
      new Set(
        text
          .split(/\r?\n|,|\t|;/)
          .map((name) => normalizeDisplayName(name))
          .filter(Boolean)
      )
    );
    setGroupImportPreview(rows);
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
          { headers: authHeaders, params: selectedMemberCampaignId ? { campaign_id: selectedMemberCampaignId } : undefined }
        );
      }
      await axios.patch(
        `${API_BASE_URL}/api/admin/venues/${encodeURIComponent(setupVenueId)}/projects`,
        { project_names: projectNames },
        { headers: authHeaders, params: selectedMemberCampaignId ? { campaign_id: selectedMemberCampaignId } : undefined }
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
      const currentlyAssignedIdentifiers = judgeMembers
        .filter((member) => member.assigned_venue_id === setupVenueId)
        .map((member) => member.identifier);

      const identifiersToRemove = currentlyAssignedIdentifiers.filter(
        (identifier) => !uniqueIdentifiers.includes(identifier)
      );

      await Promise.all([
        ...uniqueIdentifiers.map((identifier) =>
          axios.patch(
            `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/status`,
            { assigned_venue_id: setupVenueId, is_voted: false },
            { headers: authHeaders, params: { campaign_id: selectedMemberCampaignId } }
          )
        ),
        ...identifiersToRemove.map((identifier) =>
          axios.patch(
            `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/status`,
            { assigned_venue_id: '', is_voted: false },
            { headers: authHeaders, params: { campaign_id: selectedMemberCampaignId } }
          )
        ),
      ]);

      setIsVenueSetupOpen(false);
      setSetupVenueId('');
      setSetupVenueNameDraft('');
      setSetupProjectDraft('');
      setGroupImportPreview([]);
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
      await axios.delete(`${API_BASE_URL}/api/admin/venues/${venueId}`, {
        headers: authHeaders,
        params: selectedMemberCampaignId ? { campaign_id: selectedMemberCampaignId } : undefined,
      });
      setMessage('會場已刪除');
      setPendingVenueDelete(null);
      await Promise.all([loadVenues(), loadMembers()]);
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
      await Promise.all([loadMembers(activeId), loadVenues(activeId)]);
    } catch (err: unknown) {
      setError('啟動場次失敗：' + parseAxiosError(err));
    } finally {
      setIsStartingCampaign(false);
    }
  };

  const closeCampaign = async (targetCampaignId: string) => {
    if (!authHeaders || closingCampaignId) {
      return;
    }
    try {
      setClosingCampaignId(targetCampaignId);
      await axios.post(
        `${API_BASE_URL}/api/admin/system/close`,
        {},
        {
          headers: authHeaders,
          params: { campaign_id: targetCampaignId },
        }
      );
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
      await Promise.all([loadMembers(fallbackCampaignId), loadVenues(fallbackCampaignId)]);
    } catch (err: unknown) {
      setError('關閉場次失敗：' + parseAxiosError(err));
    } finally {
      setClosingCampaignId(null);
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

  const updateMember = async (identifier: string) => {
    if (!authHeaders || updatingMemberId === identifier) {
      return;
    }
    const current = members.find((member) => member.identifier === identifier);
    const targetRole = memberEditRole[identifier] ?? current?.role ?? 'judge';
    const managerIdentifier = (memberEditManager[identifier] || '').trim();
    try {
      setUpdatingMemberId(identifier);
      await axios.patch(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}`,
        {
          display_name: memberEditName[identifier],
          role: targetRole
        },
        {
          headers: authHeaders,
          params: {
            campaign_id: current?.campaign_id || selectedMemberCampaignId,
            year: current?.campaign_year,
          },
        }
      );

      if (targetRole === 'judge' && isSuperAdmin(authUser?.role)) {
        await axios.patch(
          `${API_BASE_URL}/api/admin/members/${encodeURIComponent(identifier)}/status`,
          { manager_identifier: managerIdentifier },
          {
            headers: authHeaders,
            params: {
              campaign_id: current?.campaign_id || selectedMemberCampaignId,
              year: current?.campaign_year,
            },
          }
        );
      }

      setMessage('成員資料已更新');
      await loadMembers();
    } catch (err: unknown) {
      setError('更新成員失敗：' + parseAxiosError(err));
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const assignJudgeManager = async (judge: AdminMember, managerIdentifier: string | null) => {
    if (!authHeaders || assigningMemberId === judge.identifier) {
      return;
    }
    try {
      setAssigningMemberId(judge.identifier);
      await axios.patch(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(judge.identifier)}/status`,
        { manager_identifier: managerIdentifier || '' },
        {
          headers: authHeaders,
          params: {
            campaign_id: judge.campaign_id || selectedMemberCampaignId,
            year: judge.campaign_year,
          },
        }
      );
      setMessage(managerIdentifier
        ? `已將 ${judge.display_name} 指派給 ${managerNameByIdentifier[managerIdentifier] || '管理者'}`
        : `已取消 ${judge.display_name} 的管理者綁定`
      );
      await loadMembers('');
    } catch (err: unknown) {
      setError('指派管理者失敗：' + parseAxiosError(err));
    } finally {
      setAssigningMemberId(null);
    }
  };

  const executeMoveJudge = async (judge: AdminMember, managerIdentifier: string | null) => {
    setLoadingMoveJudge(judge);
    try {
      await assignJudgeManager(judge, managerIdentifier);
    } finally {
      setLoadingMoveJudge(null);
    }
  };

  const assignMemberToCampaign = async (member: AdminMember, targetCampaignId: string) => {
    if (!authHeaders || !isSuperAdmin(authUser?.role) || assigningMemberId === member.identifier) {
      return;
    }
    const currentCampaignForMember = member.role === 'admin'
      ? (member.managed_campaign_id || '')
      : (member.campaign_id || '');
    if (currentCampaignForMember === targetCampaignId) {
      return;
    }

    try {
      setAssigningMemberId(member.identifier);
      await axios.post(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(member.identifier)}/assign-campaign`,
        { target_campaign_id: targetCampaignId },
        { headers: authHeaders }
      );
      setMessage(`已將 ${member.display_name} 分配到指定場次`);
      await Promise.all([
        loadMembers(selectedMemberCampaignIdRef.current || targetCampaignId),
        loadVenues(selectedMemberCampaignIdRef.current || targetCampaignId),
        loadSystemState(),
      ]);
    } catch (err: unknown) {
      setError('分配場次失敗：' + parseAxiosError(err));
    } finally {
      setAssigningMemberId(null);
    }
  };

  const assignJudgeToVenue = async (judge: AdminMember, venueId: string) => {
    if (!authHeaders || assigningMemberId === judge.identifier || judge.assigned_venue_id === venueId) {
      return;
    }
    try {
      setAssigningMemberId(judge.identifier);
      await axios.post(
        `${API_BASE_URL}/api/admin/venues/${encodeURIComponent(venueId)}/assign-judge`,
        { identifier: judge.identifier },
        {
          headers: authHeaders,
          params: selectedMemberCampaignIdRef.current ? { campaign_id: selectedMemberCampaignIdRef.current } : undefined,
        }
      );
      setMessage(`已將 ${judge.display_name} 指派到會場`);
      await Promise.all([loadMembers(activeCampaignIdRef.current || selectedMemberCampaignIdRef.current), loadVenues(activeCampaignIdRef.current || selectedMemberCampaignIdRef.current)]);
    } catch (err: unknown) {
      setError('指派評審到會場失敗：' + parseAxiosError(err));
    } finally {
      setAssigningMemberId(null);
    }
  };

  const unassignJudgeFromVenue = async (judge: AdminMember) => {
    if (!authHeaders || assigningMemberId === judge.identifier || !judge.assigned_venue_id) {
      return;
    }
    try {
      setAssigningMemberId(judge.identifier);
      await axios.patch(
        `${API_BASE_URL}/api/admin/members/${encodeURIComponent(judge.identifier)}/status`,
        { assigned_venue_id: '' },
        {
          headers: authHeaders,
          params: {
            campaign_id: judge.campaign_id || selectedMemberCampaignIdRef.current,
            year: judge.campaign_year,
          },
        }
      );
      setMessage(`已將 ${judge.display_name} 移回未分配區`);
      await Promise.all([loadMembers(activeCampaignIdRef.current || selectedMemberCampaignIdRef.current), loadVenues(activeCampaignIdRef.current || selectedMemberCampaignIdRef.current)]);
    } catch (err: unknown) {
      setError('移除評審會場失敗：' + parseAxiosError(err));
    } finally {
      setAssigningMemberId(null);
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

  const createMember = async () => {
    if (!authHeaders || isCreatingMember) {
      return;
    }

    const displayName = normalizeDisplayName(newMemberName);
    if (!displayName) {
      setError('請輸入成員姓名');
      return;
    }

    const isGlobalAdminMode = isSuperAdmin(authUser?.role) && !isCampaignActive;
    const targetRole: 'judge' | 'admin' = isGlobalAdminMode ? 'admin' : newMemberRole;
    const targetCampaignId = selectedMemberCampaignId || activeCampaign?.id || '';

    if (targetRole === 'judge' && !targetCampaignId) {
      setError('新增評審前請先選擇場次，或先啟動場次');
      return;
    }

    try {
      setIsCreatingMember(true);
      await axios.post(
        `${API_BASE_URL}/api/admin/members`,
        { display_name: displayName, role: targetRole },
        {
          headers: authHeaders,
          params: targetRole === 'admin' ? undefined : { campaign_id: targetCampaignId },
        }
      );
      setMessage(targetRole === 'admin' ? '系所管理者已新增' : '評審成員已新增');
      setNewMemberName('');
      if (!isGlobalAdminMode) {
        setNewMemberRole('judge');
      }
      await loadMembers(targetRole === 'admin' ? '' : targetCampaignId);
    } catch (err: unknown) {
      setError('新增成員失敗：' + parseAxiosError(err));
    } finally {
      setIsCreatingMember(false);
    }
  };

  const renderLogin = () => (
    <div className="container" style={{ maxWidth: 720, marginTop: 36 }}>
      <section className="section">
        <h2>登入</h2>
        <p>
          {inviteCampaign
            ? `你正在進入 ${inviteCampaign.year} 年 ${inviteCampaign.label} 專題會，請輸入員編或姓名登入。`
            : '請先輸入員編或姓名登入（帳號需由管理員事先匯入）。'}
        </p>
        {inviteCampaign && (
          <div className="invite-banner">
            <strong>專題會：</strong> {inviteCampaign.year} / {inviteCampaign.label}
          </div>
        )}
      </section>

      <section className="section judge-form">
        <div className="form-group">
          <label>員編或姓名</label>
          <input
            className="investment-input"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            placeholder="例如：1234 或 王教授"
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
          {canBrowseVenues
            ? '先看每個會場資訊再選擇加入，包含教室、評審評審與該會場專題組別。'
            : '目前尚未啟動專題會，尚無會場資料可選擇。'}
        </p>
      </section>

      <section className="section judge-form">
        <div className="form-group">
          <label>目前登入者</label>
          <p><strong>{authUser?.display_name}</strong></p>
        </div>

        {canBrowseVenues && selectedVenue && (
          <div className="investment-item">
            <h3 style={{ marginBottom: 8 }}>{selectedVenue.name}</h3>
            <p style={{ marginBottom: 8 }}>會場：<strong>{selectedVenue.classroom}</strong></p>
            <p style={{ marginBottom: 8 }}>
              目前評審：
              <strong>{selectedVenue.judges.length > 0 ? ` ${selectedVenue.judges.join('、')}` : ' 尚無評審加入'}</strong>
            </p>
            <p style={{ marginBottom: 8 }}>專題組別：</p>
            <div className="lobby-tags">
              {selectedVenue.projects.map((project) => (
                <span key={project} className="lobby-tag">{project}</span>
              ))}
            </div>
          </div>
        )}

        {canBrowseVenues && <div className="lobby-grid">
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

        {canBrowseVenues && !isSuperAdminUser && <div className="nav-buttons" style={{ marginTop: 12 }}>
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
      {isLoadingAdminData && (
        <section className="section admin-loading-section">
          <span className="admin-loading-spinner" aria-hidden="true"></span>
          <h3>資料載入中...</h3>
          <p>正在同步場次、成員與會場，請稍候。</p>
        </section>
      )}

      <section className="section admin-hero">
        <div className="admin-hero-copy">
          <span className="admin-kicker">ADMIN CONSOLE</span>
          <h2>{displayedActiveCampaigns.length > 0 ? '進行中的專題會' : '尚未啟動專題會'}</h2>
          <p>
            {displayedActiveCampaigns.length > 0
              ? `目前共有 ${displayedActiveCampaigns.length} 個啟動中的專題會。可直接在下方查看邀請網址、管理會議廳與拖拉分配評審。`
              : '先完成年度設定與成員整理，再正式啟動本次專題模擬投資評分。'}
          </p>
          <div className="admin-hero-metrics">
            <div className="admin-hero-metric">
              <span>進行中場次</span>
              <strong>{displayedActiveCampaigns.length}</strong>
            </div>
            <div className="admin-hero-metric">
              <span>目前會議廳</span>
              <strong>{venues.length}</strong>
            </div>
            <div className="admin-hero-metric">
              <span>目前評審</span>
              <strong>{judgeMembers.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section admin-campaign-section">
        <div className="admin-section-heading">
          <div>
            <h3>專題會管理</h3>
            <p>每位管理員可同時管理自己的專題會。啟動後會自動產生邀請網址。</p>
          </div>
        </div>
        <div className="admin-campaign-create-row">
          <input
            className="investment-input"
            value={campaignLabelInput}
            onChange={(e) => setCampaignLabelInput(e.target.value)}
            placeholder="場次名稱，例如 資管系畢業專題"
            disabled={!canStartAnotherCampaign}
          />
          <button className="submit-button" onClick={startCampaign} disabled={isStartingCampaign || !canStartAnotherCampaign}>
            {isStartingCampaign ? '啟動中...' : '啟動新場次'}
          </button>
        </div>
        <div className="admin-campaign-grid">
          {displayedActiveCampaigns.length === 0 && (
            <div className="investment-item admin-history-empty">
              <p>目前沒有進行中的專題會。</p>
            </div>
          )}
          {displayedActiveCampaigns.map((campaign) => {
            const inviteUrl = campaign.invite_token
              ? `${window.location.origin}${window.location.pathname}?c=${encodeURIComponent(campaign.invite_token)}`
              : '';
            return (
              <div key={campaign.id} className="campaign-card">
                <div className="campaign-card-header">
                  <div>
                    <div className="admin-status-badge">進行中 {campaign.year}</div>
                    <h4>{campaign.label}</h4>
                  </div>
                  <button onClick={() => closeCampaign(campaign.id)} disabled={Boolean(closingCampaignId)}>
                    {closingCampaignId === campaign.id ? '封存中...' : '關閉並封存'}
                  </button>
                </div>
                <p className="admin-note">啟動時間：{new Date(campaign.started_at).toLocaleString('zh-Hant-TW')}</p>
                {inviteUrl && (
                  <div className="admin-invite-box">
                    <label>專題會邀請網址</label>
                    <div className="admin-invite-row">
                      <input className="investment-input" value={inviteUrl} readOnly />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(inviteUrl);
                            setMessage('已複製專題會邀請網址');
                          } catch {
                            setError('複製失敗，請手動複製網址');
                          }
                        }}
                      >
                        複製
                      </button>
                      <button
                        type="button"
                        className="admin-invite-qr-btn"
                        onClick={() => setQrInviteCampaign(campaign)}
                      >
                        QR
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="section admin-tab-strip">
        <div className="nav-buttons admin-tabs">
          <button
            className={adminTab === 'members' ? 'active' : ''}
            onClick={() => setAdminTab('members')}
          >
            成員管理
          </button>
          <button
            className={adminTab === 'venues' ? 'active' : ''}
            onClick={() => setAdminTab('venues')}
            disabled={!canManageVenues}
            title={canManageVenues ? '管理會場與拖拉分派' : '請先啟動場次'}
          >
            會場管理
          </button>
          <button
            className={adminTab === 'campaigns' ? 'active' : ''}
            onClick={() => setAdminTab('campaigns')}
          >
            場次管理
          </button>
          <button
            className={adminTab === 'archives' ? 'active' : ''}
            onClick={() => setAdminTab('archives')}
          >
            封存紀錄
          </button>
        </div>
      </div>

      {adminTab === 'campaigns' && <section className="section judge-form">
        <div className="admin-section-heading admin-member-toolbar">
          <div>
            <h3>場次管理</h3>
            <p>在此以拖拉方式將成員分配到不同場次。此頁不使用下拉選單切換場次。</p>
          </div>
        </div>

        {isSuperAdmin(authUser?.role) && (
          <div className="form-group">
            <label>場次成員分配（拖拉卡片到目標場次）</label>
            <div className="campaign-assignment-board">
              {(displayedActiveCampaigns || []).map((campaign) => {
                const campaignManagers = members.filter((member) => member.role === 'admin' && member.managed_campaign_id === campaign.id);
                const campaignJudges = members.filter((member) => member.role === 'judge' && member.campaign_id === campaign.id);
                const merged = [...campaignManagers, ...campaignJudges].sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-Hant'));
                const stats = campaignMemberStats[campaign.id] || { managers: 0, judges: 0 };
                return (
                  <div
                    key={`campaign-assignment-${campaign.id}`}
                    className="campaign-assignment-col"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!draggingCampaignMemberId) return;
                      const member = members.find((row) => row.identifier === draggingCampaignMemberId);
                      setDraggingCampaignMemberId(null);
                      if (!member) return;
                      assignMemberToCampaign(member, campaign.id);
                    }}
                  >
                    <div className="campaign-assignment-header">
                      <strong>{campaign.year} / {campaign.label}</strong>
                      <span>{stats.managers} 管理者 / {stats.judges} 評審</span>
                    </div>
                    <div className="campaign-assignment-body">
                      {merged.map((member, idx) => (
                        <div
                          key={`campaign-member-${campaign.id}-${member.identifier}-${idx}`}
                          className={`venue-judge-card ${member.role === 'admin' ? 'campaign-role-admin' : 'campaign-role-judge'} ${assigningMemberId === member.identifier ? 'loading' : ''}`}
                          draggable={assigningMemberId !== member.identifier}
                          onDragStart={() => setDraggingCampaignMemberId(member.identifier)}
                          onDragEnd={() => setDraggingCampaignMemberId(null)}
                          onClick={() => {
                            setSelectedMemberId(member.identifier);
                            setIsEditingMember(false);
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="member-name">{formatMemberIdentity(member.identifier, member.display_name)}</div>
                          <div className="venue-judge-meta">{member.role === 'admin' ? '系所管理者' : '評審'}</div>
                        </div>
                      ))}
                      {merged.length === 0 && <p className="manager-empty">拖拉成員到此場次</p>}
                    </div>
                  </div>
                );
              })}

              <div
                className="campaign-assignment-col campaign-assignment-col-unassigned"
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="campaign-assignment-header">
                  <strong>未分配場次</strong>
                  <span>
                    {
                      members.filter((member) => (member.role === 'admin'
                        ? !member.managed_campaign_id
                        : !member.campaign_id)).length
                    } 位成員
                  </span>
                </div>
                <div className="campaign-assignment-body">
                  {members
                    .filter((member) => (member.role === 'admin' ? !member.managed_campaign_id : !member.campaign_id))
                    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-Hant'))
                    .map((member) => (
                      <div
                        key={`campaign-member-unassigned-${member.identifier}`}
                        className={`venue-judge-card ${member.role === 'admin' ? 'campaign-role-admin' : 'campaign-role-judge'} ${assigningMemberId === member.identifier ? 'loading' : ''}`}
                        draggable={assigningMemberId !== member.identifier}
                        onDragStart={() => setDraggingCampaignMemberId(member.identifier)}
                        onDragEnd={() => setDraggingCampaignMemberId(null)}
                        onClick={() => {
                          setSelectedMemberId(member.identifier);
                          setIsEditingMember(false);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="member-name">{formatMemberIdentity(member.identifier, member.display_name)}</div>
                        <div className="venue-judge-meta">{member.role === 'admin' ? '系所管理者' : '評審'}</div>
                      </div>
                    ))}
                  {!members.some((member) => (member.role === 'admin' ? !member.managed_campaign_id : !member.campaign_id)) && (
                    <p className="manager-empty">目前沒有未分配場次的成員</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isSuperAdmin(authUser?.role) && (
          <div className="investment-item">
            <p>目前僅最高管理者可進行跨場次成員拖拉分配。</p>
          </div>
        )}
      </section>}

      {adminTab === 'members' && <section className="section judge-form">
        <div className="admin-section-heading admin-member-toolbar">
          <div>
            <h3>成員管理</h3>
            <p>顯示所有可管理成員，可依標籤排序後快速檢視與操作。</p>
          </div>
          <div className="admin-year-picker">
            <label htmlFor="member-sort-tag">標籤排序</label>
            <select
              id="member-sort-tag"
              className="investment-input"
              value={memberSortTag}
              onChange={(e) => setMemberSortTag(e.target.value as MemberSortTag)}
            >
              <option value="role">角色標籤</option>
              <option value="campaign">場次標籤</option>
              <option value="venue">會場標籤</option>
              <option value="lock">鎖定狀態標籤</option>
            </select>
          </div>
        </div>

        {sortedMembersByTag.length === 0 ? (
          <div className="investment-item">
            <p>目前沒有可顯示的成員資料。</p>
          </div>
        ) : (
          <div className="member-list-table">
            {sortedMembersByTag.map((member, idx) => {
              const campaignId = member.role === 'admin' ? member.managed_campaign_id : member.campaign_id;
              const campaignInfo = campaignOptions.find((campaign) => campaign.id === campaignId);
              const isAdminMember = member.role === 'admin';
              const campaignTag = campaignInfo
                ? `${campaignInfo.year} / ${campaignInfo.label}`
                : (campaignId || '未分配場次');
              const venueTag = member.assigned_venue_id || '未分配會場';
              const lockTag = member.is_voted ? '已鎖定' : '可編輯';
              return (
                <button
                  key={`member-row-${member.identifier}-${idx}`}
                  type="button"
                  className="member-list-row"
                  onClick={() => {
                    setSelectedMemberId(member.identifier);
                    setIsEditingMember(false);
                  }}
                >
                  <span className="member-list-name">{formatMemberIdentity(member.identifier, member.display_name)}</span>
                  <span className="member-list-tags">
                    <span className="member-tag role">{isAdminMember ? '系所管理者' : '評審'}</span>
                    {!(isAdminMember && campaignTag === '未分配場次') && (
                      <span className="member-tag campaign">{campaignTag}</span>
                    )}
                    {!isAdminMember && (
                      <span className="member-tag venue">{venueTag}</span>
                    )}
                    <span className={`member-tag lock ${member.is_voted ? 'locked' : 'editable'}`}>{lockTag}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>
            {isSuperAdmin(authUser?.role) && !isCampaignActive
              ? '新增系所管理者'
              : '新增成員'}
          </label>
          <div className="input-group">
            <input
              className="investment-input"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder={isSuperAdmin(authUser?.role) && !isCampaignActive ? '例如：資管系主任' : '例如：王評審'}
            />
            {!(isSuperAdmin(authUser?.role) && !isCampaignActive) && (
              <select
                className="investment-input"
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as 'judge' | 'admin')}
              >
                <option value="judge">教授</option>
                {isSuperAdmin(authUser?.role) && <option value="admin">系所管理者</option>}
              </select>
            )}
            <button
              onClick={createMember}
              disabled={isCreatingMember || !newMemberName.trim()}
            >
              {isCreatingMember ? '新增中...' : '新增'}
            </button>
          </div>
        </div>
      </section>}

      {adminTab === 'archives' && (
        <>
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
                          <button onClick={() => setSelectedHistoryCampaign(campaign)}>
                            查看戰況
                          </button>
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
        </>
      )}

      {selectedMemberId && (() => {
        const member = members.find((m) => m.identifier === selectedMemberId);
        if (!member) return null;

        return (
          <div className="admin-modal-backdrop" onClick={() => setSelectedMemberId(null)}>
            <div className="admin-modal member-detail-modal" onClick={(e) => e.stopPropagation()}>
              <h3>成員資料</h3>
              <div className="member-detail-info">
                <div className="info-row">
                  <label>員編-姓名：</label>
                  <span>{formatMemberIdentity(member.identifier, member.display_name)}</span>
                </div>
                <div className="info-row">
                  <label>角色：</label>
                  <span>{roleLabel(member.role)}</span>
                </div>
                {member.role === 'judge' && (
                  <div className="info-row">
                    <label>管理者：</label>
                    <span>{member.manager_identifier ? (managerNameByIdentifier[member.manager_identifier] || member.manager_identifier) : '未指派'}</span>
                  </div>
                )}
                <div className="info-row">
                  <label>會場：</label>
                  <span>{member.assigned_venue_id ? venues.find((v) => v.id === member.assigned_venue_id)?.name || member.assigned_venue_id : '尚未加入'}</span>
                </div>
                <div className="info-row">
                  <label>投資送出狀態：</label>
                  <span>{member.is_voted ? '已鎖定送出' : '尚未送出'}</span>
                </div>
              </div>

              {isEditingMember && (
                <div className="member-edit-form">
                  <div className="form-group">
                    <label>姓名</label>
                    <input
                      type="text"
                      className="investment-input"
                      value={memberEditName[member.identifier] ?? member.display_name}
                      onChange={(e) => setMemberEditName((prev) => ({ ...prev, [member.identifier]: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>角色</label>
                    <select
                      className="investment-input"
                      value={memberEditRole[member.identifier] ?? member.role}
                      onChange={(e) => setMemberEditRole((prev) => ({ ...prev, [member.identifier]: e.target.value as Role }))}
                    >
                      <option value="judge">評審</option>
                      {isSuperAdmin(authUser?.role) && <option value="admin">系所管理者</option>}
                    </select>
                  </div>
                  {(memberEditRole[member.identifier] ?? member.role) === 'judge' && isSuperAdmin(authUser?.role) && (
                    <div className="form-group">
                      <label>綁定管理者（員編-姓名）</label>
                      <select
                        className="investment-input"
                        value={memberEditManager[member.identifier] ?? member.manager_identifier ?? ''}
                        onChange={(e) => setMemberEditManager((prev) => ({ ...prev, [member.identifier]: e.target.value }))}
                      >
                        <option value="">未指派</option>
                        {[...adminMembers]
                          .sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-Hant'))
                          .map((admin) => (
                            <option key={admin.identifier} value={admin.identifier}>
                              {formatMemberIdentity(admin.identifier, admin.display_name)}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  {member.is_voted && (
                    <div className="form-note">
                      ⚠️ 此成員已鎖定投資。如要修改，需先解除鎖定。
                    </div>
                  )}
                </div>
              )}

              <div className="admin-modal-actions">
                {isEditingMember ? (
                  <>
                    <button onClick={() => setIsEditingMember(false)}>取消</button>
                    <button
                      onClick={() => updateMember(member.identifier)}
                      disabled={updatingMemberId === member.identifier}
                      style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                    >
                      {updatingMemberId === member.identifier ? '儲存中...' : '儲存'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setSelectedMemberId(null)}>關閉</button>
                    {member.is_voted && (
                      <button
                        onClick={() => unlockMember(member.identifier)}
                        disabled={unlockingMemberId === member.identifier}
                        style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
                      >
                        {unlockingMemberId === member.identifier ? '解除中...' : '解除鎖定'}
                      </button>
                    )}
                    <button onClick={() => setIsEditingMember(true)} style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                      修改個人資料
                    </button>
                    <button
                      onClick={() => deleteMember(member.identifier)}
                      disabled={deletingMemberId === member.identifier}
                      style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                    >
                      {deletingMemberId === member.identifier ? '刪除中...' : '刪除'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {canManageVenues && (
        <>
          {adminTab === 'venues' && <section className="section judge-form">
            <h3>會場管理</h3>
            <p style={{ marginBottom: 12 }}>
              {isCampaignActive
                ? '啟動後才需要處理會場、教室與各會場評審鎖定狀態。可直接拖拉評審卡片到對應會議廳。'
                : '目前為 super_admin 預覽模式，可直接檢視會場管理介面與可拖拉區塊。'}
            </p>

            {isSuperAdmin(authUser?.role) && (
              <div className="form-group">
                <label>選擇場次</label>
                <div className="input-group">
                  <select
                    className="investment-input"
                    value={selectedMemberCampaignId}
                    onChange={(e) => setSelectedMemberCampaignId(e.target.value)}
                  >
                    {venueCampaignOptions.length === 0 && <option value="">尚無進行中場次</option>}
                    {venueCampaignOptions.map((campaign) => (
                      <option key={`venue-campaign-${campaign.id}`} value={campaign.id}>
                        {campaign.year} / {campaign.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!selectedMemberCampaignId) return;
                      loadMembers(selectedMemberCampaignId);
                      loadVenues(selectedMemberCampaignId);
                    }}
                    disabled={!selectedMemberCampaignId || isLoadingMembers}
                  >
                    {isLoadingMembers ? '讀取中...' : '套用場次'}
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>尚未分派會場的評審（可拖拉到下方會議廳）</label>
              <div className="unassigned-drag-pool">
                {(venueJudgeGroups.__unassigned__ || []).map((judge) => (
                  <div
                    key={`pool-${judge.identifier}`}
                    className={`venue-judge-card ${assigningMemberId === judge.identifier ? 'loading' : ''}`}
                    draggable={assigningMemberId !== judge.identifier}
                    onDragStart={() => setDraggingJudgeId(judge.identifier)}
                    onDragEnd={() => setDraggingJudgeId(null)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="member-name">{formatMemberIdentity(judge.identifier, judge.display_name)}</div>
                    <div className="venue-judge-meta">
                      {assigningMemberId === judge.identifier ? (
                        <span className="venue-loading-inline">
                          <span className="venue-loading-spinner" aria-hidden="true"></span>
                          分派中，等待系統處理...
                        </span>
                      ) : '拖拉到任一會議廳以分派'}
                    </div>
                  </div>
                ))}
                {!(venueJudgeGroups.__unassigned__ || []).length && (
                  <p className="manager-empty">目前沒有尚未分派會場的評審</p>
                )}
              </div>
            </div>

            <div className="venue-board">
              {[...venues]
                .sort((a, b) => (a.classroom || a.name).localeCompare((b.classroom || b.name), 'zh-Hant', { numeric: true, sensitivity: 'base' }))
                .map((venue) => (
                  <div
                    key={`board-${venue.id}`}
                    className="venue-col"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!draggingJudgeId) return;
                      const judge = judgeMembers.find((member) => member.identifier === draggingJudgeId);
                      setDraggingJudgeId(null);
                      if (!judge) return;
                      assignJudgeToVenue(judge, venue.id);
                    }}
                  >
                    <div className="venue-col-header">
                      <strong>{venue.classroom || venue.name}</strong>
                      <span>{(venueMemberStats[venue.id]?.managers || 0)} 管理者 / {(venueMemberStats[venue.id]?.judges || 0)} 評審</span>
                    </div>
                    <div className="venue-col-subtitle">{venue.projects.length} 個專題組</div>
                    <div className="venue-col-body">
                      {(venueJudgeGroups[venue.id] || []).map((judge) => (
                        <div
                          key={judge.identifier}
                          className={`venue-judge-card ${assigningMemberId === judge.identifier ? 'loading' : ''}`}
                          draggable={assigningMemberId !== judge.identifier}
                          onDragStart={() => setDraggingJudgeId(judge.identifier)}
                          onDragEnd={() => setDraggingJudgeId(null)}
                          onClick={() => {
                            setSelectedMemberId(judge.identifier);
                            setIsEditingMember(false);
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="member-name">{formatMemberIdentity(judge.identifier, judge.display_name)}</div>
                          <div className="venue-judge-meta">
                            {assigningMemberId === judge.identifier ? (
                              <span className="venue-loading-inline">
                                <span className="venue-loading-spinner" aria-hidden="true"></span>
                                移動中，等待系統處理...
                              </span>
                            ) : (judge.is_voted ? '已鎖定' : '可移動')}
                          </div>
                        </div>
                      ))}
                      {!(venueJudgeGroups[venue.id] || []).length && (
                        <p className="manager-empty">拖拉評審到這裡</p>
                      )}
                    </div>
                  </div>
                ))}

              <div
                className="venue-col venue-unassigned-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggingJudgeId) return;
                  const judge = judgeMembers.find((member) => member.identifier === draggingJudgeId);
                  setDraggingJudgeId(null);
                  if (!judge) return;
                  unassignJudgeFromVenue(judge);
                }}
              >
                <div className="venue-col-header">
                  <strong>未分配評審</strong>
                  <span>0 管理者 / {(venueJudgeGroups.__unassigned__ || []).length} 評審</span>
                </div>
                <div className="venue-col-subtitle">拖到這裡可取消會議廳指派</div>
                <div className="venue-col-body">
                  {(venueJudgeGroups.__unassigned__ || []).map((judge) => (
                    <div
                      key={judge.identifier}
                      className={`venue-judge-card ${assigningMemberId === judge.identifier ? 'loading' : ''}`}
                      draggable={assigningMemberId !== judge.identifier}
                      onDragStart={() => setDraggingJudgeId(judge.identifier)}
                      onDragEnd={() => setDraggingJudgeId(null)}
                      onClick={() => {
                        setSelectedMemberId(judge.identifier);
                        setIsEditingMember(false);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="member-name">{formatMemberIdentity(judge.identifier, judge.display_name)}</div>
                      <div className="venue-judge-meta">
                        {assigningMemberId === judge.identifier ? (
                          <span className="venue-loading-inline">
                            <span className="venue-loading-spinner" aria-hidden="true"></span>
                            更新中，等待系統處理...
                          </span>
                        ) : '尚未分配'}
                      </div>
                    </div>
                  ))}
                  {!(venueJudgeGroups.__unassigned__ || []).length && (
                    <p className="manager-empty">目前沒有未分配評審</p>
                  )}
                </div>
              </div>
            </div>

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
              {[...venues]
                .sort((a, b) => (a.classroom || a.name).localeCompare((b.classroom || b.name), 'zh-Hant', { numeric: true, sensitivity: 'base' }))
                .map((venue) => (
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
                      <button onClick={() => setPendingVenueDelete(venue)} disabled={deletingVenueId === venue.id}>
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
                <span className="venue-view-classroom">會場：{viewVenue?.classroom || '未設定'}</span>
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
                        <span className="venue-member-name">{formatMemberIdentity(member.identifier, member.display_name)}</span>
                        <span className="venue-member-status">{member.is_voted ? '已鎖定' : '可編輯'}</span>
                        {member.is_voted && (
                          <div className="venue-member-btns">
                            <button
                              onClick={() => unlockMember(member.identifier)}
                              disabled={unlockingMemberId === member.identifier}
                            >
                              {unlockingMemberId === member.identifier ? '...' : '解除鎖定'}
                            </button>
                          </div>
                        )}
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
              <div className="input-group" style={{ marginTop: 10 }}>
                <input
                  type="file"
                  className="investment-input"
                  accept=".csv,.txt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    try {
                      await parseGroupImportFile(file);
                      setMessage('已載入匯入檔，請先確認清單內容');
                    } catch {
                      setError('匯入檔解析失敗。發生錯誤，請聯絡系統管理員');
                    }
                  }}
                />
              </div>

              {groupImportPreview.length > 0 && (
                <div className="investment-item" style={{ marginTop: 10 }}>
                  <h3 style={{ fontSize: 18, marginBottom: 8 }}>匯入預覽</h3>
                  <div className="lobby-tags" style={{ marginBottom: 10 }}>
                    {groupImportPreview.map((group) => (
                      <span key={`preview-${group}`} className="lobby-tag">{group}</span>
                    ))}
                  </div>
                  <div className="admin-modal-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const merged = Array.from(
                          new Set(
                            [...setupProjectDraft.split(/\n+/), ...groupImportPreview]
                              .map((name) => normalizeDisplayName(name))
                              .filter(Boolean)
                          )
                        );
                        setSetupProjectDraft(merged.join('\n'));
                        setGroupImportPreview([]);
                        setMessage('已確認匯入資料');
                      }}
                    >
                      確認
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('是否刪除此一匯入資料？')) {
                          setGroupImportPreview([]);
                        }
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              )}
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
                          {formatMemberIdentity(m.identifier, m.display_name)}{setupSelectedMemberIds.includes(m.identifier) ? ' ✓' : ''}
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
                          {formatMemberIdentity(m.identifier, m.display_name)}（目前：{m.assigned_venue_id}）{setupSelectedMemberIds.includes(m.identifier) ? ' ✓' : ''}
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
                          {formatMemberIdentity(m.identifier, m.display_name)}（此會場）{setupSelectedMemberIds.includes(m.identifier) ? ' ✓' : ''}
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
                        {m ? formatMemberIdentity(m.identifier, m.display_name) : id}
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
                placeholder={'例如：\n王小明\n陳評審'}
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
                  setGroupImportPreview([]);
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
      {selectedHistoryCampaign && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-history-detail-modal">
            <h3>{selectedHistoryCampaign.label}｜封存戰況</h3>
            <p className="admin-modal-note">
              場次年度：{selectedHistoryCampaign.year} /
              封存時間：{selectedHistoryCampaign.closed_at ? new Date(selectedHistoryCampaign.closed_at).toLocaleString('zh-Hant-TW') : '未記錄'}
            </p>

            {selectedHistoryCampaign.summary?.venues && selectedHistoryCampaign.summary.venues.length > 0 ? (
              <>
                <div className="history-venue-list">
                  {selectedHistoryCampaign.summary.venues
                    .slice()
                    .sort((a, b) => b.total_investment - a.total_investment)
                    .map((venue) => (
                      <div key={venue.venue_id} className="history-venue-card">
                        <div className="history-venue-header">
                          <strong>{venue.venue_name}</strong>
                          <span>${venue.total_investment.toLocaleString()}</span>
                        </div>
                        <p className="admin-modal-note" style={{ marginTop: 6 }}>
                          評審鎖定：{venue.locked_count ?? 0} / {venue.judge_count ?? 0}
                        </p>
                        {venue.projects && venue.projects.length > 0 ? (
                          <div className="history-project-list">
                            {venue.projects.map((project, index) => (
                              <div key={project.project_id} className="history-project-row">
                                <span>第 {project.rank ?? index + 1} 名</span>
                                <span>{project.project_name}</span>
                                <span>${project.total_investment.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="admin-modal-note" style={{ marginTop: 8 }}>此封存紀錄未包含專題明細。</p>
                        )}
                      </div>
                    ))}
                </div>

                <div className="history-overall-section">
                  <h4>全部組別投資金總排名</h4>
                  {selectedHistoryCampaign.summary?.overall_project_ranking && selectedHistoryCampaign.summary.overall_project_ranking.length > 0 ? (
                    <div className="history-overall-list">
                      {selectedHistoryCampaign.summary.overall_project_ranking.map((project, index) => (
                        <div key={`${project.venue_id}-${project.project_id}-${index}`} className="history-overall-row">
                          <span>第 {project.rank ?? index + 1} 名</span>
                          <span>{project.project_name}</span>
                          <span>{project.venue_name || '未指定'}</span>
                          <span>${project.total_investment.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-modal-note">此封存紀錄尚未包含全部組別總排名（可用新封存場次查看）。</p>
                  )}
                </div>
              </>
            ) : (
              <p className="admin-modal-note">此封存紀錄僅有總額，尚無會場/專題戰況細節。</p>
            )}

            <div className="admin-modal-actions">
              <button onClick={() => setSelectedHistoryCampaign(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      {qrInviteCampaign && (() => {
        const qrInviteUrl = qrInviteCampaign.invite_token
          ? `${window.location.origin}${window.location.pathname}?c=${encodeURIComponent(qrInviteCampaign.invite_token)}`
          : '';
        if (!qrInviteUrl) {
          return null;
        }
        return (
          <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setQrInviteCampaign(null)}>
            <div className="admin-modal admin-qr-modal" onClick={(e) => e.stopPropagation()}>
              <h3>邀請 QRCode</h3>
              <p className="admin-modal-note">
                場次：{qrInviteCampaign.year} / {qrInviteCampaign.label}
              </p>
              <div className="admin-qr-wrap">
                <QRCodeCanvas value={qrInviteUrl} size={280} includeMargin level="M" />
              </div>
              <div className="admin-qr-url">{qrInviteUrl}</div>
              <div className="admin-modal-actions">
                <button onClick={() => setQrInviteCampaign(null)}>關閉</button>
                <button className="submit-button" onClick={() => window.print()}>列印 QRCode</button>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingMoveJudge && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-confirm-modal">
            <h3>{pendingMoveJudge.managerIdentifier ? '確認移動評審' : '確認移出群組'}</h3>
            <p className="admin-modal-note">
              {pendingMoveJudge.managerIdentifier
                ? <>將「{pendingMoveJudge.judge.display_name}」移至「{pendingMoveJudge.managerName}」的群組？</>
                : <>將「{pendingMoveJudge.judge.display_name}」從「{pendingMoveJudge.managerName}」群組移出？</>}
            </p>
            <div className="admin-modal-actions">
              <button onClick={() => setPendingMoveJudge(null)}>取消</button>
              <button
                className="submit-button"
                style={pendingMoveJudge.managerIdentifier
                  ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)' }
                  : { background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                onClick={() => {
                  const { judge, managerIdentifier } = pendingMoveJudge;
                  setPendingMoveJudge(null);
                  executeMoveJudge(judge, managerIdentifier);
                }}
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {loadingMoveJudge && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-confirm-modal move-loading-modal">
            <span className="move-confirm-spinner move-confirm-spinner-lg" />
            <p className="move-loading-text">正在移動「{loadingMoveJudge.display_name}」...</p>
          </div>
        </div>
      )}

      {pendingVenueDelete && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-confirm-modal">
            <h3>確認刪除會場？</h3>
            <p className="admin-modal-note">
              你即將刪除「{pendingVenueDelete.classroom || pendingVenueDelete.name}」。
              此操作會自動將該會場的評審移出並解除鎖定。
            </p>
            <div className="admin-modal-actions">
              <button
                onClick={() => setPendingVenueDelete(null)}
                disabled={deletingVenueId === pendingVenueDelete.id}
              >
                取消
              </button>
              <button
                className="submit-button"
                style={{ background: '#dc2626' }}
                onClick={() => deleteVenue(pendingVenueDelete.id)}
                disabled={deletingVenueId === pendingVenueDelete.id}
              >
                {deletingVenueId === pendingVenueDelete.id ? '刪除中...' : '確認刪除會場'}
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
  const effectiveVenueId = authUser?.venue_id || selectedVenueId || dashboardVenueId || venues[0]?.id || '';
  const canSeeDashboard = (isCampaignActive || isSuperAdminUser) && Boolean(dashboardVenueId || venues[0]?.id);
  const joinedVenueId = judgeStatus?.assigned_venue_id || authUser?.venue_id || null;

  return (
    <div className="app-container">
      <div className="navigation">
        <div className="navigation-top-row">
          <h1>FundThePitch - 專題模擬投資評分系統</h1>
          {authUser && (
            <button
              className="nav-toggle"
              type="button"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              aria-expanded={isMobileNavOpen}
              aria-label="切換導覽列"
            >
              {isMobileNavOpen ? '收合選單' : '展開選單'}
            </button>
          )}
        </div>
        {authUser && (
          <div className={`nav-buttons ${isMobileNavOpen ? 'open' : ''}`}>
              {isAdminRole(authUser.role) && (
                <button
                  onClick={() => {
                    setCurrentView('admin');
                    setIsMobileNavOpen(false);
                  }}
                  className={currentView === 'admin' ? 'active' : ''}
                >
                  管理員
                </button>
              )}
              <button
                disabled={!isCampaignActive && !isSuperAdminUser}
                onClick={() => {
                  setCurrentView('lobby');
                  setIsMobileNavOpen(false);
                }}
                className={currentView === 'lobby' ? 'active' : ''}
              >
                會場選擇
              </button>
              <button
                disabled={(!isCampaignActive || !hasVenue) && !isSuperAdminUser}
                onClick={() => {
                  setCurrentView('judge');
                  setIsMobileNavOpen(false);
                }}
                className={currentView === 'judge' ? 'active' : ''}
              >
                評審投資
              </button>
              <button
                disabled={!isCampaignActive && !isSuperAdminUser}
                onClick={() => {
                  setCurrentView('dashboard');
                  setIsMobileNavOpen(false);
                }}
                className={currentView === 'dashboard' ? 'active' : ''}
              >
                會場投資戰況
              </button>
              <button onClick={logout} disabled={isLoggingOut}>{isLoggingOut ? '登出中...' : '登出'}</button>
          </div>
        )}
      </div>

      <div className="content">
        {error && <div className="error-message">{error || '發生錯誤，請聯絡系統管理員'}</div>}
        {message && <div className="success-message">{message}</div>}

        {!authUser && renderLogin()}

        {authUser && currentView === 'lobby' && renderLobby()}

        {authUser && currentView === 'judge' && authToken && ((hasVenue && isCampaignActive) || (isSuperAdminUser && Boolean(effectiveVenueId))) && (
          <JudgeUI
            authToken={authToken}
            authUser={authUser}
            venueId={effectiveVenueId}
            venueName={venues.find((v) => v.id === effectiveVenueId)?.name}
            isLocked={isSuperAdminUser ? true : Boolean(judgeStatus?.is_voted)}
            onLeaveVenue={isSuperAdminUser ? (async () => Promise.resolve()) : leaveVenue}
            onSubmitted={refreshJudgeStatus}
          />
        )}

        {authUser && currentView === 'judge' && !isCampaignActive && !isSuperAdminUser && (
          <div className="container" style={{ maxWidth: 920 }}>
            <section className="section">
              <h3>評審投資</h3>
              <p>目前尚未啟動專題會，暫無投資與會場資料。</p>
            </section>
          </div>
        )}

        {authUser && currentView === 'judge' && isSuperAdminUser && !effectiveVenueId && (
          <div className="container" style={{ maxWidth: 920 }}>
            <section className="section">
              <h3>評審投資（super_admin 預覽）</h3>
              <p>目前尚無可預覽的會場，請先新增會場後即可檢視評審介面。</p>
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
                          <p>會場：{venue.classroom}</p>
                          <p>評審數：{venue.judges.length}</p>
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

        {authUser && currentView === 'admin' && isAdminRole(authUser.role) && renderAdmin()}
      </div>
    </div>
  );
}

export default App;
