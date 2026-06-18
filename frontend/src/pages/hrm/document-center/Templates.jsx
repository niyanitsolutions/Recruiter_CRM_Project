import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Search, Plus, Star, StarOff, Edit2, Trash2, Copy, Archive,
  Wand2, Filter, X, ChevronDown, MoreVertical, BookOpen,
  FileText, Layout, Upload, Clock, Tag, Loader2, Eye,
  RotateCcw, CheckCircle, History,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── Prebuilt library list (mirrors backend TEMPLATE_LIBRARY) ─────────────────
const PREBUILT = [
  { key: 'offer_letter',       name: 'Offer Letter',         category: 'HR Letters',  description: 'Standard employment offer letter' },
  { key: 'appointment_letter', name: 'Appointment Letter',   category: 'HR Letters',  description: 'Formal appointment confirmation' },
  { key: 'joining_letter',     name: 'Joining Letter',       category: 'HR Letters',  description: 'Welcome letter for new joiners' },
  { key: 'experience_letter',  name: 'Experience Letter',    category: 'HR Letters',  description: 'Work experience certificate' },
  { key: 'relieving_letter',   name: 'Relieving Letter',     category: 'HR Letters',  description: 'Employee relieving confirmation' },
  { key: 'promotion_letter',   name: 'Promotion Letter',     category: 'HR Letters',  description: 'Promotion announcement letter' },
  { key: 'transfer_letter',    name: 'Transfer Letter',      category: 'HR Letters',  description: 'Employee transfer order' },
  { key: 'warning_letter',     name: 'Warning Letter',       category: 'HR Letters',  description: 'Official warning notice' },
  { key: 'termination_letter', name: 'Termination Letter',   category: 'HR Letters',  description: 'Employment termination notice' },
  { key: 'nda',                name: 'NDA Agreement',        category: 'Legal',        description: 'Non-disclosure agreement' },
  { key: 'employment_agreement',name:'Employment Agreement', category: 'Legal',        description: 'Full employment contract' },
  { key: 'payslip',            name: 'Payslip',              category: 'Payroll',      description: 'Monthly salary slip' },
  { key: 'salary_certificate', name: 'Salary Certificate',   category: 'Payroll',      description: 'Salary verification certificate' },
  { key: 'internship_letter',  name: 'Internship Letter',    category: 'HR Letters',  description: 'Internship confirmation letter' },
  { key: 'asset_handover',     name: 'Asset Handover',       category: 'Operations',  description: 'Asset handover acknowledgement' },
  { key: 'exit_clearance',     name: 'Exit Clearance',       category: 'Operations',  description: 'Exit clearance checklist' },
]

const TYPE_ICONS = { simple: FileText, advanced: Layout, imported: Upload }
const TYPE_LABELS = { simple: 'Quick Builder', advanced: 'Advanced Designer', imported: 'Imported' }
const TYPE_COLORS = {
  simple: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  advanced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  imported: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
}
const CATEGORY_COLORS = ['HR Letters', 'Legal', 'Payroll', 'Operations']

