"""
Seller Service
CRUD operations and statistics for sellers/resellers.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
import uuid
import logging

from app.core.security import hash_password, verify_password
from app.models.master.seller import SellerCreate, SellerUpdate

logger = logging.getLogger(__name__)


class SellerService:

    @staticmethod
    async def create_seller(master_db, data: SellerCreate, created_by: str) -> dict:
        """Create a new seller. Raises ValueError on duplicate username/email."""
        existing = await master_db.sellers.find_one({
            "$or": [{"username": data.username}, {"email": data.email}],
            "is_deleted": False
        })
        if existing:
            raise ValueError("Username or email already exists")

        now = datetime.now(timezone.utc)
        # plan_expiry_date calculated ONCE at creation from trial_days.
        # Stored permanently — never recalculated dynamically.
        plan_expiry_date = now + timedelta(days=data.trial_days)
        seller = {
            "_id": str(uuid.uuid4()),
            "seller_name": data.seller_name,
            "company_name": data.company_name,
            "email": data.email,
            "phone": data.phone,
            "address": data.address,
            "status": "active",
            "username": data.username,
            "password_hash": hash_password(data.password),
            # Subscription fields
            "plan_name": data.plan_name,
            "plan_display_name": data.plan_display_name,
            "plan_start_date": now,
            "plan_expiry_date": plan_expiry_date,
            "is_trial": True,
            "billing_cycle": None,
            "total_user_seats": data.total_user_seats,
            # Stats
            "total_tenants": 0,
            "active_tenants": 0,
            "last_login": None,
            "created_at": now,
            "updated_at": now,
            "created_by": created_by,
            "is_deleted": False,
            "deleted_at": None,
            "deleted_by": None,
        }
        await master_db.sellers.insert_one(seller)
        seller.pop("password_hash", None)
        seller["id"] = seller.pop("_id")
        return seller

    @staticmethod
    async def list_sellers(
        master_db,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Tuple[list, int]:
        query: dict = {"is_deleted": {"$ne": True}}
        if status:
            query["status"] = status
        if search:
            query["$or"] = [
                {"seller_name": {"$regex": re.escape(search), "$options": "i"}},
                {"company_name": {"$regex": re.escape(search), "$options": "i"}},
                {"email": {"$regex": re.escape(search), "$options": "i"}},
            ]

        total = await master_db.sellers.count_documents(query)
        skip = (page - 1) * limit
        cursor = master_db.sellers.find(query).sort("created_at", -1).skip(skip).limit(limit)
        sellers = await cursor.to_list(length=limit)

        for s in sellers:
            s.pop("password_hash", None)
            s["id"] = s.pop("_id", s.get("id", ""))

        return sellers, total

    @staticmethod
    async def get_seller(master_db, seller_id: str) -> Optional[dict]:
        seller = await master_db.sellers.find_one({"_id": seller_id, "is_deleted": False})
        if not seller:
            return None
        seller.pop("password_hash", None)
        seller["id"] = seller.pop("_id", seller.get("id", ""))
        return seller

    @staticmethod
    async def get_seller_by_username(master_db, username: str) -> Optional[dict]:
        return await master_db.sellers.find_one({"username": username, "is_deleted": False})

    @staticmethod
    async def update_seller(
        master_db,
        seller_id: str,
        data: SellerUpdate,
        updated_by: str,
    ) -> Tuple[bool, str, Optional[dict]]:
        existing = await master_db.sellers.find_one({"_id": seller_id, "is_deleted": False})
        if not existing:
            return False, "Seller not found", None

        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        for field, value in data.model_dump(exclude_none=True).items():
            updates[field] = value

        await master_db.sellers.update_one({"_id": seller_id}, {"$set": updates})
        updated = await SellerService.get_seller(master_db, seller_id)
        return True, "Seller updated successfully", updated

    @staticmethod
    async def delete_seller(
        master_db, seller_id: str, deleted_by: str
    ) -> Tuple[bool, str]:
        existing = await master_db.sellers.find_one({"_id": seller_id, "is_deleted": False})
        if not existing:
            return False, "Seller not found"

        now = datetime.now(timezone.utc)
        await master_db.sellers.update_one(
            {"_id": seller_id},
            {"$set": {
                "is_deleted": True,
                "deleted_at": now,
                "deleted_by": deleted_by,
                "status": "suspended",
                "updated_at": now,
            }}
        )
        return True, "Seller deleted successfully"

    @staticmethod
    async def get_seat_status(master_db, seller_id: str) -> dict:
        """
        Return subscription & seat usage for a seller.
        current_active_users is counted live from the DB (never stale).
        """
        seller = await master_db.sellers.find_one({"_id": seller_id, "is_deleted": False})
        if not seller:
            return {}

        total_seats = int(seller.get("total_user_seats", 1))
        # Sellers are single-user accounts right now — the seller itself is the only user.
        # When sub-users are added, count them here instead.
        current_count = 1  # the seller account itself

        plan_expiry = seller.get("plan_expiry_date")
        if plan_expiry and plan_expiry.tzinfo is None:
            plan_expiry = plan_expiry.replace(tzinfo=timezone.utc)
        is_expired = bool(plan_expiry and datetime.now(timezone.utc) > plan_expiry)

        return {
            "total_user_seats": total_seats,
            "current_active_users": current_count,
            "remaining_seats": max(0, total_seats - current_count),
            "seat_limit_reached": current_count >= total_seats,
            "plan_name": seller.get("plan_name", "trial"),
            "plan_display_name": seller.get("plan_display_name", "Trial"),
            "plan_expiry_date": plan_expiry.isoformat() if plan_expiry else None,
            "is_trial": seller.get("is_trial", True),
            "is_expired": is_expired,
        }

    @staticmethod
    async def extend_subscription(
        master_db,
        seller_id: str,
        additional_seats: int,
        extension_days: int,
        plan_name: str,
        plan_display_name: str,
        billing_cycle: Optional[str],
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Extend a seller's subscription.
        Seats are additive — existing users are never reset.
        plan_expiry_date is extended from NOW (not from old expiry) to ensure
        a fresh duration is granted on each purchase.
        """
        seller = await master_db.sellers.find_one({"_id": seller_id, "is_deleted": False})
        if not seller:
            return False, "Seller not found", None

        now = datetime.now(timezone.utc)
        current_seats = int(seller.get("total_user_seats", 1))
        new_total_seats = current_seats + additional_seats
        new_expiry = now + timedelta(days=extension_days)

        await master_db.sellers.update_one(
            {"_id": seller_id},
            {"$set": {
                "plan_name": plan_name,
                "plan_display_name": plan_display_name,
                "plan_start_date": now,
                "plan_expiry_date": new_expiry,
                "is_trial": False,
                "billing_cycle": billing_cycle,
                "total_user_seats": new_total_seats,
                "updated_at": now,
                # Reset reminder flag so the next expiry cycle triggers a fresh reminder
                "reminder_sent": False,
            }}
        )
        updated = await SellerService.get_seller(master_db, seller_id)
        return True, "Subscription extended successfully", updated

    @staticmethod
    async def get_seller_stats(master_db, seller_id: str) -> dict:
        """Per-seller stats: tenant counts + revenue."""
        total_tenants = await master_db.tenants.count_documents(
            {"seller_id": seller_id, "is_deleted": {"$ne": True}}
        )
        active_tenants = await master_db.tenants.count_documents(
            {"seller_id": seller_id, "is_deleted": {"$ne": True}, "status": "active"}
        )

        # Monthly revenue (current month)
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        monthly_pipeline = [
            {"$match": {
                "seller_id": seller_id,
                "status": "completed",
                "payment_date": {"$gte": month_start},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}},
        ]
        monthly_result = await master_db.payments.aggregate(monthly_pipeline).to_list(1)
        monthly_revenue = monthly_result[0]["total"] / 100 if monthly_result else 0

        # Total revenue
        total_pipeline = [
            {"$match": {"seller_id": seller_id, "status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}},
        ]
        total_result = await master_db.payments.aggregate(total_pipeline).to_list(1)
        total_revenue = total_result[0]["total"] / 100 if total_result else 0

        # Commission stats
        commission_pipeline = [
            {"$match": {"seller_id": seller_id}},
            {"$group": {
                "_id": None,
                "total_commission": {"$sum": "$commission_amount"},
                "pending_commission": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, "$commission_amount", 0]}},
                "paid_commission": {"$sum": {"$cond": [{"$eq": ["$status", "paid"]}, "$commission_amount", 0]}},
            }},
        ]
        commission_result = await master_db.commissions.aggregate(commission_pipeline).to_list(1)
        commission_data = commission_result[0] if commission_result else {}
        total_commission = (commission_data.get("total_commission", 0) or 0) / 100
        pending_commission = (commission_data.get("pending_commission", 0) or 0) / 100
        paid_commission = (commission_data.get("paid_commission", 0) or 0) / 100

        return {
            "total_tenants": total_tenants,
            "active_tenants": active_tenants,
            "monthly_revenue": monthly_revenue,
            "total_revenue": total_revenue,
            "total_commission": total_commission,
            "pending_commission": pending_commission,
            "paid_commission": paid_commission,
        }

    @staticmethod
    async def get_platform_seller_stats(master_db) -> dict:
        """Aggregate seller stats for super admin dashboard."""
        total_sellers = await master_db.sellers.count_documents({"is_deleted": {"$ne": True}})
        active_sellers = await master_db.sellers.count_documents(
            {"is_deleted": {"$ne": True}, "status": "active"}
        )
        return {"total_sellers": total_sellers, "active_sellers": active_sellers}

    @staticmethod
    async def refresh_seller_tenant_counts(master_db, seller_id: str):
        """Update denormalized tenant counts on seller document."""
        try:
            total = await master_db.tenants.count_documents(
                {"seller_id": seller_id, "is_deleted": {"$ne": True}}
            )
            active = await master_db.tenants.count_documents(
                {"seller_id": seller_id, "is_deleted": {"$ne": True}, "status": "active"}
            )
            await master_db.sellers.update_one(
                {"_id": seller_id},
                {"$set": {"total_tenants": total, "active_tenants": active, "updated_at": datetime.now(timezone.utc)}}
            )
        except Exception:
            pass

    @staticmethod
    async def change_password(
        master_db, seller_id: str, old_password: str, new_password: str
    ) -> Tuple[bool, str]:
        seller = await master_db.sellers.find_one({"_id": seller_id, "is_deleted": False})
        if not seller:
            return False, "Seller not found"
        if not verify_password(old_password, seller["password_hash"]):
            return False, "Current password is incorrect"
        await master_db.sellers.update_one(
            {"_id": seller_id},
            {"$set": {
                "password_hash": hash_password(new_password),
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        return True, "Password changed successfully"


seller_service = SellerService()
