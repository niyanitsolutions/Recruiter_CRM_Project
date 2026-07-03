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


async def ensure_company_indexes(db) -> None:
    """Create / verify indexes on all company-scoped collections."""

    # ── applications ───────────────────────────────────────────────────────────
    # Deliberately created FIRST: none of the calls below are isolated from
    # each other (no per-collection try/except), so a legacy index-name
    # conflict on any later collection aborts everything after it. The
    # applications uniqueness guard (candidate_id + job_id, active docs only)
    # is a correctness-critical duplicate-application safeguard, so it must
    # not be starved by an unrelated collection's index drift.
    #
    # The uniqueness guard must only cover ACTIVE applications: a soft-deleted
    # application must not block the candidate from re-applying. Drop the old
    # full-collection unique index if present, then create the partial one.
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

    # ── hrm_employees ──────────────────────────────────────────────────────────
    await db["hrm_employees"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("is_deleted", ASCENDING), ("employment_status", ASCENDING)],
                   name="emp_company_status"),
        IndexModel([("company_id", ASCENDING), ("crm_user_id", ASCENDING)],
                   name="emp_crm_user"),
        IndexModel([("company_id", ASCENDING), ("department", ASCENDING)],
                   name="emp_dept"),
    ])

    # ── hrm_attendance ─────────────────────────────────────────────────────────
    await db["hrm_attendance"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("date", DESCENDING)],
                   name="att_emp_date"),
        IndexModel([("company_id", ASCENDING), ("date", DESCENDING), ("status", ASCENDING)],
                   name="att_date_status"),
        IndexModel([("company_id", ASCENDING), ("date", DESCENDING), ("check_in", ASCENDING)],
                   name="att_date_checkin"),
        # Unique guard: one attendance record per employee per day
        IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("date", ASCENDING)],
                   name="att_unique_emp_day", unique=True, sparse=True),
    ])

    # ── hrm_leaves ─────────────────────────────────────────────────────────────
    await db["hrm_leaves"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)],
                   name="leave_emp_status"),
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("from_date", ASCENDING)],
                   name="leave_status_date"),
    ])

    # ── hrm_payroll ────────────────────────────────────────────────────────────
    await db["hrm_payroll"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("month", ASCENDING), ("year", ASCENDING)],
                   name="payroll_period"),
        IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("year", DESCENDING), ("month", DESCENDING)],
                   name="payroll_emp_period"),
    ])

    # ── hrm_holidays ───────────────────────────────────────────────────────────
    await db["hrm_holidays"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("date", ASCENDING), ("is_active", ASCENDING)],
                   name="holiday_date"),
    ])

    # ── hrm_announcements ──────────────────────────────────────────────────────
    await db["hrm_announcements"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("is_active", ASCENDING), ("created_at", DESCENDING)],
                   name="ann_active_date"),
    ])

    # ── hrm_performance ────────────────────────────────────────────────────────
    await db["hrm_performance"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)],
                   name="perf_emp_status"),
    ])

    # ── hrm_documents ──────────────────────────────────────────────────────────
    await db["hrm_documents"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING)],
                   name="doc_emp"),
        IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("doc_type", ASCENDING)],
                   name="doc_emp_type"),
    ])

    # ── hrm_assets ─────────────────────────────────────────────────────────────
    await db["hrm_assets"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING)],
                   name="asset_assignee"),
        IndexModel([("company_id", ASCENDING), ("asset_tag", ASCENDING)],
                   name="asset_tag", unique=True, sparse=True),
    ])

    # ── hrm_exit_requests ──────────────────────────────────────────────────────
    await db["hrm_exit_requests"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING)],
                   name="exit_status"),
    ])

    # ── candidates ─────────────────────────────────────────────────────────────
    await db["candidates"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                   name="cand_status_date"),
        IndexModel([("company_id", ASCENDING), ("email", ASCENDING)],
                   name="cand_email"),
    ])

    # ── jobs ───────────────────────────────────────────────────────────────────
    await db["jobs"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                   name="job_status_date"),
        IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING)],
                   name="job_client"),
    ])

    # ── interviews ─────────────────────────────────────────────────────────────
    await db["interviews"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("scheduled_date", DESCENDING)],
                   name="interview_status_date"),
        IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING)],
                   name="interview_candidate"),
    ])

    # ── onboards ───────────────────────────────────────────────────────────────
    await db["onboards"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                   name="onboard_status_date"),
        IndexModel([("company_id", ASCENDING), ("partner_id", ASCENDING)],
                   name="onboard_partner"),
    ])

    # ── partner_payouts ────────────────────────────────────────────────────────
    await db["partner_payouts"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("partner_id", ASCENDING), ("status", ASCENDING)],
                   name="payout_partner_status"),
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING)],
                   name="payout_status"),
    ])

    # ── partner_invoices ───────────────────────────────────────────────────────
    await db["partner_invoices"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("partner_id", ASCENDING), ("status", ASCENDING)],
                   name="invoice_partner_status"),
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                   name="invoice_status_date"),
    ])

    # ── users ──────────────────────────────────────────────────────────────────
    await db["users"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("role", ASCENDING), ("is_deleted", ASCENDING)],
                   name="user_role"),
        IndexModel([("company_id", ASCENDING), ("email", ASCENDING)],
                   name="user_email"),
    ])

    # ── audit_logs ─────────────────────────────────────────────────────────────
    await db["audit_logs"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)],
                   name="audit_date"),
        IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("created_at", DESCENDING)],
                   name="audit_user_date"),
    ])

    # ── clients ────────────────────────────────────────────────────────────────
    await db["clients"].create_indexes([
        IndexModel([("company_id", ASCENDING), ("status", ASCENDING)],
                   name="client_status"),
    ])

    # ── company_settings (singleton per tenant — already tiny) ────────────────
    # No indexes needed; find_one({}) on a tiny collection is instant.


async def ensure_master_indexes(master_db) -> None:
    """Create / verify indexes on master-database collections."""

    # ── tenants ────────────────────────────────────────────────────────────────
    await master_db["tenants"].create_indexes([
        IndexModel([("company_id", ASCENDING)], name="tenant_company_id", unique=True, sparse=True),
        IndexModel([("status", ASCENDING)], name="tenant_status"),
        IndexModel([("owner.email", ASCENDING)], name="tenant_owner_email"),
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
