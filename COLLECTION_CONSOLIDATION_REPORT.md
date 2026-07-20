# Collection Dependency & Consolidation Impact Report

**Date:** 2026-07-19
**Scope:** Analysis only — no code, database, or schema changes were made.
**Method:** Full static scan of `backend/app` (all `db["…"]` / `db.…` / `*_db` accessors, service `COLLECTION` constants, `app/core/indexes.py`, migration runner, background loops in `app/main.py`) plus frontend page mapping (`frontend/src/pages`).

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Collections referenced per **tenant (company) DB** | **~88** (incl. 2 ghost/index-only, 3 legacy/dead) |
| Collections in **master DB** | ~25 |
| Backend files touching collections | 91 files, ~1,100 access sites |
| Background loops (leader-elected, in `main.py`) | 5 (subscription_reminder, session_cleanup, hrm_auto_checkout, tenant_cleanup, subscription_queue) + in-tenant `scheduler_service` |
| Recommended target per tenant | **~52 collections** (≈ 40 % reduction) |
| Merges rated Safe / Minor-changes / Not-safe | 12 safe groups / 8 minor-change groups / 42 keep-separate |

**Headline findings (discovered during the scan, worth fixing independently of consolidation):**

1. **Ghost indexes:** `app/core/indexes.py` creates indexes for `hrm_documents` and `hrm_exit_requests`, but **no code reads or writes either collection**. Employee documents are embedded in `hrm_employees.documents` (see `api/v1/hrm_documents.py`), and exit records live in `hrm_exit`. Every tenant gets two empty auto-created collections; `hrm_exit` itself has **no indexes**.
2. **Legacy `employees` reference bug:** `document_center_service.py` and `search_service.py` query `db.employees`, but the real collection is `hrm_employees`. Document Center employee lookups and global employee search will silently miss data on tenants that never had a legacy `employees` collection.
3. **Duplicate audit/session collections:** `login_history` + `security_alerts` + `user_sessions` (tenant, `audit_advanced_service.py`) overlap with `login_logs` (tenant, written by `auth_service.py`) and master `sessions` (authoritative, used by auth middleware, presence, session APIs).
4. **Legacy `payouts` collection** (read by `admin_dashboard.py`, touched by `migrations/runner.py`) duplicates `partner_payouts`.
5. **Name collision:** `document_templates` (tenant-settings catalog) vs `doc_templates` (Document Center) — different collections, confusingly similar names.

---

## 2. Tenant Database — Full Collection Audit

Legend — **R/W:** read/write frequency (H/M/L). **Growth:** expected record growth (Static ≈ fixed small set, Slow, Linear = grows with business activity, High = grows per employee-per-day or per event). **Risk:** risk of merging it anywhere. **Merge?:** ✅ safe, ⚠️ safe with minor changes, ❌ keep separate.

### 2.1 Identity, Access & Org Structure

| Collection | Purpose | Referenced by (backend) | CRUD | Indexes | Est. volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `users` | Tenant user accounts, roles, reporting chain | **46 files** — auth_service, user_service, dependencies, tenant_resolver, plan_checker middleware, notification/report/target/search/import/export services, nearly every API | CRUD | `user_role`, `user_email`, `user_reporting_to` | 10–500 | H/M | **Critical** | ❌ |
| `roles` | Custom + system roles and permission sets | role_service, auth_service, user_service, users API, admin_dashboard, migrations runner | CRUD | none | 5–30 | H/L | High | ❌ |
| `departments` | Org departments | department_service, designation_service, user_service, admin_dashboard, runner | CRUD | none | 5–50 | M/L | Medium | ❌ (see §5.2) |
| `designations` | Job titles per department | designation_service, user_service, admin_dashboard, runner | CRUD | none | 10–100 | M/L | Medium | ❌ (see §5.2) |
| `login_logs` | Login activity written at every login (`auth_service`) | auth_service, auth API (activity/summary/analytics), admin_dashboard | C,R | `loginlog_date`, `loginlog_user_date` | High-growth (per login) | M/H | Medium | ⚠️ merge target for `login_history` |
| `login_history` | **Duplicate** login log written by `audit_advanced_service` | audit_advanced_service only | C,R | none | duplicate growth | L/M | Low | ✅ fold into `login_logs` |
| `user_sessions` | **Tenant-side session copies** | audit_advanced_service, scheduler_service (cleanup task) | C,R,U | none | per login | L/M | Low | ✅ retire — master `sessions` is authoritative |
| `security_alerts` | Failed-login / anomaly alerts | audit_advanced_service | C,R,U | none | Slow | L/L | Low | ✅ fold into `audit_logs` (event_type) |
| `audit_logs` | Tenant audit trail | audit_service, audit_advanced_service, analytics, report_service, tenant_service, admin_dashboard, runner | C,R | `audit_date`, `audit_user_date` | High-growth | M/H | High | ❌ (absorbs security_alerts) |

**Frontend pages:** Users/UserForm/UserDetails/InactiveUsers, Roles/RoleForm, Departments, Designations, LoginActivityPage, ActiveSessionsPage, AuditLogs (admin + audit module), Profile.

### 2.2 Recruitment / ATS Core

