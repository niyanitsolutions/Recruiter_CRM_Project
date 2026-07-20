# Nested Document Suitability & Architecture Report

**Date:** 2026-07-19
**Scope:** Analysis only — no code, database, API, or schema changes were made.
**Companion to:** [COLLECTION_CONSOLIDATION_REPORT.md](COLLECTION_CONSOLIDATION_REPORT.md) (2026-07-19). This report evaluates the collections that **remain after** the consolidation plan (~52 per tenant) and decides, per relationship, whether data should be embedded, referenced, or hybrid.
**Method:** Static analysis of every Pydantic model in `backend/app/models/company/*.py` (11,700 lines), cross-checked against the service/API access map built for the consolidation report, `app/core/indexes.py`, and the background loops in `app/main.py`.

---

## 1. Executive Summary

**The schema is already ~90 % correctly nested.** This codebase does not suffer from the classic "relational schema in MongoDB" anti-pattern. Every major entity already embeds its bounded one-to-few sub-data and references its unbounded one-to-many data:

| Already embedded (verified in models) | Already referenced (verified) |
|---|---|
| Candidate: `skills`, `education`, `work_experience`, `certifications`, `languages`, `documents` (metadata), `custom_fields`, `tags`, `parsed_data` | Candidate → applications, interviews, matching_results |
| Employee: `emergency_contacts`, `address` objects, `qualifications`, `bank details`, `salary_components`, `disciplinary_records`, `background_verification`, `documents[]` (metadata + `file_url`) | Employee → attendance, leaves, payroll, payslips, performance, assets, exit |
| Job: `skills_required`, `education_required`, `locations`, `eligibility_criteria`, `custom_fields`, `tags`, `assigned_coordinators` | Job → applications, interviews, onboards |
| Client: `contact_persons[]`, GST/PAN, agreement terms, counters | Client → jobs, invoices |
| Application: `stage_history[]` | Application → candidate, job (IDs) |
| Interview: `rounds[]`, `feedback.skill_ratings[]`, `reschedule_history[]` | Interview → candidate, job, application (IDs) |
| Onboard: `documents[]`, `status_history[]`, `reminder_logs[]`, `doj_extension_reasons[]` | Onboard → partner_payouts |
| Asset: `assignment_history[]` | — |
| Performance review: `goals[]`, `review_points[]` | Per-cycle review = separate doc (correct) |
| HRM Job: `interview_rounds[]`, `required_skills[]` | HRM Job → hrm_candidates |
| Partner invoice: `items[]`, `payout_ids[]` | Invoice → payouts (by ID) |
| Doc templates/generated: full `html_content`, `canvas_elements[]`, `field_values{}` | Generated → template (ID) |

Files are stored as **URLs/paths only** (`file_url` in `DocumentItem` / `EmployeeDocument`) — no base64 blobs in documents. No collection is anywhere near the 16 MB limit.

**Remaining opportunities are small and low-risk:** 5 safe embeds (mostly 1:1 per-user/singleton data that the consolidation report already groups), 4 hybrids, and **zero** cases where un-embedding is required. The main risks found are three **unbounded embedded arrays** that need caps, and two **large-field** watch items (`candidates.parsed_data`, Document Center `html_content`).

---

## 2. Collection Audit (post-consolidation set)

Sizes are estimates from model shape (field count × typical content); actual figures should be confirmed with `collStats` before any change. R/W/U/D = read/write/update/delete frequency (H/M/L).

### 2.1 Core CRM

