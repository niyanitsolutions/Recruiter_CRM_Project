import React from 'react'
import { FileClock, X } from 'lucide-react'

/**
 * "Draft Found — Restore Draft?" prompt (Task 7). Rendered at the top of a
 * form when useDraftRecovery finds a previously auto-saved, unsaved draft.
 */
export default function DraftRecoveryBanner({ savedAt, onRestore, onDiscard }) {
  const when = savedAt ? new Date(savedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
      style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)' }}
    >
      <FileClock className="w-5 h-5 flex-shrink-0" style={{ color: '#7c3aed' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#7c3aed' }}>Draft Found</p>
        <p className="text-xs mt-0.5 text-surface-500">
          You have unsaved changes from a previous session{when ? ` (${when})` : ''}. Restore them?
        </p>
      </div>
      <button
        type="button"
        onClick={onRestore}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
        style={{ background: '#7c3aed' }}
      >
        Restore Draft
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="flex-shrink-0 p-1.5 rounded-lg text-surface-400 hover:text-surface-600"
        title="Discard draft"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
