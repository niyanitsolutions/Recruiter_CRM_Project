import React, { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  selectIsAuthenticated, selectIsSuperAdmin, selectIsSeller, selectUserRole, selectUserType, selectUser,
  selectIsInitializing, selectProfileCompleted, selectForcePasswordChange,
  initAuth, setProfileCompleted, clearForcePasswordChange,
} from './store/authSlice'
import { useAutoLogout } from './hooks/useAutoLogout'
import api from './services/api'

// Layouts
import { Layout, AuthLayout } from './components/layout'

// Auth Pages
import { Login, Register, ForgotPassword, UpgradePlan, VerifyEmail, ChangePassword } from './pages/auth'

// SuperAdmin Pages
import {
  Dashboard as SuperAdminDashboard, Tenants, Payments, SuperAdminProfile, SuperAdminSettings,
  Sellers, Plans, Subscriptions, SuperAdminReports, Discounts,
} from './pages/super-admin'

// Seller Portal Pages
import {
  SellerDashboard, SellerTenants, SellerSubscriptions, SellerRevenue,
  SellerPayments, SellerCommissions, SellerNotifications, SellerProfile,
} from './pages/seller'

// Phase 2 - Company Admin Pages
import {
  AdminDashboard,
  Users,
  InactiveUsers,
  UserForm,
  UserDetails,
  Partners,
  PartnerForm,
  Roles,
  RoleForm,
  Departments,
  DepartmentForm,
  Designations,
  DesignationForm,
  AuditLogs,
  Profile,
  Settings,
  CompanySettings,
  InterviewSettings
} from './pages/admin'

// Phase 3 - Recruitment Pages
import {
  RecruitmentDashboard,
  Clients,
  ClientForm,
  Candidates,
  CandidateForm,
  CandidateDetails,
  CandidatePublicForm,
  Jobs,
  JobForm,
  JobDetails,
  JobMatchingCandidates,
  Applications,
  ApplicationDetail,
  Interviews,
  InterviewForm,
  InterviewDetail,
  FeedbackForm
} from './pages/recruitment'

// Phase 4 - Onboarding & Payout Pages
import {
  Onboards,
  OnboardForm,
  OnboardDetails,
  PartnerPayouts,
  RaiseInvoice,
  Invoices,
  Notifications
} from './pages/phase4'

// Settings sub-pages (Phase 6)
import {
  TeamsPage, BranchesPage, PipelineStagePage, JobCategoriesPage,
  InterviewSettingsPage, DocumentTemplatesPage, ResumeParsingPage, CandidateSourcesPage,
  InvoiceSettingsPage, CommissionRulesPage, LocalizationPage,
  EmailConfigPage, NotificationSettingsPage, SecuritySettingsPage,
  DataManagementPage, CustomFieldsPage, BrandingPage, SLAConfigPage,
  LoginActivityPage,
} from './pages/settings'

// Phase 5 - Reports, Analytics, Imports, Exports, Targets, Audit
import ReportsPage from './pages/reports/ReportsPage'
import ReportGenerator from './pages/reports/ReportGenerator'
import ReportViewer from './pages/reports/ReportViewer'
import SavedReports from './pages/reports/SavedReports'
import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard'
import ImportsPage from './pages/imports/ImportsPage'
import ExportsPage from './pages/exports/ExportsPage'
import TargetsPage from './pages/targets/TargetsPage'
import Leaderboard from './pages/targets/Leaderboard'
import AuditLogsPage from './pages/audit/AuditLogsPage'
import { Tasks } from './pages/tasks'

// ─── Permission-aware default landing page ────────────────────────────────────
// Used for post-login redirect and for bounce-back when a user hits a
// route they're not allowed to access.
// SINGLE SOURCE OF TRUTH: always derived from permissions, never from role slug.
export const getDefaultRoute = (role, permissions = [], userType = 'internal') => {
  // Partner user type always lands on their own portal
  if (userType === 'partner' || role === 'partner') return '/my-candidates'

  // Permission-first priority — same for every role including admin/owner
  const p = new Set(permissions || [])
  if (p.has('dashboard:view'))                               return '/dashboard'
  if (p.has('candidates:view'))                              return '/candidates'
  if (p.has('interviews:view'))                              return '/interviews'
  if (p.has('clients:view'))                                 return '/clients'
  if (p.has('jobs:view'))                                    return '/jobs'
  if (p.has('applications:view'))                            return '/applications'
  if (p.has('onboards:view'))                                return '/onboards'
  if (p.has('accounts:payouts') || p.has('accounts:view'))   return '/payouts'
  if (p.has('users:view'))                                   return '/users'
  if (p.has('reports:view'))                                 return '/reports'
  if (p.has('audit:view'))                                   return '/audit-logs'
  return '/recruitment'
}

