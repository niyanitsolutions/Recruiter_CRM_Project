import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Archive as ArchiveIcon, RotateCcw, Trash2, Loader2, FileText, Search, RefreshCw } from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

export default function Archive() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [busy,      setBusy]      = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listArchive({ skip: 0, limit: 100 })
      const d = r.data?.data
      setTemplates(d?.templates || [])
      setTotal(d?.total || 0)
    } catch {
      toast.error('Failed to load archive')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRestore = async (id, name) => {
    setBusy(b => ({ ...b, [id]: 'restore' }))
    try {
      await documentCenterService.unarchiveTemplate(id)
      toast.success(`"${name}" restored to Templates`)
      load()
    } catch {
      toast.error('Restore failed')
    } finally {
      setBusy(b => ({ ...b, [id]: null }))
    }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return
    setBusy(b => ({ ...b, [id]: 'delete' }))
    try {
      await documentCenterService.deleteTemplate(id)
      toast.success('Template deleted permanently')
      load()
    } catch {
      toast.error('Delete failed')
    } finally {
      setBusy(b => ({ ...b, [id]: null }))
    }
  }

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Archive</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {total} archived template{total !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={load} className="p-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Info banner */}
        <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <ArchiveIcon className="w-4 h-4 flex-shrink-0 text-violet-500" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Archived templates are hidden from the main Templates list but preserved here.
            Restore them to make them active again.
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search archived templates…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <ArchiveIcon className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium mb-1" style={{ color: 'var(--text-heading)' }}>
              {search ? 'No matching archived templates' : 'No archived templates'}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {search
                ? 'Try a different search term'
                : 'Archive templates from the Templates page to keep them organized'}
            </p>
            {!search && (
              <button onClick={() => navigate('/hrm/doc-center/templates')}
                className="mt-4 px-4 py-2 rounded-xl text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                Go to Templates
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => {
              const id   = t._id || t.id
              const isB  = busy[id]
              return (
                <div key={id} className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-sm"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg-primary)' }}>
                    <FileText className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate" style={{ color: 'var(--text-heading)' }}>{t.name}</h3>
                    <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span>{t.template_type === 'advanced' ? 'Advanced Designer' : t.template_type === 'imported' ? 'Imported' : 'Quick Builder'}</span>
                      {t.category_name && <span>· {t.category_name}</span>}
                      <span>· v{t.version || 1}</span>
                      <span>· {new Date(t.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleRestore(id, t.name)} disabled={!!isB}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                      {isB === 'restore' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Restore
                    </button>
                    <button onClick={() => handleDelete(id, t.name)} disabled={!!isB}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 border-red-200 disabled:opacity-50">
                      {isB === 'delete' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
