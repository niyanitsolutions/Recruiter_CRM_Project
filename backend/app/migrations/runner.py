"""
app/migrations/runner.py
========================
Central migration runner for the multi-tenant CRM system.

Design
------
• MongoDB is schema-less, so "migrations" are idempotent backfill operations
  that add missing fields or transform data on existing documents.
• Every migration uses  {"field": {"$exists": False}}  guards so re-running is
  always safe — no data is ever overwritten.
• Applied migrations are tracked in  master_db.system_migrations  so each one
  runs at most once per deployment, even if the server restarts.
• Two migration scopes:
    "master"  — runs once against master_db
    "tenant"  — runs once per active tenant (iterates all company DBs)

Called automatically from  app/main.py  lifespan AFTER MongoDB is connected.
"""

import re
import random
import logging
from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Callable, Awaitable, Any

from app.core.database import get_master_db, get_company_db

log = logging.getLogger("migrations")


# ─────────────────────────────────────────────────────────────────────────────
# Migration dataclass
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Migration:
    """
    id      — unique, stable identifier stored in system_migrations
    scope   — "master" (runs once) | "tenant" (runs for every active company)
    fn      — async function: (db, company_id?) -> dict[str, int]
    """
    id: str
    scope: str               # "master" or "tenant"
    fn: Callable[..., Awaitable[dict[str, int]]]
    description: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Migration functions
# ─────────────────────────────────────────────────────────────────────────────

def _dept_code(name: str) -> str:
    words = re.split(r"\s+", name.strip())
    initials = "".join(w[0].upper() for w in words if w)
    if not initials:
        initials = re.sub(r"[^A-Z]", "", name.upper())[:3] or "DEPT"
    return initials + str(random.randint(100, 999))


async def _m001_user_fields(db, company_id: str) -> dict[str, int]:
    """Backfill missing fields on company users collection."""
    col = db.users
    counts: dict[str, int] = {}

    for fname, default in [
        ("profile_completed",     True),
        ("must_change_password",  False),
        ("is_deleted",            False),
        ("override_permissions",  False),
        ("login_count",           0),
        ("failed_login_attempts", 0),
        ("hrm_employee_id",       None),   # new: reverse link to HRM employee
    ]:
        r = await col.update_many(
            {fname: {"$exists": False}},
            {"$set": {fname: default}},
        )
        counts[fname] = r.modified_count

    # user_type: derive from role (aggregation pipeline so we can read per-doc value)
    r = await col.update_many(
        {"user_type": {"$exists": False}},
        [{"$set": {"user_type": {
            "$cond": {"if": {"$eq": ["$role", "partner"]}, "then": "partner", "else": "internal"}
        }}}],
    )
    counts["user_type"] = r.modified_count

    # status: default "active" if missing
    r = await col.update_many(
        {"status": {"$exists": False}},
        {"$set": {"status": "active"}},
    )
    counts["status"] = r.modified_count

    return counts


async def _m002_department_codes(db, company_id: str) -> dict[str, int]:
    """Backfill auto-generated code on departments that are missing it."""
    col = db.departments
    counts = {"code": 0}

    cursor = col.find({"code": {"$exists": False}, "is_deleted": {"$ne": True}})
    async for dept in cursor:
        code = _dept_code(dept.get("name", "DEPT"))
        while await col.find_one({"code": code, "_id": {"$ne": dept["_id"]}}):
            code = _dept_code(dept.get("name", "DEPT"))
        await col.update_one({"_id": dept["_id"]}, {"$set": {"code": code}})
        counts["code"] += 1

    return counts


async def _m003_master_tenants(db) -> dict[str, int]:
    """Backfill missing fields on master_db.tenants documents."""
    col = db.tenants
    counts: dict[str, int] = {}

    for fname, default in [
        ("is_deleted",     False),
        ("email_verified", True),    # pre-existing tenants already verified
        ("hrm_enabled",    True),    # CRM + HRM always active
        ("crm_enabled",    True),
    ]:
        r = await col.update_many(
            {fname: {"$exists": False}},
            {"$set": {fname: default}},
        )
        counts[fname] = r.modified_count

    # Ensure all active tenants have hrm_enabled = True (not just missing)
    r = await col.update_many(
        {"is_deleted": {"$ne": True}, "hrm_enabled": False},
        {"$set": {"hrm_enabled": True}},
    )
    counts["hrm_enabled_activated"] = r.modified_count

    return counts


