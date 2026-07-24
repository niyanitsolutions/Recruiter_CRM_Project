import { useState } from 'react'
import { Headphones, Mic, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import { useTelephony } from '../../context/TelephonyContext'

/**
 * Listen/Whisper/Barge buttons for a single live call, rendered in the
 * Supervisor view's live-calls list. Each button is independently
 * capability-gated — since no Phase 1 provider declares call_listen/
 * call_whisper/call_barge, this renders nothing at all for any tenant today
 * (never disabled/greyed — per the "hide, don't simulate" rule).
 */
export default function CallMonitoringControls({ callId }) {
  const { capabilities } = useTelephony()
  const [busy, setBusy] = useState(null)

  const actions = [
    { key: 'listen', label: 'Listen', Icon: Headphones, show: capabilities.call_listen, fn: telephonyService.listenToCall },
    { key: 'whisper', label: 'Whisper', Icon: Mic, show: capabilities.call_whisper, fn: telephonyService.whisperToCall },
    { key: 'barge', label: 'Barge', Icon: LogIn, show: capabilities.call_barge, fn: telephonyService.bargeIntoCall },
  ].filter(a => a.show)

  if (actions.length === 0) return null

  const run = async (action) => {
    setBusy(action.key)
    try {
      const res = await action.fn(callId)
      if (res.data?.success === false) toast.error(res.data?.message || `Could not ${action.label.toLowerCase()}.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${action.label.toLowerCase()}.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {actions.map(a => (
        <button
          key={a.key}
          type="button"
          disabled={busy === a.key}
          onClick={() => run(a)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-100 hover:bg-surface-200 text-surface-600 text-xs font-medium disabled:opacity-50"
          title={a.label}
        >
          <a.Icon className="w-3.5 h-3.5" /> {a.label}
        </button>
      ))}
    </div>
  )
}
