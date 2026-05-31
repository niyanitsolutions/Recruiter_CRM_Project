import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Archive, RotateCcw, Trash2, Loader2, FileText, Search } from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const TYPE_BADGE = {
  simple:   'bg-violet-100 text-violet-700',
  advanced: 'bg-blue-100 text-blue-700',
  imported: 'bg-teal-100 text-teal-700',
}

export default function ArchivePage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [skip,      setSkip]      = useState(0)
  const LIMIT = 24

  const load = async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listArchive({ skip, limit: LIMIT })
      setTemplates(r.data?.data?.templates || [])
      setTotal(r.data?.data?.total || 0)
    } catch { toast.error('Failed to load archive') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [skip])

  const handleUnarchive = async (id, name) => {
    try {
      await documentCenterService.unarchiveTemplate(id)
      toast.success(`"${name}" restored to library`)
      load()
    } catch { toast.error('Restore failed') }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Permanently delete "${name}"?`)) return
    try {
      await documentCenterService.deleteTemplate(id)
      toast.success('Permanently deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  const filtered = search
    ? templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : templates

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Archive className="w-5 h-5 text-violet-600" /> Archive
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {total} archived templates — restore or permanently delete
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search archived templates…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <Archive className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium" style={{ color: 'var(--text-heading)' }}>Archive is empty</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Archive templates from the Template Library to store them here
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => (
              <div key={t._id}
                className="border rounded-xl overflow-hidden flex flex-col"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', opacity: 0.9 }}>
                <div className="h-1.5 flex-shrink-0 bg-gray-300" />
                <div className="p-4 flex-1">
                  <div className="flex items-start gap-2 mb-2">
                    <FileText className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text-heading)' }}>{t.name}</p>
                      {t.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{t.description}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_BADGE[t.template_type] || 'bg-gray-100 text-gray-600'}`}>
                      {t.template_type}
                    </span>
                    {t.category_name && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.category_name}</span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Archived · v{t.version} · {new Date(t.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex border-t" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => handleUnarchive(t._id, t.name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-r transition-colors hover:bg-green-50 text-green-600"
                    style={{ borderColor: 'var(--border)' }}>
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                  <button onClick={() => handleDelete(t._id, t.name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors hover:bg-red-50 text-red-500">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between mt-5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{skip + 1}–{Math.min(skip + LIMIT, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setSkip(s => Math.max(0, s - LIMIT))} disabled={skip === 0}
                  className="px-3 py-1 text-xs rounded border disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Prev</button>
                <button onClick={() => setSkip(s => s + LIMIT)} disabled={skip + LIMIT >= total}
                  className="px-3 py-1 text-xs rounded border disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
