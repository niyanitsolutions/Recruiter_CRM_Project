import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  BookOpen, Search, Plus, Star, Edit3, Trash2, Loader2,
  FileText, Archive, Filter, Download, Wand2, ChevronRight,
  MoreVertical, Upload,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const STATUS_BADGE = {
  draft:    { cls: 'bg-gray-100 text-gray-600',    label: 'Draft' },
  review:   { cls: 'bg-amber-100 text-amber-700',  label: 'In Review' },
  approved: { cls: 'bg-green-100 text-green-700',  label: 'Approved' },
  archived: { cls: 'bg-rose-100 text-rose-700',    label: 'Archived' },
}

const TYPE_BADGE = {
  simple:   { cls: 'bg-violet-100 text-violet-700', label: 'Simple' },
  advanced: { cls: 'bg-blue-100 text-blue-700',     label: 'Advanced' },
  imported: { cls: 'bg-teal-100 text-teal-700',     label: 'Imported' },
}

const PREBUILT_CATEGORIES = [
  'All', 'HR Letters', 'Legal', 'Payroll', 'Operations',
]

export default function TemplateLibrary() {
  const navigate = useNavigate()
  const [tab,       setTab]      = useState('mine')       // mine | prebuilt
  const [templates, setTemplates] = useState([])
  const [library,   setLibrary]  = useState([])
  const [total,     setTotal]    = useState(0)
  const [loading,   setLoading]  = useState(true)
  const [search,    setSearch]   = useState('')
  const [status,    setStatus]   = useState('')
  const [catFilter, setCatFilter]= useState('All')
  const [categories, setCategories] = useState([])
  const [catId,     setCatId]    = useState('')
  const [creating,  setCreating] = useState(null)   // library key being created
  const [menuOpen,  setMenuOpen] = useState(null)
  const LIMIT = 24

  const loadMyTemplates = async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listTemplates({
        search:      search || undefined,
        status:      status || undefined,
        category_id: catId  || undefined,
        limit:       LIMIT,
      })
      setTemplates(r.data?.data?.templates || [])
      setTotal(r.data?.data?.total || 0)
    } catch { toast.error('Failed to load templates') }
    finally  { setLoading(false) }
  }

  const loadLibrary = async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.getLibrary()
      setLibrary(r.data?.data || [])
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'mine') loadMyTemplates()
    else loadLibrary()
  }, [tab, search, status, catId])

  const handleFavorite = async (id) => {
    try {
      await documentCenterService.toggleFavorite(id)
      setTemplates(ts => ts.map(t => t._id === id ? { ...t, is_favorite: !t.is_favorite } : t))
    } catch { toast.error('Failed') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this template and all its versions?')) return
    try {
      await documentCenterService.deleteTemplate(id)
      toast.success('Template deleted')
      loadMyTemplates()
    } catch { toast.error('Delete failed') }
  }

  const handleArchive = async (id) => {
    try {
      await documentCenterService.updateTemplate(id, { is_archived: true })
      toast.success('Archived')
      loadMyTemplates()
    } catch { toast.error('Archive failed') }
  }

  const handleCreateFromLibrary = async (key) => {
    setCreating(key)
    try {
      const r = await documentCenterService.createFromLibrary(key, catId || undefined)
      const newId = r.data?.data?._id
      toast.success('Template created from library')
      if (newId) navigate(`/hrm/doc-center/builder/${newId}`)
    } catch { toast.error('Failed to create template') }
    finally { setCreating(null) }
  }

  const filteredLibrary = library.filter(item =>
    (catFilter === 'All' || item.category === catFilter) &&
    (!search || item.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>
            {tab === 'mine' ? `My Templates (${total})` : 'Template Library'}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {tab === 'mine' ? 'Templates created by your team' : 'Pre-built HR document templates ready to use'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/hrm/doc-center/import')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Upload className="w-4 h-4" /> Import
          </button>
          <button onClick={() => navigate('/hrm/doc-center/builder')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'mine',     label: 'My Templates' },
          { key: 'prebuilt', label: 'Pre-built Library' },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch('') }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-violet-600 text-violet-600' : 'border-transparent'
            }`}
            style={tab !== t.key ? { color: 'var(--text-muted)' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-48 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
        </div>
        {tab === 'mine' ? (
          <>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="approved">Approved</option>
            </select>
            <select value={catId} onChange={e => setCatId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </>
        ) : (
          <div className="flex gap-1">
            {PREBUILT_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  catFilter === cat ? 'bg-violet-600 text-white' : 'border'
                }`}
                style={catFilter !== cat ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
        </div>
      ) : tab === 'mine' ? (
        templates.length === 0 ? (
          <div className="text-center py-16 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium" style={{ color: 'var(--text-heading)' }}>No templates yet</p>
            <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>Create your first template or import from the library</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => navigate('/hrm/doc-center/builder')}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                Create Template
              </button>
              <button onClick={() => setTab('prebuilt')}
                className="px-5 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                Browse Library
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t._id}
                className="border rounded-xl overflow-hidden flex flex-col transition-all hover:shadow-md hover:-translate-y-0.5"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                {/* Color strip */}
                <div className="h-2 flex-shrink-0" style={{ background: t.category_color || '#7c3aed' }} />

                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-heading)' }}>{t.name}</h3>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{t.description || 'No description'}</p>
                    </div>
                    <button onClick={() => handleFavorite(t._id)} className="p-1 flex-shrink-0 rounded hover:bg-amber-50">
                      <Star className={`w-4 h-4 ${t.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} style={!t.is_favorite ? { color: 'var(--text-muted)' } : {}} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[t.status]?.cls || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_BADGE[t.status]?.label || t.status}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_BADGE[t.template_type]?.cls || 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_BADGE[t.template_type]?.label || t.template_type}
                    </span>
                    {t.category_name && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.category_name}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs mt-auto" style={{ color: 'var(--text-muted)' }}>
                    <span>v{t.version}</span>
                    <span>·</span>
                    <span>{t.generate_count || 0} generated</span>
                    <span>·</span>
                    <span>{new Date(t.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex border-t" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => navigate(`/hrm/doc-center/${t.template_type === 'advanced' ? 'designer' : 'builder'}/${t._id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-r transition-colors hover:bg-violet-50"
                    style={{ borderColor: 'var(--border)', color: '#7c3aed' }}>
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => navigate(`/hrm/doc-center/generated?template_id=${t._id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-r transition-colors hover:bg-green-50"
                    style={{ borderColor: 'var(--border)', color: '#059669' }}>
                    <Wand2 className="w-3.5 h-3.5" /> Generate
                  </button>
                  <div className="relative">
                    <button onClick={() => setMenuOpen(menuOpen === t._id ? null : t._id)}
                      className="flex items-center justify-center w-10 py-2.5 transition-colors hover:bg-gray-50">
                      <MoreVertical className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    </button>
                    {menuOpen === t._id && (
                      <div className="absolute right-0 bottom-full mb-1 w-40 rounded-lg shadow-lg border z-10"
                        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                        <button onClick={() => { navigate(`/hrm/doc-center/history?template_id=${t._id}`); setMenuOpen(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--text-body)' }}>
                          <FileText className="w-3.5 h-3.5" /> Versions ({t.version})
                        </button>
                        <button onClick={() => { handleArchive(t._id); setMenuOpen(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-amber-50 text-amber-700">
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </button>
                        <button onClick={() => { handleDelete(t._id); setMenuOpen(null) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 text-red-600">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Pre-built library grid */
        filteredLibrary.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p style={{ color: 'var(--text-muted)' }}>No templates found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLibrary.map(item => (
              <div key={item.key}
                className="border rounded-xl p-4 flex flex-col gap-2 transition-all hover:shadow-md hover:border-violet-300"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{item.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{item.category}</span>
                  </div>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
                <button
                  onClick={() => handleCreateFromLibrary(item.key)}
                  disabled={creating === item.key}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white mt-1 transition-opacity disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                  {creating === item.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {creating === item.key ? 'Creating…' : 'Use Template'}
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