| Collection | Purpose | Growth | Avg / Max doc size | R/W/U/D | Relationships | Indexes | Bg jobs | Suitable for nesting? |
|---|---|---|---|---|---|---|---|---|
| `users` | Auth + permissions + reporting chain | Slow (10–500) | 2–4 KB / 10 KB | H/L/M/L | 1:N → everything (ownership); 1:1 → hrm_employees (`crm_user_id`) | role, email, reporting_to | — | **PARTIAL** — absorb per-user prefs (§4.1); never absorb anything transactional |
| `candidates` | Candidate master | Linear 1k–100k | 5–30 KB / ~200 KB (`parsed_data`-heavy) | H/H/M/L | 1:N → applications, interviews; N:M → jobs via applications | status_date, email | import/export | **YES (already done)** — profile fully embedded; watch `parsed_data` (§6) |
| `jobs` | Job requisitions | Linear 100–10k | 4–15 KB / 50 KB | H/M/M/L | N:1 → clients; 1:N → applications | status_date, client, priority_date | — | **YES (already done)** — requirements embedded; applications stay referenced |
| `applications` | Candidate↔job state machine | Linear 5k–500k | 2–5 KB / 20 KB | H/H/H/L | N:1 → candidate, job; 1:1..few → interviews | unique partial cand+job, job_status, applied_date | — | **NO further nesting** — `stage_history` already embedded (bounded by pipeline); the collection itself must never be embedded into candidate or job (unbounded, unique-index guard) |
| `interviews` | Scheduling + feedback | Linear | 3–10 KB / 40 KB | H/H/H/L | N:1 → application/candidate/job; N:M → users (interviewer_ids) | status_date, candidate | notifications/emails | **NO further** — rounds/feedback/reschedules already embedded; keep separate (calendar queries, interviewer-centric lists) |
| `clients` | Client companies | Slow | 3–8 KB / 30 KB | H/M/M/L | 1:N → jobs; contacts embedded | status | — | **YES (already done)** — contacts/GST embedded; jobs & invoices stay referenced (denormalized counters `total_jobs`, `active_jobs`, `total_placements` already exist) |
| `onboards` | Placements | Linear | 4–12 KB / 60 KB | M/M/M/L | N:1 → application chain; 1:N → partner_payouts | status_date, partner | scheduler | **PARTIAL** — already embeds docs/status; **cap `reminder_logs`** (§6) |
| `tasks` | CRM tasks | Linear | 1–2 KB | M/M/M/M | N:1 → users, candidates/jobs (loose refs) | none | — | **NO** — standalone by design |
| `targets` (+ absorbed templates/history) | Targets & achievement | Periodic | 2–5 KB | M/M/M/L | N:1 → users; computed from candidates/interviews/onboards | none | — | **NO** — achievement is aggregation over other collections; embedding rollups beyond current counters adds staleness |
| `matching_results` | AI match cache | Linear (cache) | 2–10 KB | M/M/L/M | N:1 → job, candidate | none | — | **NO** — cache; belongs outside both parents (regenerable). Keep ATS breakdown embedded *inside the result doc* as it is |
| `notifications` | In-app feed | High | 0.5–1 KB | H/H/M/M | N:1 → users | none ⚠️ | reminder queue | **NO** — unlimited growth; never embed in users |
| `audit_logs`, `login_logs` | Trails | High | 0.5–2 KB | M/H/–/– | N:1 → users | date, user_date | — | **NO** — append-only, unbounded |
| `saved_reports`, `public_forms`, `integrations`, `catalogs`, `settings_items`, `tokens`, `data_jobs`, `execution_logs`, `scheduler_jobs` | Config/ops (post-consolidation) | Slow/linear | 1–5 KB | M/L | mostly self-contained | kind/type compound (planned) | scheduler | **NO** — already flat, purpose-built |
| `company_settings` (+ smtp) | Tenant settings singleton | Static | 5–20 KB / 100 KB | **H**/–/M/– | read by login hot path | singleton | — | **YES** — it is the natural nest target for smtp/tenant_settings singletons (§4.2) |

### 2.2 HRM