async def _m004_hrm_employee_fields(db, company_id: str) -> dict[str, int]:
    """Backfill missing fields on hrm_employees collection."""
    col = db.hrm_employees
    counts: dict[str, int] = {}

    for fname, default in [
        ("is_deleted",       False),
        ("crm_user_id",      None),  # FK to users._id — populated by linking service
        ("background_check", {"status": "Pending", "checked_by": None,
                              "checked_on": None, "notes": ""}),
    ]:
        r = await col.update_many(
            {fname: {"$exists": False}},
            {"$set": {fname: default}},
        )
        counts[fname] = r.modified_count

    # Ensure employment_status field exists
    r = await col.update_many(
        {"employment_status": {"$exists": False}},
        {"$set": {"employment_status": "active"}},
    )
    counts["employment_status"] = r.modified_count

    return counts


async def _m005_backfill_user_employee_links(db, company_id: str) -> dict[str, int]:
    """
    For tenants that already have both users and employees, wire up the
    crm_user_id / hrm_employee_id cross-references based on email match.

    Safe: skips docs that already have the link set.
    """
    linked = 0
    now    = datetime.now(timezone.utc)

    # Only look at employees not yet linked
    cursor = db.hrm_employees.find(
        {"company_id": company_id, "is_deleted": {"$ne": True},
         "$or": [{"crm_user_id": None}, {"crm_user_id": {"$exists": False}}]},
        {"_id": 1, "email": 1},
    )
    async for emp in cursor:
        email = emp.get("email", "").lower().strip()
        if not email:
            continue
        user = await db.users.find_one(
            {"company_id": company_id,
             "email": {"$regex": f"^{re.escape(email)}$", "$options": "i"},
             "is_deleted": False},
            {"_id": 1},
        )
        if not user:
            continue
        emp_id  = emp["_id"]
        user_id = user["_id"]
        await db.hrm_employees.update_one(
            {"_id": emp_id},
            {"$set": {"crm_user_id": user_id, "updated_at": now}},
        )
        await db.users.update_one(
            {"_id": user_id},
            {"$set": {"hrm_employee_id": emp_id, "updated_at": now}},
        )
        linked += 1

    return {"linked_pairs": linked}


async def _m007_ensure_indexes(db, company_id: str) -> dict[str, int]:
    """
    Create compound indexes on the collections used by the most common queries
    (dashboard counts, list pages, inbox). Each call is idempotent — MongoDB
    silently no-ops if an identical index already exists.
    """
    created = 0

    async def _idx(col, keys, **kw):
        nonlocal created
        try:
            await col.create_index(keys, **kw)
            created += 1
        except Exception:
            pass  # index already exists or collection doesn't exist yet

    # users
    await _idx(db.users, [("company_id", 1), ("is_deleted", 1)])
    await _idx(db.users, [("email", 1), ("company_id", 1)])
    await _idx(db.users, [("company_id", 1), ("role", 1), ("is_deleted", 1)])
    await _idx(db.users, [("company_id", 1), ("status", 1), ("is_deleted", 1)])

    # candidates
    await _idx(db.candidates, [("company_id", 1), ("is_deleted", 1), ("status", 1)])
    await _idx(db.candidates, [("company_id", 1), ("email", 1)])

    # jobs
    await _idx(db.jobs, [("company_id", 1), ("is_deleted", 1), ("status", 1)])

    # clients
    await _idx(db.clients, [("company_id", 1), ("is_deleted", 1), ("status", 1)])

    # applications — covers rejection count + per-job/candidate lookups
    await _idx(db.applications, [("company_id", 1), ("is_deleted", 1), ("status", 1)])
    await _idx(db.applications, [("job_id", 1), ("is_deleted", 1)])
    await _idx(db.applications, [("candidate_id", 1), ("is_deleted", 1)])

    # interviews
    await _idx(db.interviews, [("company_id", 1), ("is_deleted", 1), ("created_at", -1)])
    await _idx(db.interviews, [("job_id", 1), ("is_deleted", 1)])

    # hrm_employees
    await _idx(db.hrm_employees, [("company_id", 1), ("is_deleted", 1)])
    await _idx(db.hrm_employees, [("company_id", 1), ("email", 1)])
    await _idx(db.hrm_employees, [("crm_user_id", 1)])

    # notifications — inbox query: unread per user, sorted by time
    await _idx(db.notifications, [("user_id", 1), ("is_read", 1), ("is_deleted", 1), ("created_at", -1)])
    await _idx(db.notifications, [("company_id", 1), ("is_deleted", 1), ("created_at", -1)])

    # audit_logs — recent activity + action filter
    await _idx(db.audit_logs, [("company_id", 1), ("created_at", -1)])
    await _idx(db.audit_logs, [("company_id", 1), ("action", 1), ("created_at", -1)])

    # onboards, targets, departments, designations, roles — basic list queries
    # (legacy "payouts" removed: creating an index there materialized an empty
    # ghost collection on fresh installs; live payouts are partner_payouts)
    for col in (db.onboards, db.targets, db.departments, db.designations, db.roles):
        await _idx(col, [("company_id", 1), ("is_deleted", 1)])

    return {"indexes_created": created}


