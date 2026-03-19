import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Literal, Optional, Tuple

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from firestore_db import FirestoreDB


def initialize_startup_state() -> None:
    db.seed_if_empty(DEFAULT_PROJECTS, DEFAULT_JUDGES)
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
current_campaign: Optional[dict] = None

DEV_BYPASS_VERIFICATION = os.getenv("DEV_BYPASS_VERIFICATION", "true").lower() == "true"
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "48"))
CODE_TTL_SECONDS = int(os.getenv("CODE_TTL_SECONDS", "300"))
VERIFIED_ACCESS_DAYS = int(os.getenv("VERIFIED_ACCESS_DAYS", "2"))

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


class MyInvestmentResponse(BaseModel):
    venue_id: Optional[str] = None
    investments: Dict[str, float]
    is_voted: bool
    campaign_year: Optional[int] = None


class SystemStartRequest(BaseModel):
    year: Optional[int] = None
    label: Optional[str] = None


class SystemCampaignResponse(BaseModel):
    id: str
    year: int
    label: str
    status: Literal["active", "closed"]
    started_at: str
    closed_at: Optional[str] = None
    summary: Optional[dict] = None


class AdminSystemStateResponse(BaseModel):
    current_campaign: Optional[SystemCampaignResponse] = None
    campaigns_by_year: Dict[str, List[SystemCampaignResponse]]


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
    assigned_judges = [
        str(user.get("display_name", "未命名評審"))
        for user in list_verified_users(campaign_year=scope_year)
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


def get_projects_data(venue_id: Optional[str] = None) -> List[dict]:
    if venue_id:
        ensure_venue_project_store(venue_id)
        return venue_projects[venue_id]

    aggregate = clone_default_projects()
    for venue_data in venue_projects.values():
        for idx, project in enumerate(venue_data):
            aggregate[idx]["total_investment"] += float(project.get("total_investment", 0))
    return aggregate


def verified_user_store_key(identifier: str, campaign_year: int) -> str:
    return f"{campaign_year}::{identifier}"


def get_verified_user(identifier: str, campaign_year: Optional[int] = None, allow_legacy: bool = False) -> Optional[dict]:
    if db.enabled:
        return db.get_verified_user(identifier, campaign_year=campaign_year, allow_legacy=allow_legacy)

    if campaign_year is not None:
        scoped = verified_users.get(verified_user_store_key(identifier, campaign_year))
        if scoped:
            return scoped
    if allow_legacy:
        return verified_users.get(identifier)
    return None


def list_verified_users(campaign_year: Optional[int] = None) -> List[dict]:
    if db.enabled:
        return db.list_verified_users(campaign_year=campaign_year)

    rows = list(verified_users.values())
    if campaign_year is not None:
        rows = [row for row in rows if row.get("campaign_year") == campaign_year]
    return sorted(rows, key=lambda u: str(u.get("identifier", "")))


def upsert_verified_user(
    identifier: str,
    display_name: str,
    role: str,
    access_until: datetime,
    campaign_year: Optional[int] = None,
) -> None:
    scope_year = get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year) or {}
    payload = {
        "identifier": identifier,
        "display_name": display_name,
        "role": role,
        "access_until": access_until.isoformat(),
        "assigned_venue_id": existing.get("assigned_venue_id"),
        "is_voted": bool(existing.get("is_voted", False)),
        "campaign_year": scope_year,
    }

    if db.enabled:
        db.upsert_verified_user(identifier, display_name, role, access_until, campaign_year=scope_year)
        if payload["assigned_venue_id"]:
            db.set_verified_user_venue(identifier, payload["assigned_venue_id"], campaign_year=scope_year)
        if payload["is_voted"]:
            db.set_verified_user_voted(identifier, True, campaign_year=scope_year)
        return

    verified_users[verified_user_store_key(identifier, scope_year)] = payload


def update_verified_user_role(identifier: str, role: str, campaign_year: Optional[int] = None) -> None:
    scope_year = get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year)
    if not existing:
        raise HTTPException(status_code=404, detail="此帳號尚未完成驗證")

    if db.enabled:
        db.update_verified_user_role(identifier, role, campaign_year=scope_year)
        return

    existing["role"] = role
    existing["campaign_year"] = scope_year
    verified_users[verified_user_store_key(identifier, scope_year)] = existing


