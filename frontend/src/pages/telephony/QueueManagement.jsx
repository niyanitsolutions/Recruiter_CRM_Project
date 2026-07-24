import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ListOrdered, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'

/**
 * This tab only mounts at all when capabilities.queue_management is true
 * (gated in TelephonyLayout.jsx) — no provider verified in Phase 1 declares
 * this capability, so today this is fully built but never rendered for any
 * tenant, exactly like Airtel IQ/MyOperator's "registered but blocked"
 * pattern. Kept generic (no hardcoded provider assumptions) so a future
 * provider adapter that does declare real queue support "just works" here.
 */
export default function QueueManagement() {
  const [loading, setLoading] = useState(true)
  const [queues, setQueues] = useState([])
  const [selected, setSelected] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await telephonyService.getQueues()
      setQueues(res.data?.data || [])
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load queues.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openQueue = async (queue) => {
    const queueId = queue.id || queue.queue_id
    setSelected(queue)
    setMembersLoading(true)
    try {
      const res = await telephonyService.getQueueMembers(queueId)
      setMembers(res.data?.data || [])
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load queue members.')
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-primary-500" /> Queue Management
        </h2>
        <button onClick={load} className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-surface-200 p-5">
          <h3 className="text-sm font-semibold text-surface-700 mb-3">Queues</h3>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
          ) : queues.length === 0 ? (
            <p className="text-sm text-surface-400">No queues found.</p>
          ) : (
            <div className="space-y-2">
              {queues.map(q => (
                <button
                  key={q.id || q.queue_id}
                  type="button"
                  onClick={() => openQueue(q)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    (selected?.id || selected?.queue_id) === (q.id || q.queue_id) ? 'bg-primary-50 text-primary-700' : 'hover:bg-surface-50 text-surface-700'
                  }`}
                >
                  <span className="font-medium">{q.name || q.id || q.queue_id}</span>
                  {typeof q.waiting_calls === 'number' && (
                    <span className="ml-2 text-xs text-surface-400">{q.waiting_calls} waiting</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-surface-200 p-5">
          <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Members {selected && `— ${selected.name || selected.id || selected.queue_id}`}
          </h3>
          {!selected ? (
            <p className="text-sm text-surface-400">Select a queue to view its members.</p>
          ) : membersLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
          ) : members.length === 0 ? (
            <p className="text-sm text-surface-400">No members in this queue.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m, idx) => (
                <div key={m.id || m.agent_id || idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-50 text-sm">
                  <span className="text-surface-700">{m.name || m.agent_name || m.id || m.agent_id}</span>
                  {m.status && <span className="text-xs text-surface-400 capitalize">{m.status.replace(/_/g, ' ')}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
