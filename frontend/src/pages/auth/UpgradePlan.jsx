import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { Check, CreditCard, Calendar, Users, ArrowRight, CheckCircle, Smartphone, Minus, Plus } from 'lucide-react'
import authService from '../../services/authService'
import api from '../../services/api'
import { formatCurrency } from '../../utils/format'
import { Button } from '../../components/common'

const BILLING_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly',  badge: 'Save ~33%' },
]

const UpgradePlan = () => {
  const location    = useLocation()
  const navigate    = useNavigate()
  const expiredInfo = location.state || {}

  const [plans,        setPlans]        = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [billing,      setBilling]      = useState('monthly')
  const [userCount,    setUserCount]    = useState(3)
  const [isLoading,    setIsLoading]    = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [success,      setSuccess]      = useState(null)

  // Redirect missing context away
  useEffect(() => {
    if (!expiredInfo.tenantId) {
      navigate('/login', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await authService.getPlans()
        // Exclude trial plans for renewal
        const paid = (res.data.plans || []).filter(p => !p.is_trial)
        setPlans(paid)
        if (paid.length > 0) {
          const popular = paid.find(p => p.is_popular) || paid[0]
          setSelectedPlan(popular)
        }
      } catch {
        toast.error('Failed to load plans')
      } finally {
        setLoadingPlans(false)
      }
    }
    fetchPlans()
  }, [])

  const getPricePerUser = (plan) => {
    if (!plan) return 0
    return billing === 'yearly' ? plan.price_per_user_yearly : plan.price_per_user_monthly
  }

  const getSubtotal = (plan) => {
    if (!plan) return 0
    const ppu   = getPricePerUser(plan)
    const users = Math.max(userCount, 1)
    return billing === 'yearly' ? ppu * users * 12 : ppu * users
  }

  const adjustUserCount = (delta) => {
    setUserCount(prev => Math.max(1, prev + delta))
  }

  const handleUserCountInput = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1) setUserCount(val)
  }

  const handleUpgrade = async () => {
    if (!selectedPlan) { toast.error('Please select a plan'); return }
    setIsLoading(true)
    try {
      // Step 1: Create renewal order
      const orderRes = await api.post('/auth/renew/create-order', {
        tenant_id:     expiredInfo.tenantId,
        plan_id:       selectedPlan.id,
        billing_cycle: billing,
        user_count:    Math.max(userCount, 1),
      })
      const order = orderRes.data

      // Step 2: In production, open Razorpay here.
      // For now we simulate a successful payment with dummy IDs.
      const dummyPaymentId = `pay_${Date.now()}`
      const dummySignature = 'simulated_signature'

      const verifyRes = await api.post('/auth/renew/verify-payment', {
        razorpay_order_id:   order.razorpay_order_id,
        razorpay_payment_id: dummyPaymentId,
        razorpay_signature:  dummySignature,
      })

      setSuccess({
        planName:   selectedPlan.display_name || selectedPlan.name,
        planExpiry: verifyRes.data.plan_expiry,
        invoice:    verifyRes.data.invoice_number,
      })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payment failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-surface-200 p-8 text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-surface-900 mb-2">Subscription Renewed!</h2>
          <p className="text-surface-500 mb-6">
            Your <span className="font-medium text-surface-800">{success.planName}</span> plan is now active.
          </p>
          {success.invoice && (
            <p className="text-xs text-surface-400 mb-6">Invoice: {success.invoice}</p>
          )}
          <Link
            to="/login"
            className="block w-full px-4 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl text-center transition-colors"
          >
            Sign In to Continue
          </Link>
        </div>
      </div>
    )
  }

  const subtotal   = selectedPlan ? getSubtotal(selectedPlan) : 0
  const taxAmount  = Math.round(subtotal * 0.18)
  const totalAmount = subtotal + taxAmount

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-lg text-white">
            C
          </div>
          <div>
            <h1 className="font-bold text-lg text-surface-900">CRM Platform</h1>
            <p className="text-xs text-surface-500">Subscription Renewal</p>
          </div>
        </div>
        <Link to="/login" className="text-sm text-accent-600 hover:text-accent-700 font-medium">
          ← Back to Login
        </Link>
      </div>

      <div className="flex justify-center py-10 px-4">
        <div className="w-full max-w-3xl animate-fade-in">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-3">
              <Calendar className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Renew Your Subscription</h2>
            <p className="text-surface-500 mt-1 text-sm">Choose a plan to restore access to your CRM</p>
          </div>

          {/* Billing cycle toggle */}
          <div className="flex items-center justify-center gap-2 mb-8">
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

          {/* User count selector */}
          {selectedPlan && (
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

          {/* Order summary & pay */}
          {selectedPlan && (
            <div className="bg-white rounded-xl border border-surface-200 p-6">
              <h3 className="font-semibold text-surface-900 mb-4">Order Summary</h3>

              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-surface-600">
                  {formatCurrency(getPricePerUser(selectedPlan))} × {Math.max(userCount, 1)} user{Math.max(userCount, 1) !== 1 ? 's' : ''}
                  {billing === 'yearly' ? ' × 12 months' : ''}
                </span>
                <span className="font-medium text-surface-800">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-surface-600">GST (18%)</span>
                <span className="font-medium text-surface-800">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="border-t border-surface-100 pt-3 mt-3 flex items-center justify-between">
                <span className="font-semibold text-surface-900">Total</span>
                <span className="font-bold text-lg text-surface-900">{formatCurrency(totalAmount)}</span>
              </div>

              <Button
                onClick={handleUpgrade}
                isLoading={isLoading}
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
        </div>
      </div>
    </div>
  )
}

export default UpgradePlan