// ─── Generate Modal ────────────────────────────────────────────────────────────
function GenerateModal({ template, onClose, onDone }) {
  const [docName, setDocName]   = useState(`${template.name} - ${new Date().toLocaleDateString()}`)
  const [empId, setEmpId]       = useState('')
  const [employees, setEmployees] = useState([])
  const [empSearch, setEmpSearch] = useState('')
  const [genPdf, setGenPdf]     = useState(true)
  const [genDocx, setGenDocx]   = useState(false)
  const [busy, setBusy]         = useState(false)
  const [empLoading, setEmpLoading] = useState(false)

  useEffect(() => {
    setEmpLoading(true)
    import('../../../services/api').then(m => m.default.get('/employees', { params: { limit: 200 } })
      .then(r => setEmployees(r.data?.data?.employees || r.data?.data || []))
      .catch(() => {})
      .finally(() => setEmpLoading(false))
    )
  }, [])

  const filteredEmps = employees.filter(e =>
    !empSearch || (e.full_name || '').toLowerCase().includes(empSearch.toLowerCase())
  )

  const handleGenerate = async () => {
    if (!docName.trim()) { toast.error('Document name is required'); return }
    setBusy(true)
    try {
      await documentCenterService.generateDocument({
        template_id: template._id || template.id,
        document_name: docName,
        employee_id: empId || null,
        field_values: {},
        generate_pdf: genPdf,
        generate_docx: genDocx,
      })
      toast.success('Document generated!')
      onDone?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl w-full max-w-md shadow-2xl" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold text-base" style={{ color: 'var(--text-heading)' }}>
            Generate Document
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Document Name *
            </label>
            <input
              value={docName}
              onChange={e => setDocName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Employee (optional)
            </label>
            <input
              placeholder="Search employee..."
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500 mb-1"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
            {empLoading ? (
              <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : (
              <select
                value={empId}
                onChange={e => setEmpId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                size={Math.min(filteredEmps.length + 1, 5)}
              >
                <option value="">— No Employee —</option>
                {filteredEmps.map(e => (
                  <option key={e._id || e.id} value={e._id || e.id}>
                    {e.full_name} {e.employee_id ? `(${e.employee_id})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-body)' }}>
              <input type="checkbox" checked={genPdf} onChange={e => setGenPdf(e.target.checked)} className="accent-violet-600" />
              Generate PDF
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-body)' }}>
              <input type="checkbox" checked={genDocx} onChange={e => setGenDocx(e.target.checked)} className="accent-violet-600" />
              Generate DOCX
            </label>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg text-sm border font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Version History Modal ─────────────────────────────────────────────────────
function VersionModal({ template, onClose }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [restoring, setRestoring] = useState(null)

  const tid = template._id || template.id

  useEffect(() => {
    documentCenterService.listVersions(tid)
      .then(r => setVersions(r.data?.data || []))
      .catch(() => toast.error('Failed to load versions'))
      .finally(() => setLoading(false))
  }, [tid])

  const restore = async (versionId) => {
    setRestoring(versionId)
    try {
      await documentCenterService.restoreVersion(tid, versionId)
      toast.success('Version restored')
      onClose()
    } catch {
      toast.error('Restore failed')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl w-full max-w-lg shadow-2xl" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold text-base" style={{ color: 'var(--text-heading)' }}>
            Version History — {template.name}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <div className="p-6 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
          ) : versions.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>No versions found</p>
          ) : (
            <div className="space-y-3">
              {versions.map((v, i) => (
                <div key={v._id} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>
                        v{v.version}
                      </span>
                      {i === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Current</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {v.change_summary || 'No description'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      By {v.created_by_name || 'Unknown'} · {new Date(v.created_at).toLocaleString()}
                    </p>
                  </div>
                  {i !== 0 && (
                    <button
                      onClick={() => restore(v._id)}
                      disabled={!!restoring}
                      className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
                    >
                      {restoring === v._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Template Card ─────────────────────────────────────────────────────────────
function TemplateCard({ template, onRefresh, onGenerate }) {
  const navigate  = useNavigate()
  const [menu, setMenu]         = useState(false)
  const [menuPos, setMenuPos]   = useState({ top: 0, right: 0 })
  const [busy, setBusy]         = useState('')
  const [showVersions, setShowVersions] = useState(false)
  const menuBtnRef = useRef(null)

  useEffect(() => {
    if (!menu) return
    const close = (e) => { if (!menuBtnRef.current?.contains(e.target)) setMenu(false) }
    const onScroll = () => setMenu(false)
    const onKey = (e) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const toggleMenu = () => {
    if (!menu && menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      const above = rect.bottom + 160 > window.innerHeight
      setMenuPos({
        top: above ? rect.top - 160 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setMenu(v => !v)
  }

  const id   = template._id || template.id
  const type = template.template_type || 'simple'
  const TypeIcon = TYPE_ICONS[type] || FileText

  const editPath = type === 'advanced'
    ? `/hrm/doc-center/advanced/${id}`
    : type === 'imported'
    ? `/hrm/doc-center/import/${id}`
    : `/hrm/doc-center/quick/${id}`

  const handleFavorite = async (e) => {
    e.stopPropagation()
    try {
      await documentCenterService.toggleFavorite(id)
      onRefresh()
    } catch { toast.error('Failed') }
  }

  const handleDuplicate = async () => {
    setBusy('dup')
    try {
      await documentCenterService.duplicateTemplate(id)
      toast.success('Template duplicated')
      onRefresh()
    } catch { toast.error('Duplicate failed') }
    finally { setBusy('') }
  }

  const handleArchive = async () => {
    if (!confirm(`Archive "${template.name}"?`)) return
    setBusy('arc')
    try {
      await documentCenterService.updateTemplate(id, { is_archived: true })
      toast.success('Template archived')
      onRefresh()
    } catch { toast.error('Archive failed') }
    finally { setBusy('') }
  }

  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${template.name}"?`)) return
    setBusy('del')
    try {
      await documentCenterService.deleteTemplate(id)
      toast.success('Template deleted')
      onRefresh()
    } catch { toast.error('Delete failed') }
    finally { setBusy('') }
  }

  return (
    <>
      <div
        className="group relative flex flex-col rounded-xl border transition-all hover:shadow-md overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        {/* Color accent bar */}
        <div
          className="h-1.5 w-full"
          style={{ background: template.category_color || '#7c3aed' }}
        />

        {/* Card body */}
        <div className="flex flex-col flex-1 p-4">
          {/* Top row */}
          <div className="flex items-start gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-heading)' }} title={template.name}>
                {template.name}
              </h3>
              {template.category_name && (
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                  {template.category_name}
                </p>
              )}
            </div>
            <button
              onClick={handleFavorite}
              className="flex-shrink-0 p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
              title={template.is_favorite ? 'Unfavorite' : 'Favorite'}
            >
              {template.is_favorite
                ? <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                : <StarOff className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              }
            </button>
          </div>

          {/* Description */}
          {template.description && (
            <p className="text-xs mb-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {template.description}
            </p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[type]}`}>
              {TYPE_LABELS[type]}
            </span>
            {(template.tags || []).slice(0, 2).map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {tag}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1">
              <Wand2 className="w-3 h-3" /> {template.generate_count || 0} generated
            </span>
            <span className="flex items-center gap-1">
              v{template.version || 1}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-auto">
            <button
              onClick={() => navigate(editPath)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              <Edit2 className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={() => onGenerate(template)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <Wand2 className="w-3 h-3" /> Generate
            </button>

            {/* More menu */}
            <div className="ml-auto">
              <button
                ref={menuBtnRef}
                onClick={toggleMenu}
                className="p-1.5 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                style={{ borderColor: 'var(--border)' }}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-muted)' }} />
                      : <MoreVertical className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
              </button>
              {menu && createPortal(
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setMenu(false)} />
                  <div
                    className="fixed z-[9999] py-1 rounded-xl overflow-hidden"
                    style={{
                      top: menuPos.top,
                      right: menuPos.right,
                      width: 176,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-card)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    }}
                  >
                    {[
                      { icon: History, label: 'Version History', color: '#6366f1', fn: () => { setShowVersions(true); setMenu(false) } },
                      { icon: Copy,    label: 'Duplicate',        color: '#10b981', fn: () => { handleDuplicate(); setMenu(false) } },
                      { icon: Archive, label: 'Archive',          color: '#f59e0b', fn: () => { handleArchive(); setMenu(false) } },
                      { icon: Trash2,  label: 'Delete',           danger: true,     fn: () => { handleDelete(); setMenu(false) } },
                    ].map(m => (
                      <button
                        key={m.label}
                        onClick={m.fn}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm"
                        style={{ color: m.danger ? '#ef4444' : 'var(--text-primary)' }}
                        onMouseEnter={e => e.currentTarget.style.background = m.danger ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <m.icon className="w-3.5 h-3.5" style={{ color: m.danger ? '#ef4444' : m.color }} />
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
        </div>
      </div>

      {showVersions && (
        <VersionModal template={template} onClose={() => setShowVersions(false)} />
      )}
    </>
  )
}

// ─── Prebuilt Card ─────────────────────────────────────────────────────────────
function PrebuiltCard({ item, onCreated }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const r = await documentCenterService.createFromLibrary(item.key)
      const newId = r.data?.data?._id
      toast.success(`"${item.name}" created — opening editor`)
      if (newId) navigate(`/hrm/doc-center/quick/${newId}`)
      onCreated?.()
    } catch {
      toast.error('Failed to create template')
    } finally {
      setBusy(false)
    }
  }

  const categoryColors = {
    'HR Letters': 'bg-violet-100 text-violet-700',
    'Legal':      'bg-blue-100 text-blue-700',
    'Payroll':    'bg-green-100 text-green-700',
    'Operations': 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="flex flex-col rounded-xl border transition-all hover:shadow-md p-4"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--bg-primary)' }}>
          <BookOpen className="w-4 h-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>{item.name}</h3>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${categoryColors[item.category] || 'bg-gray-100 text-gray-600'}`}>
            {item.category}
          </span>
        </div>
      </div>
      <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
      <button
        onClick={create}
        disabled={busy}
        className="mt-auto w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {busy ? 'Creating…' : 'Use Template'}
      </button>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Templates() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const TAB_KEYS = ['my', 'prebuilt']
  const activeTab = TAB_KEYS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'my'

  const [templates, setTemplates]   = useState([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [favFilter, setFavFilter]   = useState(false)
  const [genTemplate, setGenTemplate] = useState(null)
  const [prebuiltSearch, setPrebuiltSearch] = useState('')

  const setTab = (t) => setSearchParams({ tab: t })

  const load = useCallback(async () => {
    if (activeTab !== 'my') return
    setLoading(true)
    try {
      const params = {
        is_archived: false,
        ...(search       ? { search }               : {}),
        ...(typeFilter   ? { template_type: typeFilter } : {}),
        ...(favFilter    ? { is_favorite: true }    : {}),
        limit: 100,
        skip: 0,
      }
      const r = await documentCenterService.listTemplates(params)
      const d = r.data?.data
      setTemplates(d?.templates || [])
      setTotal(d?.total || 0)
    } catch {
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, typeFilter, favFilter])

  useEffect(() => { load() }, [load])

  const filteredPrebuilt = PREBUILT.filter(p =>
    !prebuiltSearch ||
    p.name.toLowerCase().includes(prebuiltSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(prebuiltSearch.toLowerCase())
  )

  const prebuiltByCategory = filteredPrebuilt.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Templates</h1>
            {activeTab === 'my' && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {total} template{total !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/hrm/doc-center/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-secondary)' }}>
          {[
            { key: 'my',       label: 'My Templates' },
            { key: 'prebuilt', label: 'Prebuilt Library' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.key ? 'bg-white dark:bg-gray-800 shadow text-violet-700 dark:text-violet-400' : ''
              }`}
              style={activeTab !== t.key ? { color: 'var(--text-muted)' } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── My Templates ── */}
      {activeTab === 'my' && (
        <>
          {/* Filters */}
          <div className="px-6 py-3 flex items-center gap-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              <option value="">All Types</option>
              <option value="simple">Quick Builder</option>
              <option value="advanced">Advanced Designer</option>
              <option value="imported">Imported</option>
            </select>
            <button
              onClick={() => setFavFilter(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                favFilter ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20' : ''
              }`}
              style={favFilter ? {} : { borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              <Star className={`w-4 h-4 ${favFilter ? 'text-amber-400 fill-amber-400' : ''}`} />
              Favorites
            </button>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FileText className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="font-medium mb-1" style={{ color: 'var(--text-heading)' }}>
                  {search || typeFilter || favFilter ? 'No templates match your filters' : 'No templates yet'}
                </p>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  {search || typeFilter || favFilter
                    ? 'Try clearing your filters'
                    : 'Create your first template to get started'}
                </p>
                {!search && !typeFilter && !favFilter && (
                  <button
                    onClick={() => navigate('/hrm/doc-center/new')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                  >
                    <Plus className="w-4 h-4" /> Create Template
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {templates.map(t => (
                  <TemplateCard
                    key={t._id || t.id}
                    template={t}
                    onRefresh={load}
                    onGenerate={setGenTemplate}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Prebuilt Library ── */}
      {activeTab === 'prebuilt' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                value={prebuiltSearch}
                onChange={e => setPrebuiltSearch(e.target.value)}
                placeholder="Search prebuilt templates..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
              />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {filteredPrebuilt.length} templates
            </p>
          </div>

          {Object.entries(prebuiltByCategory).map(([cat, items]) => (
            <div key={cat} className="mb-8">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                <Tag className="w-3.5 h-3.5 text-violet-500" />
                {cat}
                <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                  {items.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map(item => (
                  <PrebuiltCard key={item.key} item={item} onCreated={load} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {genTemplate && (
        <GenerateModal
          template={genTemplate}
          onClose={() => setGenTemplate(null)}
          onDone={() => navigate('/hrm/doc-center/generated')}
        />
      )}
    </div>
  )
}
