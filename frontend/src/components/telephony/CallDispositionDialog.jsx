import { useState, useEffect } from 'react'
import { ClipboardCheck, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'

/**
 * Configurable call-disposition dropdown. Stores ONLY on the call log
 * (`telephony_call_logs.disposition`) — per spec, never touches
 * candidate/employee status.
 */
export default function CallDispositionDialog({ callId, currentDisposition, onSaved }) {
  const [options, setOptions] = useState([])
  const [selected, setSelected] = useState(currentDisposition || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    telephonyService.getDispositions()
      .then(r => setOptions(r.data?.options || []))
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!selected || !callId) return
    setSaving(true)
    try {
      await telephonyService.setDisposition(callId, selected)
      toast.success('Disposition saved.')
      onSaved?.(selected)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save disposition.')
    } finally {
      setSaving(false)
    }
  }

  if (!callId) return null

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-surface-500">
        <ClipboardCheck className="w-3.5 h-3.5" /> Call Disposition
      </label>
      <div className="flex items-center gap-2">
        <select value={selected} onChange={e => setSelected(e.target.value)} className="input-field text-sm flex-1">
          <option value="">Select outcome...</option>
          {options.map(o => <option key={o._id} value={o.label}>{o.label}</option>)}
        </select>
        <button
          type="button" onClick={handleSave} disabled={!selected || saving}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}