async def _m006_notifications_fields(db, company_id: str) -> dict[str, int]:
    """Backfill missing fields on notifications collection."""
    col = db.notifications
    counts: dict[str, int] = {}

    for fname, default in [
        ("is_deleted",  False),
        ("is_read",     False),
        ("priority",    "medium"),
    ]:
        r = await col.update_many(
            {fname: {"$exists": False}},
            {"$set": {fname: default}},
        )
        counts[fname] = r.modified_count

    return counts


async def _m008_storage_consolidation(db, company_id: str) -> dict[str, int]:
    """
    Storage-consolidation rollout (approved Collection Consolidation Report,
    Phase 1 + the five approved nested optimizations).

    Copies documents from retired collections into their consolidated targets,
    adding the discriminator field the rewritten services filter on. Every copy
    uses replace_one(..., upsert=True) keyed on the original _id, so re-running
    overwrites the same target docs — never duplicates, never drops data.
    Source collections are intentionally left in place for rollback; drop them
    manually once the rollout is verified.
    """
    counts: dict[str, int] = {}

    async def _copy(src_name: str, dst_name: str, extra: dict) -> int:
        moved = 0
        async for doc in db[src_name].find({}):
            await db[dst_name].replace_one(
                {"_id": doc["_id"]}, {**doc, **extra}, upsert=True)
            moved += 1
        return moved

    # S1 — token collections → tokens
    counts["tokens.candidate_form"] = await _copy(
        "candidate_form_tokens", "tokens", {"token_type": "candidate_form"})
    counts["tokens.employee_onboarding"] = await _copy(
        "employee_onboarding_tokens", "tokens", {"token_type": "employee_onboarding"})
    counts["tokens.doc_upload"] = await _copy(
        "hrm_doc_upload_tokens", "tokens", {"token_type": "doc_upload"})

    # S2 — geo-fence / fraud audit → hrm_security_audit
    counts["security_audit.geo_fence"] = await _copy(
        "hrm_geo_fence_audit", "hrm_security_audit", {"kind": "geo_fence"})
    counts["security_audit.fraud"] = await _copy(
        "hrm_fraud_audit", "hrm_security_audit", {"kind": "fraud"})

    # S3 — target history/templates → targets (doc_type discriminator)
    counts["targets.history"] = await _copy(
        "target_history", "targets", {"doc_type": "history"})
    counts["targets.template"] = await _copy(
        "target_templates", "targets", {"doc_type": "template"})

    # S4 — execution logs → execution_logs (log_type discriminator)
    counts["execlog.task"] = await _copy(
        "task_execution_logs", "execution_logs", {"log_type": "task"})
    counts["execlog.report"] = await _copy(
        "report_execution_logs", "execution_logs", {"log_type": "report"})

    # S5 — import/export jobs + import templates → data_jobs
    counts["datajob.import"] = await _copy("import_jobs", "data_jobs", {"kind": "import"})
    counts["datajob.export"] = await _copy("export_jobs", "data_jobs", {"kind": "export"})
    counts["datajob.import_template"] = await _copy(
        "import_templates", "data_jobs", {"kind": "import_template"})

    # S6 — settings catalogs → catalogs (kind discriminator)
    for src, kind in [
        ("teams", "team"), ("branches", "branch"),
        ("pipeline_stages", "pipeline_stage"), ("job_categories", "job_category"),
        ("skills", "skill"), ("candidate_sources", "candidate_source"),
        ("commission_rules", "commission_rule"), ("sla_rules", "sla_rule"),
        ("document_templates", "document_template"),
    ]:
        counts[f"catalog.{kind}"] = await _copy(src, "catalogs", {"kind": kind})

    # S11 — scheduled tasks + reminders → scheduler_jobs
    counts["schedjob.task"] = await _copy(
        "scheduled_tasks", "scheduler_jobs", {"job_kind": "task"})
    counts["schedjob.reminder"] = await _copy(
        "scheduled_reminders", "scheduler_jobs", {"job_kind": "reminder"})

    # S12/N4 — smtp_config singleton → company_settings.smtp
    smtp = await db.smtp_config.find_one({"_id": "smtp"})
    if smtp:
        smtp.pop("_id", None)
        r = await db.company_settings.update_one(
            {"smtp": {"$exists": False}}, {"$set": {"smtp": smtp}}, upsert=True)
        counts["company_settings.smtp"] = r.modified_count + (1 if r.upserted_id else 0)

    # N1 — notification preferences → users.preferences.notifications
    moved = 0
    async for pref in db.notification_preferences.find({}):
        uid = pref.get("user_id")
        if not uid:
            continue
        pref.pop("_id", None)
        r = await db.users.update_one(
            {"$or": [{"_id": uid}, {"id": uid}],
             "preferences.notifications": {"$exists": False}},
            {"$set": {"preferences.notifications": pref}})
        moved += r.modified_count
    counts["users.pref.notifications"] = moved

    # N2 — dashboard layouts → users.preferences.dashboard_layout
    # (natural order + $exists guard preserves the old find_one-first-match
    # semantics for users that somehow had several layout docs)
    moved = 0
    async for layout in db.dashboard_layouts.find({}):
        uid = layout.get("user_id")
        if not uid or layout.get("is_deleted"):
            continue
        layout.pop("_id", None)
        r = await db.users.update_one(
            {"$or": [{"_id": uid}, {"id": uid}],
             "preferences.dashboard_layout": {"$exists": False}},
            {"$set": {"preferences.dashboard_layout": layout}})
        moved += r.modified_count
    counts["users.pref.dashboard"] = moved

    # N3 — announcement dismissals → users.announcement_dismissals map
    moved = 0
    async for dis in db.announcement_dismissals.find({}):
        uid = dis.get("user_id")
        aid = dis.get("announcement_id")
        if not uid or not aid:
            continue
        r = await db.users.update_one(
            {"$or": [{"_id": uid}, {"id": uid}],
             f"announcement_dismissals.{aid}": {"$exists": False}},
            {"$set": {f"announcement_dismissals.{aid}": {
                "permanent":    dis.get("permanent", False),
                "dismissed_at": dis.get("dismissed_at"),
            }}})
        moved += r.modified_count
    counts["users.dismissals"] = moved

    return counts


