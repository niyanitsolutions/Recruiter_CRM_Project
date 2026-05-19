import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  Mail, Lock, ArrowRight, AlertCircle, Calendar, XCircle,
  RefreshCw, CheckCircle, UserX, Building2, Monitor, Globe,
  Clock, Shield, Smartphone, Eye, EyeOff, Rocket, Crown,
} from 'lucide-react'
import {
  login, loginWithTenant, clearError, clearTenantSelection,
  selectAuth, selectSubscriptionExpired, selectTenantSelection,
} from '../../store/authSlice'
import { formatDateTime } from '../../utils/format'
import authService from '../../services/authService'
import ModalPortal from '../../components/common/ModalPortal'
import {
  getSavedEmail, setSavedEmail, removeSavedEmail,
  getSavedPassword, setSavedPassword, removeSavedPassword,
  getRememberMe,
} from '../../utils/token'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUserAgent(ua = '') {
  if (!ua) return 'Unknown device'
  let browser = 'Unknown browser', os = 'Unknown OS'
  if (/Edg\//.test(ua))          browser = 'Microsoft Edge'
  else if (/OPR\//.test(ua))     browser = 'Opera'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\//.test(ua))  browser = 'Chrome'
  else if (/Safari\//.test(ua))  browser = 'Safari'
  else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer'
  if (/Windows NT 10/.test(ua))      os = 'Windows 11/10'
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7'
  else if (/Windows/.test(ua))       os = 'Windows'
  else if (/Mac OS X/.test(ua))      os = 'macOS'
  else if (/iPhone/.test(ua))        os = 'iOS (iPhone)'
  else if (/iPad/.test(ua))          os = 'iOS (iPad)'
  else if (/Android/.test(ua))       os = 'Android'
  else if (/Linux/.test(ua))         os = 'Linux'
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
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 14 }) {
  return (
    <span style={{
      width: size, height: size,
      border: '2px solid rgba(255,255,255,0.25)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

// ── Small button helper (for modal) ───────────────────────────────────────────
function ModalBtn({ variant = 'primary', disabled, onClick, children, style: extraStyle }) {
  const base = {
    width: '100%', padding: '11px',
    borderRadius: '11px',
    fontWeight: variant === 'primary' ? '700' : '500',
    fontSize: variant === 'primary' ? '14px' : '13px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
    ...extraStyle,
  }
  if (variant === 'primary') return (
    <button onClick={onClick} disabled={disabled} style={{
      ...base,
      background: disabled ? 'rgba(99,102,241,0.45)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
      border: 'none', color: '#fff',
      boxShadow: disabled ? 'none' : '0 0 18px rgba(99,102,241,0.35)',
      opacity: disabled ? 0.75 : 1,
    }}>{children}</button>
  )
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...base, background: 'transparent',
      border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.50)',
    }}>{children}</button>
  )
}

// ── InfoRow (modal) ───────────────────────────────────────────────────────────
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

// ── Active Session Conflict Modal ─────────────────────────────────────────────
function ActiveSessionModal({ data, rememberMe, onClose, onLoginSuccess }) {
  const dispatch = useDispatch()
  const { identifier, password, sessionInfo = {} } = data || {}

  const [phase,     setPhase]     = useState('confirm')
  const [requestId, setRequestId] = useState(null)
  const [countdown, setCountdown] = useState(300)

  const pollRef  = useRef(null)
  const countRef = useRef(null)

  const deviceLabel = parseUserAgent(sessionInfo.device_info)
  const ipLabel     = sessionInfo.ip_address || 'Unknown location'
  const sinceLabel  = timeSince(sessionInfo.login_time)

  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(countRef.current)
  }, [])

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
      const detail = err?.response?.data?.detail
      if (detail === 'NO_ACTIVE_SESSION') {
        toast.success('The other session has ended. Logging you in…')
        onClose(); onLoginSuccess?.()
        return
      }
      toast.error(detail || 'Failed to send request. Please try again.')
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
          clearInterval(pollRef.current); clearInterval(countRef.current)
          setPhase('approved')
          setTimeout(async () => {
            try {
              await dispatch(login({ identifier, password, remember_me: rememberMe })).unwrap()
              if (rememberMe) { setSavedEmail(identifier); setSavedPassword(password) }
              else             { removeSavedEmail();        removeSavedPassword() }
              toast.success('Login successful!')
              onLoginSuccess?.(); onClose()
            } catch { toast.error('Login failed. Please try again.'); onClose() }
          }, 800)
        } else if (status === 'denied') {
          clearInterval(pollRef.current); clearInterval(countRef.current); setPhase('denied')
        } else if (status === 'expired') {
          clearInterval(pollRef.current); clearInterval(countRef.current); setPhase('expired')
        }
      } catch { /* ignore transient poll errors */ }
    }, 2000)
  }

  const startCountdown = () => {
    clearInterval(countRef.current)
    countRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countRef.current); clearInterval(pollRef.current); setPhase('expired'); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')
  const timeColor = countdown < 30 ? '#ef4444' : countdown < 60 ? '#f59e0b' : '#22c55e'

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(8px)',
    animation: 'fadeIn 0.2s ease both',
  }
  const card = {
    width: '100%', maxWidth: '440px',
    background: 'linear-gradient(145deg,#0f172a,#1e293b)',
    border: '1px solid rgba(245,158,11,0.28)',
    borderRadius: '20px', padding: '28px 24px',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.65), 0 0 40px rgba(245,158,11,0.08)',
    animation: 'cardIn2 0.28s cubic-bezier(0.16,1,0.3,1) both',
  }
  const iconWrap = (color) => ({
    width: 54, height: 54, borderRadius: '50%',
    background: `rgba(${color},0.11)`, border: `1px solid rgba(${color},0.28)`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  })

  return (
    <div role="dialog" aria-modal="true" style={overlay}>
      <div style={card}>
        {/* requesting / waiting */}
        {(phase === 'requesting' || phase === 'waiting') && (
          <div style={{ textAlign: 'center' }}>
            <div style={iconWrap('99,102,241')}>
              {phase === 'requesting' ? <Spinner size={22} /> : <Shield size={22} color="#818cf8" />}
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              {phase === 'requesting' ? 'Sending Request…' : 'Waiting for Approval'}
            </h3>
            {phase === 'waiting' && (
              <>
                <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
                  A notification was sent to the active device.<br />Awaiting their response.
                </p>
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Expires in </span>
                  <span style={{ fontWeight: 700, color: timeColor, fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {[0, 0.3, 0.6].map((d, i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: `pulse 1.2s ease-in-out infinite ${d}s` }} />
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <ModalBtn variant="ghost" onClick={() => { clearInterval(pollRef.current); clearInterval(countRef.current); setPhase('confirm') }}>Cancel</ModalBtn>
                </div>
              </>
            )}
          </div>
        )}

        {/* approved */}
        {phase === 'approved' && (
          <div style={{ textAlign: 'center' }}>
            <div style={iconWrap('34,197,94')}><CheckCircle size={22} color="#22c55e" /></div>
            <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: 0 }}>Access Approved!</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8 }}>Logging you in now…</p>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          </div>
        )}

        {/* denied */}
        {phase === 'denied' && (
          <div style={{ textAlign: 'center' }}>
            <div style={iconWrap('239,68,68')}><XCircle size={22} color="#ef4444" /></div>
            <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: 0 }}>Login Request Denied</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
              The active device denied your request.<br />Contact your administrator if needed.
            </p>
            <div style={{ marginTop: 16 }}><ModalBtn variant="ghost" onClick={onClose}>Close</ModalBtn></div>
          </div>
        )}

        {/* expired */}
        {phase === 'expired' && (
          <div style={{ textAlign: 'center' }}>
            <div style={iconWrap('100,116,139')}><Clock size={22} color="#64748b" /></div>
            <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: 0 }}>Request Timed Out</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 8 }}>No response within 5 minutes.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <ModalBtn onClick={() => { setPhase('confirm'); setCountdown(300) }}>Try Again</ModalBtn>
              <ModalBtn variant="ghost" onClick={onClose}>Cancel</ModalBtn>
            </div>
          </div>
        )}

        {/* confirm */}
        {phase === 'confirm' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={iconWrap('245,158,11')}><Shield size={22} color="#f59e0b" /></div>
              <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: 0 }}>Active Session Detected</h3>
              <p style={{ color: '#94a3b8', fontSize: '12.5px', marginTop: 6 }}>
                This account has an active session on another device.
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InfoRow icon={<DeviceIcon ua={sessionInfo.device_info} />} label="Device"      value={deviceLabel} />
                <InfoRow icon={<Globe size={14} />}                         label="IP Address"  value={ipLabel} />
                {sinceLabel && <InfoRow icon={<Clock size={14} />}          label="Last Active" value={timeSince(sessionInfo.last_active) || sinceLabel} />}
                {sessionInfo.ws_connected && (
                  <InfoRow
                    icon={<span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />}
                    label="Status" value="Connected"
                  />
                )}
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <ModalBtn onClick={handleRequestAccess}>
                <Shield size={14} /> Request Access from Active Device
              </ModalBtn>
              <ModalBtn variant="ghost" onClick={onClose}>Cancel</ModalBtn>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Shared field wrapper ──────────────────────────────────────────────────────