| Collection | Purpose | Growth | Avg / Max size | R/W/U/D | Relationships | Suitable for nesting? |
|---|---|---|---|---|---|---|
| `hrm_employees` | Employee master | Slow (10–5k) | 10–40 KB / ~300 KB (documents-heavy) | H/M/H/L | hub of all HRM; 1:1 → users | **PARTIAL** — already embeds everything bounded; candidates for *additional* embed: current shift assignment, payroll structure (§4.3). Never embed transactions |
| `hrm_attendance` | One doc per employee-day | **Highest** (emp × ~250/yr) | 0.5–1 KB | H/H/H/– | N:1 → employee | **NO — NEVER** into employee: 250 docs/emp/yr; unique per-day index; background auto-checkout writer; date-range aggregations need collection-level scans |
| `hrm_leaves` | Leave requests | Linear | 1–2 KB | H/M/H/– | N:1 → employee; debits balances | **NO** — unbounded events |
| `hrm_leave_balances` | Per-emp/type balances | = emp × types | 0.5 KB | H/H/–/– | 1:1..few → employee | **HYBRID candidate** (§4.4) — but concurrency argues keep separate |
| `hrm_comp_off_credits` | Credit ledger | Linear | 0.5 KB | M/M | N:1 → employee | **NO** — ledger, append-only (audit invariants) |
| `hrm_holidays`, `hrm_shifts` | Reference data | Static | 0.5–2 KB | H/L | shared by all employees | **NO** — shared lookups; embedding would duplicate per employee |
| `hrm_shift_assignments` | Emp↔shift mapping | = employees | 0.5 KB | H/M | 1:1 current + history | **HYBRID** — current assignment could live on employee; history separate (§4.3) |
| `hrm_payroll`, `hrm_payslips` | Payroll runs / payslips | emp × months | 2–8 KB | M/M | N:1 → employee | **NO — NEVER** — financial, locked, monthly growth, compliance |
| `hrm_payroll_structure` | Salary structure | = employees (versioned) | 1–3 KB | M/L | 1:few → employee | **HYBRID candidate** — versioned array on employee is feasible (bounded by revisions); `salary_components` already embedded on employee, so this is partially duplicated today (§4.3) |
| `hrm_performance` | Review cycles | emp × cycles | 3–10 KB | M/M | N:1 → employee; embeds goals/review_points ✓ | **NO further** — per-cycle doc is the right grain |
| `hrm_assets` | Assets + QR | 100s | 2–5 KB / 50 KB | M/M | N:1 assigned_to; embeds `assignment_history` ✓ | **PARTIAL** — cap/archive `assignment_history` (§6) |
| `hrm_exit` | Exit workflow | Slow | 3–8 KB | M/M | 1:1 → employee (terminal) | **NO** — workflow with own lifecycle/approvals; checklist already embedded in it |
| `hrm_work_mode_requests`, `hrm_attendance_exceptions` | Requests/exceptions | Linear/small | 1 KB | H(login)/M | N:1 → employee | **NO** — login-hot-path reads; separate keeps validator queries cheap |
| `hrm_announcements`, `hrm_calendar_events` | Comms/calendar | Slow/linear | 1–3 KB | M/M | company-wide | **NO** — broadcast data, no parent |
| `hrm_jobs` → `hrm_candidates` → `hrm_interviews` → `hrm_offers` → `hrm_onboardings` | Internal hiring chain | Slow | 2–10 KB | M/M | workflow chain | **NO merging of chain**; `hrm_jobs.interview_rounds` already embedded ✓; invitations → tokens (consolidation S1) |
| `hrm_security_audit` (merged), `hrm_leave_policies` | Logs / policy defs | Linear / static | 0.5–3 KB | L–M | — | **NO** — logs unbounded; policies are shared reference data |
| Document Center: `doc_templates`, `doc_generated` | WYSIWYG templates / outputs | Slow / linear | **10–500 KB** (html_content) / MB-scale possible | M/M | generated → template ref | **NO further embedding** — these are the *largest* docs in the system; versions should stay separate or capped (§6), contrary to a naive read of consolidation item M2 |

---

## 3. Field Classification (representative major models)

Classification: **P**=primitive, **O**=object, **A**=array, **R**=reference (ID string), **E**=embedded sub-document(s), **G**=generated/denormalized, **T**=temporary, **C**=cache.

### `candidates`
| Field group | Class | Notes |
|---|---|---|
| name/email/phone/status/source/notice_period… | P | scalars |
| `skills[]` (SkillItem), `education[]`, `work_experience[]`, `certifications[]`, `languages[]` | A+E | bounded (≈5–40 items) ✓ correct embed |
| `skill_tags[]`, `tags[]`, `preferred_locations[]`, `preferred_job_types[]` | A(P) | denormalized for search (G) — candidates for multikey index |
| `documents[]` (DocumentItem, `file_url`) | A+E | metadata only, bounded ✓ |
| `parsed_data` | O + **C** | raw resume-parser JSON — regenerable cache, size outlier (§6) |
| `custom_fields[]` | A+E | values embedded; definitions referenced in `custom_fields` collection ✓ hybrid done right |
| created_by/updated_by | R → users | keep as reference |
| `is_deleted`, `deleted_*` | P (lifecycle) | trash system dependency |

