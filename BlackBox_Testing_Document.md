# BlackBox Testing Document — CRM Recruitment Platform
**Version**: 1.0  
**Date**: 2026-04-06  
**Type**: Black Box / Functional Testing  
**Environment**: Staging / QA  

---

## Table of Contents

1. [Test Scope & Conventions](#1-test-scope--conventions)
2. [Authentication Module](#2-authentication-module)
3. [Trial & Subscription Module](#3-trial--subscription-module)
4. [Super-Admin Portal](#4-super-admin-portal)
5. [Seller Portal](#5-seller-portal)
6. [Dashboard](#6-dashboard)
7. [Users & Roles Module](#7-users--roles-module)
8. [Partners Module](#8-partners-module)
9. [Departments & Designations Module](#9-departments--designations-module)
10. [Candidates Module](#10-candidates-module)
11. [Jobs Module](#11-jobs-module)
12. [Clients Module](#12-clients-module)
13. [Applications Module](#13-applications-module)
14. [Interviews Module](#14-interviews-module)
15. [Onboarding Module](#15-onboarding-module)
16. [Payouts & Invoices Module](#16-payouts--invoices-module)
17. [Tasks Module](#17-tasks-module)
18. [Reports & Analytics Module](#18-reports--analytics-module)
19. [Targets & Leaderboard Module](#19-targets--leaderboard-module)
20. [Import / Export Module](#20-import--export-module)
21. [Notifications Module](#21-notifications-module)
22. [Audit Logs Module](#22-audit-logs-module)
23. [Settings Module](#23-settings-module)
24. [Partner Portal (Partner-role User)](#24-partner-portal-partner-role-user)
25. [Permission & Role Guard Testing](#25-permission--role-guard-testing)
26. [Cross-Module & Regression Tests](#26-cross-module--regression-tests)

---

## 1. Test Scope & Conventions

### 1.1 Scope
This document covers **Black Box functional testing** of the CRM Recruitment Platform. Tests verify UI behaviour, API responses, and end-to-end user flows without knowledge of internal code.

### 1.2 Out of Scope
- Unit tests / integration tests
- Load / performance testing
- Infrastructure / DevOps
- Third-party payment gateway internals (Razorpay)

### 1.3 Test ID Convention
`[MODULE]-[TC-NNN]`  
Example: `AUTH-TC-001`

### 1.4 Status Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Pass |
| ❌ | Fail |
| ⚠️ | Partial / Blocked |
| 🔲 | Not Executed |

### 1.5 Priority Levels
| Level | Description |
|-------|-------------|
| P1 | Critical — must pass before any release |
| P2 | High — must pass before release |
| P3 | Medium — should pass; minor workaround exists |
| P4 | Low — nice to have |

### 1.6 Test Roles Used
| Role | Username (example) | Notes |
|------|--------------------|-------|
| Super Admin | superadmin@crm.io | Platform-level access |
| Seller | seller@agency.com | Manages tenants |
| Company Owner | owner@company.com | All permissions in company |
| Admin | admin@company.com | Company admin |
| Accounts | accounts@company.com | Finance permissions |
| Candidate Coordinator | cc@company.com | Recruitment permissions |
| Client Coordinator | clc@company.com | Client & job permissions |
| HR | hr@company.com | Onboarding permissions |
| Partner | partner@firm.com | External partner access |

---

## 2. Authentication Module

### 2.1 Login Page

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| AUTH-TC-001 | Valid login with email | 1. Open `/login`<br>2. Enter valid email + password<br>3. Click Login | Redirect to `/dashboard`. JWT stored. User name visible in navbar. | P1 | 🔲 |
| AUTH-TC-002 | Valid login with username | Enter username (not email) + password | Same as AUTH-TC-001 | P1 | 🔲 |
| AUTH-TC-003 | Valid login with mobile number | Enter 10-digit mobile + password | Same as AUTH-TC-001 | P2 | 🔲 |
| AUTH-TC-004 | Wrong password | Enter valid email + wrong password | Error toast: "Invalid credentials". Stays on login page. | P1 | 🔲 |
| AUTH-TC-005 | Non-existent email | Enter email that doesn't exist | Error: "User not found" or "Invalid credentials". | P1 | 🔲 |
| AUTH-TC-006 | Empty fields — submit | Click Login with no inputs | Validation errors highlighted on both fields. | P2 | 🔲 |
| AUTH-TC-007 | Empty password only | Fill email, leave password blank | Validation error on password field. | P2 | 🔲 |
| AUTH-TC-008 | SQL injection in email field | Enter `' OR 1=1 --` as email | Error: Invalid credentials. No 500 error or data leak. | P1 | 🔲 |
| AUTH-TC-009 | XSS in password field | Enter `<script>alert(1)</script>` | No script execution. Normal login failure. | P1 | 🔲 |
| AUTH-TC-010 | Suspended account login | Login with suspended user credentials | Error: "Account is suspended" or similar. | P1 | 🔲 |
| AUTH-TC-011 | Inactive account login | Login with inactive user credentials | Error: Access denied message. | P1 | 🔲 |
| AUTH-TC-012 | Show/hide password toggle | Click eye icon on password field | Password text toggles between hidden (••••) and visible. | P3 | 🔲 |
| AUTH-TC-013 | Remember session | Login, close browser tab, reopen URL | User remains logged in (token refresh works). | P2 | 🔲 |
| AUTH-TC-014 | Forgot password link | Click "Forgot Password" | Navigates to `/forgot-password`. | P2 | 🔲 |
| AUTH-TC-015 | Super Admin login routing | Login with super admin credentials | Redirects to `/super-admin` dashboard. | P1 | 🔲 |
| AUTH-TC-016 | Seller login routing | Login with seller credentials | Redirects to `/seller` dashboard. | P1 | 🔲 |
| AUTH-TC-017 | Partner login routing | Login with partner credentials | Redirects to `/dashboard`. Partner nav menu visible. | P1 | 🔲 |
| AUTH-TC-018 | Expired subscription — owner login | Owner whose plan has expired logs in | Redirects to `/upgrade-plan` page. | P1 | 🔲 |
| AUTH-TC-019 | Logout | Click logout button | Session cleared. Redirected to `/login`. Refresh doesn't auto-login. | P1 | 🔲 |
| AUTH-TC-020 | Access protected route without login | Navigate directly to `/dashboard` | Redirected to `/login`. | P1 | 🔲 |
| AUTH-TC-021 | Token expiry handling | Wait for access token to expire, perform action | App silently refreshes token via refresh-token API. No logout. | P1 | 🔲 |
| AUTH-TC-022 | Concurrent login detection | Login from two browsers simultaneously | Second login succeeds; first session may be invalidated per policy. | P2 | 🔲 |
| AUTH-TC-023 | Login page UI on mobile viewport | Open `/login` on 375px width | Form is responsive, inputs not clipped, button visible. | P3 | 🔲 |

### 2.2 Forgot Password Flow

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| AUTH-TC-024 | Valid email — request reset | Enter registered email, submit | Success message: "Reset link sent to your email". | P1 | 🔲 |
| AUTH-TC-025 | Unregistered email | Enter email not in system | Error or generic "if email exists, link sent" message. | P2 | 🔲 |
| AUTH-TC-026 | Empty email field | Submit blank email | Validation error shown. | P2 | 🔲 |
| AUTH-TC-027 | Invalid email format | Enter `notanemail` | Format validation error. | P2 | 🔲 |
| AUTH-TC-028 | Reset password via link | Click link from email, enter new password + confirm | Password updated. Redirected to login. Old password rejected. | P1 | 🔲 |
| AUTH-TC-029 | Expired reset link | Use reset link after 1 hour | Error: "Link has expired". | P2 | 🔲 |
| AUTH-TC-030 | Password mismatch on reset | New password ≠ confirm password | Validation error. Form not submitted. | P2 | 🔲 |
| AUTH-TC-031 | Weak password on reset | Enter password without uppercase/digit | Validation error listing requirements. | P2 | 🔲 |

### 2.3 Change Password (Authenticated)

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| AUTH-TC-032 | Valid password change | Enter correct current + new valid password | Success. User can login with new password. | P1 | 🔲 |
| AUTH-TC-033 | Wrong current password | Enter incorrect current password | Error: "Current password is incorrect". | P1 | 🔲 |
| AUTH-TC-034 | New password same as current | Enter same password as new | Error or warning that passwords should differ. | P2 | 🔲 |
| AUTH-TC-035 | Access change-password without auth | Navigate to `/change-password` unauthenticated | Redirected to `/login`. | P1 | 🔲 |

---

## 3. Trial & Subscription Module

### 3.1 Tenant Registration & Trial

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SUB-TC-001 | New tenant registration | Complete registration form with valid data | Account created. Welcome email sent. Redirect to dashboard on first login. | P1 | 🔲 |
| SUB-TC-002 | Duplicate email registration | Register with already-used email | Error: "Email already registered". | P1 | 🔲 |
| SUB-TC-003 | Duplicate company name | Register with existing company name | Error: "Company name already taken". | P1 | 🔲 |
| SUB-TC-004 | Registration — required fields | Submit form with missing required fields | Validation errors on each blank field. | P2 | 🔲 |
| SUB-TC-005 | Invalid mobile on registration | Enter non-Indian mobile (not starting 6–9) | Validation error: "Mobile must start with 6–9". | P2 | 🔲 |
| SUB-TC-006 | Weak password on registration | Enter password without uppercase/number | Password strength validation error. | P2 | 🔲 |
| SUB-TC-007 | Trial period active | Login as new tenant within trial | All features accessible. Trial badge visible. | P1 | 🔲 |
| SUB-TC-008 | Trial period expires | Simulate trial expiry (advance date or use test tenant) | Owner redirected to `/upgrade-plan` on next login. | P1 | 🔲 |
| SUB-TC-009 | Non-owner user after trial expiry | Non-owner logs in after trial expires | Appropriate error or redirect. Cannot access dashboard. | P1 | 🔲 |

### 3.2 Upgrade Plan Page (`/upgrade-plan`)

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SUB-TC-010 | View upgrade plans | Open `/upgrade-plan` as expired owner | All available plans listed with prices, features, seat limits. | P1 | 🔲 |
| SUB-TC-011 | Plan selection | Click on a plan | Plan highlights / selected state shown. | P2 | 🔲 |
| SUB-TC-012 | Seat count input | Change seat count on plan | Price updates dynamically. | P2 | 🔲 |
| SUB-TC-013 | Initiate payment — Razorpay | Click "Upgrade" / "Pay Now" | Razorpay payment modal opens. | P1 | 🔲 |
| SUB-TC-014 | Successful payment | Complete Razorpay payment with test card | Subscription activated. Owner redirected to dashboard. | P1 | 🔲 |
| SUB-TC-015 | Payment failure / cancelled | Cancel Razorpay modal | Returns to upgrade page. Subscription NOT activated. Error shown. | P1 | 🔲 |
| SUB-TC-016 | Renewal order creation | Owner with active plan clicks "Renew" | Renewal order created. Payment flow starts. | P2 | 🔲 |
| SUB-TC-017 | Seat expansion | Owner adds more seats | Extra seats added after payment. New users can be created up to new limit. | P2 | 🔲 |
| SUB-TC-018 | Non-owner accesses `/upgrade-plan` | Regular employee navigates to upgrade page | Redirected to dashboard or access denied. | P2 | 🔲 |
| SUB-TC-019 | Discount code application | Enter valid discount code on upgrade | Discount reflected in price. | P2 | 🔲 |
| SUB-TC-020 | Invalid discount code | Enter expired or incorrect code | Error: "Invalid or expired discount code". | P2 | 🔲 |

---

## 4. Super-Admin Portal

### 4.1 Access Control

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SA-TC-001 | Non-super-admin accesses `/super-admin` | Login as regular admin, go to `/super-admin` | Access denied / redirected. | P1 | 🔲 |
| SA-TC-002 | Super admin dashboard loads | Login as super admin | `/super-admin` loads with stats: tenants, revenue, active subscriptions. | P1 | 🔲 |

### 4.2 Tenant Management

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SA-TC-003 | List all tenants | Open Tenants page | Table shows all tenants with status, plan, expiry, seat count. | P1 | 🔲 |
| SA-TC-004 | Search tenants | Type company name in search | Filtered results match query. | P2 | 🔲 |
| SA-TC-005 | View tenant details | Click on a tenant row | Details page shows company info, subscription, payment history. | P2 | 🔲 |
| SA-TC-006 | Manually activate tenant | Click Activate on pending tenant | Tenant status changes to Active. | P2 | 🔲 |
| SA-TC-007 | Suspend tenant | Click Suspend on active tenant | Tenant status = Suspended. Owner cannot login. | P1 | 🔲 |
| SA-TC-008 | Delete tenant | Click Delete on a tenant | Confirmation dialog → on confirm, tenant removed. | P2 | 🔲 |

### 4.3 Plans Management

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SA-TC-009 | List plans | Open Plans page | All plans shown with name, price, max seats, duration, features. | P1 | 🔲 |
| SA-TC-010 | Create new plan | Fill plan form with valid data, submit | Plan created and visible in list. Appears on upgrade page. | P2 | 🔲 |
| SA-TC-011 | Edit plan | Modify price of existing plan, save | Price updated. Tenants on old plan unaffected until renewal. | P2 | 🔲 |
| SA-TC-012 | Deactivate plan | Toggle plan to inactive | Plan no longer shown to new tenants on upgrade page. | P2 | 🔲 |

### 4.4 Sellers Management

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SA-TC-013 | List sellers | Open Sellers page | All seller accounts listed. | P2 | 🔲 |
| SA-TC-014 | Create seller | Fill seller form, submit | Seller account created with login credentials. | P2 | 🔲 |
| SA-TC-015 | Assign tenant to seller | Link a tenant to a seller | Seller can see that tenant in their portal. | P2 | 🔲 |

### 4.5 Subscriptions & Payments

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SA-TC-016 | View all subscriptions | Open Subscriptions page | List with tenant, plan, start/end dates, status. | P2 | 🔲 |
| SA-TC-017 | View all payments | Open Payments page | Payment transactions with amount, date, tenant, status. | P2 | 🔲 |
| SA-TC-018 | Filter payments by date range | Apply from/to date filter | Only payments in range shown. | P3 | 🔲 |

---

## 5. Seller Portal

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SEL-TC-001 | Seller dashboard loads | Login as seller | Dashboard shows: my tenants count, revenue, commissions. | P1 | 🔲 |
| SEL-TC-002 | View assigned tenants | Open Tenants page | Only tenants assigned to this seller shown. | P1 | 🔲 |
| SEL-TC-003 | View seller subscriptions | Open Subscriptions page | Subscriptions for seller's tenants listed. | P2 | 🔲 |
| SEL-TC-004 | Commission tracking | Open Commissions page | Commission amounts per tenant, total earnings shown. | P2 | 🔲 |
| SEL-TC-005 | Revenue report | Open Revenue page | Revenue chart and breakdown visible. | P2 | 🔲 |
| SEL-TC-006 | Seller notifications | Open Notifications | Alerts for new subscriptions, renewals, payments. | P3 | 🔲 |
| SEL-TC-007 | Seller cannot access super admin routes | Navigate to `/super-admin` | Access denied or redirected. | P1 | 🔲 |
| SEL-TC-008 | Seller profile update | Edit profile info, save | Profile updated successfully. | P3 | 🔲 |

---

## 6. Dashboard

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| DASH-TC-001 | Admin dashboard loads | Login as admin | Dashboard loads with all stat cards: candidates, jobs, interviews, payouts. | P1 | 🔲 |
| DASH-TC-002 | Stat cards by permission | Login as Candidate Coordinator (no finance perms) | Only recruitment stats visible. Finance cards not shown. | P1 | 🔲 |
| DASH-TC-003 | Candidate coordinator dashboard | Login as CC | Sees: candidate count, interview count, job count. No payout/client cards. | P2 | 🔲 |
| DASH-TC-004 | Accounts user dashboard | Login as Accounts | Sees: payout, invoice stats. May not see recruitment details. | P2 | 🔲 |
| DASH-TC-005 | Partner dashboard | Login as partner | Shows partner-specific stats (my candidates, payouts). | P2 | 🔲 |
| DASH-TC-006 | Stats are accurate | Compare dashboard count with actual list count | Numbers match within same data refresh. | P2 | 🔲 |
| DASH-TC-007 | Dashboard loads within 3 seconds | Load dashboard with test data | Page fully rendered in ≤ 3 seconds. | P2 | 🔲 |
| DASH-TC-008 | Dashboard — no data state | Login to fresh company with no data | Empty states shown with "No data" or "Get started" prompts. | P3 | 🔲 |

---

## 7. Users & Roles Module

### 7.1 Users List

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| USR-TC-001 | List active users | Open `/users` | Table shows active users with name, email, role, department, status. | P1 | 🔲 |
| USR-TC-002 | Search users | Type name in search bar | Filtered results shown in real-time. | P2 | 🔲 |
| USR-TC-003 | Filter by role | Select "Accounts" from role filter | Only accounts users shown. | P2 | 🔲 |
| USR-TC-004 | Filter by status | Select "Active" / "Inactive" | Filtered list shown. | P2 | 🔲 |
| USR-TC-005 | List inactive users | Open `/users/inactive` | Shows only inactive/suspended users. | P2 | 🔲 |
| USR-TC-006 | Non-admin cannot access users list | Login as HR, navigate to `/users` | Access denied or users list visible (HR has `users:view` only). | P2 | 🔲 |

### 7.2 Create User

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| USR-TC-007 | Create user — all valid fields | Fill complete user form, submit | User created. Success toast. Appears in list. Welcome email sent. | P1 | 🔲 |
| USR-TC-008 | Create user — required fields only | Fill only required fields | User created successfully. | P1 | 🔲 |
| USR-TC-009 | Duplicate username | Use existing username | Error: "Username already taken". | P1 | 🔲 |
| USR-TC-010 | Duplicate email | Use existing email | Error: "Email already registered". | P1 | 🔲 |
| USR-TC-011 | Invalid mobile number | Enter 9-digit or non-Indian number | Validation error. | P2 | 🔲 |
| USR-TC-012 | Invalid username — special chars | Enter `user@name` as username | Error: only letters, numbers, underscores allowed. | P2 | 🔲 |
| USR-TC-013 | Weak password | Enter `password` (no uppercase/number) | Validation error listed. | P2 | 🔲 |
| USR-TC-014 | Create partner-type user | Set role = Partner | `user_type` auto-set to "partner". Partner nav visible on login. | P1 | 🔲 |
| USR-TC-015 | Create user with custom permissions | Toggle individual permissions, save | User's permissions match selection. Verified after login. | P1 | 🔲 |
| USR-TC-016 | Seat limit enforcement | Create users up to plan seat limit, then one more | Error: "Seat limit reached. Upgrade your plan." | P1 | 🔲 |
| USR-TC-017 | Override duplicate flag | Submit same email with override_duplicate=true | User created despite duplicate (admin override). | P3 | 🔲 |

### 7.3 Edit User

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| USR-TC-018 | Edit user name | Change full_name, save | Name updated immediately. | P1 | 🔲 |
| USR-TC-019 | Change user role | Change from HR to Accounts | Permissions reset to Accounts defaults. Reflected on next login. | P1 | 🔲 |
| USR-TC-020 | Suspend user | Set status = Suspended | User cannot login. Gets "Account suspended" error. | P1 | 🔲 |
| USR-TC-021 | Reactivate user | Set status = Active | User can login again. | P1 | 🔲 |
| USR-TC-022 | Edit owner user | Try to change owner's reporting_to | Owner always reports to themselves. Field locked or auto-corrected. | P2 | 🔲 |
| USR-TC-023 | Reset user password (admin) | Enter new password for user | Success. User must change password on next login (if force-change enabled). | P2 | 🔲 |
| USR-TC-024 | No-change edit | Open edit, change nothing, save | Returns "No changes made" — no error, current user returned. | P2 | 🔲 |

### 7.4 User Details

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| USR-TC-025 | View user details | Click user row | Details page shows all info including role, permissions, department. | P2 | 🔲 |
| USR-TC-026 | role_type field | View owner user details | `role_type` shows "owner". Admin shows "admin". Others show "user". | P2 | 🔲 |

### 7.5 Roles Management

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| USR-TC-027 | List roles | Open `/roles` | All system roles + custom roles listed with permission count. | P1 | 🔲 |
| USR-TC-028 | View system role permissions | Click on "Admin" role | All admin permissions pre-checked. Form read-only for system roles. | P2 | 🔲 |
| USR-TC-029 | Create custom role | Fill name, select permissions, save | Role created. Assignable to new users. | P1 | 🔲 |
| USR-TC-030 | Edit custom role | Change permissions on custom role | Updated permissions apply on next login of assigned users. | P1 | 🔲 |
| USR-TC-031 | Delete custom role | Click delete on custom role | Confirmation → role deleted. Users with that role need reassignment. | P2 | 🔲 |
| USR-TC-032 | Delete system role | Try to delete "Admin" system role | Error: "System roles cannot be deleted". | P1 | 🔲 |
| USR-TC-033 | Permission hierarchy UI | Open role form | 3-level hierarchy (Section → Module → Permission chips) with indeterminate checkboxes. | P2 | 🔲 |
| USR-TC-034 | Section tri-checkbox | Click section checkbox (all off) | All permissions in section selected. Checkbox goes to checked state. | P2 | 🔲 |
| USR-TC-035 | Section indeterminate state | Select only some module perms in a section | Section checkbox shows indeterminate (-) state. | P2 | 🔲 |

---

## 8. Partners Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| PART-TC-001 | List partners | Open `/partners` | Table shows all partner companies with status, contact. | P1 | 🔲 |
| PART-TC-002 | Search partners | Type in search box | Filtered results. | P2 | 🔲 |
| PART-TC-003 | Create partner | Fill partner form (name, contact, email), submit | Partner created. Appears in list. | P1 | 🔲 |
| PART-TC-004 | Create partner — required fields | Submit with missing required fields | Validation errors shown. | P2 | 🔲 |
| PART-TC-005 | Edit partner | Modify contact info, save | Info updated. | P1 | 🔲 |
| PART-TC-006 | Delete partner | Click delete → confirm | Partner removed from list. | P2 | 🔲 |
| PART-TC-007 | View partner details | Click on partner | Details page shows contact info, associated candidates, payout stats. | P2 | 🔲 |
| PART-TC-008 | Non-admin cannot create partner | Login as CC, try to access `/partners/new` | Access denied. | P2 | 🔲 |

---

## 9. Departments & Designations Module

### 9.1 Departments

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| DEP-TC-001 | List departments | Open `/departments` | All departments listed with name, head, employee count. | P1 | 🔲 |
| DEP-TC-002 | Create department | Enter name + optional details, submit | Department created. | P1 | 🔲 |
| DEP-TC-003 | Duplicate department name | Create department with existing name | Error: "Department already exists". | P2 | 🔲 |
| DEP-TC-004 | Edit department | Change name, save | Name updated. | P1 | 🔲 |
| DEP-TC-005 | Delete department | Click delete → confirm | Department deleted if no active users assigned. | P2 | 🔲 |

### 9.2 Designations

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| DEP-TC-006 | List designations | Open `/designations` | All designations listed with name, code, level, department. | P1 | 🔲 |
| DEP-TC-007 | Create designation — auto code | Enter name, leave code blank, submit | Code auto-generated (e.g. "HR Manager" → "HRM101"). | P1 | 🔲 |
| DEP-TC-008 | Create designation — custom code | Enter name + custom code, submit | Custom code saved (uppercased). | P2 | 🔲 |
| DEP-TC-009 | Duplicate auto code | Create two designations with same initials | Second gets next available suffix (HRM101, HRM102). | P2 | 🔲 |
| DEP-TC-010 | Create designation — missing name | Submit without name | Validation error. | P2 | 🔲 |
| DEP-TC-011 | Edit designation | Change display name, save | Updated. Code unchanged unless explicitly modified. | P1 | 🔲 |
| DEP-TC-012 | Delete designation | Delete → confirm | Removed from list. | P2 | 🔲 |

---

## 10. Candidates Module

### 10.1 List & Search

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| CAN-TC-001 | List all candidates | Open `/candidates` | Table with name, email, experience, skills, status, source. | P1 | 🔲 |
| CAN-TC-002 | Search by name | Type candidate name | Filtered results shown. | P2 | 🔲 |
| CAN-TC-003 | Filter by status | Select "Active" | Only active candidates shown. | P2 | 🔲 |
| CAN-TC-004 | Filter by skills | Select a skill from filter | Candidates with that skill shown. | P2 | 🔲 |
| CAN-TC-005 | Pagination | Navigate pages when >20 candidates | Next/prev page works. Page count correct. | P2 | 🔲 |
| CAN-TC-006 | Partner sees only own candidates | Login as partner, open candidates | Only candidates added by this partner visible. | P1 | 🔲 |

### 10.2 Create Candidate

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| CAN-TC-007 | Resume upload is first section | Open create candidate form | Resume upload card appears at TOP before Basic Information. | P1 | 🔲 |
| CAN-TC-008 | Resume upload in Additional Info | Scroll to Additional Information section | Resume upload field also present in this section. | P1 | 🔲 |
| CAN-TC-009 | Create candidate — all required fields | Fill first name, last name, email, mobile, submit | Candidate created. Success toast. | P1 | 🔲 |
| CAN-TC-010 | Create candidate — invalid email | Enter `notanemail` | Validation error on email field. | P2 | 🔲 |
| CAN-TC-011 | Create candidate — invalid mobile | Enter 8-digit mobile | Validation error. | P2 | 🔲 |
| CAN-TC-012 | Upload resume — PDF | Select PDF file ≤ 5 MB in create mode | File name shown as pending. "Will be uploaded after saving" message. | P1 | 🔲 |
| CAN-TC-013 | Upload resume — oversized file | Select file > 5 MB | Error: "File size exceeds 5 MB". | P2 | 🔲 |
| CAN-TC-014 | Upload resume — wrong format | Select .txt file | Error: "Only PDF, DOC, DOCX allowed". | P2 | 🔲 |
| CAN-TC-015 | Remove pending resume | Click "Remove" on pending file chip | File dequeued. Input cleared. | P2 | 🔲 |
| CAN-TC-016 | Add skills | Enter skills in skills field | Tags shown for each skill. | P2 | 🔲 |
| CAN-TC-017 | Preferred locations | Add location tags | Locations saved with candidate. | P3 | 🔲 |
| CAN-TC-018 | LinkedIn/Portfolio URLs | Enter valid URLs | Saved and shown as clickable links in details. | P3 | 🔲 |
| CAN-TC-019 | Willing to relocate toggle | Check/uncheck checkbox | Value saved correctly. | P3 | 🔲 |
| CAN-TC-020 | Expected CTC validation | Enter negative CTC | Validation error (min 0). | P3 | 🔲 |

### 10.3 Edit Candidate

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| CAN-TC-021 | Edit mode — resume shows existing | Open edit for candidate with resume | "Resume on file" shown with View/Download links. | P1 | 🔲 |
| CAN-TC-022 | Replace resume in edit mode | Upload new file in edit mode | Immediate upload. Resume_url updated. Old file replaced. | P1 | 🔲 |
| CAN-TC-023 | Edit candidate basic info | Change name/email/phone, save | Details updated. Reflects in list and details page. | P1 | 🔲 |
| CAN-TC-024 | Edit candidate status | Change status from Active to Blacklisted | Status updated. Visible in list. | P2 | 🔲 |

### 10.4 Candidate Details

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| CAN-TC-025 | View candidate profile | Click candidate in list | Full profile shown: personal, professional, skills, education, links, resume. | P1 | 🔲 |
| CAN-TC-026 | Download resume from details | Click Download on resume | File downloads without error. | P2 | 🔲 |
| CAN-TC-027 | View interview history | On candidate details | Past and upcoming interviews listed. | P2 | 🔲 |
| CAN-TC-028 | Candidate without resume | View candidate with no resume | "No resume uploaded" shown gracefully. | P2 | 🔲 |

### 10.5 Public Candidate Form

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| CAN-TC-029 | Valid token opens form | Navigate to `/apply/:token` with valid token | Public form loads. No login required. | P1 | 🔲 |
| CAN-TC-030 | Invalid/expired token | Navigate with bad token | Error: "Link is invalid or expired". | P1 | 🔲 |
| CAN-TC-031 | Submit public form | Fill all required fields, submit | Candidate profile created. Confirmation message shown. | P1 | 🔲 |

---

## 11. Jobs Module

### 11.1 List & Search

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| JOB-TC-001 | List all jobs | Open `/jobs` | Table with job code, title, client, openings, status. | P1 | 🔲 |
| JOB-TC-002 | Default filter shows open jobs | Open jobs list | Default status filter = "Open". Only open jobs shown initially. | P1 | 🔲 |
| JOB-TC-003 | Filter by status | Select "Closed" | Only closed jobs shown. | P2 | 🔲 |
| JOB-TC-004 | Search by title | Type job title | Matching jobs shown. | P2 | 🔲 |
| JOB-TC-005 | Filter by client | Select a client | Jobs for that client only. | P2 | 🔲 |

### 11.2 Create Job

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| JOB-TC-006 | Create job — valid | Fill title, client, openings, submit | Job created with auto-generated job code. | P1 | 🔲 |
| JOB-TC-007 | Job dropdown label | Check job dropdown in candidate assignment | Shows `[CODE] - [Title] (Client)` format, never "-". | P1 | 🔲 |
| JOB-TC-008 | Job title required | Submit without title | Validation error on title. | P2 | 🔲 |
| JOB-TC-009 | Number of openings validation | Enter 0 or negative | Validation error (min 1). | P2 | 🔲 |
| JOB-TC-010 | Expected CTC range | Enter max CTC < min CTC | Validation error. | P3 | 🔲 |

### 11.3 Job Details & Matching

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| JOB-TC-011 | View job details | Click job | Full job description, requirements, client info, applications count. | P1 | 🔲 |
| JOB-TC-012 | Job matching candidates | Open `/jobs/:id/matching` | Candidates matched by skills, experience, location. Scored/ranked list. | P2 | 🔲 |
| JOB-TC-013 | Close job | Change status to Closed | Job disappears from default (open) view. | P2 | 🔲 |
| JOB-TC-014 | Edit job | Modify description, save | Changes reflected in details. | P1 | 🔲 |
| JOB-TC-015 | Delete job | Delete → confirm | Job removed. Associated applications handled. | P2 | 🔲 |

---

## 12. Clients Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| CLI-TC-001 | List clients | Open `/clients` | Table: client name, industry, contact, active jobs count. | P1 | 🔲 |
| CLI-TC-002 | Search clients | Type company name | Filtered results. | P2 | 🔲 |
| CLI-TC-003 | Create client | Fill name, industry, contact info, submit | Client created. | P1 | 🔲 |
| CLI-TC-004 | Required fields validation | Submit blank form | Errors on required fields. | P2 | 🔲 |
| CLI-TC-005 | Edit client | Modify address, save | Updated. | P1 | 🔲 |
| CLI-TC-006 | Delete client | Delete → confirm | Removed. Warning if active jobs linked. | P2 | 🔲 |
| CLI-TC-007 | View client details | Click client | Details: contact info, linked jobs, recent applications. | P2 | 🔲 |
| CLI-TC-008 | CC cannot delete client | Login as Candidate Coordinator, try delete | Delete button not visible or access denied. | P2 | 🔲 |

---

## 13. Applications Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| APP-TC-001 | List applications | Open `/applications` | Table: candidate, job, client, date, status. | P1 | 🔲 |
| APP-TC-002 | Filter by status | Select "Shortlisted" | Only shortlisted applications shown. | P2 | 🔲 |
| APP-TC-003 | Filter by job | Select a job | Applications for that job only. | P2 | 🔲 |
| APP-TC-004 | View application detail | Click application | Details: candidate info, job info, status history, notes. | P1 | 🔲 |
| APP-TC-005 | Update application status | Change status to "Shortlisted" | Status updates. Timeline entry added. | P1 | 🔲 |
| APP-TC-006 | Add notes to application | Enter notes, save | Notes saved and visible in detail view. | P2 | 🔲 |
| APP-TC-007 | Schedule interview from application | Click "Schedule Interview" | Pre-fills interview form with candidate + job. | P2 | 🔲 |
| APP-TC-008 | Reject application | Set status = Rejected + reason | Status updated. Candidate's availability not affected. | P2 | 🔲 |

---

## 14. Interviews Module

### 14.1 List

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| INT-TC-001 | List interviews | Open `/interviews` | Table: candidate, job, interviewer, date/time, round, status. | P1 | 🔲 |
| INT-TC-002 | Filter by status | Select "Scheduled" | Only scheduled interviews shown. | P2 | 🔲 |
| INT-TC-003 | Filter by date range | Apply date filter | Interviews in range only. | P2 | 🔲 |

### 14.2 Schedule Interview

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| INT-TC-004 | Schedule interview — all fields | Fill candidate, job, interviewer, date/time, mode, submit | Interview scheduled. Appears in list. | P1 | 🔲 |
| INT-TC-005 | Past date scheduling | Select yesterday as interview date | Validation error or warning: "Cannot schedule in the past". | P2 | 🔲 |
| INT-TC-006 | Interviewer conflict check | Schedule two interviews for same interviewer at same time | Warning: "Interviewer has a conflict at this time". | P2 | 🔲 |
| INT-TC-007 | Required fields | Submit without candidate/job | Validation errors. | P2 | 🔲 |
| INT-TC-008 | Online mode — meeting link | Select "Online", enter meeting link | Link saved and shown in detail view. | P2 | 🔲 |

### 14.3 Interview Status & Feedback

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| INT-TC-009 | Mark interview as completed | Change status to "Completed" | Status updated. Feedback form enabled. | P1 | 🔲 |
| INT-TC-010 | Submit interview feedback | Fill feedback form (rating, notes), submit | Feedback saved. Linked to application. | P1 | 🔲 |
| INT-TC-011 | Reject candidate via interview | Set result = "Rejected" + reason | Application status updated to Rejected. | P1 | 🔲 |
| INT-TC-012 | Select candidate via interview | Set result = "Selected" | Application moves to next stage. | P1 | 🔲 |
| INT-TC-013 | Reschedule interview | Change date/time of existing interview | New date saved. Old date in history. | P2 | 🔲 |
| INT-TC-014 | Cancel interview | Set status = Cancelled | Interview removed from active view. | P2 | 🔲 |

### 14.4 Interview Settings

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| INT-TC-015 | View interview settings | Open `/interviews/settings` | Interview rounds, types, evaluation criteria configured. | P2 | 🔲 |
| INT-TC-016 | Add interview round | Create new round name, save | Round available in scheduling form. | P2 | 🔲 |
| INT-TC-017 | Non-CC cannot edit interview settings | Login as HR, try to edit | Edit not available (no interview_settings:edit perm). | P2 | 🔲 |

---

## 15. Onboarding Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| ONB-TC-001 | List onboardings | Open `/onboards` | Table: candidate, job, client, start date, status. | P1 | 🔲 |
| ONB-TC-002 | Create onboarding | Fill form (select placed candidate, joining date), submit | Onboarding record created. | P1 | 🔲 |
| ONB-TC-003 | Required fields | Submit without candidate/date | Validation errors. | P2 | 🔲 |
| ONB-TC-004 | View onboarding details | Click onboarding row | Details: candidate info, company, documents, checklist. | P1 | 🔲 |
| ONB-TC-005 | Upload documents | Upload offer letter / ID proof | Document saved. Visible in details. | P2 | 🔲 |
| ONB-TC-006 | Update onboarding status | Change from Pending → Joined | Status updated. Timestamp recorded. | P1 | 🔲 |
| ONB-TC-007 | HR can view onboarding | Login as HR, open `/onboards` | List visible (onboards:view permission). | P1 | 🔲 |
| ONB-TC-008 | HR cannot create from HR route | Login as HR, open `/hr/onboarding` | View accessible. Create button shown only if has `onboards:create`. | P2 | 🔲 |
| ONB-TC-009 | Email notification on onboarding | Create onboarding | Email notification sent to candidate and relevant coordinators. | P3 | 🔲 |
| ONB-TC-010 | Edit onboarding | Modify joining date, save | Updated. | P1 | 🔲 |

---

## 16. Payouts & Invoices Module

### 16.1 Partner Payouts (Accounts View)

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| PAY-TC-001 | List payouts (accounts) | Login as Accounts, open `/payouts` | All partner payouts listed with amount, partner, status, period. | P1 | 🔲 |
| PAY-TC-002 | Filter by partner | Select a partner from filter | Only that partner's payouts shown. | P2 | 🔲 |
| PAY-TC-003 | Filter by status | Select "Eligible" | Only eligible payouts shown. | P2 | 🔲 |
| PAY-TC-004 | Filter by date range | Set from/to date | Payouts in that period only. | P2 | 🔲 |
| PAY-TC-005 | View payout detail | Click payout | Detail shows placement, candidate, amount, commission formula. | P2 | 🔲 |
| PAY-TC-006 | Partner cannot see others' payouts | Login as partner, open payouts | Only own payouts visible. | P1 | 🔲 |
| PAY-TC-007 | Accounts dashboard | Open accounts dashboard | Summary: total pending, eligible, paid amounts. | P2 | 🔲 |
| PAY-TC-008 | Update eligibility | Click "Update Eligibility" (admin) | Pending payouts past waiting period marked Eligible. | P2 | 🔲 |

### 16.2 Invoices

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| PAY-TC-009 | Raise invoice (partner) | Login as partner, go to eligible payouts, raise invoice | Invoice created with selected payout IDs. Status = Submitted. | P1 | 🔲 |
| PAY-TC-010 | Raise invoice — no eligible payouts | Raise invoice with no eligible payouts | Error: "No eligible payouts to invoice". | P1 | 🔲 |
| PAY-TC-011 | List invoices (accounts) | Login as Accounts, open invoices | All invoices listed with partner, amount, status, date. | P1 | 🔲 |
| PAY-TC-012 | Partner sees own invoices only | Login as partner, open my invoices | Only own invoices visible. | P1 | 🔲 |
| PAY-TC-013 | Approve invoice | Accounts: click Approve on submitted invoice | Invoice status → Approved. Notes can be added. | P1 | 🔲 |
| PAY-TC-014 | Reject invoice | Accounts: click Reject with reason | Invoice status → Rejected. Reason saved. Partner can see reason. | P1 | 🔲 |
| PAY-TC-015 | Record payment | Accounts: click Record Payment on approved invoice | Payment details (reference, date, amount) saved. Status → Paid. | P1 | 🔲 |
| PAY-TC-016 | Cannot approve already approved | Try to approve already-approved invoice | Error: "Invoice not in submitted status". | P2 | 🔲 |
| PAY-TC-017 | Pending approval list | Open "Pending Approval" invoices | Only submitted invoices shown. | P2 | 🔲 |
| PAY-TC-018 | Pending payment list | Open "Pending Payment" invoices | Only approved (unpaid) invoices shown. | P2 | 🔲 |
| PAY-TC-019 | Partner stats | Partner: view My Stats | Total earned, pending, paid amounts shown. | P2 | 🔲 |

---

## 17. Tasks Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| TSK-TC-001 | View tasks list | Open `/tasks` | All tasks listed: title, priority, due date, assigned to, status. | P1 | 🔲 |
| TSK-TC-002 | Create task — valid | Fill title, priority, due date, assigned to, click Create | Task created. Appears in list. | P1 | 🔲 |
| TSK-TC-003 | Create task — title only | Fill title only (no date/assignee), submit | Task created with defaults (Medium priority, Pending). | P1 | 🔲 |
| TSK-TC-004 | Create task — empty title | Submit with blank title | Validation error. | P2 | 🔲 |
| TSK-TC-005 | Create task — due date in past | Select yesterday as due date | Task created. `is_overdue` flag = true. Shown as overdue. | P2 | 🔲 |
| TSK-TC-006 | No "Failed to create task" error | Create any valid task | No error toast. Task appears immediately. | P1 | 🔲 |
| TSK-TC-007 | Filter tasks by status | Select "Pending" | Only pending tasks shown. | P2 | 🔲 |
| TSK-TC-008 | Filter tasks by priority | Select "High" | Only high priority tasks shown. | P2 | 🔲 |
| TSK-TC-009 | Update task status | Change to "In Progress" | Status updated. | P1 | 🔲 |
| TSK-TC-010 | Complete task | Change status to "Completed" | `completed_at` timestamp recorded. Task moves to completed section. | P1 | 🔲 |
| TSK-TC-011 | Overdue indicator | View task where due date < today and status ≠ Completed | Overdue badge shown. | P2 | 🔲 |
| TSK-TC-012 | Delete task | Delete → confirm | Task removed from list. | P2 | 🔲 |
| TSK-TC-013 | Assign task to another user | Set assigned_to = another user | Assigned user can see task in their list. | P2 | 🔲 |

---

## 18. Reports & Analytics Module

### 18.1 Reports

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| RPT-TC-001 | View reports dashboard | Open `/reports` | Report categories and saved reports listed. | P1 | 🔲 |
| RPT-TC-002 | Generate candidate report | Select Candidate report type, apply filters, generate | Report generated with matching data. | P1 | 🔲 |
| RPT-TC-003 | Generate job report | Select Job report, submit | Job statistics shown. | P2 | 🔲 |
| RPT-TC-004 | Generate payout report | Select Payout report (accounts user) | Financial data shown. | P2 | 🔲 |
| RPT-TC-005 | Export report — CSV | Generate report, click Export CSV | File downloads in CSV format with correct data. | P2 | 🔲 |
| RPT-TC-006 | Export report — PDF | Click Export PDF | PDF generated with proper formatting. | P2 | 🔲 |
| RPT-TC-007 | Save report | Generate, click Save | Report saved. Visible in "Saved Reports" list. | P2 | 🔲 |
| RPT-TC-008 | View saved report | Open saved report | Regenerated with original filters. | P3 | 🔲 |
| RPT-TC-009 | Date range filter | Apply narrow date range | Only data in range shown. | P2 | 🔲 |
| RPT-TC-010 | Reports — no data | Generate report for empty date range | "No data found" state shown, not an error. | P2 | 🔲 |
| RPT-TC-011 | Non-reporter accesses `/reports` | Login as HR (no reports:view perm) | Access denied. | P2 | 🔲 |

### 18.2 Analytics

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| RPT-TC-012 | Analytics dashboard loads | Open `/analytics` | Charts load: hiring funnel, time-to-hire, placement rate. | P1 | 🔲 |
| RPT-TC-013 | Analytics date range | Change time period (30 days → 90 days) | Charts update with new range data. | P2 | 🔲 |
| RPT-TC-014 | Analytics without perm | Login as HR (no analytics:view), navigate to `/analytics` | Access denied. | P2 | 🔲 |

---

## 19. Targets & Leaderboard Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| TGT-TC-001 | View targets | Open `/targets` | Targets for current period listed per user/team. | P1 | 🔲 |
| TGT-TC-002 | Create target | Fill user, metric (placements/interviews), target value, period | Target created. | P1 | 🔲 |
| TGT-TC-003 | Required fields | Submit target without metric | Validation error. | P2 | 🔲 |
| TGT-TC-004 | Edit target | Modify target value, save | Updated. | P2 | 🔲 |
| TGT-TC-005 | Delete target | Delete → confirm | Removed. | P2 | 🔲 |
| TGT-TC-006 | Target progress | View target with some progress | Progress bar shows % completion. | P2 | 🔲 |
| TGT-TC-007 | Leaderboard loads | Open `/leaderboard` | Ranked list of users by performance metric. | P1 | 🔲 |
| TGT-TC-008 | Leaderboard period filter | Change to "This Month" | Rankings update for selected period. | P2 | 🔲 |
| TGT-TC-009 | Non-admin cannot create targets | Login as CC, try to create target | Access denied (needs targets:create). | P2 | 🔲 |

---

## 20. Import / Export Module

### 20.1 Imports

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| IMP-TC-001 | Open imports page | Navigate to `/imports` | Import history and "New Import" button visible. | P1 | 🔲 |
| IMP-TC-002 | Download template | Click "Download Template" | Correct Excel/CSV template downloads. | P2 | 🔲 |
| IMP-TC-003 | Import valid candidates CSV | Upload template with valid data | Candidates created. Success count shown. | P1 | 🔲 |
| IMP-TC-004 | Import with errors | Upload CSV with some invalid rows | Valid rows imported. Error rows listed with row number and reason. | P1 | 🔲 |
| IMP-TC-005 | Import wrong file type | Upload .docx | Error: "Only CSV/Excel files accepted". | P2 | 🔲 |
| IMP-TC-006 | Import empty file | Upload blank CSV | Error: "File is empty or has no data rows". | P2 | 🔲 |
| IMP-TC-007 | Duplicate detection | Import a candidate that already exists (same email) | Skipped or merged based on config. User informed. | P2 | 🔲 |

### 20.2 Exports

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| IMP-TC-008 | Export candidates | Open `/exports`, select Candidates, export | CSV/Excel downloads with all candidate columns. | P1 | 🔲 |
| IMP-TC-009 | Export with filters | Apply status filter, export | Only filtered candidates in exported file. | P2 | 🔲 |
| IMP-TC-010 | Export jobs | Select Jobs entity, export | Job data in file. | P2 | 🔲 |
| IMP-TC-011 | Export with no data | Export when no records match filter | Empty file or "No data to export" message. | P2 | 🔲 |
| IMP-TC-012 | No import perm | Login as Partner, navigate to `/imports` | Access denied. | P2 | 🔲 |

---

## 21. Notifications Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| NOT-TC-001 | Notification bell count | Perform action that triggers notification | Bell icon count increments. | P2 | 🔲 |
| NOT-TC-002 | Open notifications | Click bell / go to `/notifications` | List of recent notifications with title, time, type. | P1 | 🔲 |
| NOT-TC-003 | Mark as read | Click notification or "Mark all read" | Notification(s) marked read. Count resets. | P2 | 🔲 |
| NOT-TC-004 | Interview scheduled notification | Schedule interview for candidate | Relevant users notified. | P2 | 🔲 |
| NOT-TC-005 | Invoice submitted notification | Partner raises invoice | Accounts team notified. | P2 | 🔲 |
| NOT-TC-006 | Invoice approved/rejected notification | Accounts approves/rejects invoice | Partner notified. | P2 | 🔲 |
| NOT-TC-007 | Empty notifications state | First-time user with no notifications | "No notifications yet" message shown gracefully. | P3 | 🔲 |
| NOT-TC-008 | Paginate notifications | > 20 notifications | Older notifications loadable (scroll or pagination). | P3 | 🔲 |

---

## 22. Audit Logs Module

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| AUD-TC-001 | View audit logs | Open `/audit-logs` | Activity log: user, action, entity, timestamp, IP. | P1 | 🔲 |
| AUD-TC-002 | Filter by user | Select a user from filter | Only that user's actions shown. | P2 | 🔲 |
| AUD-TC-003 | Filter by action type | Select "CREATE" | Only creation events shown. | P2 | 🔲 |
| AUD-TC-004 | Filter by date range | Apply date range | Events in range only. | P2 | 🔲 |
| AUD-TC-005 | Login event logged | Login as any user | Login event appears in audit with IP, timestamp, user agent. | P1 | 🔲 |
| AUD-TC-006 | Candidate created event | Create a candidate | Audit log shows "CREATE candidate" entry. | P2 | 🔲 |
| AUD-TC-007 | Failed login logged | Attempt login with wrong password | Failed login attempt recorded in audit. | P2 | 🔲 |
| AUD-TC-008 | Session audit | Open `/audit/sessions` | Active and past sessions with device, IP, duration. | P2 | 🔲 |
| AUD-TC-009 | Security alerts | Open `/audit/alerts` | Alerts for suspicious activity (multiple failed logins, etc.). | P2 | 🔲 |
| AUD-TC-010 | Non-audit user cannot access | Login as HR, navigate to `/audit-logs` | Access denied (no audit:view perm). | P1 | 🔲 |
| AUD-TC-011 | Login activity in settings | Open `/settings/login-activity` | Login history for current user. | P3 | 🔲 |

---

## 23. Settings Module

### 23.1 General Settings Navigation

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SET-TC-001 | Settings hub loads | Open `/settings` | Grid of setting categories shown. | P1 | 🔲 |
| SET-TC-002 | Non-admin cannot access settings | Login as CC, navigate to `/settings` | Access denied (needs crm_settings:view). | P1 | 🔲 |

### 23.2 Individual Settings Pages

| TC ID | Test Case | Setting Page | Steps | Expected Result | Priority | Status |
|-------|-----------|-------------|-------|-----------------|----------|--------|
| SET-TC-003 | Branding | `/settings/branding` | Upload logo, change primary color, save | Changes reflect in app header/theme. | P2 | 🔲 |
| SET-TC-004 | Pipeline stages | `/settings/pipeline-stages` | Add new stage "Final Round", save | Stage available in application workflow. | P2 | 🔲 |
| SET-TC-005 | Job categories | `/settings/job-categories` | Add "Healthcare" category, save | Category appears in job creation form. | P2 | 🔲 |
| SET-TC-006 | Candidate sources | `/settings/candidate-sources` | Add "LinkedIn" source, save | Source option in candidate form. | P2 | 🔲 |
| SET-TC-007 | Email config | `/settings/email-config` | Enter SMTP details, save + test | Test email sends successfully. | P2 | 🔲 |
| SET-TC-008 | Invoice settings | `/settings/invoice-settings` | Set prefix, starting number, due days, save | New invoices use configured numbering. | P2 | 🔲 |
| SET-TC-009 | Commission rules | `/settings/commission-rules` | Define 10% of CTC commission, save | Payouts calculated using this rule. | P2 | 🔲 |
| SET-TC-010 | Security settings | `/settings/security` | Enable "Force MFA", set session timeout, save | Policy applied to new logins. | P2 | 🔲 |
| SET-TC-011 | Custom fields | `/settings/custom-fields` | Add custom field "Visa Status" to Candidates | Field appears in candidate form and details. | P2 | 🔲 |
| SET-TC-012 | Localization | `/settings/localization` | Change timezone to IST | Dates/times display in IST. | P3 | 🔲 |
| SET-TC-013 | Notification settings | `/settings/notification-settings` | Toggle off email for interviews | Interview scheduled email not sent. | P3 | 🔲 |
| SET-TC-014 | Resume parsing config | `/settings/resume-parsing` | Configure parsing fields, save | Parsing respects config on next upload. | P3 | 🔲 |
| SET-TC-015 | Document templates | `/settings/document-templates` | Create offer letter template, save | Template available in onboarding. | P2 | 🔲 |
| SET-TC-016 | SLA config | `/settings/sla-config` | Set "Shortlist within 3 days" SLA, save | SLA breach triggers alert after 3 days. | P3 | 🔲 |
| SET-TC-017 | Data management | `/settings/data-management` | Trigger data export / archive old records | Export file generated. Archive applied. | P3 | 🔲 |
| SET-TC-018 | Teams | `/settings/teams` | Create team "North Zone", add members | Team visible in user assignment. | P2 | 🔲 |
| SET-TC-019 | Branches | `/settings/branches` | Add branch "Mumbai Office" | Branch available in user/job forms. | P2 | 🔲 |
| SET-TC-020 | Interview settings (settings route) | `/settings/interview-settings` | Configure evaluation criteria | Criteria appear in feedback form. | P2 | 🔲 |

---

## 24. Partner Portal (Partner-role User)

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| PRT-TC-001 | Partner sees partner-only nav | Login as partner user | Partner section in sidebar: My Candidates, Available Jobs, My Payouts, etc. | P1 | 🔲 |
| PRT-TC-002 | Partner cannot see admin nav | Login as partner | Users, Roles, Departments, Settings not visible in sidebar. | P1 | 🔲 |
| PRT-TC-003 | My Candidates | Open `/my-candidates` | Only candidates submitted by this partner. | P1 | 🔲 |
| PRT-TC-004 | Submit new candidate | Open `/my-candidates/new`, fill form, submit | Candidate created and linked to partner. | P1 | 🔲 |
| PRT-TC-005 | Available jobs | Open `/available-jobs` | Open jobs the partner can submit candidates for. | P1 | 🔲 |
| PRT-TC-006 | My Payouts | Open `/my-payouts` | Earnings from placed candidates shown. | P1 | 🔲 |
| PRT-TC-007 | My Invoices | Open `/my-invoices` | Own invoices only. | P1 | 🔲 |
| PRT-TC-008 | Raise Invoice | Open `/raise-invoice` | Shows eligible payouts, select and raise invoice. | P1 | 🔲 |
| PRT-TC-009 | Partner cannot access `/users` | Navigate to `/users` | Access denied. | P1 | 🔲 |
| PRT-TC-010 | Partner cannot access `/clients` | Navigate to `/clients` | Access denied. | P1 | 🔲 |
| PRT-TC-011 | My Payout Stats | Navigate to My Stats | Total earned, pending, invoiced amounts. | P2 | 🔲 |

---

## 25. Permission & Role Guard Testing

| TC ID | Test Case | Role | Route Tested | Expected Result | Priority | Status |
|-------|-----------|------|-------------|-----------------|----------|--------|
| PRM-TC-001 | Admin has full access | Admin | All routes | All accessible. | P1 | 🔲 |
| PRM-TC-002 | CC cannot access finance | Candidate Coordinator | `/payouts` | Access denied. | P1 | 🔲 |
| PRM-TC-003 | CC cannot create clients | Candidate Coordinator | `/clients/new` | Access denied. | P1 | 🔲 |
| PRM-TC-004 | Client Coordinator cannot manage users | Client Coordinator | `/users/new` | Access denied. | P1 | 🔲 |
| PRM-TC-005 | HR can only view onboarding | HR | `/onboards/new` | Access denied (no onboards:create). | P1 | 🔲 |
| PRM-TC-006 | Accounts can approve invoices | Accounts | `/payouts/invoices` — approve button | Approve button visible and works. | P1 | 🔲 |
| PRM-TC-007 | Accounts cannot create candidates | Accounts | `/candidates/new` | Access denied. | P1 | 🔲 |
| PRM-TC-008 | Custom permission override | User with custom perms | Their specific routes | Access matches override permissions (not role defaults). | P1 | 🔲 |
| PRM-TC-009 | Override survives logout | User with override perms | Logout and login again | Custom permissions still active after fresh login. | P1 | 🔲 |
| PRM-TC-010 | Restricted module removed | Admin restricts "reports" for a user | User's `/reports` | Access denied. `reports:*` permissions stripped. | P1 | 🔲 |
| PRM-TC-011 | Assigned dept merges perms | User with assigned_departments = ["accounts"] | Finance routes | User has accounts permissions merged in. | P1 | 🔲 |
| PRM-TC-012 | Permission warning log | User without perm hits protected route | Server log | `WARNING: Permission denied | user=... | missing=[...]` logged. | P2 | 🔲 |
| PRM-TC-013 | dashboard:view always present | Any valid role | `/dashboard` | Dashboard always accessible regardless of restriction. | P1 | 🔲 |
| PRM-TC-014 | Owner bypasses all permission checks | Owner user | Any route | Full access regardless of role. | P1 | 🔲 |
| PRM-TC-015 | Super admin bypasses all checks | Super admin | Any company route | Full access or appropriate redirect. | P1 | 🔲 |

---

## 26. Cross-Module & Regression Tests

### 26.1 End-to-End Hiring Flow

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| E2E-TC-001 | Full hire cycle | 1. Create Client<br>2. Create Job for Client<br>3. Create Candidate<br>4. Apply Candidate to Job<br>5. Schedule Interview<br>6. Mark Interview Completed + Feedback<br>7. Select Candidate<br>8. Create Onboarding | Each step succeeds. Onboarding record created with correct candidate/job/client links. | P1 | 🔲 |
| E2E-TC-002 | Partner full flow | 1. Partner submits candidate<br>2. CC assigns candidate to job<br>3. Candidate placed<br>4. Payout generated<br>5. Partner raises invoice<br>6. Accounts approves<br>7. Payment recorded | All steps succeed. Partner can see paid status. | P1 | 🔲 |
| E2E-TC-003 | New company onboarding | 1. Register tenant<br>2. Login as owner<br>3. Create departments/designations<br>4. Create users<br>5. Assign roles/permissions<br>6. Create a job and client | All steps succeed from scratch. | P1 | 🔲 |

### 26.2 UI/UX Regression

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| UX-TC-001 | No broken links in sidebar | Navigate every sidebar link | All links load correct pages. No 404s. | P1 | 🔲 |
| UX-TC-002 | Page title accuracy | Visit each module | Browser tab title matches page. | P3 | 🔲 |
| UX-TC-003 | Error pages | Navigate to `/nonexistent-path` | 404 page shown. Link back to home. | P2 | 🔲 |
| UX-TC-004 | Toast notifications | Create/update/delete any record | Success toast appears and disappears in ~3 seconds. | P2 | 🔲 |
| UX-TC-005 | Loading states | Navigate between heavy pages | Loading spinner shown while data fetches. | P2 | 🔲 |
| UX-TC-006 | Empty states | Open any list with no records | "No records found" or "Get started" message with call-to-action. | P2 | 🔲 |
| UX-TC-007 | Responsive layout | Test at 768px (tablet) and 375px (mobile) | Navigation collapses. Tables scroll horizontally. Forms usable. | P2 | 🔲 |
| UX-TC-008 | Confirm dialogs on delete | Click any delete button | Confirmation modal appears before action. | P1 | 🔲 |
| UX-TC-009 | Form cancel navigation | Click Cancel on any form | Returns to correct list page. No unsaved warning needed. | P2 | 🔲 |
| UX-TC-010 | Date pickers | Use date pickers in forms | Calendar opens, selected date fills input correctly. | P2 | 🔲 |

### 26.3 Security Regression

| TC ID | Test Case | Steps | Expected Result | Priority | Status |
|-------|-----------|-------|-----------------|----------|--------|
| SEC-TC-001 | Direct API call without token | Call any protected API endpoint without Authorization header | 401 Unauthorized. | P1 | 🔲 |
| SEC-TC-002 | Expired token rejected | Call API with expired JWT | 401 Unauthorized with "Token has expired". | P1 | 🔲 |
| SEC-TC-003 | Cross-company data access | Use Company A's token to request Company B's data | 403 or 404. No data leakage. | P1 | 🔲 |
| SEC-TC-004 | SQL/NoSQL injection in search | Enter `{"$gt": ""}` in search field | Treated as literal string. No injection behavior. | P1 | 🔲 |
| SEC-TC-005 | File upload path traversal | Upload file named `../../etc/passwd` | Filename sanitized. Safe path used. | P1 | 🔲 |
| SEC-TC-006 | Global error handler | Cause an internal server error | Returns `{"success": false, "message": "An unexpected error occurred..."}`. No stack trace in response. | P1 | 🔲 |

---

## Appendix A — Test Environment Setup

| Item | Detail |
|------|--------|
| Base URL (Frontend) | `http://localhost:5173` |
| Base URL (API) | `http://localhost:8000/api/v1` |
| MongoDB | Localhost or staging instance |
| Email Testing | Mailtrap or similar SMTP sandbox |
| Payment Testing | Razorpay test mode + test cards |
| Browser | Chrome 120+, Firefox 120+ |

## Appendix B — Test Data Checklist

Before testing, ensure the following data exists:

- [ ] 1 Super Admin account
- [ ] 1 Seller account
- [ ] 2 Company tenants (one active, one expired trial)
- [ ] Per active tenant: 1 Owner, 1 Admin, 1 CC, 1 CLC, 1 HR, 1 Accounts, 1 Partner
- [ ] 5+ Candidates (mix of statuses, some with resumes)
- [ ] 3+ Clients
- [ ] 3+ Jobs (open, closed)
- [ ] 5+ Applications (mix of statuses)
- [ ] 2+ Completed interviews with feedback
- [ ] 1+ Onboarding record
- [ ] 1+ Eligible payout for partner
- [ ] Subscription plans configured (at least 2)

## Appendix C — Known Limitations

| Issue | Module | Notes |
|-------|--------|-------|
| Razorpay can only be tested in test mode | Subscription | Use Razorpay test card `4111 1111 1111 1111` |
| Email delivery depends on SMTP config | Notifications, Auth | Use Mailtrap in QA |
| File upload requires valid S3/storage config | Candidates, Onboarding | Configure storage bucket before resume tests |

---

*Document prepared for the CRM Recruitment Platform v1.0 BlackBox Testing cycle.*
