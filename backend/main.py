import os
import re
import secrets
import math
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from firestore_db import FirestoreDB


def initialize_startup_state() -> None:
    restore_active_campaign_state()
    initialize_venue_projects()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_startup_state()
    yield


app = FastAPI(title="FundThePitch", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_PROJECTS = [
    {"id": "proj_001", "name": "AI聊天機器人", "total_investment": 0},
    {"id": "proj_002", "name": "智慧家居系統", "total_investment": 0},
    {"id": "proj_003", "name": "行動健康追蹤應用", "total_investment": 0},
    {"id": "proj_004", "name": "區塊鏈供應鏈追蹤", "total_investment": 0},
]

DEFAULT_JUDGES = [
    {"id": "judge_001", "name": "評審 A", "is_voted": False, "assigned_venue_id": None},
    {"id": "judge_002", "name": "評審 B", "is_voted": False, "assigned_venue_id": None},
    {"id": "judge_003", "name": "評審 C", "is_voted": False, "assigned_venue_id": None},
]

DEFAULT_VENUES: List[dict] = []

projects = [dict(project) for project in DEFAULT_PROJECTS]
judges = [dict(judge) for judge in DEFAULT_JUDGES]
venues = [dict(venue) for venue in DEFAULT_VENUES]
verified_users: Dict[str, dict] = {}
auth_sessions: Dict[str, dict] = {}
verification_code_store: Dict[str, dict] = {}
venue_projects: Dict[str, List[dict]] = {}
venue_judge_investments: Dict[str, Dict[str, Dict[str, float]]] = {}

campaign_history: List[dict] = []
recently_deleted_campaigns: List[dict] = []
current_campaign: Optional[dict] = None

DEV_BYPASS_VERIFICATION = os.getenv("DEV_BYPASS_VERIFICATION", "true").lower() == "true"
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "48"))
CODE_TTL_SECONDS = int(os.getenv("CODE_TTL_SECONDS", "300"))
VERIFIED_ACCESS_DAYS = int(os.getenv("VERIFIED_ACCESS_DAYS", "2"))
ARCHIVE_RETENTION_DAYS = int(os.getenv("ARCHIVE_RETENTION_DAYS", "30"))

PHONE_PATTERN = re.compile(r"^09\d{8}$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

security = HTTPBearer(auto_error=False)
db = FirestoreDB()


class ProjectResponse(BaseModel):
    id: str
    name: str
    total_investment: float


class ProjectsListResponse(BaseModel):
    projects: List[ProjectResponse]
    total_budget: float
    remaining_budget: float
    venue_id: Optional[str] = None
    venue_name: Optional[str] = None


class VenueResponse(BaseModel):
    id: str
    name: str
    classroom: str
    judges: List[str] = []
    projects: List[str] = []


class SessionUser(BaseModel):
    user_id: str
    role: Literal["admin", "judge"]
    display_name: str
    identifier: str
    venue_id: Optional[str] = None
    campaign_year: Optional[int] = None
    campaign_id: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: SessionUser


class IdentifierRequest(BaseModel):
    identifier: str


class NameLoginRequest(BaseModel):
    display_name: str


class VerificationRequest(BaseModel):
    identifier: str


class VerificationConfirmRequest(BaseModel):
    identifier: str
    otp: str
    display_name: str


class AuthorizeJudgeRequest(BaseModel):
    identifier: str
    role: Literal["judge", "admin"] = "judge"


class JoinVenueRequest(BaseModel):
    venue_id: str


class VenueCreateRequest(BaseModel):
    name: str
    classroom: Optional[str] = None


class VenueUpdateRequest(BaseModel):
    name: str
    classroom: Optional[str] = None


class VenueProjectsUpdateRequest(BaseModel):
    project_names: List[str]


class MemberCreateRequest(BaseModel):
    display_name: str
    role: Literal["judge", "admin"] = "judge"


class MemberUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    role: Optional[Literal["judge", "admin"]] = None


class JudgeResponse(BaseModel):
    id: str
    name: str
    is_voted: bool
    assigned_venue_id: Optional[str] = None


class InvestmentData(BaseModel):
    investments: Dict[str, float]
    lock_submission: bool = True


class SubmitInvestmentResponse(BaseModel):
    success: bool
    message: str
    updated_projects: Optional[List[ProjectResponse]] = None


class AdminRoundResetResponse(BaseModel):
    success: bool
    message: str


class VerificationRequestResponse(BaseModel):
    success: bool
    channel: Literal["sms", "email"]
    message: str
    debug_otp: Optional[str] = None


class AdminOverviewResponse(BaseModel):
    active_sessions: int
    verified_users: List[dict]
    venues: List[VenueResponse]


class JudgeStatusResponse(BaseModel):
    identifier: str
    display_name: str
    role: Literal["admin", "judge"]
    assigned_venue_id: Optional[str] = None
    is_voted: bool
    campaign_year: Optional[int] = None
    campaign_id: Optional[str] = None


class MyInvestmentResponse(BaseModel):
    venue_id: Optional[str] = None
    investments: Dict[str, float]
    is_voted: bool
    campaign_year: Optional[int] = None
    campaign_id: Optional[str] = None


class SystemStartRequest(BaseModel):
    label: Optional[str] = None


class SystemCampaignResponse(BaseModel):
    id: str
    year: int
    label: str
    status: Literal["active", "closed"]
    started_at: str
    closed_at: Optional[str] = None
    summary: Optional[dict] = None


class RecentlyDeletedCampaignResponse(SystemCampaignResponse):
    deleted_at: str
    restore_deadline: str
    days_remaining: int


class AdminSystemStateResponse(BaseModel):
    current_campaign: Optional[SystemCampaignResponse] = None
    campaigns_by_year: Dict[str, List[SystemCampaignResponse]]
    recently_deleted_by_year: Dict[str, List[RecentlyDeletedCampaignResponse]]


class MemberStatusUpdateRequest(BaseModel):
    assigned_venue_id: Optional[str] = None
    is_voted: Optional[bool] = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_time(value: object) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def detect_identifier_type(raw: str) -> Tuple[str, Literal["email", "phone"]]:
    identifier = raw.strip().replace(" ", "")
    if PHONE_PATTERN.match(identifier):
        return identifier, "phone"

    lowered = identifier.lower()
    if EMAIL_PATTERN.match(lowered):
        return lowered, "email"

    raise HTTPException(status_code=400, detail="請輸入有效的 email 或 09 開頭手機號碼")


def normalize_display_name(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if not normalized:
        raise HTTPException(status_code=400, detail="請輸入姓名")
    if len(normalized) > 32:
        raise HTTPException(status_code=400, detail="姓名長度不可超過 32 個字元")
    return normalized


def normalize_role(value: object) -> Literal["admin", "judge"]:
    return "admin" if str(value) == "admin" else "judge"


def normalize_campaign_year(value: Optional[int]) -> int:
    year = int(value or now_utc().year)
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=400, detail="年份格式不正確")
    return year


def get_member_scope_year(preferred_year: Optional[int] = None) -> int:
    if preferred_year is not None:
        return normalize_campaign_year(preferred_year)
    if current_campaign:
        return normalize_campaign_year(int(current_campaign.get("year", now_utc().year)))
    return normalize_campaign_year(now_utc().year)


def get_member_scope_campaign_id(preferred_campaign_id: Optional[str] = None) -> Optional[str]:
    if preferred_campaign_id:
        value = preferred_campaign_id.strip()
        if value:
            return value
    if current_campaign:
        return str(current_campaign.get("id", "")) or None
    return None


def resolve_campaign_year_by_id(campaign_id: str, fallback_year: Optional[int] = None) -> int:
    fallback = normalize_campaign_year(fallback_year or now_utc().year)
    target = campaign_id.strip()
    if not target:
        return fallback

    if current_campaign and str(current_campaign.get("id", "")) == target:
        return campaign_record_year(current_campaign, fallback)

    for item in campaign_history:
        if str(item.get("id", "")) == target:
            return campaign_record_year(item, fallback)

    if db.enabled:
        for state in db.list_campaign_states():
            for item in state.get("campaign_history", []):
                if isinstance(item, dict) and str(item.get("id", "")) == target:
                    return campaign_record_year(item, int(state.get("year", fallback)))
            current = state.get("current_campaign")
            if isinstance(current, dict) and str(current.get("id", "")) == target:
                return campaign_record_year(current, int(state.get("year", fallback)))

    return fallback


def slugify(value: str) -> str:
    lowered = value.strip().lower()
    normalized = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", lowered)
    normalized = normalized.strip("-")
    return normalized or f"venue-{secrets.token_hex(3)}"


def venue_name_by_id(venue_id: str) -> Optional[str]:
    for venue in venues:
        if venue["id"] == venue_id:
            return str(venue["name"])
    return None


def build_venue_response(venue: dict) -> VenueResponse:
    venue_id = str(venue["id"])
    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    assigned_judges = [
        str(user.get("display_name", "未命名評審"))
        for user in list_verified_users(campaign_year=scope_year, campaign_id=scope_campaign_id)
        if normalize_role(user.get("role", "judge")) == "judge"
        and user.get("assigned_venue_id") == venue_id
    ]
    projects_for_venue = [str(project.get("name", "未命名專題")) for project in get_projects_data(venue_id)]

    return VenueResponse(
        id=venue_id,
        name=str(venue.get("name", venue_id)),
        classroom=str(venue.get("classroom", "未設定教室")),
        judges=assigned_judges,
        projects=projects_for_venue,
    )


def clone_default_projects() -> List[dict]:
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "total_investment": 0,
        }
        for p in DEFAULT_PROJECTS
    ]


