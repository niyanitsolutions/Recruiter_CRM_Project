/**
 * UpgradeSeatsModal — "Manage Subscription"
 *
 * Four independent actions:
 *   extend            – Extend current subscription duration (1 / 3 / 6 / 12 months)
 *   seats             – Add seats only, no plan change
 *   change_plan       – Change plan + billing cycle; seat count stays the same
 *   change_plan_seats – Change plan + add seats
 *
 * Props:
 *   isOpen     – boolean
 *   onClose    – callback
 *   seatStatus – { total_user_seats, current_active_users, remaining_seats,
 *                  plan_name, plan_display_name, plan_expiry, is_trial }
 */

import React, { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { selectUser } from '../../store/authSlice'
import subscriptionService from '../../services/subscriptionService'
import {
  X, Users, Minus, Plus, ArrowRight, Settings,
  Calendar, Clock, Layers, RefreshCw, UserMinus,
} from 'lucide-react'

const DURATION_OPTIONS = [
  { months: 1,  label: '1 Month',   desc: '+30 days'   },
  { months: 3,  label: '3 Months',  desc: '+90 days'   },
  { months: 6,  label: '6 Months',  desc: '+180 days'  },
  { months: 12, label: '12 Months', desc: '+365 days'  },
]

const MODES = [
  { key: 'extend',            label: 'Extend Subscription',  icon: Clock,      desc: 'Add more time to current plan'   },
  { key: 'seats',             label: 'Add Seats',            icon: Users,      desc: 'Add more user seats'             },
  { key: 'change_plan',       label: 'Change Plan',          icon: Layers,     desc: 'Switch to a different plan'      },
  { key: 'change_plan_seats', label: 'Change Plan + Seats',  icon: RefreshCw,  desc: 'New plan with more seats'        },
  { key: 'reduce',            label: 'Reduce Seats',         icon: UserMinus,  desc: 'Takes effect next renewal'       },
]

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
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function SeatCounter({ value, onAdjust, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onAdjust(-1)}
        className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-active)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      >
        <Minus className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
      </button>
      <input
        type="number"
        min={1}
        value={value}
        onChange={onChange}
        className="w-20 text-center border rounded-xl py-2 text-sm font-bold focus:outline-none focus:ring-2"
        style={{
          borderColor: 'var(--border)',
          background:  'var(--bg-card)',
          color:       'var(--text-heading)',
          '--tw-ring-color': '#167CFB',
        }}
      />
      <button
        type="button"
        onClick={() => onAdjust(1)}
        className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-active)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      >
        <Plus className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
      </button>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>seats</span>
    </div>
  )
}

