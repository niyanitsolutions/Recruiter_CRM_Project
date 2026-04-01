/**
 * UpgradeSeatsModal
 *
 * Shown when the user clicks "Upgrade / Add Seats" on the dashboard or inside
 * the SeatLimitModal. Displays current plan info, lets the user choose how many
 * additional seats they want, and then navigates to the UpgradePlan page with
 * the required context so the payment flow can complete.
 *
 * Props:
 *   isOpen     – boolean
 *   onClose    – callback
 *   seatStatus – { total_user_seats, current_active_users, remaining_seats,
 *                  plan_name, plan_display_name, plan_expiry, is_trial }
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import { X, Users, Minus, Plus, ArrowRight, CreditCard } from 'lucide-react'

export default function UpgradeSeatsModal({ isOpen, onClose, seatStatus = {} }) {
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const [additionalSeats, setAdditionalSeats] = useState(0)

  if (!isOpen) return null

  const {
    total_user_seats    = 0,
    current_active_users = 0,
    remaining_seats     = 0,
    plan_display_name,
    plan_name,
    plan_expiry,
    is_trial            = false,
  } = seatStatus

  const planLabel  = plan_display_name || plan_name || 'Current Plan'
  const newTotal   = total_user_seats + additionalSeats

  const adjust = (delta) => setAdditionalSeats(prev => Math.max(0, prev + delta))

  const handleInput = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 0) setAdditionalSeats(val)
  }

  const handleProceed = () => {
    if (additionalSeats < 1) return
    onClose()
    navigate('/upgrade-plan', {
      state: {
        tenantId:        user?.companyId,
        currentPlan:     planLabel,
        additionalSeats,
        existingSeats:   total_user_seats,
        fromDashboard:   true,
      },
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon + Title */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-accent-50 rounded-2xl flex items-center justify-center">
            <CreditCard className="w-7 h-7 text-accent-600" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-surface-900 text-center mb-1">
          Upgrade / Add Seats
        </h2>
        <p className="text-sm text-surface-500 text-center mb-6">
          Add more user seats to your subscription.
        </p>

        {/* Current plan summary */}
        <div className="bg-surface-50 rounded-xl p-4 mb-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-surface-600">Current Plan</span>
            <span className="text-sm font-semibold text-surface-900">
              {planLabel}
              {is_trial && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Trial</span>
              )}
            </span>
          </div>
          <div className="border-t border-surface-200" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-surface-600">Purchased Seats</span>
            <span className="text-sm font-medium text-surface-900">{total_user_seats}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-surface-600">Active Users</span>
            <span className="text-sm font-medium text-surface-900">{current_active_users}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-surface-600">Remaining Seats</span>
            <span className={`text-sm font-medium ${remaining_seats === 0 ? 'text-red-600' : 'text-green-600'}`}>
              {remaining_seats}
            </span>
          </div>
          {plan_expiry && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-surface-600">Expiry</span>
              <span className="text-sm font-medium text-surface-900">
                {new Date(plan_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>

        {/* Additional seats input */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-surface-700 mb-2">
            Additional Seats to Add
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => adjust(-1)}
              className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors"
            >
              <Minus className="w-4 h-4 text-surface-600" />
            </button>
            <input
              type="number"
              min={1}
              value={additionalSeats}
              onChange={handleInput}
              className="w-20 text-center border border-surface-200 rounded-lg py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
            <button
              type="button"
              onClick={() => adjust(1)}
              className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center hover:bg-surface-50 transition-colors"
            >
              <Plus className="w-4 h-4 text-surface-600" />
            </button>
            <span className="text-sm text-surface-500">seats</span>
          </div>
        </div>

        {/* New total preview */}
        <div className="bg-accent-50 border border-accent-100 rounded-xl p-3 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-accent-700">
            <Users className="w-4 h-4" />
            Total seats after upgrade
          </div>
          <span className="text-base font-bold text-accent-800">{newTotal}</span>
        </div>

        {/* Actions */}
        <button
          onClick={handleProceed}
          disabled={additionalSeats < 1}
          className="w-full flex items-center justify-center gap-2 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition-colors"
        >
          Proceed to Upgrade
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="w-full mt-2 text-sm text-surface-500 hover:text-surface-700 py-2 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