def ensure_venue_project_store(venue_id: str) -> None:
    if venue_id not in venue_projects:
        venue_projects[venue_id] = clone_default_projects()
    venue_judge_investments.setdefault(venue_id, {})


def initialize_venue_projects() -> None:
    for venue in venues:
        ensure_venue_project_store(str(venue["id"]))


def campaign_record_year(record: dict, default_year: Optional[int] = None) -> int:
    fallback = normalize_campaign_year(default_year or now_utc().year)
    raw = record.get("year", fallback)
    try:
        return normalize_campaign_year(int(raw))
    except (TypeError, ValueError):
        return fallback


def clone_venue_projects(data: Dict[str, List[dict]]) -> Dict[str, List[dict]]:
    cloned: Dict[str, List[dict]] = {}
    for venue_id, projects_list in data.items():
        rows: List[dict] = []
        for project in projects_list:
            rows.append(
                {
                    "id": str(project.get("id", "")),
                    "name": str(project.get("name", "未命名專題")),
                    "total_investment": float(project.get("total_investment", 0)),
                }
            )
        cloned[str(venue_id)] = rows
    return cloned


def clone_venue_judge_investments(data: Dict[str, Dict[str, Dict[str, float]]]) -> Dict[str, Dict[str, Dict[str, float]]]:
    cloned: Dict[str, Dict[str, Dict[str, float]]] = {}
    for venue_id, judge_map in data.items():
        cloned_judges: Dict[str, Dict[str, float]] = {}
        for identifier, allocations in judge_map.items():
            cloned_judges[str(identifier)] = {
                str(project_id): float(amount)
                for project_id, amount in allocations.items()
            }
        cloned[str(venue_id)] = cloned_judges
    return cloned


def campaign_history_for_year(campaign_year: int) -> List[dict]:
    if db.enabled:
        state = db.get_campaign_state(campaign_year)
        rows = state.get("campaign_history", []) if isinstance(state, dict) else []
        records = [dict(item) for item in rows if isinstance(item, dict)]
    else:
        records = [
            dict(item)
            for item in campaign_history
            if campaign_record_year(item, campaign_year) == campaign_year
        ]

    latest_by_id: Dict[str, dict] = {}
    for item in records:
        campaign_id = str(item.get("id", ""))
        if not campaign_id:
            continue
        prev = latest_by_id.get(campaign_id)
        prev_closed = str(prev.get("closed_at", "")) if prev else ""
        cur_closed = str(item.get("closed_at", ""))
        if prev is None or cur_closed >= prev_closed:
            latest_by_id[campaign_id] = item

    return sorted(latest_by_id.values(), key=lambda row: str(row.get("closed_at", "")), reverse=True)


def normalize_recently_deleted_record(record: dict, campaign_year: int) -> Optional[dict]:
    deleted_at = parse_time(record.get("deleted_at"))
    if not deleted_at:
        return None

    restore_deadline = parse_time(record.get("restore_deadline"))
    if not restore_deadline:
        restore_deadline = deleted_at + timedelta(days=ARCHIVE_RETENTION_DAYS)

    return {
        "id": str(record.get("id", "")),
        "year": campaign_record_year(record, campaign_year),
        "label": str(record.get("label", "未命名場次")),
        "status": "closed",
        "started_at": str(record.get("started_at", now_utc().isoformat())),
        "closed_at": record.get("closed_at"),
        "summary": record.get("summary"),
        "deleted_at": deleted_at.isoformat(),
        "restore_deadline": restore_deadline.isoformat(),
    }


def recently_deleted_for_year(campaign_year: int) -> List[dict]:
    if db.enabled:
        state = db.get_campaign_state(campaign_year)
        rows = state.get("recently_deleted_campaigns", []) if isinstance(state, dict) else []
        records = [dict(item) for item in rows if isinstance(item, dict)]
    else:
        records = [
            dict(item)
            for item in recently_deleted_campaigns
            if campaign_record_year(item, campaign_year) == campaign_year
        ]

    latest_by_id: Dict[str, dict] = {}
    for item in records:
        normalized = normalize_recently_deleted_record(item, campaign_year)
        if not normalized:
            continue
        campaign_id = str(normalized.get("id", ""))
        if not campaign_id:
            continue
        prev = latest_by_id.get(campaign_id)
        prev_deleted = str(prev.get("deleted_at", "")) if prev else ""
        cur_deleted = str(normalized.get("deleted_at", ""))
        if prev is None or cur_deleted >= prev_deleted:
            latest_by_id[campaign_id] = normalized

    return sorted(latest_by_id.values(), key=lambda row: str(row.get("deleted_at", "")), reverse=True)


def purge_expired_recently_deleted(campaign_year: int) -> List[dict]:
    now = now_utc()
    active: List[dict] = []
    for item in recently_deleted_for_year(campaign_year):
        deadline = parse_time(item.get("restore_deadline"))
        if not deadline:
            continue
        if deadline > now:
            active.append(item)

    if db.enabled:
        db.save_campaign_state(
            campaign_year,
            {
                "current_campaign": dict(current_campaign) if current_campaign and campaign_record_year(current_campaign) == campaign_year else None,
                "campaign_history": campaign_history_for_year(campaign_year),
                "venues": [dict(venue) for venue in venues] if current_campaign and campaign_record_year(current_campaign) == campaign_year else [],
                "venue_projects": clone_venue_projects(venue_projects) if current_campaign and campaign_record_year(current_campaign) == campaign_year else {},
                "venue_judge_investments": clone_venue_judge_investments(venue_judge_investments) if current_campaign and campaign_record_year(current_campaign) == campaign_year else {},
                "recently_deleted_campaigns": active,
            },
        )
    else:
        recently_deleted_campaigns[:] = [
            item
            for item in recently_deleted_campaigns
            if campaign_record_year(item, campaign_year) != campaign_year
        ] + [dict(item) for item in active]

    return active


def persist_campaign_state(
    campaign_year: int,
    history_override: Optional[List[dict]] = None,
    deleted_override: Optional[List[dict]] = None,
) -> None:
    if not db.enabled:
        return

    target_year = normalize_campaign_year(campaign_year)
    active_year = campaign_record_year(current_campaign, target_year) if current_campaign else None
    current_payload = dict(current_campaign) if active_year == target_year else None
    history_payload = history_override if history_override is not None else campaign_history_for_year(target_year)
    deleted_payload = deleted_override if deleted_override is not None else recently_deleted_for_year(target_year)

    db.save_campaign_state(
        target_year,
        {
            "current_campaign": current_payload,
            "campaign_history": [dict(item) for item in history_payload],
            "venues": [dict(venue) for venue in venues] if current_payload else [],
            "venue_projects": clone_venue_projects(venue_projects) if current_payload else {},
            "venue_judge_investments": clone_venue_judge_investments(venue_judge_investments) if current_payload else {},
            "recently_deleted_campaigns": [dict(item) for item in deleted_payload],
        },
    )


