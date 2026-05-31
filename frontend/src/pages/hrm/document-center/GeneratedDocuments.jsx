import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FileText, Download, Send, Trash2, Search, Filter,
  Eye, RefreshCw, Loader2, Plus, Calendar, User, CheckCircle,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const STATUS_COLORS = {
  generated: 'bg-blue-100 text-blue-700',
  sent:      'bg-green-100 text-green-700',
  signed:    'bg-violet-100 text-violet-700',
  draft:     'bg-gray-100 text-gray-600',
  archived:  'bg-amber-100 text-amber-700',
}

const GenerateModal = ({ templates, onClose, onGenerate }) => {
  const [templateId, setTemplateId] = useState(templates[0]?._id || '')
  const [docName,    setDocName]    = useState('')
  const [empId,      setEmpId]      = useState('')
  const [employees,  setEmployees]  = useState([])
  const [fields,     setFields]     = useState({})
  const [generating, setGenerating] = useState(false)
  const [selectedTmpl, setSelectedTmpl] = useState(null)

  useEffect(() => {
    import('../../../services/hrmService').then(m => {
      m.default.listEmployees({ limit: 200 }).then(r => setEmployees(r.data?.employees || r.data?.data?.employees || [])).catch(() => {})
    })
  }, [])

  useEffect(() => {
    const t = templates.find(t => t._id === templateId)
    setSelectedTmpl(t)
    if (t) setDocName(`${t.name} — ${new Date().toLocaleDateString()}`)
  }, [templateId, templates])

  const dynamicFields = selectedTmpl?.dynamic_fields || []

  const handleGenerate = async () => {
    if (!templateId) { toast.error('Select a template'); return }
    if (!docName.trim()) { toast.error('Document name required'); return }
    setGenerating(true)
    try {
      await onGenerate({ template_id: templateId, document_name: docName, employee_id: empId || undefined, field_values: fields, generate_pdf: true })
      onClose()
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-heading)' }}>Generate Document</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><span className="text-gray-500 text-xl leading-none">&times;</span></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Template *</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Document Name *</label>
            <input value={docName} onChange={e => setDocName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Employee (optional)</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <option value="">— No employee —</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.full_name} ({e.employee_id || e._id?.slice(0,6)})</option>)}
            </select>
          </div>
          {dynamicFields.filter(f => !['employee_name','employee_id','department','designation','salary','joining_date','exit_date','manager_name','company_name','current_date','month_year','employee_email','employee_address','employee_phone'].includes(f)).length > 0 && (
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Custom Field Values</label>
              <div className="space-y-2">
                {dynamicFields.filter(f => !['employee_name','employee_id','department','designation','salary','joining_date','exit_date','manager_name','company_name','current_date','month_year','employee_email','employee_address','employee_phone'].includes(f)).map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', minWidth: 120 }}>{`{{${f}}}`}</span>
                    <input
                      value={fields[f] || ''}
                      onChange={e => setFields(prev => ({ ...prev, [f]: e.target.value }))}
                      placeholder={`Value for ${f}`}
                      className="flex-1 px-2 py-1 text-sm rounded border"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Cancel</button>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GeneratedDocuments() {
  const [searchParams]       = useSearchParams()
  const initTemplateId       = searchParams.get('template_id') || ''
  const [docs,      setDocs] = useState([])
  const [total,    setTotal] = useState(0)
  const [loading, setLoading]= useState(true)
  const [search,  setSearch] = useState('')
  const [status,  setStatus] = useState('')
  const [skip,    setSkip]   = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [templates, setTemplates] = useState([])
  const LIMIT = 20

  const load = async () => {
    setLoading(true)
    try {
      const params = { skip, limit: LIMIT, search: search || undefined, status: status || undefined }
      if (initTemplateId) params.template_id = initTemplateId
      const r = await documentCenterService.listGenerated(params)
      setDocs(r.data?.data?.documents || [])
      setTotal(r.data?.data?.total || 0)
    } catch {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [skip, search, status])

  useEffect(() => {
    documentCenterService.listTemplates({ limit: 200 }).then(r => setTemplates(r.data?.data?.templates || [])).catch(() => {})
    if (initTemplateId) setShowModal(true)
  }, [])

  const handleDelete = async (id) => {
    if (!confirm('Delete this document?')) return
    try {
      await documentCenterService.deleteGenerated(id)
      toast.success('Deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  const handleGenerate = async (req) => {
    try {
      await documentCenterService.generateDocument(req)
      toast.success('Document generated')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Generation failed')
      throw err
    }
  }

  const openPdf = (doc) => {
    if (doc.pdf_url) { window.open(doc.pdf_url, '_blank'); return }
    window.open(documentCenterService.downloadPDF(doc._id), '_blank')
  }
  const openDocx = (doc) => {
    window.open(documentCenterService.downloadDOCX(doc._id), '_blank')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Generated Documents</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{total} total documents</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
          <Plus className="w-4 h-4" /> Generate New
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setSkip(0) }}
            placeholder="Search documents…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setSkip(0) }}
          className="px-3 py-2 text-sm rounded-lg border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
          <option value="">All Status</option>
          <option value="generated">Generated</option>
          <option value="sent">Sent</option>
          <option value="signed">Signed</option>
          <option value="draft">Draft</option>
        </select>
        <button onClick={load} className="px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium" style={{ color: 'var(--text-heading)' }}>No documents yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Generate your first document from a template</p>
          <button onClick={() => setShowModal(true)} className="mt-4 px-5 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
            Generate Document
          </button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Document Name','Template','Employee','Status','Created','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => (
                <tr key={doc._id} className="border-t transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/10" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-heading)' }}>{doc.document_name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{doc.template_name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {doc.employee_name || <span className="italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[doc.status] || 'bg-gray-100 text-gray-600'}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openPdf(doc)} title="Download PDF"
                        className="p-1.5 rounded hover:bg-violet-100 transition-colors">
                        <Download className="w-3.5 h-3.5 text-violet-600" />
                      </button>
                      <button onClick={() => openDocx(doc)} title="Download DOCX"
                        className="p-1.5 rounded hover:bg-blue-100 transition-colors">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(doc._id)} title="Delete"
                        className="p-1.5 rounded hover:bg-red-100 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {skip + 1}–{Math.min(skip + LIMIT, total)} of {total}
              </span>
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
        </div>
      )}

      {showModal && (
        <GenerateModal
          templates={templates}
          onClose={() => setShowModal(false)}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  )
}