def set_verified_user_venue(identifier: str, venue_id: str, campaign_year: Optional[int] = None) -> None:
    scope_year = get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year)
    if not existing:
        raise HTTPException(status_code=404, detail="此帳號尚未完成驗證")

    if db.enabled:
        db.set_verified_user_venue(identifier, venue_id, campaign_year=scope_year)
        return

    existing["assigned_venue_id"] = venue_id
    existing["campaign_year"] = scope_year
    verified_users[verified_user_store_key(identifier, scope_year)] = existing


def set_verified_user_voted(identifier: str, voted: bool, campaign_year: Optional[int] = None) -> None:
    scope_year = get_member_scope_year(campaign_year)
    existing = get_verified_user(identifier, campaign_year=scope_year)
    if not existing:
        raise HTTPException(status_code=404, detail="此帳號尚未完成驗證")

    if db.enabled:
        db.set_verified_user_voted(identifier, voted, campaign_year=scope_year)
        return

    existing["is_voted"] = voted
    existing["campaign_year"] = scope_year
    verified_users[verified_user_store_key(identifier, scope_year)] = existing


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
    for venue_id in list(venue_projects.keys()):
        venue_projects[venue_id] = clone_default_projects()
        venue_judge_investments[venue_id] = {}

    for account in list_verified_users(campaign_year=scope_year):
        if normalize_role(account.get("role", "judge")) == "judge":
            identifier = str(account.get("identifier", ""))
            if not identifier:
                continue
            set_verified_user_voted(identifier, False, campaign_year=scope_year)
            set_verified_user_venue(identifier, "", campaign_year=scope_year)


def build_campaign_summary() -> dict:
    scope_year = get_member_scope_year()
    venue_summaries = []
    for venue in venues:
        venue_id = str(venue["id"])
        projects_data = get_projects_data(venue_id)
        total_investment = sum(float(item.get("total_investment", 0)) for item in projects_data)
        judge_count = len(
            [
                user
                for user in list_verified_users(campaign_year=scope_year)
                if normalize_role(user.get("role", "judge")) == "judge"
                and user.get("assigned_venue_id") == venue_id
            ]
        )
        locked_count = len(
            [
                user
                for user in list_verified_users(campaign_year=scope_year)
                if normalize_role(user.get("role", "judge")) == "judge"
                and user.get("assigned_venue_id") == venue_id
                and bool(user.get("is_voted", False))
            ]
        )
        venue_summaries.append(
            {
                "venue_id": venue_id,
                "venue_name": str(venue.get("name", venue_id)),
                "total_investment": total_investment,
                "judge_count": judge_count,
                "locked_count": locked_count,
            }
        )

    return {
        "venues": venue_summaries,
        "overall_total_investment": sum(item["total_investment"] for item in venue_summaries),
    }


def serialize_campaign(record: dict) -> SystemCampaignResponse:
    return SystemCampaignResponse(
        id=str(record.get("id", "")),
        year=int(record.get("year", now_utc().year)),
        label=str(record.get("label", "未命名場次")),
        status="active" if str(record.get("status", "active")) == "active" else "closed",
        started_at=str(record.get("started_at", now_utc().isoformat())),
        closed_at=record.get("closed_at"),
        summary=record.get("summary"),
    )


def campaigns_grouped_by_year() -> Dict[str, List[SystemCampaignResponse]]:
    grouped: Dict[str, List[SystemCampaignResponse]] = {}

    all_records: List[dict] = []
    all_records.extend(campaign_history)
    if current_campaign:
        all_records.append(current_campaign)

    sorted_records = sorted(
        all_records,
        key=lambda item: str(item.get("started_at", "")),
        reverse=True,
    )

    for record in sorted_records:
        year_key = str(record.get("year", now_utc().year))
        grouped.setdefault(year_key, []).append(serialize_campaign(record))

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
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year)
    if not record:
        raise HTTPException(status_code=404, detail="找不到使用者資料")

    return JudgeStatusResponse(
        identifier=user.identifier,
        display_name=str(record.get("display_name", user.display_name)),
        role=normalize_role(record.get("role", user.role)),
        assigned_venue_id=record.get("assigned_venue_id"),
        is_voted=bool(record.get("is_voted", False)),
        campaign_year=record.get("campaign_year"),
    )