def restore_active_campaign_state() -> None:
    global current_campaign

    if not db.enabled:
        return

    restored = db.get_active_campaign_state()
    if not restored:
        return

    state = restored.get("state", {}) if isinstance(restored, dict) else {}
    current = state.get("current_campaign")
    if not isinstance(current, dict):
        return

    current_campaign = dict(current)
    campaign_history[:] = [
        dict(item)
        for item in state.get("campaign_history", [])
        if isinstance(item, dict)
    ]
    recently_deleted_campaigns[:] = [
        dict(item)
        for item in state.get("recently_deleted_campaigns", [])
        if isinstance(item, dict)
    ]
    venues[:] = [
        {
            "id": str(venue.get("id", "")),
            "name": str(venue.get("name", "未命名會場")),
            "classroom": str(venue.get("classroom", "待公布教室")),
        }
        for venue in state.get("venues", [])
        if isinstance(venue, dict)
    ]

    stored_projects = state.get("venue_projects", {})
    if isinstance(stored_projects, dict):
        venue_projects.clear()
        venue_projects.update(clone_venue_projects(stored_projects))

    stored_judge_investments = state.get("venue_judge_investments", {})
    if isinstance(stored_judge_investments, dict):
        venue_judge_investments.clear()
        venue_judge_investments.update(clone_venue_judge_investments(stored_judge_investments))


def get_projects_data(venue_id: Optional[str] = None) -> List[dict]:
    if venue_id:
        ensure_venue_project_store(venue_id)
        return venue_projects[venue_id]

    aggregate = clone_default_projects()
    for venue_data in venue_projects.values():
        for idx, project in enumerate(venue_data):
            aggregate[idx]["total_investment"] += float(project.get("total_investment", 0))
    return aggregate


def verified_user_store_key(identifier: str, campaign_year: int, campaign_id: Optional[str] = None) -> str:
    if campaign_id:
        return f"campaign::{campaign_id}::{identifier}"
    return f"{campaign_year}::{identifier}"


def get_verified_user(
    identifier: str,
    campaign_year: Optional[int] = None,
    campaign_id: Optional[str] = None,
    allow_legacy: bool = False,
) -> Optional[dict]:
    if db.enabled:
        return db.get_verified_user(
            identifier,
            campaign_year=campaign_year,
            campaign_id=campaign_id,
            allow_legacy=allow_legacy,
        )

    if campaign_id is not None:
        scoped = verified_users.get(verified_user_store_key(identifier, campaign_year or get_member_scope_year(), campaign_id=campaign_id))
        if scoped:
            return scoped

    if campaign_year is not None:
        scoped = verified_users.get(verified_user_store_key(identifier, campaign_year))
        if scoped:
            return scoped
    if allow_legacy:
        return verified_users.get(identifier)
    return None


def list_verified_users(campaign_year: Optional[int] = None, campaign_id: Optional[str] = None) -> List[dict]:
    if db.enabled:
        return db.list_verified_users(campaign_year=campaign_year, campaign_id=campaign_id)

    rows = list(verified_users.values())
    if campaign_id is not None:
        rows = [row for row in rows if row.get("campaign_id") == campaign_id]
    elif campaign_year is not None:
        rows = [row for row in rows if row.get("campaign_year") == campaign_year]
    return sorted(rows, key=lambda u: str(u.get("identifier", "")))


def upsert_verified_user(
    identifier: str,
    display_name: str,
    role: str,
    access_until: datetime,
    campaign_year: Optional[int] = None,
    campaign_id: Optional[str] = None,
) -> None:
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    if scope_campaign_id:
        scope_year = resolve_campaign_year_by_id(scope_campaign_id, campaign_year)
    else:
        scope_year = get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id) or {}
    payload = {
        "identifier": identifier,
        "display_name": display_name,
        "role": role,
        "access_until": access_until.isoformat(),
        "assigned_venue_id": existing.get("assigned_venue_id"),
        "is_voted": bool(existing.get("is_voted", False)),
        "campaign_year": scope_year,
        "campaign_id": scope_campaign_id,
    }

    if db.enabled:
        db.upsert_verified_user(
            identifier,
            display_name,
            role,
            access_until,
            campaign_year=scope_year,
            campaign_id=scope_campaign_id,
        )
        if payload["assigned_venue_id"]:
            db.set_verified_user_venue(
                identifier,
                payload["assigned_venue_id"],
                campaign_year=scope_year,
                campaign_id=scope_campaign_id,
            )
        if payload["is_voted"]:
            db.set_verified_user_voted(identifier, True, campaign_year=scope_year, campaign_id=scope_campaign_id)
        return

    verified_users[verified_user_store_key(identifier, scope_year, campaign_id=scope_campaign_id)] = payload


def update_verified_user_role(
    identifier: str,
    role: str,
    campaign_year: Optional[int] = None,
    campaign_id: Optional[str] = None,
) -> None:
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, campaign_year) if scope_campaign_id else get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="此帳號尚未完成驗證")

    if db.enabled:
        db.update_verified_user_role(identifier, role, campaign_year=scope_year, campaign_id=scope_campaign_id)
        return

    existing["role"] = role
    existing["campaign_year"] = scope_year
    existing["campaign_id"] = scope_campaign_id
    verified_users[verified_user_store_key(identifier, scope_year, campaign_id=scope_campaign_id)] = existing


def set_verified_user_venue(
    identifier: str,
    venue_id: str,
    campaign_year: Optional[int] = None,
    campaign_id: Optional[str] = None,
) -> None:
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, campaign_year) if scope_campaign_id else get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="此帳號尚未完成驗證")

    if db.enabled:
        db.set_verified_user_venue(identifier, venue_id, campaign_year=scope_year, campaign_id=scope_campaign_id)
        return

    existing["assigned_venue_id"] = venue_id
    existing["campaign_year"] = scope_year
    existing["campaign_id"] = scope_campaign_id
    verified_users[verified_user_store_key(identifier, scope_year, campaign_id=scope_campaign_id)] = existing


def set_verified_user_voted(
    identifier: str,
    voted: bool,
    campaign_year: Optional[int] = None,
    campaign_id: Optional[str] = None,
) -> None:
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, campaign_year) if scope_campaign_id else get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="此帳號尚未完成驗證")

    if db.enabled:
        db.set_verified_user_voted(identifier, voted, campaign_year=scope_year, campaign_id=scope_campaign_id)
        return

    existing["is_voted"] = voted
    existing["campaign_year"] = scope_year
    existing["campaign_id"] = scope_campaign_id
    verified_users[verified_user_store_key(identifier, scope_year, campaign_id=scope_campaign_id)] = existing


def create_session(user: SessionUser) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = now_utc() + timedelta(hours=TOKEN_TTL_HOURS)
    auth_sessions[token] = {
        "user": user.model_dump(),
        "expires_at": expires_at,
    }
    return token


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> SessionUser:
    if credentials is None:
        raise HTTPException(status_code=401, detail="缺少 Authorization token")

    token = credentials.credentials
    session = auth_sessions.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="登入已失效，請重新登入")

    if now_utc() > session["expires_at"]:
        auth_sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="登入已過期，請重新登入")

    return SessionUser(**session["user"])


def require_roles(*roles: str):
    def dependency(user: SessionUser = Depends(get_current_user)) -> SessionUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="權限不足")
        return user

    return dependency


def validate_venue_exists(venue_id: str) -> None:
    if venue_id not in {venue["id"] for venue in venues}:
        raise HTTPException(status_code=400, detail="會場不存在")


