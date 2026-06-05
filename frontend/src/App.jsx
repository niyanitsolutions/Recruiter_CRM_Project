import React, { useCallback, useEffect, useRef, useState, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  selectIsAuthenticated, selectIsSuperAdmin, selectIsSeller, selectUserRole, selectUserType, selectUser,
  selectIsInitializing, selectProfileCompleted, selectForcePasswordChange,
  initAuth, setProfileCompleted, clearForcePasswordChange, refreshToken, logoutUser,
} from './store/authSlice'
import { useAutoLogout } from './hooks/useAutoLogout'
import { MY_PORTAL_ALLOWED_ROLES } from './config/portalConfig'
import { useSessionWebSocket } from './hooks/useSessionWebSocket'
import { useFavicon } from './hooks/useFavicon'
import api from './services/api'
import departmentService  from './services/departmentService'
import designationService from './services/designationService'
import userService        from './services/userService'
import SessionExpiryModal    from './components/auth/SessionExpiryModal'
import SessionWarningModal   from './components/auth/SessionWarningModal'
import LoginRequestModal     from './components/auth/LoginRequestModal'

// Layouts — kept eager so the app shell (sidebar + topbar) renders immediately
import { Layout, AuthLayout } from './components/layout'

// ─── Lazy page bundles ────────────────────────────────────────────────────────
// Each group becomes a separate JS chunk; the chunk loads on first visit to
// any route in that group and is then cached indefinitely by the browser.

// Auth
const Login           = lazy(() => import('./pages/auth').then(m => ({ default: m.Login })))
const Register        = lazy(() => import('./pages/auth').then(m => ({ default: m.Register })))
const ForgotPassword  = lazy(() => import('./pages/auth').then(m => ({ default: m.ForgotPassword })))
const UpgradePlan     = lazy(() => import('./pages/auth').then(m => ({ default: m.UpgradePlan })))
const VerifyEmail     = lazy(() => import('./pages/auth').then(m => ({ default: m.VerifyEmail })))
const ChangePassword  = lazy(() => import('./pages/auth').then(m => ({ default: m.ChangePassword })))

// Super Admin
const SuperAdminDashboard  = lazy(() => import('./pages/super-admin').then(m => ({ default: m.Dashboard })))
const Tenants              = lazy(() => import('./pages/super-admin').then(m => ({ default: m.Tenants })))
const Payments             = lazy(() => import('./pages/super-admin').then(m => ({ default: m.Payments })))
const SuperAdminProfile    = lazy(() => import('./pages/super-admin').then(m => ({ default: m.SuperAdminProfile })))
const SuperAdminSettings   = lazy(() => import('./pages/super-admin').then(m => ({ default: m.SuperAdminSettings })))
const Sellers              = lazy(() => import('./pages/super-admin').then(m => ({ default: m.Sellers })))
const Plans                = lazy(() => import('./pages/super-admin').then(m => ({ default: m.Plans })))
const Subscriptions        = lazy(() => import('./pages/super-admin').then(m => ({ default: m.Subscriptions })))
const SuperAdminReports    = lazy(() => import('./pages/super-admin').then(m => ({ default: m.SuperAdminReports })))
const Discounts            = lazy(() => import('./pages/super-admin').then(m => ({ default: m.Discounts })))

// Seller Portal
const SellerDashboard      = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerDashboard })))
const SellerTenants        = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerTenants })))
const SellerSubscriptions  = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerSubscriptions })))
const SellerRevenue        = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerRevenue })))
const SellerPayments       = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerPayments })))
const SellerCommissions    = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerCommissions })))
const SellerNotifications  = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerNotifications })))
const SellerProfile        = lazy(() => import('./pages/seller').then(m => ({ default: m.SellerProfile })))

// Company Admin
const AdminDashboard    = lazy(() => import('./pages/admin').then(m => ({ default: m.AdminDashboard })))
const Users             = lazy(() => import('./pages/admin').then(m => ({ default: m.Users })))
const InactiveUsers     = lazy(() => import('./pages/admin').then(m => ({ default: m.InactiveUsers })))
const UserForm          = lazy(() => import('./pages/admin').then(m => ({ default: m.UserForm })))
const UserDetails       = lazy(() => import('./pages/admin').then(m => ({ default: m.UserDetails })))
const Partners          = lazy(() => import('./pages/admin').then(m => ({ default: m.Partners })))
const PartnerForm       = lazy(() => import('./pages/admin').then(m => ({ default: m.PartnerForm })))
const Roles             = lazy(() => import('./pages/admin').then(m => ({ default: m.Roles })))
const RoleForm          = lazy(() => import('./pages/admin').then(m => ({ default: m.RoleForm })))
const Departments       = lazy(() => import('./pages/admin').then(m => ({ default: m.Departments })))
const DepartmentForm    = lazy(() => import('./pages/admin').then(m => ({ default: m.DepartmentForm })))
const Designations      = lazy(() => import('./pages/admin').then(m => ({ default: m.Designations })))
const DesignationForm   = lazy(() => import('./pages/admin').then(m => ({ default: m.DesignationForm })))
const AuditLogs         = lazy(() => import('./pages/admin').then(m => ({ default: m.AuditLogs })))
const Profile           = lazy(() => import('./pages/admin').then(m => ({ default: m.Profile })))
const Settings          = lazy(() => import('./pages/admin').then(m => ({ default: m.Settings })))
const CompanySettings   = lazy(() => import('./pages/admin').then(m => ({ default: m.CompanySettings })))
const InterviewSettings = lazy(() => import('./pages/admin').then(m => ({ default: m.InterviewSettings })))
const DeletedHistory    = lazy(() => import('./pages/admin').then(m => ({ default: m.DeletedHistory })))
const IntegrationList   = lazy(() => import('./components/integrations/IntegrationList'))

