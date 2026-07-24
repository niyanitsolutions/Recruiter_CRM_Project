import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneIncoming, PhoneOff, User2, UserRound, Briefcase, Building2 } from 'lucide-react'
import telephonyService from '../../services/telephonyService'
import { useTelephony } from '../../context/TelephonyContext'

const PROVIDER_LABELS = {
  twilio: 'Twilio', tata_smartflo: 'Tata Smartflo', exotel: 'Exotel', airtel_iq: 'Airtel IQ',
  knowlarity: 'Knowlarity', ozonetel: 'Ozonetel', myoperator: 'MyOperator', kaleyra: 'Kaleyra',
  infobip: 'Infobip', gupshup: 'Gupshup',
}

/**
 * Global incoming-call notification. Only rendered (via TelephonyContext's
 * `incomingCall`) when a real inbound webhook event arrives via the existing
 * WebSocket channel — never polls. "Open Profile" links to the existing
 * Candidate/Employee detail routes without modifying those pages.
 */
export default function IncomingCallPopup() {
  const { incomingCall, answerIncoming, rejectIncoming } = useTelephony()
  const navigate = useNavigate()
  const [match, setMatch] = useState(null)
  const [ringSeconds, setRingSeconds] = useState(0)

  const callerNumber = incomingCall?.caller

  useEffect(() => {
    setMatch(null)
    setRingSeconds(0)
    if (!callerNumber) return
    telephonyService.lookupCaller(callerNumber).then(r => setMatch(r.data?.match || null)).catch(() => {})
  }, [callerNumber])

  useEffect(() => {
    if (!incomingCall) return
    const id = setInterval(() => setRingSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [incomingCall?.call_id])

  if (!incomingCall) return null

  const openProfile = () => {
    if (!match) return
    navigate(match.type === 'candidate' ? `/candidates/${match.id}` : `/hrm/employees/${match.id}`)
  }

  return (
    <div className="fixed top-6 right-6 z-[10100] w-80 bg-white rounded-2xl shadow-2xl border border-emerald-200 overflow-hidden animate-fade-in">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 flex items-center gap-2 text-white">
        <PhoneIncoming className="w-4 h-4 animate-pulse" />
        <span className="text-sm font-semibold">Incoming Call</span>
        <span className="ml-auto text-xs opacity-80">{ringSeconds}s</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
            {match ? <UserRound className="w-6 h-6 text-emerald-600" /> : <User2 className="w-6 h-6 text-surface-400" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-surface-900 truncate">{match?.name || 'Unknown Caller'}</p>
            <p className="text-sm text-surface-500">{callerNumber}</p>
            {match && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${match.type === 'candidate' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                {match.type === 'candidate' ? <Briefcase className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                {match.type === 'candidate' ? 'Candidate' : 'Employee'}
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-surface-400">via {PROVIDER_LABELS[incomingCall.provider] || incomingCall.provider}</p>

        {match && (
          <button type="button" onClick={openProfile} className="w-full text-xs font-medium text-primary-600 border border-primary-200 rounded-lg py-1.5 hover:bg-primary-50 transition-colors">
            Open Profile
          </button>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={rejectIncoming}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition-colors"
          >
            <PhoneOff className="w-4 h-4" /> Reject
          </button>
          <button
            type="button"
            onClick={answerIncoming}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
          >
            <PhoneIncoming className="w-4 h-4" /> Answer
          </button>
        </div>
      </div>
    </div>
  )
}
