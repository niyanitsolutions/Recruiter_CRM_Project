import { Phone, MicOff } from 'lucide-react'
import { useTelephony } from '../../context/TelephonyContext'
import { usePermissions } from '../../hooks/usePermissions'

const STATUS_META = {
  initiated: { label: 'Dialing', color: 'bg-amber-100 text-amber-700' },
  queued: { label: 'Dialing', color: 'bg-amber-100 text-amber-700' },
  ringing: { label: 'Ringing', color: 'bg-amber-100 text-amber-700' },
  incoming_call: { label: 'Ringing', color: 'bg-amber-100 text-amber-700' },
  answered: { label: 'Connected', color: 'bg-emerald-100 text-emerald-700' },
  on_hold: { label: 'On Hold', color: 'bg-blue-100 text-blue-700' },
}

function formatDuration(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

/** Small header pill — disappears automatically once the call ends
 * (TelephonyContext clears `activeCall` a few seconds after end). */
export default function CallStatusWidget() {
  const { has } = usePermissions()
  const { activeCall, elapsedSeconds, openSoftphone } = useTelephony()

  if (!has('telephony:call') || !activeCall) return null

  const meta = STATUS_META[activeCall.status] || { label: activeCall.status, color: 'bg-surface-100 text-surface-600' }

  return (
    <button
      type="button"
      onClick={openSoftphone}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${meta.color}`}
      title="Open Softphone"
    >
      {activeCall.muted ? <MicOff className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
      {meta.label}
      {activeCall.status === 'answered' && <span className="font-mono">{formatDuration(elapsedSeconds)}</span>}
    </button>
  )
}
