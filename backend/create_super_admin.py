#!/usr/bin/env python3
"""
Super Admin Creation Utility
─────────────────────────────
Creates a super admin account in master_db.super_admins.

Usage (from /backend directory):
    python create_super_admin.py
    python create_super_admin.py --username admin --email admin@example.com --name "Admin" --password "Secret123!"

The script:
  - Reads MONGODB_URI and MASTER_DB_NAME from .env (or environment)
  - Hashes the password with bcrypt (same rounds as app)
  - Inserts into master_db.super_admins
  - Prints the exact document that was inserted
"""

import asyncio
import argparse
import uuid
import sys
import os
from datetime import datetime, timezone
from getpass import getpass

# ── allow running from the /backend directory without installing the package ──
sys.path.insert(0, os.path.dirname(__file__))

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()  # load .env from cwd

# ── config ────────────────────────────────────────────────────────────────────
MONGODB_URI    = os.getenv("MONGODB_URI",    "mongodb://localhost:27017")
MASTER_DB_NAME = os.getenv("MASTER_DB_NAME", "master_db")
BCRYPT_ROUNDS  = int(os.getenv("BCRYPT_ROUNDS", "12"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=BCRYPT_ROUNDS)


def prompt_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a Super Admin account")
    parser.add_argument("--username", help="Login username")
    parser.add_argument("--email",    help="Email address")
    parser.add_argument("--name",     help="Full name")
    parser.add_argument("--password", help="Password (min 8 chars). Omit to be prompted securely.")
    parser.add_argument("--primary",  action="store_true", default=True,
                        help="Mark as primary super admin (default: true)")
    return parser.parse_args()


async def run(args: argparse.Namespace) -> None:
    # ── gather missing fields interactively ──────────────────────────────────
    username = args.username or input("Username : ").strip()
    email    = args.email    or input("Email    : ").strip()
    name     = args.name     or input("Full name: ").strip()

    if args.password:
        password = args.password
    else:
        password = getpass("Password : ")
        confirm  = getpass("Confirm  : ")
        if password != confirm:
            print("ERROR: Passwords do not match.")
            sys.exit(1)

    if len(password) < 8:
        print("ERROR: Password must be at least 8 characters.")
        sys.exit(1)

    if not username or not email or not name:
        print("ERROR: Username, email, and name are required.")
        sys.exit(1)

    # ── connect ───────────────────────────────────────────────────────────────
    print(f"\nConnecting to MongoDB: {MONGODB_URI[:40]}...")
    client    = AsyncIOMotorClient(MONGODB_URI)
    master_db = client[MASTER_DB_NAME]

    # ── check for duplicates ──────────────────────────────────────────────────
    existing = await master_db.super_admins.find_one({
        "$or": [{"username": username}, {"email": email}],
        "is_deleted": False,
    })
    if existing:
        print(f"\nERROR: A super admin with username '{username}' or email '{email}' already exists.")
        print(f"       Existing: username={existing.get('username')}  email={existing.get('email')}")
        client.close()
        sys.exit(1)

    # ── build document ────────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    doc = {
        "_id":                   str(uuid.uuid4()),
        "username":              username,
        "email":                 email,
        "full_name":             name,
        "mobile":                None,
        "password_hash":         pwd_context.hash(password),
        "status":                "active",      # MUST be "active" for login to work
        "is_primary":            args.primary,
        "is_deleted":            False,
        "deleted_at":            None,
        "permissions": [
            "tenants:read",
            "tenants:write",
            "tenants:delete",
            "plans:read",
            "plans:write",
            "payments:read",
            "analytics:read",
            "super_admins:read",
        ],
        "last_login":            None,
        "last_login_ip":         None,
        "failed_login_attempts": 0,
        "locked_until":          None,
        "created_at":            now,
        "updated_at":            now,
        "created_by":            "create_super_admin.py",
    }

    # ── insert ────────────────────────────────────────────────────────────────
    await master_db.super_admins.insert_one(doc)
    client.close()

    # ── report ────────────────────────────────────────────────────────────────
    print("\n✅  Super admin created successfully!")
    print(f"    _id      : {doc['_id']}")
    print(f"    username : {doc['username']}")
    print(f"    email    : {doc['email']}")
    print(f"    full_name: {doc['full_name']}")
    print(f"    status   : {doc['status']}")
    print(f"    primary  : {doc['is_primary']}")
    print(f"\nLogin with:  identifier='{username}'  password='<what you set>'")
    print(f"Endpoint:    POST /api/v1/auth/login")
    print(f'Payload:     {{"identifier": "{username}", "password": "..."}}\n')


if __name__ == "__main__":
    asyncio.run(run(prompt_args()))
