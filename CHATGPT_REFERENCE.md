# CRM SaaS Platform — Complete Reference Document
> Paste this file into ChatGPT when asking for help with this project.

---

## 1. WHAT THIS PROJECT IS

A **multi-tenant SaaS Recruitment CRM** with a 3-tier user hierarchy:

```
Super Admin
  └── Sellers / Resellers  (manage their own tenants)
        └── Tenants / Companies  (each is an isolated company)
              └── Company Users  (admin, coordinator, HR, partner, etc.)
```

Each company gets its own isolated MongoDB database (`company_{id}_db`).
All company metadata, plans, payments, and sellers live in a shared `master_db`.

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.12, Pydantic v2, Motor (async MongoDB) |
| Frontend | React 18 + Vite, Redux Toolkit, Tailwind CSS |
| Database | MongoDB Atlas (master_db + per-company DBs) |
| Cache / Sessions | Redis 7 (ElastiCache in AWS) |
| Auth | JWT (access + refresh tokens), bcrypt passwords |
| Payments | Razorpay |
| Infra (AWS) | ECS Fargate, ALB, ECR, ElastiCache, Secrets Manager |
| IaC | Terraform |
| CI/CD | GitHub Actions |

---

## 3. PROJECT FILE STRUCTURE

```
crm-project/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── gunicorn.conf.py
│   └── app/
│       ├── main.py                      ← FastAPI app, router registration
│       ├── core/
│       │   ├── config.py                ← All env settings (Settings class)
│       │   ├── database.py              ← MongoDB connection (Motor)
│       │   ├── dependencies.py          ← JWT decode, DB getters, permission factories
│       │   ├── redis.py                 ← Redis client, sessions, blacklist, rate limit
│       │   ├── cache.py                 ← Cache-aside helpers, tenant cache
│       │   ├── security.py              ← bcrypt hash/verify
│       │   └── tenant_resolver.py       ← Login: resolve company + user from identifier
│       ├── middleware/
│       │   ├── auth.py                  ← AuthContext dataclass + require_* guards
│       │   ├── plan_checker.py          ← Plan feature enforcement
│       │   └── tenant.py                ← Tenant context middleware
│       ├── models/
│       │   ├── master/
│       │   │   ├── tenant.py            ← TenantModel (master_db.tenants)
│       │   │   ├── seller.py            ← SellerModel (master_db.sellers)
│       │   │   ├── plan.py              ← PlanModel + DEFAULT_PLANS
│       │   │   ├── payment.py           ← PaymentModel
│       │   │   ├── super_admin.py       ← SuperAdminModel
│       │   │   ├── commission.py
│       │   │   └── discount.py
│       │   └── company/
│       │       ├── user.py              ← UserModel (company_db.users)
│       │       ├── role.py              ← RoleModel + ROLE_DEFAULT_PERMISSIONS
│       │       ├── candidate.py
│       │       ├── client.py
│       │       ├── job.py
│       │       ├── application.py
│       │       ├── interview.py
│       │       ├── pipeline.py
│       │       ├── onboard.py
│       │       ├── partner_payout.py
│       │       ├── target.py
│       │       ├── audit_log.py
│       │       ├── notification.py
│       │       ├── report.py
│       │       ├── analytics.py
│       │       ├── settings.py
│       │       └── ... (more)
│       ├── services/
│       │   ├── auth_service.py          ← Login, refresh, permission resolution
│       │   ├── user_service.py          ← User CRUD + seat limit enforcement
│       │   ├── tenant_service.py        ← Company registration, plan assignment
│       │   ├── seller_service.py        ← Seller CRUD + subscription management
│       │   ├── payment_service.py       ← Razorpay order create/verify, seat upgrade
│       │   ├── plan_service.py          ← Plan CRUD
│       │   ├── role_service.py          ← Role CRUD
│       │   ├── candidate_service.py
│       │   ├── client_service.py
│       │   ├── job_service.py
│       │   ├── application_service.py
│       │   ├── interview_service.py
│       │   ├── pipeline_service.py
│       │   ├── onboard_service.py
│       │   ├── partner_payout_service.py
│       │   ├── report_service.py
│       │   ├── analytics_service.py
│       │   ├── target_service.py
│       │   ├── audit_service.py
│       │   ├── notification_service.py
│       │   ├── settings_service.py
│       │   ├── scheduler_service.py
│       │   ├── export_service.py
│       │   ├── import_service.py
│       │   ├── matching_service.py
│       │   └── discount_service.py
│       └── api/v1/
│           ├── auth.py                  ← /auth/* (login, register, refresh, me)
│           ├── users.py                 ← /users/* + seat-status endpoint
│           ├── roles.py                 ← /roles/*
│           ├── tenants.py               ← /tenants/* (super admin)
│           ├── sellers.py               ← /sellers/* (super admin manages sellers)
│           ├── seller_portal.py         ← /seller-portal/* (seller self-serve)
│           ├── super_admin.py           ← /super-admin/* (dashboard, reports, subscriptions)
│           ├── plans.py                 ← /plans/*
│           ├── payments.py              ← /payments/* (Razorpay)
│           ├── candidates.py
│           ├── clients.py
│           ├── jobs.py
│           ├── applications.py
│           ├── interviews.py
│           ├── pipelines.py
│           ├── onboards.py
│           ├── partners.py
│           ├── reports.py
│           ├── analytics.py
│           ├── targets.py
│           ├── audit.py / audit_logs.py
│           ├── notifications.py
│           ├── imports_exports.py
│           ├── scheduler.py
│           ├── admin_dashboard.py
│           ├── company_settings.py
│           ├── platform_settings.py
│           ├── discounts.py
│           └── payouts.py
│
├── frontend/
│   ├── Dockerfile
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx                      ← Routes, ProtectedRoute, GuestRoute, CompanyRoute
│       ├── main.jsx
│       ├── store/
│       │   ├── store.js                 ← Redux store
│       │   └── authSlice.js             ← Auth state, login/logout/refresh thunks, selectors
│       ├── hooks/
│       │   ├── usePermissions.js        ← has(), hasAll(), hasAny() helpers
│       │   └── useAutoLogout.js         ← 30-min inactivity logout
│       ├── services/
│       │   ├── api.js                   ← Axios instance, interceptors, auto-refresh
│       │   ├── authService.js
│       │   ├── subscriptionService.js   ← Seat status, seat upgrade order
│       │   ├── sellerService.js         ← Super admin → seller management
│       │   ├── sellerPortalService.js   ← Seller self-serve API
│       │   ├── userService.js
│       │   ├── tenantService.js
│       │   ├── paymentService.js
│       │   ├── planService.js
│       │   └── ... (one service per domain)
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Layout.jsx           ← Main shell with SideNav + TopBar
│       │   │   ├── SideNav.jsx          ← Role-aware navigation
│       │   │   └── TopBar.jsx
│       │   ├── common/                  ← Button, Card, Modal, Table, Badge, etc.
│       │   └── subscription/
│       │       ├── SubscriptionBanner.jsx  ← Expiry warning banner
│       │       └── SeatLimitModal.jsx      ← Seat limit popup
│       └── pages/
│           ├── auth/                    ← Login, Register, ForgotPassword, UpgradePlan
│           ├── admin/                   ← AdminDashboard, Users, Roles, UserForm, etc.
│           ├── super-admin/             ← Dashboard, Tenants, Sellers, Plans, Subscriptions, Reports
│           ├── seller/                  ← SellerDashboard, SellerTenants, SellerSubscriptions, SellerRevenue, SellerProfile
│           ├── recruitment/             ← Candidates, Clients, Jobs, Applications, Interviews
│           ├── Onboarding/
│           ├── analytics/
│           ├── reports/
│           ├── audit/
│           ├── targets/
│           ├── imports/ exports/
│           └── Payouts/
│
├── terraform/                           ← AWS infrastructure (ECS Fargate + Auto Scaling)
│   ├── main.tf                          ← VPC, subnets, NAT Gateway, S3 backend
│   ├── variables.tf                     ← All input variables
│   ├── security_groups.tf               ← ALB, ECS, Redis security groups
│   ├── alb.tf                           ← ALB, HTTPS, ACM certificate
│   ├── ecr.tf                           ← ECR repository + lifecycle policy
│   ├── ecs.tf                           ← ECS cluster, task definition, Fargate service
│   ├── redis.tf                         ← ElastiCache Redis
│   ├── autoscaling.tf                   ← CPU + Memory target tracking, CloudWatch alarms
│   ├── outputs.tf                       ← ALB DNS, ECR URL, Redis endpoint, ECS names
│   └── terraform.tfvars.example         ← Copy to terraform.tfvars and fill values
│
├── .github/workflows/
│   ├── deploy-backend.yml               ← test → build/push ECR → ECS rolling deploy
│   ├── deploy-frontend.yml              ← build → S3/Cloudfront OR nginx deploy
│   └── pr-checks.yml                    ← lint + test on pull requests
│
├── docker-compose.yml                   ← Local dev: backend + frontend + redis + mongo
├── docker-compose.prod.yml              ← Production compose with volumes + passwords
├── Makefile                             ← make up/down/test/lint/deploy shortcuts
├── nginx/                               ← Nginx config for reverse proxy
├── scripts/
│   ├── backup.sh                        ← MongoDB backup to S3
│   └── healthcheck.sh                   ← Docker/endpoint/Redis health check
├── AWS_DEPLOYMENT_GUIDE.md
└── GITHUB_SECRETS_SETUP.md
```

