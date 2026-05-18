import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  Mail, Lock, ArrowRight, AlertCircle, Calendar, XCircle,
  RefreshCw, CheckCircle, UserX, Building2, Monitor, Globe,
  Clock, Shield, LogIn, Smartphone,
} from 'lucide-react'
import {
  login, loginWithTenant, forceLogoutAndLogin, clearError, clearTenantSelection,
  selectAuth, selectSubscriptionExpired, selectTenantSelection,
} from '../../store/authSlice'
import { Button, Input } from '../../components/common'
import { formatDateTime } from '../../utils/format'
import authService from '../../services/authService'
import ModalPortal from '../../components/common/ModalPortal'
import {
  getSavedEmail, setSavedEmail, removeSavedEmail,
  getSavedPassword, setSavedPassword, removeSavedPassword,
  getRememberMe,
} from '../../utils/token'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a raw user-agent string into a human-readable "Browser on OS" label. */
function parseUserAgent(ua = '') {
  if (!ua) return 'Unknown device'

  let browser = 'Unknown browser'
  let os      = 'Unknown OS'

  // Browser detection (order matters — Edge before Chrome)
  if (/Edg\//.test(ua))        browser = 'Microsoft Edge'
  else if (/OPR\//.test(ua))   browser = 'Opera'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\//.test(ua))  browser = 'Chrome'
  else if (/Safari\//.test(ua))  browser = 'Safari'
  else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer'

  // OS detection
  if (/Windows NT 10/.test(ua))     os = 'Windows 11/10'
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7'
  else if (/Windows/.test(ua))      os = 'Windows'
  else if (/Mac OS X/.test(ua))     os = 'macOS'
  else if (/iPhone/.test(ua))       os = 'iOS (iPhone)'
  else if (/iPad/.test(ua))         os = 'iOS (iPad)'
  else if (/Android/.test(ua))      os = 'Android'
  else if (/Linux/.test(ua))        os = 'Linux'

  return `${browser} on ${os}`
}

function DeviceIcon({ ua = '' }) {
  const isMobile = /iPhone|Android|Mobile/.test(ua)
  const Icon = isMobile ? Smartphone : Monitor
  return <Icon size={16} />
}

function timeSince(isoStr) {
  if (!isoStr) return null
  const diff = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Active Session Conflict Modal (Device B) ───────────────────────────────────
/**
 * Shown on Device B when the login attempt returns 409 (active session on Device A).
 *
 * Phases:
 *   confirm   — shows active-session info; two choices:
 *                 a) "Request Access" — politely ask Device A to approve
 *                 b) "Force Login"    — immediately take over
 *   requesting — calling POST /sessions/request-access
 *   waiting    — polling GET /sessions/request-status every 2 s
 *   approved   — auto force-login (Device A's session is already revoked)
 *   denied     — Device A blocked the request
 *   expired    — 5-minute TTL ran out with no response
 */
function ActiveSessionModal({ data, rememberMe, onClose, onLoginSuccess }) {
  const dispatch = useDispatch()
  const { identifier, password, sessionInfo = {} } = data || {}

  const [phase,       setPhase]       = useState('confirm')
  const [loading,     setLoading]     = useState(false)
  const [requestId,   setRequestId]   = useState(null)
  const [countdown,   setCountdown]   = useState(300)   // 5-min TTL display

  const pollRef     = useRef(null)
  const countRef    = useRef(null)

  const deviceLabel = parseUserAgent(sessionInfo.device_info)
  const ipLabel     = sessionInfo.ip_address || 'Unknown location'
  const sinceLabel  = timeSince(sessionInfo.login_time)

  // Clean up polling + countdown on unmount
  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(countRef.current)
  }, [])

  // ── Force takeover (immediate path) ───────────────────────────────────────
  const handleForceLogin = async () => {
    setLoading(true)
    clearInterval(pollRef.current)
    clearInterval(countRef.current)
    try {
      await dispatch(forceLogoutAndLogin({ identifier, password, remember_me: rememberMe })).unwrap()
      if (rememberMe) { setSavedEmail(identifier); setSavedPassword(password) }
      else             { removeSavedEmail();        removeSavedPassword() }
      toast.success('Login successful!')
      onLoginSuccess?.()
      onClose()
    } catch (err) {
      const msg = typeof err === 'string' ? err : 'Login failed. Please try again.'
      toast.error(msg)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  // ── Request access (polite path) ──────────────────────────────────────────
  const handleRequestAccess = async () => {
    setPhase('requesting')
    try {
      const res = await authService.requestAccess(identifier, password)
      const rid = res.data?.request_id
      if (!rid) throw new Error('No request_id returned')
      setRequestId(rid)
      setPhase('waiting')
      startPolling(rid)
      startCountdown()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to send request. Please try again.'
      toast.error(msg)
      setPhase('confirm')
    }
  }

  const startPolling = (rid) => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res    = await authService.getRequestStatus(rid)
        const status = res.data?.status
        if (status === 'approved') {
          clearInterval(pollRef.current)
          clearInterval(countRef.current)
          setPhase('approved')
          // Device A revoked their own session → proceed with force login
          setTimeout(async () => {
            try {
              await dispatch(forceLogoutAndLogin({ identifier, password, remember_me: rememberMe })).unwrap()
              if (rememberMe) { setSavedEmail(identifier); setSavedPassword(password) }
              else             { removeSavedEmail();        removeSavedPassword() }
              toast.success('Login successful!')
              onLoginSuccess?.()
              onClose()
            } catch {
              toast.error('Login failed. Please try again.')
              onClose()
            }
          }, 800)
        } else if (status === 'denied') {
          clearInterval(pollRef.current)
          clearInterval(countRef.current)
          setPhase('denied')
        } else if (status === 'expired') {
          clearInterval(pollRef.current)
          clearInterval(countRef.current)
          setPhase('expired')
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2000)
  }

  const startCountdown = () => {
    clearInterval(countRef.current)
    countRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countRef.current)
          clearInterval(pollRef.current)
          setPhase('expired')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')
  const timeColor = countdown < 30 ? '#ef4444' : countdown < 60 ? '#f59e0b' : '#22c55e'

  const overlay = {
    position:       'fixed',
    inset:          0,
    zIndex:         9999,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '16px',
    background:     'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(6px)',
    animation:      'fadeIn 0.2s ease both',
  }
  const card = {
    width:        '100%',
    maxWidth:     '440px',
    background:   'linear-gradient(145deg,#0f172a,#1e293b)',
    border:       '1px solid rgba(245,158,11,0.3)',
    borderRadius: '20px',
    padding:      '28px 24px',
    boxShadow:    '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.6), 0 0 40px rgba(245,158,11,0.1)',
    animation:    'cardIn 0.28s cubic-bezier(0.16,1,0.3,1) both',
  }

  return (
    <div role="dialog" aria-modal="true" style={overlay}>
      <div style={card}>

        {/* ── Waiting for approval ──────────────────────────────────────── */}
        {(phase === 'requesting' || phase === 'waiting') && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              {phase === 'requesting'
                ? <Spinner />
                : <Shield size={24} color="#818cf8" />
              }
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: '17px', fontWeight: 700, margin: 0 }}>
              {phase === 'requesting' ? 'Sending Request…' : 'Waiting for Approval'}
            </h3>
            {phase === 'waiting' && (
              <>
                <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
                  A notification has been sent to the active device.<br />
                  Waiting for them to allow or deny your request.
                </p>
                <div style={{ marginTop: 14, fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Request expires in </span>
                  <span style={{ fontWeight: 700, color: timeColor, fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
                </div>
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1.2s ease-in-out infinite' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1.2s ease-in-out infinite 0.3s' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1.2s ease-in-out infinite 0.6s' }} />
                </div>
                <button
                  onClick={() => { clearInterval(pollRef.current); clearInterval(countRef.current); setPhase('confirm') }}
                  style={{ marginTop: 16, ...btnStyle('ghost') }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Approved (auto-proceeding) ────────────────────────────────── */}
        {phase === 'approved' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <CheckCircle size={24} color="#22c55e" />
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: '17px', fontWeight: 700, margin: 0 }}>Access Approved!</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8 }}>
              Logging you in now…
            </p>
            <div style={{ marginTop: 14 }}><Spinner /></div>
          </div>
        )}

        {/* ── Denied ───────────────────────────────────────────────────── */}
        {phase === 'denied' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <XCircle size={24} color="#ef4444" />
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: '17px', fontWeight: 700, margin: 0 }}>Login Request Denied</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
              The active device denied your login request.<br />
              Contact your administrator if you need access.
            </p>
            <button onClick={onClose} style={{ marginTop: 16, ...btnStyle('ghost') }}>Close</button>
          </div>
        )}

        {/* ── Expired ──────────────────────────────────────────────────── */}
        {phase === 'expired' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Clock size={24} color="#64748b" />
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: '17px', fontWeight: 700, margin: 0 }}>Request Timed Out</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
              No response from the active device within 5 minutes.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setPhase('confirm'); setCountdown(300) }} style={btnStyle('primary')}>Try Again</button>
              <button onClick={onClose} style={btnStyle('ghost')}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Confirm (main UI) ─────────────────────────────────────────── */}
        {phase === 'confirm' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Shield size={24} color="#f59e0b" />
              </div>
              <h3 style={{ color: '#f1f5f9', fontSize: '17px', fontWeight: 700, margin: 0 }}>Account Already Active</h3>
              <p style={{ color: '#94a3b8', fontSize: '12.5px', marginTop: 6 }}>
                This account is currently active on another device.
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <InfoRow icon={<DeviceIcon ua={sessionInfo.device_info} />} label="Device" value={deviceLabel} />
                <InfoRow icon={<Globe size={14} />}  label="IP Address" value={ipLabel} />
                {sinceLabel && <InfoRow icon={<Clock size={14} />} label="Active Since" value={sinceLabel} />}
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Primary: request polite approval from the active device */}
              <button
                onClick={handleRequestAccess}
                disabled={loading}
                style={btnStyle('primary', loading)}
              >
                <Shield size={14} /> Request Access from Active Device
              </button>

              {/* Secondary: force takeover immediately */}
              <button
                onClick={handleForceLogin}
                disabled={loading}
                style={{
                  ...btnStyle('ghost'),
                  borderColor: 'rgba(239,68,68,0.25)',
                  color: '#f87171',
                }}
              >
                {loading ? <><Spinner /> Logging in…</> : <><LogIn size={14} /> Force Login (log out other device)</>}
              </button>

              <button onClick={onClose} disabled={loading} style={btnStyle('ghost')}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes cardIn { from { opacity:0; transform: scale(0.95) translateY(8px) } to { opacity:1; transform: scale(1) translateY(0) } }
        @keyframes spin   { to   { transform: rotate(360deg) } }
        @keyframes pulse  { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.4; transform:scale(0.85) } }
      `}</style>
    </div>
  )
}

// ── Tiny layout helpers ────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ color: '#64748b', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ color: '#cbd5e1', fontSize: '13px', marginTop: 1, wordBreak: 'break-all' }}>{value}</div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span style={{
      width: 14, height: 14,
      border: '2px solid rgba(255,255,255,0.3)',
      borderTopColor: 'white',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

function btnStyle(variant = 'primary', disabled = false) {
  const base = {
    width:          '100%',
    padding:        '11px',
    borderRadius:   '12px',
    fontWeight:     variant === 'primary' ? '700' : '500',
    fontSize:       variant === 'primary' ? '14px' : '13px',
    cursor:         disabled ? 'not-allowed' : 'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '8px',
    transition:     'all 0.15s',
  }
  if (variant === 'primary') return {
    ...base,
    background:  disabled ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    border:      'none',
    color:       '#fff',
    boxShadow:   disabled ? 'none' : '0 0 20px rgba(99,102,241,0.35)',
    opacity:     disabled ? 0.75 : 1,
  }
  return {
    ...base,
    background: 'transparent',
    border:     '1px solid rgba(255,255,255,0.09)',
    color:      '#64748b',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const Login = () => {
  const dispatch    = useDispatch()
  const navigate    = useNavigate()   // eslint-disable-line no-unused-vars
  const { isLoading } = useSelector(selectAuth)
  const subscriptionExpired = useSelector(selectSubscriptionExpired)
  const tenantSelection     = useSelector(selectTenantSelection)

  const [loginFailed,       setLoginFailed]       = useState(null)
  const [emailNotVerified,  setEmailNotVerified]  = useState(null)
  const [resendLoading,     setResendLoading]     = useState(false)
  const [resendSent,        setResendSent]        = useState(false)
  const [tenantSelectError, setTenantSelectError] = useState('')
  const [inlineError,       setInlineError]       = useState('')

  // Multi-device conflict modal state: { identifier, password, sessionInfo }
  const [activeSessionData, setActiveSessionData] = useState(null)

  const savedEmail    = getSavedEmail()
  const savedPassword = getSavedPassword()
  const [rememberMe, setRememberMeState] = useState(!!savedEmail || getRememberMe())

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { identifier: savedEmail, password: savedPassword },
  })

  // Show sessionStorage errors (set by api.js interceptor)
  useEffect(() => {
    const stored = sessionStorage.getItem('login_error')
    if (stored) {
      sessionStorage.removeItem('login_error')
      setInlineError(stored)
    }
  }, [])

  // ── Tenant selection ────────────────────────────────────────────────────
  const handleTenantSelect = async (company_id) => {
    if (!tenantSelection) return
    setTenantSelectError('')
    const result = await dispatch(loginWithTenant({
      identifier:  tenantSelection.identifier,
      password:    tenantSelection.password,
      company_id,
      remember_me: tenantSelection.remember_me,
    }))
    if (loginWithTenant.fulfilled.match(result)) {
      if (tenantSelection.remember_me) { setSavedEmail(tenantSelection.identifier); setSavedPassword(tenantSelection.password) }
      else                              { removeSavedEmail(); removeSavedPassword() }
      toast.success('Login successful!')
    } else if (loginWithTenant.rejected.match(result)) {
      const payload = result.payload
      if (payload && typeof payload === 'object' && payload.type === 'SUBSCRIPTION_EXPIRED') {
        // handled by Redux state
      } else {
        setTenantSelectError(typeof payload === 'string' ? payload : 'Login failed. Please try again.')
      }
    }
  }

  // ── Main login ───────────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    setLoginFailed(null)
    setEmailNotVerified(null)
    setResendSent(false)
    setInlineError('')

    const result = await dispatch(login({ ...data, remember_me: rememberMe }))

    if (login.fulfilled.match(result)) {
      if (result.payload.tenant_selection_required) return
      if (rememberMe) { setSavedEmail(data.identifier); setSavedPassword(data.password) }
      else             { removeSavedEmail(); removeSavedPassword() }
      toast.success('Login successful!')
    } else if (login.rejected.match(result)) {
      const payload = result.payload

      if (payload?.type === 'ACTIVE_SESSION') {
        // Show the premium conflict modal with device info
        setActiveSessionData({
          identifier:  data.identifier,
          password:    data.password,
          sessionInfo: payload.session_info || {},
        })
        dispatch(clearError())

      } else if (payload?.email_not_verified) {
        setEmailNotVerified({ email: payload.email, message: payload.message })

      } else if (payload?.type === 'SUBSCRIPTION_EXPIRED') {
        // Redux already set subscriptionExpired — nothing extra needed

      } else {
        const msg = typeof payload === 'string' ? payload : 'Login failed. Please try again.'
        setLoginFailed(msg)
        dispatch(clearError())
      }
    }
  }

  // ── Resend email verification ─────────────────────────────────────────────
  const handleResendVerification = async () => {
    if (!emailNotVerified?.email) return
    setResendLoading(true)
    try {
      await authService.resendVerification(emailNotVerified.email)
      setResendSent(true)
      toast.success('Verification email sent! Check your inbox.')
    } catch {
      setResendSent(true)   // privacy: always show success
    } finally {
      setResendLoading(false)
    }
  }

  // ── Pass `session_info` through the Redux payload ─────────────────────────
  // The authSlice login.rejected handler stores the raw payload. We need
  // session_info to reach the modal, so intercept it in the catch branch above
  // where we already have access to result.payload directly.

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Tenant / company selection
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Account not found
  // ─────────────────────────────────────────────────────────────────────────
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
        <button onClick={() => setLoginFailed(null)} className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors">
          ← Back to Login
        </button>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Email not verified
  // ─────────────────────────────────────────────────────────────────────────
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
          <Button onClick={handleResendVerification} isLoading={resendLoading} className="w-full" leftIcon={<RefreshCw className="w-4 h-4" />}>
            Resend Verification Email
          </Button>
        ) : (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-700 text-center">
            <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-600" />
            Verification email sent! Check your inbox and click the link.
          </div>
        )}
        <button onClick={() => setEmailNotVerified(null)} className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors">
          ← Back to Login
        </button>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Subscription expired
  // ─────────────────────────────────────────────────────────────────────────
  if (subscriptionExpired) {
    const expiryLabel = subscriptionExpired.planExpiry ? formatDateTime(subscriptionExpired.planExpiry) : null
    const isSeller    = subscriptionExpired.userType === 'seller'

    if (isSeller) {
      return (
        <div className="animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Calendar className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Subscription Expired</h2>
            {expiryLabel && <p className="text-sm text-surface-500 mt-1">Expired on <span className="font-medium text-surface-700">{expiryLabel}</span></p>}
          </div>
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm text-amber-800">{subscriptionExpired.message}</p>
            <p className="text-sm text-amber-700 mt-2">Please contact the platform administrator to renew your seller subscription.</p>
          </div>
          <button onClick={() => dispatch(clearError())} className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium border border-surface-200 rounded-xl transition-colors">
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
            {expiryLabel && <p className="text-sm text-surface-500 mt-1">Expired on <span className="font-medium text-surface-700">{expiryLabel}</span></p>}
          </div>
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm text-amber-800">{subscriptionExpired.message}</p>
          </div>
          <button onClick={() => navigate('/upgrade-plan', { state: subscriptionExpired })} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl transition-colors">
            <ArrowRight className="w-4 h-4" /> Upgrade Plan
          </button>
          <button onClick={() => dispatch(clearError())} className="w-full mt-3 px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium transition-colors">
            ← Back to Login
          </button>
        </div>
      )
    }

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
          {expiryLabel && <p className="text-xs text-red-700">Expired on: <span className="font-medium">{expiryLabel}</span></p>}
          <p className="text-sm text-red-700 mt-2">Please contact your company administrator to renew the subscription.</p>
        </div>
        <button onClick={() => dispatch(clearError())} className="w-full px-4 py-3 text-sm text-surface-600 hover:text-surface-800 font-medium border border-surface-200 rounded-xl transition-colors">
          ← Back to Login
        </button>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Login form (default)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: 'cardEntrance 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>

      <div className="mb-7" style={{ textAlign: 'center' }}>
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

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2"
          style={{
            marginTop: '8px', padding: '12px', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white',
            fontWeight: '700', fontSize: '14px', letterSpacing: '0.02em',
            cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1,
            boxShadow: '0 0 24px rgba(99,102,241,0.35)', transition: 'all 0.2s ease',
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
        <span style={{ color: '#334155', fontSize: '12px', whiteSpace: 'nowrap' }}>New to HireFlow?</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
      </div>

      <div className="flex flex-col gap-3">
        <Link to="/register?mode=trial" style={{ textDecoration: 'none' }}>
          <button className="w-full flex items-center justify-center gap-2"
            style={{ padding: '11px', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', fontWeight: '600', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s ease', width: '100%' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)' }}
          >
            Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </Link>
        <Link to="/register?mode=subscription" style={{ textDecoration: 'none' }}>
          <button className="w-full"
            style={{ padding: '11px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)', background: 'transparent', color: '#64748b', fontWeight: '500', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s ease', width: '100%' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#94a3b8' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
          >
            Subscription / Buy Plan
          </button>
        </Link>
      </div>

      <style>{`
        @keyframes spin          { to   { transform: rotate(360deg); } }
        @keyframes cardEntrance  { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Multi-device conflict modal ─────────────────────────────────── */}
      {activeSessionData && (
        <ModalPortal isOpen>
          <ActiveSessionModal
            data={activeSessionData}
            rememberMe={rememberMe}
            onClose={() => setActiveSessionData(null)}
          />
        </ModalPortal>
      )}
    </div>
  )
}

export default Login
