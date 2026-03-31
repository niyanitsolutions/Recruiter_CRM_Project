import re
"""
Tenant Service
Handles company registration and management
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List
import logging
import uuid

from app.core.database import get_master_db, DatabaseManager
from app.core.security import hash_password
from app.models.master.tenant import (
    TenantStatus
)
from app.models.company.user import UserRole, UserStatus, ROLE_PERMISSIONS

logger = logging.getLogger(__name__)


class TenantService:
    """
    Tenant Management Service
    
    Handles:
    - Company registration
    - Tenant CRUD operations
    - Database provisioning
    - Plan assignment
    """
    
    @staticmethod
    async def check_unique_fields(
        company_name: str = None,
        email: str = None,
        mobile: str = None,
        username: str = None
    ) -> Tuple[bool, str]:
        """
        Check if registration fields are unique
        
        Returns:
            Tuple of (is_unique, error_message)
        """
        master_db = get_master_db()
        
        if company_name:
            existing = await master_db.tenants.find_one({
                "company_name": {"$regex": f"^{re.escape(company_name)}$", "$options": "i"},
                "is_deleted": False
            })
            if existing:
                return False, "Company name already registered"
        
        if email:
            # Check in tenants (owner email)
            existing = await master_db.tenants.find_one({
                "owner.email": email,
                "is_deleted": False
            })
            if existing:
                return False, "Email already registered"
            
            # Check in super_admins
            existing = await master_db.super_admins.find_one({
                "email": email,
                "is_deleted": False
            })
            if existing:
                return False, "Email already registered"
        
        if mobile:
            existing = await master_db.tenants.find_one({
                "owner.mobile": mobile,
                "is_deleted": False
            })
            if existing:
                return False, "Mobile number already registered"
        
        if username:
            existing = await master_db.tenants.find_one({
                "owner.username": username.lower(),
                "is_deleted": False
            })
            if existing:
                return False, "Username already taken"
        
        return True, ""
    
    @staticmethod
    async def register_company(
        # Company details
        company_name: str,
        industry: str,
        phone: str,
        # Owner details
        owner_name: str,
        owner_email: str,
        owner_mobile: str,
        owner_username: str,
        owner_password: str,
        # Plan
        plan_id: str,
        billing_cycle: str = "monthly",
        user_count: int = 3,
        # Optional address (subscription flow)
        city: str = "",
        state: str = "",
        zip_code: str = "",
        # Optional fields
        website: str = None,
        gst_number: str = None,
        street: str = "",
        country: str = "India",
        owner_designation: str = "Owner",
        # Trial flow: free-text location + company email
        location: str = None,
        company_email: str = None,
    ) -> Tuple[Optional[dict], str]:
        """
        Register a new company
        
        Steps:
        1. Validate unique fields
        2. Get plan details
        3. Create tenant record
        4. Create company database
        5. Create owner user in company DB
        
        Returns:
            Tuple of (registration_result, error_message)
        """
        master_db = get_master_db()
        
        # 1. Validate unique fields
        is_unique, error = await TenantService.check_unique_fields(
            company_name=company_name,
            email=owner_email,
            mobile=owner_mobile,
            username=owner_username
        )
        if not is_unique:
            return None, error
        
        # 2. Get plan details
        plan = await master_db.plans.find_one({"_id": plan_id})
        if not plan:
            # Try by name
            plan = await master_db.plans.find_one({"name": plan_id})
        
        if not plan:
            return None, "Invalid plan selected"
        
        # Calculate plan expiry — trial uses plan's trial_days (30), paid uses billing cycle
        is_trial = plan.get("is_trial_plan", False)
        if is_trial:
            plan_expiry = datetime.now(timezone.utc) + timedelta(days=plan.get("trial_days", 30))
            effective_user_count = user_count if user_count > 0 else plan.get("max_users", 3)
        else:
            effective_user_count = max(user_count, 1)
            if billing_cycle == "yearly":
                plan_expiry = datetime.now(timezone.utc) + timedelta(days=365)
            else:  # monthly (default)
                plan_expiry = datetime.now(timezone.utc) + timedelta(days=30)

        # 3. Create tenant record
        company_id = str(uuid.uuid4())[:8]
        tenant_id = str(uuid.uuid4())

        tenant_data = {
            "_id": tenant_id,
            "company_id": company_id,
            "company_name": company_name,
            "display_name": company_name,
            "industry": industry,
            "website": website,
            "gst_number": gst_number,
            "phone": phone,
            "email": company_email,
            "location": location,
            "address": {
                "street": street,
                "city": city,
                "state": state,
                "zip_code": zip_code,
                "country": country
            },
            "owner": {
                "_id": str(uuid.uuid4()),
                "full_name": owner_name,
                "email": owner_email,
                "mobile": owner_mobile,
                "username": owner_username.lower(),
                "designation": owner_designation,
                "password_hash": hash_password(owner_password)
            },
            "plan_id": str(plan.get("_id")),
            "plan_name": plan.get("name"),
            "plan_display_name": plan.get("display_name"),
            "billing_cycle": billing_cycle,
            "max_users": effective_user_count,
            "plan_start_date": datetime.now(timezone.utc),
            "plan_expiry": plan_expiry,
            "is_trial": is_trial,
            "has_used_trial": is_trial,   # persists even after upgrade
            # TEMPORARY: Email verification disabled until SMTP is configured.
            # Change back to False and re-enable the email block below to restore.
            "email_verified": True,
            "email_verification_token": None,
            "email_verification_expiry": None,
            "status": TenantStatus.ACTIVE,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "is_deleted": False
        }
        
        await master_db.tenants.insert_one(tenant_data)
        
        # 4. Create company database
        await DatabaseManager.create_company_database(company_id)
        
        # 5. Create owner user in company DB
        company_db = DatabaseManager.get_company_db(company_id)
        
        owner_user = {
            "_id": tenant_data["owner"]["_id"],
            "username": owner_username.lower(),
            "email": owner_email,
            "full_name": owner_name,
            "mobile": owner_mobile,
            "password_hash": tenant_data["owner"]["password_hash"],
            "role": UserRole.ADMIN,
            "permissions": ROLE_PERMISSIONS[UserRole.ADMIN],
            "designation": owner_designation,
            "status": UserStatus.ACTIVE,
            "is_owner": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "is_deleted": False
        }
        
        await company_db.users.insert_one(owner_user)
        
        # Create audit log
        await company_db.audit_logs.insert_one({
            "_id": str(uuid.uuid4()),
            "action": "create",
            "entity_type": "user",
            "entity_id": owner_user["_id"],
            "entity_name": owner_name,
            "user_id": "system",
            "user_name": "System",
            "user_role": "system",
            "description": "Company owner account created",
            "created_at": datetime.now(timezone.utc)
        })
        
        logger.info(f"✅ Company registered: {company_name} (ID: {company_id})")

        # TEMPORARY: Email verification disabled until SMTP is configured.
        # To re-enable: uncomment the block below and set email_verified=False above.
        #
        # import secrets
        # from app.core.config import settings as _settings
        # token = secrets.token_urlsafe(32)
        # expiry = datetime.now(timezone.utc) + timedelta(
        #     hours=_settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS
        # )
        # await master_db.tenants.update_one(
        #     {"_id": tenant_id},
        #     {"$set": {"email_verification_token": token, "email_verification_expiry": expiry}}
        # )
        # try:
        #     from app.services.email_service import EmailService
        #     await EmailService.send_verification_email(
        #         to_email=owner_email,
        #         full_name=owner_name,
        #         token=token,
        #         account_type="tenant",
        #     )
        # except Exception:
        #     pass  # Email failure must not block registration

        # Return result
        requires_payment = not is_trial and plan.get("price_per_user_monthly", plan.get("price_monthly", 0)) > 0

        return {
            "success": True,
            "message": "Company registered successfully",
            "tenant_id": tenant_id,
            "company_id": company_id,
            "company_name": company_name,
            "requires_payment": requires_payment,
            "plan_name": plan.get("name"),
            "plan_display_name": plan.get("display_name"),
            "billing_cycle": billing_cycle,
            "user_count": effective_user_count,
            "plan_expiry": plan_expiry.isoformat(),
            "is_trial": is_trial
        }, ""
    
    @staticmethod
    async def get_tenant(tenant_id: str = None, company_id: str = None) -> Optional[dict]:
        """Get tenant by ID or company_id"""
        master_db = get_master_db()
        
        if tenant_id:
            return await master_db.tenants.find_one({"_id": tenant_id, "is_deleted": False})
        elif company_id:
            return await master_db.tenants.find_one({"company_id": company_id, "is_deleted": False})
        return None
    
    @staticmethod
    async def list_tenants(
        status: str = None,
        is_trial: bool = None,
        search: str = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[dict], int]:
        """
        List tenants with filters
        
        Returns:
            Tuple of (tenants_list, total_count)
        """
        master_db = get_master_db()
        
        query = {"is_deleted": {"$ne": True}}

        if status:
            query["status"] = status

        if is_trial is not None:
            query["is_trial"] = is_trial

        if search:
            query["$or"] = [
                {"company_name": {"$regex": re.escape(search), "$options": "i"}},
                {"owner.email": {"$regex": re.escape(search), "$options": "i"}},
                {"owner.full_name": {"$regex": re.escape(search), "$options": "i"}}
            ]

        total = await master_db.tenants.count_documents(query)
        
        skip = (page - 1) * limit
        tenants = await master_db.tenants.find(query).skip(skip).limit(limit).to_list(limit)
        
        # Remove sensitive data
        for tenant in tenants:
            if "owner" in tenant:
                tenant["owner"].pop("password_hash", None)
        
        return tenants, total
    
    @staticmethod
    async def update_tenant_status(
        tenant_id: str,
        new_status: TenantStatus,
        updated_by: str = "system"
    ) -> Tuple[bool, str]:
        """Update tenant status"""
        master_db = get_master_db()
        
        result = await master_db.tenants.update_one(
            {"_id": tenant_id, "is_deleted": False},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": updated_by
                }
            }
        )
        
        if result.modified_count == 0:
            return False, "Tenant not found"
        
        return True, f"Tenant status updated to {new_status}"
    
    @staticmethod
    async def activate_tenant(tenant_id: str, plan_expiry: datetime) -> Tuple[bool, str]:
        """Activate tenant after payment"""
        master_db = get_master_db()
        
        result = await master_db.tenants.update_one(
            {"_id": tenant_id},
            {
                "$set": {
                    "status": TenantStatus.ACTIVE,
                    "plan_expiry": plan_expiry,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        if result.modified_count == 0:
            return False, "Tenant not found"
        
        return True, "Tenant activated successfully"
    
    @staticmethod
    async def soft_delete_tenant(tenant_id: str, deleted_by: str) -> Tuple[bool, str]:
        """Soft delete a tenant"""
        master_db = get_master_db()
        
        result = await master_db.tenants.update_one(
            {"_id": tenant_id},
            {
                "$set": {
                    "is_deleted": True,
                    "deleted_at": datetime.now(timezone.utc),
                    "deleted_by": deleted_by,
                    "status": TenantStatus.CANCELLED
                }
            }
        )
        
        if result.modified_count == 0:
            return False, "Tenant not found"
        
        return True, "Tenant deleted successfully"
    
    @staticmethod
    async def get_tenant_stats() -> dict:
        """Get tenant statistics for SuperAdmin dashboard"""
        master_db = get_master_db()
        
        total = await master_db.tenants.count_documents({"is_deleted": {"$ne": True}})
        active = await master_db.tenants.count_documents({
            "is_deleted": {"$ne": True},
            "status": TenantStatus.ACTIVE
        })
        trial = await master_db.tenants.count_documents({
            "is_deleted": {"$ne": True},
            "is_trial": True
        })
        paid = await master_db.tenants.count_documents({
            "is_deleted": {"$ne": True},
            "is_trial": False,
            "status": TenantStatus.ACTIVE
        })
        expired = await master_db.tenants.count_documents({
            "is_deleted": {"$ne": True},
            "status": TenantStatus.TRIAL_EXPIRED
        })
        
        return {
            "total_tenants": total,
            "active_tenants": active,
            "trial_tenants": trial,
            "paid_tenants": paid,
            "expired_tenants": expired
        }


    # ── Admin manual tenant creation ──────────────────────────────────────────

    @staticmethod
    async def create_tenant_by_admin(
        data,  # TenantAdminCreate | TenantAdminCreateWithPayment
        created_by: str,
        with_payment: bool = False,
    ) -> Tuple[Optional[dict], str]:
        """
        Super Admin creates a tenant manually in two modes:

        Mode A (with_payment=False):
          - payment_status = 'manual_by_admin'
          - plan_start_date = now
          - plan_expiry = now + data.plan_duration_days
          - email_verified = True (admin vouches)

        Mode B (with_payment=True):
          - payment_status = 'paid'
          - plan_start_date = data.payment_date
          - plan_expiry = data.payment_date + data.plan_duration_days
          - Records a payment entry with seller commission breakdown
        """
        master_db = get_master_db()

        # Check email uniqueness
        existing = await master_db.tenants.find_one({
            "owner.email": data.owner_email,
            "is_deleted": False,
        })
        if existing:
            return None, "A tenant with this email already exists"

        existing_name = await master_db.tenants.find_one({
            "company_name": {"$regex": f"^{re.escape(data.company_name)}$", "$options": "i"},
            "is_deleted": False,
        })
        if existing_name:
            return None, "Company name already registered"

        # Get plan
        plan = await master_db.plans.find_one({"_id": data.plan_id})
        if not plan:
            plan = await master_db.plans.find_one({"name": data.plan_id})
        if not plan:
            return None, "Invalid plan selected"

        now = datetime.now(timezone.utc)

        # Date logic
        if with_payment:
            payment_date = data.payment_date
            if payment_date.tzinfo is None:
                payment_date = payment_date.replace(tzinfo=timezone.utc)
            plan_start_date = payment_date
        else:
            plan_start_date = now

        plan_expiry = plan_start_date + timedelta(days=data.plan_duration_days)

        # Generate username from email
        owner_username = data.owner_email.split("@")[0].lower().replace(".", "_")
        # Make unique
        base_username = owner_username
        counter = 1
        while await master_db.tenants.find_one({"owner.username": owner_username, "is_deleted": False}):
            owner_username = f"{base_username}{counter}"
            counter += 1

        tenant_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())[:8]
        owner_id = str(uuid.uuid4())

        tenant_data = {
            "_id": tenant_id,
            "company_id": company_id,
            "company_name": data.company_name,
            "display_name": data.company_name,
            "industry": getattr(data, "industry", "other"),
            "website": None,
            "gst_number": None,
            "phone": getattr(data, "phone", "0000000000"),
            "address": {
                "street": "",
                "city": getattr(data, "city", "NA"),
                "state": getattr(data, "state", "NA"),
                "zip_code": getattr(data, "zip_code", "000000"),
                "country": "India",
            },
            "owner": {
                "_id": owner_id,
                "full_name": data.owner_name,
                "email": data.owner_email,
                "mobile": "0000000000",
                "username": owner_username,
                "designation": "Owner",
                "password_hash": hash_password(data.owner_password),
            },
            "plan_id": str(plan.get("_id")),
            "plan_name": plan.get("name"),
            "plan_display_name": plan.get("display_name"),
            "billing_cycle": "manual",
            "max_users": data.user_seats,
            "plan_start_date": plan_start_date,
            "plan_expiry": plan_expiry,
            "is_trial": False,
            "has_used_trial": False,
            "email_verified": True,       # Admin-created → no verification needed
            "email_verification_token": None,
            "email_verification_expiry": None,
            "payment_status": "paid" if with_payment else "manual_by_admin",
            "payment_mode": getattr(data, "payment_mode", None),
            "seller_id": getattr(data, "seller_id", None),
            "status": TenantStatus.ACTIVE,
            "created_at": now,
            "updated_at": now,
            "created_by": created_by,
            "is_deleted": False,
        }

        await master_db.tenants.insert_one(tenant_data)

        # Create company database + owner user
        await DatabaseManager.create_company_database(company_id)
        company_db = DatabaseManager.get_company_db(company_id)

        owner_user = {
            "_id": owner_id,
            "username": owner_username,
            "email": data.owner_email,
            "full_name": data.owner_name,
            "mobile": "0000000000",
            "password_hash": hash_password(data.owner_password),
            "role": UserRole.ADMIN,
            "permissions": ROLE_PERMISSIONS[UserRole.ADMIN],
            "designation": "Owner",
            "status": UserStatus.ACTIVE,
            "is_owner": True,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await company_db.users.insert_one(owner_user)

        # Record payment for Mode B
        if with_payment:
            amount_paise = int(getattr(data, "amount_paid", 0) * 100)

            # Seller commission calculation
            seller_margin = None
            seller_commission = None
            company_revenue = amount_paise

            if getattr(data, "seller_id", None):
                seller = await master_db.sellers.find_one({"_id": data.seller_id, "is_deleted": False})
                if seller:
                    from app.core.config import settings as _settings
                    seller_margin = seller.get("margin_percentage") or _settings.DEFAULT_SELLER_MARGIN
                    seller_commission = int(amount_paise * seller_margin / 100)
                    company_revenue = amount_paise - seller_commission

                    # Update seller tenant counts
                    await master_db.sellers.update_one(
                        {"_id": data.seller_id},
                        {"$inc": {"total_tenants": 1, "active_tenants": 1}}
                    )

            payment_record = {
                "_id": str(uuid.uuid4()),
                "transaction_id": f"TXN{now.strftime('%Y%m%d%H%M%S')}{str(uuid.uuid4())[:4].upper()}",
                "tenant_id": tenant_id,
                "company_id": company_id,
                "company_name": data.company_name,
                "seller_id": getattr(data, "seller_id", None),
                "plan_id": str(plan.get("_id")),
                "plan_name": plan.get("name"),
                "billing_cycle": "manual",
                "amount": amount_paise,
                "currency": "INR",
                "tax_amount": 0,
                "total_amount": amount_paise,
                "seller_margin": seller_margin,
                "seller_commission": seller_commission,
                "company_revenue": company_revenue,
                "payment_method": getattr(data, "payment_mode", "cash"),
                "payment_type": "new_subscription",
                "status": "completed",
                "payment_date": getattr(data, "payment_date", now),
                "subscription_start": plan_start_date,
                "subscription_end": plan_expiry,
                "invoice_number": f"INV{now.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
                "notes": getattr(data, "payment_reference", None),
                "payment_status_note": "paid",
                "created_by_admin": True,
                "created_at": now,
                "updated_at": now,
                "created_by": created_by,
            }
            await master_db.payments.insert_one(payment_record)

        # Send welcome email if requested
        if getattr(data, "send_welcome_email", True):
            try:
                from app.services.email_service import EmailService
                await EmailService.send_welcome_email(
                    to_email=data.owner_email,
                    full_name=data.owner_name,
                    username=owner_username,
                    company_name=data.company_name,
                    temp_password=data.owner_password,
                )
            except Exception:
                pass  # Email failure must not block account creation

        logger.info(f"✅ Admin created tenant: {data.company_name} (ID: {company_id})")

        return {
            "success": True,
            "tenant_id": tenant_id,
            "company_id": company_id,
            "company_name": data.company_name,
            "owner_email": data.owner_email,
            "owner_username": owner_username,
            "plan_name": plan.get("name"),
            "plan_start_date": plan_start_date.isoformat(),
            "plan_expiry": plan_expiry.isoformat(),
            "total_user_seats": data.user_seats,
            "payment_status": "paid" if with_payment else "manual_by_admin",
        }, ""

    @staticmethod
    async def send_verification_email_for_tenant(tenant_id: str) -> Tuple[bool, str]:
        """Generate a fresh verification token and send verification email."""
        master_db = get_master_db()
        tenant = await master_db.tenants.find_one({"_id": tenant_id, "is_deleted": False})
        if not tenant:
            return False, "Tenant not found"
        if tenant.get("email_verified"):
            return False, "Email already verified"

        import secrets
        from datetime import timedelta
        from app.core.config import settings as _settings
        token = secrets.token_urlsafe(32)
        expiry = datetime.now(timezone.utc) + timedelta(
            hours=_settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS
        )
        await master_db.tenants.update_one(
            {"_id": tenant_id},
            {"$set": {
                "email_verification_token": token,
                "email_verification_expiry": expiry,
            }}
        )
        owner = tenant.get("owner", {})
        try:
            from app.services.email_service import EmailService
            await EmailService.send_verification_email(
                to_email=owner.get("email", ""),
                full_name=owner.get("full_name", ""),
                token=token,
                account_type="tenant",
            )
        except Exception:
            pass
        return True, "Verification email sent"


# Singleton instance
tenant_service = TenantService()