---

## 4. DATABASE DESIGN

### master_db collections

| Collection | Purpose |
|-----------|---------|
| `tenants` | All company accounts (plan, expiry, owner info) |
| `sellers` | Reseller accounts |
| `super_admins` | Platform admin accounts |
| `plans` | Available subscription plans |
| `payments` | All payment records (Razorpay) |
| `sessions` | Active JWT sessions (jti tracking) |
| `commissions` | Seller commission records |
| `discounts` | Discount codes |

### company_{id}_db collections (one DB per tenant)

| Collection | Purpose |
|-----------|---------|
| `users` | Company employees (admin, HR, coordinator, partner…) |
| `roles` | Custom roles with permission lists |
| `candidates` | Job seekers |
| `clients` | Client companies (hiring companies) |
| `jobs` | Job openings |
| `applications` | Candidate ↔ Job applications |
| `interviews` | Interview scheduling |
| `pipelines` | Recruitment pipeline stages |
| `onboards` | Onboarding records |
| `partner_payouts` | Partner commission payouts |
| `targets` | Recruiter targets |
| `audit_logs` | Action logs |
| `notifications` | User notifications |
| `reports` | Saved reports |
| `settings` | Company-level settings |

---

## 5. AUTHENTICATION FLOW

### Login (`POST /api/v1/auth/login`)

