import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, PhoneCall, X } from 'lucide-react'
import telephonyService from '../../services/telephonyService'

/**
 * In-module search — telephony data only (calls/notes/tags/dispositions).
 * Deliberately separate from the global GlobalSearch.jsx component; queries
 * the Phase 4 /telephony/search endpoint, not any recruitment/HRM index.
 */
export default function TelephonySearchBar() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const search = useCallback((query) => {
    if (!query.trim()) { setResults(null); return }
    setLoading(true)
    telephonyService.search(query)
      .then(r => { setResults(r.data); setOpen(true) })
      .catch(() => setResults(null))
      .finally(() => setLoading(false))
  }, [])

  const onChange = (e) => {
    const value = e.target.value
    setQ(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 350)
  }

  const openProfile = (log) => {
    setOpen(false)
    if (log.candidate_id) navigate(`/candidates/${log.candidate_id}`)
    else if (log.employee_id) navigate(`/hrm/employees/${log.employee_id}`)
  }

  const clear = () => { setQ(''); setResults(null); setOpen(false) }

  return (
    <div className="relative w-full max-w-xs" ref={ref}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
      <input
        type="text"
        value={q}
        onChange={onChange}
        onFocus={() => results && setOpen(true)}
        placeholder="Search calls, notes, dispositions…"
        className="input-field pl-9 pr-8 text-sm"
      />
      {q && (
        <button type="button" onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-300 hover:text-surface-500">
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl border border-surface-200 shadow-lg z-30 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary-500" /></div>
          ) : !results || results.calls.length === 0 ? (
            <p className="text-center text-xs text-surface-400 py-6">No matching calls.</p>
          ) : (
            results.calls.map(log => (
              <button
                key={log.id}
                type="button"
                onClick={() => openProfile(log)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-50 border-b border-surface-50 last:border-0"
              >
                <PhoneCall className="w-3.5 h-3.5 text-surface-300 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-surface-800 truncate">{log.caller || log.receiver || 'Unknown'}</p>
                  <p className="text-xs text-surface-400 truncate">
                    {log.disposition || log.status?.replace(/_/g, ' ')} · {log.created_at ? new Date(log.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