export default function UpgradeSeatsModal({ isOpen, onClose, seatStatus = {} }) {
  const navigate = useNavigate()
  const user = useSelector(selectUser)

  const [mode, setMode]                       = useState('extend')
  const [additionalSeats, setAdditionalSeats] = useState(1)
  const [extendMonths, setExtendMonths]       = useState(null)
  const [targetSeats, setTargetSeats]         = useState(null)   // reduce-seats target
  const [subInfo, setSubInfo]                 = useState(null)   // /payments/current-subscription
  const [busy, setBusy]                       = useState(false)

  const totalSeats = seatStatus?.total_user_seats ?? 0

  // canProceed per mode
  const canProceed = useMemo(() => {
    if (busy) return false
    if (mode === 'extend')            return extendMonths != null
    if (mode === 'seats')             return additionalSeats >= 1
    if (mode === 'change_plan')       return true   // plan selected on next screen
    if (mode === 'change_plan_seats') return additionalSeats >= 1
    if (mode === 'reduce')            return targetSeats != null && targetSeats >= 1 && targetSeats < totalSeats
    return false
  }, [mode, additionalSeats, extendMonths, targetSeats, totalSeats, busy])

  // Subscription overview: licensed seats, scheduled reduction, queued plans
  const loadSubInfo = () => {
    subscriptionService.getCurrentSubscription()
      .then(res => setSubInfo(res.data))
      .catch(() => setSubInfo(null))  // panel simply hides when unavailable
  }

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('extend')
      setAdditionalSeats(1)
      setExtendMonths(null)
      setTargetSeats(null)
      loadSubInfo()
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const {
    total_user_seats     = 0,
    current_active_users = 0,
    remaining_seats      = 0,
    plan_display_name,
    plan_name,
    plan_expiry,
    is_trial             = false,
  } = seatStatus

  const planLabel = plan_display_name || plan_name || 'Current Plan'

  // Preview calculations
  const newSeats  = total_user_seats + (mode === 'seats' || mode === 'change_plan_seats' ? additionalSeats : 0)
  const newExpiry = (mode === 'extend' && extendMonths) ? addMonths(plan_expiry, extendMonths) : null

  const adjustSeats = (delta) => setAdditionalSeats(prev => Math.max(1, prev + delta))
  const handleInputSeats = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1) setAdditionalSeats(val)
  }

  // Reduce seats: direct API call (no payment) — effective next renewal
  const handleReduceSeats = async () => {
    if (!canProceed) return
    setBusy(true)
    try {
      const res = await subscriptionService.scheduleSeatReduction(targetSeats)
      toast.success(
        `Seat reduction scheduled: ${res.data.current_seats} → ${res.data.seats_after_next_renewal} at next renewal. ` +
        'Your current cycle keeps all seats.'
      )
      loadSubInfo()
      setTargetSeats(null)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not schedule seat reduction')
    } finally {
      setBusy(false)
    }
  }

  const handleCancelReduction = async () => {
    setBusy(true)
    try {
      await subscriptionService.cancelSeatReduction()
      toast.success('Scheduled seat reduction cancelled')
      loadSubInfo()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not cancel the reduction')
    } finally {
      setBusy(false)
    }
  }

  const handleCancelQueued = async (entryId) => {
    setBusy(true)
    try {
      await subscriptionService.cancelQueuedPlan(entryId)
      toast.success('Queued plan cancelled')
      loadSubInfo()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not cancel the queued plan')
    } finally {
      setBusy(false)
    }
  }

  const handleProceed = () => {
    if (!canProceed) return
    if (mode === 'reduce') { handleReduceSeats(); return }
    onClose()
    navigate('/upgrade-plan', {
      state: {
        tenantId:        user?.companyId,
        currentPlan:     planLabel,
        additionalSeats: (mode === 'seats' || mode === 'change_plan_seats') ? additionalSeats : 0,
        existingSeats:   total_user_seats,
        extendMonths:    mode === 'extend' ? (extendMonths || 0) : 0,
        currentExpiry:   plan_expiry,
        newExpiry:       newExpiry?.toISOString() ?? null,
        upgradeType:     mode,   // 'extend' | 'seats' | 'change_plan' | 'change_plan_seats'
        fromDashboard:   true,
      },
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(22,124,251,0.10)' }}>
              <Settings className="w-5 h-5" style={{ color: '#167CFB' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-heading)' }}>Manage Subscription</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {planLabel}
                {is_trial && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Trial</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Current plan summary ── */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Seats',     value: total_user_seats,     color: 'var(--text-heading)' },
              { label: 'Active',    value: current_active_users, color: '#4FACFE'             },
              { label: 'Remaining', value: remaining_seats,
                color: remaining_seats === 0 ? '#ef4444' : '#22c55e' },
              { label: 'Expiry',    value: fmtDate(plan_expiry ? new Date(plan_expiry) : null), color: 'var(--text-heading)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                <p className="text-sm font-bold" style={{ color }}>{value ?? '—'}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* ── Pending subscription changes (scheduled reduction / queued plans) ── */}
          {(subInfo?.scheduled_seat_reduction || (subInfo?.queued_subscriptions?.length > 0)) && (
            <div className="space-y-2">
              {subInfo?.scheduled_seat_reduction && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)' }}>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <UserMinus className="w-3.5 h-3.5" style={{ color: '#d97706' }} />
                    <span>
                      Seat reduction scheduled:{' '}
                      <strong>{subInfo.licensed_seats} → {subInfo.scheduled_seat_reduction}</strong> at next renewal
                    </span>
                  </div>
                  <button
                    onClick={handleCancelReduction}
                    disabled={busy}
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                    style={{ color: '#d97706', border: '1px solid rgba(217,119,6,0.35)' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {(subInfo?.queued_subscriptions || []).map(q => (
                <div key={q.id} className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(22,124,251,0.06)', border: '1px solid rgba(22,124,251,0.20)' }}>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <Layers className="w-3.5 h-3.5" style={{ color: '#167CFB' }} />
                    <span>
                      {q.status === 'queued' ? 'Queued plan' : 'Activated plan'}:{' '}
                      <strong>{q.plan_name}</strong> · {q.seats} seats
                      {q.status === 'queued' && q.activation_date && (
                        <> · activates {fmtDate(new Date(q.activation_date))}</>
                      )}
                    </span>
                  </div>
                  {q.status === 'queued' && (
                    <button
                      onClick={() => handleCancelQueued(q.id)}
                      disabled={busy}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                      style={{ color: '#167CFB', border: '1px solid rgba(22,124,251,0.35)' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Action selector ── */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>What would you like to do?</p>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(m => {
                const MIcon = m.icon
                const active = mode === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => { setMode(m.key); setExtendMonths(null); setAdditionalSeats(1); setTargetSeats(null) }}
                    className="flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all"
                    style={{
                      borderColor: active ? '#167CFB' : 'var(--border)',
                      background:  active ? 'rgba(22,124,251,0.06)' : 'var(--bg-hover)',
                    }}
                  >
                    <MIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: active ? '#167CFB' : 'var(--text-muted)' }} />
                    <div>
                      <p className="text-xs font-semibold leading-tight" style={{ color: active ? '#167CFB' : 'var(--text-secondary)' }}>
                        {m.label}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Mode-specific inputs ── */}
          <div className="space-y-3">

            {/* Extend: duration picker */}
            {mode === 'extend' && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  <Calendar className="inline w-3.5 h-3.5 mr-1" />
                  Extend by how many months?
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.months}
                      onClick={() => setExtendMonths(prev => prev === opt.months ? null : opt.months)}
                      className="py-2 px-1 rounded-xl border-2 text-center transition-all"
                      style={{
                        borderColor: extendMonths === opt.months ? '#167CFB' : 'var(--border)',
                        background:  extendMonths === opt.months ? 'rgba(22,124,251,0.06)' : 'var(--bg-hover)',
                      }}
                    >
                      <p className="text-sm font-bold" style={{ color: extendMonths === opt.months ? '#167CFB' : 'var(--text-heading)' }}>
                        {opt.months}M
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
                {extendMonths && plan_expiry && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(22,124,251,0.06)', border: '1px solid rgba(22,124,251,0.15)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-medium">Current:</span> {fmtDate(new Date(plan_expiry))}
                    </div>
                    <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs font-bold" style={{ color: '#167CFB' }}>
                      {fmtDate(newExpiry)} <span className="font-normal opacity-70">(new expiry)</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Add Seats: seat counter */}
            {mode === 'seats' && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  <Users className="inline w-3.5 h-3.5 mr-1" />
                  Additional seats to add
                </p>
                <SeatCounter value={additionalSeats} onAdjust={adjustSeats} onChange={handleInputSeats} />
                {additionalSeats >= 1 && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.15)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{total_user_seats} seats</span>
                    <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs font-bold" style={{ color: '#4FACFE' }}>
                      {newSeats} seats <span className="font-normal opacity-70">(after upgrade)</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Change Plan: info only — plan selected on next screen */}
            {mode === 'change_plan' && (
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(22,124,251,0.06)', border: '1px solid rgba(22,124,251,0.15)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#167CFB' }}>Plan selection on next screen</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Your current <strong>{total_user_seats}</strong> seats will carry over to the new plan.
                  Choose your plan and billing cycle on the payment screen.
                </p>
              </div>
            )}

            {/* Reduce Seats: target seat count — effective next renewal */}
            {mode === 'reduce' && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  <UserMinus className="inline w-3.5 h-3.5 mr-1" />
                  Licensed seats from next renewal
                </p>
                <SeatCounter
                  value={targetSeats ?? Math.max(1, totalSeats - 1)}
                  onAdjust={(delta) => setTargetSeats(prev => {
                    const base = prev ?? Math.max(1, totalSeats - 1)
                    return Math.min(Math.max(1, base + delta), Math.max(1, totalSeats - 1))
                  })}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val)) setTargetSeats(Math.min(Math.max(1, val), Math.max(1, totalSeats - 1)))
                  }}
                />
                <div className="mt-2 rounded-xl px-4 py-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Reductions never apply immediately — your current cycle keeps all{' '}
                    <strong>{totalSeats}</strong> seats and no user is deactivated. The new count
                    takes effect at your next renewal.
                  </p>
                </div>
                {targetSeats != null && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{totalSeats} seats now</span>
                    <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs font-bold" style={{ color: '#d97706' }}>
                      {targetSeats} seats <span className="font-normal opacity-70">(next renewal)</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Change Plan + Seats: seat counter + info */}
            {mode === 'change_plan_seats' && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                    <Users className="inline w-3.5 h-3.5 mr-1" />
                    Additional seats to add
                  </p>
                  <SeatCounter value={additionalSeats} onAdjust={adjustSeats} onChange={handleInputSeats} />
                  {additionalSeats >= 1 && (
                    <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.15)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{total_user_seats} seats</span>
                      <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-xs font-bold" style={{ color: '#4FACFE' }}>
                        {newSeats} seats <span className="font-normal opacity-70">(new total)</span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(22,124,251,0.06)', border: '1px solid rgba(22,124,251,0.15)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    You'll select the new plan and billing cycle on the payment screen.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Action buttons ── */}
          <button
            onClick={handleProceed}
            disabled={!canProceed}
            className="w-full flex items-center justify-center gap-2 font-semibold py-3 px-4 rounded-xl transition-all text-white"
            style={{
              background: canProceed ? '#167CFB' : 'var(--bg-disabled)',
              cursor:     canProceed ? 'pointer' : 'not-allowed',
              opacity:    canProceed ? 1 : 0.6,
            }}
            onMouseEnter={e => canProceed && (e.currentTarget.style.background = '#0267F9')}
            onMouseLeave={e => canProceed && (e.currentTarget.style.background = '#167CFB')}
          >
            {mode === 'reduce'
              ? (busy ? 'Scheduling…' : 'Schedule Reduction')
              : (mode === 'change_plan' || mode === 'change_plan_seats') ? 'Select Plan & Pay' : 'Proceed to Payment'}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="w-full text-sm py-2 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