```
identifier + password
    │
    ├─ Is it a super admin?  → check master_db.super_admins
    ├─ Is it a seller?       → check master_db.sellers  (status=active, not expired)
    └─ Is it a company user? → tenant_resolver resolves company_id
                                → check company_db.users
                                → check plan_expiry on tenant (blocks if expired)
                                → resolve effective permissions (fresh from DB)

Returns:
  access_token  (JWT, 30-60 min)
  refresh_token (JWT, 1-7 days)
  user object   (id, role, permissions, user_type, is_super_admin, is_seller, company_id…)
```

### JWT Payload fields

```json
{
  "sub": "user_id",
  "company_id": "abc123",
  "role": "admin",
  "permissions": ["candidates:view", "candidates:create", ...],
  "is_super_admin": false,
  "is_seller": false,
  "seller_id": null,
  "is_owner": false,
  "user_type": "internal",
  "username": "john.doe",
  "full_name": "John Doe",
  "jti": "session_uuid",
  "exp": 1234567890
}
```

### Permission Resolution (single source of truth in `auth_service.py`)

```python
def _resolve_effective_permissions(user, role_doc):
    # Priority 1: user has individual override
    if bool(user.get("override_permissions")):
        return user.get("permissions", [])
    # Priority 2: role document from DB
    if role_doc and role_doc.get("permissions"):
        return role_doc["permissions"]
    # Priority 3: hardcoded fallback
    return ROLE_PERMISSIONS.get(user["role"], [])
```

