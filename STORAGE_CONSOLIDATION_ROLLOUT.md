# Storage Consolidation Rollout — Implementation Record

**Date:** 2026-07-20
**Implements:** [COLLECTION_CONSOLIDATION_REPORT.md](COLLECTION_CONSOLIDATION_REPORT.md) Phase 1 (safe set) + the five approved nested optimizations from [NESTED_DOCUMENT_ARCHITECTURE_REPORT.md](NESTED_DOCUMENT_ARCHITECTURE_REPORT.md).
**Scope guarantee:** storage layout only — no API contract, business logic, RBAC, tenant-architecture, or frontend change. 22 backend files modified; 0 frontend files.

## Phase 0 — Backup (done, verified)

- Full-instance BSON backup: `python backend/scripts/backup_restore.py backup <dir>` → `d:/tmp/mongo_backup_2026-07-19` (281 collections, 698 docs), **verify passed** (every file decodes + counts match manifest).
- Rollback procedure: `python backend/scripts/backup_restore.py restore <dir> --drop` restores the exact captured state (ObjectIds, timestamps, binary preserved via raw BSON).

## What changed (per approved item)

| Item | Change | Discriminator | Files |
|---|---|---|---|
| S1 | `candidate_form_tokens` + `employee_onboarding_tokens` + `hrm_doc_upload_tokens` → **`tokens`** | `token_type` | candidates.py, hrm_employee_onboarding.py, hrm_doc_upload_tokens.py, employee_service.py |
| S2 | `hrm_geo_fence_audit` + `hrm_fraud_audit` → **`hrm_security_audit`** | `kind` | attendance_login_validator.py |
| S3 | `target_history` (+ never-used `target_templates`) → **`targets`** | `doc_type` — history docs carry no `is_deleted`, so every existing read path (all filter `is_deleted`) excludes them exactly as before | target_service.py |
| S4 | `task_execution_logs` + `report_execution_logs` → **`execution_logs`** | `log_type` | scheduler_service.py, report_service.py |
| S5 | `import_jobs` + `export_jobs` + `import_templates` → **`data_jobs`** | `kind` | import_service.py, export_service.py |
| S6 | 9 settings catalogs (teams, branches, pipeline_stages, job_categories, skills, candidate_sources, commission_rules, sla_rules, document_templates) → **`catalogs`** | `kind` | tenant_settings.py |
| S11 | `scheduled_tasks` + `scheduled_reminders` → **`scheduler_jobs`** | `job_kind` | scheduler_service.py, notification_service.py |
| S12/N4 | `smtp_config` singleton → **`company_settings.smtp`** subdocument | — | company_settings.py, email_service.py, config_resolution_service.py |
| N1 | `notification_preferences` → **`users.preferences.notifications`** | — | notification_service.py |
| N2 | `dashboard_layouts` → **`users.preferences.dashboard_layout`** | — | analytics_service.py |
| N3 | `announcement_dismissals` → **`users.announcement_dismissals`** (map keyed by announcement id) | — | tenant_communication.py |
| S13 | Bug fix: `db.employees` → `db.hrm_employees` (Document Center field resolution + global employee search). Ghost indexes removed: `hrm_documents` block deleted; `hrm_exit_requests` re-pointed to the real `hrm_exit` (which previously had **no** indexes). Ghost provisioning removed from `create_company_database`: `employees`, `payouts`, `attendance`, `leaves`, `payroll`. `m007`'s `db.payouts` index dropped (fresh installs only). | — | document_center_service.py, search_service.py, indexes.py, database.py, runner.py |

**Indexes added** (real query coverage only): `tokens` {token}₁ᵤₛ + {token_type, company_id}; `catalogs` {kind, company_id, is_deleted}; `scheduler_jobs` due-task + due-reminder compounds; `execution_logs` {log_type, started_at↓}; `data_jobs` {kind, company_id, created_at↓}; `hrm_exit` {company_id, status}.

## Migration — `m008_storage_consolidation` (runner.py)

- Tenant-scoped, runs automatically at startup **before** index init, schedulers, and request serving; tracked in `master_db.system_migrations`.
- Copies every source doc into its target via `replace_one({_id}, {**doc, discriminator}, upsert=True)` — **idempotent** (re-run proven: no duplicates), `_id`s/timestamps/references preserved.
- Embeds (N1–N3, SMTP) guarded with `$exists: False` so re-runs never overwrite newer data.
- **Source collections are intentionally NOT dropped** — they are dead weight kept for rollback. Drop manually (or rename to `zz_archive_*`) after the verification window.

