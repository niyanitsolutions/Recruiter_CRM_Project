"""
Discount Service — CRUD and code validation for promo codes.
"""
from datetime import datetime, timezone
from typing import Optional, Tuple
import uuid
import logging

from app.models.master.discount import DiscountCreate, DiscountUpdate, DiscountStatus

logger = logging.getLogger(__name__)


class DiscountService:

    @staticmethod
    async def create_discount(master_db, data: DiscountCreate, created_by: str) -> dict:
        code = data.code.strip().upper()
        existing = await master_db.discounts.find_one(
            {"code": code, "is_deleted": False}
        )
        if existing:
            raise ValueError(f"Discount code '{code}' already exists")

        now = datetime.now(timezone.utc)
        discount = {
            "_id": str(uuid.uuid4()),
            "name": data.name,
            "code": code,
            "type": data.type,
            "value": data.value,
            "applicable_plans": data.applicable_plans or [],
            "usage_limit": data.usage_limit,
            "used_count": 0,
            "valid_from": data.valid_from,
            "valid_until": data.valid_until,
            "status": DiscountStatus.ACTIVE,
            "created_at": now,
            "updated_at": now,
            "created_by": created_by,
            "is_deleted": False,
        }
        await master_db.discounts.insert_one(discount)
        discount["id"] = discount.pop("_id")
        return discount

    @staticmethod
    async def list_discounts(
        master_db,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Tuple[list, int]:
        query: dict = {"is_deleted": False}
        if status:
            query["status"] = status
        if search:
            query["$or"] = [
                {"name": {"$regex": re.escape(search), "$options": "i"}},
                {"code": {"$regex": re.escape(search), "$options": "i"}},
            ]

        total = await master_db.discounts.count_documents(query)
        skip = (page - 1) * limit
        cursor = master_db.discounts.find(query).sort("created_at", -1).skip(skip).limit(limit)
        discounts = await cursor.to_list(length=limit)
        for d in discounts:
            d["id"] = d.pop("_id", d.get("id", ""))
        return discounts, total

    @staticmethod
    async def get_discount(master_db, discount_id: str) -> Optional[dict]:
        d = await master_db.discounts.find_one({"_id": discount_id, "is_deleted": False})
        if not d:
            return None
        d["id"] = d.pop("_id")
        return d

    @staticmethod
    async def update_discount(
        master_db, discount_id: str, data: DiscountUpdate, updated_by: str
    ) -> Tuple[bool, str, Optional[dict]]:
        existing = await master_db.discounts.find_one({"_id": discount_id, "is_deleted": False})
        if not existing:
            return False, "Discount not found", None

        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        for field, value in data.model_dump(exclude_none=True).items():
            if field == "code":
                value = value.strip().upper()
                # Check uniqueness if code is changing
                if value != existing.get("code"):
                    clash = await master_db.discounts.find_one(
                        {"code": value, "is_deleted": False, "_id": {"$ne": discount_id}}
                    )
                    if clash:
                        return False, f"Code '{value}' already in use", None
            updates[field] = value

        await master_db.discounts.update_one({"_id": discount_id}, {"$set": updates})
        updated = await DiscountService.get_discount(master_db, discount_id)
        return True, "Discount updated successfully", updated

    @staticmethod
    async def delete_discount(
        master_db, discount_id: str, deleted_by: str
    ) -> Tuple[bool, str]:
        existing = await master_db.discounts.find_one({"_id": discount_id, "is_deleted": False})
        if not existing:
            return False, "Discount not found"
        now = datetime.now(timezone.utc)
        await master_db.discounts.update_one(
            {"_id": discount_id},
            {"$set": {"is_deleted": True, "updated_at": now, "status": "inactive"}},
        )
        return True, "Discount deleted successfully"

    @staticmethod
    async def validate_code(
        master_db, code: str, plan_id: Optional[str] = None, plan_price: Optional[float] = None
    ) -> dict:
        """
        Validate a discount code and return the discount details + final price.
        Returns: { valid, discount, final_price, savings, message }
        """
        now = datetime.now(timezone.utc)
        code = code.strip().upper()

        d = await master_db.discounts.find_one({
            "code": code,
            "is_deleted": False,
            "status": DiscountStatus.ACTIVE,
        })
        if not d:
            return {"valid": False, "message": "Invalid discount code"}
        if d["valid_from"] > now:
            return {"valid": False, "message": "Discount code is not yet active"}
        if d["valid_until"] < now:
            return {"valid": False, "message": "Discount code has expired"}
        if d.get("usage_limit") is not None and d.get("used_count", 0) >= d["usage_limit"]:
            return {"valid": False, "message": "Discount code has reached its usage limit"}

        # Check plan applicability
        if plan_id and d.get("applicable_plans"):
            if plan_id not in d["applicable_plans"]:
                return {"valid": False, "message": "Discount code is not applicable to this plan"}

        result = {"valid": True, "message": "Discount applied", "discount_id": str(d["_id"])}
        result["discount"] = {
            "name": d["name"],
            "code": d["code"],
            "type": d["type"],
            "value": d["value"],
        }

        if plan_price is not None:
            if d["type"] == "percentage":
                savings = round(plan_price * d["value"] / 100, 2)
            else:
                savings = min(d["value"], plan_price)
            result["original_price"] = plan_price
            result["savings"] = savings
            result["final_price"] = max(plan_price - savings, 0)

        return result

    @staticmethod
    async def increment_usage(master_db, discount_id: str):
        """Increment used_count after a successful purchase."""
        await master_db.discounts.update_one(
            {"_id": discount_id},
            {"$inc": {"used_count": 1}},
        )
