import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  Mail, ArrowLeft, CheckCircle, Building2, Users, ChevronRight, AlertCircle,
} from 'lucide-react'
import authService from '../../services/authService'
import './Login.css'

// Steps:
//   "email"           → enter email
//   "scope_selection" → multiple companies: pick "specific" or "all"
//   "company_list"    → pick which company when scope = "specific"
//   "submitted"       → check your inbox

// ── Spinner (matches Login.jsx) ───────────────────────────────────────────────
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

// ── Shared field wrapper (matches Login.jsx) ──────────────────────────────────
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

// ── Screen heading helper (matches Login.jsx) ─────────────────────────────────
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

// ── Split-panel shell — identical background/card/left-panel/logo as Login ───
function AuthShell({ children }) {
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
          <h1 className="hf-left-title">Reset your password</h1>
          <p className="hf-left-desc">We'll help you get back into your account securely.</p>
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

const ForgotPassword = () => {
  const location = useLocation()
  const _stateVal = location.state?.email || ''
  const prefillEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(_stateVal) ? _stateVal : ''

  const [step, setStep] = useState('email')
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState(prefillEmail)
  const [companies, setCompanies] = useState([])

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: prefillEmail },
  })

  // Step 1: email entry
  const onEmailSubmit = async (data) => {
    setIsLoading(true)
    const _email = data.email.trim().toLowerCase()
    setEmail(_email)
    try {
      const res = await authService.lookupForgotPasswordScope(_email)
      const list = res.data?.companies ?? []

      if (list.length > 1) {
        setCompanies(list)
        setStep('scope_selection')
      } else {
        // 0 companies (super admin / not found) or exactly 1 — send directly
        const cid = list.length === 1 ? list[0].company_id : null
        await authService.forgotPassword(_email, cid ? 'single' : 'auto', cid)
        setStep('submitted')
        toast.success('Reset instructions sent!')
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2 → "all" path
  const onResetAll = async () => {
    setIsLoading(true)
    try {
      await authService.forgotPassword(email, 'all')
      setStep('submitted')
      toast.success('Reset instructions sent!')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3: pick a company
  const onSelectCompany = async (companyId) => {
    setIsLoading(true)
    try {
      await authService.forgotPassword(email, 'single', companyId)
      setStep('submitted')
      toast.success('Reset instructions sent!')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  if (step === 'submitted') {
    return (
      <AuthShell>
        <div className="hf-anim-slideup">
          <ScreenHead
            icon={<CheckCircle size={22} color="#22C55E" />}
            iconBg="rgba(34,197,94,0.11)" iconBorder="rgba(34,197,94,0.26)"
            title="Check your email"
            subtitle="We've sent password reset instructions to your email address."
          />
          <Link to="/login" style={{ textDecoration: 'none', display: 'block' }}>
            <button className="hf-btn-outline">
              <ArrowLeft size={15} /> Back to login
            </button>
          </Link>
        </div>
      </AuthShell>
    )
  }

  // ── Company list (step 3) ─────────────────────────────────────────────────
  if (step === 'company_list') {
    return (
      <AuthShell>
        <div className="hf-anim-slideup">
          <ScreenHead
            icon={<Building2 size={22} color="#1677FF" />}
            iconBg="rgba(22,119,255,0.11)" iconBorder="rgba(22,119,255,0.26)"
            title="Select Company"
            subtitle="Choose the company whose password you want to reset."
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {companies.map((c) => (
              <button
                key={c.company_id}
                onClick={() => onSelectCompany(c.company_id)}
                disabled={isLoading}
                className="hf-tenant-item"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(22,119,255,0.11)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Building2 size={16} color="#1677FF" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: '#1F2937', fontWeight: '600', fontSize: '14px', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.company_name}</p>
                    <p style={{ color: '#9CA3AF', fontSize: '12px', margin: 0, textTransform: 'capitalize' }}>{c.user_type}</p>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#9CA3AF', flexShrink: 0 }} />
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center' }}>
            <button onClick={() => setStep('scope_selection')} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
              ← Back
            </button>
          </div>
        </div>
      </AuthShell>
    )
  }

  // ── Scope selection (step 2) ──────────────────────────────────────────────
  if (step === 'scope_selection') {
    return (
      <AuthShell>
        <div className="hf-anim-slideup">
          <ScreenHead
            icon={<Users size={22} color="#1677FF" />}
            iconBg="rgba(22,119,255,0.11)" iconBorder="rgba(22,119,255,0.26)"
            title="Select Password Reset Scope"
            subtitle={`This email is associated with ${companies.length} companies. Choose how you want to reset your password.`}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            <button
              onClick={() => setStep('company_list')}
              disabled={isLoading}
              className="hf-tenant-item"
              style={{ alignItems: 'flex-start', padding: '14px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                <div style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(22,119,255,0.11)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  <Building2 size={16} color="#1677FF" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: '#1F2937', fontWeight: '600', fontSize: '14px', margin: '0 0 3px' }}>Reset for a specific company</p>
                  <p style={{ color: '#9CA3AF', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                    Only the selected company's password will change. Others remain unchanged.
                  </p>
                </div>
              </div>
              <ChevronRight size={15} style={{ color: '#9CA3AF', flexShrink: 0, marginTop: 2 }} />
            </button>

            <button
              onClick={onResetAll}
              disabled={isLoading}
              className="hf-tenant-item"
              style={{ alignItems: 'flex-start', padding: '14px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                <div style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(22,119,255,0.11)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  <Users size={16} color="#1677FF" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: '#1F2937', fontWeight: '600', fontSize: '14px', margin: '0 0 3px' }}>Reset for all companies</p>
                  <p style={{ color: '#9CA3AF', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                    The same new password will apply to all {companies.length} companies.
                  </p>
                </div>
              </div>
              {isLoading
                ? <span style={{ marginTop: 2, flexShrink: 0 }}><Spinner /></span>
                : <ChevronRight size={15} style={{ color: '#9CA3AF', flexShrink: 0, marginTop: 2 }} />
              }
            </button>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button onClick={() => setStep('email')} className="hf-btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
              ← Back
            </button>
          </div>
        </div>
      </AuthShell>
    )
  }

  // ── Email form (step 1) ───────────────────────────────────────────────────
  return (
    <AuthShell>
      <div className="hf-anim-slideup" style={{ animationDelay: '0.05s' }}>
        <ScreenHead
          icon={<Mail size={22} color="#1677FF" />}
          iconBg="rgba(22,119,255,0.11)" iconBorder="rgba(22,119,255,0.26)"
          title="Forgot password?"
          subtitle="No worries, we'll send you reset instructions."
        />

        <form onSubmit={handleSubmit(onEmailSubmit)}>
          <Field
            label="Email Address"
            htmlFor="email"
            icon={<Mail size={16} />}
            error={errors.email?.message}
          >
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              autoComplete="email"
              className="hf-input"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address',
                },
              })}
            />
          </Field>

          <button
            type="submit"
            disabled={isLoading}
            className="hf-btn-primary"
            style={{ marginTop: 4 }}
          >
            {isLoading ? <><Spinner inverted /> Sending…</> : <>Send Reset Link</>}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link to="/login" className="hf-btn-ghost" style={{ justifyContent: 'center' }}>
            <ArrowLeft size={14} /> Back to login
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}

export default ForgotPassword
