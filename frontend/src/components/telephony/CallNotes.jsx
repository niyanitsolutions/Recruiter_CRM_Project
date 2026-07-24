import { useState } from 'react'
import { StickyNote, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'

/**
 * Add/edit notes on a call — writes only to telephony_call_logs.notes
 * (existing Phase 1 field). Never touches Candidate/Employee records.
 */
export default function CallNotes({ callId, initialNotes = '', onSaved }) {
  const [notes, setNotes] = useState(initialNotes || '')
  const [editing, setEditing] = useState(!initialNotes)
  const [saving, setSaving] = useState(false)

  if (!callId) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await telephonyService.updateNotes(callId, notes)
      setEditing(false)
      onSaved?.(notes)
      toast.success('Note saved.')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-surface-500">
        <StickyNote className="w-3.5 h-3.5" /> Call Notes
      </label>
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Add a note about this call..."
            className="input-field text-sm w-full resize-none"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="text-left w-full text-sm text-surface-700 bg-surface-50 rounded-lg p-2.5 hover:bg-surface-100 transition-colors">
          {notes || <span className="text-surface-400">Click to add a note...</span>}
        </button>
      )}
    </div>
  )
}