### `hrm_employees`
| Field group | Class | Notes |
|---|---|---|
| identity, employment_status, joining_date (single source of truth), department, designation | P (+R by name to catalogs) | |
| `crm_user_id` | R → users | 1:1, unique partial index — **must stay a reference** (auth lives in users) |
| `emergency_contacts[]`, address objects, `qualifications[]`, `disciplinary_records[]` | A+E / O+E | bounded ✓ |
| BankDetails, BackgroundVerification, SalaryStructure/`salary_components{}` | O+E | 1:1 ✓ |
| `documents[]` (EmployeeDocument: type, `file_url`, status workflow) | A+E | multi-upload; bounded in practice (10–50); metadata only ✓ |
| workflow_status / onboarding fields | P+G | status automation |
| attendance/leave/payroll/performance/asset/exit data | **NOT present** — referenced from child collections | ✓ correct |

### `applications`
`candidate_id`, `job_id` (R, unique-guarded) · status/state machine (P) · `stage_history[]` (A+E, bounded by pipeline length ✓) · applied_at, counters (P/G).

### `interviews`
`candidate_id`/`job_id`/`application_id` (R) · `interviewer_ids[]` (A+R → users; N:M kept as ID array ✓ correct for Mongo) · `rounds[]` (A+E, from `hrm_jobs.interview_rounds`/job config, bounded) · `feedback` + `skill_ratings[]` (O/A+E) · `reschedule_history[]` (A+E, small).

### `jobs`
`client_id` (R) · `skills_required[]`, `education_required[]`, `eligibility_criteria` (A/O+E ✓) · `assigned_coordinators[]` (A+R) · salary/experience ranges (O+E) · counters (G).

### `clients`
`contact_persons[]` (A+E ✓) · GST/PAN/agreement (P/O) · `total_jobs`/`active_jobs`/`total_placements` (G — denormalized counters maintained by job/onboard services) · jobs/invoices (R, child collections ✓).

### `onboards`
application/candidate/job/partner refs (R) · `documents[]`, `documents_required[]`, `status_history[]` (A+E ✓) · `reminder_logs[]` (A+E — **unbounded, cap**) · DOJ fields (P).

### `doc_generated`
`template_id` (R) · `html_content` (P — **large**) · `field_values{}` (O+E) · approval state (P; approvals collection separate — consolidation proposes embedding, this report concurs with a status-subdocument, history capped).

---

## 4. Relationship Analysis & Nesting Verdicts

Classification per relationship: cardinality → verdict (**Embed / Reference / Separate / Hybrid**).

### 4.1 Safe to Embed (new opportunities — all Low risk)

| # | Relationship | Cardinality | Verdict | Why safe |
|---|---|---|---|---|
| N1 | `users` ← notification_preferences | 1:1 | **Embed** as `users.preferences.notifications` | Read together at session start; written rarely; ~1 KB; only `notification_service` touches it |
| N2 | `users` ← dashboard_layouts | 1:1 | **Embed** as `users.preferences.dashboard` | Same access pattern; cap layout JSON size (~10 KB) |
| N3 | `users` ← announcement_dismissals | 1:few (bounded by announcement count) | **Embed** `users.dismissed_announcements[]` (IDs) | Tiny ID array; read on every page load alongside user anyway |
| N4 | `company_settings` ← smtp_config | 1:1 singleton | **Embed** as `company_settings.smtp` | Config-resolution already falls through tenant→platform; one fewer round-trip per email send |
| N5 | `pipelines` ← pipeline_stages | 1:few (5–30, bounded) | **Embed** `pipelines.stages[]` | Stages are always read with their pipeline; ordering is positional — arrays model this better than a separate collection |

> N1–N4 are the *nested-document form* of consolidation items S7/S12 — implementing them as embeds instead of a `user_prefs` collection is the better end-state; either satisfies the consolidation goal.

### 4.2 Keep Reference (correct as-is — do not embed)

| Relationship | Cardinality | Why |
|---|---|---|
| candidate → applications → job | N:M via junction | Junction collection carries its own state machine + **partial unique index** (duplicate-application guard). Embedding in either parent breaks the guard and creates unbounded arrays |
| candidate/application → interviews | 1:N unbounded | Interviewer-centric and calendar-centric queries need collection-level indexes (`interview_status_date`) |
| employee → attendance / leaves / payroll / payslips / comp-off / performance / exit | 1:N unbounded (attendance = 250/yr/emp) | Unlimited growth; unique per-day guard; background writer (`hrm_auto_checkout_loop`); date-range dashboards aggregate across employees, not within one |
| client → jobs, jobs → applications | 1:N unbounded | Already denormalized with counters — the right pattern |
| users ↔ interviews (interviewer_ids), jobs (assigned_coordinators) | N:M | ID arrays on the many-side — already correct Mongo idiom |
| everything → users (created_by/owner) | N:1 | Auth identity must remain single-source |
| hrm hiring chain (jobs→candidates→interviews→offers→onboardings) | 1:N workflow | Each stage has its own lifecycle, approvals, and notifications |
| employees → hrm_holidays / hrm_shifts / hrm_leave_policies / catalogs | N:1 shared reference data | Embedding would copy shared config into thousands of docs and make policy edits O(employees) |

