"""HRM — Leave Policy Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.hrm_leave_policy import DEFAULT_LEAVE_POLICIES, LeavePolicyType


class LeavePolicyService:
    COL = "hrm_leave_policies"
    BAL_COL = "hrm_leave_balances"
    AUDIT_COL = "hrm_audit_logs"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        for f in ("created_at", "updated_at"):
            val = doc.get(f)
            if isinstance(val, datetime):
                doc[f] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        return doc

    async def _audit(self, action: str, entity_id: str, user_id: str,
                     company_id: str, changes: Optional[dict] = None):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.db[self.AUDIT_COL].insert_one({
            "_id": str(ObjectId()),
            "company_id": company_id,
            "module": "leave_policies",
            "action": action,
            "entity_type": "leave_policy",
            "entity_id": entity_id,
            "user_id": user_id,
            "changes": changes or {},
            "timestamp": now,
        })

    # ── Seed defaults ─────────────────────────────────────────────────────────

    async def seed_defaults(self, company_id: str, created_by: str = "system") -> int:
        """Insert default leave policies if none exist for this company."""
        existing_count = await self.col.count_documents({
            "company_id": company_id, "is_deleted": False,
        })
        if existing_count > 0:
            return 0
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        docs = []
        for p in DEFAULT_LEAVE_POLICIES:
            docs.append({
                "_id": str(ObjectId()),
                "company_id": company_id,
                "created_by": created_by,
                "updated_by": None,
                "created_at": now,
                "updated_at": now,
                "is_active": True,
                "is_deleted": False,
                **p,
            })
        if docs:
            await self.col.insert_many(docs)
        return len(docs)

    # ── CRUD ─────────────────────────────────────────────────────────────────

    async def create(self, data: dict, company_id: str, created_by: str) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Duplicate code check
        dup = await self.col.find_one({
            "company_id": company_id,
            "code": data["code"].upper().strip(),
            "is_deleted": False,
        })
        if dup:
            raise ValueError(f"A leave policy with code '{data['code']}' already exists")
        doc_id = str(ObjectId())
        doc = {
            "_id": doc_id,
            "company_id": company_id,
            "leave_type": data.get("leave_type", LeavePolicyType.CUSTOM),
            "name": data["name"],
            "code": data["code"].upper().strip(),
            "color": data.get("color", "#3b82f6"),
            "annual_allocation": float(data.get("annual_allocation", 12.0)),
            "carry_forward_allowed": bool(data.get("carry_forward_allowed", False)),
            "max_carry_forward": data.get("max_carry_forward"),
            "encashment_allowed": bool(data.get("encashment_allowed", False)),
            "negative_balance_allowed": bool(data.get("negative_balance_allowed", False)),
            "approval_level": data.get("approval_level", "manager"),
            "document_required": bool(data.get("document_required", False)),
            "min_days": float(data.get("min_days", 0.5)),
            "max_days": data.get("max_days"),
            "max_consecutive_days": data.get("max_consecutive_days"),
            "gender_restriction": data.get("gender_restriction"),
            "applicable_departments": data.get("applicable_departments", []),
            "applicable_designations": data.get("applicable_designations", []),
            "probation_restriction": bool(data.get("probation_restriction", False)),
            "notice_period_restriction": bool(data.get("notice_period_restriction", False)),
            "is_active": True,
            "is_system_default": False,
            "created_by": created_by,
            "updated_by": None,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await self.col.insert_one(doc)
        await self._audit("policy_created", doc_id, created_by, company_id,
                          {"name": doc["name"], "code": doc["code"]})
        return self._serialize(doc)

    async def list(self, company_id: str, include_inactive: bool = False) -> List[dict]:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if not include_inactive:
            query["is_active"] = True
        cursor = self.col.find(query).sort("name", 1)
        return [self._serialize(d) async for d in cursor]

    async def get(self, policy_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": policy_id, "company_id": company_id, "is_deleted": False})
        return self._serialize(doc) if doc else None

    async def get_by_type(self, leave_type: str, company_id: str) -> Optional[dict]:
        """Get active policy for a given leave type."""
        doc = await self.col.find_one({
            "company_id": company_id,
            "leave_type": leave_type,
            "is_active": True,
            "is_deleted": False,
        })
        return self._serialize(doc) if doc else None

    async def update(self, policy_id: str, data: dict, company_id: str,
                     updated_by: str) -> Optional[dict]:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        existing = await self.col.find_one({"_id": policy_id, "company_id": company_id, "is_deleted": False})
        if not existing:
            return None
        # Duplicate code check
        if "code" in data and data["code"]:
            code_upper = data["code"].upper().strip()
            dup = await self.col.find_one({
                "company_id": company_id,
                "code": code_upper,
                "is_deleted": False,
                "_id": {"$ne": policy_id},
            })
            if dup:
                raise ValueError(f"A policy with code '{code_upper}' already exists")
            data["code"] = code_upper
        update_set = {k: v for k, v in data.items() if v is not None}
        update_set.update({"updated_by": updated_by, "updated_at": now})
        await self.col.update_one({"_id": policy_id}, {"$set": update_set})
        await self._audit("policy_updated", policy_id, updated_by, company_id, {"changes": data})
        existing.update(update_set)
        return self._serialize(existing)

    async def delete(self, policy_id: str, company_id: str, deleted_by: str) -> bool:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        doc = await self.col.find_one({"_id": policy_id, "company_id": company_id, "is_deleted": False})
        if not doc:
            return False
        if doc.get("is_system_default"):
            raise ValueError("System default policies cannot be deleted. You can deactivate them instead.")
        result = await self.col.update_one(
            {"_id": policy_id},
            {"$set": {"is_deleted": True, "updated_at": now, "updated_by": deleted_by}},
        )
        if result.modified_count:
            await self._audit("policy_deleted", policy_id, deleted_by, company_id)
        return result.modified_count > 0

    # ── Validation helpers (used by leave_service) ───────────────────────────

    async def validate_leave_application(
        self,
        leave_type: str,
        days: float,
        employee_id: str,
        company_id: str,
        gender: Optional[str] = None,
        department: Optional[str] = None,
        on_probation: bool = False,
        on_notice: bool = False,
    ) -> None:
        """Raise ValueError if leave application violates policy rules."""
        policy = await self.get_by_type(leave_type, company_id)
        if not policy:
            return  # No policy configured — allow by default

        if not policy["is_active"]:
            raise ValueError(f"Leave type '{policy['name']}' is not currently active")

        if gender and policy.get("gender_restriction") and policy["gender_restriction"] != gender:
            raise ValueError(f"'{policy['name']}' is restricted to {policy['gender_restriction']} employees")

        if on_probation and policy.get("probation_restriction"):
            raise ValueError(f"'{policy['name']}' cannot be taken during probation period")

        if on_notice and policy.get("notice_period_restriction"):
            raise ValueError(f"'{policy['name']}' cannot be taken during notice period")

        min_days = policy.get("min_days", 0.5)
        if days < min_days:
            raise ValueError(f"Minimum {min_days} day(s) required for '{policy['name']}'")

        max_days = policy.get("max_days")
        if max_days and days > max_days:
            raise ValueError(f"Maximum {max_days} day(s) allowed per application for '{policy['name']}'")

        if department and policy.get("applicable_departments"):
            if department not in policy["applicable_departments"]:
                raise ValueError(f"'{policy['name']}' is not applicable to your department")
