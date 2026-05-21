import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import {
  Check, CreditCard, Calendar, Users, ArrowRight, CheckCircle,
  Smartphone, Minus, Plus, Clock, Layers,
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

// ── Helper ────────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

const UpgradePlan = () => {
  const location    = useLocation()
  const navigate    = useNavigate()
  const state       = location.state || {}

  // ── Navigation state fields ────────────────────────────────────────────────
  const fromDashboard  = Boolean(state.fromDashboard)
  const upgradeType    = state.upgradeType || 'renewal'   // 'duration' | 'seats' | 'both' | 'renewal'
  const tenantId       = state.tenantId
  const existingSeats  = state.existingSeats  || 0
  const currentExpiry  = state.currentExpiry  || null
  const currentPlan    = state.currentPlan    || ''

  // ── Local state ────────────────────────────────────────────────────────────
  const [plans,        setPlans]        = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [billing,      setBilling]      = useState('monthly')
  const [userCount,    setUserCount]    = useState(
    fromDashboard ? (state.additionalSeats || 1) : 3
  )
  const [extendMonths, setExtendMonths] = useState(state.extendMonths || null)
  const [isLoading,    setIsLoading]    = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [success,      setSuccess]      = useState(null)

  // ── Guards ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId && !fromDashboard && !state.fromRegistration) {
      navigate('/login', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch plans (needed for pricing) ──────────────────────────────────────
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await authService.getPlans()
        const paid = (res.data.plans || []).filter(p => !p.is_trial)
        setPlans(paid)
        if (paid.length > 0) {
          // For dashboard upgrade flows, always use the tenant's current plan for pricing.
          // Selecting the wrong plan (e.g. popular Quantum when user is on Neon) causes
          // wrong amounts to be shown and the wrong plan name to be written to DB after payment.
          if (fromDashboard && currentPlan) {
            const matched = paid.find(p =>
              p.display_name?.toLowerCase() === currentPlan.toLowerCase() ||
              p.name?.toLowerCase() === currentPlan.toLowerCase()
            )
            setSelectedPlan(matched || paid.find(p => p.is_popular) || paid[0])
          } else {
            setSelectedPlan(paid.find(p => p.is_popular) || paid[0])
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

  // ── Pricing helpers ────────────────────────────────────────────────────────
  const getPricePerUser = (plan) => {
    if (!plan) return 0
    return billing === 'yearly'
      ? plan.price_per_user_yearly
      : plan.price_per_user_monthly
  }

  // For duration extensions: 12-month automatically uses the yearly (discounted) rate
  const getPpuForExtension = (plan, months) => {
    if (!plan) return 0
    return months >= 12 ? plan.price_per_user_yearly : plan.price_per_user_monthly
  }

  const getSubtotal = (plan) => {
    if (!plan) return 0
    const ppu = getPricePerUser(plan)

    if (upgradeType === 'duration') {
      // 12-month extension uses yearly (discounted) rate automatically
      const months = extendMonths || 1
      return getPpuForExtension(plan, months) * existingSeats * months
    }

    if (upgradeType === 'seats') {
      // Charge: additional_seats × price (× 12 if yearly)
      return billing === 'yearly'
        ? ppu * Math.max(userCount, 1) * 12
        : ppu * Math.max(userCount, 1)
    }

    if (upgradeType === 'both') {
      const months   = extendMonths || 1
      const ppuExt   = getPpuForExtension(plan, months)
      const seatCost = ppu * Math.max(userCount, 1)
      const extCost  = ppuExt * existingSeats * months
      return seatCost + extCost
    }

    // renewal — standard billing
    return billing === 'yearly'
      ? ppu * Math.max(userCount, 1) * 12
      : ppu * Math.max(userCount, 1)
  }

  // ── Adjust counts ──────────────────────────────────────────────────────────
  const adjustUserCount = (delta) => setUserCount(prev => Math.max(1, prev + delta))
  const handleUserCountInput = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1) setUserCount(val)
  }

  // ── Payment handler ────────────────────────────────────────────────────────
  const handleUpgrade = async () => {
    if (!selectedPlan) { toast.error('Please select a plan'); return }
    if (upgradeType === 'duration' && !extendMonths) {
      toast.error('Please select how many months to extend')
      return
    }
    if (upgradeType === 'both' && !extendMonths) {
      toast.error('Please select how many months to extend')
      return
    }

    setIsLoading(true)
    try {
      let orderRes

      if (upgradeType === 'duration') {
        // Flow A — extend expiry only, no seat change
        orderRes = await subscriptionService.createExtensionOrder(
          tenantId,
          selectedPlan.id,
          extendMonths,
        )
      } else if (upgradeType === 'seats') {
        // Flow B — add seats only, no expiry change
        orderRes = await subscriptionService.createSeatUpgradeOrder(
          tenantId,
          selectedPlan.id,
          Math.max(userCount, 1),
          billing,
        )
      } else if (upgradeType === 'both') {
        // Flow C — add seats + extend expiry
        orderRes = await subscriptionService.createCombinedUpgradeOrder(
          tenantId,
          selectedPlan.id,
          Math.max(userCount, 1),
          extendMonths,
          billing,
        )
      } else {
        // Flow D — standard renewal (plan selector mode)
        orderRes = await import('../../services/api').then(m =>
          m.default.post('/auth/renew/create-order', {
            tenant_id:     tenantId,
            plan_id:       selectedPlan.id,
            billing_cycle: billing,
            user_count:    Math.max(userCount, 1),
            payment_type:  'renewal',
            extend_months: 0,
          })
        )
      }

      const order = orderRes.data

      // Simulate successful payment (replace with Razorpay in production)
      const dummyPaymentId = `pay_${Date.now()}`
      const dummySignature = 'simulated_signature'

      const { default: api } = await import('../../services/api')
      const verifyRes = await api.post('/auth/renew/verify-payment', {
        razorpay_order_id:   order.razorpay_order_id,
        razorpay_payment_id: dummyPaymentId,
        razorpay_signature:  dummySignature,
      })

      setSuccess({
        planName:     selectedPlan.display_name || selectedPlan.name,
        planExpiry:   verifyRes.data.plan_expiry,
        invoice:      verifyRes.data.invoice_number,
        upgradeType,
        newSeats:     upgradeType !== 'duration' ? existingSeats + Math.max(userCount, 1) : existingSeats,
        extendMonths: upgradeType !== 'seats' ? extendMonths : 0,
      })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payment failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Computed values ────────────────────────────────────────────────────────
  const subtotal    = selectedPlan ? getSubtotal(selectedPlan) : 0
  const taxAmount   = Math.round(subtotal * 0.18)
  const totalAmount = subtotal + taxAmount
  const newExpiry   = upgradeType !== 'seats' && extendMonths
    ? addMonths(currentExpiry, extendMonths)
    : null
  const canProceed = upgradeType === 'seats'
    ? userCount >= 1
    : upgradeType === 'duration'
    ? extendMonths != null
    : upgradeType === 'both'
    ? userCount >= 1 || extendMonths != null
    : !!selectedPlan

  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (success) {
    const successMessages = {
      duration: 'Your subscription has been extended!',
      seats:    'New seats have been added to your plan!',
      both:     'Seats added and subscription extended!',
      renewal:  'Subscription Renewed!',
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
            Your <span className="font-medium text-surface-800">{success.planName}</span> plan has been updated.
          </p>
          <div className="space-y-2 mb-6">
            {success.planExpiry && (
              <p className="text-sm text-surface-600">
                New expiry: <strong>{fmtDate(success.planExpiry)}</strong>
              </p>
            )}
            {success.newSeats > existingSeats && (
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
  // PAGE TITLE per upgrade type
  // ─────────────────────────────────────────────────────────────────────────
  const pageConfig = {
    duration: { title: 'Extend Subscription Duration', subtitle: 'Add more time to your current plan', icon: Clock,    iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
    seats:    { title: 'Add User Seats',                subtitle: 'Add more seats to your plan',        icon: Users,    iconBg: 'bg-blue-100',   iconColor: 'text-blue-600'   },
    both:     { title: 'Upgrade: Seats + Extend',       subtitle: 'Add seats and extend your plan',     icon: Layers,   iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600' },
    renewal:  { title: 'Renew Your Subscription',       subtitle: 'Choose a plan to restore access',    icon: Calendar, iconBg: 'bg-amber-100',  iconColor: 'text-amber-600'  },
  }
  const pc = pageConfig[upgradeType] || pageConfig.renewal
  const PageIcon = pc.icon

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/Hire_Flow_Logo.png" alt="HireFlow" style={{ height: '32px', width: 'auto' }} />
          <div>
            <p className="text-xs text-surface-500">Subscription Management</p>
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
              </p>
            )}
          </div>

          {/* ── Plan selector — only for full renewal (not dashboard upgrades) ── */}
          {!fromDashboard && (
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

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* FLOW-SPECIFIC INPUT SECTIONS                                       */}
          {/* ══════════════════════════════════════════════════════════════════ */}

          {/* ── FLOW A / C : Duration picker ─────────────────────────────────── */}
          {(upgradeType === 'duration' || upgradeType === 'both') && selectedPlan && (
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
                    <p className={clsx(
                      'text-sm font-bold',
                      extendMonths === opt.months ? 'text-purple-700' : 'text-surface-800'
                    )}>
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

          {/* ── FLOW B / C : Seat count ───────────────────────────────────────── */}
          {(upgradeType === 'seats' || upgradeType === 'both') && selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-5 mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Additional seats to add
              </label>
              <div className="flex items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => adjustUserCount(-1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors"
                >
                  <Minus className="w-4 h-4 text-surface-600" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={userCount}
                  onChange={handleUserCountInput}
                  className="w-20 text-center border border-surface-200 rounded-lg py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                <button
                  type="button"
                  onClick={() => adjustUserCount(1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors"
                >
                  <Plus className="w-4 h-4 text-surface-600" />
                </button>
                <span className="text-sm text-surface-500">new seats</span>
              </div>

              {/* Current → total seats preview */}
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

          {/* ── FLOW D (renewal) : User count ────────────────────────────────── */}
          {upgradeType === 'renewal' && selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-5 mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-3">
                Number of Users
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => adjustUserCount(-1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors"
                >
                  <Minus className="w-4 h-4 text-surface-600" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={userCount}
                  onChange={handleUserCountInput}
                  className="w-20 text-center border border-surface-200 rounded-lg py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                <button
                  type="button"
                  onClick={() => adjustUserCount(1)}
                  className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors"
                >
                  <Plus className="w-4 h-4 text-surface-600" />
                </button>
                <span className="text-sm text-surface-500">users</span>
              </div>
            </div>
          )}

          {/* ── Order summary ──────────────────────────────────────────────────── */}
          {selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-6">
              <h3 className="font-semibold text-surface-900 mb-4">Order Summary</h3>

              {/* Line items */}
              <div className="space-y-2 mb-3">
                {upgradeType === 'duration' && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-600">
                      {formatCurrency(getPricePerUser(selectedPlan))} × {existingSeats} seat{existingSeats !== 1 ? 's' : ''} × {extendMonths || 0} month{(extendMonths || 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
                  </div>
                )}

                {upgradeType === 'seats' && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-600">
                      {formatCurrency(getPricePerUser(selectedPlan))} × {Math.max(userCount, 1)} new seat{userCount !== 1 ? 's' : ''}
                      {billing === 'yearly' ? ' × 12 months' : ''}
                    </span>
                    <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
                  </div>
                )}

                {upgradeType === 'both' && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-surface-600">
                        {Math.max(userCount, 1)} new seat{userCount !== 1 ? 's' : ''} × {formatCurrency(getPricePerUser(selectedPlan))}
                      </span>
                      <span className="font-medium text-surface-800">
                        {formatCurrency(getPricePerUser(selectedPlan) * Math.max(userCount, 1))}
                      </span>
                    </div>
                    {extendMonths && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-surface-600">
                          Extension: {existingSeats} seat{existingSeats !== 1 ? 's' : ''} × {formatCurrency(getPricePerUser(selectedPlan))} × {extendMonths} month{extendMonths !== 1 ? 's' : ''}
                        </span>
                        <span className="font-medium text-surface-800">
                          {formatCurrency(getPricePerUser(selectedPlan) * existingSeats * extendMonths)}
                        </span>
                      </div>
                    )}
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

          {/* Loading state for plan fetch */}
          {loadingPlans && fromDashboard && (
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
