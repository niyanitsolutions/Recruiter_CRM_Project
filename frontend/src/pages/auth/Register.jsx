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
  Briefcase,
  Check,
  Sparkles,
  Monitor,
  Smartphone,
  AlertCircle,
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

// ─── Step definitions ─────────────────────────────────────────────────────────
const TRIAL_STEPS = [
  { id: 1, title: 'Company Setup', icon: Building2 },
  { id: 2, title: 'Admin Setup',   icon: User },
  { id: 3, title: 'Finish',        icon: CheckCircle },
]

const SUBSCRIPTION_STEPS = [
  { id: 1, title: 'Company Setup', icon: Building2 },
  { id: 2, title: 'Admin Setup',   icon: User },
  { id: 3, title: 'Subscription',  icon: CreditCard },
  { id: 4, title: 'Finish',        icon: CheckCircle },
]


const Register = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isTrial = searchParams.get('mode') === 'trial'
  const steps = isTrial ? TRIAL_STEPS : SUBSCRIPTION_STEPS
  // Last step that has a form (before the Finish screen)
  const maxFormStep = steps.length - 1

  // ─── Multi-step state ──────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading]     = useState(false)

  // ─── Plan state ───────────────────────────────────────────────────────────
  const [plans, setPlans]             = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [userCount, setUserCount]     = useState(3)
  const [registrationResult, setRegistrationResult] = useState(null)

  // ─── Phone country codes ──────────────────────────────────────────────────
  const [companyPhoneCode, setCompanyPhoneCode] = useState('+91') // Step 1 phone
  const [ownerMobileCode, setOwnerMobileCode]   = useState('+91') // Step 2 mobile

  // ─── "I don't have a website" checkbox ───────────────────────────────────
  const [noWebsite, setNoWebsite] = useState(false)
  // Ref so the RHF validate closure always reads the latest value (avoids stale closure)
  const noWebsiteRef = useRef(false)

  // ─── Location (address) dropdowns ─────────────────────────────────────────
  const [selectedCountry,  setSelectedCountry]  = useState('India')
  const [selectedState,    setSelectedState]    = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [countryError,     setCountryError]     = useState('')
  const [stateError,       setStateError]       = useState('')

  // Derived lists for dependent dropdowns
  const availableStates    = (STATES_BY_COUNTRY[selectedCountry] || [])
    .map(s => ({ value: s, label: s }))
  const availableDistricts = (DISTRICTS_BY_STATE[selectedState] || [])
    .map(d => ({ value: d, label: d }))

  // ─── React Hook Form ───────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm({
    mode: 'onChange',
    defaultValues: {
      company_name:      '',
      website:           '',
      gst_number:        '',
      phone:             '',
      street:            '',
      city:              '',
      zip_code:          '',
      // country / state / district are managed as local state (not RHF fields)
      owner_name:        '',
      owner_email:       '',
      owner_mobile:      '',
      owner_username:    '',
      owner_designation: 'Owner',
      owner_password:    '',
      confirm_password:  '',
    },
  })

  const password = watch('owner_password')

  // ─── Fetch plans on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await planService.getPlans()
        const seen   = new Set()
        const unique = (response.data.plans || []).filter(p => {
          if (seen.has(p.id)) return false
          seen.add(p.id)
          return true
        })
        if (isTrial) {
          // Trial flow: auto-select the trial plan, no need to show plan list
          const trialPlan = unique.find(p => p.is_trial)
          if (trialPlan) setSelectedPlan(trialPlan)
          setPlans(unique)
        } else {
          // Subscription flow: only show paid plans
          const paidPlans = unique.filter(p => !p.is_trial)
          setPlans(paidPlans)
          const popular = paidPlans.find(p => p.is_popular) || paidPlans[0]
          if (popular) setSelectedPlan(popular)
        }
      } catch {
        toast.error('Failed to load plans')
      }
    }
    fetchPlans()
  }, [])

  // ─── "No website" checkbox handler ───────────────────────────────────────
  const handleNoWebsiteChange = (checked) => {
    noWebsiteRef.current = checked
    setNoWebsite(checked)
    if (checked) {
      setValue('website', '')
      clearErrors('website')
    } else {
      trigger('website')
    }
  }

  // ─── Location change handlers ──────────────────────────────────────────────
  const handleCountryChange = (e) => {
    setSelectedCountry(e.target.value)
    setSelectedState('')
    setSelectedDistrict('')
    setCountryError('')
    setStateError('')
  }

  const handleStateChange = (e) => {
    setSelectedState(e.target.value)
    setSelectedDistrict('')
    setStateError('')
  }

  // ─── Step validation ──────────────────────────────────────────────────────
  const validateStep = async (step) => {
    switch (step) {
      case 1: {
        // Always trigger website — its validate fn decides valid/invalid based on checkbox state
        const fields = ['company_name', 'website', 'phone', 'city', 'zip_code']
        const formValid = await trigger(fields)

        // Validate location dropdowns (not tracked by RHF)
        let locValid = true
        if (!selectedCountry) { setCountryError('Country is required'); locValid = false }
        else setCountryError('')
        if (!selectedState)   { setStateError('State is required');    locValid = false }
        else setStateError('')

        return formValid && locValid
      }
      case 2:
        return trigger([
          'owner_name', 'owner_email', 'owner_mobile',
          'owner_username', 'owner_password', 'confirm_password',
        ])
      case 3:
        if (isTrial) return true   // trial has no plan selection step
        if (!selectedPlan) { toast.error('Please select a plan'); return false }
        return true
      default:
        return true
    }
  }

  const nextStep = async () => {
    const isValid = await validateStep(currentStep)
    if (isValid) setCurrentStep(prev => Math.min(prev + 1, steps.length))
  }

  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1))

  // ─── Form submission ──────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      const payload = {
        ...data,
        // Combine country code + digits for phone numbers
        phone:        `${companyPhoneCode}${data.phone.replace(/\D/g, '')}`,
        owner_mobile: `${ownerMobileCode}${data.owner_mobile.replace(/\D/g, '')}`,
        // Location from local state
        country:  selectedCountry,
        state:    selectedState,
        district: selectedDistrict || undefined,
        website: noWebsite ? '' : data.website,
        // Plan
        plan_id:      selectedPlan.id,
        billing_cycle: billingCycle,
        user_count:    selectedPlan.is_trial ? 3 : Math.max(userCount, 1),
      }

      const response = await authService.register(payload)
      setRegistrationResult(response.data)

      if (!isTrial && response.data.requires_payment) {
        // Subscription flow: redirect to payment page
        toast.success('Account created! Complete payment to activate.')
        navigate('/upgrade-plan', {
          state: {
            tenantId:        response.data.company_id,
            fromRegistration: true,
            planId:          selectedPlan?.id,
            billingCycle:    billingCycle,
            userCount:       Math.max(userCount, 1),
          },
        })
        return
      }

      setCurrentStep(steps.length)
      toast.success(isTrial ? 'Account created successfully. Trial activated.' : 'Registration successful!')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Pricing helpers ──────────────────────────────────────────────────────
  const getPricePerUser = (plan) => {
    if (plan.is_trial) return 0
    return billingCycle === 'yearly'
      ? plan.price_per_user_yearly
      : plan.price_per_user_monthly
  }

  const getTotal = (plan) => {
    if (plan.is_trial) return 0
    const ppu   = getPricePerUser(plan)
    const users = Math.max(userCount, 1)
    return billingCycle === 'yearly' ? ppu * users * 12 : ppu * users
  }

  // ─── Phone / Mobile combined input ────────────────────────────────────────
  // Renders a country-code select fused with a digits input.
  // Used for both company phone (Step 1) and owner mobile (Step 2).
  const PhoneComboInput = ({
    fieldName,
    label,
    codeValue,
    onCodeChange,
    placeholder = '98765 43210',
    required = true,
  }) => {
    const expectedLen = PHONE_LENGTHS[codeValue]
    return (
      <div className="w-full">
        <label className="input-label">
          {label}
          {required && <span className="text-danger-500 ml-1">*</span>}
        </label>
        {/* Fused select + input */}
        <div
          className={clsx(
            'flex rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-accent-500/20 focus-within:border-accent-400',
            errors[fieldName] ? 'border-danger-500' : 'border-surface-300'
          )}
        >
          {/* Country code selector */}
          <select
            value={codeValue}
            onChange={e => onCodeChange(e.target.value)}
            className="shrink-0 bg-surface-50 border-r border-surface-200 pl-2 pr-1 py-2.5 text-sm text-surface-700 focus:outline-none cursor-pointer rounded-l-lg"
          >
            {COUNTRY_CODES.map(c => (
              <option key={c.code} value={c.code}>
                {c.label} — {c.country}
              </option>
            ))}
          </select>

          {/* Phone digits input */}
          <input
            type="tel"
            placeholder={placeholder}
            className="flex-1 px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none bg-white rounded-r-lg"
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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-50">
      {/* Top header bar */}
      <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-lg text-white">
            C
          </div>
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
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-surface-200 p-8 animate-fade-in">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-surface-900">
              {isTrial ? 'Start Your Free Trial' : 'Subscribe to CRM Platform'}
            </h2>
            <p className="text-surface-500 text-sm mt-1">
              {isTrial ? 'Get started free — no payment required' : 'Set up your company and choose a plan'}
            </p>
          </div>

          {/* ── Progress Stepper ─────────────────────────────────────────── */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={clsx(
                        'step-indicator',
                        currentStep > step.id  && 'step-completed',
                        currentStep === step.id && 'step-active',
                        currentStep < step.id  && 'step-pending'
                      )}
                    >
                      {currentStep > step.id
                        ? <Check className="w-5 h-5" />
                        : <step.icon className="w-5 h-5" />
                      }
                    </div>
                    <span className={clsx(
                      'text-xs mt-2 font-medium whitespace-nowrap',
                      currentStep >= step.id ? 'text-surface-900' : 'text-surface-400'
                    )}>
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={clsx(
                      'flex-1 h-0.5 mx-2',
                      currentStep > step.id ? 'bg-accent-500' : 'bg-surface-200'
                    )} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>

            {/* ═══════════════════════════════════════════════════════════════
                STEP 1 — Company Setup
            ═══════════════════════════════════════════════════════════════ */}
            {currentStep === 1 && (
              <div className="space-y-5 animate-slide-up">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-surface-900">Company Information</h2>
                  <p className="text-surface-500 text-sm">Tell us about your organization</p>
                </div>

                {/* Company Name */}
                <Input
                  label="Company Name"
                  placeholder="Enter company name"
                  leftIcon={<Building2 className="w-4 h-4" />}
                  error={errors.company_name?.message}
                  required
                  {...register('company_name', {
                    required: 'Company name is required',
                    minLength: { value: 2, message: 'Minimum 2 characters' },
                  })}
                />

                {/* Phone with country code */}
                <PhoneComboInput
                  fieldName="phone"
                  label="Company Phone"
                  codeValue={companyPhoneCode}
                  onCodeChange={setCompanyPhoneCode}
                  placeholder="98765 43210"
                />

                {/* Website — required unless "I don't have a website" is checked */}
                <div>
                  <Input
                    label="Website"
                    placeholder="https://www.company.com"
                    leftIcon={<Globe className="w-4 h-4" />}
                    error={errors.website?.message}
                    disabled={noWebsite}
                    {...register('website', {
                      validate: value => {
                        // Checkbox checked → always valid
                        if (noWebsiteRef.current) return true
                        // Value provided → validate URL format
                        if (value && value.trim()) {
                          const urlPattern =
                            /^(https?:\/\/)?(www\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/
                          return (
                            urlPattern.test(value.trim()) ||
                            'Enter a valid URL (e.g. https://www.example.com)'
                          )
                        }
                        // Empty + no checkbox → error
                        return "Please enter a website or select 'I don't have a website'"
                      },
                    })}
                  />
                  {/* "I don't have a website" checkbox */}
                  <label className="mt-2 inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={noWebsite}
                      onChange={e => handleNoWebsiteChange(e.target.checked)}
                      className="w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                    />
                    <span className="text-sm text-surface-600">I don't have a website</span>
                  </label>
                </div>

                {/* GST Number (optional) */}
                <Input
                  label="GST Number (Optional)"
                  placeholder="22AAAAA0000A1Z5"
                  error={errors.gst_number?.message}
                  {...register('gst_number')}
                />

                {/* Street Address */}
                <Input
                  label="Street Address"
                  placeholder="Building, Street"
                  leftIcon={<MapPin className="w-4 h-4" />}
                  {...register('street')}
                />

                {/* Country dropdown */}
                <div>
                  <label className="input-label">
                    Country <span className="text-danger-500 ml-1">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCountry}
                      onChange={handleCountryChange}
                      className={clsx(
                        'input appearance-none pr-10 cursor-pointer',
                        countryError && 'input-error'
                      )}
                    >
                      <option value="" disabled>Select Country</option>
                      {COUNTRIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-400">
                      <AlertCircle className="w-4 h-4 hidden" />
                    </div>
                  </div>
                  {countryError && (
                    <p className="input-error-text flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3" />
                      {countryError}
                    </p>
                  )}
                </div>

                {/* State + District (dependent dropdowns) */}
                <div className="grid grid-cols-2 gap-4">
                  {/* State */}
                  <div>
                    <label className="input-label">
                      State <span className="text-danger-500 ml-1">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedState}
                        onChange={handleStateChange}
                        disabled={availableStates.length === 0}
                        className={clsx(
                          'input appearance-none pr-10 cursor-pointer',
                          stateError && 'input-error',
                          availableStates.length === 0 && 'bg-surface-100 cursor-not-allowed'
                        )}
                      >
                        <option value="" disabled>
                          {availableStates.length === 0 ? 'Select country first' : 'Select State'}
                        </option>
                        {availableStates.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    {stateError && (
                      <p className="input-error-text flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3 h-3" />
                        {stateError}
                      </p>
                    )}
                  </div>

                  {/* District (shown only when districts are available for the selected state) */}
                  <div>
                    <label className="input-label">
                      District <span className="text-surface-400 text-xs font-normal ml-1">(Optional)</span>
                    </label>
                    <select
                      value={selectedDistrict}
                      onChange={e => setSelectedDistrict(e.target.value)}
                      disabled={availableDistricts.length === 0}
                      className={clsx(
                        'input appearance-none pr-10 cursor-pointer',
                        availableDistricts.length === 0 && 'bg-surface-100 cursor-not-allowed'
                      )}
                    >
                      <option value="">
                        {availableDistricts.length === 0 ? 'Select state first' : 'Select District'}
                      </option>
                      {availableDistricts.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* City + ZIP Code */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="City"
                    placeholder="City"
                    error={errors.city?.message}
                    required
                    {...register('city', { required: 'City is required' })}
                  />
                  <Input
                    label="ZIP / PIN Code"
                    placeholder="560001"
                    error={errors.zip_code?.message}
                    required
                    {...register('zip_code', { required: 'ZIP code is required' })}
                  />
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                STEP 2 — Admin Setup
            ═══════════════════════════════════════════════════════════════ */}
            {currentStep === 2 && (
              <div className="space-y-5 animate-slide-up">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-surface-900">Admin Account</h2>
                  <p className="text-surface-500 text-sm">Your administrator account details</p>
                </div>

                <Input
                  label="Full Name"
                  placeholder="John Doe"
                  leftIcon={<User className="w-4 h-4" />}
                  error={errors.owner_name?.message}
                  required
                  {...register('owner_name', {
                    required: 'Name is required',
                    minLength: { value: 2, message: 'Minimum 2 characters' },
                  })}
                />

                <Input
                  label="Email Address"
                  type="email"
                  placeholder="john@company.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                  error={errors.owner_email?.message}
                  required
                  {...register('owner_email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                  })}
                />

                {/* Mobile with country code */}
                <PhoneComboInput
                  fieldName="owner_mobile"
                  label="Mobile Number"
                  codeValue={ownerMobileCode}
                  onCodeChange={setOwnerMobileCode}
                  placeholder="98765 43210"
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Username"
                    placeholder="johndoe"
                    error={errors.owner_username?.message}
                    required
                    {...register('owner_username', {
                      required: 'Username is required',
                      minLength: { value: 3, message: 'Minimum 3 characters' },
                      pattern: {
                        value: /^[a-zA-Z][a-zA-Z0-9_]*$/,
                        message: 'Letters, numbers, underscores only',
                      },
                    })}
                  />
                  {/* Designation controls post-login navigation scope */}
                  <div>
                    <label className="input-label">Designation</label>
                    <select
                      className="input appearance-none cursor-pointer"
                      {...register('owner_designation')}
                    >
                      <option value="Owner">Owner</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                </div>

                <Input
                  label="Password"
                  type="password"
                  placeholder="Min. 8 characters"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={errors.owner_password?.message}
                  required
                  {...register('owner_password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                    pattern: {
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                      message: 'Must include uppercase, lowercase, and number',
                    },
                  })}
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Confirm your password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  error={errors.confirm_password?.message}
                  required
                  {...register('confirm_password', {
                    required: 'Please confirm password',
                    validate: value => value === password || 'Passwords do not match',
                  })}
                />
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                STEP 3 — Subscription (subscription mode only)
            ═══════════════════════════════════════════════════════════════ */}
            {currentStep === 3 && !isTrial && (
              <div className="animate-slide-up">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-surface-900">Choose Your Plan</h2>
                  <p className="text-surface-500 text-sm">Select the plan that fits your needs</p>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="flex justify-center mb-6">
                  <div className="bg-surface-100 p-1 rounded-lg inline-flex">
                    {[
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'yearly',  label: 'Yearly', badge: 'Save ~33%' },
                    ].map(({ value, label, badge }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setBillingCycle(value)}
                        className={clsx(
                          'relative px-5 py-2 text-sm font-medium rounded-md transition-all',
                          billingCycle === value
                            ? 'bg-white text-surface-900 shadow-sm'
                            : 'text-surface-500 hover:text-surface-700'
                        )}
                      >
                        {label}
                        {badge && (
                          <span className="ml-1.5 text-[10px] text-green-600 font-semibold">{badge}</span>
                        )}
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
                      <div
                        key={plan.id}
                        onClick={() => {
                          setSelectedPlan(plan)
                          if (plan.is_trial) setUserCount(3)
                        }}
                        className={clsx(
                          'relative flex flex-col rounded-xl border-2 cursor-pointer transition-all overflow-hidden',
                          isSelected
                            ? 'border-accent-500 shadow-md'
                            : 'border-surface-200 hover:border-surface-300',
                          plan.is_popular && 'ring-1 ring-accent-400'
                        )}
                      >
                        {plan.is_popular && (
                          <div className="bg-accent-500 text-white text-[10px] font-semibold text-center py-1 flex items-center justify-center gap-1">
                            <Sparkles className="w-3 h-3" /> Recommended
                          </div>
                        )}

                        <div className={clsx('flex flex-col flex-1 p-4', plan.is_popular && 'bg-accent-50/30')}>
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="font-bold text-surface-900 text-base">{plan.display_name}</h3>
                            {isSelected && (
                              <div className="w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center shrink-0">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5 mb-4">
                            <div className="flex items-center gap-1.5 text-xs text-surface-600">
                              <Monitor className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                              Desktop Version
                            </div>
                            {plan.has_mobile && (
                              <div className="flex items-center gap-1.5 text-xs text-purple-700">
                                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                                Mobile App Support
                                <span className="text-[9px] bg-purple-100 px-1 py-0.5 rounded font-medium leading-none">
                                  Coming Soon
                                </span>
                              </div>
                            )}
                            {plan.is_trial && (
                              <div className="flex items-center gap-1.5 text-xs text-accent-700 font-medium">
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                {plan.trial_days || 30} days free
                              </div>
                            )}
                            {plan.is_trial && (
                              <div className="flex items-center gap-1.5 text-xs text-surface-500">
                                <CheckCircle className="w-3.5 h-3.5 shrink-0 text-surface-300" />
                                New companies only
                              </div>
                            )}
                          </div>

                          <div className="mt-auto">
                            {plan.is_trial ? (
                              <div>
                                <div className="text-2xl font-extrabold text-surface-900">Free</div>
                                <div className="text-xs text-surface-500 mt-0.5">for {plan.trial_days || 30} days</div>
                              </div>
                            ) : (
                              <div>
                                {origPpu > 0 && (
                                  <div className="text-xs text-surface-400 line-through">
                                    {formatCurrency(origPpu)}/user/month
                                  </div>
                                )}
                                <div className="text-2xl font-extrabold text-surface-900 leading-tight">
                                  {formatCurrency(ppu)}
                                </div>
                                <div className="text-xs text-surface-500">/user/month</div>
                                {billingCycle === 'monthly' && origPpu > 0 && (
                                  <div className="inline-block mt-1.5 text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                    50% OFF First Year
                                  </div>
                                )}
                                {billingCycle === 'yearly' && (
                                  <div className="text-[10px] text-surface-400 mt-1">billed yearly</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* User count (paid plans only) */}
                {selectedPlan && !selectedPlan.is_trial && (
                  <div className="mt-5 p-4 bg-surface-50 rounded-xl border border-surface-200">
                    <label className="block text-sm font-medium text-surface-700 mb-2">
                      Number of Users
                    </label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setUserCount(c => Math.max(c - 1, 1))}
                        className="w-9 h-9 rounded-lg border border-surface-300 bg-white flex items-center justify-center text-surface-700 hover:bg-surface-100 font-bold text-lg">
                        −
                      </button>
                      <input
                        type="number" min="1" value={userCount}
                        onChange={e => setUserCount(Math.max(parseInt(e.target.value) || 1, 1))}
                        className="w-20 text-center border border-surface-300 rounded-lg py-2 text-surface-900 font-semibold focus:outline-none focus:ring-2 focus:ring-accent-400"
                      />
                      <button type="button" onClick={() => setUserCount(c => c + 1)}
                        className="w-9 h-9 rounded-lg border border-surface-300 bg-white flex items-center justify-center text-surface-700 hover:bg-surface-100 font-bold text-lg">
                        +
                      </button>
                      <span className="text-sm text-surface-500">users</span>
                    </div>

                    {/* Order summary */}
                    <div className="mt-3 pt-3 border-t border-surface-200 space-y-1 text-sm">
                      <div className="flex justify-between text-surface-600">
                        <span>
                          {formatCurrency(getPricePerUser(selectedPlan))}/user × {userCount} user{userCount > 1 ? 's' : ''}
                          {billingCycle === 'yearly' ? ' × 12 mo' : ''}
                        </span>
                        <span className="font-medium text-surface-800">{formatCurrency(getTotal(selectedPlan))}</span>
                      </div>
                      <div className="flex justify-between text-surface-500 text-xs">
                        <span>GST (18%)</span>
                        <span>{formatCurrency(Math.round(getTotal(selectedPlan) * 0.18))}</span>
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

            {/* ═══════════════════════════════════════════════════════════════
                STEP 4 — Finish
            ═══════════════════════════════════════════════════════════════ */}
            {currentStep === steps.length && (
              <div className="text-center animate-slide-up">
                <div className="w-20 h-20 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-success-500" />
                </div>
                <h2 className="text-2xl font-bold text-surface-900 mb-2">
                  {isTrial ? 'Trial Activated!' : 'Registration Successful!'}
                </h2>
                <p className="text-surface-500 mb-6">
                  Your company{' '}
                  <span className="font-medium text-surface-900">{registrationResult?.company_name}</span>{' '}
                  has been registered.
                </p>

                <div className="bg-accent-50 p-4 rounded-xl mb-6">
                  <p className="text-accent-800">
                    {isTrial
                      ? 'Account created successfully. Trial activated. Explore all features free!'
                      : 'Subscription activated successfully. You can now sign in.'}
                  </p>
                </div>

                <Button onClick={() => navigate('/login')} className="w-full">
                  Go to Login
                </Button>
              </div>
            )}

            {/* ── Navigation Buttons ────────────────────────────────────────── */}
            {currentStep < steps.length && (
              <div className="flex justify-between mt-8">
                {currentStep > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={prevStep}
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Back
                  </Button>
                ) : (
                  <Link to="/login">
                    <Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />}>
                      Login
                    </Button>
                  </Link>
                )}

                {currentStep < maxFormStep ? (
                  <Button
                    type="button"
                    onClick={nextStep}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    isLoading={isLoading}
                    rightIcon={<CheckCircle className="w-4 h-4" />}
                  >
                    {isTrial ? 'Finish' : 'Proceed to Payment'}
                  </Button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default Register
