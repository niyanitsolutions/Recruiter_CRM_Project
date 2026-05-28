import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Download, Printer, Eye, RefreshCw,
  User, Building2, ChevronDown, ChevronRight, Clock, Search,
  CheckCircle, AlertCircle, Loader2, FileOutput, History,
  X, Calendar, DollarSign, Briefcase, Hash, Plus, Zap
} from 'lucide-react'
import hrmService from '../../services/hrmService'

// ── Doc type config (shared with template list) ────────────────────────────
const DOC_TYPE_EMOJI = {
  offer_letter: '📄', appointment_letter: '📋', experience_letter: '🏆',
  relieving_letter: '👋', joining_letter: '🎉', promotion_letter: '⬆️',
  increment_letter: '💰', warning_letter: '⚠️', nda_agreement: '🔒',
  hr_policy: '📚', payslip: '💵', salary_revision: '💹',
  internship_letter: '🎓', internship_completion: '🏅', employee_id_letter: '🪪',
  bonafide_letter: '📜', wfh_approval: '🏠', leave_approval: '✅',
  termination_letter: '🚫', custom: '⚙️',
}

const CATEGORY_COLORS = {
  hr: '#3B82F6', recruitment: '#8B5CF6', payroll: '#10B981',
  legal: '#F59E0B', employee: '#EC4899', custom: '#6B7280',
}

// ── Field type renderers ───────────────────────────────────────────────────

const FIELD_ICONS = {
  text: Hash, date: Calendar, number: Hash, currency: DollarSign,
  select: ChevronDown, textarea: FileText, email: Hash, phone: Hash,
}


