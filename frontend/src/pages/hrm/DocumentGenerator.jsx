import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Download, Printer, Eye, RefreshCw,
  User, Building2, ChevronDown, ChevronRight, Clock, Search,
  CheckCircle, AlertCircle, Loader2, FileOutput, History,
  X, Calendar, DollarSign, Briefcase, Hash
} from 'lucide-react'
import hrmService from '../../services/hrmService'

// ── Field type renderers ───────────────────────────────────────────────────

const FIELD_ICONS = {
  text: Hash, date: Calendar, number: Hash, currency: DollarSign,
  select: ChevronDown, textarea: FileText, email: Hash, phone: Hash,
}

const fieldGroupColors = {
  'Personal': 'bg-blue-50 border-blue-200',
  'Employment': 'bg-purple-50 border-purple-200',
  'Compensation': 'bg-green-50 border-green-200',
  'Position': 'bg-orange-50 border-orange-200',
  'Exit': 'bg-red-50 border-red-200',
  'Performance': 'bg-yellow-50 border-yellow-200',
  'Other': 'bg-gray-50 border-gray-200',
}

function FieldInput({ field, value, onChange }) {
  const Icon = FIELD_ICONS[field.type] || Hash
  const baseClass = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  if (field.type === 'textarea') {
    return (
      <textarea
        className={`${baseClass} resize-none`}
        rows={3}
        placeholder={field.label}
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
      />
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <select
        className={baseClass}
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
      >
        <option value="">— Select —</option>
        {field.options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }

  return (
    <div className="relative">
      <input
        type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : 'text'}
        className={`${baseClass} pr-8`}
        placeholder={field.label}
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
      />
    </div>
  )
}

// ── Auto-fill banner ───────────────────────────────────────────────────────

function AutoFillBar({ employees, candidates, onFillEmployee, onFillCandidate, loading }) {
  const [empSearch, setEmpSearch] = useState('')
  const [candSearch, setCandSearch] = useState('')
  const [showEmpDrop, setShowEmpDrop] = useState(false)
  const [showCandDrop, setShowCandDrop] = useState(false)
  const empRef = useRef()
  const candRef = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (empRef.current && !empRef.current.contains(e.target)) setShowEmpDrop(false)
      if (candRef.current && !candRef.current.contains(e.target)) setShowCandDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredEmps = employees.filter(e =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(empSearch.toLowerCase()) ||
    (e.employee_id || '').toLowerCase().includes(empSearch.toLowerCase())
  )
  const filteredCands = candidates.filter(c =>
    (c.name || '').toLowerCase().includes(candSearch.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(candSearch.toLowerCase())
  )

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Auto-fill from:</span>

      {/* Employee picker */}
      <div className="relative" ref={empRef}>
        <button
          onClick={() => setShowEmpDrop(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm text-blue-700 transition-colors"
        >
          <User size={14} />
          Employee
          <ChevronDown size={12} />
        </button>
        {showEmpDrop && (
          <div className="absolute top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg">
                <Search size={12} className="text-gray-400" />
                <input
                  autoFocus
                  className="flex-1 text-sm bg-transparent outline-none"
                  placeholder="Search employees…"
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredEmps.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No employees found</p>
              ) : filteredEmps.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { onFillEmployee(emp.id); setShowEmpDrop(false); setEmpSearch('') }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm transition-colors"
                >
                  <p className="font-medium text-gray-800">{emp.first_name} {emp.last_name}</p>
                  <p className="text-xs text-gray-500">{emp.designation || emp.department || emp.employee_id}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Candidate picker */}
      <div className="relative" ref={candRef}>
        <button
          onClick={() => setShowCandDrop(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-sm text-purple-700 transition-colors"
        >
          <Briefcase size={14} />
          Candidate
          <ChevronDown size={12} />
        </button>
        {showCandDrop && (
          <div className="absolute top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg">
                <Search size={12} className="text-gray-400" />
                <input
                  autoFocus
                  className="flex-1 text-sm bg-transparent outline-none"
                  placeholder="Search candidates…"
                  value={candSearch}
                  onChange={e => setCandSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredCands.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No candidates found</p>
              ) : filteredCands.map(cand => (
                <button
                  key={cand.id}
                  onClick={() => { onFillCandidate(cand.id); setShowCandDrop(false); setCandSearch('') }}
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm transition-colors"
                >
                  <p className="font-medium text-gray-800">{cand.name}</p>
                  <p className="text-xs text-gray-500">{cand.email || cand.position}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && <Loader2 size={14} className="text-blue-500 animate-spin" />}
    </div>
  )
}

// ── Generation history row ────────────────────────────────────────────────

function HistoryRow({ gen, onExportPdf, onExportDocx }) {
  const dt = gen.generated_at
    ? new Date((gen.generated_at.endsWith('Z') ? gen.generated_at : gen.generated_at + 'Z'))
    : null
  const label = gen.document_name || gen.template_name || 'Document'

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 rounded-xl transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
          <FileText size={14} className="text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="text-xs text-gray-400">
            {dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            {gen.generated_by_name ? ` · ${gen.generated_by_name}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onExportPdf(gen.id)}
          title="Download PDF"
          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors"
        >
          <Download size={14} />
        </button>
        <button
          onClick={() => onExportDocx(gen.id)}
          title="Download DOCX"
          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 hover:text-blue-600 transition-colors"
        >
          <FileOutput size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function DocumentGenerator() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('template')

  // Template state
  const [template, setTemplate] = useState(null)
  const [formFields, setFormFields] = useState([])
  const [fieldValues, setFieldValues] = useState({})
  const [employees, setEmployees] = useState([])
  const [candidates, setCandidates] = useState([])

  // UI state
  const [tab, setTab] = useState('form') // form | preview | history
  const [loading, setLoading] = useState(true)
  const [autoFillLoading, setAutoFillLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(null) // 'pdf' | 'docx' | null
  const [error, setError] = useState(null)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [lastGenId, setLastGenId] = useState(null)
  const [generations, setGenerations] = useState([])
  const [histLoading, setHistLoading] = useState(false)

  // Template selector (if no ?template param)
  const [allTemplates, setAllTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState(templateId || '')

  // ── Load templates list when no template selected ──
  useEffect(() => {
    if (!selectedTemplateId) {
      hrmService.listDocumentTemplates({ page: 1, page_size: 100, is_active: true })
        .then(r => setAllTemplates(r.data?.items || []))
        .catch(() => {})
    }
  }, [selectedTemplateId])

  // ── Load template, then fetch form fields by doc_type ──
  useEffect(() => {
    if (!selectedTemplateId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    hrmService.getDocumentTemplate(selectedTemplateId)
      .then(async tRes => {
        const t = tRes.data
        setTemplate(t)
        if (t.doc_type) {
          const fRes = await hrmService.getDocumentTemplateFormFields(t.doc_type)
          const fields = fRes.data?.fields || []
          setFormFields(fields)
          const defaults = {}
          fields.forEach(f => { if (f.default) defaults[f.key] = f.default })
          setFieldValues(defaults)
        }
      })
      .catch(e => {
        setError(e.response?.data?.detail || 'Failed to load template')
      })
      .finally(() => setLoading(false))
  }, [selectedTemplateId])

  // ── Load employees + candidates once ──
  useEffect(() => {
    hrmService.listEmployees({ page: 1, page_size: 200, is_active: true })
      .then(r => setEmployees(r.data?.items || []))
      .catch(() => {})
    hrmService.listHiringCandidates({ page: 1, page_size: 200 })
      .then(r => setCandidates(r.data?.items || []))
      .catch(() => {})
  }, [])

  // ── Load generation history when tab switches ──
  useEffect(() => {
    if (tab !== 'history' || !selectedTemplateId) return
    setHistLoading(true)
    hrmService.listDocumentGenerations({ template_id: selectedTemplateId, page: 1, page_size: 20 })
      .then(r => setGenerations(r.data?.items || []))
      .catch(() => setGenerations([]))
      .finally(() => setHistLoading(false))
  }, [tab, selectedTemplateId])

  const handleFieldChange = useCallback((key, val) => {
    setFieldValues(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleAutoFillEmployee = async (empId) => {
    setAutoFillLoading(true)
    try {
      const res = await hrmService.autoFillFromEmployee(empId)
      const filled = res.data?.field_data || {}
      setFieldValues(prev => ({ ...prev, ...filled }))
    } catch { /* silent */ }
    finally { setAutoFillLoading(false) }
  }

  const handleAutoFillCandidate = async (candId) => {
    setAutoFillLoading(true)
    try {
      const res = await hrmService.autoFillFromCandidate(candId)
      const filled = res.data?.field_data || {}
      setFieldValues(prev => ({ ...prev, ...filled }))
    } catch { /* silent */ }
    finally { setAutoFillLoading(false) }
  }

  const handleGenerate = async (exportFormat = 'html') => {
    if (!selectedTemplateId) return
    setGenerating(true)
    setError(null)
    try {
      const res = await hrmService.generateFromDocumentTemplate(selectedTemplateId, {
        field_data: fieldValues,
        export_format: exportFormat,
      })
      const gen = res.data
      setLastGenId(gen.id || gen.generation_id)
      setPreviewHtml(gen.rendered_html || '')
      setTab('preview')
    } catch (e) {
      setError(e.response?.data?.detail || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const downloadBlob = (data, filename, mime) => {
    const url = URL.createObjectURL(new Blob([data], { type: mime }))
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPdf = async () => {
    if (!selectedTemplateId) return
    setExporting('pdf')
    try {
      const res = await hrmService.exportDocumentTemplatePDF(selectedTemplateId, {
        field_data: fieldValues,
        export_format: 'pdf',
      })
      const name = (template?.name || 'document').replace(/\s+/g, '_')
      downloadBlob(res.data, `${name}.pdf`, 'application/pdf')
    } catch (e) {
      setError(e.response?.data?.detail || 'PDF export failed')
    } finally {
      setExporting(null)
    }
  }

  const handleExportDocx = async () => {
    if (!selectedTemplateId) return
    setExporting('docx')
    try {
      const res = await hrmService.exportDocumentTemplateDOCX(selectedTemplateId, {
        field_data: fieldValues,
        export_format: 'docx',
      })
      const name = (template?.name || 'document').replace(/\s+/g, '_')
      downloadBlob(res.data, `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    } catch (e) {
      setError(e.response?.data?.detail || 'DOCX export failed')
    } finally {
      setExporting(null)
    }
  }

  const handlePrint = () => {
    if (!previewHtml) return
    const w = window.open('', '_blank')
    w.document.write(previewHtml)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  // ── Group fields by group property ──
  const groupedFields = formFields.reduce((acc, f) => {
    const g = f.group || 'Other'
    if (!acc[g]) acc[g] = []
    acc[g].push(f)
    return acc
  }, {})

  const requiredFields = formFields.filter(f => f.required)
  const filledRequired = requiredFields.filter(f => fieldValues[f.key] && String(fieldValues[f.key]).trim())
  const formValid = filledRequired.length === requiredFields.length

  // ── Template selector screen ──
  if (!selectedTemplateId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/hrm/doc-templates')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6 text-sm transition-colors">
            <ArrowLeft size={16} /> Back to Templates
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Generate Document</h1>
          <p className="text-gray-500 mb-8">Select a template to get started</p>
          {allTemplates.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText size={48} className="mx-auto mb-3 opacity-30" />
              <p>No active templates found</p>
              <button onClick={() => navigate('/hrm/doc-templates')} className="mt-4 text-blue-500 hover:underline text-sm">Manage Templates</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allTemplates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className="text-left p-5 bg-white border-2 border-gray-100 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center mb-3 transition-colors">
                    <FileText size={18} className="text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-800 text-sm mb-1">{t.name}</h3>
                  <p className="text-xs text-gray-400">{t.doc_type?.replace(/_/g, ' ')}</p>
                  {t.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{t.description}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-blue-500 animate-spin" />
          <p className="text-gray-500 text-sm">Loading template…</p>
        </div>
      </div>
    )
  }

  if (error && !template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">{error}</p>
          <button onClick={() => navigate('/hrm/doc-templates')} className="mt-4 text-blue-500 hover:underline text-sm">Back to Templates</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-wrap sticky top-0 z-20">
        <button onClick={() => navigate('/hrm/doc-templates')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">{template?.name || 'Document Generator'}</h1>
          <p className="text-xs text-gray-400">{template?.doc_type?.replace(/_/g, ' ')}</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { id: 'form', label: 'Fill Form', icon: FileText },
            { id: 'preview', label: 'Preview', icon: Eye },
            { id: 'history', label: 'History', icon: History },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          {tab === 'preview' && previewHtml && (
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
              <Printer size={14} /> Print
            </button>
          )}
          <button
            onClick={() => handleExportPdf()}
            disabled={!formValid || !!exporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-40"
          >
            {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PDF
          </button>
          <button
            onClick={() => handleExportDocx()}
            disabled={!formValid || !!exporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-40"
          >
            {exporting === 'docx' ? <Loader2 size={14} className="animate-spin" /> : <FileOutput size={14} />}
            DOCX
          </button>
          <button
            onClick={() => handleGenerate('html')}
            disabled={!formValid || generating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-40 font-medium"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            Preview
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── FORM TAB ── */}
        {tab === 'form' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

              {/* Auto-fill bar */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <AutoFillBar
                  employees={employees}
                  candidates={candidates}
                  onFillEmployee={handleAutoFillEmployee}
                  onFillCandidate={handleAutoFillCandidate}
                  loading={autoFillLoading}
                />
              </div>

              {/* Required fields status */}
              {requiredFields.length > 0 && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm ${
                  formValid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {formValid
                    ? <><CheckCircle size={14} /> All required fields filled</>
                    : <><AlertCircle size={14} /> {requiredFields.length - filledRequired.length} required field{requiredFields.length - filledRequired.length !== 1 ? 's' : ''} remaining</>
                  }
                </div>
              )}

              {/* Field groups */}
              {formFields.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No form fields defined for this template type.</p>
                  <p className="text-xs mt-1">You can generate the document directly.</p>
                </div>
              ) : (
                Object.entries(groupedFields).map(([group, fields]) => (
                  <FieldGroup key={group} group={group} fields={fields} values={fieldValues} onChange={handleFieldChange} />
                ))
              )}

              {/* Generate CTA */}
              <div className="flex gap-3 pt-2 pb-8">
                <button
                  onClick={() => handleGenerate('html')}
                  disabled={!formValid || generating}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:opacity-40 text-sm"
                >
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                  Generate Preview
                </button>
                <button
                  onClick={() => handleExportPdf()}
                  disabled={!formValid || !!exporting}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors disabled:opacity-40 text-sm"
                >
                  {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Export PDF
                </button>
                <button
                  onClick={() => handleExportDocx()}
                  disabled={!formValid || !!exporting}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors disabled:opacity-40 text-sm"
                >
                  {exporting === 'docx' ? <Loader2 size={16} className="animate-spin" /> : <FileOutput size={16} />}
                  Export DOCX
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PREVIEW TAB ── */}
        {tab === 'preview' && (
          <div className="flex-1 overflow-y-auto bg-gray-200">
            {!previewHtml ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
                <div className="w-16 h-16 rounded-2xl bg-white shadow flex items-center justify-center">
                  <Eye size={24} className="text-gray-300" />
                </div>
                <p className="text-gray-500 text-sm">Fill the form and click "Generate Preview"</p>
                <button
                  onClick={() => setTab('form')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
                >
                  <FileText size={14} /> Go to Form
                </button>
              </div>
            ) : (
              <div className="flex justify-center py-8 px-4">
                <div className="w-full max-w-4xl bg-white shadow-2xl rounded-sm">
                  <iframe
                    srcDoc={previewHtml}
                    title="Document Preview"
                    className="w-full"
                    style={{ minHeight: '1123px', border: 'none' }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800">Generation History</h2>
                <button
                  onClick={() => {
                    setHistLoading(true)
                    hrmService.listDocumentGenerations({ template_id: selectedTemplateId, page: 1, page_size: 20 })
                      .then(r => setGenerations(r.data?.items || []))
                      .catch(() => {})
                      .finally(() => setHistLoading(false))
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <RefreshCw size={14} className={histLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {histLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={24} className="text-blue-500 animate-spin" />
                </div>
              ) : generations.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Clock size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No documents generated yet for this template.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                  {generations.map(gen => (
                    <HistoryRow
                      key={gen.id}
                      gen={gen}
                      onExportPdf={handleExportPdf}
                      onExportDocx={handleExportDocx}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Field group component ──────────────────────────────────────────────────

function FieldGroup({ group, fields, values, onChange }) {
  const [open, setOpen] = useState(true)
  const colorClass = fieldGroupColors[group] || fieldGroupColors['Other']

  return (
    <div className={`rounded-2xl border ${colorClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:opacity-80 transition-opacity"
      >
        <span className="font-semibold text-sm text-gray-700">{group}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
          {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="bg-white px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {f.label}
                {f.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <FieldInput field={f} value={values[f.key]} onChange={onChange} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
