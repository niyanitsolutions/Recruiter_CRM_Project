"""
MongoDB index initialization.

Called once at application startup (from lifespan). Idempotent — Motor's
create_index() is a no-op when the index already exists, so re-runs are safe.

Covers every collection that appears in hot query paths identified during
the performance audit. Only indexes with real query coverage are created.
"""
import logging
from pymongo import ASCENDING, DESCENDING, IndexModel

logger = logging.getLogger(__name__)


async def _ensure_applications_indexes(db) -> None:
    """
    Applications needs a drop-then-create (the drop must happen before the
    create, so this stays sequential internally), isolated in its own
    try/except: the uniqueness guard (candidate_id + job_id, active docs
    only) is a correctness-critical duplicate-application safeguard and must
    not be skipped just because some other collection's index call fails.

    The uniqueness guard must only cover ACTIVE applications: a soft-deleted
    application must not block the candidate from re-applying. Drop the old
    full-collection unique index if present, then create the partial one.
    """
    try:
        existing_app_indexes = await db["applications"].index_information()
        if "app_cand_job" in existing_app_indexes:
            await db["applications"].drop_index("app_cand_job")
    except Exception as exc:
        logger.warning("Could not drop legacy app_cand_job index: %s", exc)

    await db["applications"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("job_id", ASCENDING), ("status", ASCENDING)],
                   name="app_job_status"),
        IndexModel([("candidate_id", ASCENDING), ("job_id", ASCENDING)],
                   name="app_cand_job_active", unique=True,
                   partialFilterExpression={"is_deleted": False}),
    ])