### AuthContext (available in every protected endpoint)

```python
@dataclass
class AuthContext:
    user_id:       str
    company_id:    Optional[str]
    role:          str
    permissions:   List[str]
    is_super_admin: bool
    is_seller:     bool
    seller_id:     Optional[str]
    is_owner:      bool
    username:      str
    full_name:     str
    session_id:    str
    user_type:     str
```

---

## 6. PERMISSION SYSTEM

### Roles (system-defined)
`admin`, `candidate_coordinator`, `client_coordinator`, `hr`, `accounts`, `partner`

### Permission naming pattern
`module:action` — e.g., `candidates:view`, `candidates:create`, `jobs:delete`

### Permission Sections (frontend UI groups)
1. Admin Management (`users:*`, `roles:*`, `departments:*`, `designations:*`, `partners:*`)
2. Client Management (`clients:*`)
3. Candidate Management (`candidates:*`)
4. HR Management (`interviews:*`, `applications:*`)
5. Accounts Management (`payments:*`, `payouts:*`)
6. Partner (`partner:*`)
7. Others (`reports:*`, `analytics:*`, `audit:*`, `targets:*`, `imports:*`, `exports:*`)

### Guards (backend)
```python
require_super_admin   # only super admin
require_seller        # only seller accounts
require_company_admin # admin or owner within a company
require_permission("candidates:create")       # exact permission
require_any_permission(["clients:view", "candidates:view"])
require_role("admin")
```

### Guards (frontend)
```js
// Hook
const { has, hasAll, hasAny } = usePermissions()
has("candidates:create")

// Selectors
selectIsSuperAdmin, selectIsSeller, selectIsOwner, selectUserRole, selectUserType
```

---

## 7. SUBSCRIPTION & SEAT SYSTEM

### Subscription Expiry Rule
- `plan_expiry` is calculated **once** at purchase: `now + plan_duration`
- **Stored permanently** in the DB — never recalculated dynamically
- On login: if `now > plan_expiry` → return error, block login
- Error format: `SUBSCRIPTION_EXPIRED_OWNER|{iso_date}|{message}` or `SUBSCRIPTION_EXPIRED_USER|...`

### Seat Limit Rule
- `total_user_seats` = maximum internal users allowed
- Before creating a user: count `{is_deleted:false, user_type:{$ne:"partner"}}` in company DB
- If `count >= total_user_seats` → return `SEAT_LIMIT_REACHED|{total}|{current}|{remaining}`
- API returns HTTP 402 with structured JSON:
```json
{
  "seat_limit_reached": true,
  "message": "User limit reached.",
  "total_user_seats": 5,
  "current_active_users": 5,
  "remaining_seats": 0
}
```

### Seat Upgrade Rule (additive)
- Payment type `seat_upgrade` → `new_total = previous_seats + newly_purchased`
- Payment type `new_subscription` / `renewal` → `new_total = newly_purchased`
- **Existing users are NEVER deleted when upgrading**

### Seat Status Endpoints
```
GET /api/v1/users/seat-status         → tenant seat + subscription info
GET /api/v1/sellers/me/seat-status    → seller seat + subscription info
```

---

