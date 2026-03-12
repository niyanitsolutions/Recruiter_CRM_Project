/**
 * SubscriptionBanner
 *
 * Displays a dismissible banner when a subscription is near expiry or expired.
 * Also shows a compact seat-usage row (Purchased / Current / Remaining).
 *
 * Props:
 *   seatStatus  – object from GET /users/seat-status or /sellers/me/seat-status
 *   onUpgrade   – callback when user clicks "Upgrade" / "Renew"
 */

import React, { useState } from 'react'
import { AlertTriangle, X, Users, CreditCard, ArrowRight } from 'lucide-react'

const EXPIRY_WARN_DAYS = 7   // show warning banner within 7 days of expiry

function daysUntil(isoString) {
  if (!isoString) return null
  const diff = new Date(isoString) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function SubscriptionBanner({ seatStatus, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false)

  if (!seatStatus || dismissed) return null

  const {
    plan_name,
    plan_display_name,
    plan_expiry,
    plan_expiry_date,       // seller field name
    is_expired,
    total_user_seats,
    current_active_users,
    remaining_seats,
  } = seatStatus

  const expiryIso  = plan_expiry || plan_expiry_date
  const daysLeft   = daysUntil(expiryIso)
  const showBanner = is_expired || (daysLeft !== null && daysLeft <= EXPIRY_WARN_DAYS)

  if (!showBanner) return null

  const isExpired   = is_expired || daysLeft <= 0
  const bgClass     = isExpired ? 'bg-red-50 border-red-200'   : 'bg-amber-50 border-amber-200'
  const iconClass   = isExpired ? 'text-red-500'                : 'text-amber-500'
  const textClass   = isExpired ? 'text-red-800'                : 'text-amber-800'
  const btnClass    = isExpired
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-amber-600 hover:bg-amber-700 text-white'

  const expiryLabel = isExpired
    ? 'Your subscription has expired.'
    : `Your subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`

  return (
    <div className={`border rounded-xl p-4 mb-4 ${bgClass}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconClass}`} />

        <div className="flex-1 min-w-0">
          {/* Expiry message */}
          <p className={`text-sm font-semibold ${textClass}`}>{expiryLabel}</p>
          {isExpired && (
            <p className={`text-xs mt-0.5 ${textClass} opacity-80`}>
              Please upgrade your plan to continue using the platform.
            </p>
          )}

          {/* Seat summary row */}
          <div className="flex flex-wrap items-center gap-4 mt-2">
            <SeatPill label="Plan" value={plan_display_name || plan_name} icon={CreditCard} textClass={textClass} />
            <SeatPill label="Purchased Seats" value={total_user_seats} icon={Users} textClass={textClass} />
            <SeatPill label="Active Users"     value={current_active_users} textClass={textClass} />
            <SeatPill label="Remaining"        value={remaining_seats}      textClass={textClass} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onUpgrade}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${btnClass}`}
          >
            {isExpired ? 'Renew Now' : 'Upgrade'}
            <ArrowRight className="w-3 h-3" />
          </button>
          {!isExpired && (
            <button
              onClick={() => setDismissed(true)}
              className={`p-1.5 rounded-lg hover:bg-black/10 transition-colors ${textClass}`}
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SeatPill({ label, value, icon: Icon, textClass }) {
  return (
    <div className={`flex items-center gap-1 text-xs ${textClass}`}>
      {Icon && <Icon className="w-3.5 h-3.5 opacity-70" />}
      <span className="opacity-70">{label}:</span>
      <span className="font-semibold">{value ?? '—'}</span>
    </div>
  )
}
