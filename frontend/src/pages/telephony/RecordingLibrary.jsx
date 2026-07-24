import { Fragment, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Search, Download, ExternalLink, Music4, Star, Bookmark, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import RecordingReviewPanel from '../../components/telephony/RecordingReviewPanel'

/**
 * Central recording library. This tab only renders at all when
 * capabilities.recording_retrieval is true (gated in TelephonyLayout.jsx) —
 * so there's no "unsupported" empty state to design for here.
 */
export default function RecordingLibrary() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [expandedReview, setExpandedReview] = useState(null)

  const load = useCallback(async (q) => {
    try {
      setLoading(true)
      const res = await telephonyService.getRecordingsLibrary(q)
      setLogs(res.data?.logs || [])
    } catch {
      toast.error('Failed to load recordings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSearch = (e) => {
    e.preventDefault()
    load(search)
  }

  const openProfile = (log) => {
    if (log.candidate_id) navigate(`/candidates/${log.candidate_id}`)
    else if (log.employee_id) navigate(`/hrm/employees/${log.employee_id}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
          <Music4 className="w-5 h-5 text-primary-500" /> Recording Library
        </h2>
      </div>

      <form onSubmit={handleSearch} className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by number..." className="input-field pl-9"
        />
      </form>

      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-surface-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Caller</th>
              <th className="text-left px-4 py-3">Receiver</th>
              <th className="text-left px-4 py-3">Provider</th>
              <th className="text-left px-4 py-3">Duration</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Profile</th>
              <th className="text-left px-4 py-3">Recording</th>
              <th className="text-left px-4 py-3">Review</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-surface-400">No recordings found.</td></tr>
            ) : logs.map(log => (
              <Fragment key={log.id}>
                <tr className="border-t border-surface-100">
                  <td className="px-4 py-3">{log.caller || '—'}</td>
                  <td className="px-4 py-3">{log.receiver || '—'}</td>
                  <td className="px-4 py-3 capitalize">{log.provider?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">{log.duration ? `${log.duration}s` : '—'}</td>
                  <td className="px-4 py-3 text-surface-400">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    {(log.candidate_id || log.employee_id) && (
                      <button type="button" onClick={() => openProfile(log)} className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" /> Open
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.recording_url && (
                      <div className="flex items-center gap-2">
                        <audio controls src={log.recording_url} className="h-8" style={{ maxWidth: 180 }} />
                        <a href={log.recording_url} download target="_blank" rel="noreferrer" className="text-surface-400 hover:text-surface-600">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedReview(cur => (cur === log.id ? null : log.id))}
                      className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                    >
                      {log.is_favorited && <Star className="w-3.5 h-3.5" fill="currentColor" />}
                      {log.is_bookmarked && <Bookmark className="w-3.5 h-3.5" fill="currentColor" />}
                      {(log.review_comments || []).length > 0 && <MessageSquare className="w-3.5 h-3.5" />}
                      Review
                    </button>
                  </td>
                </tr>
                {expandedReview === log.id && (
                  <tr className="bg-surface-50/60">
                    <td colSpan={8} className="px-4 py-4">
                      <RecordingReviewPanel
                        log={log}
                        onChange={(updated) => setLogs(prev => prev.map(l => l.id === log.id ? { ...l, ...updated } : l))}
                      />
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