def normalize_project_names(names: List[str]) -> List[str]:
    normalized: List[str] = []
    for raw in names:
        name = " ".join(str(raw).strip().split())
        if not name:
            continue
        normalized.append(name)

    if not normalized:
        raise HTTPException(status_code=400, detail="至少需要 1 個專題組")
    if len(normalized) > 20:
        raise HTTPException(status_code=400, detail="單一會場最多可設定 20 個專題組")

    seen = set()
    deduped: List[str] = []
    for name in normalized:
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(name)

    if not deduped:
        raise HTTPException(status_code=400, detail="專題組名稱不可全部重複")

    return deduped


def build_name_identifier(display_name: str) -> str:
    # Use display name as the account identity for judge-only quick login.
    return f"name::{display_name.lower()}"


def remove_sessions_for_identifier(identifier: str) -> None:
    tokens = [token for token, session in auth_sessions.items() if session["user"].get("identifier") == identifier]
    for token in tokens:
        auth_sessions.pop(token, None)


def is_system_active() -> bool:
    return bool(current_campaign and current_campaign.get("status") == "active")


def ensure_system_active() -> None:
    if not is_system_active():
        raise HTTPException(status_code=400, detail="本年度模擬投資評分系統尚未啟動或已關閉")


def reset_investment_round_state() -> None:
    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    for venue_id in list(venue_projects.keys()):
        venue_projects[venue_id] = clone_default_projects()
        venue_judge_investments[venue_id] = {}

    for account in list_verified_users(campaign_year=scope_year, campaign_id=scope_campaign_id):
        if normalize_role(account.get("role", "judge")) == "judge":
            identifier = str(account.get("identifier", ""))
            if not identifier:
                continue
            set_verified_user_voted(identifier, False, campaign_year=scope_year, campaign_id=scope_campaign_id)
            set_verified_user_venue(identifier, "", campaign_year=scope_year, campaign_id=scope_campaign_id)

    if is_system_active():
        persist_campaign_state(scope_year)


def build_campaign_summary() -> dict:
    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    venue_summaries = []
    overall_project_rows: List[dict] = []

    for venue in venues:
        venue_id = str(venue["id"])
        venue_name = str(venue.get("name", venue_id))
        projects_data = get_projects_data(venue_id)
        ranked_projects = sorted(
            [
                {
                    "project_id": str(item.get("id", "")),
                    "project_name": str(item.get("name", "未命名專題")),
                    "total_investment": float(item.get("total_investment", 0)),
                }
                for item in projects_data
            ],
            key=lambda item: item["total_investment"],
            reverse=True,
        )
        for idx, project in enumerate(ranked_projects, start=1):
            project["rank"] = idx
            overall_project_rows.append(
                {
                    "venue_id": venue_id,
                    "venue_name": venue_name,
                    "project_id": project["project_id"],
                    "project_name": project["project_name"],
                    "total_investment": project["total_investment"],
                }
            )

        total_investment = sum(float(item.get("total_investment", 0)) for item in projects_data)
        judge_count = len(
            [
                user
                for user in list_verified_users(campaign_year=scope_year, campaign_id=scope_campaign_id)
                if normalize_role(user.get("role", "judge")) == "judge"
                and user.get("assigned_venue_id") == venue_id
            ]
        )
        locked_count = len(
            [
                user
                for user in list_verified_users(campaign_year=scope_year, campaign_id=scope_campaign_id)
                if normalize_role(user.get("role", "judge")) == "judge"
                and user.get("assigned_venue_id") == venue_id
                and bool(user.get("is_voted", False))
            ]
        )
        venue_summaries.append(
            {
                "venue_id": venue_id,
                "venue_name": venue_name,
                "total_investment": total_investment,
                "judge_count": judge_count,
                "locked_count": locked_count,
                "projects": ranked_projects,
            }
        )

    overall_project_rows.sort(key=lambda item: item["total_investment"], reverse=True)
    for idx, row in enumerate(overall_project_rows, start=1):
        row["rank"] = idx

    return {
        "venues": venue_summaries,
        "overall_total_investment": sum(item["total_investment"] for item in venue_summaries),
        "overall_project_ranking": overall_project_rows,
    }


def normalize_campaign_summary(summary: Optional[dict]) -> Optional[dict]:
    if not isinstance(summary, dict):
        return summary

    normalized = dict(summary)
    venues_data = normalized.get("venues")
    if not isinstance(venues_data, list):
        return normalized

    normalized_venues: List[dict] = []
    derived_overall_rows: List[dict] = []

    for venue in venues_data:
        if not isinstance(venue, dict):
            continue

        venue_copy = dict(venue)
        venue_id = str(venue_copy.get("venue_id", ""))
        venue_name = str(venue_copy.get("venue_name", venue_id or "未命名會場"))
        raw_projects = venue_copy.get("projects") if isinstance(venue_copy.get("projects"), list) else []
        ranked_projects = sorted(
            [
                {
                    "project_id": str(project.get("project_id", "")),
                    "project_name": str(project.get("project_name", "未命名專題")),
                    "total_investment": float(project.get("total_investment", 0)),
                }
                for project in raw_projects
                if isinstance(project, dict)
            ],
            key=lambda item: item["total_investment"],
            reverse=True,
        )

        for idx, project in enumerate(ranked_projects, start=1):
            project["rank"] = idx
            derived_overall_rows.append(
                {
                    "venue_id": venue_id,
                    "venue_name": venue_name,
                    "project_id": project["project_id"],
                    "project_name": project["project_name"],
                    "total_investment": project["total_investment"],
                }
            )

        venue_copy["venue_id"] = venue_id
        venue_copy["venue_name"] = venue_name
        venue_copy["projects"] = ranked_projects
        if venue_copy.get("total_investment") is None:
            venue_copy["total_investment"] = sum(project["total_investment"] for project in ranked_projects)
        normalized_venues.append(venue_copy)

    normalized["venues"] = normalized_venues
    if normalized.get("overall_total_investment") is None:
        normalized["overall_total_investment"] = sum(float(item.get("total_investment", 0)) for item in normalized_venues)

    overall_project_ranking = normalized.get("overall_project_ranking")
    if isinstance(overall_project_ranking, list) and overall_project_ranking:
        normalized_overall = [dict(item) for item in overall_project_ranking if isinstance(item, dict)]
    else:
        normalized_overall = derived_overall_rows

    normalized_overall.sort(key=lambda item: float(item.get("total_investment", 0)), reverse=True)
    for idx, row in enumerate(normalized_overall, start=1):
        row["rank"] = idx
        row["venue_id"] = str(row.get("venue_id", ""))
        row["venue_name"] = str(row.get("venue_name", row["venue_id"] or "未指定"))
        row["project_id"] = str(row.get("project_id", ""))
        row["project_name"] = str(row.get("project_name", "未命名專題"))
        row["total_investment"] = float(row.get("total_investment", 0))

    normalized["overall_project_ranking"] = normalized_overall
    return normalized


def serialize_campaign(record: dict) -> SystemCampaignResponse:
    return SystemCampaignResponse(
        id=str(record.get("id", "")),
        year=int(record.get("year", now_utc().year)),
        label=str(record.get("label", "未命名場次")),
        status="active" if str(record.get("status", "active")) == "active" else "closed",
        started_at=str(record.get("started_at", now_utc().isoformat())),
        closed_at=record.get("closed_at"),
        summary=normalize_campaign_summary(record.get("summary")),
    )


def serialize_recently_deleted_campaign(record: dict) -> RecentlyDeletedCampaignResponse:
    deadline = parse_time(record.get("restore_deadline")) or now_utc()
    remaining_seconds = max(0.0, (deadline - now_utc()).total_seconds())
    days_remaining = int(math.ceil(remaining_seconds / 86400.0)) if remaining_seconds > 0 else 0

    return RecentlyDeletedCampaignResponse(
        id=str(record.get("id", "")),
        year=campaign_record_year(record),
        label=str(record.get("label", "未命名場次")),
        status="closed",
        started_at=str(record.get("started_at", now_utc().isoformat())),
        closed_at=record.get("closed_at"),
        summary=normalize_campaign_summary(record.get("summary")),
        deleted_at=str(record.get("deleted_at", now_utc().isoformat())),
        restore_deadline=str(record.get("restore_deadline", deadline.isoformat())),
        days_remaining=days_remaining,
    )