function FieldInput({ field, value, onChange }) {
  const baseStyle = {
    width: '100%', fontSize: '0.875rem', padding: '8px 12px',
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text-body)', outline: 'none',
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        rows={3}
        placeholder={field.label}
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
        style={{ ...baseStyle, resize: 'vertical' }}
      />
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <select value={value || ''} onChange={e => onChange(field.key, e.target.value)} style={baseStyle}>
        <option value="">— Select —</option>
        {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }

  return (
    <input
      type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : 'text'}
      placeholder={field.label}
      value={value || ''}
      onChange={e => onChange(field.key, e.target.value)}
      style={baseStyle}
    />
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
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Auto-fill from:
      </span>

      {/* Employee picker */}
      <div className="relative" ref={empRef}>
        <button onClick={() => setShowEmpDrop(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors"
          style={{ background: 'var(--bg-info)', borderColor: 'var(--text-info)', color: 'var(--text-info)' }}>
          <User size={14} /> Employee <ChevronDown size={12} />
        </button>
        {showEmpDrop && (
          <div className="absolute top-full mt-1 left-0 w-64 rounded-xl border shadow-xl z-50 overflow-hidden"
               style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                <input autoFocus className="flex-1 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--text-primary)' }} placeholder="Search employees…"
                  value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredEmps.length === 0
                ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>No employees found</p>
                : filteredEmps.map(emp => (
                    <button key={emp.id}
                      onClick={() => { onFillEmployee(emp.id); setShowEmpDrop(false); setEmpSearch('') }}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] text-sm transition-colors">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.designation || emp.department || emp.employee_id}</p>
                    </button>
                  ))
              }
            </div>
          </div>
        )}
      </div>

      {/* Candidate picker */}
      <div className="relative" ref={candRef}>
        <button onClick={() => setShowCandDrop(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors"
          style={{ background: '#8B5CF615', borderColor: '#8B5CF640', color: '#8B5CF6' }}>
          <Briefcase size={14} /> Candidate <ChevronDown size={12} />
        </button>
        {showCandDrop && (
          <div className="absolute top-full mt-1 left-0 w-64 rounded-xl border shadow-xl z-50 overflow-hidden"
               style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                <input autoFocus className="flex-1 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--text-primary)' }} placeholder="Search candidates…"
                  value={candSearch} onChange={e => setCandSearch(e.target.value)} />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredCands.length === 0
                ? <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>No candidates found</p>
                : filteredCands.map(cand => (
                    <button key={cand.id}
                      onClick={() => { onFillCandidate(cand.id); setShowCandDrop(false); setCandSearch('') }}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] text-sm transition-colors">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{cand.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cand.email || cand.position}</p>
                    </button>
                  ))
              }
            </div>
          </div>
        )}
      </div>

      {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />}
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
    <div className="flex items-center justify-between py-3 px-4 rounded-xl transition-colors hover:bg-[var(--bg-hover)]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: 'var(--bg-info)' }}>
          <FileText size={14} style={{ color: 'var(--text-info)' }} />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            {gen.generated_by_name ? ` · ${gen.generated_by_name}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onExportPdf(gen.id)} title="Download PDF"
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-danger)]"
          style={{ color: 'var(--text-danger)' }}>
          <Download size={14} />
        </button>
        <button onClick={() => onExportDocx(gen.id)} title="Download DOCX"
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-info)]"
          style={{ color: 'var(--text-info)' }}>
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
      <div className="min-h-screen p-6" style={{ background: 'var(--bg-main)' }}>
        <div className="max-w-5xl mx-auto">
          <button onClick={() => navigate('/hrm/doc-templates')}
            className="flex items-center gap-2 text-sm mb-6 transition-colors"
            style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft size={16} /> Back to Templates
          </button>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Generate Document</h1>
          <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>Select a template to fill and generate</p>

          {allTemplates.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border"
                 style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                   style={{ background: 'var(--bg-secondary)' }}>
                <FileText size={32} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                No templates available
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Create a template first before generating documents
              </p>
              <button onClick={() => navigate('/hrm/doc-templates')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'var(--accent-blue)' }}>
                <Plus size={16} /> Create First Template
              </button>
            </div>
          ) : (
            <>
              {/* Quick search */}
              <div className="relative mb-6">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-secondary)' }} />
                <input placeholder="Search templates…"
                  className="w-full max-w-sm pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  onChange={e => {
                    const q = e.target.value.toLowerCase()
                    // Inline local filter — just for visual quick-find
                    document.querySelectorAll('[data-template-card]').forEach(el => {
                      el.style.display = el.dataset.name?.toLowerCase().includes(q) ? '' : 'none'
                    })
                  }}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {allTemplates.map(t => {
                  const emoji    = DOC_TYPE_EMOJI[t.doc_type] || '📄'
                  const catColor = CATEGORY_COLORS[t.category] || '#6B7280'
                  return (
                    <button
                      key={t.id}
                      data-template-card
                      data-name={t.name}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className="text-left p-5 rounded-2xl border-2 transition-all hover:shadow-lg hover:-translate-y-0.5 group"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
                             style={{ background: `${catColor}18` }}>
                          {emoji}
                        </div>
                        <div className="min-w-0">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: `${catColor}18`, color: catColor }}>
                            {t.category}
                          </span>
                        </div>
                      </div>
                      <h3 className="font-semibold text-sm mb-1 truncate" style={{ color: 'var(--text-primary)' }}>
                        {t.name}
                      </h3>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t.doc_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </p>
                      {t.description && (
                        <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-3 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                           style={{ color: 'var(--accent-blue)' }}>
                        <Zap size={11} /> Generate <ChevronRight size={11} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading template…</p>
        </div>
      </div>
    )
  }

  if (error && !template) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
        <div className="text-center">
          <AlertCircle size={40} className="mx-auto mb-3" style={{ color: 'var(--text-danger)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{error}</p>
          <button onClick={() => navigate('/hrm/doc-templates')}
            className="mt-4 text-sm hover:underline"
            style={{ color: 'var(--accent-blue)' }}>
            Back to Templates
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-main)' }}>

      {/* ── Top bar ── */}
      <div className="border-b px-6 py-3 flex items-center gap-4 flex-wrap sticky top-0 z-20"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <button onClick={() => navigate('/hrm/doc-templates')}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {template?.name || 'Document Generator'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {template?.doc_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--bg-secondary)' }}>
          {[
            { id: 'form',    label: 'Fill Form', icon: FileText },
            { id: 'preview', label: 'Preview',   icon: Eye },
            { id: 'history', label: 'History',   icon: History },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: tab === t.id ? 'var(--bg-card)' : 'transparent',
                color:      tab === t.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                boxShadow:  tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>
              <t.icon size={13} />{t.label}
            </button>
          ))}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          {tab === 'preview' && previewHtml && (
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
              <Printer size={14} /> Print
            </button>
          )}
          <button onClick={handleExportPdf} disabled={!formValid || !!exporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-white transition-colors disabled:opacity-40"
            style={{ background: '#EF4444' }}>
            {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PDF
          </button>
          <button onClick={handleExportDocx} disabled={!formValid || !!exporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-white transition-colors disabled:opacity-40"
            style={{ background: 'var(--accent-blue)' }}>
            {exporting === 'docx' ? <Loader2 size={14} className="animate-spin" /> : <FileOutput size={14} />}
            DOCX
          </button>
          <button onClick={() => handleGenerate('html')} disabled={!formValid || generating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-white font-medium transition-colors disabled:opacity-40"
            style={{ background: '#10B981' }}>
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            Preview
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="px-6 py-2 flex items-center gap-2 text-sm border-b"
             style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)', borderColor: 'var(--border-subtle)' }}>
          <AlertCircle size={14} />{error}
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
              <div className="rounded-2xl border p-4"
                   style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <AutoFillBar employees={employees} candidates={candidates}
                  onFillEmployee={handleAutoFillEmployee} onFillCandidate={handleAutoFillCandidate}
                  loading={autoFillLoading} />
              </div>

              {/* Required fields status */}
              {requiredFields.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
                     style={{
                       background: formValid ? 'var(--bg-success)' : 'var(--bg-warning)',
                       color:      formValid ? 'var(--text-success)' : 'var(--text-warning)',
                     }}>
                  {formValid
                    ? <><CheckCircle size={14} /> All required fields filled</>
                    : <><AlertCircle size={14} /> {requiredFields.length - filledRequired.length} required field{requiredFields.length - filledRequired.length !== 1 ? 's' : ''} remaining</>
                  }
                </div>
              )}

              {/* Field groups */}
              {formFields.length === 0 ? (
                <div className="text-center py-12">
                  <FileText size={40} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-secondary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No form fields defined for this template type.</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>You can generate the document directly.</p>
                </div>
              ) : (
                Object.entries(groupedFields).map(([group, fields]) => (
                  <FieldGroup key={group} group={group} fields={fields} values={fieldValues} onChange={handleFieldChange} />
                ))
              )}

              {/* Generate CTA */}
              <div className="flex flex-wrap gap-3 pt-2 pb-8">
                <button onClick={() => handleGenerate('html')} disabled={!formValid || generating}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-colors disabled:opacity-40 text-sm"
                  style={{ background: '#10B981' }}>
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                  Generate Preview
                </button>
                <button onClick={handleExportPdf} disabled={!formValid || !!exporting}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-colors disabled:opacity-40 text-sm"
                  style={{ background: '#EF4444' }}>
                  {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Export PDF
                </button>
                <button onClick={handleExportDocx} disabled={!formValid || !!exporting}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-colors disabled:opacity-40 text-sm"
                  style={{ background: 'var(--accent-blue)' }}>
                  {exporting === 'docx' ? <Loader2 size={16} className="animate-spin" /> : <FileOutput size={16} />}
                  Export DOCX
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PREVIEW TAB ── */}
        {tab === 'preview' && (
          <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-secondary)' }}>
            {!previewHtml ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
                <div className="w-16 h-16 rounded-2xl shadow flex items-center justify-center"
                     style={{ background: 'var(--bg-card)' }}>
                  <Eye size={24} style={{ color: 'var(--text-disabled)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Fill the form and click "Generate Preview"
                </p>
                <button onClick={() => setTab('form')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm transition-colors"
                  style={{ background: 'var(--accent-blue)' }}>
                  <FileText size={14} /> Go to Form
                </button>
              </div>
            ) : (
              <div className="flex justify-center py-8 px-4">
                <div className="w-full max-w-4xl shadow-2xl rounded-sm" style={{ background: '#fff' }}>
                  <iframe srcDoc={previewHtml} title="Document Preview" className="w-full"
                    style={{ minHeight: '1123px', border: 'none' }} sandbox="allow-same-origin" />
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
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Generation History
                </h2>
                <button
                  onClick={() => {
                    setHistLoading(true)
                    hrmService.listDocumentGenerations({ template_id: selectedTemplateId, page: 1, page_size: 20 })
                      .then(r => setGenerations(r.data?.items || []))
                      .catch(() => {})
                      .finally(() => setHistLoading(false))
                  }}
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}>
                  <RefreshCw size={14} className={histLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {histLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                </div>
              ) : generations.length === 0 ? (
                <div className="text-center py-16">
                  <Clock size={40} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-secondary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    No documents generated yet for this template.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border divide-y overflow-hidden"
                     style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', divideColor: 'var(--border-subtle)' }}>
                  {generations.map(gen => (
                    <HistoryRow key={gen.id} gen={gen} onExportPdf={handleExportPdf} onExportDocx={handleExportDocx} />
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

  return (
    <div className="rounded-2xl border overflow-hidden"
         style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:opacity-80 transition-opacity">
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{group}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {fields.length} field{fields.length !== 1 ? 's' : ''}
          </span>
          {open
            ? <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />}
        </div>
      </button>

      {open && (
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t"
             style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
          {fields.map(f => (
            <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
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