## 8. API ENDPOINT SUMMARY

### Auth (`/api/v1/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Login (all user types) |
| POST | `/register` | Register new company |
| POST | `/refresh` | Refresh access token |
| POST | `/logout` | Invalidate session |
| GET | `/me` | Current user info |
| GET | `/me/permissions` | Live permission refresh |
| POST | `/forgot-password` | Send reset email |
| POST | `/reset-password` | Apply new password |
| POST | `/renewal-order` | Create Razorpay payment order |
| POST | `/verify-payment` | Verify and apply payment |

### Super Admin (`/api/v1/super-admin`, `/api/v1/tenants`, `/api/v1/sellers`, `/api/v1/plans`)
| Path | Description |
|------|-------------|
| GET `/super-admin/dashboard` | Stats: tenants, sellers, revenue, expiring subscriptions |
| GET `/super-admin/subscriptions` | All tenant subscriptions with filters |
| GET `/super-admin/reports` | Revenue, seller performance, tenant growth |
| CRUD `/tenants` | Company management |
| CRUD `/sellers` | Reseller management |
| GET `/sellers/{id}/seat-status` | Seller subscription status |
| POST `/sellers/{id}/extend-subscription` | Extend seller subscription + add seats |
| CRUD `/plans` | Plan management |
| GET `/payments` | All payment records |
| CRUD `/discounts` | Discount codes |
| GET `/platform-settings` | Global platform settings |

### Seller Portal (`/api/v1/seller-portal`)
| Path | Description |
|------|-------------|
| GET `/dashboard` | Seller's stats (tenants, revenue, subscriptions) |
| GET `/tenants` | Seller's tenants only |
| POST `/tenants` | Create new tenant under this seller |
| GET `/subscriptions` | Subscriptions for seller's tenants |
| GET `/revenue` | Payments from seller's tenants |
| GET/PUT `/profile` | Seller profile |
| PUT `/profile/password` | Change password |
| GET `/me/seat-status` | Seller's own subscription/seat status |

### Company API (all require company auth)
```
/api/v1/users          → User management (CRUD + seat limit)
/api/v1/roles          → Role management
/api/v1/candidates     → Candidate CRUD + pipeline
/api/v1/clients        → Client CRUD
/api/v1/jobs           → Job CRUD + matching
/api/v1/applications   → Application tracking
/api/v1/interviews     → Interview scheduling
/api/v1/pipelines      → Pipeline stage management
/api/v1/onboards       → Onboarding management
/api/v1/partners       → Partner user management
/api/v1/payouts        → Partner commission payouts
/api/v1/reports        → Report generation + saved reports
/api/v1/analytics      → Analytics dashboard data
/api/v1/targets        → Recruiter targets + leaderboard
/api/v1/audit-logs     → Audit trail
/api/v1/notifications  → In-app notifications
/api/v1/imports        → Bulk CSV import
/api/v1/exports        → Data export
/api/v1/settings       → Company settings
/api/v1/departments    → Department management
/api/v1/designations   → Designation management
/api/v1/admin-dashboard → Admin dashboard stats
```

---

## 9. FRONTEND ROUTE STRUCTURE

```
/login                         ← GuestRoute (redirect if logged in)
/register
/forgot-password

/super-admin                   ← ProtectedRoute (requireSuperAdmin)
/super-admin/tenants
/super-admin/sellers
/super-admin/plans
/super-admin/subscriptions
/super-admin/payments
/super-admin/reports
/super-admin/settings

/seller                        ← ProtectedRoute (requireSeller)
/seller/tenants
/seller/subscriptions
/seller/revenue
/seller/profile

/dashboard                     ← CompanyRoute (any company user)
/users, /users/new, /users/:id
/roles
/candidates, /candidates/:id
/clients, /clients/:id
/jobs, /jobs/:id
/applications
/interviews
/onboards
/partners
/payouts
/reports
/analytics
/targets
/audit
/notifications
/imports, /exports
/settings
/profile
/upgrade-plan
```

