import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Mail, Lock, ArrowRight, AlertCircle, Calendar, XCircle,
  RefreshCw, CheckCircle, UserX, Building2, Monitor, Globe,
  Clock, Shield, Smartphone, Eye, EyeOff, Rocket, Crown, User,
} from 'lucide-react'
import {
  login, loginWithTenant, clearError, clearTenantSelection,
  selectAuth, selectSubscriptionExpired, selectTenantSelection,
} from '../../store/authSlice'
import { formatDateTime } from '../../utils/format'
import authService from '../../services/authService'
import ModalPortal from '../../components/common/ModalPortal'
import LoginAnnouncement from '../../components/announcements/LoginAnnouncement'
import {
  getSavedEmail, setSavedEmail, removeSavedEmail,
  getSavedPassword, setSavedPassword, removeSavedPassword,
  getRememberMe,
} from '../../utils/token'
import './Login.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectBrowserOs(ua = '') {
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
  return { browser, os }
}

function parseUserAgent(ua = '') {
  if (!ua) return 'Unknown device'
  const { browser, os } = detectBrowserOs(ua)
  return `${browser} on ${os}`
}

function isMobileUa(ua = '') {
  return /iPhone|Android|Mobile/.test(ua)
}

function DeviceIcon({ ua = '' }) {
  const Icon = isMobileUa(ua) ? Smartphone : Monitor
  return <Icon size={16} />
}

// ── Device/location metadata for the login payload ───────────────────────────
// Browser/OS/timezone/device-type never require permission — always attached.
// Geolocation is only attached silently when permission is already granted;
// otherwise it is requested on-demand by the LocationRequiredModal below.
function getStaticDeviceMeta() {
  const ua = navigator.userAgent || ''
  const { browser, os } = detectBrowserOs(ua)
  let tz
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { tz = undefined }
  return { browser, os, device_type: isMobileUa(ua) ? 'mobile' : 'desktop', timezone: tz }
}

function requestGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy:  pos.coords.accuracy,
      }),
      err => reject(err),
      { timeout: 10000 },
    )
  })
}