@app.get("/api/judges/my-investment", response_model=MyInvestmentResponse)
def get_my_investment(user: SessionUser = Depends(require_roles("judge"))):
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year)
    if not record:
        raise HTTPException(status_code=404, detail="找不到使用者資料")

    venue_id = record.get("assigned_venue_id")
    if not venue_id:
        return MyInvestmentResponse(
            venue_id=None,
            investments={},
            is_voted=bool(record.get("is_voted", False)),
            campaign_year=record.get("campaign_year"),
        )

    ensure_venue_project_store(venue_id)
    saved = venue_judge_investments.get(venue_id, {}).get(user.identifier, {})
    return MyInvestmentResponse(
        venue_id=venue_id,
        investments={project_id: float(amount) for project_id, amount in saved.items()},
        is_voted=bool(record.get("is_voted", False)),
        campaign_year=record.get("campaign_year"),
    )


@app.post("/api/auth/login", response_model=AuthResponse)
def login_with_identifier(data: IdentifierRequest):
    identifier, _ = detect_identifier_type(data.identifier)
    scope_year = get_member_scope_year()
    record = get_verified_user(identifier, campaign_year=scope_year, allow_legacy=True)
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
    )

    current_record = get_verified_user(identifier, campaign_year=scope_year) or record
    user = SessionUser(
        user_id=identifier,
        identifier=identifier,
        role=normalized_role,
        display_name=str(current_record.get("display_name", "未命名使用者")),
        venue_id=current_record.get("assigned_venue_id"),
        campaign_year=scope_year,
    )
    token = create_session(user)
    return AuthResponse(access_token=token, user=user)


@app.post("/api/judges/login", response_model=AuthResponse)
def login_with_name(data: NameLoginRequest):
    display_name = normalize_display_name(data.display_name)
    identifier = build_name_identifier(display_name)
    scope_year = get_member_scope_year()
    existing = get_verified_user(identifier, campaign_year=scope_year, allow_legacy=True)

    role = normalize_role(existing.get("role") if existing else "judge")
    access_until = now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS)
    upsert_verified_user(identifier, display_name, role, access_until, campaign_year=scope_year)

    record = get_verified_user(identifier, campaign_year=scope_year) or {}
    user = SessionUser(
        user_id=identifier,
        identifier=identifier,
        role=normalize_role(record.get("role", role)),
        display_name=str(record.get("display_name", display_name)),
        venue_id=record.get("assigned_venue_id"),
        campaign_year=scope_year,
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
    existing = get_verified_user(identifier, campaign_year=scope_year, allow_legacy=True)
    if existing and existing.get("role") in {"admin", "judge", "guest"}:
        role = normalize_role(existing.get("role"))
    else:
        role = "judge"

    access_until = now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS)
    upsert_verified_user(identifier, display_name, role, access_until, campaign_year=scope_year)

    record = get_verified_user(identifier, campaign_year=scope_year) or {}
    user = SessionUser(
        user_id=identifier,
        identifier=identifier,
        role=normalize_role(record.get("role", role)),
        display_name=str(record.get("display_name", display_name)),
        venue_id=record.get("assigned_venue_id"),
        campaign_year=scope_year,
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
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year)
    if not record:
        raise HTTPException(status_code=404, detail="找不到使用者驗證資料")

    assigned = record.get("assigned_venue_id")
    if assigned and assigned != data.venue_id:
        raise HTTPException(status_code=400, detail="一位評審只能加入一個會場")

    if not assigned:
        set_verified_user_venue(user.identifier, data.venue_id, campaign_year=user.campaign_year)

    return {"success": True, "message": "加入會場成功", "venue_id": data.venue_id}


