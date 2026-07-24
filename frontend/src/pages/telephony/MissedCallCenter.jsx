import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, PhoneMissed, PhoneOutgoing, StickyNote, ListTodo, CheckCircle2, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import userService from '../../services/userService'
import { useTelephony } from '../../context/TelephonyContext'
import { usePermissions } from '../../hooks/usePermissions'
import CallNotes from '../../components/telephony/CallNotes'
import QuickTaskModal from '../../components/telephony/QuickTaskModal'

const FILTERS = [
  { key: null, label: 'All Missed' },
  { key: 'pending', label: 'Callback Pending' },
  { key: 'completed', label: 'Callback Completed' },
]

const SOURCE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'assigned', label: 'Callback Requested (Assigned)' },
  { key: 'unassigned', label: 'Unassigned' },
]

export default function MissedCallCenter() {
  const { dial } = useTelephony()
  const { has } = usePermissions()
  const canReassign = has('telephony:supervisor')
  const [loading, setLoading] = useState(true)
  const [calls, setCalls] = useState([])
  const [filter, setFilter] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [expandedNotes, setExpandedNotes] = useState(null)
  const [taskModalLog, setTaskModalLog] = useState(null)
  const [agents, setAgents] = useState([])
  const [agentNames, setAgentNames] = useState({})

  const load = useCallback(async (f) => {
    try {
      setLoading(true)
      const res = await telephonyService.getMissedCalls(f)
      setCalls(res.data?.logs || [])
    } catch {
      toast.error('Failed to load missed calls.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  useEffect(() => {
    if (!canReassign) return
    userService.getUsers({ page_size: 200 }).then(res => {
      const list = Array.isArray(res) ? res : (res?.users || res?.items || [])
      setAgents(list)
      const map = {}
      list.forEach(u => { map[u.id || u._id] = u.full_name || u.username })
      setAgentNames(map)
    }).catch(() => {})
  }, [canReassign])

  const visibleCalls = calls.filter(c => {
    if (sourceFilter === 'assigned') return !!c.assigned_to
    if (sourceFilter === 'unassigned') return !c.assigned_to
    return true
  })

  const reassign = async (log, userId) => {
    if (!userId) return
    try {
      await telephonyService.reassignCall(log.call_id, userId)
      setCalls(prev => prev.map(c => c.id === log.id ? { ...c, assigned_to: userId } : c))
      toast.success(`Reassigned to ${agentNames[userId] || 'agent'}.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reassign.')
    }
  }

  const markCallback = async (log, status) => {
    try {
      await telephonyService.setCallbackStatus(log.call_id, status)
      setCalls(prev => prev.map(c => c.id === log.id ? { ...c, callback_status: status } : c))
      toast.success(status === 'completed' ? 'Marked as called back.' : 'Marked as pending.')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update callback status.')
    }
  }

  const callBack = async (log) => {
    if (!log.caller) return
    await dial({ to: log.caller, candidateId: log.candidate_id, employeeId: log.employee_id })
    markCallback(log, 'completed')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
          <PhoneMissed className="w-5 h-5 text-red-500" /> Missed Call Center
        </h2>
        <button onClick={() => load(filter)} className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-surface-50 rounded-xl p-1 w-fit">
          {FILTERS.map(f => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.key ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Phase 4: Callback Queue source filter */}
        <div className="flex bg-surface-50 rounded-xl p-1 w-fit">
          {SOURCE_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setSourceFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sourceFilter === f.key ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
        ) : visibleCalls.length === 0 ? (
          <div className="bg-white rounded-2xl border border-surface-200 p-10 text-center text-surface-400">No missed calls found.</div>
        ) : visibleCalls.map(log => (
          <div key={log.id} className="bg-white rounded-2xl border border-surface-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-surface-900">{log.caller || 'Unknown'}</p>
                <p className="text-xs text-surface-400">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : ''} · {log.status?.replace(/_/g, ' ')}
                  {log.assigned_to && ` · Assigned: ${agentNames[log.assigned_to] || log.assigned_to}`}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.callback_status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                {log.callback_status === 'completed' ? 'Called back' : 'Pending'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => callBack(log)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium">
                <PhoneOutgoing className="w-3.5 h-3.5" /> Call Back
              </button>
              <button type="button" onClick={() => setExpandedNotes(cur => cur === log.id ? null : log.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium">
                <StickyNote className="w-3.5 h-3.5" /> Add Note
              </button>
              <button type="button" onClick={() => setTaskModalLog(log)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium">
                <ListTodo className="w-3.5 h-3.5" /> Create Task
              </button>
              {log.callback_status !== 'completed' && (
                <button type="button" onClick={() => markCallback(log, 'completed')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark Done
                </button>
              )}
              {canReassign && (
                <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-100 text-surface-700 text-xs font-medium">
                  <UserPlus className="w-3.5 h-3.5" />
                  <select
                    value={log.assigned_to || ''}
                    onChange={e => reassign(log, e.target.value)}
                    className="bg-transparent text-xs focus:outline-none"
                  >
                    <option value="">Reassign to…</option>
                    {agents.map(a => (
                      <option key={a.id || a._id} value={a.id || a._id}>{a.full_name || a.username}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {expandedNotes === log.id && (
              <div className="pt-2 border-t border-surface-100">
                <CallNotes callId={log.call_id} initialNotes={log.notes} />
              </div>
            )}
          </div>
        ))}
      </div>

      {taskModalLog && (
        <QuickTaskModal
          log={taskModalLog}
          defaultTitle={`Follow up: missed call from ${taskModalLog.caller || 'candidate'}`}
          onClose={() => setTaskModalLog(null)}
        />
      )}
    </div>
  )
}