---

## 10. REDUX STATE SHAPE

```js
// store.auth
{
  user: {
    id, username, fullName, email,
    role,           // "admin" | "candidate_coordinator" | "seller" | "super_admin" | …
    userType,       // "internal" | "partner" | "seller" | "super_admin"
    permissions,    // ["candidates:view", "candidates:create", …]
    isSuperAdmin,   // bool
    isSeller,       // bool
    sellerId,       // string | null
    isOwner,        // bool
    companyId,      // string | null
    companyName,    // string | null
    // subscription info (from login response)
    planName, planDisplayName, planExpiry, totalUserSeats, isTrialPlan
  },
  token,           // access JWT
  isAuthenticated, // bool
  isLoading,       // bool
  isInitializing,  // bool (true during initAuth)
  error,           // string | null
  subscriptionExpired // bool
}
```

---

## 11. KEY SERVICES (Frontend)

### `api.js` — Axios instance
- Base URL: `import.meta.env.VITE_API_URL` (default: `http://localhost:8000`)
- Auto-attaches `Authorization: Bearer {token}` from localStorage
- On 401: attempts token refresh once, retries original request
- On 402 with `subscription_expired`: dispatches Redux `logout` action

### `subscriptionService.js`
```js
getTenantSeatStatus()           // GET /users/seat-status
getSellerSeatStatus()           // GET /sellers/me/seat-status
createSeatUpgradeOrder(tenantId, planId, additionalSeats, billingCycle)
```

### `sellerService.js` (super admin)
```js
getSellers(params), getSeller(id), createSeller(data),
updateSeller(id, data), deleteSeller(id), getSellerStats(id)
```

### `sellerPortalService.js` (seller self)
```js
getDashboard(), getMyTenants(params), createTenant(data),
getSubscriptions(params), getRevenue(params),
getProfile(), updateProfile(data), changePassword(data)
```

---

## 12. SUBSCRIPTION BANNER & SEAT MODAL (Frontend Components)

### `SubscriptionBanner`
- Shows amber warning when `daysLeft <= 7`
- Shows red warning when `is_expired === true`
- Displays: Plan name, Purchased Seats, Active Users, Remaining
- "Renew Now" or "Upgrade" button → `onUpgrade` callback
- Dismissible (for warnings only, not for expired)

### `SeatLimitModal`
- Popup shown when user tries to add a user but seat limit reached
- Displays: Purchased Seats, Current Users, Remaining Seats
- "Upgrade Users" button → `onUpgrade` callback

---

## 13. AWS INFRASTRUCTURE

```
Internet
    │
    ▼
Application Load Balancer (public subnets, HTTPS only)
    │
    ▼ port 8000
ECS Fargate Tasks (private subnets, 512 CPU / 1024 MB)
    │                │
    ▼                ▼
MongoDB Atlas    ElastiCache Redis (private subnets)
(external)       port 6379

Auto Scaling: Target Tracking
  Scale OUT → CPU > 70%  (cooldown 60s)
  Scale IN  → CPU < 70%  (cooldown 300s)
  Memory guard → scale at 80%
  Min tasks: 1, Max tasks: 6
```

### Terraform files
| File | What it creates |
|------|----------------|
| `main.tf` | VPC, subnets, Internet Gateway, NAT Gateway, route tables |
| `variables.tf` | All input variables |
| `security_groups.tf` | ALB SG, ECS SG, Redis SG |
| `alb.tf` | ALB, ACM certificate, HTTPS listener, HTTP→HTTPS redirect |
| `ecr.tf` | ECR repository + lifecycle policy |
| `ecs.tf` | ECS cluster, task definition, Fargate service |
| `redis.tf` | ElastiCache subnet group + Redis cluster |
| `autoscaling.tf` | App Auto Scaling target, CPU + memory policies, alarms |
| `outputs.tf` | ALB DNS, ECR URL, ECS names, Redis endpoint |

