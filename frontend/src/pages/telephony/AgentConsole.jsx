import { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { Loader2, RefreshCw, PhoneCall, PhoneMissed, Clock3, PhoneOutgoing, CheckCircle2, Circle, Coffee, PhoneOff } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import { useTelephony } from '../../context/TelephonyContext'
import { selectUser } from '../../store/authSlice'

const PRESENCE_OPTIONS = [
  { key: 'available', label: 'Available', Icon: Circle, accent: '#22c55e' },
  { key: 'busy', label: 'Busy', Icon: PhoneOff, accent: '#f59e0b' },
  { key: 'break', label: 'Break', Icon: Coffee, accent: '#64748b' },
]

// System-derived — set automatically by call activity, never chosen directly.
const SYSTEM_PRESENCE_LABELS = {
  on_call: { label: 'On Call', accent: '#6366f1' },
  wrap_up: { label: 'Wrap-up', accent: '#0ea5e9' },
  offline: { label: 'Offline', accent: '#94a3b8' },
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}1a` }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-lg font-bold text-surface-900">{value}</p>
        <p className="text-xs text-surface-400">{label}</p>
      </div>
    </div>
  )
}

/**
 * Personal live-operations view for a single agent — composes existing
 * TelephonyContext state (presence, active call) with existing Phase 3
 * endpoints (dashboard stats, agent performance, missed calls) rather than
 * introducing any new per-agent data source.
 */
export default function AgentConsole() {
  const currentUser = useSelector(selectUser)
  const { activeCall, ownPresence, setOwnPresence, dial, openSoftphone } = useTelephony()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [myPerf, setMyPerf] = useState(null)
  const [callbackQueue, setCallbackQueue] = useState([])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [statsRes, perfRes, missedRes] = await Promise.all([
        telephonyService.getDashboardStats().catch(() => null),
        telephonyService.getAgentPerformance().catch(() => null),
        telephonyService.getMissedCalls('pending').catch(() => null),
      ])
      if (statsRes) setStats(statsRes.data)
      if (perfRes) setMyPerf((perfRes.data?.agents || []).find(a => a.user_id === currentUser?.id) || null)
      if (missedRes) setCallbackQueue((missedRes.data?.logs || []).filter(l => l.assigned_to === currentUser?.id))
    } catch {
      toast.error('Failed to load your console.')
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  useEffect(() => { load() }, [load])

  const isSystemDerived = SYSTEM_PRESENCE_LABELS[ownPresence]

  const callBack = async (log) => {
    if (!log.caller) return
    await dial({ to: log.caller, candidateId: log.candidate_id, employeeId: log.employee_id })
    try {
      await telephonyService.setCallbackStatus(log.call_id, 'completed')
      setCallbackQueue(prev => prev.filter(c => c.id !== log.id))
    } catch { /* best-effort */ }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900">Agent Console</h2>
        <button onClick={load} className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Presence */}
      <div className="bg-white rounded-2xl border border-surface-200 p-5">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">My Status</h3>
        {isSystemDerived ? (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${isSystemDerived.accent}1a`, color: isSystemDerived.accent }}>
            <span className="w-2 h-2 rounded-full" style={{ background: isSystemDerived.accent }} />
            <span className="text-sm font-medium">{isSystemDerived.label}</span>
            <span className="text-xs opacity-70">(set automatically by call activity)</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PRESENCE_OPTIONS.map(({ key, label, Icon, accent }) => (
              <button
                key={key}
                type="button"
                onClick={() => setOwnPresence(key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  ownPresence === key ? 'border-transparent text-white' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                }`}
                style={ownPresence === key ? { background: accent } : {}}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active call */}
      {activeCall && (
        <div className="bg-white rounded-2xl border border-primary-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-surface-900">Call in progress</p>
            <p className="text-xs text-surface-500 mt-0.5">{activeCall.receiver || activeCall.caller || 'Unknown'} · {activeCall.status?.replace(/_/g, ' ')}</p>
          </div>
          <button type="button" onClick={openSoftphone} className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium">
            Open Softphone
          </button>
        </div>
      )}

      {/* Today's numbers */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={PhoneCall} label="Today's Calls" value={stats.total_calls} accent="#6366f1" />
          <StatCard icon={PhoneMissed} label="Missed" value={stats.missed} accent="#ef4444" />
          <StatCard icon={Clock3} label="Avg Talk Time" value={`${myPerf?.avg_duration ? Math.round(myPerf.avg_duration) : 0}s`} accent="#0ea5e9" />
          <StatCard icon={PhoneOutgoing} label="My Total Calls" value={myPerf?.total_calls || 0} accent="#8b5cf6" />
        </div>
      )}

      {/* Personal callback queue */}
      <div className="bg-white rounded-2xl border border-surface-200 p-5">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">My Callback Queue</h3>
        {callbackQueue.length === 0 ? (
          <p className="text-sm text-surface-400">No callbacks assigned to you.</p>
        ) : (
          <div className="space-y-2">
            {callbackQueue.map(log => (
              <div key={log.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-50">
                <div>
                  <p className="text-sm font-medium text-surface-900">{log.caller || 'Unknown'}</p>
                  <p className="text-xs text-surface-400">{log.created_at ? new Date(log.created_at).toLocaleString() : ''}</p>
                </div>
                <button type="button" onClick={() => callBack(log)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium">
                  <PhoneOutgoing className="w-3.5 h-3.5" /> Call Back
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {stats?.total_calls === 0 && !activeCall && (
        <div className="flex items-center gap-2 text-sm text-surface-400">
          <CheckCircle2 className="w-4 h-4" /> No calls yet today.
        </div>
      )}
    </div>
  )
}