@app.post("/api/judges/leave-venue")
def leave_venue(user: SessionUser = Depends(require_roles("judge"))):
    record = get_verified_user(user.identifier, campaign_year=user.campaign_year)
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
        db.set_verified_user_venue(user.identifier, "", campaign_year=user.campaign_year)
    else:
        record["assigned_venue_id"] = None
        record["is_voted"] = False
        record["campaign_year"] = get_member_scope_year(user.campaign_year)
        verified_users[verified_user_store_key(user.identifier, get_member_scope_year(user.campaign_year))] = record

    set_verified_user_voted(user.identifier, False, campaign_year=user.campaign_year)

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
        if amount <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"每個專題的投資金額必須大於 0。專題 {project_id} 的金額為 {amount}",
            )

    total_investment = sum(data.investments.values())
    if total_investment != total_budget:
        raise HTTPException(
            status_code=400,
            detail=f"投資總額必須等於 {total_budget} 元，目前為 {total_investment} 元",
        )

    if user.role == "judge":
        record = get_verified_user(user.identifier, campaign_year=user.campaign_year)
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

    if user.role == "judge":
        set_verified_user_voted(user.identifier, True, campaign_year=user.campaign_year)

    updated_projects = get_projects_data(venue_id)
    return SubmitInvestmentResponse(
        success=True,
        message="投資分配成功！",
        updated_projects=[ProjectResponse(**p) for p in updated_projects],
    )


@app.get("/api/judges")
def get_judges():
    judge_users = [user for user in list_verified_users(campaign_year=get_member_scope_year()) if user.get("role") == "judge"]
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
    )


