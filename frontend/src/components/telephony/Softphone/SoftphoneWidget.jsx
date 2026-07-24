import { useState, useRef, useCallback, useEffect } from 'react'
import { Phone, PhoneOutgoing, Minus, X, Grip, User2, Building2 } from 'lucide-react'
import { useTelephony } from '../../../context/TelephonyContext'
import { usePermissions } from '../../../hooks/usePermissions'
import DialPad from './DialPad'
import RecentCallsMini from './RecentCallsMini'
import FavoritesMini from './FavoritesMini'
import ActiveCallControls from './ActiveCallControls'
import CallNotes from '../CallNotes'
import CallDispositionDialog from '../CallDispositionDialog'
import PostCallActions from '../PostCallActions'

const TABS = [
  { key: 'dial', label: 'Dial' },
  { key: 'recent', label: 'Recent' },
  { key: 'favorites', label: 'Favorites' },
]

const STATUS_LABEL = {
  initiated: 'Dialing...', queued: 'Dialing...', ringing: 'Ringing...',
  incoming_call: 'Incoming...', answered: 'Connected', on_hold: 'On Hold',
  call_ended: 'Call Ended', failed: 'Failed', busy: 'Busy', missed: 'Missed', 'no-answer': 'No Answer',
}

function formatDuration(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Floating, draggable softphone dock. Doubles as both the dialer (idle
 * state — dial pad / recents / favorites tabs) and the active-call view
 * (in-call state — timer, status, capability-gated controls) so there's one
 * shared surface instead of duplicating the in-call UI in a second popup.
 */
export default function SoftphoneWidget() {
  const { has } = usePermissions()
  const {
    activeCall, elapsedSeconds, softphoneOpen, softphoneMinimized,
    openSoftphone, closeSoftphone, minimizeSoftphone, restoreSoftphone,
  } = useTelephony()

  const [tab, setTab] = useState('dial')
  const [pos, setPos] = useState({ x: null, y: null }) // null = default bottom-right via CSS
  const dragRef = useRef(null)
  const dragging = useRef(false)

  const onPointerDown = useCallback((e) => {
    dragging.current = true
    const rect = dragRef.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const onMove = (ev) => {
      if (!dragging.current) return
      setPos({
        x: Math.min(Math.max(0, ev.clientX - offsetX), window.innerWidth - rect.width),
        y: Math.min(Math.max(0, ev.clientY - offsetY), window.innerHeight - rect.height),
      })
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  // Auto-open (but not un-minimize aggressively) when a call becomes active
  useEffect(() => {
    if (activeCall && !softphoneOpen) openSoftphone()
  }, [activeCall, softphoneOpen, openSoftphone])

  if (!has('telephony:call')) return null
  if (!softphoneOpen) {
    return (
      <button
        type="button"
        onClick={openSoftphone}
        className="fixed bottom-5 right-5 z-[10000] w-14 h-14 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg flex items-center justify-center transition-colors"
        title="Open Softphone"
      >
        <Phone className="w-6 h-6" />
      </button>
    )
  }

  const style = pos.x !== null ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {}

  if (softphoneMinimized) {
    return (
      <button
        type="button"
        onClick={restoreSoftphone}
        style={style}
        className={`fixed ${pos.x === null ? 'bottom-5 right-5' : ''} z-[10000] flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-surface-900 text-white shadow-lg hover:bg-surface-800 transition-colors`}
      >
        <span className={`w-2.5 h-2.5 rounded-full ${activeCall ? 'bg-emerald-400 animate-pulse' : 'bg-surface-400'}`} />
        <span className="text-sm font-medium">{activeCall ? formatDuration(elapsedSeconds) : 'Softphone'}</span>
      </button>
    )
  }

  return (
    <div
      ref={dragRef}
      style={style}
      className={`fixed ${pos.x === null ? 'bottom-5 right-5' : ''} z-[10000] w-80 bg-white rounded-2xl shadow-2xl border border-surface-200 overflow-hidden`}
    >
      {/* Header — drag handle */}
      <div
        onPointerDown={onPointerDown}
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <Grip className="w-4 h-4 opacity-60" />
          <span className="text-sm font-semibold">Softphone</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={minimizeSoftphone} className="p-1.5 rounded-lg hover:bg-white/20" title="Minimize">
            <Minus className="w-4 h-4" />
          </button>
          <button type="button" onClick={closeSoftphone} className="p-1.5 rounded-lg hover:bg-white/20" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4">
        {activeCall ? (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary-50 flex items-center justify-center">
                {activeCall.candidate_id || activeCall.employee_id ? <User2 className="w-6 h-6 text-primary-500" /> : <Building2 className="w-6 h-6 text-primary-500" />}
              </div>
              <p className="font-semibold text-surface-900">{activeCall.direction === 'inbound' ? activeCall.caller : activeCall.receiver}</p>
              <p className="text-xs text-surface-500">{activeCall.provider}</p>
              <p className="text-sm font-medium text-primary-600">
                {activeCall.status === 'answered' ? formatDuration(elapsedSeconds) : (STATUS_LABEL[activeCall.status] || activeCall.status)}
              </p>
            </div>

            <ActiveCallControls />

            {activeCall.status === 'call_ended' && (
              <div className="space-y-3 pt-1">
                <CallNotes callId={activeCall.call_id} initialNotes={activeCall.notes} />
                <CallDispositionDialog callId={activeCall.call_id} currentDisposition={activeCall.disposition} />
                <PostCallActions log={activeCall} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex bg-surface-50 rounded-xl p-1">
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'dial' && <DialPad />}
            {tab === 'recent' && <RecentCallsMini />}
            {tab === 'favorites' && <FavoritesMini />}
          </div>
        )}
      </div>
    </div>
  )
}
