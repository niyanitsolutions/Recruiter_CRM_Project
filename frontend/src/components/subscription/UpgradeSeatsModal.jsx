/**
 * UpgradeSeatsModal
 *
 * Supports three upgrade modes:
 *   A — Extend subscription duration only (1 / 3 / 6 / 12 months)
 *   B — Add seats only
 *   C — Add seats + extend duration together
 *
 * The "Proceed" button is enabled when:
 *   A → a duration is selected
 *   B → additionalSeats >= 1
 *   C → additionalSeats >= 1 OR a duration is selected
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
import { selectUser } from '../../store/authSlice'
import {
  X, Users, Minus, Plus, ArrowRight, CreditCard,
  Calendar, Clock, Layers,
} from 'lucide-react'

const DURATION_OPTIONS = [
  { months: 1,  label: '1 Month',   desc: '+30 days'   },
  { months: 3,  label: '3 Months',  desc: '+90 days'   },
  { months: 6,  label: '6 Months',  desc: '+180 days'  },
  { months: 12, label: '12 Months', desc: '+365 days'  },
]

const MODES = [
  { key: 'duration', label: 'Extend Duration', icon: Clock,   desc: 'Add more time to your subscription' },
  { key: 'seats',    label: 'Add Seats',        icon: Users,   desc: 'Add more user seats to your plan'   },
  { key: 'both',     label: 'Seats + Extend',   icon: Layers,  desc: 'Add seats and extend subscription'  },
]

function addMonths(dateStr, months) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  // Extend from current expiry (or today if already expired)
  const base = d < new Date() ? new Date() : d
  const result = new Date(base)
  result.setMonth(result.getMonth() + months)
  return result
}

function fmtDate(d) {
  if (!d) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function UpgradeSeatsModal({ isOpen, onClose, seatStatus = {} }) {
  const navigate = useNavigate()
  const user = useSelector(selectUser)

  const [mode, setMode]                 = useState('seats')
  const [additionalSeats, setAdditionalSeats] = useState(1)
  const [extendMonths, setExtendMonths] = useState(null)

  // ── Button enable logic — must be before early return (Rules of Hooks) ──────
  const canProceed = useMemo(() => {
    if (mode === 'duration') return extendMonths != null
    if (mode === 'seats')    return additionalSeats >= 1
    return additionalSeats >= 1 || extendMonths != null
  }, [mode, additionalSeats, extendMonths])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('seats')
      setAdditionalSeats(1)
      setExtendMonths(null)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

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

  // ── Preview calculations ──────────────────────────────────────────────────
  const newSeats   = total_user_seats + (mode !== 'duration' ? additionalSeats : 0)
  const newExpiry  = (mode !== 'seats' && extendMonths)
    ? addMonths(plan_expiry, extendMonths)
    : null

  const adjustSeats = (delta) => setAdditionalSeats(prev => Math.max(1, prev + delta))

  const handleInputSeats = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1) setAdditionalSeats(val)
  }

  const handleProceed = () => {
    if (!canProceed) return
    onClose()
    navigate('/upgrade-plan', {
      state: {
        tenantId:        user?.companyId,
        currentPlan:     planLabel,
        // seats
        additionalSeats: mode !== 'duration' ? additionalSeats : 0,
        existingSeats:   total_user_seats,
        // duration
        extendMonths:    mode !== 'seats' ? (extendMonths || 0) : 0,
        currentExpiry:   plan_expiry,
        newExpiry:       newExpiry?.toISOString() ?? null,
        // upgrade type
        upgradeType:     mode,   // 'duration' | 'seats' | 'both'
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
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.10)' }}>
              <CreditCard className="w-5 h-5" style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-heading)' }}>Upgrade Subscription</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {planLabel}{is_trial && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Trial</span>}
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
              { label: 'Seats',     value: total_user_seats,    color: 'var(--text-heading)' },
              { label: 'Active',    value: current_active_users, color: '#4FACFE'            },
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

          {/* ── Mode selector ── */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>What would you like to do?</p>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => {
                const MIcon = m.icon
                const active = mode === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => { setMode(m.key); setExtendMonths(null); setAdditionalSeats(1) }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all"
                    style={{
                      borderColor: active ? '#7c3aed' : 'var(--border)',
                      background:  active ? 'rgba(124,58,237,0.06)' : 'var(--bg-hover)',
                    }}
                  >
                    <MIcon className="w-4 h-4" style={{ color: active ? '#7c3aed' : 'var(--text-muted)' }} />
                    <span className="text-xs font-semibold leading-tight" style={{ color: active ? '#7c3aed' : 'var(--text-secondary)' }}>
                      {m.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Mode inputs ── */}
          <div className="space-y-4">

            {/* Duration picker — shown for 'duration' and 'both' */}
            {(mode === 'duration' || mode === 'both') && (
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
                        borderColor: extendMonths === opt.months ? '#7c3aed' : 'var(--border)',
                        background:  extendMonths === opt.months ? 'rgba(124,58,237,0.06)' : 'var(--bg-hover)',
                      }}
                    >
                      <p className="text-sm font-bold" style={{ color: extendMonths === opt.months ? '#7c3aed' : 'var(--text-heading)' }}>
                        {opt.months}M
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
                {extendMonths && plan_expiry && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Current expiry</span>
                    <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs font-bold" style={{ color: '#7c3aed' }}>
                      {fmtDate(newExpiry)} <span className="font-normal opacity-70">(new expiry)</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Seat counter — shown for 'seats' and 'both' */}
            {(mode === 'seats' || mode === 'both') && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  <Users className="inline w-3.5 h-3.5 mr-1" />
                  Additional seats to add
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => adjustSeats(-1)}
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
                    value={additionalSeats}
                    onChange={handleInputSeats}
                    className="w-20 text-center border rounded-xl py-2 text-sm font-bold focus:outline-none focus:ring-2"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-heading)',
                      '--tw-ring-color': '#7c3aed',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => adjustSeats(1)}
                    className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-active)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  >
                    <Plus className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>seats</span>
                </div>
                {additionalSeats >= 1 && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.15)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{total_user_seats} seats</span>
                    <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs font-bold" style={{ color: '#4FACFE' }}>
                      {newSeats} seats <span className="font-normal opacity-70">(after upgrade)</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Action buttons ── */}
          <button
            onClick={handleProceed}
            disabled={!canProceed}
            className="w-full flex items-center justify-center gap-2 font-semibold py-3 px-4 rounded-xl transition-all text-white"
            style={{
              background:  canProceed ? '#7c3aed' : 'var(--bg-disabled)',
              cursor:      canProceed ? 'pointer' : 'not-allowed',
              opacity:     canProceed ? 1 : 0.6,
            }}
            onMouseEnter={e => canProceed && (e.currentTarget.style.background = '#6d28d9')}
            onMouseLeave={e => canProceed && (e.currentTarget.style.background = '#7c3aed')}
          >
            Proceed to Payment
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
