import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import {
  Building2,
  User,
  CreditCard,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Globe,
  Mail,
  Lock,
  MapPin,
  Phone,
  Briefcase,
  Check,
  Sparkles,
  Monitor,
  Smartphone,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button, Input } from '../../components/common'
import authService from '../../services/authService'
import planService from '../../services/planService'
import { formatCurrency } from '../../utils/format'
import {
  COUNTRY_CODES,
  PHONE_LENGTHS,
  COUNTRIES,
  STATES_BY_COUNTRY,
  DISTRICTS_BY_STATE,
} from '../../data/locationData'

// ─── PhoneComboInput — defined OUTSIDE Register so its identity is stable ─────
const PhoneComboInput = ({ fieldName, label, codeValue, onCodeChange, register, errors, placeholder = '98765 43210', required = true }) => {
  const expectedLen = PHONE_LENGTHS[codeValue]
  return (
    <div className="w-full">
      <label className="input-label">
        {label}
        {required && <span className="text-danger-500 ml-1">*</span>}
      </label>
      <div
        className={clsx(
          'flex rounded-lg overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500',
          errors[fieldName] ? 'border border-red-500' : 'border border-slate-400'
        )}
      >
        <select
          value={codeValue}
          onChange={e => onCodeChange(e.target.value)}
          className="shrink-0 cursor-pointer focus:outline-none"
          style={{
            width: '120px',
            background: '#e2e8f0',
            color: '#0f172a',
            borderRight: '1px solid #94a3b8',
            borderRadius: 0,
            padding: '10px 6px 10px 10px',
            fontSize: '0.8125rem',
          }}
        >
          {COUNTRY_CODES.map(c => (
            <option key={c.code} value={c.code} style={{ background: '#fff', color: '#0f172a' }}>
              {c.label} — {c.country}
            </option>
          ))}
        </select>
        <input
          type="tel"
          placeholder={placeholder}
          className="focus:outline-none"
          style={{
            flex: 1,
            background: '#e2e8f0',
            color: '#0f172a',
            borderRadius: 0,
            padding: '10px 12px',
            fontSize: '0.875rem',
            minWidth: 0,
          }}
          {...register(fieldName, {
            required: `${label} is required`,
            pattern: {
              value: /^\d{7,15}$/,
              message: expectedLen
                ? `Enter ${expectedLen} digits for ${codeValue}`
                : 'Enter 7–15 digits (no spaces)',
            },
          })}
        />
      </div>
      {errors[fieldName] && (
        <p className="input-error-text flex items-center gap-1 mt-1">
          <AlertCircle className="w-3 h-3" />
          {errors[fieldName].message}
        </p>
      )}
    </div>
  )
}

// ─── Step definitions (subscription only) ────────────────────────────────────
const SUBSCRIPTION_STEPS = [
  { id: 1, title: 'Company Setup', icon: Building2 },
  { id: 2, title: 'Admin Setup',   icon: User },
  { id: 3, title: 'Subscription',  icon: CreditCard },
  { id: 4, title: 'Finish',        icon: CheckCircle },
]


// ═══════════════════════════════════════════════════════════════════════════════
// TRIAL SETUP — Single-page form
// ═══════════════════════════════════════════════════════════════════════════════