### 4.3 Hybrid (embed part, reference the rest — Medium)

| # | Proposal | Pattern | Risk |
|---|---|---|---|
| H1 | `hrm_shift_assignments` → put **current** assignment on `hrm_employees.current_shift {shift_id, from_date}`, keep historical assignments separate (or in `hrm_security_audit`-style log) | "latest-on-parent, history-in-child" | Medium — attendance_service reads assignment on hot path; would actually *save* a lookup per check-in |
| H2 | `hrm_payroll_structure` → versioned array `hrm_employees.salary_structures[]` (append per revision, bounded by comp changes) | versioned embed | Medium — payroll_service is sole consumer; note employee model already embeds `salary_components{}`, so today there are **two** sources — unifying them is the real win |
| H3 | `candidates.parsed_data` → keep a **summary** embedded (skills/education already extracted) and move the raw parser JSON to a side collection or object storage when > ~64 KB | "embed summary, reference blob" | Low — parsed_data is a regenerable cache; only candidate_service reads it |
| H4 | `doc_approvals` → embed **current approval status** + last decision on `doc_generated`, keep full approval event history separate (or capped array) | status-on-parent | Medium — refines consolidation item M2 |
| H5 | `hrm_leave_balances` → could embed as `hrm_employees.leave_balances{type: {allocated, used, pending}}` | 1:few embed | **Recommend NOT now** — balances are updated concurrently by leave approval + comp-off credit + year-reset flows; separate docs with atomic `$inc` are safer than array/nested updates racing profile edits. Revisit only with a transactional rewrite |

### 4.4 Keep Separate Collection (explicitly rejected embeds)

`notifications` into users (unbounded, hot writes) · attendance/leave/payroll/payslips into employee (unbounded + financial) · applications into candidate or job (junction + unique guard) · audit/login logs into anything (append-only) · interviews into applications (calendar/interviewer queries) · doc_generated into doc_templates (size) · catalogs into company_settings (independently editable lists with their own CRUD UI) · hrm_holidays/shifts/policies into employees (shared reference data).

---

## 5. Entity-by-Entity Summary (requested format)

**Employee (`hrm_employees`)** — can safely hold (already does ✓): emergency contacts, addresses, education/qualifications, certifications, bank details, identity-document **metadata** (`documents[]` with `file_url`), background verification, disciplinary records, salary components, preferences. New candidates: current shift (H1), salary-structure versions (H2). Cannot hold: attendance, leaves, leave ledger, payroll, payslips, performance history, assets, exit workflow — unlimited growth, financial locking, background writers.

**Candidate (`candidates`)** — can safely hold (already does ✓): skills + skill_tags, education, languages, certifications, work experience, social/preference fields, resume **metadata**, ATS/custom-field values. Watch: `parsed_data` (H3). Cannot hold: applications, interview history, matching results, unlimited notes/audit trail.

**Job (`jobs`)** — can safely hold (already does ✓): required skills, education requirements, eligibility criteria, locations, salary/experience ranges, custom questions/fields, tags, attachment metadata. Cannot hold: applications, candidate matches, interview records, audit logs.

**Client (`clients`)** — can safely hold (already does ✓): contacts, addresses, billing/GST details, agreement terms, custom fields, denormalized counters. Cannot hold: jobs, invoices, payments, audit logs.

**HRM chain** — Employee ✓ profile-embedded; Attendance → separate; Payroll → separate; Leave → separate; Payslip → separate; Performance → separate per-cycle docs (goals embedded within each ✓).

---

## 6. Document Size & 16 MB Analysis