@app.post("/api/admin/system/start", response_model=SystemCampaignResponse)
def start_system_campaign(
    data: SystemStartRequest,
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    global current_campaign

    if is_system_active():
        raise HTTPException(status_code=400, detail="目前已有啟動中的專題發表場次，請先關閉")

    campaign_year = normalize_campaign_year(data.year)

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
    return serialize_campaign(current_campaign)


@app.post("/api/admin/system/close", response_model=SystemCampaignResponse)
def close_system_campaign(user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    global current_campaign

    if not current_campaign or current_campaign.get("status") != "active":
        raise HTTPException(status_code=400, detail="目前沒有啟動中的場次可關閉")

    closed = dict(current_campaign)
    closed["status"] = "closed"
    closed["closed_at"] = now_utc().isoformat()
    closed["summary"] = build_campaign_summary()
    campaign_history.append(closed)

    # Venue data is runtime-only per campaign. Clear it after archive/close.
    venues.clear()
    venue_projects.clear()
    venue_judge_investments.clear()

    current_campaign = None

    return serialize_campaign(closed)


@app.get("/api/admin/overview", response_model=AdminOverviewResponse)
def get_admin_overview(user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    return AdminOverviewResponse(
        active_sessions=len(auth_sessions),
        verified_users=list_verified_users(campaign_year=get_member_scope_year()),
        venues=[build_venue_response(venue) for venue in venues],
    )


@app.post("/api/admin/venues", response_model=VenueResponse)
def create_venue(data: VenueCreateRequest, user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    ensure_system_active()
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="會場名稱不可為空")
    classroom = (data.classroom or "").strip() or "待公布教室"

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
            return build_venue_response(venue)

    raise HTTPException(status_code=404, detail="找不到指定會場")


@app.delete("/api/admin/venues/{venue_id}")
def delete_venue(venue_id: str, user: SessionUser = Depends(require_roles("admin"))):
    _ = user
    ensure_system_active()
    if len(venues) <= 1:
        raise HTTPException(status_code=400, detail="至少需保留一個會場")

    assigned_users = [
        u
        for u in list_verified_users(campaign_year=get_member_scope_year())
        if u.get("role") == "judge" and u.get("assigned_venue_id") == venue_id
    ]
    if assigned_users:
        raise HTTPException(status_code=400, detail="仍有評審在此會場，無法刪除")

    next_venues = [venue for venue in venues if venue["id"] != venue_id]
    if len(next_venues) == len(venues):
        raise HTTPException(status_code=404, detail="找不到指定會場")

    venues[:] = next_venues
    venue_projects.pop(venue_id, None)
    return {"success": True, "message": "會場已刪除"}


@app.get("/api/admin/members")
def list_members(
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_year = get_member_scope_year(year)
    members = []
    for account in list_verified_users(campaign_year=scope_year):
        if str(account.get("identifier", "")).startswith("name::") and normalize_role(account.get("role", "judge")) == "judge":
            members.append(
                {
                    "identifier": account.get("identifier"),
                    "display_name": account.get("display_name"),
                    "role": normalize_role(account.get("role", "judge")),
                    "assigned_venue_id": account.get("assigned_venue_id"),
                    "is_voted": bool(account.get("is_voted", False)),
                    "campaign_year": scope_year,
                }
            )
    return {"members": members, "year": scope_year}


@app.post("/api/admin/members")
def create_member(
    data: MemberCreateRequest,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_year = get_member_scope_year(year)
    display_name = normalize_display_name(data.display_name)
    identifier = build_name_identifier(display_name)
    if get_verified_user(identifier, campaign_year=scope_year):
        raise HTTPException(status_code=400, detail="此姓名成員已存在")

    access_until = now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS)
    upsert_verified_user(identifier, display_name, data.role, access_until, campaign_year=scope_year)
    return {
        "success": True,
        "member": {
            "identifier": identifier,
            "display_name": display_name,
            "role": data.role,
            "assigned_venue_id": None,
            "is_voted": False,
            "campaign_year": scope_year,
        },
    }


@app.patch("/api/admin/members/{identifier}")
def update_member(
    identifier: str,
    data: MemberUpdateRequest,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_year = get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    next_display_name = normalize_display_name(data.display_name) if data.display_name is not None else str(account.get("display_name", ""))
    next_role = data.role or normalize_role(account.get("role", "judge"))
    access_until = parse_time(account.get("access_until")) or (now_utc() + timedelta(days=VERIFIED_ACCESS_DAYS))
    upsert_verified_user(identifier, next_display_name, next_role, access_until, campaign_year=scope_year)
    return {"success": True, "message": "成員資料已更新"}


@app.post("/api/admin/members/{identifier}/unlock")
def unlock_member(
    identifier: str,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_year = get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    set_verified_user_voted(identifier, False, campaign_year=scope_year)
    return {"success": True, "message": "已解除鎖定，可再次上傳"}


@app.patch("/api/admin/members/{identifier}/status")
def update_member_status(
    identifier: str,
    data: MemberStatusUpdateRequest,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_year = get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    if normalize_role(account.get("role", "judge")) != "judge":
        raise HTTPException(status_code=400, detail="僅能調整評審狀態")

    if data.assigned_venue_id is not None:
        venue_id = data.assigned_venue_id.strip()
        if venue_id:
            validate_venue_exists(venue_id)
            set_verified_user_venue(identifier, venue_id, campaign_year=scope_year)
        else:
            set_verified_user_venue(identifier, "", campaign_year=scope_year)

    if data.is_voted is not None:
        set_verified_user_voted(identifier, data.is_voted, campaign_year=scope_year)

    updated = get_verified_user(identifier, campaign_year=scope_year) or {}
    return {
        "success": True,
        "member": {
            "identifier": updated.get("identifier", identifier),
            "display_name": updated.get("display_name", ""),
            "role": normalize_role(updated.get("role", "judge")),
            "assigned_venue_id": updated.get("assigned_venue_id"),
            "is_voted": bool(updated.get("is_voted", False)),
            "campaign_year": scope_year,
        },
    }


@app.delete("/api/admin/members/{identifier}")
def delete_member(
    identifier: str,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    scope_year = get_member_scope_year(year)
    account = get_verified_user(identifier, campaign_year=scope_year)
    if not account:
        raise HTTPException(status_code=404, detail="找不到成員")

    if db.enabled:
        doc_id = db._identity_doc_id(identifier, scope_year)
        db._client.collection("verified_users").document(doc_id).delete()
    else:
        verified_users.pop(verified_user_store_key(identifier, scope_year), None)

    remove_sessions_for_identifier(identifier)
    return {"success": True, "message": "成員已刪除"}


@app.post("/api/admin/authorize-user")
def authorize_user(
    data: AuthorizeJudgeRequest,
    year: Optional[int] = Query(default=None),
    user: SessionUser = Depends(require_roles("admin")),
):
    _ = user
    identifier = data.identifier.strip().lower()
    update_verified_user_role(identifier, data.role, campaign_year=get_member_scope_year(year))
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
