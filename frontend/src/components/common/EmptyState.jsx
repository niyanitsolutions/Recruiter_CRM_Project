import React from 'react'
import { Inbox } from 'lucide-react'

/**
 * EmptyState — zero-results placeholder.
 *
 * Props:
 *   icon      — Lucide icon component (defaults to Inbox)
 *   title     — heading text
 *   message   — optional sub-text
 *   action    — optional { label, onClick } for a CTA button
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No results found',
  message,
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
           style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border-card)' }}>
        <Icon className="w-8 h-8 opacity-40" style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-heading)' }}>{title}</p>
      {message && (
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
      )}
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-5 text-sm">
          {action.label}
        </button>
      )}
    </div>
  )
}