function GlassField({ label, htmlFor, icon, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{
        display: 'block', marginBottom: 6,
        color: 'rgba(255,255,255,0.72)', fontSize: '13px', fontWeight: '500',
        letterSpacing: '0.01em',
      }}>
        {label}
      </label>
      <div className="glass-input-wrap">
        <span className="glass-input-icon">
          {icon}
        </span>
        {children}
      </div>
      {error && (
        <p style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 4, color: '#f87171', fontSize: '12px' }}>
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider({ label = 'OR' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <span style={{ color: 'rgba(255,255,255,0.26)', fontSize: '11px', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
    </div>
  )
}

// ── Screen heading helper ─────────────────────────────────────────────────────
function ScreenHead({ icon, iconColor, iconBg, iconBorder, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{
        width: 54, height: 54, borderRadius: '50%',
        background: iconBg, border: `1px solid ${iconBorder}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
      }}>
        {icon}
      </div>
      <h2 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: '700', margin: '0 0 6px', letterSpacing: '-0.01em' }}>{title}</h2>
      {subtitle && <p style={{ color: 'rgba(255,255,255,0.48)', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const Login = () => {
  const dispatch    = useDispatch()
  const navigate    = useNavigate()
  const { isLoading } = useSelector(selectAuth)
  const subscriptionExpired = useSelector(selectSubscriptionExpired)
  const tenantSelection     = useSelector(selectTenantSelection)

  const [loginFailed,       setLoginFailed]       = useState(null)
  const [emailNotVerified,  setEmailNotVerified]  = useState(null)
  const [resendLoading,     setResendLoading]     = useState(false)
  const [resendSent,        setResendSent]        = useState(false)
  const [tenantSelectError, setTenantSelectError] = useState('')
  const [inlineError,       setInlineError]       = useState('')
  const [showPassword,      setShowPassword]      = useState(false)
  const [activeSessionData, setActiveSessionData] = useState(null)

  const savedEmail    = getSavedEmail()
  const savedPassword = getSavedPassword()
  const [rememberMe, setRememberMeState] = useState(!!savedEmail || getRememberMe())

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { identifier: savedEmail, password: savedPassword },
  })

  useEffect(() => {
    const stored = sessionStorage.getItem('login_error')
    if (stored) { sessionStorage.removeItem('login_error'); setInlineError(stored) }
  }, [])

  // ── Tenant selection ──────────────────────────────────────────────────────
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
      if (!(payload && typeof payload === 'object' && payload.type === 'SUBSCRIPTION_EXPIRED')) {
        setTenantSelectError(typeof payload === 'string' ? payload : 'Login failed. Please try again.')
      }
    }
  }

  // ── Main login ────────────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    setLoginFailed(null); setEmailNotVerified(null)
    setResendSent(false); setInlineError('')

    const result = await dispatch(login({ ...data, remember_me: rememberMe }))

    if (login.fulfilled.match(result)) {
      if (result.payload.tenant_selection_required) return
      if (rememberMe) { setSavedEmail(data.identifier); setSavedPassword(data.password) }
      else             { removeSavedEmail(); removeSavedPassword() }
      toast.success('Login successful!')
    } else if (login.rejected.match(result)) {
      const payload = result.payload
      if (payload?.type === 'ACTIVE_SESSION') {
        setActiveSessionData({ identifier: data.identifier, password: data.password, sessionInfo: payload.session_info || {} })
        dispatch(clearError())
      } else if (payload?.email_not_verified) {
        setEmailNotVerified({ email: payload.email, message: payload.message })
      } else if (payload?.type === 'SUBSCRIPTION_EXPIRED') {
        // Redux already set subscriptionExpired
      } else {
        setLoginFailed(typeof payload === 'string' ? payload : 'Login failed. Please try again.')
        dispatch(clearError())
      }
    }
  }

  const handleResendVerification = async () => {
    if (!emailNotVerified?.email) return
    setResendLoading(true)
    try {
      await authService.resendVerification(emailNotVerified.email)
      setResendSent(true); toast.success('Verification email sent!')
    } catch { setResendSent(true) }
    finally  { setResendLoading(false) }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Tenant / company selection
  // ─────────────────────────────────────────────────────────────────────────
  if (tenantSelection) {
    return (
      <div style={{ animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
        <ScreenHead
          icon={<Building2 size={22} color="#818cf8" />}
          iconBg="rgba(99,102,241,0.11)" iconBorder="rgba(99,102,241,0.26)"
          title="Select Company"
          subtitle="Your credentials match multiple companies. Choose one to continue."
        />

        {tenantSelectError && (
          <div className="glass-alert glass-alert-red" style={{ marginBottom: 14 }}>
            <p style={{ color: '#fca5a5', fontSize: '13px', margin: 0 }}>{tenantSelectError}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {tenantSelection.tenants.map((t) => (
            <button
              key={t.company_id}
              onClick={() => handleTenantSelect(t.company_id)}
              disabled={isLoading}
              className="tenant-item"
            >
              <div>
                <p style={{ color: '#f1f5f9', fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{t.company_name}</p>
                <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '12px', margin: 0, textTransform: 'capitalize' }}>{t.role}</p>
              </div>
              <ArrowRight size={15} style={{ color: 'rgba(255,255,255,0.30)', flexShrink: 0 }} />
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button onClick={() => dispatch(clearTenantSelection())} className="glass-btn-ghost">
            ← Back to Login
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Account not found
  // ─────────────────────────────────────────────────────────────────────────
  if (loginFailed) {
    return (
      <div style={{ animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
        <ScreenHead
          icon={<UserX size={22} color="#f87171" />}
          iconBg="rgba(239,68,68,0.11)" iconBorder="rgba(239,68,68,0.26)"
          title="Account Not Found"
          subtitle="We couldn't find an account matching your details."
        />
        <div className="glass-alert glass-alert-red" style={{ marginBottom: 18 }}>
          <p style={{ color: '#fca5a5', fontWeight: '600', fontSize: '13px', margin: '0 0 5px' }}>{loginFailed}</p>
          <p style={{ color: 'rgba(252,165,165,0.70)', fontSize: '12px', margin: 0 }}>
            Double-check your email / mobile number and password, or create a new account.
          </p>
        </div>
        <Link to="/register" style={{ textDecoration: 'none', display: 'block' }}>
          <button className="glass-btn-primary">Create New Account</button>
        </Link>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => setLoginFailed(null)} className="glass-btn-ghost">← Back to Login</button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Email not verified
  // ─────────────────────────────────────────────────────────────────────────
  if (emailNotVerified) {
    return (
      <div style={{ animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
        <ScreenHead
          icon={<Mail size={22} color="#fbbf24" />}
          iconBg="rgba(245,158,11,0.11)" iconBorder="rgba(245,158,11,0.26)"
          title="Verify Your Email"
          subtitle="Your account is not yet verified. Check your inbox for the verification link."
        />
        <div className="glass-alert glass-alert-amber" style={{ marginBottom: 18 }}>
          <p style={{ color: '#fcd34d', fontSize: '13px', margin: '0 0 4px' }}>{emailNotVerified.message}</p>
          {emailNotVerified.email && (
            <p style={{ color: 'rgba(252,211,77,0.70)', fontSize: '12px', margin: 0 }}>
              Email: <strong style={{ color: '#fcd34d' }}>{emailNotVerified.email}</strong>
            </p>
          )}
        </div>
        {!resendSent ? (
          <button
            onClick={handleResendVerification}
            disabled={resendLoading}
            className="glass-btn-primary"
            style={{ marginBottom: 10 }}
          >
            {resendLoading ? <><Spinner /> Sending…</> : <><RefreshCw size={15} /> Resend Verification Email</>}
          </button>
        ) : (
          <div className="glass-alert glass-alert-green" style={{ marginBottom: 10, textAlign: 'center' }}>
            <CheckCircle size={18} style={{ color: '#4ade80', display: 'block', margin: '0 auto 6px' }} />
            <p style={{ color: '#86efac', fontSize: '13px', margin: 0 }}>
              Verification email sent! Check your inbox.
            </p>
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => setEmailNotVerified(null)} className="glass-btn-ghost">← Back to Login</button>
        </div>
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
        <div style={{ animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
          <ScreenHead
            icon={<Calendar size={22} color="#fbbf24" />}
            iconBg="rgba(245,158,11,0.11)" iconBorder="rgba(245,158,11,0.26)"
            title="Subscription Expired"
            subtitle={expiryLabel ? `Expired on ${expiryLabel}` : undefined}
          />
          <div className="glass-alert glass-alert-amber" style={{ marginBottom: 18 }}>
            <p style={{ color: '#fcd34d', fontSize: '13px', margin: '0 0 6px' }}>{subscriptionExpired.message}</p>
            <p style={{ color: 'rgba(252,211,77,0.70)', fontSize: '12px', margin: 0 }}>
              Please contact the platform administrator to renew your seller subscription.
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => dispatch(clearError())} className="glass-btn-ghost">← Back to Login</button>
          </div>
        </div>
      )
    }

    if (subscriptionExpired.isOwner) {
      return (
        <div style={{ animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
          <ScreenHead
            icon={<Calendar size={22} color="#fbbf24" />}
            iconBg="rgba(245,158,11,0.11)" iconBorder="rgba(245,158,11,0.26)"
            title="Subscription Expired"
            subtitle={expiryLabel ? `Expired on ${expiryLabel}` : undefined}
          />
          <div className="glass-alert glass-alert-amber" style={{ marginBottom: 18 }}>
            <p style={{ color: '#fcd34d', fontSize: '13px', margin: 0 }}>{subscriptionExpired.message}</p>
          </div>
          <button
            onClick={() => navigate('/upgrade-plan', { state: subscriptionExpired })}
            className="glass-btn-primary"
            style={{ marginBottom: 10 }}
          >
            <ArrowRight size={15} /> Upgrade Plan
          </button>
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => dispatch(clearError())} className="glass-btn-ghost">← Back to Login</button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
        <ScreenHead
          icon={<XCircle size={22} color="#f87171" />}
          iconBg="rgba(239,68,68,0.11)" iconBorder="rgba(239,68,68,0.26)"
          title="Access Unavailable"
        />
        <div className="glass-alert glass-alert-red" style={{ marginBottom: 18 }}>
          <p style={{ color: '#fca5a5', fontWeight: '600', fontSize: '13px', margin: '0 0 5px' }}>
            Your company subscription has expired.
          </p>
          {expiryLabel && (
            <p style={{ color: 'rgba(252,165,165,0.65)', fontSize: '12px', margin: '0 0 4px' }}>
              Expired on: <span style={{ color: '#fca5a5', fontWeight: '500' }}>{expiryLabel}</span>
            </p>
          )}
          <p style={{ color: 'rgba(252,165,165,0.70)', fontSize: '12px', margin: 0 }}>
            Please contact your company administrator to renew the subscription.
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => dispatch(clearError())} className="glass-btn-ghost">← Back to Login</button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Main login form
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: 'slideUp 0.45s cubic-bezier(0.16,1,0.3,1) both 0.08s' }}>

      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <h2 style={{
          color: '#fff',
          fontSize: '30px',
          fontWeight: '800',
          letterSpacing: '-0.025em',
          margin: '0 0 8px',
          lineHeight: 1.1,
        }}>
          Welcome Back
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: '14px', margin: 0 }}>
          Manage Hiring Smarter. Build Teams Faster.
        </p>
      </div>

      {/* Inline error from api.js interceptor */}
      {inlineError && (
        <div className="glass-alert glass-alert-red" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
          <AlertCircle size={15} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: '#fca5a5', fontSize: '13px', fontWeight: '500', margin: 0 }}>{inlineError}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Email / Mobile */}
        <GlassField
          label="Email / Mobile Number"
          htmlFor="identifier"
          icon={<Mail size={16} />}
          error={errors.identifier?.message}
        >
          <input
            id="identifier"
            placeholder="Enter email or mobile number"
            autoComplete="email"
            className="glass-input"
            {...register('identifier', {
              required: 'This field is required',
              minLength: { value: 3, message: 'Minimum 3 characters required' },
            })}
          />
        </GlassField>

        {/* Password */}
        <GlassField
          label="Password"
          htmlFor="password"
          icon={<Lock size={16} />}
          error={errors.password?.message}
        >
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            autoComplete="current-password"
            className="glass-input glass-input-pr"
            {...register('password', { required: 'Password is required' })}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword(v => !v)}
            className="glass-input-eye"
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </GlassField>

        {/* Remember me + forgot password */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMeState(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer' }}
            />
            <span style={{ color: 'rgba(255,255,255,0.48)', fontSize: '13px' }}>Remember me</span>
          </label>
          <Link
            to="/forgot-password"
            style={{ color: '#818cf8', fontSize: '13px', fontWeight: '500', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseOver={e => e.target.style.color = '#a5b4fc'}
            onMouseOut={e  => e.target.style.color = '#818cf8'}
          >
            Forgot password?
          </Link>
        </div>

        {/* Sign In */}
        <button
          type="submit"
          disabled={isLoading}
          className="glass-btn-primary"
          style={{ marginTop: 6 }}
        >
          {isLoading
            ? <><Spinner /> Signing in…</>
            : <>Sign In <ArrowRight size={17} /></>
          }
        </button>
      </form>

      {/* OR divider */}
      <Divider label="NEW TO HIREFLOW?" />

      {/* Secondary CTAs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link to="/register?mode=trial" style={{ textDecoration: 'none', display: 'block' }}>
          <button className="glass-btn-trial">
            <Rocket size={15} /> Start Free Trial
          </button>
        </Link>
        <Link to="/register?mode=subscription" style={{ textDecoration: 'none', display: 'block' }}>
          <button className="glass-btn-sub">
            <Crown size={15} /> Subscription / Buy Plan
          </button>
        </Link>
      </div>

      {/* Multi-device conflict modal */}
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