| Collection | Purpose | Referenced by | CRUD | Indexes | Est. volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `candidates` | Candidate master records | **18 files** — candidate_service, application/interview/job/matching/onboard/partner_payout/target/report/analytics/search/import/export services, public_forms, tenant middleware | CRUD | `cand_status_date`, `cand_email` | 1k–100k+ | H/H | **Critical** | ❌ |
| `jobs` | Job requisitions (client jobs) | **17 files** — job_service, application/client/interview/matching/onboard/pipeline/partner_payout/target/report/analytics/search/import/export services | CRUD | `job_status_date`, `job_client`, `job_deleted_priority_date` | 100–10k | H/M | **Critical** | ❌ |
| `applications` | Candidate↔job applications (state machine) | **17 files** — application_service, candidate/client/interview/job/onboard/report/analytics/search/import/export services, candidates & interviews APIs | CRUD | `app_job_status`, unique partial `app_cand_job_active`, `app_deleted_applied_date` | 5k–500k | H/H | **Critical** | ❌ |
| `interviews` | Interview scheduling & feedback | interview_service, application/analytics/report/search/settings/target services, interviews & export APIs, admin_dashboard, runner | CRUD | `interview_status_date`, `interview_candidate` | Linear | H/H | High | ❌ |
| `interview_stages` | Configurable interview rounds | settings_service, application_service, interview_service | CRUD | none | 5–15 | M/L | Medium | ⚠️ settings-items merge |
| `pipelines` | Recruitment pipelines | pipeline_service, interview_service, search_service | CRUD | none | 1–10 | M/L | Low | ⚠️ embed stages |
| `pipeline_stages` | Stages per pipeline | tenant_settings API | CRUD | none | 5–30 | M/L | Low | ✅ embed into `pipelines` |
| `clients` | Client companies | client_service, job_service (jobs per client), clients API, trash | CRUD | `client_status` | 10–1k | H/M | High | ❌ |
| `onboards` | Placement/onboarding records (candidate placed) | onboard_service, application/interview/analytics/report/target/scheduler services, admin_dashboard, runner | CRUD | `onboard_status_date`, `onboard_partner` | Linear | M/M | High | ❌ |
| `matching_results` | AI job↔candidate matching cache | matching_service | C,R,D | none | Linear (cache) | M/M | Low | ❌ keep, add TTL |
| `public_forms` | Public application form definitions | public_forms API | CRUD | none | 1–20 | M/L | Low | ❌ small but public-facing |
| `candidate_form_tokens` | One-time public form tokens | candidates API, public_forms flow | C,R,U | none | Linear, expiring | M/M | Low | ✅ → `tokens` |
| `tasks` | CRM to-do tasks | task_service, search_service, admin_dashboard, trash | CRUD | none | Linear | M/M | Medium | ❌ |
| `targets` | Sales/recruiter targets | target_service, search_service, admin_dashboard, targets API, runner | CRUD | none | 10–500/period | M/M | Medium | ❌ (absorbs templates + history) |
| `target_templates` | Reusable target templates | target_service | CRUD | none | <50 | L/L | Low | ✅ → `targets` (doc_type) |
| `target_history` | Target change/achievement history | target_service | C,R | none | Linear | L/M | Low | ✅ → `targets` (doc_type) |
| `contacts` | Import-only entity (`import_service`, `models/company/import_export.py`) | import_service only | C | none | ~0 | L/L | Low | ✅ retire or fold into candidates import |

**Frontend pages:** Candidates/CandidateForm/CandidateDetails, Jobs/JobForm/JobDetails/JobMatchingCandidates, Applications/ApplicationDetail, Interviews/InterviewForm/InterviewDetail/FeedbackForm, Clients/ClientForm/ClientDetails, PublicApplyForm/CandidatePublicForm/PublicFormManagement, RecruitmentDashboard, Onboards/OnboardForm/OnboardDetails, Tasks, TargetsPage/Leaderboard, PipelineStagePage, InterviewSettings.

### 2.3 Partner / Payouts

| Collection | Purpose | Referenced by | CRUD | Indexes | Volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `partner_payouts` | Partner commission payouts | partner_payout_service, onboard_service, scheduler_service, analytics, report_service, target_service | CRUD | `payout_partner_status`, `payout_status` | Linear | M/M | Medium | ⚠️ → `partner_transactions` |
| `partner_invoices` | Partner invoices | partner_payout_service, analytics, report_service | CRUD | `invoice_partner_status`, `invoice_status_date` | Linear | M/M | Medium | ⚠️ → `partner_transactions` |
| `payouts` | **Legacy** duplicate of partner_payouts | admin_dashboard (read), migrations runner | R | none | legacy | L/L | Low | ✅ retire after data check |

**Frontend pages:** PartnerPayouts, Invoices, RaiseInvoice, Partners/PartnerForm.

### 2.4 Settings & Catalogs (tenant)

| Collection | Purpose | Referenced by | CRUD | Indexes | Volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `company_settings` | Singleton: company profile, HRM policies (attendance/leave/geofence) | 11 files — auth API, hrm_attendance API, tenant_settings API, attendance_login_validator, employment_policy, leave/payroll/onboard/partner_payout/shift-assignment/document_center services | R,U | none (singleton) | 1 doc | **H**/L | High | ❌ (merge **into** it: smtp_config, tenant_settings) |
| `tenant_settings` | Second settings singleton (branding, invoice, localization…) | tenant_settings API, company_settings API, config_resolution, email_service, pipeline_service, attendance_service | R,U | none | 1–10 docs | H/L | Medium | ⚠️ merge with `company_settings` |
| `smtp_config` | Per-tenant SMTP override | email_service, config_resolution_service, company_settings API | R,U | none | 1 doc | M/L | Low | ✅ → `company_settings` |
| `custom_fields` | Custom field definitions | settings_service, candidates API | CRUD | none | <100 | M/L | Low | ⚠️ settings-items |
| `email_templates` | Tenant email templates | settings_service | CRUD | none | <50 | M/L | Low | ⚠️ settings-items |
| `branches` | Office branches catalog | tenant_settings API only | CRUD | none | <20 | L/L | Low | ✅ → `catalogs` |
| `teams` | Teams catalog | tenant_settings API only | CRUD | none | <50 | L/L | Low | ✅ → `catalogs` |
| `skills` | Skills catalog | tenant_settings API only | CRUD | none | <500 | L/L | Low | ✅ → `catalogs` |
| `job_categories` | Job categories catalog | tenant_settings API only | CRUD | none | <50 | L/L | Low | ✅ → `catalogs` |
| `candidate_sources` | Sourcing channels catalog | tenant_settings API only | CRUD | none | <30 | L/L | Low | ✅ → `catalogs` |
| `commission_rules` | Commission rules | tenant_settings API only | CRUD | none | <30 | L/L | Low | ✅ → `catalogs` |
| `sla_rules` | SLA definitions | tenant_settings API only | CRUD | none | <30 | L/L | Low | ✅ → `catalogs` |
| `document_templates` | Settings-level doc templates (**not** Document Center) | tenant_settings API only | CRUD | none | <50 | L/L | Low | ✅ → `catalogs` |
| `integrations` | Third-party integration configs | integration_service | CRUD | none | <20 | L/L | Low | ❌ keep (credentials isolation) |

