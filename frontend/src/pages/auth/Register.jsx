import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
  Phone,
  Mail,
  Lock,
  MapPin,
  Briefcase,
  Check,
  Sparkles,
  Monitor,
  Smartphone,
} from 'lucide-react'
import { Button, Input, Select, Card } from '../../components/common'
import authService from '../../services/authService'
import planService from '../../services/planService'
import { formatCurrency } from '../../utils/format'

const STEPS = [
  { id: 1, title: 'Company', icon: Building2 },
  { id: 2, title: 'Owner', icon: User },
  { id: 3, title: 'Plan', icon: CreditCard },
  { id: 4, title: 'Complete', icon: CheckCircle },
]

const INDUSTRIES = [
  { value: 'it_services', label: 'IT Services' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'retail', label: 'Retail' },
  { value: 'education', label: 'Education' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'staffing', label: 'Staffing' },
  { value: 'other', label: 'Other' },
]

const Register = () => {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [userCount, setUserCount] = useState(3)
  const [registrationResult, setRegistrationResult] = useState(null)

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors },
    getValues,
  } = useForm({
    mode: 'onChange',
    defaultValues: {
      company_name: '',
      industry: 'other',
      website: '',
      gst_number: '',
      phone: '',
      street: '',
      city: '',
      state: '',
      zip_code: '',
      country: 'India',
      owner_name: '',
      owner_email: '',
      owner_mobile: '',
      owner_username: '',
      owner_designation: 'Owner',
      owner_password: '',
      confirm_password: '',
    },
  })

  // Fetch plans
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await planService.getPlans()
        setPlans(response.data.plans)
        // Select trial plan by default
        const trialPlan = response.data.plans.find(p => p.is_trial)
        if (trialPlan) setSelectedPlan(trialPlan)
      } catch (error) {
        toast.error('Failed to load plans')
      }
    }
    fetchPlans()
  }, [])

  const password = watch('owner_password')

  const validateStep = async (step) => {
    let fieldsToValidate = []
    
    switch (step) {
      case 1:
        fieldsToValidate = ['company_name', 'phone', 'city', 'state', 'zip_code']
        break
      case 2:
        fieldsToValidate = ['owner_name', 'owner_email', 'owner_mobile', 'owner_username', 'owner_password', 'confirm_password']
        break
      case 3:
        if (!selectedPlan) {
          toast.error('Please select a plan')
          return false
        }
        return true
      default:
        return true
    }
    
    const result = await trigger(fieldsToValidate)
    return result
  }

  const nextStep = async () => {
    const isValid = await validateStep(currentStep)
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 4))
    }
  }

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      const payload = {
        ...data,
        plan_id: selectedPlan.id,
        billing_cycle: billingCycle,
        user_count: selectedPlan.is_trial ? 3 : Math.max(userCount, 1),
      }

      const response = await authService.register(payload)
      setRegistrationResult(response.data)
      setCurrentStep(4)
      toast.success('Registration successful!')

      // If requires payment, handle Razorpay
      if (response.data.requires_payment) {
        // TODO: Initialize Razorpay payment
        toast.info('Please complete payment to activate your account')
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  // Returns price-per-user for the selected billing cycle (in paise)
  const getPricePerUser = (plan) => {
    if (plan.is_trial) return 0
    return billingCycle === 'yearly'
      ? plan.price_per_user_yearly
      : plan.price_per_user_monthly
  }

  // Total billed amount for the given plan + user count
  const getTotal = (plan) => {
    if (plan.is_trial) return 0
    const ppu = getPricePerUser(plan)
    const users = Math.max(userCount, 1)
    return billingCycle === 'yearly' ? ppu * users * 12 : ppu * users
  }

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

      {/* Main content area */}
      <div className="flex justify-center py-10 px-4">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-surface-200 p-8 animate-fade-in">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-surface-900">Create your account</h2>
            <p className="text-surface-500 text-sm mt-1">Set up your company on CRM Platform</p>
          </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    'step-indicator',
                    currentStep > step.id && 'step-completed',
                    currentStep === step.id && 'step-active',
                    currentStep < step.id && 'step-pending'
                  )}
                >
                  {currentStep > step.id ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <span className={clsx(
                  'text-xs mt-2 font-medium',
                  currentStep >= step.id ? 'text-surface-900' : 'text-surface-400'
                )}>
                  {step.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={clsx(
                    'flex-1 h-0.5 mx-2',
                    currentStep > step.id ? 'bg-accent-500' : 'bg-surface-200'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1: Company Details */}
        {currentStep === 1 && (
          <div className="space-y-5 animate-slide-up">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-surface-900">Company Information</h2>
              <p className="text-surface-500 text-sm">Tell us about your organization</p>
            </div>

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

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Industry"
                options={INDUSTRIES}
                error={errors.industry?.message}
                {...register('industry')}
              />
              <Input
                label="Phone"
                placeholder="+91 98765 43210"
                leftIcon={<Phone className="w-4 h-4" />}
                error={errors.phone?.message}
                required
                {...register('phone', {
                  required: 'Phone is required',
                  pattern: { value: /^\+?[1-9]\d{9,14}$/, message: 'Invalid phone' },
                })}
              />
            </div>

            <Input
              label="Website"
              placeholder="www.company.com"
              leftIcon={<Globe className="w-4 h-4" />}
              error={errors.website?.message}
              {...register('website')}
            />

            <Input
              label="GST Number (Optional)"
              placeholder="22AAAAA0000A1Z5"
              error={errors.gst_number?.message}
              {...register('gst_number')}
            />

            <Input
              label="Street Address"
              placeholder="Building, Street"
              leftIcon={<MapPin className="w-4 h-4" />}
              {...register('street')}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="City"
                placeholder="City"
                error={errors.city?.message}
                required
                {...register('city', { required: 'City is required' })}
              />
              <Input
                label="State"
                placeholder="State"
                error={errors.state?.message}
                required
                {...register('state', { required: 'State is required' })}
              />
            </div>

            <Input
              label="ZIP Code"
              placeholder="560001"
              error={errors.zip_code?.message}
              required
              {...register('zip_code', { required: 'ZIP code is required' })}
            />
          </div>
        )}

        {/* Step 2: Owner Details */}
        {currentStep === 2 && (
          <div className="space-y-5 animate-slide-up">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-surface-900">Account Owner</h2>
              <p className="text-surface-500 text-sm">Your admin account details</p>
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
                  message: 'Invalid email',
                },
              })}
            />

            <Input
              label="Mobile Number"
              placeholder="+91 98765 43210"
              leftIcon={<Phone className="w-4 h-4" />}
              error={errors.owner_mobile?.message}
              required
              {...register('owner_mobile', {
                required: 'Mobile is required',
                pattern: { value: /^\+?[1-9]\d{9,14}$/, message: 'Invalid mobile' },
              })}
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
              <Input
                label="Designation"
                placeholder="Owner"
                leftIcon={<Briefcase className="w-4 h-4" />}
                {...register('owner_designation')}
              />
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
                validate: (value) => value === password || 'Passwords do not match',
              })}
            />
          </div>
        )}

        {/* Step 3: Plan Selection */}
        {currentStep === 3 && (
          <div className="animate-slide-up">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-surface-900">Choose Your Plan</h2>
              <p className="text-surface-500 text-sm">Select the plan that fits your needs</p>
            </div>

            {/* Billing Cycle Toggle — Monthly / Yearly only */}
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

            {/* Plans Grid — 3-column vertical cards */}
            <div className="grid grid-cols-3 gap-3">
              {plans.map((plan) => {
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
                    {/* Popular badge */}
                    {plan.is_popular && (
                      <div className="bg-accent-500 text-white text-[10px] font-semibold text-center py-1 flex items-center justify-center gap-1">
                        <Sparkles className="w-3 h-3" /> Recommended
                      </div>
                    )}

                    <div className={clsx('flex flex-col flex-1 p-4', plan.is_popular && 'bg-accent-50/30')}>
                      {/* Plan name + check */}
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-surface-900 text-base">{plan.display_name}</h3>
                        {isSelected && (
                          <div className="w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Features */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center gap-1.5 text-xs text-surface-600">
                          <Monitor className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                          Desktop Version
                        </div>
                        {plan.has_mobile ? (
                          <div className="flex items-center gap-1.5 text-xs text-purple-700">
                            <Smartphone className="w-3.5 h-3.5 shrink-0" />
                            Mobile App Support
                            <span className="text-[9px] bg-purple-100 px-1 py-0.5 rounded font-medium leading-none">
                              Coming Soon
                            </span>
                          </div>
                        ) : null}
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

                      {/* Pricing */}
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

            {/* User count (only for paid plans) */}
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

        {/* Step 4: Success */}
        {currentStep === 4 && (
          <div className="text-center animate-slide-up">
            <div className="w-20 h-20 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-success-500" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900 mb-2">
              Registration Successful!
            </h2>
            <p className="text-surface-500 mb-6">
              Your company <span className="font-medium text-surface-900">{registrationResult?.company_name}</span> has been registered.
            </p>
            
            {registrationResult?.is_trial ? (
              <div className="bg-accent-50 p-4 rounded-xl mb-6">
                <p className="text-accent-800">
                  Your 30-day free trial has started. Explore all features!
                </p>
              </div>
            ) : (
              <div className="bg-warning-50 p-4 rounded-xl mb-6">
                <p className="text-warning-800">
                  Please complete payment to activate your account.
                </p>
              </div>
            )}

            <Button onClick={() => navigate('/login')} className="w-full">
              Go to Login
            </Button>
          </div>
        )}

        {/* Navigation Buttons */}
        {currentStep < 4 && (
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

            {currentStep < 3 ? (
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
                Complete Registration
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