"""
Global User Model  (master_db.global_users)
============================================
Single identity record per real person across all companies.

WHY THIS EXISTS
---------------
Previously every company database held its own copy of
username/email/password.  Authenticating a person with no company_code
required scanning every company database – O(N tenants).

With global_users:
  • Email / mobile are the unique global identifiers.
  • Password is verified here (ONE query, O(1)).
  • user_company_map maps this identity → specific company + role.
  • company_db.users keeps the full profile (UNCHANGED).

WHAT THIS IS NOT
----------------
• It does NOT replace company_db.users (profiles stay there).
• It does NOT change the JWT structure.
• It does NOT change the permission system.
• It does NOT affect subscription validation.
"""

from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, EmailStr
import uuid


class GlobalUser(BaseModel):
    """
    Collection: master_db.global_users

    Required indexes (create once via migration or startup):
        { email:  1 }   unique=True,  collation: locale="en", strength=2 (case-insensitive)
        { mobile: 1 }   unique=True,  sparse=True
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    email: str                          # globally unique, lowercase-normalised
    mobile: Optional[str] = None        # globally unique when present
    password_hash: str                  # bcrypt; updated on every password change
    is_active: bool = True              # False blocks all company logins immediately
    failed_login_attempts: int = 0      # incremented on bad password in global path
    last_login: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        populate_by_name = True


class UserCompanyMap(BaseModel):
    """
    Collection: master_db.user_company_map

    One row per (global_user, company) pair.
    A user in three companies has three rows here.

    Required indexes:
        { global_user_id: 1, company_id: 1 }  unique=True
        { global_user_id: 1 }                  (for fast per-user lookup)
        { local_user_id:  1, company_id: 1 }   (for password-change sync)
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")

    # ── identity reference ────────────────────────────────────────────────────
    global_user_id: str     # FK → master_db.global_users._id

    # ── company reference ─────────────────────────────────────────────────────
    company_id: str         # FK → master_db.tenants.company_id
    local_user_id: str      # = company_db.users._id  (used as JWT "sub")

    # ── company-specific role ─────────────────────────────────────────────────
    role: str               # admin | candidate_coordinator | hr | … (company-specific)
    is_owner: bool = False  # True for the company owner

    # ── membership status ─────────────────────────────────────────────────────
    # "active"   – user is a current member of this company
    # "inactive" – user was removed (soft); excluded from login company list
    status: str = "active"

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        populate_by_name = True


# ── Convenience helpers ───────────────────────────────────────────────────────

async def ensure_global_indexes(master_db) -> None:
    """
    Idempotent – safe to call on every startup.
    Creates the required indexes on global_users and user_company_map.
    """
    # global_users.email – case-insensitive unique
    await master_db.global_users.create_index(
        [("email", 1)],
        unique=True,
        name="email_unique_ci",
        collation={"locale": "en", "strength": 2},
    )
    # global_users.mobile – sparse unique (not every user has a mobile)
    await master_db.global_users.create_index(
        [("mobile", 1)],
        unique=True,
        sparse=True,
        name="mobile_unique_sparse",
    )
    # user_company_map compound unique
    await master_db.user_company_map.create_index(
        [("global_user_id", 1), ("company_id", 1)],
        unique=True,
        name="ucm_user_company_unique",
    )
    # user_company_map lookup by global_user_id
    await master_db.user_company_map.create_index(
        [("global_user_id", 1)],
        name="ucm_global_user_idx",
    )
    # user_company_map lookup by local_user_id + company_id (password-change sync)
    await master_db.user_company_map.create_index(
        [("local_user_id", 1), ("company_id", 1)],
        name="ucm_local_company_idx",
    )


async def upsert_global_user(
    master_db,
    *,
    email: str,
    mobile: Optional[str],
    password_hash: str,
) -> str:
    """
    Idempotent global-user record creator.

    • If a record for this email already exists, update its password_hash and
      mobile (so a re-registration or admin password-reset keeps everything in sync).
    • If no record exists, create one.

    Returns the global_user _id (str).
    """
    email_normalized = email.lower().strip()
    existing = await master_db.global_users.find_one({"email": email_normalized})
    if existing:
        await master_db.global_users.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "password_hash": password_hash,
                "mobile": mobile,
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        return str(existing["_id"])

    global_user_id = str(uuid.uuid4())
    await master_db.global_users.insert_one({
        "_id":                   global_user_id,
        "email":                 email_normalized,
        "mobile":                mobile,
        "password_hash":         password_hash,
        "is_active":             True,
        "failed_login_attempts": 0,
        "last_login":            None,
        "created_at":            datetime.now(timezone.utc),
        "updated_at":            datetime.now(timezone.utc),
    })
    return global_user_id


async def ensure_user_company_map(
    master_db,
    *,
    global_user_id: str,
    company_id: str,
    local_user_id: str,
    role: str,
    is_owner: bool = False,
) -> None:
    """
    Idempotent user_company_map record creator.

    Uses upsert with $setOnInsert so calling this multiple times for the
    same (global_user_id, company_id) pair is safe.
    """
    await master_db.user_company_map.update_one(
        {"global_user_id": global_user_id, "company_id": company_id},
        {"$setOnInsert": {
            "_id":            str(uuid.uuid4()),
            "global_user_id": global_user_id,
            "company_id":     company_id,
            "local_user_id":  local_user_id,
            "role":           role,
            "is_owner":       is_owner,
            "status":         "active",
            "created_at":     datetime.now(timezone.utc),
        }},
        upsert=True,
    )


async def sync_global_password(
    master_db,
    *,
    email: str,
    new_password_hash: str,
) -> None:
    """
    Sync a changed password into global_users.
    Called whenever company_db.users.password_hash is updated.
    Safe to call even if the record doesn't exist yet (no-op).
    """
    email_normalized = email.lower().strip()
    await master_db.global_users.update_one(
        {"email": email_normalized},
        {"$set": {
            "password_hash": new_password_hash,
            "updated_at":    datetime.now(timezone.utc),
        }},
    )