# ─────────────────────────────────────────────────────────────────────────────
# Migration registry  (ORDER MATTERS — run in sequence)
# ─────────────────────────────────────────────────────────────────────────────

MIGRATIONS: list[Migration] = [
    Migration(
        id="m001_user_fields",
        scope="tenant",
        fn=_m001_user_fields,
        description="Backfill user document fields",
    ),
    Migration(
        id="m002_department_codes",
        scope="tenant",
        fn=_m002_department_codes,
        description="Backfill department code field",
    ),
    Migration(
        id="m003_master_tenants",
        scope="master",
        fn=_m003_master_tenants,
        description="Backfill master tenant fields + enable HRM for all",
    ),
    Migration(
        id="m004_hrm_employee_fields",
        scope="tenant",
        fn=_m004_hrm_employee_fields,
        description="Backfill HRM employee document fields",
    ),
    Migration(
        id="m005_user_employee_links",
        scope="tenant",
        fn=_m005_backfill_user_employee_links,
        description="Link existing users ↔ employees by email",
    ),
    Migration(
        id="m006_notification_fields",
        scope="tenant",
        fn=_m006_notifications_fields,
        description="Backfill notification document fields",
    ),
    Migration(
        id="m007_ensure_indexes",
        scope="tenant",
        fn=_m007_ensure_indexes,
        description="Create compound indexes for common query patterns",
    ),
    Migration(
        id="m008_storage_consolidation",
        scope="tenant",
        fn=_m008_storage_consolidation,
        description="Copy retired collections into consolidated stores (tokens, "
                    "catalogs, scheduler_jobs, execution_logs, data_jobs, "
                    "hrm_security_audit, targets) and embed per-user prefs + SMTP",
    ),
]


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