### GitHub Actions workflows
| Workflow | Trigger | What it does |
|---------|---------|-------------|
| `pr-checks.yml` | PR to main | Lint + tests |
| `deploy-backend.yml` | Push to main (backend/) | test → build ECR image → ECS rolling deploy |
| `deploy-frontend.yml` | Push to main (frontend/) | build → deploy |

### Required GitHub Secrets
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

---

## 14. ENVIRONMENT VARIABLES

### Backend (`.env`)
```
MONGODB_URI=mongodb+srv://...
MASTER_DB_NAME=master_db
JWT_SECRET_KEY=<64 char random>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
REDIS_URL=redis://localhost:6379/0
SMTP_USER=noreply@yourcompany.com
SMTP_PASSWORD=...
ENVIRONMENT=development
ALLOWED_ORIGINS=["http://localhost:5173"]
```

### Frontend (`.env`)
```
VITE_API_URL=http://localhost:8000
VITE_RAZORPAY_KEY_ID=rzp_live_...
```

---

## 15. PLANS & PRICING MODEL

```python
DEFAULT_PLANS = [
    Trial: {
        price_per_user_monthly: 0,
        max_users: 3,
        trial_days: 30,
        is_trial_plan: True
    },
    Neon: {
        price_per_user_monthly: 14900,   # ₹149/user/month (in paise)
        price_per_user_yearly:   9900,   # ₹99/user/month billed yearly
    },
    Quantum: {
        price_per_user_monthly: 24900,   # ₹249/user/month
        price_per_user_yearly:  14900,   # ₹149/user/month billed yearly
    }
]
```

Payment order amount = `price_per_user * user_count` (in paise, Razorpay standard)

---

## 16. COMMON PATTERNS TO FOLLOW

### Backend endpoint pattern
```python
@router.get("/items")
async def list_items(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    auth: AuthContext = Depends(require_permission("items:view")),
    company_db = Depends(get_company_db),
):
    service = ItemService(company_db["items"])
    items, total = await service.list_items(search=search, page=page, limit=limit)
    return {"items": items, "total": total, "page": page, "limit": limit}
```

### Frontend page pattern
```jsx
export default function MyPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const { has } = usePermissions()

  useEffect(() => {
    myService.getAll().then(r => setData(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loader />
  return (
    <div>
      {has('items:create') && <button>Add New</button>}
      <Table data={data} columns={columns} />
    </div>
  )
}
```

### Service method pattern (backend)
```python
class MyService:
    def __init__(self, collection):
        self.collection = collection

    async def list_items(self, search=None, page=1, limit=20):
        query = {"is_deleted": False}
        if search:
            query["$or"] = [{"name": {"$regex": search, "$options": "i"}}]
        total = await self.collection.count_documents(query)
        items = await self.collection.find(query).skip((page-1)*limit).limit(limit).to_list(limit)
        return items, total
```

---

## 17. KEY BUSINESS RULES

1. **Tenant isolation**: Company users can only access their own `company_{id}_db`. Cross-company access is impossible by design.
2. **Owner cannot be deleted**: The owner user account is protected.
3. **Partner users** are excluded from seat count (`user_type != "partner"`).
4. **Sellers cannot access super-admin routes** and vice versa — separate JWT flags enforced server-side.
5. **Plan expiry blocks all users** of that company, not just the owner.
6. **Seat limit does not affect existing users** — only blocks new user creation.
7. **Seat upgrade is always additive** — buying 5 more seats on a 3-seat plan gives 8 total.
8. **Role permissions vs override permissions**: If `override_permissions=true` on a user, their individual `permissions` list is used instead of the role's.
9. **Soft deletes everywhere**: No hard deletes. `is_deleted=true` + `deleted_at` timestamp.
10. **MongoDB `_id` is a UUID string**, not ObjectId. The field is aliased as `id` in responses.