| Doc type | Avg today (est.) | Max realistic | 16 MB risk | Action (flag only) |
|---|---|---|---|---|
| candidates | 5–30 KB | ~200 KB if parser dumps large `parsed_data` | **NO** | H3: externalize parsed_data > 64 KB; regenerable |
| hrm_employees | 10–40 KB | ~300 KB (50+ documents metadata + history arrays) | **NO** | monitor `documents[]`; metadata-only keeps it safe |
| doc_generated / doc_templates / versions | 10–500 KB (`html_content`) | **MB-scale** if data-URI images ever land in HTML (none found in code today) | **NO today; highest structural risk** | add a size guard on save; keep versions separate or capped at N |
| onboards | 4–12 KB | 60 KB+ via `reminder_logs[]` | NO | cap reminder_logs (keep last ~50, count field) |
| hrm_assets | 2–5 KB | 50 KB via `assignment_history[]` | NO | cap/archive history after ~100 entries |
| applications / interviews | 2–10 KB | 40 KB (`stage_history`, `rounds`) | NO | bounded by pipeline/rounds — fine |
| Hypothetical: attendance embedded in employee | — | 0.5 KB × 250/yr = ~125 KB/yr/emp → 1.25 MB in 10 yrs **plus** document-move churn on every punch-in | Would not hit 16 MB soon, but destroys write performance & indexes | confirms **never embed** |

**Would any *recommended* embedding exceed 16 MB? NO.** All proposed embeds (N1–N5, H1–H4) are 1:1 or bounded 1:few, adding ≤ ~15 KB per parent doc.

---

## 7. Query, Index & Dashboard Impact

**Query analysis.** Current hot paths already avoid joins: list endpoints filter one collection by compound index; the only recurring "join" patterns are (a) `$lookup`-free two-step fetches (application → candidate names via denormalized fields), (b) settings resolution (platform → tenant → smtp: N4 removes one read per email), (c) attendance check-in reading shift assignment (H1 removes one read per punch-in). The N-series embeds remove 2–3 small reads per user session (prefs, layouts, dismissals).

- Would embedding reduce joins? **Yes, marginally** (N1–N5, H1: one round-trip each on frequent paths).
- Would embedding increase update cost? **Slightly** for N1–N3 (updates target `users` doc; low write rates make this negligible). H5 (leave balances) is where update cost/concurrency *would* bite — which is why it's rejected.
- Would embedding improve read performance? Yes for session bootstrap, email send, and check-in paths. No measurable effect elsewhere.
- Would embedding hurt write performance? Only if the rejected embeds were done (attendance/notifications into parents — document-move churn, index rewrite amplification). Recommended set: no.

**Index impact.**

| Proposal | Index consequence |
|---|---|
| N1–N3 (users prefs) | None — prefs are never queried by value; existing `user_role`/`user_email`/`user_reporting_to` untouched |
| N4 (smtp in settings) | None — singleton `find_one({})` |
| N5 (pipeline stages) | Drop future need for a `pipeline_stages` index; stage lookups become in-document; no multikey needed (stages fetched with parent) |
| H1 (current shift on employee) | Optional `(company_id, current_shift.shift_id)` compound if "who is on shift X" queries exist; otherwise none |
| H2 (salary versions) | None — payroll reads by employee `_id` |
| Existing embedded arrays (`skill_tags`, `tags`, `interviewer_ids`) | Already multikey-eligible; **no multikey indexes exist today** — if search filters on skills/tags become slow, add `(company_id, skill_tags)` multikey (works fine on embedded arrays) |
| All current compound indexes | Unaffected — every recommended embed touches non-indexed fields only |

**Dashboard/report/search impact.** `admin_dashboard`, `hrm_dashboard_service`, `analytics_service`, `report_service`, and `search_service` aggregate **across** parents (counts by status/date). None of the recommended embeds change those collections' shapes, so dashboards, filters, pagination, sorting, and aggregations are unaffected. The rejected embeds are rejected precisely because they *would* degrade these (e.g., attendance-in-employee would turn date-range aggregations into `$unwind` scans). Search (`search_service`) reads `candidates`, `jobs`, `employees`(⚠ bug → `hrm_employees`), `doc_generated`, `pipelines`, `targets`, `tasks` at top level — unaffected.

---

## 8. Migration Impact & Production Safety