## Verification performed

| Check | Result |
|---|---|
| Backup created + integrity-verified before any change | ✅ |
| Syntax check on all 22 modified files | ✅ |
| Full regression suite | ✅ **137/137 pass** |
| Migration executed on all 4 local tenants | ✅ (2 tokens + 4 report logs moved; other sources empty) |
| Data integrity: per-tenant source-count == discriminated-target-count for all 23 mappings | ✅ zero mismatches |
| Idempotency: m008 re-run on every tenant | ✅ counts unchanged, no duplicates |
| App boot smoke test (lifespan: migrations → index init → scheduler leader) | ✅ startup complete; root=200, openapi=200, protected endpoint=403 as before |
| New indexes materialized (tokens/catalogs/scheduler_jobs/execution_logs/data_jobs/hrm_exit) | ✅ |
| No conflicts from new index definitions | ✅ (log conflicts seen are pre-existing legacy `users.email_1`-style name clashes, untouched by this change) |
| Frontend untouched | ✅ `git status`: 0 frontend files |

## Deviations from the reports (all documented judgment calls)

1. **S8 (`login_history`) / S9 (`user_sessions`): no code change needed.** Verification showed their writers (`AuditAdvancedService.create_session`, `log_failed_login`→`_log_login`) are **unreachable** — nothing calls them. The collections never materialize (Mongo creates lazily); reads return empty; master `sessions` + `login_logs` are already the only real stores. The dedupe the report wanted is already the runtime reality; touching the dormant code would have been an unrelated behavior change.
2. **S10 (`security_alerts` → `audit_logs`): deferred.** Alerts ARE written (critical audit actions) and merging them would require exclusion filters across audit/report/dashboard read paths in 5 files — implementation review moved it from Low to Medium risk, conflicting with the 100 %-identical-behavior mandate. It remains a separate (small) collection.
3. **N5 (pipeline stages → pipelines): already implemented in production code.** `pipelines` docs embed a `stages[]` array (pipeline_service.py). The separate `pipeline_stages` collection is a flat settings catalog with no `pipeline_id` — merged into `catalogs` (kind `pipeline_stage`) under S6 instead.
4. **Legacy `payouts` / `contacts` data**: reads left untouched (counts return 0 either way); only ghost provisioning was removed. Actual data retirement stays an ops task after a production data check, per the report.
5. **Phase 2 consolidation (M-series: partner_transactions, doc-center embeds, settings_items, settings-singleton unification): NOT implemented** — the mandated order gates it behind post-rollout production stability monitoring.

## Post-rollout collection count

Per tenant: ~88 referenced collections → **~61** (27 sources retired into 6 consolidated stores + 3 user-embeds + 1 settings-embed; 7 ghost/legacy names no longer provisioned). New-tenant provisioning no longer creates `employees`, `payouts`, `attendance`, `leaves`, `payroll`, `hrm_documents`, `hrm_exit_requests`.

## Production deployment runbook

1. Take a fresh backup (mongodump/Atlas snapshot preferred; `backup_restore.py` otherwise) and **verify** it.
2. Deploy this build. On first startup `m008` migrates every tenant automatically before traffic is served; startup logs print per-field move counts.
3. Verify: startup log shows `[done] m008_storage_consolidation`; spot-check the integrity queries (source count == discriminated target count).
4. Regression-verify the touched surfaces: public candidate form links, employee-onboarding links, doc-upload links, Targets page + Leaderboard, Scheduler page + execution logs, Imports/Exports, all Settings catalog pages (Teams/Branches/Stages/Categories/Skills/Sources/Commission/SLA/Doc-Templates), SMTP config page + test email, notification settings, dashboard layout save, announcement dismissal, employee delete cascade, Document Center generation (employee fields now resolve — previous silent-miss bug fixed), global search.
5. After the verification window (suggest ≥ 1 full retention cycle), drop the retired source collections per tenant: the 22 names in the m008 table above. Until then they are inert.
6. Rollback at any point: restore the verified backup (`restore --drop`) and redeploy the previous build; delete the `m008_storage_consolidation` row from `master_db.system_migrations` if re-running later.