// Recruitment
const RecruitmentDashboard  = lazy(() => import('./pages/recruitment').then(m => ({ default: m.RecruitmentDashboard })))
const Clients               = lazy(() => import('./pages/recruitment').then(m => ({ default: m.Clients })))
const ClientForm            = lazy(() => import('./pages/recruitment').then(m => ({ default: m.ClientForm })))
const ClientDetails         = lazy(() => import('./pages/recruitment/ClientDetails'))
const Candidates            = lazy(() => import('./pages/recruitment').then(m => ({ default: m.Candidates })))
const CandidateForm         = lazy(() => import('./pages/recruitment').then(m => ({ default: m.CandidateForm })))
const CandidateDetails      = lazy(() => import('./pages/recruitment').then(m => ({ default: m.CandidateDetails })))
const CandidatePublicForm   = lazy(() => import('./pages/recruitment').then(m => ({ default: m.CandidatePublicForm })))
const Jobs                  = lazy(() => import('./pages/recruitment').then(m => ({ default: m.Jobs })))
const JobForm               = lazy(() => import('./pages/recruitment').then(m => ({ default: m.JobForm })))
const JobDetails            = lazy(() => import('./pages/recruitment').then(m => ({ default: m.JobDetails })))
const JobMatchingCandidates = lazy(() => import('./pages/recruitment').then(m => ({ default: m.JobMatchingCandidates })))
const Applications          = lazy(() => import('./pages/recruitment').then(m => ({ default: m.Applications })))
const ApplicationDetail     = lazy(() => import('./pages/recruitment').then(m => ({ default: m.ApplicationDetail })))
const Interviews            = lazy(() => import('./pages/recruitment').then(m => ({ default: m.Interviews })))
const InterviewForm         = lazy(() => import('./pages/recruitment').then(m => ({ default: m.InterviewForm })))
const InterviewDetail       = lazy(() => import('./pages/recruitment').then(m => ({ default: m.InterviewDetail })))
const FeedbackForm          = lazy(() => import('./pages/recruitment').then(m => ({ default: m.FeedbackForm })))

// Phase 4 — Onboarding & Payouts
const Onboards       = lazy(() => import('./pages/phase4').then(m => ({ default: m.Onboards })))
const OnboardForm    = lazy(() => import('./pages/phase4').then(m => ({ default: m.OnboardForm })))
const OnboardDetails = lazy(() => import('./pages/phase4').then(m => ({ default: m.OnboardDetails })))
const PartnerPayouts = lazy(() => import('./pages/phase4').then(m => ({ default: m.PartnerPayouts })))
const RaiseInvoice   = lazy(() => import('./pages/phase4').then(m => ({ default: m.RaiseInvoice })))
const Invoices       = lazy(() => import('./pages/phase4').then(m => ({ default: m.Invoices })))
const Notifications  = lazy(() => import('./pages/phase4').then(m => ({ default: m.Notifications })))

// Settings sub-pages
const TeamsPage               = lazy(() => import('./pages/settings').then(m => ({ default: m.TeamsPage })))
const BranchesPage            = lazy(() => import('./pages/settings').then(m => ({ default: m.BranchesPage })))
const PipelineStagePage       = lazy(() => import('./pages/settings').then(m => ({ default: m.PipelineStagePage })))
const JobCategoriesPage       = lazy(() => import('./pages/settings').then(m => ({ default: m.JobCategoriesPage })))
const InterviewSettingsPage   = lazy(() => import('./pages/settings').then(m => ({ default: m.InterviewSettingsPage })))
const DocumentTemplatesPage   = lazy(() => import('./pages/settings').then(m => ({ default: m.DocumentTemplatesPage })))
const ResumeParsingPage       = lazy(() => import('./pages/settings').then(m => ({ default: m.ResumeParsingPage })))
const CandidateSourcesPage    = lazy(() => import('./pages/settings').then(m => ({ default: m.CandidateSourcesPage })))
const InvoiceSettingsPage     = lazy(() => import('./pages/settings').then(m => ({ default: m.InvoiceSettingsPage })))
const CommissionRulesPage     = lazy(() => import('./pages/settings').then(m => ({ default: m.CommissionRulesPage })))
const LocalizationPage        = lazy(() => import('./pages/settings').then(m => ({ default: m.LocalizationPage })))
const EmailConfigPage         = lazy(() => import('./pages/settings').then(m => ({ default: m.EmailConfigPage })))
const NotificationSettingsPage = lazy(() => import('./pages/settings').then(m => ({ default: m.NotificationSettingsPage })))
const SecuritySettingsPage    = lazy(() => import('./pages/settings').then(m => ({ default: m.SecuritySettingsPage })))
const DataManagementPage      = lazy(() => import('./pages/settings').then(m => ({ default: m.DataManagementPage })))
const CustomFieldsPage        = lazy(() => import('./pages/settings').then(m => ({ default: m.CustomFieldsPage })))
const BrandingPage            = lazy(() => import('./pages/settings').then(m => ({ default: m.BrandingPage })))
const SLAConfigPage           = lazy(() => import('./pages/settings').then(m => ({ default: m.SLAConfigPage })))
const LoginActivityPage       = lazy(() => import('./pages/settings').then(m => ({ default: m.LoginActivityPage })))
const ActiveSessionsPage      = lazy(() => import('./pages/settings').then(m => ({ default: m.ActiveSessionsPage })))