def campaigns_grouped_by_year() -> Dict[str, List[SystemCampaignResponse]]:
    grouped: Dict[str, List[SystemCampaignResponse]] = {}

    all_records: List[dict] = []
    if db.enabled:
        for state in db.list_campaign_states():
            for record in state.get("campaign_history", []):
                if isinstance(record, dict):
                    all_records.append(dict(record))
    else:
        all_records.extend(campaign_history)

    # Historical archives should only show closed, already archived campaigns.
    all_records = [record for record in all_records if str(record.get("status", "")) == "closed"]

    latest_by_id: Dict[str, dict] = {}
    for record in all_records:
        campaign_id = str(record.get("id", ""))
        if not campaign_id:
            continue

        existing = latest_by_id.get(campaign_id)
        if not existing:
            latest_by_id[campaign_id] = record
            continue

        existing_closed = str(existing.get("closed_at", ""))
        record_closed = str(record.get("closed_at", ""))
        existing_started = str(existing.get("started_at", ""))
        record_started = str(record.get("started_at", ""))

        if (record_closed, record_started) >= (existing_closed, existing_started):
            latest_by_id[campaign_id] = record

    sorted_records = sorted(
        latest_by_id.values(),
        key=lambda item: str(item.get("started_at", "")),
        reverse=True,
    )

    for record in sorted_records:
        year_key = str(record.get("year", now_utc().year))
        grouped.setdefault(year_key, []).append(serialize_campaign(record))

    return grouped


def recently_deleted_grouped_by_year() -> Dict[str, List[RecentlyDeletedCampaignResponse]]:
    grouped: Dict[str, List[RecentlyDeletedCampaignResponse]] = {}

    if db.enabled:
        for state in db.list_campaign_states():
            raw_year = state.get("year")
            try:
                year = normalize_campaign_year(int(raw_year))
            except (TypeError, ValueError):
                continue

            for record in purge_expired_recently_deleted(year):
                year_key = str(campaign_record_year(record, year))
                grouped.setdefault(year_key, []).append(serialize_recently_deleted_campaign(record))
    else:
        retained: List[dict] = []
        for record in recently_deleted_campaigns:
            normalized = normalize_recently_deleted_record(record, campaign_record_year(record))
            if not normalized:
                continue
            deadline = parse_time(normalized.get("restore_deadline"))
            if not deadline or deadline <= now_utc():
                continue
            retained.append(normalized)
            year_key = str(campaign_record_year(normalized))
            grouped.setdefault(year_key, []).append(serialize_recently_deleted_campaign(normalized))
        recently_deleted_campaigns[:] = retained

    for year_key in grouped:
        grouped[year_key] = sorted(
            grouped[year_key],
            key=lambda item: item.deleted_at,
            reverse=True,
        )

    return grouped


@app.get("/api/projects", response_model=ProjectsListResponse)
def get_projects(venue_id: Optional[str] = Query(default=None)):
    if venue_id:
        validate_venue_exists(venue_id)
    current_projects = get_projects_data(venue_id)
    total_budget = 10000
    current_total = sum(p["total_investment"] for p in current_projects)

    return ProjectsListResponse(
        projects=[ProjectResponse(**p) for p in current_projects],
        total_budget=total_budget,
        remaining_budget=total_budget - current_total,
        venue_id=venue_id,
        venue_name=venue_name_by_id(venue_id) if venue_id else None,
    )


@app.get("/api/venues", response_model=List[VenueResponse])
def get_venues():
    if not is_system_active():
        return []
    return [build_venue_response(venue) for venue in venues]


@app.get("/api/auth/me", response_model=SessionUser)
def auth_me(user: SessionUser = Depends(get_current_user)):
    return user


@app.get("/api/judges/status", response_model=JudgeStatusResponse)
def judge_status(user: SessionUser = Depends(require_roles("judge", "admin"))):
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year, campaign_id=user.campaign_id)
    if not record:
        raise HTTPException(status_code=404, detail="找不到使用者資料")

    return JudgeStatusResponse(
        identifier=user.identifier,
        display_name=str(record.get("display_name", user.display_name)),
        role=normalize_role(record.get("role", user.role)),
        assigned_venue_id=record.get("assigned_venue_id"),
        is_voted=bool(record.get("is_voted", False)),
        campaign_year=record.get("campaign_year"),
        campaign_id=record.get("campaign_id"),
    )


@app.get("/api/judges/my-investment", response_model=MyInvestmentResponse)
def get_my_investment(user: SessionUser = Depends(require_roles("judge"))):
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year, campaign_id=user.campaign_id)
    if not record:
        raise HTTPException(status_code=404, detail="找不到使用者資料")

    venue_id = record.get("assigned_venue_id")
    if not venue_id:
        return MyInvestmentResponse(
            venue_id=None,
            investments={},
            is_voted=bool(record.get("is_voted", False)),
            campaign_year=record.get("campaign_year"),
            campaign_id=record.get("campaign_id"),
        )

    ensure_venue_project_store(venue_id)
    saved = venue_judge_investments.get(venue_id, {}).get(user.identifier, {})
    return MyInvestmentResponse(
        venue_id=venue_id,
        investments={project_id: float(amount) for project_id, amount in saved.items()},
        is_voted=bool(record.get("is_voted", False)),
        campaign_year=record.get("campaign_year"),
        campaign_id=record.get("campaign_id"),
    )


@app.post("/api/auth/login", response_model=AuthResponse)
def login_with_identifier(data: IdentifierRequest):
    identifier, _ = detect_identifier_type(data.identifier)
    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    record = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id, allow_legacy=True)
    if not record:
        raise HTTPException(status_code=404, detail="帳號尚未驗證，請先取得驗證碼")

    access_until = parse_time(record.get("access_until"))
    if not access_until or now_utc() > access_until:
        raise HTTPException(status_code=401, detail="帳號驗證已過期，請重新驗證")

    refreshed_until = now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS)
    normalized_role = normalize_role(record.get("role"))
    upsert_verified_user(
        identifier=identifier,
        display_name=str(record.get("display_name", "未命名使用者")),
        role=normalized_role,
        access_until=refreshed_until,
        campaign_year=scope_year,
        campaign_id=scope_campaign_id,
    )

    current_record = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id) or record
    user = SessionUser(
        user_id=identifier,
        identifier=identifier,
        role=normalized_role,
        display_name=str(current_record.get("display_name", "未命名使用者")),
        venue_id=current_record.get("assigned_venue_id"),
        campaign_year=scope_year,
        campaign_id=scope_campaign_id,
    )
    token = create_session(user)
    return AuthResponse(access_token=token, user=user)


@app.post("/api/judges/login", response_model=AuthResponse)
def login_with_name(data: NameLoginRequest):
    display_name = normalize_display_name(data.display_name)
    identifier = build_name_identifier(display_name)
    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    existing = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id, allow_legacy=True)

    role = normalize_role(existing.get("role") if existing else "judge")
    access_until = now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS)
    upsert_verified_user(identifier, display_name, role, access_until, campaign_year=scope_year, campaign_id=scope_campaign_id)

    record = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id) or {}
    user = SessionUser(
        user_id=identifier,
        identifier=identifier,
        role=normalize_role(record.get("role", role)),
        display_name=str(record.get("display_name", display_name)),
        venue_id=record.get("assigned_venue_id"),
        campaign_year=scope_year,
        campaign_id=scope_campaign_id,
    )
    token = create_session(user)
    return AuthResponse(access_token=token, user=user)


@app.post("/api/auth/request-verification", response_model=VerificationRequestResponse)
def request_verification(data: VerificationRequest):
    identifier, id_type = detect_identifier_type(data.identifier)

    code = f"{secrets.randbelow(1000000):06d}"
    verification_code_store[identifier] = {
        "code": code,
        "expires_at": now_utc() + timedelta(seconds=CODE_TTL_SECONDS),
        "type": id_type,
    }

    channel: Literal["sms", "email"] = "sms" if id_type == "phone" else "email"
    response = VerificationRequestResponse(
        success=True,
        channel=channel,
        message="驗證碼已發送，請在 5 分鐘內輸入",
    )
    if DEV_BYPASS_VERIFICATION:
        response.debug_otp = code
    return response


