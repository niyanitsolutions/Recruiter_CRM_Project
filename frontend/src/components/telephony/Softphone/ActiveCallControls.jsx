import { useState } from 'react'
import { Pause, Play, Mic, MicOff, PhoneForwarded, PhoneOff, Loader2 } from 'lucide-react'
import { useTelephonyCall } from '../../../hooks/useTelephonyCall'

/**
 * Renders only the call-control buttons the ACTIVE provider's capability
 * table actually supports — never a hardcoded provider check. A provider
 * like Exotel/Knowlarity/Kaleyra (no REST call-control API) shows only
 * "End Call" state feedback with no hold/mute/transfer buttons at all.
 */
export default function ActiveCallControls() {
  const { activeCall, capabilities, hangup, hold, resume, mute, unmute, transfer } = useTelephonyCall()
  const [busy, setBusy] = useState(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)

  if (!activeCall) return null

  const isOnHold = activeCall.status === 'on_hold'
  const isMuted = !!activeCall.muted

  const run = async (key, fn) => {
    setBusy(key)
    try { await fn() } finally { setBusy(null) }
  }

  const btnClass = "flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-40"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2">
        {capabilities.hold && !isOnHold && (
          <button className={`${btnClass} bg-surface-100 hover:bg-surface-200 text-surface-700`} disabled={!!busy} onClick={() => run('hold', hold)}>
            {busy === 'hold' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />} Hold
          </button>
        )}
        {capabilities.resume && isOnHold && (
          <button className={`${btnClass} bg-emerald-100 hover:bg-emerald-200 text-emerald-700`} disabled={!!busy} onClick={() => run('resume', resume)}>
            {busy === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Resume
          </button>
        )}
        {capabilities.mute && !isMuted && (
          <button className={`${btnClass} bg-surface-100 hover:bg-surface-200 text-surface-700`} disabled={!!busy} onClick={() => run('mute', mute)}>
            {busy === 'mute' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />} Mute
          </button>
        )}
        {capabilities.unmute && isMuted && (
          <button className={`${btnClass} bg-amber-100 hover:bg-amber-200 text-amber-700`} disabled={!!busy} onClick={() => run('unmute', unmute)}>
            {busy === 'unmute' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MicOff className="w-4 h-4" />} Unmute
          </button>
        )}
        {capabilities.transfer && (
          <button className={`${btnClass} bg-surface-100 hover:bg-surface-200 text-surface-700`} disabled={!!busy} onClick={() => setShowTransfer(s => !s)}>
            <PhoneForwarded className="w-4 h-4" /> Transfer
          </button>
        )}
        <button className={`${btnClass} bg-red-100 hover:bg-red-200 text-red-700`} disabled={!!busy} onClick={() => run('hangup', hangup)}>
          {busy === 'hangup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />} End
        </button>
      </div>

      {showTransfer && capabilities.transfer && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text" value={transferTarget} onChange={e => setTransferTarget(e.target.value)}
            placeholder="Transfer to..." className="input-field text-sm flex-1"
          />
          <button
            className="px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-medium disabled:opacity-50"
            disabled={!transferTarget || busy === 'transfer'}
            onClick={() => run('transfer', () => transfer(transferTarget))}
          >
            {busy === 'transfer' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </button>
        </div>
      )}
    </div>
  )
}
