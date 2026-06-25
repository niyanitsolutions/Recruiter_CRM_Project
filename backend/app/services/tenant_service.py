"""
Tenant Service
Handles company registration and management
"""

import re
import secrets
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List

from pymongo.errors import OperationFailure

from app.core.database import get_master_db, DatabaseManager
from app.core.security import hash_password
from app.models.master.tenant import TenantStatus
from app.models.company.user import UserRole, UserStatus, ROLE_PERMISSIONS
from app.models.master.global_user import upsert_global_user, ensure_user_company_map
from app.services.email_service import send_trial_verification_email

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

            # Check in pending registrations awaiting verification
            existing = await master_db.pending_registrations.find_one({
                "email": email,
                "status": "pending_verification",
            })
            if existing:
                return False, "Email already registered. Please check your inbox to verify your account."

        if mobile:
            existing = await master_db.tenants.find_one({
                "owner.mobile": mobile,
                "is_deleted": False
            })
            if existing:
                return False, "Mobile number already registered"

            # Check pending registrations
            existing = await master_db.pending_registrations.find_one({
                "contact_number": mobile,
                "status": "pending_verification",
            })
            if existing:
                return False, "Mobile number already registered. Please check your inbox to verify your account."

        if username:
            existing = await master_db.tenants.find_one({
                "owner.username": username.lower(),
                "is_deleted": False
            })
            if existing:
                return False, "Username already taken"

            # Check pending registrations
            existing = await master_db.pending_registrations.find_one({
                "username": username.lower(),
                "status": "pending_verification",
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

        # 5. Create first user in company DB
        #
        # Designation determines access level:
        #   "Owner" → is_owner=True, full admin permissions, reports_to = self
        #   "Admin" → is_owner=False, admin permissions only
        #
        # Both get the full admin permission set because the admin role already
        # contains every non-owner permission.  The is_owner flag is what grants
        # unrestricted bypass in the permission middleware.
        company_db = DatabaseManager.get_company_db(company_id)

        is_owner = (owner_designation == "Owner")
        first_user_id = tenant_data["owner"]["_id"]
        permissions = list(ROLE_PERMISSIONS[UserRole.ADMIN])

        owner_user = {
            "_id": first_user_id,
            "username": owner_username.lower(),
            "email": owner_email,
            "full_name": owner_name,
            "mobile": owner_mobile,
            "password_hash": tenant_data["owner"]["password_hash"],
            "role": UserRole.ADMIN,
            "permissions": permissions,
            "designation": owner_designation,
            "status": UserStatus.ACTIVE,
            "is_owner": is_owner,
            "user_type": "internal",
            # Owner always reports to themselves; Admin has no reporting_to at creation
            "reporting_to": first_user_id if is_owner else None,
            # Registration-created users already provided all info — profile is complete
            "profile_completed": True,
            # They set their own password during registration — no forced change needed
            "must_change_password": False,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "is_deleted": False,
        }

        await company_db.users.insert_one(owner_user)

        # Register in global identity layer (enables O(1) login without DB scanning)
        global_user_id = await upsert_global_user(
            master_db,
            email=owner_email,
            mobile=owner_mobile,
            password_hash=tenant_data["owner"]["password_hash"],
        )
        await ensure_user_company_map(
            master_db,
            global_user_id=global_user_id,
            company_id=company_id,
            local_user_id=first_user_id,
            role="admin",
            is_owner=is_owner,
        )

        # Create audit log
        await company_db.audit_logs.insert_one({
            "_id": str(uuid.uuid4()),
            "action": "create",
            "entity_type": "user",
            "entity_id": first_user_id,
            "entity_name": owner_name,
            "user_id": "system",
            "user_name": "System",
            "user_role": "system",
            "description": f"Company account created — designation: {owner_designation}",
            "created_at": datetime.now(timezone.utc),
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
    
    # ── Trial Setup ───────────────────────────────────────────────────────────

    @staticmethod
    async def initiate_trial_registration(
        *,
        company_name: str,
        company_contact: Optional[str],
        website: Optional[str],
        no_website: bool,
        person_name: str,
        username: str,
        email: str,
        contact_number: str,
        password: str,
        designation: str,
        crm_enabled: bool = True,
        hrm_enabled: bool = True,
        module: str = "crm_hrm",
    ) -> Tuple[Optional[dict], str]:
        """
        Step 1 of email-verified trial onboarding.

        Creates a pending_registration record and sends a verification email.
        Does NOT provision any tenant, database, or user.
        Actual provisioning happens in verify_and_provision_trial() after the user
        clicks the verification link.

        Returns: (result_dict | None, error_message)
        """
        logger.info("[TRIAL-SETUP LOG-1] Request received | email=%s username=%s company=%s", email, username, company_name)
        try:
            master_db = get_master_db()
            logger.info("[TRIAL-SETUP LOG-2] DB handle acquired")

            # ── 1. Uniqueness checks (tenants + pending_registrations) ───────────
            is_unique, error = await TenantService.check_unique_fields(
                company_name=company_name,
                email=email,
                mobile=contact_number,
                username=username,
            )
            logger.info("[TRIAL-SETUP LOG-3] Uniqueness check done | is_unique=%s error=%s", is_unique, error)
            if not is_unique:
                logger.warning("Trial initiation uniqueness failure | reason=%s", error)
                return None, error

            # ── 2. Generate token + expiry ────────────────────────────────────────
            now = datetime.now(timezone.utc)
            verification_token = secrets.token_hex(32)
            verification_expiry = now + timedelta(hours=24)
            logger.info("[TRIAL-SETUP LOG-4] Token generated | prefix=%s expiry=%s", verification_token[:8], verification_expiry)

            # ── 3. Hash password ──────────────────────────────────────────────────
            hashed_pw = hash_password(password)
            resolved_website = None if no_website else (website or None)
            logger.info("[TRIAL-SETUP LOG-5] Password hashed | no_website=%s", no_website)

            # ── 4. Persist pending record ─────────────────────────────────────────
            reg_id = str(uuid.uuid4())
            pending_doc = {
                "_id": reg_id,
                "company_name": company_name,
                "company_contact": company_contact or "",
                "website": resolved_website,
                "no_website": no_website,
                "person_name": person_name,
                "username": username.lower(),
                "email": email.lower(),
                "contact_number": contact_number,
                "password_hash": hashed_pw,
                "designation": designation,
                "module": module,
                "crm_enabled": crm_enabled,
                "hrm_enabled": hrm_enabled,
                "verification_token": verification_token,
                "verification_expiry": verification_expiry,
                "status": "pending_verification",
                "created_at": now,
                "verified_at": None,
            }
            logger.info("[TRIAL-SETUP LOG-6] Inserting pending_registrations doc | reg_id=%s", reg_id)
            await master_db.pending_registrations.insert_one(pending_doc)
            logger.info("[TRIAL-SETUP LOG-7] pending_registrations insert OK")

            # ── 5. Resolve trial_days for email copy ──────────────────────────────
            trial_plan = await master_db.plans.find_one({"is_trial_plan": True, "is_active": {"$ne": False}})
            trial_days = trial_plan.get("trial_days", 14) if trial_plan else 14
            logger.info("[TRIAL-SETUP LOG-8] trial_days resolved | trial_days=%s plan_found=%s", trial_days, bool(trial_plan))

            # ── 6. Send verification email ────────────────────────────────────────
            logger.info("[TRIAL-SETUP LOG-9] Calling send_trial_verification_email | to=%s", email)
            email_sent = await send_trial_verification_email(
                to_email=email,
                full_name=person_name,
                company_name=company_name,
                token=verification_token,
                trial_days=trial_days,
            )
            logger.info("[TRIAL-SETUP LOG-10] send_trial_verification_email returned | email_sent=%s", email_sent)

            if not email_sent:
                await master_db.pending_registrations.delete_one({"_id": reg_id})
                logger.error(
                    "Trial verification email failed — pending record rolled back | email=%s", email
                )
                return None, "Failed to send verification email. Please check your email address and try again."

            logger.info(
                "[TRIAL-SETUP LOG-11] Done | email=%s token_prefix=%s", email, verification_token[:8]
            )

            return {
                "success": True,
                "message": "Verification email sent. Please check your inbox to activate your free trial.",
                "email_sent": True,
                "email": email,
            }, ""

        except OperationFailure as _exc:
            logger.error(
                "[TRIAL-SETUP] MongoDB OperationFailure | email=%s error=%s", email, _exc
            )
            return None, "Registration is temporarily unavailable due to a server issue. Please try again later or contact support."
        except Exception as _exc:
            logger.exception(
                "[TRIAL-SETUP FATAL] Unhandled exception in initiate_trial_registration | "
                "email=%s username=%s error_type=%s error=%s",
                email, username, type(_exc).__name__, _exc,
            )
            raise

    @staticmethod
    async def verify_and_provision_trial(token: str) -> Tuple[Optional[dict], str]:
        """
        Step 2 of email-verified trial onboarding.

        Validates the token from the verification email, then provisions:
        tenant record, company DB, owner user, global identity, audit log.
        Marks the pending_registration as verified.

        Returns: (result_dict | None, error_message)
        """
        master_db = get_master_db()
        now = datetime.now(timezone.utc)

        # ── 1. Look up pending record ─────────────────────────────────────────
        logger.info(
            "[VERIFY-TRIAL] Token lookup | prefix=%s...", token[:8] if len(token) >= 8 else token
        )
        pending = await master_db.pending_registrations.find_one(
            {"verification_token": token}
        )

        if not pending:
            logger.warning(
                "[VERIFY-TRIAL] No pending registration found for token prefix=%s",
                token[:8] if len(token) >= 8 else token,
            )
            return None, "Invalid verification link. The link may have already been used or does not exist."

        status_val = pending.get("status", "")
        logger.info(
            "[VERIFY-TRIAL] Pending doc found | id=%s email=%s status=%s",
            pending.get("_id"), pending.get("email"), status_val,
        )

        if status_val == "verified":
            return None, "This email has already been verified. You can log in now."

        if status_val == "expired":
            return None, "This verification link has expired. Please request a new one."

        # Check expiry
        expiry = pending.get("verification_expiry")
        if expiry:
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if now > expiry:
                await master_db.pending_registrations.update_one(
                    {"_id": pending["_id"]}, {"$set": {"status": "expired"}}
                )
                logger.warning(
                    "[VERIFY-TRIAL] Token expired | email=%s expiry=%s now=%s",
                    pending.get("email"), expiry, now,
                )
                return None, "This verification link has expired. Please request a new one."

        # ── 2. Race-condition guard ───────────────────────────────────────────
        existing_tenant = await master_db.tenants.find_one({
            "$or": [
                {"owner.email": pending["email"]},
                {"owner.username": pending["username"]},
            ],
            "is_deleted": False,
        })
        if existing_tenant:
            return None, "An account with this email or username already exists. Please log in."

        # ── 3. Resolve trial plan ─────────────────────────────────────────────
        trial_plan = await master_db.plans.find_one({"is_trial_plan": True, "is_active": {"$ne": False}})
        trial_days = trial_plan.get("trial_days", 14) if trial_plan else 14
        plan_id_val = str(trial_plan["_id"]) if trial_plan else "trial"
        plan_name_val = trial_plan.get("name", "Trial") if trial_plan else "Trial"
        plan_display_val = trial_plan.get("display_name", "Trial Plan") if trial_plan else "Trial Plan"
        max_users_val = trial_plan.get("max_users", 5) if trial_plan else 5

        # ── 4. Build IDs and dates ────────────────────────────────────────────
        company_id = str(uuid.uuid4())[:8]
        tenant_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        trial_start = now
        trial_end = now + timedelta(days=trial_days)

        # Extract from pending record
        email = pending["email"]
        username = pending["username"]
        person_name = pending["person_name"]
        contact_number = pending["contact_number"]
        hashed_pw = pending["password_hash"]
        designation = pending["designation"]
        company_name = pending["company_name"]
        crm_enabled = pending.get("crm_enabled", True)
        hrm_enabled = pending.get("hrm_enabled", True)
        resolved_website = pending.get("website")

        is_owner = designation == "Owner"
        permissions = list(ROLE_PERMISSIONS.get("admin", []))

        # ── 5. Create tenant record ───────────────────────────────────────────
        tenant_data = {
            "_id": tenant_id,
            "company_id": company_id,
            "company_name": company_name,
            "display_name": company_name,
            "industry": "other",
            "website": resolved_website,
            "phone": pending.get("company_contact", ""),
            "email": email,
            "location": None,
            "address": {"street": "", "city": "", "state": "", "zip_code": "", "country": "India"},
            "owner": {
                "_id": user_id,
                "full_name": person_name,
                "email": email,
                "mobile": contact_number,
                "username": username,
                "designation": designation,
                "password_hash": hashed_pw,
            },
            "plan_id": plan_id_val,
            "plan_name": plan_name_val,
            "plan_display_name": plan_display_val,
            "billing_cycle": "trial",
            "max_users": max_users_val,
            "plan_start_date": trial_start,
            "plan_expiry": trial_end,
            "trial_start_date": trial_start,
            "trial_end_date": trial_end,
            "is_trial": True,
            "has_used_trial": True,
            "email_verified": True,
            "email_verification_token": None,
            "email_verification_expiry": None,
            "crm_enabled": crm_enabled,
            "hrm_enabled": hrm_enabled,
            "status": TenantStatus.ACTIVE,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }

        # ── 6. Provision company DB + owner user ──────────────────────────────
        try:
            await master_db.tenants.insert_one(tenant_data)
            logger.info(
                "Trial tenant record created | company=%s | id=%s", company_name, company_id
            )
            await DatabaseManager.create_company_database(company_id)
            company_db = DatabaseManager.get_company_db(company_id)

            owner_user = {
                "_id": user_id,
                "username": username,
                "email": email,
                "full_name": person_name,
                "mobile": contact_number,
                "password_hash": hashed_pw,
                "role": UserRole.ADMIN,
                "permissions": permissions,
                "designation": designation,
                "status": UserStatus.ACTIVE,
                "is_owner": is_owner,
                "user_type": "internal",
                "reporting_to": user_id if is_owner else None,
                "profile_completed": True,
                "must_change_password": False,
                "created_at": now,
                "updated_at": now,
                "is_deleted": False,
            }
            await company_db.users.insert_one(owner_user)

            global_user_id = await upsert_global_user(
                master_db,
                email=email,
                mobile=contact_number,
                password_hash=hashed_pw,
            )
            await ensure_user_company_map(
                master_db,
                global_user_id=global_user_id,
                company_id=company_id,
                local_user_id=user_id,
                role="admin",
                is_owner=is_owner,
            )

            await company_db.audit_logs.insert_one({
                "_id": str(uuid.uuid4()),
                "action": "create",
                "entity_type": "user",
                "entity_id": user_id,
                "entity_name": person_name,
                "user_id": "system",
                "user_name": "System",
                "user_role": "system",
                "description": f"Trial account created via email verification — designation: {designation}",
                "created_at": now,
            })

        except Exception as exc:
            logger.error(
                "Trial provisioning failed after verification | company=%s | error=%s",
                company_id, exc, exc_info=True,
            )
            # Clean up both the tenant record and the company DB so the user can retry cleanly
            try:
                await master_db.tenants.delete_one({"_id": tenant_id})
            except Exception as _del_exc:
                logger.error("Tenant cleanup failed | tenant_id=%s | error=%s", tenant_id, _del_exc)
            try:
                await DatabaseManager.delete_company_database(company_id)
            except Exception as _db_exc:
                logger.error("Company DB cleanup failed | company_id=%s | error=%s", company_id, _db_exc)
            return None, "Failed to provision your workspace. Please try again or contact support."

        # ── 7. Mark pending registration as verified ──────────────────────────
        await master_db.pending_registrations.update_one(
            {"_id": pending["_id"]},
            {"$set": {"status": "verified", "verified_at": now}},
        )

        logger.info(
            "Trial provisioning complete | company=%s | user=%s | designation=%s",
            company_id, user_id, designation,
        )

        return {
            "verified": True,
            "message": "Email verified successfully! Your trial workspace is ready.",
            "company_name": company_name,
            "email": email,
            "trial_days": trial_days,
        }, ""

    @staticmethod
    async def resend_trial_verification(email: str) -> Tuple[bool, str]:
        """
        Resend the trial verification email for a pending registration.
        Always returns True to avoid revealing account existence.
        """
        master_db = get_master_db()
        _email = email.lower().strip()

        # Accept both pending_verification AND expired (token expired, user requests new link)
        pending = await master_db.pending_registrations.find_one({
            "email": _email,
            "status": {"$in": ["pending_verification", "expired"]},
        })

        if not pending:
            return True, "If an unverified registration exists, a new email has been sent."

        now = datetime.now(timezone.utc)
        new_token = secrets.token_hex(32)
        new_expiry = now + timedelta(hours=24)

        await master_db.pending_registrations.update_one(
            {"_id": pending["_id"]},
            {"$set": {
                "verification_token": new_token,
                "verification_expiry": new_expiry,
                "status": "pending_verification",  # reset expired status
            }},
        )

        trial_plan = await master_db.plans.find_one({"is_trial_plan": True, "is_active": {"$ne": False}})
        trial_days = trial_plan.get("trial_days", 14) if trial_plan else 14

        await send_trial_verification_email(
            to_email=pending["email"],
            full_name=pending["person_name"],
            company_name=pending["company_name"],
            token=new_token,
            trial_days=trial_days,
        )

        logger.info("Trial verification email resent | email=%s", _email)
        return True, "If an unverified registration exists, a new email has been sent."

    @staticmethod
    async def setup_trial(
        *,
        company_name: str,
        company_contact: Optional[str],
        website: Optional[str],
        no_website: bool,
        person_name: str,
        username: str,
        email: str,
        contact_number: str,
        password: str,
        designation: str,           # "Owner" | "Admin" — already validated by schema
        crm_enabled: bool = True,
        hrm_enabled: bool = True,
    ) -> Tuple[Optional[dict], str]:
        """
        Single-call trial onboarding.

        1. Validates uniqueness (company name, email, username, mobile)
        2. Auto-selects the trial plan from master_db (is_trial_plan=True)
        3. Creates tenant record with trial_start_date / trial_end_date (14 days)
        4. Provisions company database
        5. Creates first user with designation-based permissions
        6. Owner: reporting_to = own id; is_owner = True
        7. Rolls back tenant record if user creation fails

        Returns: (result_dict | None, error_message)
        """
        master_db = get_master_db()

        # ── 1. Uniqueness checks ──────────────────────────────────────────────
        is_unique, error = await TenantService.check_unique_fields(
            company_name=company_name,
            email=email,
            mobile=contact_number,
            username=username,
        )
        if not is_unique:
            logger.warning("Trial setup uniqueness failure | reason=%s", error)
            return None, error

        # ── 2. Resolve website ────────────────────────────────────────────────
        resolved_website = None if no_website else (website or None)

        # ── 3. Look up trial plan ─────────────────────────────────────────────
        trial_plan = await master_db.plans.find_one({"is_trial_plan": True, "is_active": {"$ne": False}})
        trial_days = trial_plan.get("trial_days", 14) if trial_plan else 14
        plan_id_val = str(trial_plan["_id"]) if trial_plan else "trial"
        plan_name_val = trial_plan.get("name", "Trial") if trial_plan else "Trial"
        plan_display_val = trial_plan.get("display_name", "Trial Plan") if trial_plan else "Trial Plan"
        max_users_val = trial_plan.get("max_users", 5) if trial_plan else 5

        # ── 4. Build IDs and dates ────────────────────────────────────────────
        now = datetime.now(timezone.utc)
        company_id = str(uuid.uuid4())[:8]
        tenant_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        trial_start = now
        trial_end = now + timedelta(days=trial_days)

        # ── 5. Resolve role + permissions ─────────────────────────────────────
        is_owner = designation == "Owner"
        role_type = "owner" if is_owner else "admin"
        # Both Owner and Admin get the full admin permission set.
        # Owner additionally has is_owner=True which bypasses permission checks.
        permissions = list(ROLE_PERMISSIONS.get("admin", []))

        hashed_pw = hash_password(password)

        # ── 6. Create tenant record ───────────────────────────────────────────
        tenant_data = {
            "_id": tenant_id,
            "company_id": company_id,
            "company_name": company_name,
            "display_name": company_name,
            "industry": "other",
            "website": resolved_website,
            "phone": company_contact or "",
            "email": email,
            "location": None,
            "address": {"street": "", "city": "", "state": "", "zip_code": "", "country": "India"},
            "owner": {
                "_id": user_id,
                "full_name": person_name,
                "email": email,
                "mobile": contact_number,
                "username": username,
                "designation": designation,
                "password_hash": hashed_pw,
            },
            "plan_id": plan_id_val,
            "plan_name": plan_name_val,
            "plan_display_name": plan_display_val,
            "billing_cycle": "trial",
            "max_users": max_users_val,
            "plan_start_date": trial_start,
            "plan_expiry": trial_end,
            "trial_start_date": trial_start,
            "trial_end_date": trial_end,
            "is_trial": True,
            "has_used_trial": True,
            "email_verified": True,
            "email_verification_token": None,
            "email_verification_expiry": None,
            "crm_enabled": crm_enabled,
            "hrm_enabled": hrm_enabled,
            "status": TenantStatus.ACTIVE,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }

        await master_db.tenants.insert_one(tenant_data)
        logger.info("Trial tenant record created | company=%s | id=%s", company_name, company_id)

        # ── 7. Provision company database + owner user ────────────────────────
        try:
            await DatabaseManager.create_company_database(company_id)
            company_db = DatabaseManager.get_company_db(company_id)

            owner_user = {
                "_id": user_id,
                "username": username,
                "email": email,
                "full_name": person_name,
                "mobile": contact_number,
                "password_hash": hashed_pw,
                "role": UserRole.ADMIN,
                "permissions": permissions,
                "designation": designation,
                "status": UserStatus.ACTIVE,
                "is_owner": is_owner,
                "user_type": "internal",
                "reporting_to": user_id if is_owner else None,   # owner reports to self
                # Trial-registration users already provided all info — profile is complete
                "profile_completed": True,
                # They set their own password during registration — no forced change needed
                "must_change_password": False,
                "created_at": now,
                "updated_at": now,
                "is_deleted": False,
            }

            await company_db.users.insert_one(owner_user)

            # Register in global identity layer
            global_user_id = await upsert_global_user(
                master_db,
                email=email,
                mobile=contact_number,
                password_hash=hashed_pw,
            )
            await ensure_user_company_map(
                master_db,
                global_user_id=global_user_id,
                company_id=company_id,
                local_user_id=user_id,
                role="admin",
                is_owner=is_owner,
            )

            # Audit trail
            await company_db.audit_logs.insert_one({
                "_id": str(uuid.uuid4()),
                "action": "create",
                "entity_type": "user",
                "entity_id": user_id,
                "entity_name": person_name,
                "user_id": "system",
                "user_name": "System",
                "user_role": "system",
                "description": f"Trial account created — designation: {designation}",
                "created_at": now,
            })

        except Exception as exc:
            # Rollback: remove the tenant record so the same email/username can retry
            logger.error(
                "Trial setup failed during company DB creation | company=%s | error=%s",
                company_id, exc, exc_info=True,
            )
            await master_db.tenants.delete_one({"_id": tenant_id})
            return None, "Failed to provision company database. Please try again."

        logger.info(
            "Trial setup complete | company=%s | user=%s | designation=%s",
            company_id, user_id, designation,
        )

        return {
            "success": True,
            "message": "Trial setup completed successfully",
            "data": {
                "company_id": company_id,
                "user_id": user_id,
                "role_type": role_type,
            },
        }, ""

    # ── Standard tenant helpers ───────────────────────────────────────────────

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
        tenants = await master_db.tenants.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

        # Remove sensitive data
        for tenant in tenants:
            if "owner" in tenant:
                tenant["owner"].pop("password_hash", None)

        # Batch-resolve seller names so the frontend can show "Direct" vs seller name
        seller_ids = list({t["seller_id"] for t in tenants if t.get("seller_id")})
        if seller_ids:
            seller_docs = await master_db.sellers.find(
                {"_id": {"$in": seller_ids}},
                {"_id": 1, "seller_name": 1},
            ).to_list(length=len(seller_ids))
            seller_map = {s["_id"]: s["seller_name"] for s in seller_docs}
            for tenant in tenants:
                sid = tenant.get("seller_id")
                tenant["seller_name"] = seller_map.get(sid) if sid else None
        else:
            for tenant in tenants:
                tenant["seller_name"] = None

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
        """
        Soft-delete a tenant with a retention period before permanent removal.

        Retention rules:
          - Trial tenants  → 15 days
          - Paid tenants   → 30 days

        The tenant is immediately blocked from logging in (status = DELETED),
        but all data is preserved until the cleanup job runs after the retention
        period expires.
        """
        master_db = get_master_db()

        tenant = await master_db.tenants.find_one({"_id": tenant_id})
        if not tenant:
            return False, "Tenant not found"

        if tenant.get("is_deleted"):
            return False, "Tenant is already deleted"

        is_trial = bool(tenant.get("is_trial", True))
        retention_days = 15 if is_trial else 30
        now = datetime.now(timezone.utc)
        deletion_scheduled_at = now + timedelta(days=retention_days)

        result = await master_db.tenants.update_one(
            {"_id": tenant_id},
            {
                "$set": {
                    "is_deleted": True,
                    "deleted_at": now,
                    "deleted_by": deleted_by,
                    "deletion_scheduled_at": deletion_scheduled_at,
                    "status": TenantStatus.DELETED,
                    "updated_at": now,
                }
            }
        )

        if result.modified_count == 0:
            return False, "Failed to delete tenant"

        # Audit log in master_db
        await master_db.tenant_audit_logs.insert_one({
            "_id": str(uuid.uuid4()),
            "company_id": tenant.get("company_id"),
            "company_name": tenant.get("company_name"),
            "action": "company_deleted",
            "performed_by": deleted_by,
            "timestamp": now,
            "details": {
                "retention_days": retention_days,
                "deletion_scheduled_at": deletion_scheduled_at.isoformat(),
            },
        })

        return True, f"Company deleted. Scheduled for permanent removal in {retention_days} days."

    @staticmethod
    async def restore_tenant(tenant_id: str, restored_by: str) -> Tuple[bool, str]:
        """Restore a soft-deleted tenant before permanent deletion."""
        master_db = get_master_db()

        tenant = await master_db.tenants.find_one({"_id": tenant_id})
        if not tenant:
            return False, "Tenant not found"

        if not tenant.get("is_deleted"):
            return False, "Tenant is not deleted"

        now = datetime.now(timezone.utc)
        result = await master_db.tenants.update_one(
            {"_id": tenant_id},
            {
                "$set": {
                    "is_deleted": False,
                    "status": TenantStatus.ACTIVE,
                    "updated_at": now,
                },
                "$unset": {
                    "deleted_at": "",
                    "deleted_by": "",
                    "deletion_scheduled_at": "",
                }
            }
        )

        if result.modified_count == 0:
            return False, "Failed to restore tenant"

        await master_db.tenant_audit_logs.insert_one({
            "_id": str(uuid.uuid4()),
            "company_id": tenant.get("company_id"),
            "company_name": tenant.get("company_name"),
            "action": "company_restored",
            "performed_by": restored_by,
            "timestamp": now,
            "details": {},
        })

        return True, "Company restored successfully"

    @staticmethod
    async def permanent_delete_tenant(
        tenant_id: str,
        deleted_by: str,
        confirm_company_name: str,
    ) -> Tuple[bool, str]:
        """
        Permanently delete a tenant and drop its company database.

        Safety checks:
        1. Tenant must exist.
        2. Confirmed company name must match exactly (case-insensitive).
        3. Drops only the database that belongs to this company_id.
        """
        master_db = get_master_db()

        tenant = await master_db.tenants.find_one({"_id": tenant_id})
        if not tenant:
            return False, "Tenant not found"

        actual_name = tenant.get("company_name", "")
        if actual_name.lower().strip() != confirm_company_name.lower().strip():
            return False, "Company name confirmation does not match"

        company_id = tenant.get("company_id")
        if not company_id:
            return False, "Company ID missing — cannot safely identify the database"

        now = datetime.now(timezone.utc)

        # 1. Drop tenant database (idempotent — returns False if already gone)
        db_deleted = await DatabaseManager.delete_company_database(company_id)

        # 2. Remove master DB records
        await master_db.tenants.delete_one({"_id": tenant_id})
        await master_db.payments.delete_many({"tenant_id": tenant_id})

        # 3. Audit log (written before delete so company info is available)
        await master_db.tenant_audit_logs.insert_one({
            "_id": str(uuid.uuid4()),
            "company_id": company_id,
            "company_name": actual_name,
            "action": "company_permanently_deleted",
            "performed_by": deleted_by,
            "timestamp": now,
            "details": {
                "database_dropped": db_deleted,
                "tenant_id": tenant_id,
            },
        })

        msg = "Company permanently deleted"
        if not db_deleted:
            msg += " (database was already missing)"
        return True, msg

    @staticmethod
    async def get_deleted_tenants(
        page: int = 1,
        limit: int = 20,
        search: str = None,
    ) -> Tuple[List[dict], int]:
        """List soft-deleted tenants with days remaining before permanent deletion."""
        master_db = get_master_db()

        query: dict = {"is_deleted": True}
        if search:
            query["$or"] = [
                {"company_name": {"$regex": re.escape(search), "$options": "i"}},
                {"owner.email": {"$regex": re.escape(search), "$options": "i"}},
            ]

        total = await master_db.tenants.count_documents(query)
        skip = (page - 1) * limit
        tenants = (
            await master_db.tenants.find(query)
            .sort("deletion_scheduled_at", 1)
            .skip(skip)
            .limit(limit)
            .to_list(limit)
        )

        now = datetime.now(timezone.utc)
        for t in tenants:
            t.get("owner", {}).pop("password_hash", None)
            sched = t.get("deletion_scheduled_at")
            if sched:
                if sched.tzinfo is None:
                    sched = sched.replace(tzinfo=timezone.utc)
                t["days_remaining"] = max((sched - now).days, 0)
            else:
                t["days_remaining"] = 0

        return tenants, total

    @staticmethod
    async def cleanup_expired_tenants(run_by: str = "scheduler") -> dict:
        """
        Permanently delete all tenants whose retention period has expired.

        Idempotent: if a database is already gone the step is skipped gracefully.
        Called by the daily cleanup background loop (2 AM).
        """
        master_db = get_master_db()
        now = datetime.now(timezone.utc)

        expired = await master_db.tenants.find({
            "is_deleted": True,
            "deletion_scheduled_at": {"$lte": now},
        }).to_list(None)

        processed = 0
        skipped = 0
        errors = []

        for tenant in expired:
            tenant_id = tenant.get("_id")
            company_id = tenant.get("company_id")
            company_name = tenant.get("company_name", "unknown")

            try:
                # Safety: only process tenants still marked deleted and still expired
                current = await master_db.tenants.find_one({"_id": tenant_id})
                if not current:
                    skipped += 1
                    continue
                if not current.get("is_deleted"):
                    # Was restored between query and now
                    skipped += 1
                    continue
                sched = current.get("deletion_scheduled_at")
                if sched:
                    if sched.tzinfo is None:
                        sched = sched.replace(tzinfo=timezone.utc)
                    if sched > now:
                        skipped += 1
                        continue

                db_deleted = False
                if company_id:
                    db_deleted = await DatabaseManager.delete_company_database(company_id)

                await master_db.tenants.delete_one({"_id": tenant_id})
                await master_db.payments.delete_many({"tenant_id": tenant_id})

                await master_db.tenant_audit_logs.insert_one({
                    "_id": str(uuid.uuid4()),
                    "company_id": company_id,
                    "company_name": company_name,
                    "action": "automatic_cleanup_executed",
                    "performed_by": run_by,
                    "timestamp": now,
                    "details": {
                        "database_dropped": db_deleted,
                        "tenant_id": tenant_id,
                    },
                })

                processed += 1
                logger.info(
                    "Cleanup: permanently deleted company=%s (id=%s, db_dropped=%s)",
                    company_name, company_id, db_deleted,
                )

            except Exception as exc:
                errors.append({"company_id": company_id, "error": str(exc)})
                logger.error(
                    "Cleanup error for company=%s: %s", company_id, exc, exc_info=True
                )

        return {"processed": processed, "skipped": skipped, "errors": errors}
    
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

        admin_module = getattr(data, "module", "crm_hrm")
        crm_enabled = admin_module in ("crm_only", "crm_hrm")
        hrm_enabled = admin_module in ("hrm_only", "crm_hrm")

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
            "crm_enabled": crm_enabled,
            "hrm_enabled": hrm_enabled,
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

            # Write commission record so seller dashboard shows manual tenants
            if seller_commission and seller_commission > 0 and getattr(data, "seller_id", None):
                seller_doc = await master_db.sellers.find_one({"_id": data.seller_id}, {"seller_name": 1})
                await master_db.commissions.insert_one({
                    "_id": str(uuid.uuid4()),
                    "seller_id": data.seller_id,
                    "seller_name": (seller_doc.get("seller_name") if seller_doc else "") or "",
                    "tenant_id": tenant_id,
                    "tenant_name": data.company_name,
                    "payment_id": payment_record["_id"],
                    "plan_id": str(plan.get("_id")),
                    "plan_name": plan.get("name", ""),
                    "billing_cycle": "manual",
                    "base_amount": amount_paise,
                    "reseller_amount": amount_paise - seller_commission,
                    "commission_amount": seller_commission,
                    "reseller_discount_percent": seller_margin,
                    "status": "pending",
                    "created_at": now,
                    "updated_at": now,
                })

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
        expire_minutes = getattr(_settings, "EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES", 15)
        expiry = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
        await master_db.tenants.update_one(
            {"_id": tenant_id},
            {"$set": {
                "email_verification_token": token,
                "email_verification_expiry": expiry,
            }}
        )
        owner = tenant.get("owner", {})
        from app.services.email_service import send_verification_email, _fire_email
        _fire_email(send_verification_email(
            to_email=owner.get("email", ""),
            full_name=owner.get("full_name", ""),
            token=token,
            account_type="tenant",
        ))
        return True, "Verification email sent"


# Singleton instance
tenant_service = TenantService()