async function getGeolocationIfAlreadyGranted() {
  if (!navigator.geolocation || !navigator.permissions?.query) return null
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    if (status.state !== 'granted') return null
    return await requestGeolocation().catch(() => null)
  } catch {
    return null
  }
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 14, inverted = false }) {
  return (
    <span style={{
      width: size, height: size,
      border: `2px solid ${inverted ? 'rgba(255,255,255,0.35)' : 'rgba(22,119,255,0.25)'}`,
      borderTopColor: inverted ? '#fff' : '#1677FF',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'hfSpin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

// ── Location-required retry modal ─────────────────────────────────────────────
function LocationRequiredModal({ message, onAllow, onCancel, busy, denied }) {
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px',
        background: '#FFFFFF',
        border: '1px solid rgba(245,158,11,0.28)',
        borderRadius: '20px', padding: '28px 24px', textAlign: 'center',
        boxShadow: '0 24px 64px rgba(15,23,42,0.28)',
      }}>
        <div style={{
          width: 54, height: 54, borderRadius: '50%', margin: '0 auto 12px',
          background: 'rgba(245,158,11,0.11)', border: '1px solid rgba(245,158,11,0.28)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Globe size={22} color="#F59E0B" />
        </div>
        <h3 style={{ color: '#1F2937', fontSize: '16px', fontWeight: 700, margin: 0 }}>
          Location Permission Required
        </h3>
        <p style={{ color: '#6B7280', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
          {message}
        </p>
        {denied && (
          <p style={{ color: '#EF4444', fontSize: '12px', marginTop: 8 }}>
            Location access was blocked. Enable it for this site in your browser settings, then retry.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
          <button onClick={onAllow} disabled={busy} className="hf-btn-primary">
            {busy ? <><Spinner inverted /> Requesting…</> : <><Globe size={14} /> Allow Location</>}
          </button>
          <button onClick={onAllow} disabled={busy} className="hf-btn-ghost" style={{ justifyContent: 'center' }}>Retry</button>
          <button onClick={onCancel} disabled={busy} className="hf-btn-ghost" style={{ justifyContent: 'center' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
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
      background: disabled ? 'rgba(22,119,255,0.45)' : 'linear-gradient(135deg,#1677FF,#0A5BFF)',
      border: 'none', color: '#fff',
      boxShadow: disabled ? 'none' : '0 8px 22px rgba(22,119,255,0.32)',
      opacity: disabled ? 0.75 : 1,
    }}>{children}</button>
  )
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...base, background: 'transparent',
      border: '1px solid #E5E7EB', color: '#6B7280',
    }}>{children}</button>
  )
}

// ── InfoRow (modal) ───────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ color: '#9CA3AF', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ color: '#9CA3AF', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ color: '#1F2937', fontSize: '13px', marginTop: 1, wordBreak: 'break-all' }}>{value}</div>
      </div>
    </div>
  )
}

// ── Active Session Conflict Modal ─────────────────────────────────────────────
function ActiveSessionModal({ data, rememberMe, onClose, onLoginSuccess }) {
  const dispatch = useDispatch()
  const { identifier, password, sessionInfo = {}, companyId = null } = data || {}

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
      const res = await authService.requestAccess(identifier, password, companyId)
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
  const timeColor = countdown < 30 ? '#EF4444' : countdown < 60 ? '#F59E0B' : '#22C55E'

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)',
    animation: 'hfFadeIn 0.2s ease both',
  }
  const card = {
    width: '100%', maxWidth: '440px',
    background: '#FFFFFF',
    border: '1px solid rgba(245,158,11,0.28)',
    borderRadius: '20px', padding: '28px 24px',
    boxShadow: '0 24px 64px rgba(15,23,42,0.28)',
    animation: 'hfCardIn2 0.28s cubic-bezier(0.16,1,0.3,1) both',
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
            <div style={iconWrap('22,119,255')}>
              {phase === 'requesting' ? <Spinner size={22} /> : <Shield size={22} color="#1677FF" />}
            </div>
            <h3 style={{ color: '#1F2937', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              {phase === 'requesting' ? 'Sending Request…' : 'Waiting for Approval'}
            </h3>
            {phase === 'waiting' && (
              <>
                <p style={{ color: '#6B7280', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
                  A notification was sent to the active device.<br />Awaiting their response.
                </p>
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  <span style={{ color: '#9CA3AF' }}>Expires in </span>
                  <span style={{ fontWeight: 700, color: timeColor, fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {[0, 0.3, 0.6].map((d, i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#1677FF', animation: `hfPulse 1.2s ease-in-out infinite ${d}s` }} />
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
            <div style={iconWrap('34,197,94')}><CheckCircle size={22} color="#22C55E" /></div>
            <h3 style={{ color: '#1F2937', fontSize: '16px', fontWeight: 700, margin: 0 }}>Access Approved!</h3>
            <p style={{ color: '#6B7280', fontSize: '13px', marginTop: 8 }}>Logging you in now…</p>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          </div>
        )}

        {/* denied */}
        {phase === 'denied' && (
          <div style={{ textAlign: 'center' }}>
            <div style={iconWrap('239,68,68')}><XCircle size={22} color="#EF4444" /></div>
            <h3 style={{ color: '#1F2937', fontSize: '16px', fontWeight: 700, margin: 0 }}>Login Request Denied</h3>
            <p style={{ color: '#6B7280', fontSize: '13px', marginTop: 8, lineHeight: 1.5 }}>
              The active device denied your request.<br />Contact your administrator if needed.
            </p>
            <div style={{ marginTop: 16 }}><ModalBtn variant="ghost" onClick={onClose}>Close</ModalBtn></div>
          </div>
        )}

        {/* expired */}
        {phase === 'expired' && (
          <div style={{ textAlign: 'center' }}>
            <div style={iconWrap('107,114,128')}><Clock size={22} color="#6B7280" /></div>
            <h3 style={{ color: '#1F2937', fontSize: '16px', fontWeight: 700, margin: 0 }}>Request Timed Out</h3>
            <p style={{ color: '#6B7280', fontSize: '13px', marginTop: 8 }}>No response within 5 minutes.</p>
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
              <div style={iconWrap('245,158,11')}><Shield size={22} color="#F59E0B" /></div>
              <h3 style={{ color: '#1F2937', fontSize: '16px', fontWeight: 700, margin: 0 }}>Active Session Detected</h3>
              <p style={{ color: '#6B7280', fontSize: '12.5px', marginTop: 6 }}>
                This account has an active session on another device.
              </p>
            </div>
            <div style={{ background: '#F5F9FF', border: '1px solid #D6E8FF', borderRadius: '12px', padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InfoRow icon={<DeviceIcon ua={sessionInfo.device_info} />} label="Device"      value={deviceLabel} />
                <InfoRow icon={<Globe size={14} />}                         label="IP Address"  value={ipLabel} />
                {sinceLabel && <InfoRow icon={<Clock size={14} />}          label="Last Active" value={timeSince(sessionInfo.last_active) || sinceLabel} />}
                {sessionInfo.ws_connected && (
                  <InfoRow
                    icon={<span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />}
                    label="Status" value="Connected"
                  />
                )}
              </div>
            </div>
            <div style={{ height: 1, background: '#E5E7EB', marginBottom: 14 }} />
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
function Field({ label, htmlFor, icon, error, children }) {
  return (
    <div className="hf-field">
      <label htmlFor={htmlFor}>{label}</label>
      <div className="hf-input-wrap">
        <span className="hf-input-icon">{icon}</span>
        {children}
      </div>
      {error && (
        <p className="hf-field-error">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider({ label = 'OR' }) {
  return (
    <div className="hf-divider">
      <div className="hf-line" />
      <span>{label}</span>
      <div className="hf-line" />
    </div>
  )
}

// ── Screen heading helper ─────────────────────────────────────────────────────
function ScreenHead({ icon, iconBg, iconBorder, title, subtitle }) {
  return (
    <div className="hf-screen-head">
      <div className="hf-screen-icon" style={{ background: iconBg, border: `1px solid ${iconBorder}` }}>
        {icon}
      </div>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

// ── Split-panel shell (background, card, left branding panel, logo) ──────────
function LoginShell({ children }) {
  return (
    <div className="hf-login-page">
      <div className="hf-login-bg" />
      <div className="hf-login-overlay" />

      <div className="hf-login-card">
        {/* Left decorative branding panel */}
        <div className="hf-login-left">
          <div className="hf-dots hf-dots-tl" />
          <div className="hf-blob hf-blob-1" />
          <div className="hf-blob hf-blob-2" />
          <div className="hf-badge-circle">
            <img src="/Hire_Flow_icon-removebg.png" alt="" />
          </div>
          <LeftPanelText />
          <div className="hf-accent-line" />
          <div className="hf-dots hf-dots-bl" />
        </div>

        {/* Right form panel */}
        <div className="hf-login-right">
          <div className="hf-logo-wrap">
            <img src="/Hire_Flow_Logo.png" alt="HireFlow" loading="eager" />
          </div>
          {children}
        </div>
      </div>

      <p className="hf-login-footer">
        © {new Date().getFullYear()} HireFlow · Recruit Smarter, Hire Faster
      </p>
    </div>
  )
}

function LeftPanelText() {
  const { t } = useTranslation()
  return (
    <>
      <h1 className="hf-left-title">{t('login.heading')}</h1>
      <p className="hf-left-desc">{t('login.subheading')}</p>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const Login = () => {
  const { t }       = useTranslation()
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
  const [locationPrompt,    setLocationPrompt]    = useState(null) // { message, busy, denied, retry(loc) }
  // Flips true synchronously the instant Sign In is clicked — independent of
  // Redux's isLoading, which only becomes true once dispatch(login(...)) fires.
  // Without this, any pre-dispatch async work (e.g. the geolocation check
  // below) leaves the button looking unresponsive for however long that takes.
  const [isSubmitting,      setIsSubmitting]      = useState(false)

  const savedEmail    = getSavedEmail()
  const savedPassword = getSavedPassword()
  const [rememberMe, setRememberMeState] = useState(!!savedEmail || getRememberMe())

  const { register, handleSubmit, formState: { errors }, getValues } = useForm({
    defaultValues: { identifier: savedEmail, password: savedPassword },
  })

  useEffect(() => {
    const stored = sessionStorage.getItem('login_error')
    if (stored) { sessionStorage.removeItem('login_error'); setInlineError(stored) }
  }, [])

  // ── Tenant selection ──────────────────────────────────────────────────────
  const performTenantLogin = async (credentials) => {
    const result = await dispatch(loginWithTenant(credentials))
    if (loginWithTenant.fulfilled.match(result)) {
      if (credentials.remember_me) { setSavedEmail(credentials.identifier); setSavedPassword(credentials.password) }
      else                          { removeSavedEmail(); removeSavedPassword() }
      toast.success(t('login.success_toast'))
      setLocationPrompt(null)
    } else if (loginWithTenant.rejected.match(result)) {
      const payload = result.payload
      if (payload?.type === 'LOCATION_REQUIRED') {
        setLocationPrompt({
          message: payload.message,
          busy: false,
          denied: false,
          retry: (loc) => performTenantLogin({ ...credentials, ...loc }),
        })
        return
      }
      if (!(payload && typeof payload === 'object' && payload.type === 'SUBSCRIPTION_EXPIRED')) {
        const isObj = payload && typeof payload === 'object'
        setTenantSelectError(isObj ? (payload.message || 'Login failed. Please try again.') : (typeof payload === 'string' ? payload : 'Login failed. Please try again.'))
      }
    }
  }

  const handleTenantSelect = async (company_id) => {
    if (!tenantSelection) return
    setTenantSelectError('')
    const geo = await getGeolocationIfAlreadyGranted()
    await performTenantLogin({
      identifier:  tenantSelection.identifier,
      password:    tenantSelection.password,
      company_id,
      remember_me: tenantSelection.remember_me,
      ...getStaticDeviceMeta(),
      ...(geo || {}),
    })
  }

  // ── Main login ────────────────────────────────────────────────────────────
  const performLogin = async (credentials) => {
    const result = await dispatch(login(credentials))

    if (login.fulfilled.match(result)) {
      if (result.payload.tenant_selection_required) return
      if (credentials.remember_me) { setSavedEmail(credentials.identifier); setSavedPassword(credentials.password) }
      else                          { removeSavedEmail(); removeSavedPassword() }
      toast.success(t('login.success_toast'))
      setLocationPrompt(null)
    } else if (login.rejected.match(result)) {
      const payload = result.payload
      if (payload?.type === 'LOCATION_REQUIRED') {
        setLocationPrompt({
          message: payload.message,
          busy: false,
          denied: false,
          retry: (loc) => performLogin({ ...credentials, ...loc }),
        })
      } else if (payload?.type === 'ACTIVE_SESSION') {
        setActiveSessionData({ identifier: credentials.identifier, password: credentials.password, sessionInfo: payload.session_info || {}, companyId: payload.company_id || null })
        dispatch(clearError())
      } else if (payload?.email_not_verified) {
        setEmailNotVerified({ email: payload.email, message: payload.message })
      } else if (payload?.type === 'SUBSCRIPTION_EXPIRED') {
        // Redux already set subscriptionExpired
      } else {
        const isObj = payload && typeof payload === 'object'
        setLoginFailed({
          type:    isObj ? payload.type : null,
          message: isObj ? (payload.message || 'Login failed. Please try again.') : (typeof payload === 'string' ? payload : 'Login failed. Please try again.'),
        })
        dispatch(clearError())
      }
    }
  }

  const onSubmit = async (data) => {
    if (isSubmitting) return // prevent double-submit from rapid repeat clicks
    setIsSubmitting(true)
    setLoginFailed(null); setEmailNotVerified(null)
    setResendSent(false); setInlineError(''); setLocationPrompt(null)

    try {
      const geo = await getGeolocationIfAlreadyGranted()
      await performLogin({ ...data, remember_me: rememberMe, ...getStaticDeviceMeta(), ...(geo || {}) })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAllowLocation = async () => {
    if (!locationPrompt) return
    setLocationPrompt(p => (p ? { ...p, busy: true, denied: false } : p))
    try {
      const loc = await requestGeolocation()
      await locationPrompt.retry(loc)
    } catch {
      setLocationPrompt(p => (p ? { ...p, busy: false, denied: true } : p))
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
      <LoginShell>
        <div className="hf-anim-slideup">
          <ScreenHead
            icon={<Building2 size={22} color="#1677FF" />}
            iconBg="rgba(22,119,255,0.11)" iconBorder="rgba(22,119,255,0.26)"
            title="Select Company"
            subtitle="Your credentials match multiple companies. Choose one to continue."
          />

          {tenantSelectError && (
            <div className="hf-alert hf-alert-red" style={{ marginBottom: 14 }}>
              <p style={{ color: '#EF4444', fontSize: '13px', margin: 0 }}>{tenantSelectError}</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {tenantSelection.tenants.map((tn) => (
              <button
                key={tn.company_id}
                onClick={() => handleTenantSelect(tn.company_id)}
                disabled={isLoading}
                className="hf-tenant-item"
              >
                <div>
                  <p style={{ color: '#1F2937', fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{tn.company_name}</p>
                  <p style={{ color: '#9CA3AF', fontSize: '12px', margin: 0, textTransform: 'capitalize' }}>{tn.role}</p>
                </div>
                <ArrowRight size={15} style={{ color: '#9CA3AF', flexShrink: 0 }} />
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center' }}>
            <button onClick={() => dispatch(clearTenantSelection())} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
              ← Back to Login
            </button>
          </div>

          {locationPrompt && (
            <ModalPortal isOpen>
              <LocationRequiredModal
                message={locationPrompt.message}
                busy={locationPrompt.busy}
                denied={locationPrompt.denied}
                onAllow={handleAllowLocation}
                onCancel={() => setLocationPrompt(null)}
              />
            </ModalPortal>
          )}
        </div>
      </LoginShell>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Account not found
  // ─────────────────────────────────────────────────────────────────────────
  if (loginFailed) {
    const { type: failType, message: failMessage } = loginFailed
    // Classify off an explicit type tag from the thunk rather than sniffing the
    // message text for words like "server" — that heuristic could misfire (or
    // fail to fire) whenever wording changed, and had no way to recognise a
    // geofence/location denial as anything other than a generic login failure.
    const isLocationIssue   = failType === 'LOCATION_DENIED'
    const isConnectionIssue = failType === 'CONNECTION_ERROR' || failType === 'SERVER_ERROR' || failType === 'API_CONFIG_ERROR'
    const isAmber = isLocationIssue || isConnectionIssue

    return (
      <LoginShell>
        <div className="hf-anim-slideup">
          <ScreenHead
            icon={isLocationIssue
              ? <Globe size={22} color="#F59E0B" />
              : isConnectionIssue
                ? <AlertCircle size={22} color="#F59E0B" />
                : <UserX size={22} color="#EF4444" />}
            iconBg={isAmber ? 'rgba(245,158,11,0.11)' : 'rgba(239,68,68,0.11)'}
            iconBorder={isAmber ? 'rgba(245,158,11,0.26)' : 'rgba(239,68,68,0.26)'}
            title={isLocationIssue ? 'Location Permission Required' : isConnectionIssue ? 'Connection Problem' : 'Login Failed'}
            subtitle={isLocationIssue
              ? 'This organization requires location verification before signing in.'
              : isConnectionIssue
                ? 'Could not reach the server. Please try again.'
                : 'We couldn\'t find an account matching your details.'}
          />
          <div className={`hf-alert ${isAmber ? 'hf-alert-amber' : 'hf-alert-red'}`} style={{ marginBottom: 18 }}>
            <p style={{ color: isAmber ? '#B45309' : '#B91C1C', fontWeight: '600', fontSize: '13px', margin: '0 0 5px' }}>{failMessage}</p>
            {isLocationIssue && (
              <p style={{ color: '#B45309', fontSize: '12px', margin: 0, opacity: 0.85 }}>
                Please allow browser location access and try again.
              </p>
            )}
            {!isLocationIssue && !isConnectionIssue && (
              <p style={{ color: '#B91C1C', fontSize: '12px', margin: 0, opacity: 0.85 }}>
                Double-check your email / mobile number and password, or create a new account.
              </p>
            )}
          </div>
          {!isLocationIssue && !isConnectionIssue && (
            <Link to="/register" style={{ textDecoration: 'none', display: 'block' }}>
              <button className="hf-btn-primary">Create New Account</button>
            </Link>
          )}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => setLoginFailed(null)} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>← Back to Login</button>
          </div>
        </div>
      </LoginShell>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Email not verified
  // ─────────────────────────────────────────────────────────────────────────
  if (emailNotVerified) {
    return (
      <LoginShell>
        <div className="hf-anim-slideup">
          <ScreenHead
            icon={<Mail size={22} color="#F59E0B" />}
            iconBg="rgba(245,158,11,0.11)" iconBorder="rgba(245,158,11,0.26)"
            title="Verify Your Email"
            subtitle="Your account is not yet verified. Check your inbox for the verification link."
          />
          <div className="hf-alert hf-alert-amber" style={{ marginBottom: 18 }}>
            <p style={{ color: '#B45309', fontSize: '13px', margin: '0 0 4px' }}>{emailNotVerified.message}</p>
            {emailNotVerified.email && (
              <p style={{ color: '#B45309', fontSize: '12px', margin: 0, opacity: 0.85 }}>
                Email: <strong style={{ color: '#B45309' }}>{emailNotVerified.email}</strong>
              </p>
            )}
          </div>
          {!resendSent ? (
            <button
              onClick={handleResendVerification}
              disabled={resendLoading}
              className="hf-btn-primary"
              style={{ marginBottom: 10 }}
            >
              {resendLoading ? <><Spinner inverted /> Sending…</> : <><RefreshCw size={15} /> Resend Verification Email</>}
            </button>
          ) : (
            <div className="hf-alert hf-alert-green" style={{ marginBottom: 10, textAlign: 'center' }}>
              <CheckCircle size={18} style={{ color: '#22C55E', display: 'block', margin: '0 auto 6px' }} />
              <p style={{ color: '#15803D', fontSize: '13px', margin: 0 }}>
                Verification email sent! Check your inbox.
              </p>
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={() => setEmailNotVerified(null)} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>← Back to Login</button>
          </div>
        </div>
      </LoginShell>
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
        <LoginShell>
          <div className="hf-anim-slideup">
            <ScreenHead
              icon={<Calendar size={22} color="#F59E0B" />}
              iconBg="rgba(245,158,11,0.11)" iconBorder="rgba(245,158,11,0.26)"
              title="Subscription Expired"
              subtitle={expiryLabel ? `Expired on ${expiryLabel}` : undefined}
            />
            <div className="hf-alert hf-alert-amber" style={{ marginBottom: 18 }}>
              <p style={{ color: '#B45309', fontSize: '13px', margin: '0 0 6px' }}>{subscriptionExpired.message}</p>
              <p style={{ color: '#B45309', fontSize: '12px', margin: 0, opacity: 0.85 }}>
                Please contact the platform administrator to renew your seller subscription.
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => dispatch(clearError())} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>← Back to Login</button>
            </div>
          </div>
        </LoginShell>
      )
    }

    if (subscriptionExpired.isOwner) {
      return (
        <LoginShell>
          <div className="hf-anim-slideup">
            <ScreenHead
              icon={<Calendar size={22} color="#F59E0B" />}
              iconBg="rgba(245,158,11,0.11)" iconBorder="rgba(245,158,11,0.26)"
              title="Subscription Expired"
              subtitle={expiryLabel ? `Expired on ${expiryLabel}` : undefined}
            />
            <div className="hf-alert hf-alert-amber" style={{ marginBottom: 18 }}>
              <p style={{ color: '#B45309', fontSize: '13px', margin: 0 }}>{subscriptionExpired.message}</p>
            </div>
            <button
              onClick={() => navigate('/upgrade-plan', { state: subscriptionExpired })}
              className="hf-btn-primary"
              style={{ marginBottom: 10 }}
            >
              <ArrowRight size={15} /> Manage Subscription
            </button>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => dispatch(clearError())} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>← Back to Login</button>
            </div>
          </div>
        </LoginShell>
      )
    }

    return (
      <LoginShell>
        <div className="hf-anim-slideup">
          <ScreenHead
            icon={<XCircle size={22} color="#EF4444" />}
            iconBg="rgba(239,68,68,0.11)" iconBorder="rgba(239,68,68,0.26)"
            title="Access Unavailable"
          />
          <div className="hf-alert hf-alert-red" style={{ marginBottom: 18 }}>
            <p style={{ color: '#B91C1C', fontWeight: '600', fontSize: '13px', margin: '0 0 5px' }}>
              Your company subscription has expired.
            </p>
            {expiryLabel && (
              <p style={{ color: '#B91C1C', fontSize: '12px', margin: '0 0 4px', opacity: 0.8 }}>
                Expired on: <span style={{ color: '#B91C1C', fontWeight: '500' }}>{expiryLabel}</span>
              </p>
            )}
            <p style={{ color: '#B91C1C', fontSize: '12px', margin: 0, opacity: 0.85 }}>
              Please contact your company administrator to renew the subscription.
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => dispatch(clearError())} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>← Back to Login</button>
          </div>
        </div>
      </LoginShell>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: Main login form
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <LoginShell>
      <div className="hf-anim-slideup" style={{ animationDelay: '0.05s' }}>

        {/* Login-screen announcements (public — no auth required) */}
        <LoginAnnouncement />

        {/* Inline error from api.js interceptor */}
        {inlineError && (
          <div className="hf-alert hf-alert-red" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
            <AlertCircle size={15} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: '#B91C1C', fontSize: '13px', fontWeight: '500', margin: 0 }}>{inlineError}</p>
          </div>
        )}

        {/* Divider with profile icon */}
        <div className="hf-profile-divider">
          <div className="hf-line" />
          <div className="hf-profile-circle"><User size={16} /></div>
          <div className="hf-line" />
        </div>

        {/* Secondary CTAs */}
        <Link to="/register?mode=trial" style={{ textDecoration: 'none', display: 'block' }}>
          <button className="hf-btn-outline">
            <Rocket size={15} /> Start Free Trial
          </button>
        </Link>
        <Link to="/register?mode=subscription" style={{ textDecoration: 'none', display: 'block' }}>
          <button className="hf-btn-outline">
            <Crown size={15} /> Buy Subscription
          </button>
        </Link>

        {/* OR divider */}
        <Divider label="OR" />

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>

          {/* Email / Mobile */}
          <Field
            label={t('login.identifier_label')}
            htmlFor="identifier"
            icon={<Mail size={16} />}
            error={errors.identifier?.message}
          >
            <input
              id="identifier"
              placeholder={t('login.identifier_placeholder')}
              autoComplete="email"
              className="hf-input"
              {...register('identifier', {
                required: 'This field is required',
                minLength: { value: 3, message: 'Minimum 3 characters required' },
              })}
            />
          </Field>

          {/* Password */}
          <Field
            label={t('login.password_label')}
            htmlFor="password"
            icon={<Lock size={16} />}
            error={errors.password?.message}
          >
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('login.password_placeholder')}
              autoComplete="current-password"
              className="hf-input hf-input-pr"
              {...register('password', { required: 'Password is required' })}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(v => !v)}
              className="hf-input-eye"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </Field>

          {/* Remember me + forgot password */}
          <div className="hf-row-between">
            <label className="hf-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMeState(e.target.checked)}
              />
              <span>{t('login.remember_me')}</span>
            </label>
            <a
              href="/forgot-password"
              onClick={(e) => { e.preventDefault(); navigate('/forgot-password', { state: { email: getValues('identifier') } }) }}
              className="hf-forgot-link"
            >
              {t('login.forgot_password')}
            </a>
          </div>

          {/* Sign In */}
          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="hf-btn-primary"
          >
            {(isSubmitting || isLoading)
              ? <><Spinner inverted /> {t('login.signing_in')}</>
              : <>{t('login.sign_in')} <ArrowRight size={17} /></>
            }
          </button>
        </form>

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

        {/* Location-required retry modal (only shown for tenants with geo-fence enabled) */}
        {locationPrompt && (
          <ModalPortal isOpen>
            <LocationRequiredModal
              message={locationPrompt.message}
              busy={locationPrompt.busy}
              denied={locationPrompt.denied}
              onAllow={handleAllowLocation}
              onCancel={() => setLocationPrompt(null)}
            />
          </ModalPortal>
        )}
      </div>
    </LoginShell>
  )
}

export default Login
