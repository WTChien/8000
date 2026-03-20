import os
import importlib
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DEFAULT_CREDENTIALS_PATH = os.path.join(
    os.path.dirname(__file__),
    "keys",
    "fundthepitch-firebase-adminsdk-fbsvc-81129424c7.json",
)


class FirestoreDB:
    def __init__(self) -> None:
        self.enabled = os.getenv("USE_FIRESTORE", "true").lower() == "true"
        self._client = None
        self._firestore = None

        if not self.enabled:
            return

        credentials_path = os.getenv("FIREBASE_CREDENTIALS_PATH", DEFAULT_CREDENTIALS_PATH)
        if not credentials_path:
            self.enabled = False
            return

        try:
            firebase_admin = importlib.import_module("firebase_admin")
            credentials = importlib.import_module("firebase_admin.credentials")
            firestore = importlib.import_module("firebase_admin.firestore")

            if not firebase_admin._apps:
                cred = credentials.Certificate(credentials_path)
                firebase_admin.initialize_app(cred)
            self._client = firestore.client()
            self._firestore = firestore
        except Exception as exc:
            # Fallback to mock mode if Firestore bootstrap fails.
            print(f"[Firestore] initialization failed, fallback to mock mode: {exc}")
            self.enabled = False
            self._client = None
            self._firestore = None

    def seed_if_empty(
        self,
        default_projects: List[Dict[str, object]],
        default_judges: List[Dict[str, object]],
    ) -> None:
        if not self.enabled or self._client is None:
            return

        projects_ref = self._client.collection("projects")
        judges_ref = self._client.collection("judges")

        if not any(projects_ref.limit(1).stream()):
            batch = self._client.batch()
            for project in default_projects:
                doc_ref = projects_ref.document(str(project["id"]))
                batch.set(doc_ref, project)
            batch.commit()

        if not any(judges_ref.limit(1).stream()):
            batch = self._client.batch()
            for judge in default_judges:
                doc_ref = judges_ref.document(str(judge["id"]))
                batch.set(doc_ref, judge)
            batch.commit()

    def get_projects(self) -> List[Dict[str, object]]:
        if not self.enabled or self._client is None:
            return []

        docs = self._client.collection("projects").stream()
        projects = [doc.to_dict() for doc in docs]
        return sorted(projects, key=lambda p: str(p.get("id", "")))

    def get_judges(self) -> List[Dict[str, object]]:
        if not self.enabled or self._client is None:
            return []

        docs = self._client.collection("judges").stream()
        judges = []
        for doc in docs:
            row = doc.to_dict()
            row.setdefault("assigned_venue_id", None)
            row.setdefault("is_voted", False)
            judges.append(row)
        return sorted(judges, key=lambda j: str(j.get("id", "")))

    def apply_investments(self, investments: Dict[str, float], judge_id: Optional[str]) -> None:
        if not self.enabled or self._client is None or self._firestore is None:
            return

        batch = self._client.batch()

        for project_id, amount in investments.items():
            project_ref = self._client.collection("projects").document(project_id)
            batch.update(project_ref, {"total_investment": self._firestore.Increment(amount)})

        if judge_id:
            judge_ref = self._client.collection("judges").document(judge_id)
            batch.update(judge_ref, {"is_voted": True})

        batch.commit()

    def assign_judge_venue(self, judge_id: str, venue_id: str) -> None:
        if not self.enabled or self._client is None:
            return

        judge_ref = self._client.collection("judges").document(judge_id)
        judge_ref.set({"assigned_venue_id": venue_id}, merge=True)

    def reset_round(self) -> None:
        if not self.enabled or self._client is None:
            return

        batch = self._client.batch()

        project_docs = self._client.collection("projects").stream()
        for project_doc in project_docs:
            batch.update(project_doc.reference, {"total_investment": 0})

        judge_docs = self._client.collection("judges").stream()
        for judge_doc in judge_docs:
            batch.update(judge_doc.reference, {"is_voted": False})

        verified_docs = self._client.collection("verified_users").stream()
        for verified_doc in verified_docs:
            data = verified_doc.to_dict() or {}
            if data.get("role") == "judge":
                batch.set(verified_doc.reference, {"is_voted": False}, merge=True)

        batch.commit()

    def _identity_doc_id(
        self,
        identifier: str,
        campaign_year: Optional[int] = None,
        campaign_id: Optional[str] = None,
    ) -> str:
        normalized = identifier.replace("@", "_at_").replace(".", "_dot_")
        if campaign_id is not None:
            normalized_campaign = re.sub(r"[^a-zA-Z0-9_-]", "_", str(campaign_id))
            return f"campaign_{normalized_campaign}__{normalized}"
        if campaign_year is None:
            return normalized
        return f"{campaign_year}__{normalized}"

    def get_verified_user(
        self,
        identifier: str,
        campaign_year: Optional[int] = None,
        campaign_id: Optional[str] = None,
        allow_legacy: bool = False,
    ) -> Optional[Dict[str, object]]:
        if not self.enabled or self._client is None:
            return None

        candidate_ids = []
        if campaign_id is not None:
            candidate_ids.append(self._identity_doc_id(identifier, campaign_year=campaign_year, campaign_id=campaign_id))
        if campaign_year is not None:
            candidate_ids.append(self._identity_doc_id(identifier, campaign_year))
        if allow_legacy or campaign_year is None:
            legacy_doc_id = self._identity_doc_id(identifier)
            if legacy_doc_id not in candidate_ids:
                candidate_ids.append(legacy_doc_id)

        for doc_id in candidate_ids:
            doc = self._client.collection("verified_users").document(doc_id).get()
            if not doc.exists:
                continue

            data = doc.to_dict() or {}
            data.setdefault("identifier", identifier)
            data.setdefault("role", "judge")
            data.setdefault("is_voted", False)
            data.setdefault("assigned_venue_id", None)
            data.setdefault("campaign_id", campaign_id)
            data.setdefault("campaign_year", campaign_year if doc_id != self._identity_doc_id(identifier) else None)
            return data

        return None

    def upsert_verified_user(
        self,
        identifier: str,
        display_name: str,
        role: str,
        access_until: datetime,
        campaign_year: Optional[int] = None,
        campaign_id: Optional[str] = None,
    ) -> None:
        if not self.enabled or self._client is None:
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        payload = {
            "identifier": identifier,
            "display_name": display_name,
            "role": role,
            "access_until": access_until.isoformat(),
            "updated_at": now_iso,
            "is_voted": False,
            "campaign_year": campaign_year,
            "campaign_id": campaign_id,
        }
        self._client.collection("verified_users").document(
            self._identity_doc_id(identifier, campaign_year=campaign_year, campaign_id=campaign_id)
        ).set(payload, merge=True)

    def update_verified_user_role(
        self,
        identifier: str,
        role: str,
        campaign_year: Optional[int] = None,
        campaign_id: Optional[str] = None,
    ) -> None:
        if not self.enabled or self._client is None:
            return

        self._client.collection("verified_users").document(
            self._identity_doc_id(identifier, campaign_year=campaign_year, campaign_id=campaign_id)
        ).set(
            {
                "role": role,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "campaign_year": campaign_year,
                "campaign_id": campaign_id,
            },
            merge=True,
        )

    def set_verified_user_venue(
        self,
        identifier: str,
        venue_id: str,
        campaign_year: Optional[int] = None,
        campaign_id: Optional[str] = None,
    ) -> None:
        if not self.enabled or self._client is None:
            return

        self._client.collection("verified_users").document(
            self._identity_doc_id(identifier, campaign_year=campaign_year, campaign_id=campaign_id)
        ).set(
            {
                "assigned_venue_id": venue_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "campaign_year": campaign_year,
                "campaign_id": campaign_id,
            },
            merge=True,
        )

    def set_verified_user_voted(
        self,
        identifier: str,
        is_voted: bool,
        campaign_year: Optional[int] = None,
        campaign_id: Optional[str] = None,
    ) -> None:
        if not self.enabled or self._client is None:
            return

        self._client.collection("verified_users").document(
            self._identity_doc_id(identifier, campaign_year=campaign_year, campaign_id=campaign_id)
        ).set(
            {
                "is_voted": is_voted,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "campaign_year": campaign_year,
                "campaign_id": campaign_id,
            },
            merge=True,
        )

    def list_verified_users(self, campaign_year: Optional[int] = None, campaign_id: Optional[str] = None) -> List[Dict[str, object]]:
        if not self.enabled or self._client is None:
            return []

        docs = self._client.collection("verified_users").stream()
        users = []
        for doc in docs:
            row = doc.to_dict() or {}
            if campaign_id is not None:
                if row.get("campaign_id") != campaign_id:
                    continue
            elif campaign_year is not None and row.get("campaign_year") != campaign_year:
                continue
            row.setdefault("identifier", "")
            row.setdefault("display_name", "")
            row.setdefault("role", "judge")
            row.setdefault("is_voted", False)
            row.setdefault("assigned_venue_id", None)
            row.setdefault("campaign_id", campaign_id)
            row.setdefault("campaign_year", campaign_year)
            users.append(row)
        return sorted(users, key=lambda u: str(u.get("identifier", "")))

    def _campaign_state_doc_id(self, campaign_year: int) -> str:
        return f"year_{campaign_year}"

    def get_campaign_state(self, campaign_year: int) -> Dict[str, Any]:
        if not self.enabled or self._client is None:
            return {}

        doc = self._client.collection("campaign_states").document(self._campaign_state_doc_id(campaign_year)).get()
        if not doc.exists:
            return {}

        data = doc.to_dict() or {}
        data.setdefault("year", campaign_year)
        data.setdefault("current_campaign", None)
        data.setdefault("campaign_history", [])
        data.setdefault("venues", [])
        data.setdefault("venue_projects", {})
        data.setdefault("venue_judge_investments", {})
        data.setdefault("recently_deleted_campaigns", [])
        return data

    def save_campaign_state(self, campaign_year: int, state: Dict[str, Any]) -> None:
        if not self.enabled or self._client is None:
            return

        payload = {
            "year": campaign_year,
            "current_campaign": state.get("current_campaign"),
            "campaign_history": state.get("campaign_history", []),
            "venues": state.get("venues", []),
            "venue_projects": state.get("venue_projects", {}),
            "venue_judge_investments": state.get("venue_judge_investments", {}),
            "recently_deleted_campaigns": state.get("recently_deleted_campaigns", []),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._client.collection("campaign_states").document(self._campaign_state_doc_id(campaign_year)).set(payload, merge=True)

    def list_campaign_states(self) -> List[Dict[str, Any]]:
        if not self.enabled or self._client is None:
            return []

        docs = self._client.collection("campaign_states").stream()
        states: List[Dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict() or {}
            if "year" not in data:
                continue
            data.setdefault("current_campaign", None)
            data.setdefault("campaign_history", [])
            data.setdefault("venues", [])
            data.setdefault("venue_projects", {})
            data.setdefault("venue_judge_investments", {})
            data.setdefault("recently_deleted_campaigns", [])
            states.append(data)
        return sorted(states, key=lambda item: int(item.get("year", 0)), reverse=True)

    def get_active_campaign_state(self) -> Optional[Dict[str, Any]]:
        if not self.enabled or self._client is None:
            return None

        for state in self.list_campaign_states():
            current = state.get("current_campaign")
            if isinstance(current, dict) and str(current.get("status", "")) == "active":
                return {
                    "year": int(state.get("year", 0)),
                    "state": state,
                }
        return None
