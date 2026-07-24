import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, User2 } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import userService from '../../services/userService'
import TelephonyExportButton from '../../components/telephony/TelephonyExportButton'

export default function AgentPerformance() {
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [names, setNames] = useState({})

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await telephonyService.getAgentPerformance()
      const rows = res.data?.agents || []
      setAgents(rows)

      try {
        const usersRes = await userService.getUsers({ page_size: 200 })
        const list = Array.isArray(usersRes) ? usersRes : (usersRes?.users || usersRes?.items || [])
        const map = {}
        list.forEach(u => { map[u.id || u._id] = u.full_name || u.username })
        setNames(map)
      } catch { /* name resolution is a cosmetic nicety — fall back to raw user_id */ }
    } catch {
      toast.error('Failed to load agent performance.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900">Agent Performance</h2>
        <div className="flex items-center gap-2">
          <TelephonyExportButton type="agent_performance" label="Export" />
          <button onClick={load} className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
      <p className="text-xs text-surface-400 -mt-4">
        Based on outbound calls only — there's no call-routing/agent-assignment for inbound calls in this system.
      </p>

      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-surface-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Agent</th>
              <th className="text-left px-4 py-3">Total Calls</th>
              <th className="text-left px-4 py-3">Answered</th>
              <th className="text-left px-4 py-3">Missed</th>
              <th className="text-left px-4 py-3">Avg Duration</th>
              <th className="text-left px-4 py-3">Total Talk Time</th>
              <th className="text-left px-4 py-3">Success Rate</th>
              <th className="text-left px-4 py-3">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
            ) : agents.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-surface-400">No agent activity yet.</td></tr>
            ) : agents.map(a => (
              <tr key={a.user_id} className="border-t border-surface-100">
                <td className="px-4 py-3 flex items-center gap-2">
                  <User2 className="w-4 h-4 text-surface-400" />
                  {names[a.user_id] || a.user_id}
                </td>
                <td className="px-4 py-3">{a.total_calls}</td>
                <td className="px-4 py-3">{a.answered}</td>
                <td className="px-4 py-3">{a.missed}</td>
                <td className="px-4 py-3">{a.avg_duration ? `${Math.round(a.avg_duration)}s` : '—'}</td>
                <td className="px-4 py-3">{a.total_talk_time}s</td>
                <td className="px-4 py-3">{a.success_rate}%</td>
                <td className="px-4 py-3 text-surface-400">{a.last_active ? new Date(a.last_active).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
