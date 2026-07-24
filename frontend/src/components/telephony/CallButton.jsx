import { useState } from 'react'
import { Phone, PhoneOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { selectTelephonyEnabled } from '../../store/authSlice'
import { usePermissions } from '../../hooks/usePermissions'
import telephonyService from '../../services/telephonyService'

/**
 * Click-to-call button. Renders nothing when the tenant hasn't enabled
 * telephony, the user lacks the `telephony:call` permission, or no phone
 * number is available — so it's a pure no-op addition next to existing
 * `tel:` links wherever the telephony plugin isn't active.
 *
 * After a successful call, offers a "Hang Up" action — but only if the
 * active provider's capability table actually supports it (several
 * providers, e.g. Exotel/Knowlarity/Kaleyra, document no hangup API at
 * all). Capabilities are fetched lazily, only once a call is in flight,
 * so pages with many CallButtons don't fire an extra request per button
 * just from rendering.
 */
export default function CallButton({ phone, candidateId, employeeId, clientId, className = '' }) {
  const telephonyEnabled = useSelector(selectTelephonyEnabled)
  const { has } = usePermissions()
  const [calling, setCalling] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [activeCallId, setActiveCallId] = useState(null)
  const [canHangup, setCanHangup] = useState(false)
  const [endingCall, setEndingCall] = useState(false)

  if (!telephonyEnabled || !has('telephony:call') || !phone) return null

  const handleCall = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setCalling(true)
    setLastResult(null)
    setActiveCallId(null)
    try {
      const res = await telephonyService.makeCall({ to: phone, candidateId, employeeId, clientId })
      if (res.data?.success) {
        toast.success('Call initiated.')
        setLastResult('success')
        if (res.data?.call_id) {
          setActiveCallId(res.data.call_id)
          telephonyService.getCapabilities()
            .then(capRes => setCanHangup(!!capRes.data?.hangup))
            .catch(() => setCanHangup(false))
        }
      } else {
        toast.error(res.data?.message || 'Call could not be placed.')
        setLastResult('error')
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to place call.')
      setLastResult('error')
    } finally {
      setCalling(false)
    }
  }

  const handleHangup = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!activeCallId) return
    setEndingCall(true)
    try {
      const res = await telephonyService.hangup(activeCallId)
      if (res.data?.success) {
        toast.success('Call ended.')
        setActiveCallId(null)
      } else {
        toast.error(res.data?.message || 'Could not end the call.')
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to end call.')
    } finally {
      setEndingCall(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleCall}
        disabled={calling}
        title={`Call ${phone}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary-200 text-primary-600 text-xs font-medium hover:bg-primary-50 transition-colors disabled:opacity-50 ${className}`}
      >
        {calling
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : lastResult === 'success'
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            : lastResult === 'error'
              ? <XCircle className="w-3.5 h-3.5 text-red-500" />
              : <Phone className="w-3.5 h-3.5" />}
        Call
      </button>

      {activeCallId && canHangup && (
        <button
          type="button"
          onClick={handleHangup}
          disabled={endingCall}
          title="Hang up"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {endingCall ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5" />}
          Hang Up
        </button>
      )}
    </div>
  )
}
