import { Fragment, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Phone, Loader2, PhoneOutgoing, PhoneIncoming, RefreshCw, Search,
  PhoneCall, PhoneMissed, Clock, Activity, TrendingUp, ExternalLink, StickyNote,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { selectTelephonyEnabled, selectTelephonyProvider } from '../../store/authSlice'
import telephonyService from '../../services/telephonyService'
import { useTelephony } from '../../context/TelephonyContext'
import CallNotes from '../../components/telephony/CallNotes'
import CallRecordingPlayer from '../../components/telephony/CallRecordingPlayer'
import CallDispositionDialog from '../../components/telephony/CallDispositionDialog'
import PostCallActions from '../../components/telephony/PostCallActions'
import TelephonyExportButton from '../../components/telephony/TelephonyExportButton'

const PROVIDER_LABELS = {
  twilio: 'Twilio', tata_smartflo: 'Tata Smartflo', exotel: 'Exotel', airtel_iq: 'Airtel IQ',
  knowlarity: 'Knowlarity', ozonetel: 'Ozonetel', myoperator: 'MyOperator', kaleyra: 'Kaleyra',
  infobip: 'Infobip', gupshup: 'Gupshup',
}

const MISSED_STATUSES = new Set(['missed', 'no-answer', 'failed', 'busy'])
const STATUS_OPTIONS = ['all', 'answered', 'missed', 'on_hold', 'call_ended', 'initiated', 'ringing']

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

export default function TelephonyDashboard() {
  const telephonyEnabled = useSelector(selectTelephonyEnabled)
  const telephonyProvider = useSelector(selectTelephonyProvider)
  const navigate = useNavigate()
  const { capabilities } = useTelephony()

  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedNotes, setExpandedNotes] = useState(null)

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      const [logsRes, statsRes] = await Promise.all([
        telephonyService.listCalls({ limit: 100 }),
        telephonyService.getDashboardStats().catch(() => null),
      ])
      setLogs(logsRes.data?.logs || [])
      if (statsRes) setStats(statsRes.data)
    } catch {
      toast.error('Failed to load call logs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (telephonyEnabled) loadAll() }, [telephonyEnabled, loadAll])

  if (!telephonyEnabled) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center py-24">
        <Phone className="w-12 h-12 text-surface-300 mx-auto mb-3" />
        <p className="text-surface-500 font-medium">Telephony is not enabled for your organization.</p>
        <p className="text-surface-400 text-sm mt-1">Contact your administrator to enable a calling provider.</p>
      </div>
    )
  }

  const filteredLogs = logs.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return l.caller?.toLowerCase().includes(q) || l.receiver?.toLowerCase().includes(q)
  })

  const openProfile = (log) => {
    if (log.candidate_id) navigate(`/candidates/${log.candidate_id}`)
    else if (log.employee_id) navigate(`/hrm/employees/${log.employee_id}`)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <Phone className="w-7 h-7 text-primary-500" />
            Telephony
          </h1>
          <p className="text-surface-500 mt-1">
            Provider: <span className="font-medium text-surface-700">{PROVIDER_LABELS[telephonyProvider] || telephonyProvider}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TelephonyExportButton type="calls" label="Export" />
          <button onClick={loadAll} className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={PhoneCall} label="Today's Calls" value={stats.total_calls} accent="#6366f1" />
          <StatCard icon={PhoneIncoming} label="Answered" value={stats.answered} accent="#10b981" />
          <StatCard icon={PhoneMissed} label="Missed" value={stats.missed} accent="#ef4444" />
          <StatCard icon={PhoneOutgoing} label="Outgoing" value={stats.outgoing} accent="#0ea5e9" />
          <StatCard icon={PhoneIncoming} label="Incoming" value={stats.incoming} accent="#8b5cf6" />
          <StatCard icon={Clock} label="Avg Duration" value={`${stats.avg_duration}s`} accent="#f59e0b" />
          <StatCard icon={Activity} label="Active Calls" value={stats.active_calls} accent="#14b8a6" />
          <StatCard icon={TrendingUp} label="Success Rate" value={`${stats.success_rate}%`} accent="#22c55e" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by number..." className="input-field pl-9"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-44">
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-surface-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Direction</th>
              <th className="text-left px-4 py-3">Caller</th>
              <th className="text-left px-4 py-3">Receiver</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Duration</th>
              <th className="text-left px-4 py-3">Recording</th>
              <th className="text-left px-4 py-3">When</th>
              <th className="text-left px-4 py-3">Notes</th>
              <th className="text-left px-4 py-3">Profile</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-surface-400">No calls found.</td></tr>
            ) : filteredLogs.map(log => (
              <Fragment key={log.id}>
                <tr className="border-t border-surface-100">
                  <td className="px-4 py-3">
                    {MISSED_STATUSES.has(log.status)
                      ? <PhoneMissed className="w-4 h-4 text-red-500" />
                      : log.direction === 'inbound'
                        ? <PhoneIncoming className="w-4 h-4 text-emerald-500" />
                        : <PhoneOutgoing className="w-4 h-4 text-primary-500" />}
                  </td>
                  <td className="px-4 py-3">{log.caller || '—'}</td>
                  <td className="px-4 py-3">{log.receiver || '—'}</td>
                  <td className="px-4 py-3 capitalize">{log.status?.replace(/_/g, ' ') || '—'}</td>
                  <td className="px-4 py-3">{log.duration ? `${log.duration}s` : '—'}</td>
                  <td className="px-4 py-3">
                    {capabilities.recording_retrieval ? (log.recording_url ? 'Available' : '—') : '—'}
                  </td>
                  <td className="px-4 py-3 text-surface-400">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedNotes(cur => (cur === log.id ? null : log.id))}
                      className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                    >
                      <StickyNote className="w-3.5 h-3.5" /> {log.notes ? 'View' : 'Add'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {(log.candidate_id || log.employee_id) && (
                      <button type="button" onClick={() => openProfile(log)} className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" /> Open
                      </button>
                    )}
                  </td>
                </tr>
                {expandedNotes === log.id && (
                  <tr className="bg-surface-50/60">
                    <td colSpan={9} className="px-4 py-4">
                      <div className="max-w-lg space-y-3">
                        <CallNotes callId={log.call_id} initialNotes={log.notes} onSaved={(n) => setLogs(prev => prev.map(l => l.id === log.id ? { ...l, notes: n } : l))} />
                        <CallRecordingPlayer callId={log.call_id} recordingUrl={log.recording_url} duration={log.duration} />
                        <CallDispositionDialog callId={log.call_id} currentDisposition={log.disposition} onSaved={(d) => setLogs(prev => prev.map(l => l.id === log.id ? { ...l, disposition: d } : l))} />
                        <PostCallActions log={log} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
