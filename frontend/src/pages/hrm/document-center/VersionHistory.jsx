import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  History, Search, RefreshCw, RotateCcw, Loader2, X,
  ChevronLeft, ChevronRight, FileText, User, Calendar,
  MessageSquare, Clock, Tag,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const LIMIT = 30

// ─── Restore confirmation modal ────────────────────────────────────────────────
function RestoreModal({ version, onClose, onRestored }) {
  const [busy, setBusy] = useState(false)

  const handleRestore = async () => {
    setBusy(true)
    try {
      await documentCenterService.restoreVersion(version.template_id, version.id)
      toast.success(`Restored "${version.name}" to v${version.version}`)
      onRestored()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>Restore Version</h3>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="p-5">
          <div className="p-3 rounded-xl mb-4" style={{ background: 'var(--bg-primary)' }}>
            <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-heading)' }}>{version.name}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Version {version.version} · {version.change_summary || 'No description'}
            </p>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-body)' }}>
            This will create a new version restoring the template to this state. The current version will be preserved in history.
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm border font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              Cancel
            </button>
            <button onClick={handleRestore} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Version Row ───────────────────────────────────────────────────────────────
function VersionRow({ version, onRestore }) {
  const navigate  = useNavigate()
  const typeMap   = { simple: 'Quick Builder', advanced: 'Advanced Designer', imported: 'Imported' }
  const editPath  = version.template_type === 'advanced'
    ? `/hrm/doc-center/advanced/${version.template_id}`
    : `/hrm/doc-center/quick/${version.template_id}`

  return (
    <tr
      className="hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--bg-secondary)' }}>
            <FileText className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <div className="min-w-0">
            <button
              onClick={() => navigate(editPath)}
              className="font-medium text-sm truncate max-w-xs text-left hover:text-violet-600 hover:underline block"
              style={{ color: 'var(--text-heading)' }}
              title={version.name}
            >
              {version.name}
            </button>
            {version.template_type && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {typeMap[version.template_type] || version.template_type}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          v{version.version}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm max-w-xs truncate" style={{ color: 'var(--text-body)' }} title={version.change_summary}>
          {version.change_summary || <span className="italic" style={{ color: 'var(--text-muted)' }}>No description</span>}
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <User className="w-3 h-3" />
          {version.created_by_name || 'Unknown'}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Clock className="w-3 h-3" />
          {new Date(version.created_at).toLocaleDateString()} {new Date(version.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onRestore(version)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
          style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
          title="Restore this version"
        >
          <RotateCcw className="w-3 h-3" /> Restore
        </button>
      </td>
    </tr>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function VersionHistory() {
  const [versions,  setVersions]  = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [skip,      setSkip]      = useState(0)
  const [templates, setTemplates] = useState([])
  const [tmplFilter, setTmplFilter] = useState('')
  const [restoreTarget, setRestoreTarget] = useState(null)

  // Load templates for filter dropdown
  useEffect(() => {
    documentCenterService.listTemplates({ limit: 200 })
      .then(r => setTemplates(r.data?.data?.templates || []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listAllVersions({
        ...(search      ? { search }              : {}),
        ...(tmplFilter  ? { template_id: tmplFilter } : {}),
        skip,
        limit: LIMIT,
      })
      const d = r.data?.data
      setVersions(d?.versions || [])
      setTotal(d?.total || 0)
    } catch {
      toast.error('Failed to load version history')
    } finally {
      setLoading(false)
    }
  }, [search, tmplFilter, skip])

  useEffect(() => { load() }, [load])

  // Reset skip when filters change
  useEffect(() => { setSkip(0) }, [search, tmplFilter])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Version History</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {total} version{total !== 1 ? 's' : ''} across all templates
            </p>
          </div>
          <button onClick={load} className="p-2 rounded-lg border" style={{ borderColor: 'var(--border)' }} title="Refresh">
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates or summaries…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>

          {/* Template filter */}
          <select
            value={tmplFilter}
            onChange={e => setTmplFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          >
            <option value="">All Templates</option>
            {templates.map(t => (
              <option key={t._id || t.id} value={t._id || t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className="px-6 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="font-medium">Tip:</span> Restoring a version creates a new version snapshot preserving all history. No data is lost.
        </p>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <History className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium mb-1" style={{ color: 'var(--text-heading)' }}>
              {search || tmplFilter ? 'No versions match your filters' : 'No version history yet'}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {search || tmplFilter
                ? 'Try clearing your filters'
                : 'Versions are created automatically when templates are saved or updated'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                {['Template', 'Version', 'Change Summary', 'Author', 'Date', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {versions.map(v => (
                <VersionRow
                  key={v.id}
                  version={v}
                  onRestore={setRestoreTarget}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {total > LIMIT && (
        <div className="flex items-center justify-between px-6 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {skip + 1}–{Math.min(skip + LIMIT, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={skip === 0}
              onClick={() => setSkip(s => Math.max(0, s - LIMIT))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              disabled={skip + LIMIT >= total}
              onClick={() => setSkip(s => s + LIMIT)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Restore modal ── */}
      {restoreTarget && (
        <RestoreModal
          version={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onRestored={load}
        />
      )}
    </div>
  )
}
