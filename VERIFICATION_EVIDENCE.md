# Storage Consolidation — Pre-Production Verification Evidence

**Date:** 2026-07-20 · **Instance:** local MongoDB 8.2 (`mongodb://localhost:27017`), 4 active tenants
**Companion docs:** [STORAGE_CONSOLIDATION_ROLLOUT.md](STORAGE_CONSOLIDATION_ROLLOUT.md) (implementation record)
All outputs below are captured from live runs, not asserted.

---

## 1. Collection count verification (per tenant)

Before = backup manifest captured 2026-07-19 **before any change**. "Now" includes retired sources deliberately kept for rollback; "after drop" = count once the documented drop step runs.

| Tenant DB | Before | Now (rollback window) | New stores added | Retired (droppable) | After drop |
|---|---|---|---|---|---|
| c_2b9fcd93 | 39 | 44 | 5 | 8 | **36** |
| c_6d10a8b5 | 40 | 45 | 5 | 8 | **37** |
| c_85225536 | 47 | 52 | 5 | 9 | **43** |
| c_9fd45c38 | 40 | 45 | 5 | 8 | **37** |

New stores in every tenant: `catalogs`, `data_jobs`, `execution_logs`, `scheduler_jobs`, `tokens` (+`hrm_security_audit` on first geo/fraud event). Retired names present locally: `attendance`, `employees`, `hrm_doc_upload_tokens`, `hrm_documents`, `hrm_exit_requests`, `leaves`, `payouts`, `payroll` (+`report_execution_logs` on 85225536).

**About “~88 → ~61”:** 88 counts the *code-referenced namespace universe* (a tenant only materializes collections it has used — dev tenants had 39–47). Post-cutover extraction of every db-access site in `backend/app` yields **65 referenced tenant names**, of which 1 is a regex artifact (`create_collection`) and 4 are documented dormant/deferred (`login_history`, `user_sessions`, `payouts`, `contacts`) → **60 active tenant namespaces**, matching the ~61 target. 27 retired names no longer appear anywhere outside migration code.

## 2. Data integrity verification

Script compares, per tenant per mapping (23 mappings): source count, discriminated destination count, difference, and **`_id` set difference**.

```
tenant       source                        src  dst diff  missing_ids
6d10a8b5     hrm_doc_upload_tokens           1    1    0  NONE
85225536     report_execution_logs           4    4    0  NONE
2b9fcd93     hrm_doc_upload_tokens           1    1    0  NONE
RESULT: ALL MAPPINGS ZERO-DIFF, NO MISSING _id
```

All other sources are empty locally (dev-scale data). **The same script is the production acceptance gate** — run it after the production migration where every mapping will have volume.

## 3 & 6. Application CRUD + live feature verification

Method: FastAPI `TestClient` against the **real app and real tenant DB** (tenant `6d10a8b5`), with only the JWT-decode dependency overridden to a real admin identity (login itself tested separately without overrides). MongoDB profiler set to level 2 for the whole run.

```
login wrong-password (full real auth stack)   401 {"detail":"Invalid credentials"}  PASS
/auth/me without token                        403                                   PASS
team CREATE/READ/UPDATE/DELETE                201/200/200/200                       PASS  (catalogs)
branches READ, pipeline-stages READ           200/200                               PASS  (catalogs)
target CREATE/READ/PROGRESS/LIST/DELETE       201/200/200/200/200                   PASS  (targets + history doc_type)
docToken CREATE/LIST/VALIDATE(public)/REVOKE  201/200/200/200                       PASS  (tokens)
notifPrefs READ/UPDATE                        200/200                               PASS  (users.preferences.notifications)
dashboard layout READ                         200                                   PASS  (users.preferences.dashboard_layout)
smtp READ                                     200                                   PASS  (company_settings.smtp)
import templates READ, import jobs READ       200/200                               PASS  (data_jobs)
candidates/jobs/clients/employees LIST        200 ×4                                PASS  (untouched core)
admin dashboard, global search, notifications 200 ×3                                PASS
```
**29/29 PASS.** Plus the full regression suite: **137/137 pytest pass** (covers attendance/payroll/leave/interview logic).

**Profiler proof the app is not silently reading old collections** — every namespace touched during the run:

```
applications, audit_logs, candidates, catalogs, clients, company_settings, data_jobs,
departments, designations, doc_generated, hrm_attendance, hrm_employees, interviews, jobs,
login_logs, notifications, onboards, payouts, pipelines, roles, targets, tasks, tokens, users
RETIRED collections touched: ['payouts']
```
`payouts` is the **known documented exception**: a read-only `_safe_count` in admin_dashboard against the empty legacy collection (returns 0; behavior intentionally preserved until the production data check — Rollout doc, deviation 4). Zero reads/writes hit any other retired collection.

## 4. Index verification

Before (from backup capture) vs after, representative tenant:

- `hrm_doc_upload_tokens` **before**: `_id_`, `token_1 (unique)`, `company_id_1_employee_id_1`, `company_id_1_status_1`, `expires_at_1`
- `tokens` **after**: identical five **plus** `token_type_company` — `token_1: unique=True, sparse=True` → **unique constraint preserved**.
- New stores: `catalogs.catalog_kind_company`, `scheduler_jobs.{schedjob_due_tasks, schedjob_due_reminders}`, `execution_logs.execlog_type_date`, `data_jobs.datajob_kind_company_date`, `hrm_exit.exit_status` (previously the real exit collection had **no** index — ghost fixed).
- Critical unique constraints on untouched collections verified live:
  - `applications.app_cand_job_active` unique, partial `{is_deleted: false}` (duplicate-application guard)
  - `hrm_employees.emp_crm_user_unique` unique, partial `{crm_user_id: $exists}`
  - `hrm_assets.asset_tag` / `public_token_1` unique · `hrm_attendance.att_unique_emp_day` unique

## 5. Old collection usage audit

`rg` over `backend/app` **and** `frontend/src` for all 20+ retired names: every hit is one of
(a) `app/migrations/runner.py` (migration/rollback code — allowed), (b) the Python *module* name `hrm_doc_upload_tokens` in `main.py` router imports (a filename, not a collection), (c) `announcement_dismissals` in tenant_communication.py — now the embedded **field** on `users`, not a collection, (d) `entity_type="smtp_config"` audit-label strings. Direct db-access pattern search (`db.name` / `db["name"]`) over `backend/app` excluding the runner: **zero matches**. Frontend: **zero matches** (frontend never referenced collection names).

## 7. Performance comparison

**Migrated paths — explain() winning plans (no COLLSCANs):**

```
tokens by token value (public link path)  -> IXSCAN token_1
tokens list (HR view)                     -> IXSCAN token_type_company
catalogs list (settings pages)            -> IXSCAN catalog_kind_company
scheduler due-task sweep                  -> IXSCAN schedjob_due_tasks
data_jobs import list                     -> IXSCAN datajob_kind_company_date
execution_logs task list                  -> IXSCAN execlog_type_date
targets list (unchanged filter)           -> IXSCAN company_id_1_is_deleted_1
```

**Old-vs-new direct timing** (50 iterations, same data):

| Query | p50 | p95 |
|---|---|---|
| tokens by token (NEW) | 0.75 ms | 1.33 ms |
| hrm_doc_upload_tokens by token (OLD) | 0.74 ms | 1.48 ms |
| catalogs team list (NEW) | 0.92 ms | 1.84 ms |
| teams list (OLD) | 0.57 ms | 1.13 ms |

Sub-millisecond parity (the ~0.3 ms catalog delta is the added `kind` equality term on an index prefix — noise at dev scale; both IXSCAN).

**Hot paths (candidates / employees / attendance / payroll)**: p50 0.86–1.48 ms, p95 ≤ 2.56 ms. These collections, their code, and their indexes are **byte-identical to before** — the consolidation never touched them, which is the structural guarantee against regression; timings above are the sanity check.

## Honest limitations (what production sign-off should still do)

1. **Scale**: dev data is tiny (698 docs total). Re-run the §2 integrity script and §7 timings after the production migration.
2. **Auth-level UI walk-through**: CRUD here exercised real routes/services/DB with a bypassed JWT decode; login/401/403 paths were tested for real. A human click-through of the §3 checklist pages in staging is still worthwhile.
3. **External-provider features** (email send, resume parsing, AI matching): no files in those paths were modified (`git status` shows the 22 changed files — none in ai_service/matching_service/parsing); config-resolution for SMTP was retargeted and its read path is covered by the smtp GET test + config fallback logic. A staging send/parse test is recommended.
4. **Payroll generation timing**: no payroll data exists locally to generate; correctness is covered by the 137-test suite; run one payroll cycle in staging before the production drop step.