async def ensure_company_indexes(db) -> None:
    """
    Create / verify indexes on all company-scoped collections.

    Every collection's create_indexes() call is independent of every other
    collection's — they touch different collections and none of them reads
    or depends on another's result — so they all run concurrently via
    asyncio.gather instead of one sequential await per collection. This also
    removes the old ordering hazard where a legacy index-name conflict on one
    collection would abort every collection queued after it: under gather, a
    failure in one task does not stop the others from completing.
    """
    # Plain (collection_name, index_models) pairs — each is independent, so a
    # single gather covers all of them. hrm_jobs / hrm_candidates /
    # hrm_payslips added: these are read directly by the HRM dashboard
    # (hrm_dashboard_service.py) but previously had no index anywhere.
    plain_collections: dict = {
        "hrm_employees": [
            IndexModel([("company_id", ASCENDING), ("is_deleted", ASCENDING), ("employment_status", ASCENDING)],
                       name="emp_company_status"),
            IndexModel([("company_id", ASCENDING), ("crm_user_id", ASCENDING)],
                       name="emp_crm_user"),
            IndexModel([("company_id", ASCENDING), ("department", ASCENDING)],
                       name="emp_dept"),
            # Guards against the auto-create-on-first-checkin race in
            # hrm_attendance.py's _resolve_emp_id(): concurrent first punch-ins
            # for the same user could otherwise each pass a "no profile yet"
            # check before any of them commits, creating duplicate profiles.
            # $exists:true keeps this from applying to legacy docs with no
            # crm_user_id (e.g. partner-created profiles never linked to a
            # CRM login).
            IndexModel([("company_id", ASCENDING), ("crm_user_id", ASCENDING)],
                       name="emp_crm_user_unique", unique=True,
                       partialFilterExpression={"crm_user_id": {"$exists": True}}),
        ],
        "hrm_attendance": [
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("date", DESCENDING)],
                       name="att_emp_date"),
            IndexModel([("company_id", ASCENDING), ("date", DESCENDING), ("status", ASCENDING)],
                       name="att_date_status"),
            IndexModel([("company_id", ASCENDING), ("date", DESCENDING), ("check_in", ASCENDING)],
                       name="att_date_checkin"),
            # Unique guard: one attendance record per employee per day
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("date", ASCENDING)],
                       name="att_unique_emp_day", unique=True, sparse=True),
        ],
        "hrm_leaves": [
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)],
                       name="leave_emp_status"),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("from_date", ASCENDING)],
                       name="leave_status_date"),
        ],
        "hrm_payroll": [
            IndexModel([("company_id", ASCENDING), ("month", ASCENDING), ("year", ASCENDING)],
                       name="payroll_period"),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("year", DESCENDING), ("month", DESCENDING)],
                       name="payroll_emp_period"),
        ],
        "hrm_holidays": [
            IndexModel([("company_id", ASCENDING), ("date", ASCENDING), ("is_active", ASCENDING)],
                       name="holiday_date"),
        ],
        "hrm_announcements": [
            IndexModel([("company_id", ASCENDING), ("is_active", ASCENDING), ("created_at", DESCENDING)],
                       name="ann_active_date"),
        ],
        "hrm_performance": [
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)],
                       name="perf_emp_status"),
        ],
        "hrm_documents": [
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING)],
                       name="doc_emp"),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("doc_type", ASCENDING)],
                       name="doc_emp_type"),
        ],
        "hrm_assets": [
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING)],
                       name="asset_assignee"),
            IndexModel([("company_id", ASCENDING), ("asset_tag", ASCENDING)],
                       name="asset_tag", unique=True, sparse=True),
        ],
        "hrm_exit_requests": [
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)],
                       name="exit_status"),
        ],
        # Read at login time by attendance_login_validator.py for
        # geofence/IP-restriction tenants — had zero indexes.
        "hrm_attendance_exceptions": [
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING),
                        ("is_deleted", ASCENDING), ("allow_login", ASCENDING)],
                       name="attexc_emp_login"),
        ],
        "hrm_work_mode_requests": [
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)],
                       name="workmode_emp_status"),
        ],
        "hrm_jobs": [
            IndexModel([("company_id", ASCENDING), ("is_deleted", ASCENDING), ("status", ASCENDING)],
                       name="hrmjob_status"),
        ],
        "hrm_candidates": [
            IndexModel([("company_id", ASCENDING), ("is_deleted", ASCENDING), ("current_stage", ASCENDING)],
                       name="hrmcand_stage"),
        ],
        "hrm_payslips": [
            IndexModel([("company_id", ASCENDING), ("year", ASCENDING), ("month", ASCENDING)],
                       name="payslip_period"),
        ],
        "candidates": [
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                       name="cand_status_date"),
            IndexModel([("company_id", ASCENDING), ("email", ASCENDING)],
                       name="cand_email"),
        ],
        "jobs": [
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                       name="job_status_date"),
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING)],
                       name="job_client"),
        ],
        "interviews": [
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("scheduled_date", DESCENDING)],
                       name="interview_status_date"),
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING)],
                       name="interview_candidate"),
        ],
        "onboards": [
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                       name="onboard_status_date"),
            IndexModel([("company_id", ASCENDING), ("partner_id", ASCENDING)],
                       name="onboard_partner"),
        ],
        "partner_payouts": [
            IndexModel([("company_id", ASCENDING), ("partner_id", ASCENDING), ("status", ASCENDING)],
                       name="payout_partner_status"),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)],
                       name="payout_status"),
        ],
        "partner_invoices": [
            IndexModel([("company_id", ASCENDING), ("partner_id", ASCENDING), ("status", ASCENDING)],
                       name="invoice_partner_status"),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                       name="invoice_status_date"),
        ],
        "users": [
            IndexModel([("company_id", ASCENDING), ("role", ASCENDING), ("is_deleted", ASCENDING)],
                       name="user_role"),
            IndexModel([("company_id", ASCENDING), ("email", ASCENDING)],
                       name="user_email"),
        ],
        "audit_logs": [
            IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)],
                       name="audit_date"),
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("created_at", DESCENDING)],
                       name="audit_user_date"),
        ],
        # login_logs — read by auth.py's login-activity/summary/analytics/
        # history endpoints, sorted by login_time and filtered by user_id;
        # had zero indexes.
        "login_logs": [
            IndexModel([("login_time", DESCENDING)], name="loginlog_date"),
            IndexModel([("user_id", ASCENDING), ("login_time", DESCENDING)], name="loginlog_user_date"),
        ],
        "clients": [
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)],
                       name="client_status"),
        ],
        # company_settings (singleton per tenant — already tiny): no indexes
        # needed; find_one({}) on a tiny collection is instant.
    }

    import asyncio
    await asyncio.gather(
        _ensure_applications_indexes(db),
        *[db[name].create_indexes(models) for name, models in plain_collections.items()],
    )


