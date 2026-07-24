/**
 * TelephonyContext — single shared "brain" for the Phase 2 telephony UI
 * (softphone, incoming/outgoing popups, header status widget, dashboard).
 *
 * Only ever mounted when the tenant has telephony enabled AND the current
 * user has `telephony:view` (see Layout.jsx) — so none of this runs, fetches,
 * or subscribes for a disabled tenant or an unpermitted user.
 *
 * Real-time updates arrive via the existing app-wide WebSocket
 * (`useCRMEvents` from CRMSocketContext.jsx, already used by tasks/
 * notifications) on the `telephony.call_updated` event — no bespoke polling.
 * Capability data is fetched once here and shared by every consumer instead
 * of each component re-fetching independently.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { useCRMEvents } from './CRMSocketContext'
import telephonyService from '../services/telephonyService'
import { selectUser } from '../store/authSlice'
import usePermissions from '../hooks/usePermissions'

const ENDED_STATUSES = new Set(['call_ended', 'missed', 'failed', 'busy'])
const RINGING_STATUSES = new Set(['incoming_call', 'ringing'])

const TelephonyContext = createContext(null)

export function TelephonyProvider({ children }) {
  const [capabilities, setCapabilities] = useState({})
  const [favorites, setFavorites] = useState([])
  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [softphoneOpen, setSoftphoneOpen] = useState(false)
  const [softphoneMinimized, setSoftphoneMinimized] = useState(false)
  const [teamPresence, setTeamPresence] = useState([])
  const [ownPresence, setOwnPresenceState] = useState('available')

  const currentUser = useSelector(selectUser)
  const currentUserId = currentUser?.id
  const { has } = usePermissions()
  const canSupervise = has('telephony:supervisor')

  const callTimerStart = useRef(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // ── Initial load: capabilities, favorites, recover any in-progress call ──
  useEffect(() => {
    telephonyService.getCapabilities().then(r => setCapabilities(r.data || {})).catch(() => {})
    telephonyService.getFavorites().then(r => setFavorites(r.data?.favorites || [])).catch(() => {})
    telephonyService.getActiveCalls().then(r => {
      const logs = r.data?.logs || []
      const live = logs.find(l => !RINGING_STATUSES.has(l.status) || l.direction === 'outbound')
      const ringing = logs.find(l => l.direction === 'inbound' && RINGING_STATUSES.has(l.status))
      if (live) setActiveCall(live)
      if (ringing) setIncomingCall(ringing)
    }).catch(() => {})
    telephonyService.getOwnPresence().then(r => setOwnPresenceState(r.data?.status || 'available')).catch(() => {})
  }, [])

  // ── Team presence: only fetched/subscribed for supervisor-tier users —
  // everyone else has no use for it and no permission to read it. ─────────
  useEffect(() => {
    if (!canSupervise) return
    telephonyService.getTeamPresence().then(r => setTeamPresence(r.data?.agents || [])).catch(() => {})
  }, [canSupervise])

  // ── Call timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'answered') {
      callTimerStart.current = null
      setElapsedSeconds(0)
      return
    }
    if (!callTimerStart.current) callTimerStart.current = Date.now()
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - callTimerStart.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [activeCall?.status, activeCall?.call_id])

  // ── Real-time call updates (WebSocket, existing app-wide channel) ────────
  const applyCallUpdate = useCallback((doc) => {
    if (!doc || !doc.call_id) return

    if (doc.direction === 'inbound' && RINGING_STATUSES.has(doc.status)) {
      setIncomingCall(doc)
      return
    }

    setActiveCall(prev => {
      if (prev && prev.call_id !== doc.call_id && !ENDED_STATUSES.has(prev.status)) {
        return prev // a different call is already being tracked — don't clobber it
      }
      return doc
    })

    setIncomingCall(prev => (prev?.call_id === doc.call_id ? null : prev))

    if (ENDED_STATUSES.has(doc.status)) {
      setTimeout(() => {
        setActiveCall(cur => (cur?.call_id === doc.call_id ? null : cur))
      }, 3000) // brief "call ended" state before the widget disappears
    }
  }, [])

  useCRMEvents('telephony.call_updated', applyCallUpdate, null, [applyCallUpdate])

  // ── Real-time presence updates (same WebSocket channel, new event type) ──
  const applyPresenceUpdate = useCallback((doc) => {
    if (!doc || !doc.user_id) return
    if (doc.user_id === currentUserId) setOwnPresenceState(doc.status)
    if (!canSupervise) return
    setTeamPresence(prev => {
      const idx = prev.findIndex(p => p.user_id === doc.user_id)
      if (idx === -1) return [...prev, doc]
      const next = [...prev]
      next[idx] = { ...next[idx], ...doc }
      return next
    })
  }, [currentUserId, canSupervise])

  useCRMEvents('telephony.presence_updated', applyPresenceUpdate, null, [applyPresenceUpdate])

  // ── Actions ───────────────────────────────────────────────────────────────

  const dial = useCallback(async ({ to, candidateId, employeeId, clientId }) => {
    try {
      const res = await telephonyService.makeCall({ to, candidateId, employeeId, clientId })
      if (res.data?.success) {
        setActiveCall({
          call_id: res.data.call_id, receiver: to, status: res.data.status || 'initiated',
          direction: 'outbound', candidate_id: candidateId, employee_id: employeeId, client_id: clientId,
        })
        setSoftphoneOpen(true)
        setSoftphoneMinimized(false)
      } else {
        toast.error(res.data?.message || 'Call could not be placed.')
      }
      return res.data
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to place call.')
      return null
    }
  }, [])

  const callControl = useCallback(async (action, extra) => {
    if (!activeCall?.call_id) return null
    const fn = { hangup: telephonyService.hangup, hold: telephonyService.hold, resume: telephonyService.resume, mute: telephonyService.mute, unmute: telephonyService.unmute }[action]
    if (!fn) return null
    try {
      const res = await fn(activeCall.call_id, extra)
      if (!res.data?.success) toast.error(res.data?.message || `Could not ${action}.`)
      return res.data
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${action}.`)
      return null
    }
  }, [activeCall?.call_id])

  const transferActive = useCallback(async (target, extra) => {
    if (!activeCall?.call_id) return null
    try {
      const res = await telephonyService.transfer(activeCall.call_id, target, extra)
      if (!res.data?.success) toast.error(res.data?.message || 'Could not transfer.')
      return res.data
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to transfer.')
      return null
    }
  }, [activeCall?.call_id])

  const answerIncoming = useCallback(() => {
    // These providers bridge/route calls outside the browser (no in-browser
    // WebRTC answer exists in any Phase 1 adapter) — "Answer" acknowledges
    // the call and opens the live-tracking view.
    if (!incomingCall) return
    setActiveCall(incomingCall)
    setIncomingCall(null)
    setSoftphoneOpen(true)
    setSoftphoneMinimized(false)
  }, [incomingCall])

  const rejectIncoming = useCallback(async () => {
    if (!incomingCall) return
    if (capabilities.hangup) {
      try { await telephonyService.hangup(incomingCall.call_id) } catch { /* best-effort */ }
    }
    setIncomingCall(null)
  }, [incomingCall, capabilities.hangup])

  const addFavorite = useCallback(async (payload) => {
    try {
      const res = await telephonyService.addFavorite(payload)
      setFavorites(prev => [res.data, ...prev])
      toast.success('Added to favorites.')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to add favorite.')
    }
  }, [])

  const removeFavorite = useCallback(async (favoriteId) => {
    try {
      await telephonyService.removeFavorite(favoriteId)
      setFavorites(prev => prev.filter(f => f._id !== favoriteId))
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to remove favorite.')
    }
  }, [])

  // System-derived states (on_call/wrap_up/offline) are rejected by the
  // backend if chosen directly — only Available/Busy/Break are user-settable.
  const setOwnPresence = useCallback(async (status) => {
    const prev = ownPresence
    setOwnPresenceState(status) // optimistic — WS event will reconcile if rejected
    try {
      const res = await telephonyService.setPresence(status)
      setOwnPresenceState(res.data?.status || status)
    } catch (err) {
      setOwnPresenceState(prev)
      toast.error(err?.response?.data?.detail || 'Failed to update status.')
    }
  }, [ownPresence])

  const value = {
    capabilities, favorites, activeCall, incomingCall, elapsedSeconds,
    softphoneOpen, softphoneMinimized, teamPresence, ownPresence, setOwnPresence,
    openSoftphone: () => { setSoftphoneOpen(true); setSoftphoneMinimized(false) },
    closeSoftphone: () => setSoftphoneOpen(false),
    minimizeSoftphone: () => setSoftphoneMinimized(true),
    restoreSoftphone: () => setSoftphoneMinimized(false),
    dial, callControl, transferActive, answerIncoming, rejectIncoming,
    addFavorite, removeFavorite,
  }

  return <TelephonyContext.Provider value={value}>{children}</TelephonyContext.Provider>
}

export function useTelephony() {
  const ctx = useContext(TelephonyContext)
  if (!ctx) {
    // Safe no-op fallback for any component accidentally rendered outside
    // the provider (e.g. a disabled tenant) — never throws.
    return {
      capabilities: {}, favorites: [], activeCall: null, incomingCall: null, elapsedSeconds: 0,
      softphoneOpen: false, softphoneMinimized: false, teamPresence: [], ownPresence: 'available',
      openSoftphone: () => {}, closeSoftphone: () => {}, minimizeSoftphone: () => {}, restoreSoftphone: () => {},
      dial: async () => null, callControl: async () => null, transferActive: async () => null,
      answerIncoming: () => {}, rejectIncoming: async () => {}, addFavorite: async () => {}, removeFavorite: async () => {},
      setOwnPresence: async () => {},
    }
  }
  return ctx
}

export default TelephonyContext