// HRM
const HRMDashboard       = lazy(() => import('./pages/hrm/HRMDashboard'))
const Employees          = lazy(() => import('./pages/hrm/Employees'))
const EmployeeForm       = lazy(() => import('./pages/hrm/EmployeeForm'))
const Attendance         = lazy(() => import('./pages/hrm/Attendance'))
const LeaveManagement    = lazy(() => import('./pages/hrm/LeaveManagement'))
const Payroll            = lazy(() => import('./pages/hrm/Payroll'))
const Performance        = lazy(() => import('./pages/hrm/Performance'))
const Announcements      = lazy(() => import('./pages/hrm/Announcements'))
const HiringDashboard    = lazy(() => import('./pages/hrm/hiring/HiringDashboard'))
const HRJobs             = lazy(() => import('./pages/hrm/hiring/HRJobs'))
const HRCandidates       = lazy(() => import('./pages/hrm/hiring/HRCandidates'))
const HRInterviews       = lazy(() => import('./pages/hrm/hiring/HRInterviews'))
const HROnboarding       = lazy(() => import('./pages/hrm/hiring/HROnboarding'))
const EmployeeSelfService = lazy(() => import('./pages/hrm/EmployeeSelfService'))
const OrgChart           = lazy(() => import('./pages/hrm/OrgChart'))
const EmpResources       = lazy(() => import('./pages/hrm/EmpResources'))
const EmployeeDocUpload  = lazy(() => import('./pages/hrm/EmployeeDocUpload'))
const AssetScanPage      = lazy(() => import('./pages/hrm/AssetScanPage'))
const AssetPublicPage    = lazy(() => import('./pages/hrm/AssetPublicPage'))
const DocumentVault      = lazy(() => import('./pages/hrm/DocumentVault'))
const AssetManagement    = lazy(() => import('./pages/hrm/AssetManagement'))
const ExitManagement     = lazy(() => import('./pages/hrm/ExitManagement'))
const HRMSyncPanel             = lazy(() => import('./pages/hrm/HRMSyncPanel'))
const DocumentCenter           = lazy(() => import('./pages/hrm/document-center/DocumentCenter'))

// Reports, Analytics, Imports, Exports, Targets, Audit
const ReportsPage        = lazy(() => import('./pages/reports/ReportsPage'))
const ReportGenerator    = lazy(() => import('./pages/reports/ReportGenerator'))
const ReportViewer       = lazy(() => import('./pages/reports/ReportViewer'))
const SavedReports       = lazy(() => import('./pages/reports/SavedReports'))
const AnalyticsDashboard = lazy(() => import('./pages/analytics/AnalyticsDashboard'))
const ImportsPage        = lazy(() => import('./pages/imports/ImportsPage'))
const ExportsPage        = lazy(() => import('./pages/exports/ExportsPage'))
const TargetsPage        = lazy(() => import('./pages/targets/TargetsPage'))
const Leaderboard        = lazy(() => import('./pages/targets/Leaderboard'))
const AuditLogsPage      = lazy(() => import('./pages/audit/AuditLogsPage'))
const Tasks              = lazy(() => import('./pages/tasks').then(m => ({ default: m.Tasks })))

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
  // HRM-only roles (manager, employee) land on the HRM dashboard
  if (p.has('hrm:dashboard:view'))                           return '/hrm'
  if (p.has('hrm:attendance:self'))                          return '/hrm/attendance'
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
const PermissionRoute = ({ children, permission, allowedRoles, showUnauthorized = false }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const isSuperAdmin   = useSelector(selectIsSuperAdmin)
  const user           = useSelector(selectUser)
  const userRole       = useSelector(selectUserRole)
  const userType       = useSelector(selectUserType)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isSuperAdmin) return <Navigate to="/super-admin" replace />

  // Owner skips all other permission checks
  if (user?.isOwner) return children

  // Partners have their own route block — skip checks inside partner routes
  if (userType === 'partner') return children

  // Role-based gate (used for My Portal and similar routes)
  if (allowedRoles) {
    if (!allowedRoles.includes(userRole)) {
      if (showUnauthorized) return <Unauthorized />
      return <Navigate to={getDefaultRoute(userRole, user?.permissions, userType)} replace />
    }
    return children
  }

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
 *
 * Auto-reload behaviour: on the FIRST error in a session (tracked via
 * sessionStorage) the boundary silently reloads the page, which resolves
 * transient first-login crashes (race conditions, lazy-chunk loading failures).
 * If the page crashes again after the reload the error UI is shown instead
 * of reloading forever.  The flag is cleared whenever the app renders
 * successfully so future sessions always get the one free auto-retry.
 */