// ─── Route Guards ─────────────────────────────────────────────────────────────

/** Redirects logged-in users away from auth pages */
const GuestRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const isSuperAdmin   = useSelector(selectIsSuperAdmin)
  const isSeller       = useSelector(selectIsSeller)
  const userRole       = useSelector(selectUserRole)
  const userType       = useSelector(selectUserType)
  const user           = useSelector(selectUser)

  if (isAuthenticated) {
    const dest = isSuperAdmin
      ? '/super-admin'
      : isSeller
        ? '/seller'
        : getDefaultRoute(userRole, user?.permissions, userType)
    return <Navigate to={dest} replace />
  }
  return children
}

/** Blocks unauthenticated users; optionally requires super-admin or seller */
const ProtectedRoute = ({ children, requireSuperAdmin = false, requireSeller = false }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const isSuperAdmin   = useSelector(selectIsSuperAdmin)
  const isSeller       = useSelector(selectIsSeller)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (requireSuperAdmin && !isSuperAdmin) return <Navigate to="/login" replace />
  if (requireSeller && !isSeller) return <Navigate to="/login" replace />
  return children
}

/**
 * Restricts access by role (e.g. admin-only or partner-only blocks).
 * When no allowedRoles provided, only checks authentication.
 */
const CompanyRoute = ({ children, allowedRoles = [] }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const isSuperAdmin   = useSelector(selectIsSuperAdmin)
  const isSeller       = useSelector(selectIsSeller)
  const userRole       = useSelector(selectUserRole)
  const userType       = useSelector(selectUserType)
  const user           = useSelector(selectUser)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isSuperAdmin) return <Navigate to="/super-admin" replace />
  if (isSeller)     return <Navigate to="/seller" replace />

  if (allowedRoles.length > 0) {
    // 'partner' in allowedRoles → gate on user_type or role slug (fallback for legacy accounts)
    const partnerAllowed = allowedRoles.includes('partner') && (userType === 'partner' || userRole === 'partner')
    const roleAllowed    = allowedRoles.some(r => r !== 'partner' && r === userRole)
    if (!partnerAllowed && !roleAllowed) {
      return <Navigate to={getDefaultRoute(userRole, user?.permissions, userType)} replace />
    }
  }
  return children
}

/**
 * Per-route permission guard.
 * Owner bypasses all checks (company-level superuser).
 * Partners are confined to their own route block.
 * All other roles must hold the specific permission string.
 *
 * showUnauthorized=true → render an inline "Access Denied" page instead of
 * silently redirecting (useful for routes the user can navigate TO manually).
 */
const PermissionRoute = ({ children, permission, showUnauthorized = false }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const isSuperAdmin   = useSelector(selectIsSuperAdmin)
  const user           = useSelector(selectUser)
  const userRole       = useSelector(selectUserRole)
  const userType       = useSelector(selectUserType)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isSuperAdmin) return <Navigate to="/super-admin" replace />

  // Owner skips all permission checks
  if (user?.isOwner) return children

  // Partners have their own route block — skip checks inside partner routes
  if (userType === 'partner') return children

  // Enforce permission
  const permissionSet = new Set(user?.permissions || [])
  if (permission && !permissionSet.has(permission)) {
    if (showUnauthorized) return <Unauthorized />
    return <Navigate to={getDefaultRoute(userRole, user?.permissions, userType)} replace />
  }

  return children
}

// ─── Unauthorized Page ────────────────────────────────────────────────────────
/**
 * Shown when a user navigates directly to a route their permissions don't cover.
 * Used via <PermissionRoute showUnauthorized> — provides a clear, actionable
 * message instead of a silent redirect.
 */
