/**
 * SeatLimitModal
 *
 * Popup shown when a user tries to add a user but the seat limit is reached.
 * Displays:
 *   - Purchased Users
 *   - Current Users
 *   - Remaining Seats
 * And an "Upgrade Users" button that navigates to the payment/upgrade page.
 *
 * Props:
 *   isOpen      – boolean
 *   onClose     – callback
 *   onUpgrade   – callback (navigates to upgrade page)
 *   seatStatus  – { total_user_seats, current_active_users, remaining_seats }
 */

import React from 'react'
import { Users, ShieldAlert, ArrowRight, X } from 'lucide-react'

export default function SeatLimitModal({ isOpen, onClose, onUpgrade, seatStatus = {} }) {
  if (!isOpen) return null

  const {
    total_user_seats    = 0,
    current_active_users = 0,
    remaining_seats     = 0,
  } = seatStatus

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-red-500" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-surface-900 text-center mb-1">
          User Limit Reached
        </h2>
        <p className="text-sm text-surface-500 text-center mb-6">
          You have used all purchased user seats. Upgrade to add more users.
        </p>

        {/* Seat stats */}
        <div className="bg-surface-50 rounded-xl p-4 mb-6 space-y-3">
          <SeatRow
            label="Purchased Seats"
            value={total_user_seats}
            valueClass="text-surface-900"
          />
          <div className="border-t border-surface-200" />
          <SeatRow
            label="Current Users"
            value={current_active_users}
            valueClass="text-red-600 font-bold"
          />
          <SeatRow
            label="Remaining Seats"
            value={remaining_seats}
            valueClass={remaining_seats > 0 ? 'text-green-600' : 'text-red-600 font-bold'}
          />
        </div>

        {/* Actions */}
        <button
          onClick={onUpgrade}
          className="w-full flex items-center justify-center gap-2 bg-accent-600 hover:bg-accent-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
        >
          <Users className="w-4 h-4" />
          Upgrade Users
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

function SeatRow({ label, value, valueClass }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-surface-600">{label}</span>
      <span className={`text-sm ${valueClass}`}>{value}</span>
    </div>
  )
}