**Frontend pages:** entire `settings/` module (BranchesPage, TeamsPage, CustomFieldsPage, JobCategoriesPage, CandidateSourcesPage, CommissionRulesPage, SLAConfigPage, DocumentTemplatesPage, EmailConfigPage, BrandingPage, LocalizationPage, InvoiceSettingsPage, SecuritySettingsPage, NotificationSettingsPage…), CompanySettings.

### 2.5 Notifications, Reporting, Jobs & Ops

| Collection | Purpose | Referenced by | CRUD | Indexes | Volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `notifications` | In-app notifications | notification_service, runner | CRUD | none ⚠️ | High-growth | H/H | High | ❌ (needs index + TTL, not merging) |
| `notification_preferences` | Per-user notification prefs | notification_service | R,U | none | = users | M/L | Low | ✅ embed in `users` or → `user_prefs` |
| `scheduled_reminders` | Deferred reminder queue | notification_service | C,R,U,D | none | Linear | M/M | Low | ✅ → `scheduler_jobs` |
| `scheduled_tasks` | In-tenant scheduler definitions | scheduler_service | CRUD | none | <50 | M/M | Low | ✅ → `scheduler_jobs` |
| `task_execution_logs` | Scheduler run logs | scheduler_service | C,R | none | Linear | L/M | Low | ✅ → `execution_logs` |
| `report_execution_logs` | Report run logs | report_service | C,R | none | Linear | L/M | Low | ✅ → `execution_logs` |
| `saved_reports` | Saved report definitions | report_service | CRUD | none | <100 | M/L | Medium | ❌ |
| `import_jobs` | Import job state | import_service | C,R,U | none | Linear | L/M | Low | ✅ → `data_jobs` |
| `export_jobs` | Export job state | export_service | C,R,U | none | Linear | L/M | Low | ✅ → `data_jobs` |
| `import_templates` | Saved import mappings | import_service | CRUD | none | <50 | L/L | Low | ✅ → `data_jobs` or catalogs |
| `dashboard_layouts` | Per-user dashboard layout | analytics_service | R,U | none | = users | M/L | Low | ✅ → `user_prefs` |
| `announcement_dismissals` | Per-user dismissal of super-admin announcements | tenant_communication API | C,R | none | small | M/M | Low | ✅ → `user_prefs` |

**Frontend pages:** Notifications, ReportsPage/ReportGenerator/ReportViewer/SavedReports, AnalyticsDashboard, DataManagementPage, imports/exports modules, AdminDashboard.
**Background jobs:** `scheduler_service` (reads `scheduled_tasks`, writes `task_execution_logs`, cleans `user_sessions`, touches `onboards`/`partner_payouts`); report/import/export flows write their log collections.

### 2.6 Document Center

| Collection | Purpose | Referenced by | CRUD | Indexes | Volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `doc_templates` | Document Center templates (WYSIWYG) | document_center_service (28 refs), document_center API, hrm_hiring_service (offer letters) | CRUD | none | <100 | H/M | High | ❌ |
| `doc_template_versions` | Template version history | document_center_service | C,R | none | Linear | L/M | Low | ⚠️ embed into `doc_templates` |
| `doc_categories` | Template categories | document_center_service | CRUD | none | <30 | L/L | Low | ✅ → `catalogs` or embed |
| `doc_generated` | Generated documents | document_center_service, document_center API, employee_service, search_service | CRUD | none | Linear | M/M | High | ❌ |
| `doc_approvals` | Approval workflow records | document_center_service, admin_dashboard | C,R,U | none | Linear | M/M | Medium | ⚠️ embed into `doc_generated` |

**Frontend pages:** `hrm/document-center/*` (Template Builder, Advanced Designer, approvals).
**⚠️ Bug:** this module reads `db.employees` (should be `hrm_employees`) — see §7.

### 2.7 HRM — Employee Lifecycle

