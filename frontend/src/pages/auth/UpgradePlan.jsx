import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import {
  Check, CreditCard, Calendar, Users, ArrowRight, CheckCircle,
  Smartphone, Minus, Plus, Clock, Layers, Settings, RefreshCw,
} from 'lucide-react'
import authService from '../../services/authService'
import subscriptionService from '../../services/subscriptionService'
import { formatCurrency } from '../../utils/format'
import { Button } from '../../components/common'

// ── Constants ─────────────────────────────────────────────────────────────────

const BILLING_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly',  badge: 'Save ~33%' },
]

const DURATION_OPTIONS = [
  { months: 1,  label: '1 Month',   desc: '+30 days'  },
  { months: 3,  label: '3 Months',  desc: '+90 days'  },
  { months: 6,  label: '6 Months',  desc: '+180 days' },
  { months: 12, label: '12 Months', desc: '+365 days' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMonths(dateStr, months) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const base = d < new Date() ? new Date() : d
  const result = new Date(base)
  result.setMonth(result.getMonth() + months)
  return result
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Page config per upgrade type ──────────────────────────────────────────────
const PAGE_CONFIG = {
  extend: {
    title:     'Extend Current Subscription',
    subtitle:  'Add more time to your existing plan',
    icon:      Clock,
    iconBg:    'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  seats: {
    title:     'Add User Seats',
    subtitle:  'Add more seats without changing your plan',
    icon:      Users,
    iconBg:    'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  change_plan: {
    title:     'Change Plan',
    subtitle:  'Switch to a different plan for your current seats',
    icon:      Layers,
    iconBg:    'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  change_plan_seats: {
    title:     'Change Plan + Add Seats',
    subtitle:  'Switch plan and expand your team',
    icon:      RefreshCw,
    iconBg:    'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  renewal: {
    title:     'Renew Your Subscription',
    subtitle:  'Choose a plan to restore access',
    icon:      Calendar,
    iconBg:    'bg-amber-100',
    iconColor: 'text-amber-600',
  },
}

// upgradeTypes that need the plan selector UI
const NEEDS_PLAN_SELECTOR = new Set(['change_plan', 'change_plan_seats', 'renewal'])

// ── Activation choice (plan changes): Activate Now vs After Current Plan ─────
function ActivationChoice({ activation, setActivation, currentExpiry }) {
  const options = [
    { value: 'now',   label: 'Activate Now',
      desc: 'Current plan ends immediately; the new plan starts today' },
    { value: 'queue', label: 'Activate After Current Plan',
      desc: currentExpiry
        ? `Starts automatically on ${fmtDate(currentExpiry)}`
        : 'Starts automatically when the current plan expires' },
  ]
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-surface-700 mb-2">When should the new plan activate?</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setActivation(opt.value)}
            className={clsx(
              'text-left p-3 rounded-xl border-2 transition-all',
              activation === opt.value
                ? 'border-accent-500 bg-accent-50'
                : 'border-surface-200 bg-surface-50 hover:border-surface-300'
            )}
          >
            <p className={clsx('text-xs font-semibold', activation === opt.value ? 'text-accent-700' : 'text-surface-800')}>
              {opt.label}
            </p>
            <p className="text-[10px] text-surface-500 mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const UpgradePlan = () => {
  const location    = useLocation()
  const navigate    = useNavigate()
  const state       = location.state || {}

  // ── Navigation state ───────────────────────────────────────────────────────
  const fromDashboard  = Boolean(state.fromDashboard)
  const upgradeType    = state.upgradeType || 'renewal'
  const tenantId       = state.tenantId
  const existingSeats  = state.existingSeats  || 0
  const currentExpiry  = state.currentExpiry  || null
  const currentPlan    = state.currentPlan    || ''

  // For 'seats' and 'change_plan_seats', this holds the additional seats from the modal
  const initialAdditional = state.additionalSeats || 1

  // ── Local state ────────────────────────────────────────────────────────────
  const [plans,        setPlans]        = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [billing,      setBilling]      = useState('monthly')
  const [userCount,    setUserCount]    = useState(() => {
    // For plan selector flows (renewal), start at 3 if fresh, else carry forward
    if (!fromDashboard) return 3
    // For seat-adding flows, carry the pre-selected additional count
    if (upgradeType === 'seats' || upgradeType === 'change_plan_seats') return initialAdditional
    // For extend / change_plan, no user count needed
    return 1
  })
  const [extendMonths, setExtendMonths] = useState(state.extendMonths || null)
  const [isLoading,    setIsLoading]    = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [success,      setSuccess]      = useState(null)
  // Plan changes: 'now' = replace current plan immediately, 'queue' = activate after current plan expires
  const [activation,   setActivation]   = useState('now')
  // Authoritative current-subscription info (billing cycle + dates) for prorated seat pricing
  const [subInfo,      setSubInfo]      = useState(null)

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId && !fromDashboard && !state.fromRegistration) {
      navigate('/login', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch plans ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res  = await authService.getPlans()
        const paid = (res.data.plans || []).filter(p => !p.is_trial)
        setPlans(paid)
        if (paid.length > 0) {
          if (fromDashboard && currentPlan && NEEDS_PLAN_SELECTOR.has(upgradeType)) {
            // For change_plan flows from dashboard, pre-select current plan
            // (user can switch to a different one)
            const matched = paid.find(p =>
              p.display_name?.toLowerCase() === currentPlan.toLowerCase() ||
              p.name?.toLowerCase() === currentPlan.toLowerCase()
            )
            setSelectedPlan(matched || paid.find(p => p.is_popular) || paid[0])
          } else if (!fromDashboard) {
            // Renewal from expired state: default to popular/first
            setSelectedPlan(paid.find(p => p.is_popular) || paid[0])
          } else {
            // Dashboard extend/seats: auto-match current plan for pricing
            const matched = paid.find(p =>
              p.display_name?.toLowerCase() === currentPlan.toLowerCase() ||
              p.name?.toLowerCase() === currentPlan.toLowerCase()
            )
            setSelectedPlan(matched || paid.find(p => p.is_popular) || paid[0])
          }
        }
      } catch {
        toast.error('Failed to load plans')
      } finally {
        setLoadingPlans(false)
      }
    }
    fetchPlans()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch subscription details for prorated seat pricing (authed flows only) ─
  useEffect(() => {
    if (!fromDashboard || upgradeType !== 'seats') return
    let cancelled = false
    import('../../services/paymentService').then(({ default: paymentService }) =>
      paymentService.getCurrentSubscription()
        .then(res => { if (!cancelled) setSubInfo(res.data) })
        .catch(() => {}) // preview falls back to note-only; backend still charges correctly
    )
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Proration preview (mirrors backend formula) ────────────────────────────
  const CYCLE_DAYS   = { monthly: 30, quarterly: 90, half_yearly: 180, yearly: 365 }
  const CYCLE_MONTHS = { monthly: 1,  quarterly: 3,  half_yearly: 6,   yearly: 12  }
  const getProration = () => {
    const expiry = subInfo?.plan_expiry || currentExpiry
    if (!expiry) return null
    const now = new Date()
    const exp = new Date(expiry)
    if (isNaN(exp) || exp <= now) return null
    const remaining = Math.ceil((exp - now) / 86400000)
    const cycle = subInfo?.billing_cycle || 'monthly'
    let total = CYCLE_DAYS[cycle] || 30
    if (subInfo?.plan_start) {
      const start = new Date(subInfo.plan_start)
      const actual = Math.round((exp - start) / 86400000)
      if (!isNaN(start) && actual > 0) total = actual
    }
    return { remaining, total, cycle }
  }

  // ── Pricing helpers ────────────────────────────────────────────────────────
  const getPricePerUser = (plan) => {
    if (!plan) return 0
    return billing === 'yearly' ? plan.price_per_user_yearly : plan.price_per_user_monthly
  }

  // 12-month extension uses the yearly (discounted) rate
  const getPpuForExtension = (plan, months) => {
    if (!plan) return 0
    return months >= 12 ? plan.price_per_user_yearly : plan.price_per_user_monthly
  }

  const getSubtotal = (plan) => {
    if (!plan) return 0
    const ppu = getPricePerUser(plan)

    switch (upgradeType) {
      case 'extend': {
        const months = extendMonths || 1
        return getPpuForExtension(plan, months) * existingSeats * months
      }
      case 'seats': {
        // Seat purchases are billed PRORATED for the remaining validity of the
        // current cycle (backend is authoritative — this mirrors its formula).
        const pro = getProration()
        if (pro) {
          const cyclePpu = pro.cycle === 'yearly'
            ? (plan.price_per_user_yearly || ppu) * 12
            : plan.price_per_user_monthly * (CYCLE_MONTHS[pro.cycle] || 1)
          return Math.round(cyclePpu / pro.total * pro.remaining) * Math.max(userCount, 1)
        }
        // No expiry info — fall back to one full cycle as an upper-bound estimate
        return billing === 'yearly'
          ? ppu * Math.max(userCount, 1) * 12
          : ppu * Math.max(userCount, 1)
      }

      case 'change_plan':
        // New plan pricing × current seat count × billing period
        return billing === 'yearly'
          ? ppu * existingSeats * 12
          : ppu * existingSeats

      case 'change_plan_seats': {
        // New plan pricing × (existing + additional) seats × billing period
        const totalSeats = existingSeats + Math.max(userCount, 1)
        return billing === 'yearly'
          ? ppu * totalSeats * 12
          : ppu * totalSeats
      }

      default: // renewal
        return billing === 'yearly'
          ? ppu * Math.max(userCount, 1) * 12
          : ppu * Math.max(userCount, 1)
    }
  }

  // ── Seat count helpers ─────────────────────────────────────────────────────
  const adjustUserCount = (delta) => setUserCount(prev => Math.max(1, prev + delta))
  const handleUserCountInput = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1) setUserCount(val)
  }

  // ── Payment handler ────────────────────────────────────────────────────────
  const handleUpgrade = async () => {
    if (!selectedPlan) { toast.error('Please select a plan'); return }
    if (upgradeType === 'extend' && !extendMonths) {
      toast.error('Please select how many months to extend')
      return
    }

    setIsLoading(true)
    try {
      let orderRes

      if (upgradeType === 'extend') {
        orderRes = await subscriptionService.createExtensionOrder(
          tenantId, selectedPlan.id, extendMonths,
        )
      } else if (upgradeType === 'seats') {
        orderRes = await subscriptionService.createSeatUpgradeOrder(
          tenantId, selectedPlan.id, Math.max(userCount, 1), billing,
        )
      } else if (upgradeType === 'change_plan') {
        // Plan change: same seat count, new plan + billing cycle
        orderRes = await subscriptionService.createPlanChangeOrder(
          tenantId, selectedPlan.id, billing, existingSeats, activation,
        )
      } else if (upgradeType === 'change_plan_seats') {
        // Plan change + seat increase
        orderRes = await subscriptionService.createPlanChangeOrder(
          tenantId, selectedPlan.id, billing, existingSeats + Math.max(userCount, 1), activation,
        )
      } else {
        // renewal — same-plan renewal; licensed seats derived server-side
        orderRes = await subscriptionService.createRenewalOrder(
          tenantId, selectedPlan.id, billing, Math.max(userCount, 1),
        )
      }

      const order = orderRes.data

      const { default: api } = await import('../../services/api')

      // ── Load Razorpay checkout.js if not already present ───────────────────
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = resolve
          s.onerror = () => reject(new Error('Failed to load payment gateway. Check your internet connection.'))
          document.head.appendChild(s)
        })
      }

      // ── Open Razorpay payment modal and wait for user to complete payment ──
      const rzpResponse = await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key:         order.razorpay_key_id,
          amount:      order.amount,
          currency:    order.currency || 'INR',
          name:        'HireFlow',
          description: `${order.plan_display_name || order.plan_name || 'Plan'} Subscription`,
          order_id:    order.razorpay_order_id,
          handler:     resolve,
          prefill:     { name: order.company_name || '' },
          theme:       { color: '#4F46E5' },
          modal:       { ondismiss: () => reject(new Error('Payment cancelled')) },
        })
        rzp.on('payment.failed', (resp) =>
          reject(new Error(resp.error?.description || 'Payment failed'))
        )
        rzp.open()
      })

      // ── Verify the completed payment on the backend ─────────────────────────
      const verifyRes = await api.post('/auth/renew/verify-payment', {
        razorpay_order_id:   rzpResponse.razorpay_order_id,
        razorpay_payment_id: rzpResponse.razorpay_payment_id,
        razorpay_signature:  rzpResponse.razorpay_signature,
      })

      const newSeatTotal =
        upgradeType === 'seats'             ? existingSeats + Math.max(userCount, 1) :
        upgradeType === 'change_plan_seats' ? existingSeats + Math.max(userCount, 1) :
        upgradeType === 'change_plan'       ? existingSeats :
        upgradeType === 'renewal'           ? Math.max(userCount, 1) :
        existingSeats

      const isQueued = (upgradeType === 'change_plan' || upgradeType === 'change_plan_seats')
        && activation === 'queue'

      setSuccess({
        planName:    selectedPlan.display_name || selectedPlan.name,
        planExpiry:  isQueued ? null : verifyRes.data.plan_expiry,
        invoice:     verifyRes.data.invoice_number,
        upgradeType: isQueued ? 'queued_plan' : upgradeType,
        newSeats:    isQueued ? 0 : newSeatTotal,
        queuedFrom:  isQueued ? currentExpiry : null,
      })
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Payment failed. Please try again.'
      if (msg === 'Payment cancelled') {
        toast.error('Payment was cancelled.')
      } else {
        toast.error(msg)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const subtotal    = selectedPlan ? getSubtotal(selectedPlan) : 0
  const taxAmount   = Math.round(subtotal * 0.18)
  const totalAmount = subtotal + taxAmount
  const newExpiry   = upgradeType === 'extend' && extendMonths
    ? addMonths(currentExpiry, extendMonths)
    : null

  const canProceed =
    upgradeType === 'seats'             ? userCount >= 1 :
    upgradeType === 'extend'            ? extendMonths != null :
    upgradeType === 'change_plan'       ? !!selectedPlan :
    upgradeType === 'change_plan_seats' ? (!!selectedPlan && userCount >= 1) :
    !!selectedPlan  // renewal

  // Show the plan selector for types that require plan selection
  const showPlanSelector = NEEDS_PLAN_SELECTOR.has(upgradeType)

  const pc      = PAGE_CONFIG[upgradeType] || PAGE_CONFIG.renewal
  const PageIcon = pc.icon

  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (success) {
    const successMessages = {
      extend:            'Your subscription has been extended!',
      seats:             'New seats have been added to your plan!',
      change_plan:       'Your plan has been changed!',
      change_plan_seats: 'Plan changed and seats added!',
      renewal:           'Subscription Renewed!',
      queued_plan:       'Plan queued! It activates automatically when your current plan expires.',
    }
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-surface-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900 mb-2">
            {successMessages[success.upgradeType] || 'Success!'}
          </h2>
          <p className="text-surface-500 mb-4">
            {success.upgradeType === 'queued_plan' ? (
              <>Your <span className="font-medium text-surface-800">{success.planName}</span> plan is queued and will activate automatically.</>
            ) : (
              <>Your <span className="font-medium text-surface-800">{success.planName}</span> plan has been updated.</>
            )}
          </p>
          <div className="space-y-2 mb-6">
            {success.queuedFrom && (
              <p className="text-sm text-surface-600">
                Activates after: <strong>{fmtDate(success.queuedFrom)}</strong>
              </p>
            )}
            {success.planExpiry && (
              <p className="text-sm text-surface-600">
                New expiry: <strong>{fmtDate(success.planExpiry)}</strong>
              </p>
            )}
            {success.newSeats > 0 && (
              <p className="text-sm text-surface-600">
                Total seats: <strong>{success.newSeats}</strong>
              </p>
            )}
          </div>
          {success.invoice && (
            <p className="text-xs text-surface-400 mb-6">Invoice: {success.invoice}</p>
          )}
          <Link
            to={fromDashboard ? '/dashboard' : '/login'}
            className="block w-full px-4 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl text-center transition-colors"
          >
            {fromDashboard ? 'Back to Dashboard' : 'Sign In to Continue'}
          </Link>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN PAGE
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/Hire_Flow_Logo.png" alt="HireFlow" style={{ height: '32px', width: 'auto' }} />
          <div>
            <p className="text-xs text-surface-500">Manage Subscription</p>
          </div>
        </div>
        <Link
          to={fromDashboard ? '/dashboard' : '/login'}
          className="text-sm text-accent-600 hover:text-accent-700 font-medium"
        >
          ← {fromDashboard ? 'Back to Dashboard' : 'Back to Login'}
        </Link>
      </div>

      <div className="flex justify-center py-10 px-4">
        <div className="w-full max-w-3xl">

          {/* Page title */}
          <div className="text-center mb-8">
            <div className={clsx('inline-flex items-center justify-center w-14 h-14 rounded-full mb-3', pc.iconBg)}>
              <PageIcon className={clsx('w-7 h-7', pc.iconColor)} />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">{pc.title}</h2>
            <p className="text-surface-500 mt-1 text-sm">{pc.subtitle}</p>
            {currentPlan && (
              <p className="text-xs text-surface-400 mt-1">
                Current plan: <span className="font-medium text-surface-600">{currentPlan}</span>
                {existingSeats > 0 && <span> · <span className="font-medium text-surface-600">{existingSeats} seats</span></span>}
              </p>
            )}
          </div>

          {/* ── Plan selector (for renewal / change_plan / change_plan_seats) ── */}
          {showPlanSelector && (
            <>
              {/* Billing cycle toggle */}
              <div className="flex items-center justify-center gap-2 mb-6">
                {BILLING_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBilling(opt.value)}
                    className={clsx(
                      'relative px-5 py-2 rounded-lg text-sm font-medium transition-colors border',
                      billing === opt.value
                        ? 'bg-accent-600 text-white border-accent-600'
                        : 'bg-white text-surface-600 border-surface-200 hover:border-surface-300'
                    )}
                  >
                    {opt.label}
                    {opt.badge && (
                      <span className="absolute -top-2 -right-2 text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                        {opt.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Plan cards */}
              {loadingPlans ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {plans.map(plan => {
                    const ppu        = getPricePerUser(plan)
                    const origPpu    = plan.original_price_monthly || 0
                    const isSelected = selectedPlan?.id === plan.id
                    const isCurrent  = plan.display_name?.toLowerCase() === currentPlan?.toLowerCase() ||
                                       plan.name?.toLowerCase() === currentPlan?.toLowerCase()
                    return (
                      <button
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan)}
                        className={clsx(
                          'relative text-left rounded-xl border-2 p-5 transition-all',
                          isSelected
                            ? 'border-accent-500 bg-accent-50 shadow-md'
                            : 'border-surface-200 bg-white hover:border-surface-300'
                        )}
                      >
                        {plan.is_popular && (
                          <span className="absolute -top-3 left-4 text-xs bg-accent-500 text-white px-3 py-0.5 rounded-full font-semibold">
                            Popular
                          </span>
                        )}
                        {isCurrent && !plan.is_popular && (
                          <span className="absolute -top-3 left-4 text-xs bg-surface-500 text-white px-3 py-0.5 rounded-full font-semibold">
                            Current
                          </span>
                        )}
                        {isSelected && (
                          <span className="absolute top-3 right-3 w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        )}
                        <h3 className="font-semibold text-surface-900 mb-1">
                          {plan.display_name || plan.name}
                        </h3>
                        <div className="flex items-baseline gap-2 mb-1">
                          <p className="text-2xl font-bold text-surface-900">
                            {formatCurrency(ppu)}
                          </p>
                          <span className="text-sm text-surface-500">/user/mo</span>
                        </div>
                        {origPpu > 0 && (
                          <p className="text-xs text-surface-400 line-through mb-3">
                            {formatCurrency(origPpu)}/user/mo
                          </p>
                        )}
                        {billing === 'yearly' && (
                          <p className="text-xs text-green-600 font-medium mb-3">
                            Billed {formatCurrency(ppu * 12)}/user/year
                          </p>
                        )}
                        <div className="space-y-1.5 text-xs text-surface-600">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-surface-400" />
                            Per-seat pricing · scale as needed
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-surface-400" />
                            Desktop access
                          </div>
                          {plan.has_mobile ? (
                            <div className="flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5 text-surface-400" />
                              Mobile access
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 opacity-50">
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>Mobile <em className="text-[10px] not-italic bg-surface-100 px-1 py-0.5 rounded">Coming Soon</em></span>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* FLOW-SPECIFIC INPUT SECTIONS                                    */}
          {/* ═══════════════════════════════════════════════════════════════ */}

          {/* ── FLOW 1 (extend): Duration picker ── */}
          {upgradeType === 'extend' && selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-5 mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" />
                Extend subscription by
              </label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.months}
                    onClick={() => setExtendMonths(prev => prev === opt.months ? null : opt.months)}
                    className={clsx(
                      'py-3 px-2 rounded-xl border-2 text-center transition-all',
                      extendMonths === opt.months
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-surface-200 bg-surface-50 hover:border-surface-300'
                    )}
                  >
                    <p className={clsx('text-sm font-bold', extendMonths === opt.months ? 'text-purple-700' : 'text-surface-800')}>
                      {opt.months}M
                    </p>
                    <p className="text-[10px] text-surface-500">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Current → new expiry preview */}
              {extendMonths && (
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-purple-50 border border-purple-100">
                  <div className="text-xs text-surface-600">
                    <span className="font-medium">Current expiry:</span> {fmtDate(currentExpiry)}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-surface-400 mx-2" />
                  <div className="text-xs font-bold text-purple-700">
                    New: {fmtDate(newExpiry)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FLOW 2 (seats): Additional seat count ── */}
          {upgradeType === 'seats' && selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-5 mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Additional seats to add
              </label>
              <div className="flex items-center gap-3 mb-3">
                <button type="button" onClick={() => adjustUserCount(-1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors">
                  <Minus className="w-4 h-4 text-surface-600" />
                </button>
                <input type="number" min={1} value={userCount} onChange={handleUserCountInput}
                  className="w-20 text-center border border-surface-200 rounded-lg py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-accent-500" />
                <button type="button" onClick={() => adjustUserCount(1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors">
                  <Plus className="w-4 h-4 text-surface-600" />
                </button>
                <span className="text-sm text-surface-500">new seats</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-xs text-surface-600">
                  <span className="font-medium">Current seats:</span> {existingSeats}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-surface-400 mx-2" />
                <div className="text-xs font-bold text-blue-700">
                  Total after upgrade: {existingSeats + Math.max(userCount, 1)}
                </div>
              </div>
            </div>
          )}

          {/* ── FLOW 3 (change_plan): Info — seats unchanged ── */}
          {upgradeType === 'change_plan' && selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-medium text-surface-700">Plan Change Summary</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-50 rounded-lg p-3 border border-surface-100">
                  <p className="text-xs text-surface-500 mb-1">Current Plan</p>
                  <p className="text-sm font-semibold text-surface-900">{currentPlan || '—'}</p>
                </div>
                <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                  <p className="text-xs text-indigo-500 mb-1">New Plan</p>
                  <p className="text-sm font-semibold text-indigo-900">{selectedPlan.display_name || selectedPlan.name}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-surface-500 bg-surface-50 rounded-lg p-2.5">
                <Users className="w-3.5 h-3.5" />
                <span>Seats remain unchanged: <strong className="text-surface-800">{existingSeats}</strong></span>
              </div>
              <ActivationChoice activation={activation} setActivation={setActivation} currentExpiry={currentExpiry} />
            </div>
          )}

          {/* ── FLOW 4 (change_plan_seats): Additional seat count ── */}
          {upgradeType === 'change_plan_seats' && selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium text-surface-700">Plan Change + Additional Seats</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-50 rounded-lg p-3 border border-surface-100">
                  <p className="text-xs text-surface-500 mb-1">Current Plan</p>
                  <p className="text-sm font-semibold text-surface-900">{currentPlan || '—'}</p>
                  <p className="text-xs text-surface-400 mt-0.5">{existingSeats} seats</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                  <p className="text-xs text-violet-500 mb-1">New Plan</p>
                  <p className="text-sm font-semibold text-violet-900">{selectedPlan.display_name || selectedPlan.name}</p>
                  <p className="text-xs text-violet-400 mt-0.5">{existingSeats + Math.max(userCount, 1)} seats</p>
                </div>
              </div>
              <label className="block text-xs font-medium text-surface-700 mb-2">Additional seats to add</label>
              <div className="flex items-center gap-3 mb-3">
                <button type="button" onClick={() => adjustUserCount(-1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors">
                  <Minus className="w-4 h-4 text-surface-600" />
                </button>
                <input type="number" min={1} value={userCount} onChange={handleUserCountInput}
                  className="w-20 text-center border border-surface-200 rounded-lg py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-accent-500" />
                <button type="button" onClick={() => adjustUserCount(1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors">
                  <Plus className="w-4 h-4 text-surface-600" />
                </button>
                <span className="text-sm text-surface-500">new seats</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-violet-50 border border-violet-100">
                <div className="text-xs text-surface-600">
                  <span className="font-medium">Current seats:</span> {existingSeats}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-surface-400 mx-2" />
                <div className="text-xs font-bold text-violet-700">
                  New total: {existingSeats + Math.max(userCount, 1)}
                </div>
              </div>
              <ActivationChoice activation={activation} setActivation={setActivation} currentExpiry={currentExpiry} />
            </div>
          )}

          {/* ── FLOW renewal: User count ── */}
          {upgradeType === 'renewal' && selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-5 mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-3">Number of Users</label>
              <p className="text-[11px] text-surface-400 mb-3 -mt-2">
                Renewing an existing subscription keeps your current licensed seats —
                the final seat count and amount are confirmed at payment.
              </p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => adjustUserCount(-1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors">
                  <Minus className="w-4 h-4 text-surface-600" />
                </button>
                <input type="number" min={1} value={userCount} onChange={handleUserCountInput}
                  className="w-20 text-center border border-surface-200 rounded-lg py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-accent-500" />
                <button type="button" onClick={() => adjustUserCount(1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors">
                  <Plus className="w-4 h-4 text-surface-600" />
                </button>
                <span className="text-sm text-surface-500">users</span>
              </div>
            </div>
          )}

          {/* ── Order summary ── */}
          {selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-6">
              <h3 className="font-semibold text-surface-900 mb-4">Order Summary</h3>

              <div className="space-y-2 mb-3">
                {/* Line item per type */}
                {upgradeType === 'extend' && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-600">
                      {formatCurrency(getPpuForExtension(selectedPlan, extendMonths || 0))} × {existingSeats} seat{existingSeats !== 1 ? 's' : ''} × {extendMonths || 0} month{(extendMonths || 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
                  </div>
                )}

                {upgradeType === 'seats' && (() => {
                  const pro = getProration()
                  return (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-surface-600">
                          {pro
                            ? `${Math.max(userCount, 1)} new seat${userCount !== 1 ? 's' : ''} · prorated for ${pro.remaining} of ${pro.total} days`
                            : `${formatCurrency(getPricePerUser(selectedPlan))} × ${Math.max(userCount, 1)} new seat${userCount !== 1 ? 's' : ''}${billing === 'yearly' ? ' × 12 months' : ''}`}
                        </span>
                        <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
                      </div>
                      <p className="text-[11px] text-surface-400">
                        Seat purchases are billed only for the remaining validity of your current
                        subscription and become part of your licensed seats permanently.
                      </p>
                    </>
                  )
                })()}

                {upgradeType === 'change_plan' && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-surface-600">Plan: {selectedPlan.display_name || selectedPlan.name}</span>
                      <span className="font-medium text-surface-800">{billing === 'yearly' ? 'Yearly' : 'Monthly'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-surface-600">
                        {formatCurrency(getPricePerUser(selectedPlan))} × {existingSeats} seat{existingSeats !== 1 ? 's' : ''}
                        {billing === 'yearly' ? ' × 12 months' : ''}
                      </span>
                      <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
                    </div>
                  </>
                )}

                {upgradeType === 'change_plan_seats' && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-surface-600">Plan: {selectedPlan.display_name || selectedPlan.name}</span>
                      <span className="font-medium text-surface-800">{billing === 'yearly' ? 'Yearly' : 'Monthly'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-surface-600">
                        {formatCurrency(getPricePerUser(selectedPlan))} × {existingSeats + Math.max(userCount, 1)} seats
                        {billing === 'yearly' ? ' × 12 months' : ''}
                      </span>
                      <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
                    </div>
                  </>
                )}

                {upgradeType === 'renewal' && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-600">
                      {formatCurrency(getPricePerUser(selectedPlan))} × {Math.max(userCount, 1)} user{userCount !== 1 ? 's' : ''}
                      {billing === 'yearly' ? ' × 12 months' : ''}
                    </span>
                    <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600">GST (18%)</span>
                  <span className="font-medium text-surface-800">{formatCurrency(taxAmount)}</span>
                </div>
              </div>

              <div className="border-t border-surface-100 pt-3 flex items-center justify-between">
                <span className="font-semibold text-surface-900">Total</span>
                <span className="font-bold text-lg text-surface-900">{formatCurrency(totalAmount)}</span>
              </div>

              <Button
                onClick={handleUpgrade}
                isLoading={isLoading}
                disabled={!canProceed}
                className="w-full mt-5"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Pay &amp; Activate
              </Button>

              <p className="text-xs text-surface-400 text-center mt-3">
                Secure payment · Instant activation
              </p>
            </div>
          )}

          {/* Loading spinner when plans are being fetched for dashboard flows */}
          {loadingPlans && fromDashboard && !showPlanSelector && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default UpgradePlan