async def ensure_master_indexes(master_db) -> None:
    """Create / verify indexes on master-database collections."""

    # ── tenants ────────────────────────────────────────────────────────────────
    await master_db["tenants"].create_indexes([
        IndexModel([("company_id", ASCENDING)], name="tenant_company_id", unique=True, sparse=True),
        IndexModel([("status", ASCENDING)], name="tenant_status"),
        IndexModel([("owner.email", ASCENDING)], name="tenant_owner_email"),
        # Legacy login fallback path ($or on username/email/mobile) only had
        # owner.email indexed — these two were full collection scans.
        IndexModel([("owner.username", ASCENDING)], name="tenant_owner_username"),
        IndexModel([("owner.mobile", ASCENDING)], name="tenant_owner_mobile"),
    ])

    # ── pending_registrations ───────────────────────────────────────────────────
    # Queried by email/username/contact_number+status on every signup attempt
    # (check_unique_fields) and by verification_token on email verification —
    # had zero indexes.
    await master_db["pending_registrations"].create_indexes([
        IndexModel([("email", ASCENDING), ("status", ASCENDING)], name="pendreg_email_status"),
        IndexModel([("contact_number", ASCENDING), ("status", ASCENDING)], name="pendreg_mobile_status"),
        IndexModel([("username", ASCENDING), ("status", ASCENDING)], name="pendreg_username_status"),
        IndexModel([("verification_token", ASCENDING)], name="pendreg_token", sparse=True),
    ])

    # ── users (global / super-admin) ───────────────────────────────────────────
    await master_db["users"].create_indexes([
        IndexModel([("email", ASCENDING)], name="global_user_email", unique=True, sparse=True),
    ])

    # ── commissions ────────────────────────────────────────────────────────────
    await master_db["commissions"].create_indexes([
        IndexModel([("seller_id", ASCENDING), ("status", ASCENDING)],
                   name="commission_seller_status"),
        IndexModel([("tenant_id", ASCENDING)], name="commission_tenant"),
    ])

    # ── payments ───────────────────────────────────────────────────────────────
    await master_db["payments"].create_indexes([
        IndexModel([("tenant_id", ASCENDING), ("status", ASCENDING)],
                   name="payment_tenant_status"),
        IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)],
                   name="payment_company_date"),
        IndexModel([("transaction_id", ASCENDING)],
                   name="payment_txn", unique=True, sparse=True),
        # Webhook lookup paths — every webhook event hits these two fields
        IndexModel([("razorpay_order_id", ASCENDING)],
                   name="payment_rzp_order", sparse=True),
        IndexModel([("razorpay_payment_id", ASCENDING)],
                   name="payment_rzp_payment", sparse=True),
        # Compound index used by duplicate-order guard in create_razorpay_order()
        # Query: {tenant_id, plan_id, payment_type, status, created_at: {$gte: ...}}
        IndexModel(
            [("tenant_id", ASCENDING), ("plan_id", ASCENDING),
             ("payment_type", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
            name="payment_dedup_guard",
        ),
        # Used by get_revenue_stats() monthly aggregation filter
        IndexModel([("payment_date", DESCENDING)], name="payment_date_desc", sparse=True),
    ])

    # ── webhook_events ─────────────────────────────────────────────────────────
    # _id is already a unique index (it holds the event_key used for dedup).
    # The additional indexes below support audit queries and support lookups.
    await master_db["webhook_events"].create_indexes([
        IndexModel([("provider", ASCENDING), ("event", ASCENDING), ("received_at", DESCENDING)],
                   name="wh_provider_event_date"),
        IndexModel([("tenant_id", ASCENDING), ("received_at", DESCENDING)],
                   name="wh_tenant_date"),
        IndexModel([("razorpay_payment_id", ASCENDING)],
                   name="wh_rzp_payment", sparse=True),
        IndexModel([("razorpay_order_id", ASCENDING)],
                   name="wh_rzp_order", sparse=True),
        IndexModel([("status", ASCENDING), ("received_at", DESCENDING)],
                   name="wh_status_date"),
        # TTL: auto-expire events after 90 days — prevents unbounded collection growth
        IndexModel([("received_at", ASCENDING)], name="wh_ttl", expireAfterSeconds=90 * 24 * 3600),
    ])

    # ── sellers ────────────────────────────────────────────────────────────────
    await master_db["sellers"].create_indexes([
        IndexModel([("email", ASCENDING)], name="seller_email", unique=True, sparse=True),
    ])

    # ── subscription_queue ─────────────────────────────────────────────────────
    # Queued-plan lookups: per-tenant status queries (login lazy activation,
    # overview endpoint) and the hourly due-activation sweep.
    await master_db["subscription_queue"].create_indexes([
        IndexModel([("tenant_id", ASCENDING), ("status", ASCENDING), ("activation_date", ASCENDING)],
                   name="subq_tenant_status_date"),
        IndexModel([("status", ASCENDING), ("activation_date", ASCENDING)],
                   name="subq_status_date"),
    ])


async def init_all_indexes(app_db_factory, master_db) -> None:
    """
    Entry point called from application lifespan.
    `app_db_factory` is not used here — company indexes are created lazily
    per-tenant when needed (each tenant DB shares the same schema).
    For now we initialize indexes on a template / first available company DB
    if accessible, but primarily ensure master DB indexes are ready.
    """
    try:
        await ensure_master_indexes(master_db)
        logger.info("Master DB indexes verified/created.")
    except Exception as exc:
        logger.warning("Index init failed (non-fatal): %s", exc)