| Collection | Purpose | Referenced by | CRUD | Indexes | Volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `hrm_employees` | Employee master (incl. **embedded documents[]**) | **25 files** — every HRM API (assets, attendance, doc tokens, documents, onboarding, employees, exit, leaves, payroll, shift assignments), attendance/leave/notification/announcement/report/user/auth/sync/dashboard/hiring/calendar services, runner | CRUD | `emp_company_status`, `emp_crm_user`, `emp_dept`, unique partial `emp_crm_user_unique` | 10–5k | **H/H** | **Critical** | ❌ |
| `hrm_attendance` | Daily attendance (one doc per employee-day) | hrm_attendance API, attendance_service, leave_service, hrm_dashboard, report_service, hrm_auto_checkout_loop (background, all tenants) | CRUD | `att_emp_date`, `att_date_status`, `att_date_checkin`, unique `att_unique_emp_day` | **Highest growth** (emp × days) | H/**H** | **Critical** | ❌ |
| `hrm_attendance_exceptions` | Geofence/IP login exceptions | attendance_login_validator (runs **at login**), attendance_service, hrm_exceptions API | CRUD | `attexc_emp_login` | small | H/L | High | ❌ (login hot path) |
| `hrm_leaves` | Leave requests | hrm_leaves API, attendance_service, leave_service, hrm_dashboard, report_service | CRUD | `leave_emp_status`, `leave_status_date` | Linear | H/M | High | ❌ |
| `hrm_leave_balances` | Per-employee leave balances | leave_service, employee_service, leave_policy_service | R,U | none ⚠️ | = employees × types | H/M | High | ❌ (concurrent-update risk if embedded) |
| `hrm_leave_policies` | Leave policy definitions | hrm_leave_policy_service, leave_service | CRUD | none | <20 | M/L | Medium | ❌ |
| `hrm_comp_off_credits` | Comp-off credit ledger | attendance_service, leave_service, hrm_attendance API | C,R,U | none ⚠️ | Linear | M/M | Medium | ⚠️ could become leave-ledger with balances — defer |
| `hrm_holidays` | Company holidays | holiday_service, attendance_service | CRUD | `holiday_date` | <50/yr | H/L | Medium | ❌ (attendance/payroll math) |
| `hrm_shifts` | Shift definitions | shift_service, attendance_service | CRUD | none | <20 | M/L | Medium | ❌ |
| `hrm_shift_assignments` | Employee↔shift mapping | shift_assignment_service, attendance_service | CRUD | none ⚠️ | = employees | H/M | High | ❌ (attendance hot path) |
| `hrm_work_mode_requests` | WFH/hybrid requests | work_mode_request_service, attendance_login_validator, attendance_service, admin_dashboard | CRUD | `workmode_emp_status` | Linear | M/M | Medium | ❌ (login validator dependency) |
| `hrm_payroll` | Payroll runs (locked/prorated) | payroll_service, hrm_payroll API, report_service | CRUD | `payroll_period`, `payroll_emp_period` | emp × months | M/M | **Critical** | ❌ (financial/compliance) |
| `hrm_payslips` | Generated payslips | payroll_service, hrm_dashboard | C,R | `payslip_period` | emp × months | M/M | **Critical** | ❌ (immutable financial artifacts) |
| `hrm_payroll_structure` | Salary structures | payroll_service | CRUD | none | = employees | M/L | Medium | ❌ (versioned history matters) |
| `hrm_performance` | Performance reviews | performance_service | CRUD | `perf_emp_status` | Linear | M/M | Medium | ❌ |
| `hrm_assets` | Asset registry + QR + history | hrm_assets API, employee_service (exit checklist), report_service | CRUD | `asset_assignee`, unique sparse `asset_tag` | 100s | M/M | High | ❌ (public QR page + unique tag) |
| `hrm_exit` | Exit/resignation workflow | hrm_exit API, hrm_dashboard, report_service | CRUD | **none** ⚠️ (indexes went to ghost `hrm_exit_requests`) | Slow | M/M | Medium | ❌ |
| `hrm_announcements` | HR announcements | announcement_service, hrm_dashboard | CRUD | `ann_active_date` | Slow | M/L | Low | ❌ (small but distinct UX) |
| `hrm_calendar_events` | HR calendar company events | hrm_calendar_event_service | CRUD | none | Linear | M/M | Medium | ❌ |
| `hrm_geo_fence_audit` | Geofence violation log | attendance_login_validator | C,R | none | Linear | L/M | Low | ✅ → `hrm_security_audit` |
| `hrm_fraud_audit` | Attendance fraud-signal log | attendance_login_validator | C,R | none | Linear | L/M | Low | ✅ → `hrm_security_audit` |
| `hrm_doc_upload_tokens` | Token links for doc upload | hrm_doc_upload_tokens API | C,R,U | none | expiring | M/M | Low | ✅ → `tokens` |
| `employee_onboarding_tokens` | Employee self-onboarding links | hrm_employee_onboarding API | C,R,U | none | expiring | M/M | Low | ✅ → `tokens` |

**Frontend pages:** Employees/EmployeeForm/EmployeeView/EmployeeSelfService/EmployeeOnboardForm/EmployeeDocUpload, Attendance, LeaveManagement/LeavePolicyManagement, Payroll, Performance, AssetManagement/AssetPublicPage/AssetScanPage, ExitManagement, Announcements, HolidayManagement, ShiftManagement, OrgChart, HRMDashboard, DocumentVault, EmpResources, HRMSyncPanel.
**Background jobs:** `hrm_auto_checkout_loop` (leader-elected; iterates **all tenants** via `master.tenants` → writes `hrm_attendance`); attendance login validator runs on the **auth hot path**.

### 2.8 HRM — Internal Hiring (job-first flow)

| Collection | Purpose | Referenced by | CRUD | Indexes | Volume | R/W | Risk | Merge? |
|---|---|---|---|---|---|---|---|---|
| `hrm_jobs` | Internal job openings (with `interview_rounds`) | hrm_hiring_service, hrm_hiring API, hrm_dashboard | CRUD | `hrmjob_status` | 10s | M/M | High | ❌ |
| `hrm_candidates` | Internal hiring candidates | hrm_hiring_service, hrm_hiring API, hrm_dashboard | CRUD | `hrmcand_stage` | 100s | M/M | High | ❌ |
| `hrm_interviews` | Interview rounds (job-first rework) | hrm_hiring_service | CRUD | none ⚠️ | Linear | M/M | Medium | ❌ |
| `hrm_offers` | Offer letters (uses doc_templates) | hrm_hiring_service | CRUD | none | Slow | M/M | Medium | ❌ |
| `hrm_candidate_invitations` | Candidate form invitations | hrm_hiring_service | C,R,U | none | expiring | L/M | Low | ⚠️ embed on `hrm_candidates` or → `tokens` |
| `hrm_onboardings` | Candidate→employee onboarding (P1 mandatory flow) | hrm_hiring_service, employee_service | CRUD | none | Slow | M/M | High | ❌ (feeds `hrm_employees` creation) |

**Frontend pages:** `hrm/hiring/*`.

### 2.9 Ghost / index-only collections (created but never used by code)

| Collection | Situation | Recommendation (report-only) |
|---|---|---|
| `hrm_documents` | Indexed in `indexes.py` (`doc_emp`, `doc_emp_type`); zero reads/writes — documents are embedded in `hrm_employees.documents` | Remove from index init; drop empty collection during a future migration |
| `hrm_exit_requests` | Indexed (`exit_status`); actual collection is `hrm_exit`, which has **no** index | Re-point index to `hrm_exit`; drop ghost |
| `employees` | Queried by document_center_service + search_service; never written by any service | Fix references to `hrm_employees` (bug) |

---

## 3. Master Database (for completeness — out of consolidation scope)

| Collection | Purpose | Key consumers |
|---|---|---|
| `tenants` | Tenant registry + owner + plan state | **32 files** — auth, middleware (auth/tenant/plan_checker), tenant_resolver, cache, payment/plan/seller/subscription services, hrm_auto_checkout_loop, tenant_cleanup loop |
| `sessions` | **Authoritative sessions** (JTI, revocation) | auth_service, dependencies, auth middleware, sessions API, presence_service, session_cleanup loop |
| `plans`, `payments`, `commissions`, `discounts`, `subscription_queue`, `webhook_events` | Billing stack | payment_service, plan_service, seller_service, seller_portal, super_admin, subscription_queue loop |
| `sellers`, `super_admins`, `pending_registrations`, `global_users`/`users`, `user_company_map`, `password_reset_tokens`, `user_active_sessions`, `login_requests`, `email_logs` | Platform identity | auth_service, tenant_service, sessions API |
| `platform_settings`, `platform_audit_logs`, `payment_provider_config`, `super_announcements`, `ai_provider_config`, `tenant_audit_logs`, `system_migrations` | Platform config/ops | platform_settings_service, communication_service, payment_provider_service, ai_service, migrations runner |

Master collections are shared platform infrastructure with hot-path auth/billing dependencies — **no consolidation recommended there**.

---

## 4. Dependency Maps

### 4.1 Recruitment core

```
clients ──► jobs ──► applications ──► interviews ──► onboards ──► partner_payouts / partner_invoices
              ▲           ▲                                            │
candidates ───┴───────────┘                                            ▼
   │  (matching_results cache)                              analytics_service ──► AnalyticsDashboard
   ▼                                                        report_service ──► Reports
public_forms + candidate_form_tokens (public intake)        admin_dashboard ──► AdminDashboard
users ──(ownership / reporting_to visibility BFS)──► every list endpoint above
targets ◄── candidates + interviews + onboards + jobs (achievement rollups)
```

### 4.2 HRM operational chain

```
users ◄──crm_user_id──► hrm_employees
                            │
        ┌──────────┬────────┼──────────┬───────────┐
        ▼          ▼        ▼          ▼           ▼
  hrm_shifts  hrm_holidays  hrm_leaves  hrm_assets  hrm_exit
  + hrm_shift_assignments      │ + hrm_leave_balances / policies / comp_off_credits
        │                      │
        ▼                      ▼
  hrm_attendance ◄── hrm_auto_checkout_loop (background, all tenants)
        │  ▲── attendance_login_validator (login hot path: company_settings,
        │       hrm_attendance_exceptions, hrm_work_mode_requests,
        │       hrm_geo_fence_audit, hrm_fraud_audit)
        ▼
  hrm_payroll (+ hrm_payroll_structure) ──► hrm_payslips ──► report_service ──► hrm_dashboard
```

### 4.3 Internal hiring → HRM

```
hrm_jobs ──► hrm_candidates ──► hrm_interviews ──► hrm_offers ──► hrm_onboardings ──► hrm_employees
                 ▲ hrm_candidate_invitations          ▲ doc_templates (offer letters)
notifications + email (interviewers = Active Employees multi-select)
```

### 4.4 Document Center

```
doc_categories ──► doc_templates ──► doc_template_versions
                        │
                        ▼
                  doc_generated ──► doc_approvals
                        ▲
              employees (⚠️ should be hrm_employees)
```

### 4.5 Settings resolution

```
platform_settings (master) ──► config_resolution_service ──► tenant_settings ──► company_settings
                                        │                        ▲
                                        ▼                        │
                                  smtp_config ──► email_service ─┘  (every outbound email)
```

---

## 5. Consolidation Analysis

### 5.1 ✅ SAFE TO MERGE (low risk, few touch points)

| # | Merge | New collection | Files to change | Risk | Complexity |
|---|---|---|---|---|---|
| S1 | `candidate_form_tokens` + `employee_onboarding_tokens` + `hrm_doc_upload_tokens` (+ optionally `hrm_candidate_invitations`) | `tokens` (`type`, TTL index) | 4 API files | Low | **Very Easy** |
| S2 | `hrm_geo_fence_audit` + `hrm_fraud_audit` | `hrm_security_audit` (`kind`) | 1 file (attendance_login_validator) | Low | **Very Easy** |
| S3 | `target_templates` + `target_history` → into `targets` (`doc_type`) | `targets` | 1 file (target_service) | Low | Easy |
| S4 | `task_execution_logs` + `report_execution_logs` | `execution_logs` (`job_type`) | 2 files | Low | **Very Easy** |
| S5 | `import_jobs` + `export_jobs` + `import_templates` | `data_jobs` | 2 files | Low | Easy |
| S6 | 9 catalog collections (`branches`, `teams`, `skills`, `job_categories`, `candidate_sources`, `commission_rules`, `sla_rules`, `document_templates`, `pipeline_stages`) | `catalogs` (`kind` + compound index) | 1 file (tenant_settings API) + pipeline_service read | Low | Easy |
| S7 | `notification_preferences` + `dashboard_layouts` + `announcement_dismissals` | `user_prefs` (or embed in `users`) | 3 files | Low | Easy |
| S8 | `login_history` → `login_logs` (dedupe) | `login_logs` | 1 file (audit_advanced_service) | Low | **Very Easy** |
| S9 | `user_sessions` (tenant) → retire; master `sessions` authoritative | — | 2 files | Low | Easy |
| S10 | `security_alerts` → `audit_logs` (`event_type:"security_alert"`) | `audit_logs` | 1 file | Low | Easy |
| S11 | `scheduled_reminders` + `scheduled_tasks` | `scheduler_jobs` | 2 files | Low | Easy |
| S12 | `smtp_config` → `company_settings` (sub-document) | `company_settings` | 3 files | Low | Easy |
| S13 | Retire dead: `payouts`, `contacts`, ghost `hrm_documents`, ghost `hrm_exit_requests`; fix `employees` refs | — | 4 files | Low | Easy (after data verification) |

**Net effect of the SAFE set alone: −27 collections.**

### 5.2 ⚠️ SAFE WITH MINOR CHANGES (medium risk, more touch points or data migration)

| # | Merge | Risk | Complexity | Notes |
|---|---|---|---|---|
| M1 | `partner_invoices` + `partner_payouts` → `partner_transactions` | Medium | Medium | 6 service files + Payouts/Invoices pages; same module, distinct financial semantics — keep `type` + status machine per type |
| M2 | `doc_template_versions` embed → `doc_templates`; `doc_approvals` embed → `doc_generated`; `doc_categories` → `catalogs` | Medium | Medium | document_center_service is 1 file but large (52 refs); version arrays can grow — cap or archive |
| M3 | `interview_stages` + `custom_fields` + `email_templates` → `settings_items` | Medium | Medium | interview_stages is read by application/interview services at runtime — needs careful read-path update |
| M4 | `pipeline_stages` embed → `pipelines` | Low-Med | Easy-Medium | interview_service + search read pipelines |
| M5 | `tenant_settings` merge → `company_settings` (single settings singleton) | Medium | Medium-Hard | 14 distinct files read one or both; config_resolution_service is the choke point — do last |
| M6 | `hrm_comp_off_credits` → unified leave ledger with `hrm_leave_balances` | Medium | Medium | production-audit invariants (comp-off credits) must be preserved; defer until leave module is next touched |
| M7 | `hrm_candidate_invitations` → embed on `hrm_candidates` (or S1 `tokens`) | Low-Med | Easy | one service file |
| M8 | `hrm_payroll_structure` → versioned sub-docs on `hrm_employees` | Medium | Medium | only payroll_service touches it, but salary history/versioning must survive — safer to keep |

### 5.3 ❌ NOT SAFE TO MERGE (keep separate)

**Recruitment core:** `users`, `roles`, `candidates`, `jobs`, `applications`, `interviews`, `clients`, `onboards`, `tasks`, `targets` (as absorber), `notifications`, `audit_logs`, `login_logs`, `saved_reports`, `public_forms`, `matching_results`, `integrations`, `departments`, `designations`, `company_settings`.

**HRM:** `hrm_employees`, `hrm_attendance`, `hrm_attendance_exceptions`, `hrm_leaves`, `hrm_leave_balances`, `hrm_leave_policies`, `hrm_holidays`, `hrm_shifts`, `hrm_shift_assignments`, `hrm_work_mode_requests`, `hrm_payroll`, `hrm_payslips`, `hrm_performance`, `hrm_assets`, `hrm_exit`, `hrm_announcements`, `hrm_calendar_events`, `hrm_jobs`, `hrm_candidates`, `hrm_interviews`, `hrm_offers`, `hrm_onboardings`.

**Document Center:** `doc_templates`, `doc_generated`.

Representative reasons:

- **`hrm_employees` — NO.** Referenced by 25 backend files, every HRM API and page, auth (login validator), notifications, reports, dashboards, hiring sync. Unique partial index guards a first-check-in race. High write volume. This is the HRM root entity.
- **`hrm_attendance` — NO.** Highest-growth collection (employees × days), unique per-day guard, background auto-checkout loop writes across all tenants, tz-aware invariants from the production audit. Any merge multiplies index size and lock contention on the busiest write path.
- **`hrm_payroll` / `hrm_payslips` — NO.** Financial records with locking/proration invariants; payslips are effectively immutable compliance artifacts. Merging financial ledgers with anything is audit-hostile.
- **`applications` — NO.** Carries a correctness-critical partial **unique** index (`candidate_id`+`job_id` on active docs). Merging would force partial-filter gymnastics on a shared collection and risk the duplicate-application guard.
- **`users` — NO.** Auth/permission source of truth; reporting-chain BFS on every non-admin request; consumed by 46 files.
- **`notifications` — NO merge**, but flag: **no index and no TTL** — it will grow unbounded; needs `(user_id, created_at)` index + TTL/archival (independent of consolidation).

---

## 6. Risk Analysis per Proposed Merge

| Merge | Risk | Why |
|---|---|---|
| S1 tokens | **Low** | Each token type has disjoint call sites; single-purpose short-lived docs; TTL index unifies cleanup |
| S2 hrm_security_audit | **Low** | Write-mostly logs from one file; no UI joins |
| S3 targets family | **Low** | One service owns all three; history is append-only |
| S4/S5 execution/data jobs | **Low** | Append-mostly operational logs; no cross-service reads |
| S6 catalogs | **Low** | Single API file owns all 9; all are tiny CRUD lists; needs `(company_id, kind)` index |
| S7 user_prefs | **Low** | Per-user singletons; only risk is doc-size if layouts get large — cap layout size |
| S8/S9/S10 audit dedupe | **Low** | Removes duplicated writes; must confirm the audit UI (`AuditLogsPage`, `LoginActivityPage`, `ActiveSessionsPage`) reads the surviving collection |
| S11 scheduler_jobs | **Low** | Two internal queues; ensure the scheduler polling query filters by `kind` |
| S12 smtp_config | **Low** | Singleton → sub-document; config_resolution fallback order must be preserved |
| M1 partner_transactions | **Medium** | Financial semantics differ (invoice lifecycle vs payout lifecycle); analytics/report aggregations must be rewritten with `type` filters |
| M2 doc center embed | **Medium** | Version arrays unbounded; approval status transitions concurrent with doc edits |
| M3 settings_items | **Medium** | interview_stages feeds the application state machine — a bad read breaks stage transitions |
| M5 settings singleton | **Medium-High** | 14 files, login hot path (attendance_login_validator reads company_settings at every login) — a regression here breaks logins, not just settings pages |
| M6 leave ledger | **Medium-High** | Comp-off and balance invariants from the production audit; concurrency on balance updates |
| Anything in §5.3 | **High/Critical** | Hot-path unique indexes, financial locking, background writers, 15–46 dependent files each |

---

## 7. Performance Impact Estimate

| Metric | Current | After SAFE set (S1–S13) | After SAFE + MINOR (M1–M8) |
|---|---|---|---|
| Collections per tenant | ~88 (incl. 3 dead + 2 ghosts) | **~61** | **~52** |
| Indexes per tenant | ~55 defined (many collections have **zero**) | ~50 (ghost indexes removed; +4 new `kind`/TTL compound indexes) | ~48 |
| Query cost | baseline | **Neutral to better** — merged collections are all small/low-traffic; each merged query adds an equality `kind`/`type` term covered by a compound index prefix | Neutral; M5 removes one settings round-trip per resolution |
| Write cost | baseline | **Slightly better** — dedupe removes double-writes (login_history vs login_logs, user_sessions vs sessions) | Same |
| Read cost | baseline | Neutral (hot collections untouched) | Neutral |
| Storage | baseline | **Lower** — ghost collections, dead legacy data, duplicated login/session docs removed; fewer per-collection minimums (~32 KB + index overhead each ×36 collections × N tenants) | Lower still |
| Ops overhead | 88 × N tenants namespaces | 61 × N (−30 % namespace count; matters for Atlas namespace/index limits as tenant count grows) | 52 × N (−40 %) |

The big performance wins available are actually **not** consolidation: adding indexes to `notifications`, `hrm_exit`, `hrm_leave_balances`, `hrm_shift_assignments`, `hrm_interviews`, and TTLs to token/log collections.

---

## 8. Migration Complexity Ratings

| Rating | Merges |
|---|---|
| **Very Easy** | S1 (tokens), S2 (hrm_security_audit), S4 (execution_logs), S8 (login_history dedupe) |
| **Easy** | S3, S5, S6, S7, S9, S10, S11, S12, S13 (retire dead/ghosts + fix `employees` refs) |
| **Medium** | M1, M2, M3, M4, M6, M7, M8 |
| **Hard** | M5 (settings singleton unification — login hot path) |
| **Very Hard / do not attempt** | Everything in §5.3 |

**Recommended migration strategy (when implementation is approved):**
1. **Fix bugs first, no migration needed:** `employees`→`hrm_employees` refs; re-point `hrm_exit_requests` indexes to `hrm_exit`; remove `hrm_documents` ghost index block.
2. **Dual-write window per merge:** new writes go to the target collection with `kind`/`type`; backfill script copies historical docs (idempotent, per-tenant, resumable across all `tenants.company_id` DBs — remember the company_id-vs-_id rule).
3. **Read cutover** behind a per-tenant flag; verify counts (`countDocuments` source vs `kind`-filtered target).
4. **Retire** old collections only after a full retention cycle (rename to `zz_archive_*` first, drop later).
5. Order: S13 (dead) → S1/S2/S4/S8 (very easy) → S3/S5/S6/S7/S9/S10/S11/S12 → M-series one at a time → M5 last.

---

## 9. Compatibility Report

| Question | Answer | Notes |
|---|---|---|
| Can existing APIs continue working? | **YES** | All merges are storage-level; API routes and response schemas unchanged. Service layer maps `kind`/`type` internally. |
| Can the frontend continue working? | **YES** | No frontend change needed for S-series; M1 (Invoices/Payouts pages) and M2 (Document Center) need no UI change if service responses stay shaped the same. |
| Can existing services continue working? | **YES, with edits** | Only the files listed per merge need collection-name + filter changes; no cross-service contract changes. |
| Would repository-layer changes be required? | **YES** | The collection-access sites listed in §5 (1–6 files per safe merge; ~14 for M5). There is no central repository abstraction — access is direct `db["…"]`, so each site is edited individually. |
| Would data migration be required? | **YES** | Backfill copies for every merge with existing data; token/log merges can optionally skip backfill (short-lived data) and run dual-read during the TTL window. |

---

## 10. Final Recommendation Table (tenant DB)

| Collection | Keep Separate | Merge | Risk | Complexity | Recommendation |
|---|---|---|---|---|---|
| users, roles, candidates, jobs, applications, interviews, clients, onboards | ✔ | — | Critical | — | Never merge |
| hrm_employees, hrm_attendance, hrm_payroll, hrm_payslips | ✔ | — | Critical | — | Never merge |
| hrm_leaves, hrm_leave_balances, hrm_leave_policies, hrm_holidays, hrm_shifts, hrm_shift_assignments, hrm_work_mode_requests, hrm_attendance_exceptions | ✔ | — | High | — | Keep (attendance/login hot paths) |
| hrm_performance, hrm_assets, hrm_exit, hrm_announcements, hrm_calendar_events | ✔ | — | Medium | — | Keep; add missing indexes (hrm_exit) |
| hrm_jobs, hrm_candidates, hrm_interviews, hrm_offers, hrm_onboardings | ✔ | — | High | — | Keep (active workflow chain) |
| doc_templates, doc_generated | ✔ | — | High | — | Keep |
| doc_template_versions, doc_approvals, doc_categories | — | ✔ embed/catalogs | Medium | Medium | Merge later (M2) |
| tasks, targets, notifications, audit_logs, login_logs, saved_reports, public_forms, matching_results, integrations, departments, designations, company_settings | ✔ | — | Med-High | — | Keep |
| candidate_form_tokens, employee_onboarding_tokens, hrm_doc_upload_tokens | — | ✔ `tokens` | Low | Very Easy | **Merge now** |
| hrm_geo_fence_audit, hrm_fraud_audit | — | ✔ `hrm_security_audit` | Low | Very Easy | **Merge now** |
| target_templates, target_history | — | ✔ `targets` | Low | Easy | **Merge now** |
| task_execution_logs, report_execution_logs | — | ✔ `execution_logs` | Low | Very Easy | **Merge now** |
| import_jobs, export_jobs, import_templates | — | ✔ `data_jobs` | Low | Easy | **Merge now** |
| branches, teams, skills, job_categories, candidate_sources, commission_rules, sla_rules, document_templates, pipeline_stages | — | ✔ `catalogs` | Low | Easy | **Merge now** |
| notification_preferences, dashboard_layouts, announcement_dismissals | — | ✔ `user_prefs` | Low | Easy | **Merge now** |
| login_history, user_sessions, security_alerts | — | ✔ into login_logs / retire / audit_logs | Low | Easy | **Merge now** (removes duplicate writes) |
| scheduled_reminders, scheduled_tasks | — | ✔ `scheduler_jobs` | Low | Easy | Merge now |
| smtp_config | — | ✔ `company_settings` | Low | Easy | Merge now |
| partner_invoices, partner_payouts | — | ✔ `partner_transactions` | Medium | Medium | Merge later |
| interview_stages, custom_fields, email_templates | — | ✔ `settings_items` | Medium | Medium | Merge later |
| pipelines + pipeline_stages | — | ✔ embed | Low-Med | Easy-Med | Merge later |
| tenant_settings → company_settings | — | ✔ | Med-High | Hard | Last, or skip |
| hrm_comp_off_credits (+leave ledger), hrm_payroll_structure, hrm_candidate_invitations | ✔ for now | possible | Medium | Medium | Defer |
| payouts, contacts, employees (refs), hrm_documents (ghost), hrm_exit_requests (ghost) | — | ✔ retire/fix | Low | Easy | **Clean up first** |

---

## 11. Architecture Recommendation

**Never merge:** `users`, `roles`, `candidates`, `jobs`, `applications` (unique-index guard), `interviews`, `clients`, `onboards`, `hrm_employees`, `hrm_attendance` (unique per-day guard + background writer), `hrm_payroll`, `hrm_payslips`, `audit_logs`, `notifications`, `company_settings`, `doc_templates`, `doc_generated`.

**Should merge (Phase 1 — the SAFE set):** tokens ×3→1, HRM security audits ×2→1, targets ×3→1, execution logs ×2→1, data jobs ×3→1, catalogs ×9→1, user prefs ×3→1, audit dedupe ×3→0/absorbed, scheduler ×2→1, smtp→settings, plus retirement of 5 dead/ghost collections. **−27 collections, all Low risk, Very Easy–Easy.**

**May merge later (Phase 2):** partner_transactions, Document Center satellites, settings_items, pipelines embed, leave ledger, settings-singleton unification (**last** — it sits on the login hot path).

**Expected reduction:** ~88 → ~61 (Phase 1) → ~52 (Phase 2) per tenant ≈ **40 %**.

**Performance impact:** neutral on hot paths (none are touched); modest write savings from removing duplicated login/session/audit writes; significant namespace/index-count relief at scale (N tenants × 36 fewer collections). The larger wins are the missing indexes and TTLs flagged in §7 — recommend bundling them into Phase 1.

**Maintenance impact:** positive — one token model, one catalog CRUD, one ops-log shape; fewer per-tenant namespaces to index-init; `indexes.py` shrinks and stops indexing ghosts.

**Scalability impact:** positive — per-tenant namespace count is the main MongoDB-Atlas scaling constraint of the DB-per-tenant design; a 40 % cut raises the tenant ceiling per cluster proportionally.

**Recommended final tenant architecture (~52 collections):** 20 recruitment/CRM core + 22 HRM workflow + 2 document center + `catalogs`, `settings_items`, `tokens`, `user_prefs`, `data_jobs`, `execution_logs`, `scheduler_jobs`, `hrm_security_audit`, `partner_transactions`, unified `company_settings`.

---

*Report generated by static analysis on 2026-07-19. No code, data, or schema was modified. Record counts are qualitative estimates — run `db.stats()`/`collStats` per tenant before finalizing the migration order.*