| Proposal | Migration | Safety | Frontend / business-logic changes? |
|---|---|---|---|
| N1 notification prefs → users | **Very Easy** (copy 1 doc per user) | **Low risk** | None — service-internal read/write path only |
| N2 dashboard layouts → users | **Very Easy** | **Low risk** | None |
| N3 dismissals → users | **Very Easy** (or skip backfill; dismissals re-accumulate) | **Low risk** | None |
| N4 smtp → company_settings | **Easy** (singleton copy; keep fallback read during transition) | **Low risk** (email path — verify with one tenant first) | None |
| N5 stages → pipelines | **Easy** (group stages by pipeline_id into array) | **Low risk** | None if API response keeps same shape |
| H1 current shift on employee | **Medium** (backfill latest assignment; dual-read window) | **Medium** (attendance hot path) | None |
| H2 salary structure versions | **Medium** (merge with existing `salary_components`) | **Medium** (payroll correctness — do between payroll cycles) | None |
| H3 parsed_data externalization | **Medium** (lazy: move on next parse) | **Low** | None |
| H4 approval status on doc_generated | **Medium** | **Medium** | None |
| H5 leave balances embed | — | **High → rejected** | — |
| Any §4.4 rejected embed | — | **Critical → rejected** | — |

All N-series and H-series proposals require **zero frontend changes and zero business-logic changes** — they alter only where services read/write the same data.

---

## 9. Final Recommendation Table

| Collection | Safe to Nest | Keep Separate | Hybrid | Risk | Recommendation |
|---|---|---|---|---|---|
| users | prefs/layouts/dismissals **into** it (N1–N3) | core doc | — | Low | Absorb per-user 1:1 data; nothing else |
| candidates | already fully nested | applications, interviews, matches | parsed_data (H3) | Low | No structural change; cap/externalize parsed_data |
| jobs | already fully nested | applications | — | Low | No change |
| applications | stage_history ✓ | itself (junction) | — | Critical if embedded | Never embed into parents |
| interviews | rounds/feedback ✓ | itself | — | High | Keep separate |
| clients | contacts/GST ✓ | jobs, invoices | — | Low | No change |
| onboards | docs/status ✓ | payouts | cap reminder_logs | Low | Cap array |
| pipelines | **stages (N5)** | — | — | Low | Embed stages |
| company_settings | **smtp (N4)**, later tenant_settings | catalogs | — | Low–Med | Single settings doc end-state |
| hrm_employees | profile data ✓ | attendance, leaves, payroll, payslips, performance, assets, exit, ledger | current shift (H1), salary versions (H2) | Med | Hybrids optional, later |
| hrm_attendance | — | ✔ **NEVER nest** | — | Critical | Untouchable |
| hrm_leaves / comp_off / balances | — | ✔ | balances rejected (H5) | High | Keep ledger pattern |
| hrm_payroll / payslips / structure | — | ✔ | structure (H2) | Critical | Financial — separate |
| hrm_performance | goals ✓ | per-cycle docs | — | Med | No change |
| hrm_assets | history ✓ (cap) | — | — | Low | Cap history |
| hrm hiring chain | interview_rounds ✓ | chain stays referenced | invitations → tokens | Med | No embedding across stages |
| doc_templates / doc_generated | — | ✔ (size) | approval status (H4), versions capped | Med | Treat as large-object store; size guard |
| notifications, audit_logs, login_logs, tokens, data_jobs, execution_logs, scheduler_jobs, catalogs, settings_items | — | ✔ | — | — | Flat & separate by design |

---

## 10. Recommended Final Architecture