const Unauthorized = () => {
  const nav      = useNavigate()
  const userRole = useSelector(selectUserRole)
  const userType = useSelector(selectUserType)
  const user     = useSelector(selectUser)

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-6">
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-surface-900 mb-2">Access Denied</h1>
        <p className="text-surface-500 mb-6">
          You don't have permission to view this page. Contact your administrator
          if you believe this is a mistake.
        </p>
        <button
          onClick={() => nav(getDefaultRoute(userRole, user?.permissions, userType), { replace: true })}
          className="px-6 py-2.5 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}

// ─── Error Boundary ────────────────────────────────────────────────────────────
/**
 * Catches any render-time JS error in the subtree and shows a recovery UI
 * instead of a white screen.
 */
class ErrorBoundary extends React.Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('App render error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-50">
          <div className="text-center p-8">
            <h1 className="text-4xl font-bold text-surface-300 mb-4">Something went wrong</h1>
            <p className="text-surface-500 mb-6">An unexpected error occurred. Please refresh the page.</p>
            <a
              href="/login"
              className="inline-block px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Return to Login
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Force Password Change Modal ─────────────────────────────────────────────
/**
 * Blocking modal shown when must_change_password=true on login.
 * The user cannot navigate anywhere until they set a new password.
 * Uses the same /auth/change-password API endpoint as the voluntary flow.
 *
 * No current_password required — admin-assigned passwords are single-use.
 * After success the forcePasswordChange flag is cleared and navigation resumes.
 */
const ForcePasswordModal = () => {
  const dispatch     = useDispatch()
  const user         = useSelector(selectUser)
  const isForced     = useSelector(selectForcePasswordChange)
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState('')

  const { register, handleSubmit, watch, formState: { errors } } = useForm({ mode: 'onBlur' })
  const newPass = watch('new_password', '')

  if (!isForced) return null

  const onSubmit = async (data) => {
    setSaving(true)
    setApiError('')
    try {
      // Use admin-reset endpoint so no current_password is needed
      await api.post('/users/me/force-change-password', {
        new_password:     data.new_password,
        confirm_password: data.confirm_password,
      })
      toast.success('Password updated! Welcome.')
      dispatch(clearForcePasswordChange())
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to update password.'
      setApiError(typeof msg === 'string' ? msg : 'Failed to update password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-3">
            <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-surface-900">Set Your New Password</h2>
          <p className="text-surface-500 text-sm mt-1">
            Hi {user?.fullName || 'there'}, your administrator has assigned a temporary password.
            Please choose a new one to continue.
          </p>
        </div>

        {apiError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="input-label">New Password</label>
            <input
              type="password"
              className={`input ${errors.new_password ? 'border-danger-500' : ''}`}
              placeholder="Min. 8 characters"
              {...register('new_password', {
                required: 'New password is required',
                minLength: { value: 8, message: 'Minimum 8 characters' },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                  message: 'Must include uppercase, lowercase, and a number',
                },
              })}
            />
            {errors.new_password && <p className="input-error-text mt-1">{errors.new_password.message}</p>}
          </div>

          <div>
            <label className="input-label">Confirm New Password</label>
            <input
              type="password"
              className={`input ${errors.confirm_password ? 'border-danger-500' : ''}`}
              placeholder="Repeat new password"
              {...register('confirm_password', {
                required: 'Please confirm your password',
                validate: v => v === newPass || 'Passwords do not match',
              })}
            />
            {errors.confirm_password && <p className="input-error-text mt-1">{errors.confirm_password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors mt-2"
          >
            {saving ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Profile Completion Modal ─────────────────────────────────────────────────
/**
 * One-time popup shown to users whose profile_completed flag is false.
 *
 * Flow:
 * 1. On mount, fetch GET /users/me to get the current DB values.
 * 2. Check which required fields are actually empty (mobile, designation).
 * 3. If NONE are missing → silently mark profile complete via PUT /users/me, no popup.
 * 4. If SOME are missing → show the popup with ONLY those fields.
 * 5. On save → PUT /users/me with the filled values + profile_completed: true.
 */

// Fields that constitute a "complete" profile for the popup check.
const REQUIRED_PROFILE_FIELDS = [
  { key: 'mobile',      label: 'Mobile Number',  placeholder: '10-digit mobile number' },
  { key: 'designation', label: 'Designation',     placeholder: 'e.g. Software Engineer'  },
]

const ProfileCompleteModal = () => {
  const dispatch        = useDispatch()
  const user            = useSelector(selectUser)
  const profileCompleted = useSelector(selectProfileCompleted)

  // null = still checking, [] = nothing missing (no popup), [...] = fields to fill
  const [missingFields, setMissingFields] = useState(null)
  const [saving, setSaving]               = useState(false)

  // Show to ALL authenticated company users (not super-admin or seller — they have no profile_completed flag)
  const shouldCheck = !!user?.id && !user?.isSuperAdmin && !user?.isSeller && profileCompleted === false

  const { register, handleSubmit, formState: { errors } } = useForm({ mode: 'onBlur' })

  // On mount: fetch fresh profile data and decide whether to show the popup
  useEffect(() => {
    if (!shouldCheck || !user?.id) return

    let cancelled = false
    ;(async () => {
      try {
        const res     = await api.get('/users/me')
        const profile = res.data?.data || res.data || {}

        const missing = REQUIRED_PROFILE_FIELDS.filter(
          f => !profile[f.key] || String(profile[f.key]).trim() === ''
        )

        if (cancelled) return

        if (missing.length === 0) {
          // Everything is already filled — silently mark complete, no popup
          await api.put('/users/me', { profile_completed: true })
          dispatch(setProfileCompleted())
        } else {
          setMissingFields(missing)
        }
      } catch {
        // If the fetch fails, fall back to showing the full popup so the user
        // is not blocked. Mark as complete after they submit.
        if (!cancelled) setMissingFields(REQUIRED_PROFILE_FIELDS)
      }
    })()

    return () => { cancelled = true }
  }, [shouldCheck, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render until we know what's missing (avoid flash)
  if (!shouldCheck || missingFields === null || missingFields.length === 0) return null

  const onSubmit = async (data) => {
    setSaving(true)
    try {
      await api.put('/users/me', {
        ...data,
        profile_completed: true,
      })
      dispatch(setProfileCompleted())
      toast.success('Profile updated!')
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message
      toast.error(typeof msg === 'string' ? msg : 'Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-100 mb-3">
            <span className="text-2xl">👋</span>
          </div>
          <h2 className="text-xl font-bold text-surface-900">Complete Your Profile</h2>
          <p className="text-surface-500 text-sm mt-1">
            Please fill in the missing details to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Read-only identity fields shown for context */}
          {user?.fullName && (
            <div>
              <label className="input-label">Full Name</label>
              <input className="input bg-surface-50 cursor-not-allowed" value={user.fullName} disabled />
            </div>
          )}
          <div>
            <label className="input-label">Email</label>
            <input className="input bg-surface-50 cursor-not-allowed" value={user?.email || ''} disabled />
          </div>

          {/* Only render fields that are actually missing */}
          {missingFields.map(field => (
            <div key={field.key}>
              <label className="input-label">
                {field.label} <span className="text-danger-500">*</span>
              </label>
              <input
                className={`input ${errors[field.key] ? 'border-danger-500' : ''}`}
                placeholder={field.placeholder}
                {...register(field.key, {
                  required: `${field.label} is required`,
                  ...(field.key === 'mobile' && {
                    pattern: {
                      value: /^[6-9]\d{9}$/,
                      message: 'Enter a valid 10-digit mobile number starting with 6–9',
                    },
                  }),
                })}
              />
              {errors[field.key] && (
                <p className="input-error-text mt-1">{errors[field.key].message}</p>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors mt-2"
          >
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Auth Initializer ─────────────────────────────────────────────────────────
/**
 * Runs once on app mount.
 * If isInitializing=true (expired access token but a refresh_token exists),
 * attempts a silent refresh. Shows a spinner while this is in progress.
 * useRef guard prevents double-dispatch in React StrictMode (dev).
 */
const AuthInitializer = ({ children }) => {
  const dispatch       = useDispatch()
  const isInitializing = useSelector(selectIsInitializing)
  const didInit        = useRef(false)

  useEffect(() => {
    if (isInitializing && !didInit.current) {
      didInit.current = true
      dispatch(initAuth())
    }
  }, [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-500 text-sm">Resuming your session…</p>
        </div>
      </div>
    )
  }
  return children
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  useAutoLogout()   // idle timer + screen-lock detection + multi-tab sync

  return (
    <ErrorBoundary>
    <AuthInitializer>
    <ForcePasswordModal />
    <ProfileCompleteModal />
    <Routes>
      {/* AUTH — Login & ForgotPassword use the split-panel AuthLayout */}
      <Route element={<GuestRoute><AuthLayout /></GuestRoute>}>
        <Route path="/login"           element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>

      {/* Register is standalone (full-screen, no split panel) */}
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />

      {/* Change password — requires authentication, uses AuthLayout */}
      <Route element={<ProtectedRoute><AuthLayout /></ProtectedRoute>}>
        <Route path="/change-password" element={<ChangePassword />} />
      </Route>

      {/* Upgrade plan — public, accessible to expired owners who can't log in */}
      <Route path="/upgrade-plan" element={<UpgradePlan />} />

      {/* Candidate self-registration via form link — public, no auth */}
      <Route path="/apply/:token" element={<CandidatePublicForm />} />

      {/* Email verification — public, uses AuthLayout for consistent design */}
      <Route element={<AuthLayout />}>
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Route>

      {/* SUPER ADMIN */}
      <Route element={<ProtectedRoute requireSuperAdmin><Layout title="Super Admin" /></ProtectedRoute>}>
        <Route path="/super-admin"                   element={<SuperAdminDashboard />} />
        <Route path="/super-admin/tenants"           element={<Tenants />} />
        <Route path="/super-admin/sellers"           element={<Sellers />} />
        <Route path="/super-admin/plans"             element={<Plans />} />
        <Route path="/super-admin/discounts"         element={<Discounts />} />
        <Route path="/super-admin/subscriptions"     element={<Subscriptions />} />
        <Route path="/super-admin/payments"          element={<Payments />} />
        <Route path="/super-admin/reports"           element={<SuperAdminReports />} />
        <Route path="/super-admin/profile"           element={<SuperAdminProfile />} />
        <Route path="/super-admin/settings"          element={<SuperAdminSettings />} />
      </Route>

      {/* SELLER PORTAL */}
      <Route element={<ProtectedRoute requireSeller><Layout title="Seller Portal" /></ProtectedRoute>}>
        <Route path="/seller"                  element={<SellerDashboard />} />
        <Route path="/seller/tenants"          element={<SellerTenants />} />
        <Route path="/seller/subscriptions"    element={<SellerSubscriptions />} />
        <Route path="/seller/payments"         element={<SellerPayments />} />
        <Route path="/seller/commissions"      element={<SellerCommissions />} />
        <Route path="/seller/notifications"    element={<SellerNotifications />} />
        <Route path="/seller/profile"          element={<SellerProfile />} />
        <Route path="/seller/revenue"          element={<SellerRevenue />} />
      </Route>

      {/* ADMIN ONLY */}
      <Route element={<CompanyRoute allowedRoles={['admin']}><Layout title="Admin" /></CompanyRoute>}>
        <Route path="/settings" element={<PermissionRoute permission="crm_settings:view"><Settings /></PermissionRoute>} />
        <Route path="/company-settings" element={<PermissionRoute permission="crm_settings:view"><CompanySettings /></PermissionRoute>} />

        {/* Settings sub-pages */}
        <Route path="/settings/teams"                element={<PermissionRoute permission="crm_settings:view"><TeamsPage /></PermissionRoute>} />
        <Route path="/settings/branches"             element={<PermissionRoute permission="crm_settings:view"><BranchesPage /></PermissionRoute>} />
        <Route path="/settings/pipeline-stages"      element={<PermissionRoute permission="crm_settings:view"><PipelineStagePage /></PermissionRoute>} />
        <Route path="/settings/job-categories"       element={<PermissionRoute permission="crm_settings:view"><JobCategoriesPage /></PermissionRoute>} />
        <Route path="/settings/interview-settings"   element={<PermissionRoute permission="crm_settings:view"><InterviewSettingsPage /></PermissionRoute>} />
        <Route path="/settings/document-templates"   element={<PermissionRoute permission="crm_settings:view"><DocumentTemplatesPage /></PermissionRoute>} />
        <Route path="/settings/resume-parsing"       element={<PermissionRoute permission="crm_settings:view"><ResumeParsingPage /></PermissionRoute>} />
        <Route path="/settings/candidate-sources"    element={<PermissionRoute permission="crm_settings:view"><CandidateSourcesPage /></PermissionRoute>} />
        <Route path="/settings/invoice-settings"     element={<PermissionRoute permission="crm_settings:view"><InvoiceSettingsPage /></PermissionRoute>} />
        <Route path="/settings/commission-rules"     element={<PermissionRoute permission="crm_settings:view"><CommissionRulesPage /></PermissionRoute>} />
        <Route path="/settings/localization"         element={<PermissionRoute permission="crm_settings:view"><LocalizationPage /></PermissionRoute>} />
        <Route path="/settings/email-config"         element={<PermissionRoute permission="crm_settings:view"><EmailConfigPage /></PermissionRoute>} />
        <Route path="/settings/notification-settings" element={<PermissionRoute permission="crm_settings:view"><NotificationSettingsPage /></PermissionRoute>} />
        <Route path="/settings/security"             element={<PermissionRoute permission="crm_settings:view"><SecuritySettingsPage /></PermissionRoute>} />
        <Route path="/settings/data-management"      element={<PermissionRoute permission="crm_settings:view"><DataManagementPage /></PermissionRoute>} />
        <Route path="/settings/custom-fields"        element={<PermissionRoute permission="crm_settings:view"><CustomFieldsPage /></PermissionRoute>} />
        <Route path="/settings/branding"             element={<PermissionRoute permission="crm_settings:view"><BrandingPage /></PermissionRoute>} />
        <Route path="/settings/sla-config"           element={<PermissionRoute permission="crm_settings:view"><SLAConfigPage /></PermissionRoute>} />
        <Route path="/settings/login-activity"       element={<PermissionRoute permission="crm_settings:view"><LoginActivityPage /></PermissionRoute>} />
      </Route>

      {/* PARTNER ONLY */}
      <Route element={<CompanyRoute allowedRoles={['partner']}><Layout title="Partner Portal" /></CompanyRoute>}>
        <Route path="/my-candidates"        element={<Candidates />} />
        <Route path="/my-candidates/new"    element={<CandidateForm />} />
        <Route path="/my-candidates/:id"    element={<CandidateDetails />} />
        <Route path="/available-jobs"       element={<Jobs />} />
        <Route path="/available-jobs/:id"   element={<JobDetails />} />
        <Route path="/my-payouts"           element={<PartnerPayouts />} />
        <Route path="/my-invoices"          element={<Invoices />} />
        <Route path="/raise-invoice"        element={<RaiseInvoice />} />
      </Route>

      {/* ALL COMPANY USERS — each route enforces its own permission */}
      <Route element={<CompanyRoute><Layout /></CompanyRoute>}>

        {/* General landing (no specific permission required) */}
        <Route path="/recruitment" element={<RecruitmentDashboard />} />
        <Route
          path="/dashboard"
          element={<PermissionRoute permission="dashboard:view"><AdminDashboard /></PermissionRoute>}
        />

        {/* ── Recruitment ── */}
        <Route path="/clients"
          element={<PermissionRoute permission="clients:view"><Clients /></PermissionRoute>} />
        <Route path="/clients/new"
          element={<PermissionRoute permission="clients:create"><ClientForm /></PermissionRoute>} />
        <Route path="/clients/:id"
          element={<PermissionRoute permission="clients:view"><ClientForm /></PermissionRoute>} />
        <Route path="/clients/:id/edit"
          element={<PermissionRoute permission="clients:edit"><ClientForm /></PermissionRoute>} />

        <Route path="/candidates"
          element={<PermissionRoute permission="candidates:view"><Candidates /></PermissionRoute>} />
        <Route path="/candidates/new"
          element={<PermissionRoute permission="candidates:create"><CandidateForm /></PermissionRoute>} />
        <Route path="/candidates/:id"
          element={<PermissionRoute permission="candidates:view"><CandidateDetails /></PermissionRoute>} />
        <Route path="/candidates/:id/edit"
          element={<PermissionRoute permission="candidates:edit"><CandidateForm /></PermissionRoute>} />

        <Route path="/jobs"
          element={<PermissionRoute permission="jobs:view"><Jobs /></PermissionRoute>} />
        <Route path="/jobs/new"
          element={<PermissionRoute permission="jobs:create"><JobForm /></PermissionRoute>} />
        <Route path="/jobs/view/:id"
          element={<PermissionRoute permission="jobs:view"><JobDetails /></PermissionRoute>} />
        <Route path="/jobs/edit/:id"
          element={<PermissionRoute permission="jobs:edit"><JobForm /></PermissionRoute>} />
        <Route path="/jobs/:id/matching"
          element={<PermissionRoute permission="jobs:view"><JobMatchingCandidates /></PermissionRoute>} />

        <Route path="/applications"
          element={<PermissionRoute permission="candidates:view"><Applications /></PermissionRoute>} />
        <Route path="/applications/:id"
          element={<PermissionRoute permission="candidates:view"><ApplicationDetail /></PermissionRoute>} />

        <Route path="/interviews"
          element={<PermissionRoute permission="interviews:view"><Interviews /></PermissionRoute>} />
        <Route path="/interviews/settings"
          element={<PermissionRoute permission="interview_settings:view"><InterviewSettings /></PermissionRoute>} />
        <Route path="/interviews/schedule"
          element={<PermissionRoute permission="interviews:schedule"><InterviewForm /></PermissionRoute>} />
        <Route path="/interviews/:id"
          element={<PermissionRoute permission="interviews:view"><InterviewDetail /></PermissionRoute>} />
        <Route path="/interviews/:id/feedback"
          element={<PermissionRoute permission="interviews:update_status"><FeedbackForm /></PermissionRoute>} />

        {/* ── User Management ── */}
        <Route path="/users"
          element={<PermissionRoute permission="users:view"><Users /></PermissionRoute>} />
        <Route path="/users/inactive"
          element={<PermissionRoute permission="users:view"><InactiveUsers /></PermissionRoute>} />
        <Route path="/users/new"
          element={<PermissionRoute permission="users:create"><UserForm /></PermissionRoute>} />
        <Route path="/users/:id"
          element={<PermissionRoute permission="users:view"><UserDetails /></PermissionRoute>} />
        <Route path="/users/:id/edit"
          element={<PermissionRoute permission="users:edit"><UserForm /></PermissionRoute>} />

        {/* ── Partner Management ── */}
        <Route path="/partners"
          element={<PermissionRoute permission="partners:view"><Partners /></PermissionRoute>} />
        <Route path="/partners/new"
          element={<PermissionRoute permission="partners:create"><PartnerForm /></PermissionRoute>} />
        <Route path="/partners/:id"
          element={<PermissionRoute permission="partners:view"><PartnerForm /></PermissionRoute>} />
        <Route path="/partners/:id/edit"
          element={<PermissionRoute permission="partners:edit"><PartnerForm /></PermissionRoute>} />

        <Route path="/roles"
          element={<PermissionRoute permission="roles:view"><Roles /></PermissionRoute>} />
        <Route path="/roles/new"
          element={<PermissionRoute permission="roles:create"><RoleForm /></PermissionRoute>} />
        <Route path="/roles/:id/edit"
          element={<PermissionRoute permission="roles:edit"><RoleForm /></PermissionRoute>} />

        <Route path="/departments"
          element={<PermissionRoute permission="departments:view"><Departments /></PermissionRoute>} />
        <Route path="/departments/new"
          element={<PermissionRoute permission="departments:create"><DepartmentForm /></PermissionRoute>} />
        <Route path="/departments/:id/edit"
          element={<PermissionRoute permission="departments:edit"><DepartmentForm /></PermissionRoute>} />

        <Route path="/designations"
          element={<PermissionRoute permission="designations:view"><Designations /></PermissionRoute>} />
        <Route path="/designations/new"
          element={<PermissionRoute permission="designations:create"><DesignationForm /></PermissionRoute>} />
        <Route path="/designations/:id/edit"
          element={<PermissionRoute permission="designations:edit"><DesignationForm /></PermissionRoute>} />

        {/* ── Onboarding ── */}
        <Route path="/onboards"
          element={<PermissionRoute permission="onboards:view"><Onboards /></PermissionRoute>} />
        <Route path="/onboards/new"
          element={<PermissionRoute permission="onboards:create"><OnboardForm /></PermissionRoute>} />
        <Route path="/onboards/:id"
          element={<PermissionRoute permission="onboards:view"><OnboardDetails /></PermissionRoute>} />
        <Route path="/onboards/:id/edit"
          element={<PermissionRoute permission="onboards:edit"><OnboardForm /></PermissionRoute>} />
        <Route path="/hr/onboarding"
          element={<PermissionRoute permission="onboards:view"><Onboards /></PermissionRoute>} />
        <Route path="/hr/onboarding/:id"
          element={<PermissionRoute permission="onboards:view"><OnboardDetails /></PermissionRoute>} />

        {/* ── Payouts / Finance ── */}
        <Route path="/payouts"
          element={<PermissionRoute permission="accounts:payouts"><PartnerPayouts /></PermissionRoute>} />
        <Route path="/payouts/:id"
          element={<PermissionRoute permission="accounts:payouts"><PartnerPayouts /></PermissionRoute>} />
        <Route path="/payouts/invoices"
          element={<PermissionRoute permission="accounts:invoices"><Invoices /></PermissionRoute>} />
        <Route path="/payouts/invoices/:id"
          element={<PermissionRoute permission="accounts:invoices"><Invoices /></PermissionRoute>} />

        {/* ── Reports ── */}
        <Route path="/reports"
          element={<PermissionRoute permission="reports:view"><ReportsPage /></PermissionRoute>} />
        <Route path="/reports/generate/:reportType"
          element={<PermissionRoute permission="reports:view"><ReportGenerator /></PermissionRoute>} />
        <Route path="/reports/view/:reportId"
          element={<PermissionRoute permission="reports:view"><ReportViewer /></PermissionRoute>} />
        <Route path="/reports/edit/:reportId"
          element={<PermissionRoute permission="reports:edit"><ReportGenerator /></PermissionRoute>} />
        <Route path="/reports/saved"
          element={<PermissionRoute permission="reports:view"><SavedReports /></PermissionRoute>} />

        {/* ── Analytics ── */}
        <Route path="/analytics"
          element={<PermissionRoute permission="analytics:view"><AnalyticsDashboard /></PermissionRoute>} />

        {/* ── Imports / Exports ── */}
        <Route path="/imports"
          element={<PermissionRoute permission="imports:view"><ImportsPage /></PermissionRoute>} />
        <Route path="/exports"
          element={<PermissionRoute permission="exports:view"><ExportsPage /></PermissionRoute>} />

        {/* ── Targets ── */}
        <Route path="/targets"
          element={<PermissionRoute permission="targets:view"><TargetsPage /></PermissionRoute>} />
        <Route path="/targets/:targetId"
          element={<PermissionRoute permission="targets:view"><TargetsPage /></PermissionRoute>} />
        <Route path="/targets/edit/:targetId"
          element={<PermissionRoute permission="targets:view"><TargetsPage /></PermissionRoute>} />
        <Route path="/leaderboard"
          element={<PermissionRoute permission="targets:view"><Leaderboard /></PermissionRoute>} />

        {/* ── Tasks ── */}
        <Route path="/tasks"
          element={<CompanyRoute><Tasks /></CompanyRoute>} />

        {/* ── Audit ── */}
        <Route path="/audit-logs"
          element={<PermissionRoute permission="audit:view"><AuditLogs /></PermissionRoute>} />
        <Route path="/audit"
          element={<PermissionRoute permission="audit:view"><AuditLogsPage /></PermissionRoute>} />
        <Route path="/audit/sessions"
          element={<PermissionRoute permission="audit:view"><AuditLogsPage /></PermissionRoute>} />
        <Route path="/audit/alerts"
          element={<PermissionRoute permission="audit:view"><AuditLogsPage /></PermissionRoute>} />

        {/* ── Always-accessible utility pages ── */}
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/my-profile"    element={<Profile />} />
        <Route path="/profile"       element={<Profile />} />
      </Route>

      {/* DEFAULT */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center bg-surface-50">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-surface-200">404</h1>
            <p className="text-xl text-surface-600 mt-4">Page not found</p>
            <a href="/login" className="mt-6 inline-block text-primary-600 hover:text-primary-700">Go to Login</a>
          </div>
        </div>
      } />
    </Routes>
    </AuthInitializer>
    </ErrorBoundary>
  )
}

export default App