const TrialSetupForm = () => {
  const navigate  = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(null)           // holds success response data
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)

  // "No website" checkbox — use a ref so validate closure reads the latest value
  const [noWebsite, setNoWebsite] = useState(false)
  const noWebsiteRef = useRef(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      company_name:     '',
      company_contact:  '',
      website:          '',
      person_name:      '',
      username:         '',
      email:            '',
      contact_number:   '',
      password:         '',
      confirm_password: '',
      designation:      'Select',   // forces user to pick
    },
  })

  const password = watch('password')

  const handleNoWebsiteChange = (checked) => {
    noWebsiteRef.current = checked
    setNoWebsite(checked)
    if (checked) {
      setValue('website', '')
      clearErrors('website')
    }
  }

  const onSubmit = async (data) => {
    // Front-end guard: designation must not be "Select"
    if (!data.designation || data.designation === 'Select') {
      toast.error('Please select a designation — Owner or Admin.')
      return
    }

    setIsLoading(true)
    try {
      const payload = {
        company_name:     data.company_name.trim(),
        company_contact:  data.company_contact?.trim() || null,
        website:          noWebsite ? null : (data.website?.trim() || null),
        no_website:       noWebsite,
        person_name:      data.person_name.trim(),
        username:         data.username.trim().toLowerCase(),
        email:            data.email.trim().toLowerCase(),
        contact_number:   data.contact_number.trim().replace(/\D/g, ''),
        password:         data.password,
        confirm_password: data.confirm_password,
        designation:      data.designation,
      }

      const response = await authService.trialSetup(payload)
      setDone(response.data)
      toast.success('Trial account created successfully!')
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Registration failed. Please try again.'
      toast.error(typeof msg === 'string' ? msg : 'Registration failed.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-surface-50 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-lg text-white">C</div>
            <div>
              <h1 className="font-bold text-lg text-surface-900">CRM Platform</h1>
              <p className="text-xs text-surface-500">Recruitment & Partner Management</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-surface-200 p-10 text-center animate-fade-in">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900 mb-2">Trial Activated!</h2>
            <p className="text-surface-500 mb-6 text-sm">
              Your company has been registered and your trial is now active.
              Explore all features free for the next 14 days.
            </p>
            <div className="bg-accent-50 border border-accent-100 rounded-xl p-4 mb-6 text-sm text-accent-800">
              You can now sign in using the credentials you just created.
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-sm"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,.3)' }}
            >
              Go to Login <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Field helpers ─────────────────────────────────────────────────────────
  const fieldClass = (hasError) =>
    clsx(
      'w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors',
      'focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500',
      hasError
        ? 'border-red-400 bg-red-50/30 text-surface-900'
        : 'border-slate-300 bg-white text-surface-900'
    )

  const ErrMsg = ({ field }) =>
    errors[field] ? (
      <p className="flex items-center gap-1 mt-1 text-xs text-red-500">
        <AlertCircle className="w-3 h-3 shrink-0" />
        {errors[field].message}
      </p>
    ) : null

  const Label = ({ children, required: req }) => (
    <label className="block text-sm font-medium text-surface-700 mb-1">
      {children}
      {req && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-lg text-white">C</div>
          <div>
            <h1 className="font-bold text-lg text-surface-900">CRM Platform</h1>
            <p className="text-xs text-surface-500">Recruitment & Partner Management</p>
          </div>
        </div>
        <Link to="/login" className="text-sm text-accent-600 hover:text-accent-700 font-medium">
          Already have an account? Sign in
        </Link>
      </div>

      {/* Main content */}
      <div className="flex justify-center py-10 px-4">
        <div className="w-full max-w-2xl animate-fade-in">

          {/* Page title */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-surface-900">Start Your Free Trial</h2>
            <p className="text-surface-500 text-sm mt-1">14 days free — no payment required</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

            {/* ── SECTION 1: Company Information ─────────────────────────── */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-accent-600" />
                </div>
                <h3 className="font-semibold text-surface-900">Company Information</h3>
              </div>

              <div className="space-y-4">
                {/* Company Name */}
                <div>
                  <Label required>Company Name</Label>
                  <input
                    type="text"
                    placeholder="Your company name"
                    className={fieldClass(errors.company_name)}
                    {...register('company_name', {
                      required: 'Company name is required',
                      minLength: { value: 2, message: 'Minimum 2 characters' },
                    })}
                  />
                  <ErrMsg field="company_name" />
                </div>

                {/* Company Contact */}
                <div>
                  <Label>Company Contact <span className="text-surface-400 font-normal text-xs">(optional)</span></Label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    className={fieldClass(errors.company_contact)}
                    {...register('company_contact')}
                  />
                  <ErrMsg field="company_contact" />
                </div>

                {/* Website */}
                <div>
                  <Label>Website <span className="text-surface-400 font-normal text-xs">(optional)</span></Label>
                  <input
                    type="url"
                    placeholder="https://www.yourcompany.com"
                    disabled={noWebsite}
                    className={clsx(fieldClass(errors.website), noWebsite && 'opacity-50 cursor-not-allowed bg-surface-100')}
                    {...register('website', {
                      validate: (value) => {
                        if (noWebsiteRef.current) return true
                        if (!value || !value.trim()) return true  // optional
                        const urlPattern = /^(https?:\/\/)?(www\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/
                        return urlPattern.test(value.trim()) || 'Enter a valid URL (e.g. https://www.example.com)'
                      },
                    })}
                  />
                  <ErrMsg field="website" />
                  <label className="mt-2 inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={noWebsite}
                      onChange={e => handleNoWebsiteChange(e.target.checked)}
                      className="w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                      style={{ accentColor: '#6366f1' }}
                    />
                    <span className="text-sm text-surface-600">I don't have a website</span>
                  </label>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: User Information ────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-surface-900">Your Account</h3>
              </div>

              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <Label required>Full Name</Label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    className={fieldClass(errors.person_name)}
                    {...register('person_name', {
                      required: 'Full name is required',
                      minLength: { value: 2, message: 'Minimum 2 characters' },
                    })}
                  />
                  <ErrMsg field="person_name" />
                </div>

                {/* Username + Email side-by-side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label required>Username</Label>
                    <input
                      type="text"
                      placeholder="johndoe"
                      className={fieldClass(errors.username)}
                      {...register('username', {
                        required: 'Username is required',
                        minLength: { value: 3, message: 'Minimum 3 characters' },
                        pattern: {
                          value: /^[a-zA-Z0-9_]+$/,
                          message: 'Letters, numbers and underscores only',
                        },
                      })}
                    />
                    <ErrMsg field="username" />
                  </div>

                  <div>
                    <Label required>Email</Label>
                    <input
                      type="email"
                      placeholder="john@company.com"
                      className={fieldClass(errors.email)}
                      {...register('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                      })}
                    />
                    <ErrMsg field="email" />
                  </div>
                </div>

                {/* Contact Number */}
                <div>
                  <Label required>Contact Number</Label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile number (e.g. 9876543210)"
                    className={fieldClass(errors.contact_number)}
                    {...register('contact_number', {
                      required: 'Contact number is required',
                      pattern: {
                        value: /^[6-9]\d{9}$/,
                        message: 'Enter a valid 10-digit Indian mobile starting with 6–9',
                      },
                    })}
                  />
                  <ErrMsg field="contact_number" />
                </div>

                {/* Password + Confirm Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label required>Password</Label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min. 8 characters"
                        className={clsx(fieldClass(errors.password), 'pr-10')}
                        {...register('password', {
                          required: 'Password is required',
                          minLength: { value: 8, message: 'Minimum 8 characters' },
                          pattern: {
                            value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                            message: 'Must include uppercase, lowercase and a number',
                          },
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <ErrMsg field="password" />
                  </div>

                  <div>
                    <Label required>Confirm Password</Label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        className={clsx(fieldClass(errors.confirm_password), 'pr-10')}
                        {...register('confirm_password', {
                          required: 'Please confirm your password',
                          validate: value =>
                            value === password || 'Passwords do not match',
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <ErrMsg field="confirm_password" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── SECTION 3: Designation ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="font-semibold text-surface-900">Designation</h3>
              </div>

              <div>
                <Label required>Select Your Role</Label>
                <select
                  className={clsx(
                    fieldClass(errors.designation),
                    'appearance-none cursor-pointer'
                  )}
                  {...register('designation', {
                    validate: value =>
                      (value && value !== 'Select') ||
                      'Please select a designation — Owner or Admin.',
                  })}
                >
                  <option value="Select" disabled>— Select —</option>
                  <option value="Owner">Owner</option>
                  <option value="Admin">Admin</option>
                </select>
                <ErrMsg field="designation" />

                {/* Access level explanation */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                    <p className="text-xs font-semibold text-surface-800 mb-1">Owner</p>
                    <p className="text-xs text-surface-500">Full system access — manages everything including billing, users and all settings.</p>
                  </div>
                  <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                    <p className="text-xs font-semibold text-surface-800 mb-1">Admin</p>
                    <p className="text-xs text-surface-500">Admin-level access — manages users, recruitment and configuration, excluding billing.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Submit ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 pb-4">
              <Link to="/login" className="text-sm text-surface-500 hover:text-surface-700 font-medium flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
              </Link>

              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-semibold text-white text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  boxShadow: '0 0 20px rgba(99,102,241,.35)',
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  minWidth: '180px',
                }}
              >
                {isLoading ? (
                  <>
                    <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                    Creating account…
                  </>
                ) : (
                  <>Activate Free Trial <CheckCircle className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION REGISTER — multi-step (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

const SubscriptionRegister = () => {
  const navigate = useNavigate()
  const steps = SUBSCRIPTION_STEPS
  const maxFormStep = steps.length - 1

  const [currentStep, setCurrentStep]           = useState(1)
  const [isLoading, setIsLoading]               = useState(false)
  const [plans, setPlans]                       = useState([])
  const [selectedPlan, setSelectedPlan]         = useState(null)
  const [billingCycle, setBillingCycle]         = useState('monthly')
  const [userCount, setUserCount]               = useState(3)
  const [registrationResult, setRegistrationResult] = useState(null)
  const [companyPhoneCode, setCompanyPhoneCode] = useState('+91')
  const [ownerMobileCode, setOwnerMobileCode]   = useState('+91')
  const [noWebsite, setNoWebsite]               = useState(false)
  const noWebsiteRef                            = useRef(false)
  const [selectedCountry, setSelectedCountry]   = useState('India')
  const [selectedState, setSelectedState]       = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [countryError, setCountryError]         = useState('')
  const [stateError, setStateError]             = useState('')

  const availableStates    = (STATES_BY_COUNTRY[selectedCountry] || []).map(s => ({ value: s, label: s }))
  const availableDistricts = (DISTRICTS_BY_STATE[selectedState]  || []).map(d => ({ value: d, label: d }))

  const {
    register, handleSubmit, watch, trigger, setValue, getValues, clearErrors,
    formState: { errors },
  } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      company_name:      '',
      company_email:     '',
      location:          '',
      website:           '',
      gst_number:        '',
      phone:             '',
      street:            '',
      city:              '',
      zip_code:          '',
      owner_name:        '',
      owner_email:       '',
      owner_mobile:      '',
      owner_username:    '',
      owner_designation: 'Select',
      owner_password:    '',
      confirm_password:  '',
    },
  })

  const password = watch('owner_password')

  useEffect(() => { clearErrors() }, [currentStep]) // eslint-disable-line

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response  = await planService.getPlans()
        const seen      = new Set()
        const unique    = (response.data.plans || []).filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
        const paidPlans = unique.filter(p => !p.is_trial)
        setPlans(paidPlans)
        const popular = paidPlans.find(p => p.is_popular) || paidPlans[0]
        if (popular) setSelectedPlan(popular)
      } catch { toast.error('Failed to load plans') }
    }
    fetchPlans()
  }, [])

  const handleNoWebsiteChange = (checked) => {
    noWebsiteRef.current = checked
    setNoWebsite(checked)
    if (checked) { setValue('website', ''); clearErrors('website') } else { trigger('website') }
  }

  const handleCountryChange = (e) => { setSelectedCountry(e.target.value); setSelectedState(''); setSelectedDistrict(''); setCountryError(''); setStateError('') }
  const handleStateChange   = (e) => { setSelectedState(e.target.value); setSelectedDistrict(''); setStateError('') }

  const validateStep = async (step) => {
    switch (step) {
      case 1: {
        const fields    = ['company_name', 'website', 'phone', 'city', 'zip_code']
        const formValid = await trigger(fields)
        let locValid    = true
        if (!selectedCountry) { setCountryError('Country is required'); locValid = false } else setCountryError('')
        if (!selectedState)   { setStateError('State is required');    locValid = false } else setStateError('')
        return formValid && locValid
      }
      case 2: {
        const fields    = ['owner_name', 'owner_email', 'owner_mobile', 'owner_username', 'owner_password', 'confirm_password']
        const formValid = await trigger(fields)
        const desig     = getValues('owner_designation')
        if (!desig || desig === 'Select') { toast.error('Please select a designation — Owner or Admin.'); return false }
        return formValid
      }
      case 3:
        if (!selectedPlan) { toast.error('Please select a plan'); return false }
        return true
      default: return true
    }
  }

  const nextStep = async () => {
    if (await validateStep(currentStep)) { clearErrors(); setCurrentStep(p => Math.min(p + 1, steps.length)) }
  }
  const prevStep = () => { clearErrors(); setCurrentStep(p => Math.max(p - 1, 1)) }

  const handleFinish = async () => {
    if (await validateStep(currentStep)) await onSubmit(getValues())
  }

  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      const phone        = `${companyPhoneCode}${data.phone.replace(/\D/g, '')}`
      const owner_mobile = `${ownerMobileCode}${data.owner_mobile.replace(/\D/g, '')}`
      const website      = noWebsite ? '' : data.website
      const payload      = {
        ...data,
        phone, owner_mobile,
        country:  selectedCountry,
        state:    selectedState,
        district: selectedDistrict || undefined,
        website,
        plan_id:       selectedPlan.id,
        billing_cycle: billingCycle,
        user_count:    Math.max(userCount, 1),
      }

      const response = await authService.register(payload)
      setRegistrationResult(response.data)

      if (response.data.requires_payment) {
        toast.success('Account created! Complete payment to activate.')
        navigate('/upgrade-plan', {
          state: {
            tenantId:         response.data.company_id,
            fromRegistration: true,
            planId:           selectedPlan?.id,
            billingCycle,
            userCount:        Math.max(userCount, 1),
          },
        })
        return
      }

      setCurrentStep(steps.length)
      toast.success('Registration successful!')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  const getPricePerUser = (plan) => {
    if (plan.is_trial) return 0
    return billingCycle === 'yearly' ? plan.price_per_user_yearly : plan.price_per_user_monthly
  }
  const getTotal = (plan) => {
    if (plan.is_trial) return 0
    const ppu = getPricePerUser(plan); const users = Math.max(userCount, 1)
    return billingCycle === 'yearly' ? ppu * users * 12 : ppu * users
  }

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-lg text-white">C</div>
          <div>
            <h1 className="font-bold text-lg text-surface-900">CRM Platform</h1>
            <p className="text-xs text-surface-500">Recruitment & Partner Management</p>
          </div>
        </div>
        <Link to="/login" className="text-sm text-accent-600 hover:text-accent-700 font-medium">
          Already have an account? Sign in
        </Link>
      </div>

      <div className="flex justify-center py-10 px-4">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-surface-200 p-8 animate-fade-in">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-surface-900">Subscribe to CRM Platform</h2>
            <p className="text-surface-500 text-sm mt-1">Set up your company and choose a plan</p>
          </div>

          {/* Progress Stepper */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div className={clsx('step-indicator', currentStep > step.id && 'step-completed', currentStep === step.id && 'step-active', currentStep < step.id && 'step-pending')}>
                      {currentStep > step.id ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                    </div>
                    <span className={clsx('text-xs mt-2 font-medium whitespace-nowrap', currentStep >= step.id ? 'text-surface-900' : 'text-surface-400')}>
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={clsx('flex-1 h-0.5 mx-2', currentStep > step.id ? 'bg-accent-500' : 'bg-surface-200')} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>

            {/* STEP 1 — Company Setup */}
            {currentStep === 1 && (
              <div className="space-y-5 animate-slide-up">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-surface-900">Company Information</h2>
                  <p className="text-surface-500 text-sm">Tell us about your organization</p>
                </div>

                <Input label="Company Name" placeholder="Enter company name" leftIcon={<Building2 className="w-4 h-4" />} error={errors.company_name?.message} required
                  {...register('company_name', { required: 'Company name is required', minLength: { value: 2, message: 'Minimum 2 characters' } })} />

                <PhoneComboInput fieldName="phone" label="Company Phone" codeValue={companyPhoneCode} onCodeChange={setCompanyPhoneCode} placeholder="98765 43210" register={register} errors={errors} />

                <div>
                  <Input label="Website" placeholder="https://www.company.com" leftIcon={<Globe className="w-4 h-4" />} error={errors.website?.message} disabled={noWebsite}
                    {...register('website', {
                      validate: value => {
                        if (noWebsiteRef.current) return true
                        if (value && value.trim()) {
                          const urlPattern = /^(https?:\/\/)?(www\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/
                          return urlPattern.test(value.trim()) || 'Enter a valid URL'
                        }
                        return "Please enter a website or select 'I don't have a website'"
                      },
                    })} />
                  <label className="mt-2 inline-flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={noWebsite} onChange={e => handleNoWebsiteChange(e.target.checked)}
                      className="w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500 cursor-pointer" />
                    <span className="text-sm text-surface-600">I don't have a website</span>
                  </label>
                </div>

                <Input label="GST Number (Optional)" placeholder="22AAAAA0000A1Z5" error={errors.gst_number?.message} {...register('gst_number')} />

                <Input label="Street Address" placeholder="Building, Street" leftIcon={<MapPin className="w-4 h-4" />} {...register('street')} />

                {/* Country */}
                <div>
                  <label className="input-label">Country <span className="text-danger-500 ml-1">*</span></label>
                  <select value={selectedCountry} onChange={handleCountryChange} className={clsx('input appearance-none pr-10 cursor-pointer', countryError && 'input-error')}>
                    <option value="" disabled>Select Country</option>
                    {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {countryError && <p className="input-error-text flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{countryError}</p>}
                </div>

                {/* State + District */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">State <span className="text-danger-500 ml-1">*</span></label>
                    <select value={selectedState} onChange={handleStateChange} disabled={availableStates.length === 0} className={clsx('input appearance-none pr-10 cursor-pointer', stateError && 'input-error', availableStates.length === 0 && 'bg-surface-100 cursor-not-allowed')}>
                      <option value="" disabled>{availableStates.length === 0 ? 'Select country first' : 'Select State'}</option>
                      {availableStates.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    {stateError && <p className="input-error-text flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{stateError}</p>}
                  </div>
                  <div>
                    <label className="input-label">District <span className="text-surface-400 text-xs font-normal ml-1">(Optional)</span></label>
                    <select value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} disabled={availableDistricts.length === 0} className={clsx('input appearance-none pr-10 cursor-pointer', availableDistricts.length === 0 && 'bg-surface-100 cursor-not-allowed')}>
                      <option value="">{availableDistricts.length === 0 ? 'Select state first' : 'Select District'}</option>
                      {availableDistricts.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* City + ZIP */}
                <div className="grid grid-cols-2 gap-4">
                  <Input label="City" placeholder="City" error={errors.city?.message} required {...register('city', { required: 'City is required' })} />
                  <Input label="ZIP / PIN Code" placeholder="560001" error={errors.zip_code?.message} required {...register('zip_code', { required: 'ZIP code is required' })} />
                </div>
              </div>
            )}

            {/* STEP 2 — Admin Setup */}
            {currentStep === 2 && (
              <div className="space-y-5 animate-slide-up">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-surface-900">Admin Account</h2>
                  <p className="text-surface-500 text-sm">Your administrator account details</p>
                </div>

                <Input label="Full Name" placeholder="John Doe" leftIcon={<User className="w-4 h-4" />} error={errors.owner_name?.message} required
                  {...register('owner_name', { required: 'Name is required', minLength: { value: 2, message: 'Minimum 2 characters' } })} />

                <Input label="Email Address" type="email" placeholder="john@company.com" leftIcon={<Mail className="w-4 h-4" />} error={errors.owner_email?.message} required
                  {...register('owner_email', { required: 'Email is required', pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Invalid email address' } })} />

                <PhoneComboInput fieldName="owner_mobile" label="Mobile Number" codeValue={ownerMobileCode} onCodeChange={setOwnerMobileCode} placeholder="98765 43210" register={register} errors={errors} />

                <div className="grid grid-cols-2 gap-4">
                  <Input label="Username" placeholder="johndoe" error={errors.owner_username?.message} required
                    {...register('owner_username', { required: 'Username is required', minLength: { value: 3, message: 'Minimum 3 characters' }, pattern: { value: /^[a-zA-Z][a-zA-Z0-9_]*$/, message: 'Letters, numbers, underscores only' } })} />

                  {/* Designation — with "Select" as invalid default */}
                  <div>
                    <label className="input-label">
                      Designation <span className="text-danger-500 ml-1">*</span>
                    </label>
                    <select
                      className={clsx('input appearance-none cursor-pointer', errors.owner_designation && 'input-error')}
                      {...register('owner_designation', {
                        validate: v => (v && v !== 'Select') || 'Please select a designation — Owner or Admin.',
                      })}
                    >
                      <option value="Select" disabled>— Select —</option>
                      <option value="Owner">Owner</option>
                      <option value="Admin">Admin</option>
                    </select>
                    {errors.owner_designation && (
                      <p className="input-error-text flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3 h-3" />{errors.owner_designation.message}
                      </p>
                    )}
                    <p className="text-xs text-surface-400 mt-1">
                      Owner = full access · Admin = admin-level access
                    </p>
                  </div>
                </div>

                <Input label="Password" type="password" placeholder="Min. 8 characters" leftIcon={<Lock className="w-4 h-4" />} error={errors.owner_password?.message} required
                  {...register('owner_password', { required: 'Password is required', minLength: { value: 8, message: 'Minimum 8 characters' }, pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: 'Must include uppercase, lowercase, and number' } })} />

                <Input label="Confirm Password" type="password" placeholder="Confirm your password" leftIcon={<Lock className="w-4 h-4" />} error={errors.confirm_password?.message} required
                  {...register('confirm_password', { required: 'Please confirm password', validate: value => value === password || 'Passwords do not match' })} />
              </div>
            )}

            {/* STEP 3 — Plan Selection */}
            {currentStep === 3 && (
              <div className="animate-slide-up">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-surface-900">Choose Your Plan</h2>
                  <p className="text-surface-500 text-sm">Select the plan that fits your needs</p>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="flex justify-center mb-6">
                  <div className="bg-surface-100 p-1 rounded-lg inline-flex">
                    {[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly', badge: 'Save ~33%' }].map(({ value, label, badge }) => (
                      <button key={value} type="button" onClick={() => setBillingCycle(value)}
                        className={clsx('relative px-5 py-2 text-sm font-medium rounded-md transition-all', billingCycle === value ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700')}>
                        {label}
                        {badge && <span className="ml-1.5 text-[10px] text-green-600 font-semibold">{badge}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {plans.map(plan => {
                    const isSelected = selectedPlan?.id === plan.id
                    const ppu        = getPricePerUser(plan)
                    const origPpu    = plan.original_price_monthly || 0
                    return (
                      <div key={plan.id} onClick={() => setSelectedPlan(plan)}
                        className={clsx('relative flex flex-col rounded-xl border-2 cursor-pointer transition-all overflow-hidden', isSelected ? 'border-accent-500 shadow-md' : 'border-surface-200 hover:border-surface-300', plan.is_popular && 'ring-1 ring-accent-400')}>
                        {plan.is_popular && (
                          <div className="bg-accent-500 text-white text-[10px] font-semibold text-center py-1 flex items-center justify-center gap-1">
                            <Sparkles className="w-3 h-3" /> Recommended
                          </div>
                        )}
                        <div className={clsx('flex flex-col flex-1 p-4', plan.is_popular && 'bg-accent-50/30')}>
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="font-bold text-surface-900 text-base">{plan.display_name}</h3>
                            {isSelected && <div className="w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center shrink-0"><Check className="w-3 h-3 text-white" /></div>}
                          </div>
                          <div className="space-y-1.5 mb-4">
                            <div className="flex items-center gap-1.5 text-xs text-surface-600"><Monitor className="w-3.5 h-3.5 text-surface-400 shrink-0" />Desktop Version</div>
                            {plan.has_mobile && (
                              <div className="flex items-center gap-1.5 text-xs text-purple-700"><Smartphone className="w-3.5 h-3.5 shrink-0" />Mobile App<span className="text-[9px] bg-purple-100 px-1 py-0.5 rounded font-medium">Coming Soon</span></div>
                            )}
                          </div>
                          <div className="mt-auto">
                            {origPpu > 0 && <div className="text-xs text-surface-400 line-through">{formatCurrency(origPpu)}/user/month</div>}
                            <div className="text-2xl font-extrabold text-surface-900 leading-tight">{formatCurrency(ppu)}</div>
                            <div className="text-xs text-surface-500">/user/month</div>
                            {billingCycle === 'monthly' && origPpu > 0 && <div className="inline-block mt-1.5 text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">50% OFF First Year</div>}
                            {billingCycle === 'yearly' && <div className="text-[10px] text-surface-400 mt-1">billed yearly</div>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* User count */}
                {selectedPlan && (
                  <div className="mt-5 p-4 bg-surface-50 rounded-xl border border-surface-200">
                    <label className="block text-sm font-medium text-surface-700 mb-2">Number of Users</label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setUserCount(c => Math.max(c - 1, 1))} className="w-9 h-9 rounded-lg border border-surface-300 bg-white flex items-center justify-center text-surface-700 hover:bg-surface-100 font-bold text-lg">−</button>
                      <input type="number" min="1" value={userCount} onChange={e => setUserCount(Math.max(parseInt(e.target.value) || 1, 1))} className="w-20 text-center border border-surface-300 rounded-lg py-2 text-surface-900 font-semibold focus:outline-none focus:ring-2 focus:ring-accent-400" />
                      <button type="button" onClick={() => setUserCount(c => c + 1)} className="w-9 h-9 rounded-lg border border-surface-300 bg-white flex items-center justify-center text-surface-700 hover:bg-surface-100 font-bold text-lg">+</button>
                      <span className="text-sm text-surface-500">users</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-surface-200 space-y-1 text-sm">
                      <div className="flex justify-between text-surface-600">
                        <span>{formatCurrency(getPricePerUser(selectedPlan))}/user × {userCount} user{userCount > 1 ? 's' : ''}{billingCycle === 'yearly' ? ' × 12 mo' : ''}</span>
                        <span className="font-medium text-surface-800">{formatCurrency(getTotal(selectedPlan))}</span>
                      </div>
                      <div className="flex justify-between text-surface-500 text-xs">
                        <span>GST (18%)</span><span>{formatCurrency(Math.round(getTotal(selectedPlan) * 0.18))}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-surface-900 pt-1 border-t border-surface-200">
                        <span>Total {billingCycle === 'yearly' ? '(yearly)' : '(monthly)'}</span>
                        <span>{formatCurrency(Math.round(getTotal(selectedPlan) * 1.18))}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4 — Finish */}
            {currentStep === steps.length && (
              <div className="text-center animate-slide-up">
                <div className="w-20 h-20 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-success-500" />
                </div>
                <h2 className="text-2xl font-bold text-surface-900 mb-2">Registration Successful!</h2>
                <p className="text-surface-500 mb-6">
                  Your company <span className="font-medium text-surface-900">{registrationResult?.company_name}</span> has been registered.
                </p>
                <div className="bg-accent-50 p-4 rounded-xl mb-6">
                  <p className="text-accent-800">Subscription activated successfully. You can now sign in.</p>
                </div>
                <Button onClick={() => navigate('/login')} className="w-full">Go to Login</Button>
              </div>
            )}

            {/* Navigation Buttons */}
            {currentStep < steps.length && (
              <div className="flex justify-between mt-8">
                {currentStep > 1
                  ? <Button type="button" variant="ghost" onClick={prevStep} leftIcon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
                  : <Link to="/login"><Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />}>Login</Button></Link>
                }
                {currentStep < maxFormStep
                  ? <Button type="button" onClick={nextStep} rightIcon={<ArrowRight className="w-4 h-4" />}>Continue</Button>
                  : <Button type="button" onClick={handleFinish} isLoading={isLoading} rightIcon={<CheckCircle className="w-4 h-4" />}>Proceed to Payment</Button>
                }
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — route dispatcher
// ═══════════════════════════════════════════════════════════════════════════════

const Register = () => {
  const [searchParams] = useSearchParams()
  const isTrial = searchParams.get('mode') === 'trial'
  return isTrial ? <TrialSetupForm /> : <SubscriptionRegister />
}

export default Register