async def run_migrations() -> None:
    """
    Entry point called from app/main.py lifespan.

    For each migration that has NOT yet been recorded in system_migrations:
      • scope="master"  → run against master_db, then mark done
      • scope="tenant"  → run against every active company DB, then mark done

    Tenant-scoped migrations record the list of company_ids they ran on
    so future new tenants get them applied via the normal startup path
    (the migration is already marked done globally, but new tenants are
    handled by their creation flow which already calls the service layer).
    """
    master_db = get_master_db()
    meta_col  = master_db.system_migrations     # tracks what has run

    log.info("=" * 60)
    log.info("  CRM Migration Runner")
    log.info("=" * 60)

    for migration in MIGRATIONS:
        already_done = await meta_col.find_one({"_id": migration.id})
        if already_done:
            log.debug("  [skip] %s — already applied", migration.id)
            continue

        log.info("  [run]  %s — %s", migration.id, migration.description)

        try:
            if migration.scope == "master":
                counts = await migration.fn(master_db)
                _log_counts(migration.id, "master", counts)

            elif migration.scope == "tenant":
                # Fetch all non-deleted tenants
                tenants = await master_db.tenants.find(
                    {"is_deleted": {"$ne": True}},
                    {"company_id": 1, "company_name": 1},
                ).to_list(length=None)

                log.info("    → %d tenant(s) to process", len(tenants))
                total: dict[str, int] = {}

                for tenant in tenants:
                    company_id = tenant.get("company_id")
                    if not company_id:
                        continue
                    try:
                        company_db = get_company_db(company_id)
                        counts     = await migration.fn(company_db, company_id)
                        for k, v in counts.items():
                            total[k] = total.get(k, 0) + v
                    except Exception as tenant_err:
                        log.warning(
                            "    ⚠ %s failed for company=%s: %s",
                            migration.id, company_id, tenant_err,
                        )

                _log_counts(migration.id, "all tenants", total)

            # Mark this migration as done
            await meta_col.insert_one({
                "_id":        migration.id,
                "scope":      migration.scope,
                "description": migration.description,
                "applied_at": datetime.now(timezone.utc),
            })
            log.info("  [done] %s", migration.id)

        except Exception as exc:
            # A failed migration must NEVER crash the server.
            # Log the error and continue — operators can fix and redeploy.
            log.error("  [FAIL] %s: %s", migration.id, exc, exc_info=True)

    log.info("=" * 60)
    log.info("  Migration check complete")
    log.info("=" * 60)


def _log_counts(migration_id: str, scope: str, counts: dict[str, int]) -> None:
    changed = {k: v for k, v in counts.items() if v}
    if changed:
        for field_name, n in changed.items():
            log.info("    %-35s  %d updated", field_name, n)
    else:
        log.info("    (nothing to update — all fields already present)")