@app.post("/api/auth/verify", response_model=AuthResponse)
def verify_identifier(data: VerificationConfirmRequest):
    identifier, _ = detect_identifier_type(data.identifier)
    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    code_data = verification_code_store.get(identifier)
    if not code_data:
        raise HTTPException(status_code=400, detail="請先取得驗證碼")

    if now_utc() > code_data["expires_at"]:
        verification_code_store.pop(identifier, None)
        raise HTTPException(status_code=400, detail="驗證碼已過期，請重新取得")

    if data.otp != code_data["code"]:
        raise HTTPException(status_code=400, detail="驗證碼錯誤")

    display_name = data.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="驗證成功後必須填寫使用者姓名")

    verification_code_store.pop(identifier, None)
    existing = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id, allow_legacy=True)
    if existing and existing.get("role") in {"admin", "judge", "guest"}:
        role = normalize_role(existing.get("role"))
    else:
        role = "judge"

    access_until = now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS)
    upsert_verified_user(identifier, display_name, role, access_until, campaign_year=scope_year, campaign_id=scope_campaign_id)

    record = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id) or {}
    user = SessionUser(
        user_id=identifier,
        identifier=identifier,
        role=normalize_role(record.get("role", role)),
        display_name=str(record.get("display_name", display_name)),
        venue_id=record.get("assigned_venue_id"),
        campaign_year=scope_year,
        campaign_id=scope_campaign_id,
    )
    token = create_session(user)
    return AuthResponse(access_token=token, user=user)


@app.post("/api/auth/logout")
def logout(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if credentials:
        auth_sessions.pop(credentials.credentials, None)
    return {"success": True, "message": "已登出"}


@app.post("/api/judges/join-venue")
def join_venue(
    data: JoinVenueRequest,
    user: SessionUser = Depends(require_roles("judge")),
):
    ensure_system_active()
    validate_venue_exists(data.venue_id)
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year, campaign_id=user.campaign_id)
    if not record:
        raise HTTPException(status_code=404, detail="找不到使用者驗證資料")

    assigned = record.get("assigned_venue_id")
    if assigned and assigned != data.venue_id:
        raise HTTPException(status_code=400, detail="一位評審只能加入一個會場")

    if not assigned:
        set_verified_user_venue(user.identifier, data.venue_id, campaign_year=user.campaign_year, campaign_id=user.campaign_id)

    return {"success": True, "message": "加入會場成功", "venue_id": data.venue_id}


@app.post("/api/judges/leave-venue")
def leave_venue(user: SessionUser = Depends(require_roles("judge"))):
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year, campaign_id=user.campaign_id)
    if not record:
        raise HTTPException(status_code=404, detail="找不到使用者驗證資料")
    if bool(record.get("is_voted", False)):
        raise HTTPException(status_code=400, detail="已上傳並鎖定，不能離開會場")

    assigned_venue_id = record.get("assigned_venue_id")
    if assigned_venue_id:
        ensure_venue_project_store(assigned_venue_id)
        previous = venue_judge_investments.get(assigned_venue_id, {}).pop(user.identifier, None)
        if previous:
            target_projects = get_projects_data(assigned_venue_id)
            for project in target_projects:
                project_id = project["id"]
                project["total_investment"] = max(
                    0,
                    float(project.get("total_investment", 0)) - float(previous.get(project_id, 0)),
                )

    if db.enabled:
        db.set_verified_user_venue(user.identifier, "", campaign_year=user.campaign_year, campaign_id=user.campaign_id)
    else:
        record["assigned_venue_id"] = None
        record["is_voted"] = False
        record["campaign_year"] = get_member_scope_year(user.campaign_year)
        verified_users[verified_user_store_key(user.identifier, get_member_scope_year(user.campaign_year))] = record

    set_verified_user_voted(user.identifier, False, campaign_year=user.campaign_year, campaign_id=user.campaign_id)

    if is_system_active():
        persist_campaign_state(get_member_scope_year(user.campaign_year))

    return {"success": True, "message": "已離開會場"}


@app.post("/api/submit_investment", response_model=SubmitInvestmentResponse)
def submit_investment(
    data: InvestmentData,
    user: SessionUser = Depends(require_roles("admin", "judge")),
):
    ensure_system_active()
    total_budget = 10000
    venue_id: Optional[str] = None

    for project_id, amount in data.investments.items():
        if amount < 0:
            raise HTTPException(
                status_code=400,
                detail=f"投資金額不可小於 0。專題 {project_id} 的金額為 {amount}",
            )

    total_investment = sum(data.investments.values())
    if total_investment > total_budget:
        raise HTTPException(
            status_code=400,
            detail=f"投資總額不可超過 {total_budget} 元，目前為 {total_investment} 元",
        )

    if data.lock_submission:
        if total_investment != total_budget:
            raise HTTPException(
                status_code=400,
                detail=f"鎖定上傳時投資總額必須等於 {total_budget} 元，目前為 {total_investment} 元",
            )

    if user.role == "judge":
        record = get_verified_user(user.identifier, campaign_year=user.campaign_year, campaign_id=user.campaign_id)
        if not record:
            raise HTTPException(status_code=404, detail="找不到評審帳號資料")
        venue_id = record.get("assigned_venue_id")
        if not venue_id:
            raise HTTPException(status_code=400, detail="評審尚未加入會場")
        if bool(record.get("is_voted", False)):
            raise HTTPException(status_code=400, detail="已上傳並鎖定，不能再次提交")
    else:
        venue_id = None

    current_projects = get_projects_data(venue_id)

    project_ids = {p["id"] for p in current_projects}
    submitted_ids = set(data.investments.keys())
    if project_ids != submitted_ids:
        raise HTTPException(status_code=400, detail="必須對所有專題進行投資分配")

    if user.role == "judge" and venue_id:
        ensure_venue_project_store(venue_id)
        previous = venue_judge_investments[venue_id].get(user.identifier, {})
        for project in current_projects:
            project_id = project["id"]
            next_amount = float(data.investments[project_id])
            previous_amount = float(previous.get(project_id, 0))
            project["total_investment"] += next_amount - previous_amount
        venue_judge_investments[venue_id][user.identifier] = {
            project_id: float(amount)
            for project_id, amount in data.investments.items()
        }
    else:
        for project in current_projects:
            project["total_investment"] += data.investments[project["id"]]

    if user.role == "judge" and data.lock_submission:
        set_verified_user_voted(user.identifier, True, campaign_year=user.campaign_year, campaign_id=user.campaign_id)

    if is_system_active():
        persist_campaign_state(get_member_scope_year(user.campaign_year))

    updated_projects = get_projects_data(venue_id)
    return SubmitInvestmentResponse(
        success=True,
        message="投資已上傳並鎖定。" if data.lock_submission else "投資暫存成功，可繼續調整。",
        updated_projects=[ProjectResponse(**p) for p in updated_projects],
    )


@app.get("/api/judges")
def get_judges():
    judge_users = [
        user
        for user in list_verified_users(campaign_year=get_member_scope_year(), campaign_id=get_member_scope_campaign_id())
        if user.get("role") == "judge"
    ]
    response = []
    for user in judge_users:
        response.append(
            JudgeResponse(
                id=str(user.get("identifier", "")),
                name=str(user.get("display_name", "")),
                is_voted=bool(user.get("is_voted", False)),
                assigned_venue_id=user.get("assigned_venue_id"),
            ).model_dump()
        )
    return {"judges": response}