```
TENANT DB (~48–50 collections after consolidation + N-series embeds)

users ─┬─ EMBED: profile, permissions[], preferences{notifications, dashboard_layout},
       │         dismissed_announcements[]
       └─ REF: hrm_employees.crm_user_id, all created_by/owner fields

candidates ─┬─ EMBED: skills[], skill_tags[], education[], work_experience[],
            │        certifications[], languages[], documents[](metadata),
            │        custom_fields[], preferences, parsed_summary
            ├─ EXTERNAL (H3): raw parsed_data blob when large
            └─ REF: applications, interviews, matching_results

jobs ─┬─ EMBED: skills_required[], education_required[], eligibility_criteria,
      │        locations[], ranges, custom_fields[], tags[]
      └─ REF: client_id, applications, assigned_coordinators[](user IDs)

applications (junction; unique guard) ── EMBED: stage_history[] ── REF: candidate_id, job_id
interviews ── EMBED: rounds[], feedback{skill_ratings[]}, reschedule_history[]
            ── REF: application/candidate/job, interviewer_ids[]
clients ── EMBED: contact_persons[], gst/pan, agreement, counters(G) ── REF: jobs, partner_transactions
onboards ── EMBED: documents[], status_history[], reminder_logs[](capped) ── REF: partner payouts
pipelines ── EMBED: stages[] (N5)
company_settings (singleton) ── EMBED: hrm policies, smtp (N4), [later: tenant_settings sections]

hrm_employees ─┬─ EMBED: emergency_contacts[], addresses, qualifications[],
               │        bank_details, salary_components{} (+ H2 versions),
               │        documents[](metadata+file_url), background_verification,
               │        disciplinary_records[], current_shift (H1)
               └─ REF (child collections, NEVER embedded):
                    hrm_attendance (1 doc/emp/day, unique guard)
                    hrm_leaves + hrm_comp_off_credits + hrm_leave_balances (ledger)
                    hrm_payroll → hrm_payslips (financial, locked)
                    hrm_performance (per cycle; goals embedded inside)
                    hrm_assets (assignment_history embedded, capped)
                    hrm_exit (workflow)

hrm_jobs ── EMBED interview_rounds[] ──► hrm_candidates ──► hrm_interviews ──► hrm_offers
        ──► hrm_onboardings ──► creates hrm_employees   (all REF chain)

doc_templates (large html) ──► doc_generated (EMBED field_values{}, approval_status (H4))
Shared flat: catalogs, settings_items, tokens, notifications, audit_logs, login_logs,
             data_jobs, execution_logs, scheduler_jobs, saved_reports, public_forms,
             integrations, hrm_security_audit, hrm_holidays, hrm_shifts, hrm_leave_policies,
             hrm_announcements, hrm_calendar_events, targets, tasks, matching_results,
             partner_transactions
```

## 11. Estimates

| Metric | Value |
|---|---|
| Collections today | ~88 per tenant |
| After consolidation (companion report) | ~61 (Phase 1) → ~52 (Phase 2) |
| After nesting (N1–N5 replace `user_prefs` + absorb smtp + pipeline_stages) | **~48–50** |
| Avg doc size change | `users` +1–5 KB; `pipelines` +2–10 KB; `company_settings` +1 KB; all others unchanged |
| Storage impact | Slightly lower (fewer collections/indexes; removal of duplicated salary structure + dismissal/pref docs) |
| Performance impact | Neutral-to-positive: −1 read on email send, −1 on punch-in (H1), −2–3 on session bootstrap; hot-path collections untouched |
| Scalability impact | Positive: lower namespace count; no new large-array growth vectors introduced |
| Maintenance impact | Positive: one settings singleton, prefs live with the user, pipeline+stages one unit; fewer "two sources of truth" (salary structure) |

## 12. Success-Criteria Answers (TL;DR)

1. **Never nest:** attendance, leaves, leave/comp-off ledgers, payroll, payslips, performance cycles, applications, interviews, notifications, audit/login logs, tokens, generated documents — unbounded growth, unique-index guards, financial locking, background writers.
2. **Should nest (safe now):** notification prefs, dashboard layouts, announcement dismissals → `users`; smtp → `company_settings`; stages → `pipelines`.
3. **May nest later (hybrid):** current shift + salary-structure versions → `hrm_employees`; approval status → `doc_generated`; parsed_data externalization.
4. **Arrays that will grow too large without caps:** `onboards.reminder_logs`, `hrm_assets.assignment_history`, `doc_template_versions` (if embedded), `candidates.parsed_data` (single large field).
5. **16 MB risk:** none today; only structural risk is Document Center `html_content` if data-URI images are ever allowed — add a size guard.
6. **Relationships that stay references:** every 1:N-unbounded and the candidate↔job junction; N:M via ID arrays (already idiomatic).
7. **Embeds that improve performance:** N1–N5 and H1 (fewer round-trips on login/session, email, and check-in paths).
8. **Safe for production SaaS:** the entire N-series (Low risk, Very Easy–Easy migration, dual-read transition).
9. **Zero frontend/business-logic change:** all N-series and H-series proposals — service-internal only.
10. **Final architecture:** §10 — the current design is already the correct nested architecture; adopt N1–N5, cap the three flagged arrays, keep every transactional/financial/event stream as a separate collection.

---

*Analysis-only report generated 2026-07-19 from model and service source inspection. Document sizes are model-based estimates — validate with `db.collection.stats()` and `$bsonSize` sampling per tenant before implementing any proposal.*
