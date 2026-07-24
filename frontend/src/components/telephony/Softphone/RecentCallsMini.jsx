import { useState, useEffect } from 'react'
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Search, Loader2 } from 'lucide-react'
import telephonyService from '../../../services/telephonyService'
import { useTelephony } from '../../../context/TelephonyContext'

const MISSED_STATUSES = new Set(['missed', 'no-answer', 'failed', 'busy'])

export default function RecentCallsMini() {
  const { dial } = useTelephony()
  const [loading, setLoading] = useState(true)
  const [calls, setCalls] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    telephonyService.listCalls({ limit: 20 })
      .then(r => setCalls(r.data?.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = calls.filter(c =>
    !search || c.caller?.includes(search) || c.receiver?.includes(search)
  )

  const icon = (c) => {
    if (MISSED_STATUSES.has(c.status)) return <PhoneMissed className="w-4 h-4 text-red-500" />
    return c.direction === 'inbound'
      ? <PhoneIncoming className="w-4 h-4 text-emerald-500" />
      : <PhoneOutgoing className="w-4 h-4 text-primary-500" />
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search recent calls..." className="input-field pl-8 text-sm"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-500" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-surface-400 text-center py-6">No recent calls.</p>
        ) : filtered.map(c => {
          const number = c.direction === 'inbound' ? c.caller : c.receiver
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => number && dial({ to: number, candidateId: c.candidate_id, employeeId: c.employee_id })}
              className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-50 text-left transition-colors"
            >
              {icon(c)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-surface-800 truncate">{number || '—'}</p>
                <p className="text-[11px] text-surface-400">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