const _RELOAD_FLAG = '_errBoundaryReloaded'

class ErrorBoundary extends React.Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('App render error:', error, info)
    // Auto-reload once to recover from transient first-load errors
    // (first-time login race conditions, lazy chunk failures, etc.)
    if (!sessionStorage.getItem(_RELOAD_FLAG)) {
      sessionStorage.setItem(_RELOAD_FLAG, '1')
      window.location.reload()
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
    // Clear the reload flag whenever the app is rendering without errors
    // so the next session always gets its one free auto-retry.
    if (!this.state.hasError) {
      sessionStorage.removeItem(_RELOAD_FLAG)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-50">
          <div className="text-center p-8">
            <h1 className="text-4xl font-bold text-surface-300 mb-4">Something went wrong</h1>
            <p className="text-surface-500 mb-6">An unexpected error occurred. Please try navigating to another page.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="inline-block px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                Try Again
              </button>
              <a
                href="/dashboard"
                className="inline-block px-6 py-3 border border-primary-500 text-primary-500 rounded-lg hover:bg-primary-50 transition-colors"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Wraps ErrorBoundary so it resets automatically when the URL changes
const LocationAwareErrorBoundary = ({ children }) => {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
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
 * Uses the SAME services, API calls, and Custom-option logic as Add User / Edit User —
 * one source of truth for departments, designations, and users lists.
 *
 * Flow:
 * 1. Wait until ForcePasswordModal is dismissed (!forcePasswordChange guard).
 * 2. Load reference data via departmentService / designationService / userService
 *    with Promise.allSettled so a 403 on /users/ (non-admin) never blocks depts/desigs.
 * 3. Compare profile fields → show ONLY the missing ones.
 * 4. On save → create custom dept/desig via API when selected, then PUT /users/me.
 */

// Normalise a free-text name identically to UserForm (title-case, collapse spaces)
const _normName = (v) =>
  v.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// checkKeys: ALL must be falsy/empty in the DB record for the field to count as missing.
const REQUIRED_PROFILE_FIELDS = [
  { key: 'department_id',  checkKeys: ['department_id', 'department'],   label: 'Department',   type: 'select' },
  { key: 'designation_id', checkKeys: ['designation_id', 'designation'], label: 'Designation',  type: 'select' },
  { key: 'reporting_to',   checkKeys: ['reporting_to'],                  label: 'Reports To',   type: 'select' },
  { key: 'joining_date',   checkKeys: ['joining_date'],                  label: 'Joining Date', type: 'date'   },
]

const ProfileCompleteModal = () => {
  const dispatch         = useDispatch()
  const user             = useSelector(selectUser)
  const profileCompleted = useSelector(selectProfileCompleted)

  const [missingFields, setMissingFields] = useState(null) // null=loading, [...]= fields
  const [saving, setSaving]               = useState(false)

  // Reference data — loaded from the SAME services as Add User / Edit User
  const [departments,  setDepartments]  = useState([])
  const [designations, setDesignations] = useState([])
  const [coworkers,    setCoworkers]    = useState([])

  // Custom-option state — mirrors UserForm's deptCustom / desigCustom
  const [deptCustom,   setDeptCustom]   = useState('')
  const [desigCustom,  setDesigCustom]  = useState('')
  const [customErrors, setCustomErrors] = useState({})

  // Must NOT activate while ForcePasswordModal is open (sequential flow required)
  const forcePasswordChange = useSelector(selectForcePasswordChange)
  const shouldCheck = !!user?.id && !user?.isSuperAdmin && !user?.isSeller
    && profileCompleted === false
    && !forcePasswordChange

  const { register, handleSubmit, watch, formState: { errors } } = useForm({ mode: 'onBlur' })
  const watchDeptId  = watch('department_id',  '')
  const watchDesigId = watch('designation_id', '')

  // Fetch data and determine missing fields once shouldCheck becomes true
  useEffect(() => {
    if (!shouldCheck || !user?.id) return

    let cancelled = false
    ;(async () => {
      try {
        // Promise.allSettled — a 403 on /users/ (non-admin roles) won't block depts/desigs
        const [profileRes, deptsRes, desigsRes, usersRes] = await Promise.allSettled([
          api.get('/users/me'),
          departmentService.getDepartments(),
          designationService.getDesignations(),
          userService.getUsers({ page_size: 200 }),
        ])

        if (cancelled) return

        // Services return response.data; the list is at .data (same as UserForm)
        if (deptsRes.status === 'fulfilled') {
          setDepartments(Array.isArray(deptsRes.value?.data) ? deptsRes.value.data : [])
        }
        if (desigsRes.status === 'fulfilled') {
          setDesignations(Array.isArray(desigsRes.value?.data) ? desigsRes.value.data : [])
        }
        if (usersRes.status === 'fulfilled') {
          const all = Array.isArray(usersRes.value?.data) ? usersRes.value.data : []
          setCoworkers(all.filter(u => u.id !== user.id))
        }

        // api.get('/users/me') returns an axios response; the user object is at .data.data
        const profile = profileRes.status === 'fulfilled'
          ? (profileRes.value?.data?.data || profileRes.value?.data || {})
          : {}

        const missing = REQUIRED_PROFILE_FIELDS.filter(f =>
          f.checkKeys.every(k => !profile[k] || String(profile[k]).trim() === '')
        )

        if (missing.length === 0) {
          await api.put('/users/me', { profile_completed: true })
          dispatch(setProfileCompleted())
        } else {
          setMissingFields(missing)
        }
      } catch {
        if (!cancelled) setMissingFields(REQUIRED_PROFILE_FIELDS)
      }
    })()

    return () => { cancelled = true }
  }, [shouldCheck, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!shouldCheck || missingFields === null || missingFields.length === 0) return null

  const onSubmit = async (data) => {
    // Validate custom text inputs before touching any API
    const newCE = {}
    if (data.department_id  === 'custom' && !deptCustom.trim())
      newCE.deptCustom  = 'Please enter a department name'
    if (data.designation_id === 'custom' && !desigCustom.trim())
      newCE.desigCustom = 'Please enter a designation name'
    if (Object.keys(newCE).length) { setCustomErrors(newCE); return }
    setCustomErrors({})
    setSaving(true)

    try {
      const payload = { profile_completed: true }

      // ── Department (identical logic to UserForm's on-the-fly creation) ─────
      let deptId   = data.department_id
      let deptName = departments.find(d => d.id === deptId)?.name || ''
      if (deptId === 'custom' && deptCustom.trim()) {
        const norm = _normName(deptCustom)
        try {
          const res     = await departmentService.createDepartment({ name: norm })
          const created = res?.data
          if (created?.id) {
            deptId   = created.id
            deptName = created.name || norm
            setDepartments(prev => [...prev, created])
          }
        } catch (err) {
          const msg = err?.response?.data?.detail || err?.response?.data?.message || ''
          if (typeof msg === 'string' && msg.toLowerCase().includes('already exists')) {
            const listRes = await departmentService.getDepartments()
            const existing = (listRes?.data || []).find(
              d => d.name?.toLowerCase().trim() === norm.toLowerCase().trim()
            )
            if (existing) { deptId = existing.id; deptName = existing.name || norm }
            else throw err
          } else throw err
        }
      }
      if (deptId && deptId !== 'custom') {
        payload.department_id = deptId
        payload.department    = deptName
      }

      // ── Designation (identical logic to UserForm's on-the-fly creation) ────
      let desigId   = data.designation_id
      let desigName = designations.find(d => d.id === desigId)?.name || ''
      if (desigId === 'custom' && desigCustom.trim()) {
        const norm = _normName(desigCustom)
        try {
          const res     = await designationService.createDesignation({
            name: norm, code: null,
            department_id: deptId && deptId !== 'custom' ? deptId : undefined,
          })
          const created = res?.data
          if (created?.id) {
            desigId   = created.id
            desigName = created.name || norm
            setDesignations(prev => [...prev, created])
          }
        } catch (err) {
          const msg = err?.response?.data?.detail || ''
          if (typeof msg === 'string' && msg.toLowerCase().includes('already exists')) {
            const listRes = await designationService.getDesignations()
            const existing = (listRes?.data || []).find(
              d => d.name?.toLowerCase().trim() === norm.toLowerCase().trim()
            )
            if (existing) { desigId = existing.id; desigName = existing.name || norm }
            else throw err
          } else throw err
        }
      }
      if (desigId && desigId !== 'custom') {
        payload.designation_id = desigId
        payload.designation    = desigName
      }

      // ── Reports To / Joining Date ────────────────────────────────────────────
      if (data.reporting_to) payload.reporting_to = data.reporting_to
      if (data.joining_date) {
        payload.joining_date = data.joining_date.includes('T')
          ? data.joining_date
          : data.joining_date + 'T00:00:00'
      }

      await api.put('/users/me', payload)
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

          {/* Only render fields that are actually missing from the DB */}
          {missingFields.map(field => (
            <div key={field.key}>
              <label className="input-label">
                {field.label} <span className="text-danger-500">*</span>
              </label>

              {field.key === 'department_id' && (
                <>
                  <select
                    className={`input ${errors.department_id ? 'border-danger-500' : ''}`}
                    defaultValue=""
                    {...register('department_id', { required: 'Department is required' })}
                  >
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    <option value="custom">Custom…</option>
                  </select>
                  {errors.department_id && (
                    <p className="input-error-text mt-1">{errors.department_id.message}</p>
                  )}
                  {watchDeptId === 'custom' && (
                    <input
                      type="text"
                      className={`mt-2 input ${customErrors.deptCustom ? 'border-danger-500' : ''}`}
                      placeholder="Enter new department name"
                      value={deptCustom}
                      onChange={e => {
                        setDeptCustom(e.target.value)
                        setCustomErrors(p => ({ ...p, deptCustom: '' }))
                      }}
                    />
                  )}
                  {customErrors.deptCustom && (
                    <p className="input-error-text mt-1">{customErrors.deptCustom}</p>
                  )}
                </>
              )}

              {field.key === 'designation_id' && (
                <>
                  <select
                    className={`input ${errors.designation_id ? 'border-danger-500' : ''}`}
                    defaultValue=""
                    {...register('designation_id', { required: 'Designation is required' })}
                  >
                    <option value="">Select Designation</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    <option value="custom">Custom…</option>
                  </select>
                  {errors.designation_id && (
                    <p className="input-error-text mt-1">{errors.designation_id.message}</p>
                  )}
                  {watchDesigId === 'custom' && (
                    <input
                      type="text"
                      className={`mt-2 input ${customErrors.desigCustom ? 'border-danger-500' : ''}`}
                      placeholder="Enter new designation name"
                      value={desigCustom}
                      onChange={e => {
                        setDesigCustom(e.target.value)
                        setCustomErrors(p => ({ ...p, desigCustom: '' }))
                      }}
                    />
                  )}
                  {customErrors.desigCustom && (
                    <p className="input-error-text mt-1">{customErrors.desigCustom}</p>
                  )}
                </>
              )}

              {field.key === 'reporting_to' && (
                <>
                  <select
                    className={`input ${errors.reporting_to ? 'border-danger-500' : ''}`}
                    defaultValue=""
                    {...register('reporting_to', { required: 'Reports To is required' })}
                  >
                    <option value="">Select Manager</option>
                    {coworkers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                  {errors.reporting_to && (
                    <p className="input-error-text mt-1">{errors.reporting_to.message}</p>
                  )}
                </>
              )}

              {field.key === 'joining_date' && (
                <>
                  <input
                    type="date"
                    className={`input ${errors.joining_date ? 'border-danger-500' : ''}`}
                    {...register('joining_date', { required: 'Joining Date is required' })}
                  />
                  {errors.joining_date && (
                    <p className="input-error-text mt-1">{errors.joining_date.message}</p>
                  )}
                </>
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

// ─── Route-level Suspense fallback ───────────────────────────────────────────
const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface-50">
    <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

// ─── Session Manager ──────────────────────────────────────────────────────────
/**
 * Listens for session lifecycle CustomEvents fired by useAutoLogout and api.js,
 * then shows the appropriate premium modal:
 *
 *  session:warning          → SessionWarningModal (2-min countdown)
 *  session:warning:dismiss  → hide warning without logging out
 *  session:expired          → SessionExpiryModal (idle / remote / token)
 *
 * "Stay Logged In":  dispatch refreshToken() → emit session:extend so the idle
 *                    timer in useAutoLogout resets without a page reload.
 * "Login Again":     navigate to /login (tokens already wiped by api.js / logoutUser).
 * "Logout Now":      dispatch logoutUser() then navigate.
 */
const SessionManager = () => {
  const dispatch        = useDispatch()
  const navigate        = useNavigate()
  const isAuthenticated = useSelector(selectIsAuthenticated)

  const [warnOpen,      setWarnOpen]      = useState(false)
  const [expiryOpen,    setExpiryOpen]    = useState(false)
  const [expiryReason,  setExpiryReason]  = useState('idle')

  // Login-request modal (Device A — someone on Device B wants access)
  const [loginReqOpen, setLoginReqOpen]   = useState(false)
  const [loginReqData, setLoginReqData]   = useState(null)
  // Track seen request IDs so a repeated heartbeat poll doesn't re-show the modal
  const seenRequestIds = useRef(new Set())

  // First-reason-wins: once the expiry modal opens, don't let a subsequent
  // session:expired (e.g. from api.js retrying after idle-logout) override
  // the original reason (idle → would incorrectly show "remote" message).
  const expiryReasonLockedRef = useRef(false)

  // Suppresses all session:expired events while the user is navigating back to
  // the login page after clicking "Login Again". Cleared only when a fresh
  // authentication succeeds (isAuthenticated transitions false → true).
  // This prevents the "wrong second popup" bug where a stale heartbeat or WS
  // event fires after idle-logout + re-login and shows "logged in on another
  // device" even though the user just freshly authenticated themselves.
  const suppressExpiryRef = useRef(false)
  const prevAuthRef       = useRef(isAuthenticated)

  // When the user successfully re-authenticates, reset all session state so
  // the next expiry event is handled fresh.
  useEffect(() => {
    if (!prevAuthRef.current && isAuthenticated) {
      suppressExpiryRef.current    = false
      expiryReasonLockedRef.current = false
      seenRequestIds.current.clear()
      setExpiryOpen(false)
      setWarnOpen(false)
    }
    prevAuthRef.current = isAuthenticated
  }, [isAuthenticated])

  const handleSessionWarning = useCallback(() => setWarnOpen(true),  [])
  const handleWarnDismiss    = useCallback(() => setWarnOpen(false), [])
  const handleSessionExpired = useCallback((e) => {
    // While the user is in the process of re-logging-in after an expiry, any
    // stale events (old heartbeat 401s, leftover WS messages, api.js retries)
    // must be suppressed — otherwise they show a second, incorrect popup.
    if (suppressExpiryRef.current) return

    setWarnOpen(false)
    setLoginReqOpen(false)
    if (!expiryReasonLockedRef.current) {
      expiryReasonLockedRef.current = true
      setExpiryReason(e?.detail?.reason || 'idle')
    }
    setExpiryOpen(true)
  }, [])

  const handleLoginRequest = useCallback((e) => {
    const data = e?.detail || {}
    if (!data.requestId) return
    // Deduplicate: don't re-show if we've already seen this request_id
    if (seenRequestIds.current.has(data.requestId)) return
    seenRequestIds.current.add(data.requestId)
    // Clean up old IDs to prevent unbounded growth
    if (seenRequestIds.current.size > 20) {
      const first = seenRequestIds.current.values().next().value
      seenRequestIds.current.delete(first)
    }
    setLoginReqData(data)
    setLoginReqOpen(true)
  }, [])

  useEffect(() => {
    window.addEventListener('session:warning',         handleSessionWarning)
    window.addEventListener('session:warning:dismiss', handleWarnDismiss)
    window.addEventListener('session:expired',         handleSessionExpired)
    window.addEventListener('session:login_request',   handleLoginRequest)
    return () => {
      window.removeEventListener('session:warning',         handleSessionWarning)
      window.removeEventListener('session:warning:dismiss', handleWarnDismiss)
      window.removeEventListener('session:expired',         handleSessionExpired)
      window.removeEventListener('session:login_request',   handleLoginRequest)
    }
  }, [handleSessionWarning, handleWarnDismiss, handleSessionExpired, handleLoginRequest])

  const handleStayLoggedIn = useCallback(async () => {
    try {
      const result = await dispatch(refreshToken())
      if (refreshToken.fulfilled.match(result)) {
        window.dispatchEvent(new CustomEvent('session:extend'))
        setWarnOpen(false)
        toast.success('Session extended successfully.', { duration: 2500 })
      } else {
        // Refresh failed — treat as expired
        setWarnOpen(false)
        setExpiryReason('token')
        setExpiryOpen(true)
      }
    } catch {
      setWarnOpen(false)
      setExpiryReason('token')
      setExpiryOpen(true)
    }
  }, [dispatch])

  const handleLogoutNow = useCallback(async () => {
    setWarnOpen(false)
    setExpiryOpen(false)
    await dispatch(logoutUser())
    navigate('/login', { replace: true })
  }, [dispatch, navigate])

  const handleLoginAgain = useCallback(() => {
    setExpiryOpen(false)
    // Engage the suppression gate so stale 401s / WS events that fire after
    // the user navigates back to /login don't open a second expiry modal.
    // The gate is cleared automatically when a successful new login sets
    // isAuthenticated back to true (see the useEffect above).
    suppressExpiryRef.current = true
    // Intentionally do NOT reset expiryReasonLockedRef here — it stays locked
    // until the new login clears it, preventing any event from reopening the
    // modal with a different (wrong) reason during the re-login transition.
    navigate('/login', { replace: true })
  }, [navigate])

  const handleExpiryCancel = useCallback(() => {
    setExpiryOpen(false)
    expiryReasonLockedRef.current = false
    // Session is expired — next API call will get 401 → api.js will re-fire this event
  }, [])

  return (
    <>
      <SessionWarningModal
        isOpen={warnOpen}
        onStayLoggedIn={handleStayLoggedIn}
        onLogout={handleLogoutNow}
      />
      <SessionExpiryModal
        isOpen={expiryOpen}
        reason={expiryReason}
        onLoginAgain={handleLoginAgain}
        onCancel={handleExpiryCancel}
      />
      <LoginRequestModal
        isOpen={loginReqOpen}
        requestData={loginReqData}
        onClose={() => setLoginReqOpen(false)}
      />
    </>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  useAutoLogout()          // idle timer + screen-lock detection + multi-tab sync
  useSessionWebSocket()    // real-time session events via WebSocket + heartbeat
  useFavicon()             // imperatively enforce favicon on every page/route

  return (
    <LocationAwareErrorBoundary>
    <AuthInitializer>
    <SessionManager />
    <ForcePasswordModal />
    <ProfileCompleteModal />
    <Suspense fallback={<RouteLoader />}>
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

      {/* Employee secure document upload — public, no auth */}
      <Route path="/document-upload/:token" element={<EmployeeDocUpload />} />

      {/* Public asset QR scan page — no auth required */}
      <Route path="/asset/public/:publicToken" element={<AssetPublicPage />} />

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
        <Route path="/settings/active-sessions"      element={<PermissionRoute permission="crm_settings:view"><ActiveSessionsPage /></PermissionRoute>} />
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
          element={<PermissionRoute permission="clients:view"><ClientDetails /></PermissionRoute>} />
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
          element={<PermissionRoute permission="reports:view"><ReportGenerator /></PermissionRoute>} />
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
          element={<PermissionRoute permission="tasks:view"><Tasks /></PermissionRoute>} />

        {/* ── Audit ── */}
        <Route path="/audit-logs"
          element={<PermissionRoute permission="audit:view"><AuditLogs /></PermissionRoute>} />
        <Route path="/audit"
          element={<PermissionRoute permission="audit:view"><AuditLogsPage /></PermissionRoute>} />
        <Route path="/audit/sessions"
          element={<PermissionRoute permission="audit:view"><AuditLogsPage /></PermissionRoute>} />
        <Route path="/audit/alerts"
          element={<PermissionRoute permission="audit:view"><AuditLogsPage /></PermissionRoute>} />

        {/* ── Trash / Deleted History ── */}
        <Route path="/trash"
          element={<PermissionRoute permission="audit:view"><DeletedHistory /></PermissionRoute>} />

        {/* ── Integrations ── */}
        <Route path="/integrations"
          element={<PermissionRoute permission="crm_settings:view"><IntegrationList /></PermissionRoute>} />

        {/* ── Always-accessible utility pages ── */}
        <Route path="/notifications"      element={<Notifications />} />
        <Route path="/my-profile"         element={<Profile />} />
        <Route path="/profile"            element={<Profile />} />
        <Route path="/my-sessions"        element={<ActiveSessionsPage />} />

        {/* ── HRM Module ── */}
        <Route path="/hrm"                element={<PermissionRoute permission="hrm:dashboard:view"><HRMDashboard /></PermissionRoute>} />
        <Route path="/hrm/employees"      element={<PermissionRoute permission="hrm:employees:view"><Employees /></PermissionRoute>} />
        <Route path="/hrm/employees/new"  element={<PermissionRoute permission="hrm:employees:manage"><EmployeeForm /></PermissionRoute>} />
        <Route path="/hrm/employees/:id"  element={<PermissionRoute permission="hrm:employees:view"><EmployeeForm /></PermissionRoute>} />
        <Route path="/hrm/employees/:id/edit" element={<PermissionRoute permission="hrm:employees:manage"><EmployeeForm /></PermissionRoute>} />
        <Route path="/hrm/attendance"     element={<PermissionRoute permission="hrm:attendance:self"><Attendance /></PermissionRoute>} />
        <Route path="/hrm/leaves"         element={<PermissionRoute permission="hrm:leave:apply"><LeaveManagement /></PermissionRoute>} />
        <Route path="/hrm/payroll"        element={<PermissionRoute permission="hrm:payroll:view_self"><Payroll /></PermissionRoute>} />
        <Route path="/hrm/performance"    element={<PermissionRoute permission="hrm:performance:self"><Performance /></PermissionRoute>} />
        <Route path="/hrm/announcements"  element={<PermissionRoute permission="hrm:announcements:view"><Announcements /></PermissionRoute>} />
        <Route path="/hrm/hiring"         element={<PermissionRoute permission="hrm:hiring:view"><HiringDashboard /></PermissionRoute>} />
        <Route path="/hrm/hiring/jobs"         element={<PermissionRoute permission="hrm:hiring:view"><HRJobs /></PermissionRoute>} />
        <Route path="/hrm/hiring/candidates"   element={<PermissionRoute permission="hrm:hiring:view"><HRCandidates /></PermissionRoute>} />
        <Route path="/hrm/hiring/interviews"   element={<PermissionRoute permission="hrm:hiring:view"><HRInterviews /></PermissionRoute>} />
        <Route path="/hrm/hiring/onboarding"   element={<PermissionRoute permission="hrm:hiring:view"><HROnboarding /></PermissionRoute>} />
        <Route path="/hrm/ess"                 element={<PermissionRoute allowedRoles={MY_PORTAL_ALLOWED_ROLES}><EmployeeSelfService /></PermissionRoute>} />
        {/* Emp Resources — tabbed page. Old URLs redirect to the right tab */}
        <Route path="/hrm/emp-resources"
          element={<PermissionRoute permission="hrm:employees:view" showUnauthorized><EmpResources /></PermissionRoute>} />
        <Route path="/hrm/documents"
          element={<Navigate to="/hrm/emp-resources?tab=documents" replace />} />
        <Route path="/hrm/assets"
          element={<Navigate to="/hrm/emp-resources?tab=assets" replace />} />
        <Route path="/hrm/exit"
          element={<Navigate to="/hrm/emp-resources?tab=exit" replace />} />
        <Route path="/hrm/assets/scan/:assetId" element={<AssetScanPage />} />
        <Route path="/hrm/sync"                element={<PermissionRoute permission="hrm:employees:manage"><HRMSyncPanel /></PermissionRoute>} />

        {/* ── Document Center ── */}
        <Route path="/hrm/doc-center/*"
          element={<PermissionRoute permission="docs:view" showUnauthorized><DocumentCenter /></PermissionRoute>} />
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
    </Suspense>
    </AuthInitializer>
    </LocationAwareErrorBoundary>
  )
}

export default App
