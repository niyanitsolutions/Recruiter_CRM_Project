import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, PhoneCall, Users, Clock3, PhoneMissed, TrendingUp, Activity, Radio, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import { useTelephony } from '../../context/TelephonyContext'
import CallMonitoringControls from '../../components/telephony/CallMonitoringControls'

const PRESENCE_ACCENTS = {
  available: '#22c55e', busy: '#f59e0b', on_call: '#6366f1',
  wrap_up: '#0ea5e9', break: '#64748b', offline: '#94a3b8',
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

export default function SupervisorDashboard() {
  const { teamPresence, capabilities } = useTelephony()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [departments, setDepartments] = useState([])
  const [liveCalls, setLiveCalls] = useState([])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [summaryRes, deptRes, activeRes] = await Promise.all([
        telephonyService.getSupervisorSummary(),
        telephonyService.getDepartmentAnalytics().catch(() => null),
        telephonyService.getActiveCalls().catch(() => null),
      ])
      setSummary(summaryRes.data)
      if (deptRes) setDepartments(deptRes.data?.departments || [])
      if (activeRes) setLiveCalls(activeRes.data?.logs || [])
    } catch {
      toast.error('Failed to load supervisor summary.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const presenceCounts = teamPresence.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {})

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
  }
  if (!summary) return null

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900">Live Operations</h2>
        <button onClick={load} className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Radio} label="Live Calls" value={summary.live_calls} accent="#10b981" />
        <StatCard icon={Users} label="Active Agents" value={summary.active_agents} accent="#6366f1" />
        <StatCard icon={Activity} label="Calls Waiting" value={summary.calls_waiting} accent="#f59e0b" />
        <StatCard icon={Clock3} label="Avg Talk Time" value={`${summary.avg_duration}s`} accent="#0ea5e9" />
        <StatCard icon={PhoneMissed} label="Missed Calls" value={summary.missed} accent="#ef4444" />
        <StatCard icon={TrendingUp} label="Success Rate" value={`${summary.success_rate}%`} accent="#22c55e" />
        <StatCard icon={PhoneCall} label="Today's Calls" value={summary.total_calls} accent="#8b5cf6" />
      </div>

      {/* Phase 4: live team presence */}
      <div className="bg-white rounded-2xl border border-surface-200 p-5">
        <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Team Presence
        </h3>
        {teamPresence.length === 0 ? (
          <p className="text-sm text-surface-400">No agents online right now.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(PRESENCE_ACCENTS).map(([status, accent]) => (
              presenceCounts[status] ? (
                <div key={status} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: `${accent}1a` }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
                  <span className="text-sm font-medium text-surface-700 capitalize">{status.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-bold" style={{ color: accent }}>{presenceCounts[status]}</span>
                </div>
              ) : null
            ))}
          </div>
        )}
      </div>

      {/* Phase 4: live calls with capability-gated monitoring controls */}
      <div className="bg-white rounded-2xl border border-surface-200 p-5">
        <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
          <Radio className="w-4 h-4" /> Live Calls
        </h3>
        {liveCalls.length === 0 ? (
          <p className="text-sm text-surface-400">No calls in progress.</p>
        ) : (
          <div className="space-y-2">
            {liveCalls.map(log => (
              <div key={log.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-50 text-sm">
                <div>
                  <span className="font-medium text-surface-900">{log.caller || log.receiver || 'Unknown'}</span>
                  <span className="ml-2 text-xs text-surface-400 capitalize">{log.status?.replace(/_/g, ' ')}</span>
                </div>
                <CallMonitoringControls callId={log.call_id} />
              </div>
            ))}
          </div>
        )}
        {!capabilities.call_listen && !capabilities.call_whisper && !capabilities.call_barge && liveCalls.length > 0 && (
          <p className="text-xs text-surface-400 mt-3">Live monitoring (listen/whisper/barge) isn't supported by the active provider.</p>
        )}
      </div>

      {/* Phase 4: department breakdown */}
      <div className="bg-white rounded-2xl border border-surface-200 p-5">
        <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Calls by Department
        </h3>
        {departments.length === 0 ? (
          <p className="text-sm text-surface-400">No department-attributed calls yet.</p>
        ) : (
          <div className="space-y-2">
            {departments.map(d => (
              <div key={d.department} className="flex items-center justify-between text-sm">
                <span className="text-surface-600">{d.department}</span>
                <span className="text-surface-400">{d.answered}/{d.total} answered</span>
                <span className="font-semibold text-surface-900">{d.success_rate}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 p-5">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">Calls by Provider</h3>
        {Object.keys(summary.calls_by_provider || {}).length === 0 ? (
          <p className="text-sm text-surface-400">No call history yet.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(summary.calls_by_provider).map(([provider, count]) => (
              <div key={provider} className="flex items-center justify-between text-sm">
                <span className="text-surface-600 capitalize">{provider.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-surface-900">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