@app.get("/api/admin/system-state", response_model=AdminSystemStateResponse)
def get_admin_system_state(user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    return AdminSystemStateResponse(
        current_campaign=serialize_campaign(current_campaign) if current_campaign else None,
        campaigns_by_year=campaigns_grouped_by_year(),
        recently_deleted_by_year=recently_deleted_grouped_by_year(),
    )


@app.delete("/api/admin/system/archives/{campaign_id}")
def delete_archived_campaign(
    campaign_id: str,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    target_year = normalize_campaign_year(year)

    history = campaign_history_for_year(target_year)
    target = next((item for item in history if str(item.get("id", "")) == campaign_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="找不到指定封存紀錄")
    if str(target.get("status", "")) != "closed":
        raise HTTPException(status_code=400, detail="僅能刪除已封存場次")

    next_history = [item for item in history if str(item.get("id", "")) != campaign_id]
    deleted_at = now_utc()
    deleted_record = dict(target)
    deleted_record["deleted_at"] = deleted_at.isoformat()
    deleted_record["restore_deadline"] = (deleted_at + timedelta(days=ARCHIVE_RETENTION_DAYS)).isoformat()

    next_deleted = [item for item in purge_expired_recently_deleted(target_year) if str(item.get("id", "")) != campaign_id]
    next_deleted.append(deleted_record)

    # Delete associated members when deleting archived campaign
    if db.enabled:
        db.delete_verified_users_by_year(target_year)
    else:
        # Clear members from memory for the given year
        # Keys format: "{campaign_year}::{identifier}" or "campaign::{campaign_id}::{identifier}"
        verified_users_to_remove = [
            key for key in list(verified_users.keys())
            if key.startswith(f"{target_year}::")
        ]
        for key in verified_users_to_remove:
            verified_users.pop(key, None)

    if db.enabled:
        persist_campaign_state(target_year, history_override=next_history, deleted_override=next_deleted)
    else:
        campaign_history[:] = [item for item in campaign_history if campaign_record_year(item, target_year) != target_year] + [
            dict(item) for item in next_history
        ]
        recently_deleted_campaigns[:] = [
            item
            for item in recently_deleted_campaigns
            if campaign_record_year(item, target_year) != target_year
        ] + [dict(item) for item in next_deleted]

    return {
        "success": True,
        "message": "封存紀錄已移至最近刪除（30 天內可還原）",
        "restore_deadline": deleted_record["restore_deadline"],
    }


@app.post("/api/admin/system/archives/{campaign_id}/restore", response_model=SystemCampaignResponse)
def restore_archived_campaign(
    campaign_id: str,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    target_year = normalize_campaign_year(year)

    deleted = purge_expired_recently_deleted(target_year)
    target = next((item for item in deleted if str(item.get("id", "")) == campaign_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="找不到可還原的刪除紀錄，或已超過 30 天")

    restored = dict(target)
    restored.pop("deleted_at", None)
    restored.pop("restore_deadline", None)
    restored["status"] = "closed"

    history = campaign_history_for_year(target_year)
    history = [item for item in history if str(item.get("id", "")) != campaign_id]
    history.append(restored)

    remaining_deleted = [item for item in deleted if str(item.get("id", "")) != campaign_id]

    if db.enabled:
        persist_campaign_state(target_year, history_override=history, deleted_override=remaining_deleted)
    else:
        campaign_history[:] = [item for item in campaign_history if campaign_record_year(item, target_year) != target_year] + [
            dict(item) for item in history
        ]
        recently_deleted_campaigns[:] = [
            item
            for item in recently_deleted_campaigns
            if not (
                campaign_record_year(item, target_year) == target_year
                and str(item.get("id", "")) == campaign_id
            )
        ] + [dict(item) for item in remaining_deleted]

    return serialize_campaign(restored)


@app.delete("/api/admin/system/recently-deleted/{campaign_id}")
@app.delete("/api/admin/system/archives/{campaign_id}/permanent-delete")
def permanent_delete_recently_deleted_campaign(
    campaign_id: str,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    target_year = normalize_campaign_year(year)

    deleted = purge_expired_recently_deleted(target_year)
    target = next((item for item in deleted if str(item.get("id", "")) == campaign_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="找不到可刪除的紀錄")

    remaining_deleted = [item for item in deleted if str(item.get("id", "")) != campaign_id]

    # Delete associated members when permanently deleting campaign
    if db.enabled:
        db.delete_verified_users_by_year(target_year)
        persist_campaign_state(target_year, history_override=campaign_history_for_year(target_year), deleted_override=remaining_deleted)
    else:
        # Clear members from memory for the given year
        verified_users_to_remove = [
            key for key in list(verified_users.keys())
            if key.startswith(f"{target_year}::")
        ]
        for key in verified_users_to_remove:
            verified_users.pop(key, None)
        
        recently_deleted_campaigns[:] = [
            item
            for item in recently_deleted_campaigns
            if not (
                campaign_record_year(item, target_year) == target_year
                and str(item.get("id", "")) == campaign_id
            )
        ]

    return {"success": True, "message": "紀錄已永久刪除"}


@app.post("/api/admin/system/start", response_model=SystemCampaignResponse)
def start_system_campaign(
    data: SystemStartRequest,
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    global current_campaign

    if is_system_active():
        raise HTTPException(status_code=400, detail="目前已有啟動中的專題發表場次，請先關閉")

    campaign_year = normalize_campaign_year(now_utc().year)

    default_label = f"{campaign_year} 專題模擬投資評分"
    label = (data.label or default_label).strip()
    if not label:
        label = default_label

    campaign_id = f"campaign-{campaign_year}-{secrets.token_hex(3)}"
    started_at = now_utc().isoformat()
    current_campaign = {
        "id": campaign_id,
        "year": campaign_year,
        "label": label,
        "status": "active",
        "started_at": started_at,
        "closed_at": None,
        "summary": None,
    }

    reset_investment_round_state()
    persist_campaign_state(campaign_year)
    return serialize_campaign(current_campaign)


@app.post("/api/admin/system/close", response_model=SystemCampaignResponse)
def close_system_campaign(user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    global current_campaign

    if not current_campaign or current_campaign.get("status") != "active":
        raise HTTPException(status_code=400, detail="目前沒有啟動中的場次可關閉")

    closing_year = campaign_record_year(current_campaign)

    closed = dict(current_campaign)
    closed["status"] = "closed"
    closed["closed_at"] = now_utc().isoformat()
    closed["summary"] = normalize_campaign_summary(build_campaign_summary())
    campaign_history.append(closed)

    # Venue data is runtime-only per campaign. Clear it after archive/close.
    venues.clear()
    venue_projects.clear()
    venue_judge_investments.clear()

    current_campaign = None
    prev_history = campaign_history_for_year(closing_year)
    full_history = [h for h in prev_history if str(h.get("id", "")) != str(closed["id"])] + [closed]
    persist_campaign_state(closing_year, history_override=full_history)

    return serialize_campaign(closed)


@app.get("/api/admin/overview", response_model=AdminOverviewResponse)
def get_admin_overview(user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    return AdminOverviewResponse(
        active_sessions=len(auth_sessions),
        verified_users=list_verified_users(campaign_year=get_member_scope_year(), campaign_id=get_member_scope_campaign_id()),
        venues=[build_venue_response(venue) for venue in venues],
    )


@app.post("/api/admin/venues", response_model=VenueResponse)
def create_venue(data: VenueCreateRequest, user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    ensure_system_active()
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="會場名稱不可為空")
    classroom = (data.classroom or "").strip() or name

    venue_id = slugify(name)
    existing_ids = {venue["id"] for venue in venues}
    base = venue_id
    counter = 2
    while venue_id in existing_ids:
        venue_id = f"{base}-{counter}"
        counter += 1

    venue = {"id": venue_id, "name": name, "classroom": classroom}
    venues.append(venue)
    ensure_venue_project_store(venue_id)
    persist_campaign_state(get_member_scope_year())
    return build_venue_response(venue)


@app.put("/api/admin/venues/{venue_id}", response_model=VenueResponse)
def update_venue(
    venue_id: str,
    data: VenueUpdateRequest,
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    ensure_system_active()
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="會場名稱不可為空")

    for venue in venues:
        if venue["id"] == venue_id:
            venue["name"] = name
            if data.classroom is not None:
                classroom = data.classroom.strip()
                if not classroom:
                    raise HTTPException(status_code=400, detail="教室名稱不可為空")
                venue["classroom"] = classroom
            venue.setdefault("classroom", "待公布教室")
            persist_campaign_state(get_member_scope_year())
            return build_venue_response(venue)

    raise HTTPException(status_code=404, detail="找不到指定會場")


@app.patch("/api/admin/venues/{venue_id}/projects", response_model=VenueResponse)
def update_venue_projects(
    venue_id: str,
    data: VenueProjectsUpdateRequest,
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    ensure_system_active()
    validate_venue_exists(venue_id)

    project_names = normalize_project_names(data.project_names)
    venue_projects[venue_id] = [
        {
            "id": f"proj_{index + 1:03d}",
            "name": name,
            "total_investment": 0,
        }
        for index, name in enumerate(project_names)
    ]
    venue_judge_investments[venue_id] = {}

    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    for account in list_verified_users(campaign_year=scope_year, campaign_id=scope_campaign_id):
        if normalize_role(account.get("role", "judge")) != "judge":
            continue
        if account.get("assigned_venue_id") != venue_id:
            continue
        identifier = str(account.get("identifier", ""))
        if identifier:
            set_verified_user_voted(identifier, False, campaign_year=scope_year, campaign_id=scope_campaign_id)

    venue = next((item for item in venues if item["id"] == venue_id), None)
    if not venue:
        raise HTTPException(status_code=404, detail="找不到指定會場")
    persist_campaign_state(get_member_scope_year())
    return build_venue_response(venue)


@app.delete("/api/admin/venues/{venue_id}")
def delete_venue(venue_id: str, user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    ensure_system_active()

    scope_year = get_member_scope_year()
    scope_campaign_id = get_member_scope_campaign_id()
    assigned_users = [
        u
        for u in list_verified_users(campaign_year=scope_year, campaign_id=scope_campaign_id)
        if normalize_role(u.get("role", "judge")) == "judge" and u.get("assigned_venue_id") == venue_id
    ]

    next_venues = [venue for venue in venues if venue["id"] != venue_id]
    if len(next_venues) == len(venues):
        raise HTTPException(status_code=404, detail="找不到指定會場")

    for account in assigned_users:
        identifier = str(account.get("identifier", ""))
        if not identifier:
            continue
        set_verified_user_venue(identifier, "", campaign_year=scope_year, campaign_id=scope_campaign_id)
        set_verified_user_voted(identifier, False, campaign_year=scope_year, campaign_id=scope_campaign_id)

    venues[:] = next_venues
    venue_projects.pop(venue_id, None)
    venue_judge_investments.pop(venue_id, None)
    persist_campaign_state(scope_year)
    return {"success": True, "message": "會場已刪除"}


@app.get("/api/admin/members")
def list_members(
    year: Optional[int] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, year) if scope_campaign_id else get_member_scope_year(year)
    members = []
    for account in list_verified_users(campaign_year=scope_year, campaign_id=scope_campaign_id):
        if str(account.get("identifier", "")).startswith("name::") and normalize_role(account.get("role", "judge")) == "judge":
            members.append(
                {
                    "identifier": account.get("identifier"),
                    "display_name": account.get("display_name"),
                    "role": normalize_role(account.get("role", "judge")),
                    "assigned_venue_id": account.get("assigned_venue_id"),
                    "is_voted": bool(account.get("is_voted", False)),
                    "campaign_year": scope_year,
                    "campaign_id": scope_campaign_id,
                }
            )
    return {"members": members, "year": scope_year, "campaign_id": scope_campaign_id}


@app.post("/api/admin/members")
def create_member(
    data: MemberCreateRequest,
    year: Optional[int] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, year) if scope_campaign_id else get_member_scope_year(year)
    display_name = normalize_display_name(data.display_name)
    identifier = build_name_identifier(display_name)
    if get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id):
        raise HTTPException(status_code=400, detail="此姓名成員已存在")

    access_until = now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS)
    upsert_verified_user(identifier, display_name, data.role, access_until, campaign_year=scope_year, campaign_id=scope_campaign_id)
    return {
        "success": True,
        "member": {
            "identifier": identifier,
            "display_name": display_name,
            "role": data.role,
            "assigned_venue_id": None,
            "is_voted": False,
            "campaign_year": scope_year,
            "campaign_id": scope_campaign_id,
        },
    }


@app.patch("/api/admin/members/{identifier}")
def update_member(
    identifier: str,
    data: MemberUpdateRequest,
    year: Optional[int] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, year) if scope_campaign_id else get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    next_display_name = normalize_display_name(data.display_name) if data.display_name is not None else str(account.get("display_name", ""))
    next_role = data.role or normalize_role(account.get("role", "judge"))
    access_until = parse_time(account.get("access_until")) or (now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS))
    upsert_verified_user(identifier, next_display_name, next_role, access_until, campaign_year=scope_year, campaign_id=scope_campaign_id)
    return {"success": True, "message": "成員資料已更新"}


@app.post("/api/admin/members/{identifier}/unlock")
def unlock_member(
    identifier: str,
    year: Optional[int] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, year) if scope_campaign_id else get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    set_verified_user_voted(identifier, False, campaign_year=scope_year, campaign_id=scope_campaign_id)
    return {"success": True, "message": "已解除鎖定，可再次上傳"}


@app.patch("/api/admin/members/{identifier}/status")
def update_member_status(
    identifier: str,
    data: MemberStatusUpdateRequest,
    year: Optional[int] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, year) if scope_campaign_id else get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    if normalize_role(account.get("role", "judge")) != "judge":
        raise HTTPException(status_code=400, detail="僅能調整評審狀態")

    if data.assigned_venue_id is not None:
        venue_id = data.assigned_venue_id.strip()
        if venue_id:
            validate_venue_exists(venue_id)
            set_verified_user_venue(identifier, venue_id, campaign_year=scope_year, campaign_id=scope_campaign_id)
        else:
            set_verified_user_venue(identifier, "", campaign_year=scope_year, campaign_id=scope_campaign_id)

    if data.is_voted is not None:
        set_verified_user_voted(identifier, data.is_voted, campaign_year=scope_year, campaign_id=scope_campaign_id)

    updated = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id) or {}
    return {
        "success": True,
        "member": {
            "identifier": updated.get("identifier", identifier),
            "display_name": updated.get("display_name", ""),
            "role": normalize_role(updated.get("role", "judge")),
            "assigned_venue_id": updated.get("assigned_venue_id"),
            "is_voted": bool(updated.get("is_voted", False)),
            "campaign_year": scope_year,
            "campaign_id": scope_campaign_id,
        },
    }


@app.delete("/api/admin/members/{identifier}")
def delete_member(
    identifier: str,
    year: Optional[int] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, year) if scope_campaign_id else get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    if db.enabled:
        doc_id = db._identity_doc_id(identifier, campaign_year=scope_year, campaign_id=scope_campaign_id)
        db._client.collection("verified_users").document(doc_id).delete()
    else:
        verified_users.pop(verified_user_store_key(identifier, scope_year, campaign_id=scope_campaign_id), None)

    remove_sessions_for_identifier(identifier)
    return {"success": True, "message": "成員已刪除"}


@app.post("/api/admin/authorize-user")
def authorize_user(
    data: AuthorizeJudgeRequest,
    year: Optional[int] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    identifier = data.identifier.strip().lower()
    scope_campaign_id = get_member_scope_campaign_id(campaign_id)
    scope_year = resolve_campaign_year_by_id(scope_campaign_id, year) if scope_campaign_id else get_member_scope_year(year)
    update_verified_user_role(identifier, data.role, campaign_year=scope_year, campaign_id=scope_campaign_id)
    return {
        "success": True,
        "message": f"帳號 {identifier} 已授權為 {data.role}",
    }


@app.post("/api/admin/reset-round", response_model=AdminRoundResetResponse)
def reset_round(user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    reset_investment_round_state()

    return AdminRoundResetResponse(success=True, message="回合已重置，投資與評審投票狀態已清空")


@app.get("/")
def root():
    return {
        "message": "FundThePitch - 專題模擬投資評分系統",
        "version": "1.1.0",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
