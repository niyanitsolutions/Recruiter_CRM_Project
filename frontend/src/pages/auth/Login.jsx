import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Mail, Lock, ArrowRight, AlertCircle, Calendar, XCircle, RefreshCw, CheckCircle, UserX, Building2 } from 'lucide-react'
import { login, loginWithTenant, forceLogoutAndLogin, clearError, clearTenantSelection, selectAuth, selectSubscriptionExpired, selectTenantSelection } from '../../store/authSlice'
import { Button, Input } from '../../components/common'
import { formatDateTime } from '../../utils/format'
import authService from '../../services/authService'
import { getSavedEmail, setSavedEmail, removeSavedEmail, getSavedPassword, setSavedPassword, removeSavedPassword, getRememberMe } from '../../utils/token'

const Login = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { isLoading } = useSelector(selectAuth)
  const subscriptionExpired = useSelector(selectSubscriptionExpired)
  const tenantSelection = useSelector(selectTenantSelection)

  // "Account Not Found" full-screen state — stores the error message
  const [loginFailed, setLoginFailed] = useState(null)

  // Email not verified state
  const [emailNotVerified, setEmailNotVerified] = useState(null)  // { email, message }
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  // Tenant selection error
  const [tenantSelectError, setTenantSelectError] = useState('')

  // Inline error for sessionStorage-sourced messages (e.g. api.js interceptor)
  const [inlineError, setInlineError] = useState('')

  // Active session conflict modal
  const [activeSessionModal, setActiveSessionModal] = useState(null)  // { identifier, password }
  const [forceLoginLoading, setForceLoginLoading] = useState(false)

  // Remember Me — pre-populate from saved preference
  const savedEmail = getSavedEmail()
  const savedPassword = getSavedPassword()
  const [rememberMe, setRememberMeState] = useState(!!savedEmail || getRememberMe())

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: { identifier: savedEmail, password: savedPassword },
  })

  // Show sessionStorage errors (e.g. subscription expired, set by api.js interceptor)
  useEffect(() => {
    const stored = sessionStorage.getItem('login_error')
    if (stored) {
      sessionStorage.removeItem('login_error')
      setInlineError(stored)
    }
  }, [])

  const handleTenantSelect = async (company_id) => {
    if (!tenantSelection) return
    setTenantSelectError('')
    const result = await dispatch(loginWithTenant({
      identifier: tenantSelection.identifier,
      password:   tenantSelection.password,
      company_id,
      remember_me: tenantSelection.remember_me,
    }))
    if (loginWithTenant.fulfilled.match(result)) {
      if (tenantSelection.remember_me) {
        setSavedEmail(tenantSelection.identifier)
        setSavedPassword(tenantSelection.password)
      } else {
        removeSavedEmail()
        removeSavedPassword()
      }
      // must_change_password → ForcePasswordModal in App.jsx handles it as a blocking modal
      toast.success('Login successful!')
    } else if (loginWithTenant.rejected.match(result)) {
      const payload = result.payload
      if (payload && typeof payload === 'object' && payload.type === 'SUBSCRIPTION_EXPIRED') {
        // subscriptionExpired state already set in Redux — no extra work needed
      } else {
        setTenantSelectError(typeof payload === 'string' ? payload : 'Login failed. Please try again.')
      }
    }
  }

  const onSubmit = async (data) => {
    setLoginFailed(null)
    setEmailNotVerified(null)
    setResendSent(false)
    setInlineError('')
    const result = await dispatch(login({ ...data, remember_me: rememberMe }))

    if (login.fulfilled.match(result)) {
      // Tenant selection required — Redux state is set, screen switches automatically
      if (result.payload.tenant_selection_required) return

      // Save or clear the identifier and password for next visit
      if (rememberMe) {
        setSavedEmail(data.identifier)
        setSavedPassword(data.password)
      } else {
        removeSavedEmail()
        removeSavedPassword()
      }

      // must_change_password → ForcePasswordModal in App.jsx handles it as a blocking modal
      toast.success('Login successful!')
    } else if (login.rejected.match(result)) {
      const payload = result.payload

      if (payload && typeof payload === 'object' && payload.type === 'ACTIVE_SESSION') {
        // Account active on another device — show takeover modal
        setActiveSessionModal({ identifier: data.identifier, password: data.password })
        dispatch(clearError())

      } else if (payload && typeof payload === 'object' && payload.email_not_verified) {
        // Email-not-verified has its own dedicated screen
        setEmailNotVerified({ email: payload.email, message: payload.message })

      } else if (payload && typeof payload === 'object' && payload.type === 'SUBSCRIPTION_EXPIRED') {
        // Redux already set subscriptionExpired — the if(subscriptionExpired) block below handles it
        // Nothing extra needed here

      } else {
        // User not found, invalid credentials, company not found, etc.
        // Show the persistent "Account Not Found" screen — NOT a toast or modal
        const msg = typeof payload === 'string' ? payload : 'Login failed. Please try again.'
        setLoginFailed(msg)
        dispatch(clearError())  // clear Redux error so it doesn't re-trigger anything
      }
    }
  }

  const handleResendVerification = async () => {
    if (!emailNotVerified?.email) return
    setResendLoading(true)
    try {
      await authService.resendVerification(emailNotVerified.email)
      setResendSent(true)
      toast.success('Verification email sent! Check your inbox.')
    } catch {
      setResendSent(true)  // always show success (privacy)
    } finally {
      setResendLoading(false)
    }
  }

  const handleForceLogin = async () => {
    if (!activeSessionModal) return
    setForceLoginLoading(true)
    const { identifier, password } = activeSessionModal
    try {
      await dispatch(forceLogoutAndLogin({ identifier, password, remember_me: rememberMe })).unwrap()
      setActiveSessionModal(null)
      if (rememberMe) {
        setSavedEmail(identifier)
        setSavedPassword(password)
      } else {
        removeSavedEmail()
        removeSavedPassword()
      }
      toast.success('Login successful!')
    } catch (err) {
      setActiveSessionModal(null)
      const msg = typeof err === 'string' ? err : 'Login failed. Please try again.'
      setLoginFailed(msg)
    } finally {
      setForceLoginLoading(false)
    }
  }

  // ── Tenant / company selection screen ────────────────────────────────────
  if (tenantSelection) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 mb-4">
            <Building2 className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Select Company</h2>
          <p className="text-surface-500 mt-2 text-sm">
            Your credentials match multiple companies. Choose one to continue.
          </p>
        </div>

        {tenantSelectError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {tenantSelectError}
          </div>
        )}

        <div className="space-y-2">
          {tenantSelection.tenants.map((t) => (
            <button
              key={t.company_id}
              onClick={() => handleTenantSelect(t.company_id)}
              disabled={isLoading}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-surface-200 bg-white hover:bg-surface-50 hover:border-indigo-300 transition-colors text-left disabled:opacity-60"
            >
              <div>
                <p className="font-semibold text-surface-900 text-sm">{t.company_name}</p>
                <p className="text-xs text-surface-500 capitalize">{t.role}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-surface-400 flex-shrink-0" />
            </button>
          ))}
        </div>

        <button
          onClick={() => dispatch(clearTenantSelection())}
          className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    )
  }

  // ── Account Not Found screen ──────────────────────────────────────────────
  if (loginFailed) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <UserX className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Account Not Found</h2>
          <p className="text-surface-500 mt-2 text-sm">
            We couldn't find an account matching your details.
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
          <p className="font-semibold mb-1">{loginFailed}</p>
          <p className="text-red-700">
            Double-check your email / mobile number and password, or create a new account to get started.
          </p>
        </div>

        <Link to="/register">
          <button className="w-full py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl transition-colors">
            Create New Account
          </button>
        </Link>

        <button
          onClick={() => setLoginFailed(null)}
          className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    )
  }

  // ── Email not verified screen ─────────────────────────────────────────────
  if (emailNotVerified) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Mail className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Verify Your Email</h2>
          <p className="text-surface-500 mt-2 text-sm">
            Your account is not yet verified. Check your inbox for the verification link.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {emailNotVerified.message}
          {emailNotVerified.email && (
            <p className="mt-1 text-xs text-amber-700">Email: <strong>{emailNotVerified.email}</strong></p>
          )}
        </div>

        {!resendSent ? (
          <Button
            onClick={handleResendVerification}
            isLoading={resendLoading}
            className="w-full"
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Resend Verification Email
          </Button>
        ) : (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-700 text-center">
            <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-600" />
            Verification email sent! Check your inbox and click the link.
          </div>
        )}

        <button
          onClick={() => setEmailNotVerified(null)}
          className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    )
  }

  // ── Subscription expired screen ───────────────────────────────────────────
  if (subscriptionExpired) {
    const expiryLabel = subscriptionExpired.planExpiry
      ? formatDateTime(subscriptionExpired.planExpiry)
      : null
    const isSeller = subscriptionExpired.userType === 'seller'

    // Seller subscription expired — they must contact super admin to renew
    if (isSeller) {
      return (
        <div className="animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Calendar className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Subscription Expired</h2>
            {expiryLabel && (
              <p className="text-sm text-surface-500 mt-1">
                Expired on <span className="font-medium text-surface-700">{expiryLabel}</span>
              </p>
            )}
          </div>

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm text-amber-800">{subscriptionExpired.message}</p>
            <p className="text-sm text-amber-700 mt-2">
              Please contact the platform administrator to renew your seller subscription.
            </p>
          </div>

          <button
            onClick={() => dispatch(clearError())}
            className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium border border-surface-200 rounded-xl transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      )
    }

    if (subscriptionExpired.isOwner) {
      return (
        <div className="animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Calendar className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Subscription Expired</h2>
            {expiryLabel && (
              <p className="text-sm text-surface-500 mt-1">
                Expired on <span className="font-medium text-surface-700">{expiryLabel}</span>
              </p>
            )}
          </div>

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm text-amber-800">{subscriptionExpired.message}</p>
          </div>

          <button
            onClick={() => navigate('/upgrade-plan', { state: subscriptionExpired })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Upgrade Plan
          </button>

          <button
            onClick={() => dispatch(clearError())}
            className="w-full mt-3 px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      )
    }

    // Non-owner: show blocked message
    return (
      <div className="animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Access Unavailable</h2>
        </div>

        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-red-800">Your company subscription has expired.</p>
          {expiryLabel && (
            <p className="text-xs text-red-700">
              Expired on: <span className="font-medium">{expiryLabel}</span>
            </p>
          )}
          <p className="text-sm text-red-700 mt-2">
            Please contact your company administrator to renew the subscription.
          </p>
        </div>

        <button
          onClick={() => dispatch(clearError())}
          className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium border border-surface-200 rounded-xl transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    )
  }

  // ── Active session conflict modal ────────────────────────────────────────
  if (activeSessionModal) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-auto">
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-3">
                <AlertCircle className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Account Already Active</h3>
              <p className="text-sm text-gray-600 mt-2">
                This account is currently active on another device. Would you like to logout from that device and login here instead?
              </p>
            </div>
            <div className="flex flex-col gap-3 mt-5">
              <button
                onClick={handleForceLogin}
                disabled={forceLoginLoading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                {forceLoginLoading ? 'Logging in…' : 'Logout Other Device and Continue'}
              </button>
              <button
                onClick={() => setActiveSessionModal(null)}
                disabled={forceLoginLoading}
                className="w-full py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Login form (default) ──────────────────────────────────────────────────
  return (
    <div style={{ animation: 'cardEntrance 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>

      {/* Header */}
      <div className="mb-7">
        <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '6px' }}>
          Welcome back
        </h2>
        <p style={{ color: '#64748b', fontSize: '13px' }}>
          Sign in to your recruitment dashboard
        </p>
      </div>

      {/* Inline error banner */}
      {inlineError && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p style={{ color: '#fca5a5', fontSize: '13px', fontWeight: '500' }}>{inlineError}</p>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email or Mobile Number"
          placeholder="Enter email or mobile number"
          leftIcon={<Mail className="w-4 h-4" />}
          error={errors.identifier?.message}
          {...register('identifier', {
            required: 'This field is required',
            minLength: { value: 3, message: 'Minimum 3 characters required' },
          })}
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.password?.message}
          {...register('password', { required: 'Password is required' })}
        />

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMeState(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
              style={{ accentColor: '#6366f1' }}
            />
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>Remember me</span>
          </label>
          <Link to="/forgot-password"
            style={{ color: '#818cf8', fontSize: '13px', fontWeight: '500', textDecoration: 'none' }}
            onMouseOver={e => e.target.style.color = '#a5b4fc'}
            onMouseOut={e => e.target.style.color = '#818cf8'}
          >
            Forgot password?
          </Link>
        </div>

        {/* Sign In button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2"
          style={{
            marginTop: '8px',
            padding: '12px',
            borderRadius: '12px',
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: 'white',
            fontWeight: '700',
            fontSize: '14px',
            letterSpacing: '0.02em',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
            boxShadow: '0 0 24px rgba(99,102,241,0.35)',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => { if (!isLoading) { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 32px rgba(99,102,241,0.5)' }}}
          onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(99,102,241,0.35)' }}
        >
          {isLoading
            ? <><span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
            : <>Sign In <ArrowRight className="w-4 h-4" /></>
          }
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
        <span style={{ color: '#334155', fontSize: '12px', whiteSpace: 'nowrap' }}>New to CRM Platform?</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
      </div>

      <div className="flex flex-col gap-3">
        <Link to="/register?mode=trial" style={{ textDecoration: 'none' }}>
          <button
            className="w-full flex items-center justify-center gap-2"
            style={{
              padding: '11px',
              borderRadius: '12px',
              border: '1px solid rgba(99,102,241,0.35)',
              background: 'rgba(99,102,241,0.08)',
              color: '#a5b4fc',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)' }}
          >
            Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </Link>
        <Link to="/register?mode=subscription" style={{ textDecoration: 'none' }}>
          <button
            className="w-full"
            style={{
              padding: '11px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'transparent',
              color: '#64748b',
              fontWeight: '500',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#94a3b8' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
          >
            Subscription / Buy Plan
          </button>
        </Link>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default Login
