import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen, Upload, Trash2, Download, Search, Loader2,
  FileText, Image, File, Eye, Plus, X, Check, AlertCircle,
  Clock, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp,
  Users, RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

// ── Constants ──────────────────────────────────────────────────────────────────

const DOC_CATEGORIES = [
  { key: 'resume',            label: 'Resume',            single: true },
  { key: 'aadhaar',           label: 'Aadhaar',           single: true },
  { key: 'pan',               label: 'PAN',               single: true },
  { key: 'passport',          label: 'Passport',          single: true },
  { key: 'education',         label: 'Education',         single: false },
  { key: 'experience',        label: 'Experience',        single: false },
  { key: 'offer_letter',      label: 'Offer Letter',      single: true },
  { key: 'payslip',           label: 'Payslip',           single: false },
  { key: 'certificate',       label: 'Certificate',       single: false },
  { key: 'contract',          label: 'Contract',          single: true },
  { key: 'appointment_letter',label: 'Appointment Letter',single: true },
  { key: 'relieving_letter',  label: 'Relieving Letter',  single: true },
  { key: 'other',             label: 'Other',             single: false },
]

const STATUS_CONFIG = {
  pending:          { label: 'Pending',          color: '#f59e0b', bg: '#fef3c7', icon: Clock },
  approved:         { label: 'Approved',         color: '#10b981', bg: '#d1fae5', icon: CheckCircle },
  rejected:         { label: 'Rejected',         color: '#ef4444', bg: '#fee2e2', icon: XCircle },
  reupload_required:{ label: 'Reupload Req.',    color: '#8b5cf6', bg: '#ede9fe', icon: RotateCcw },
}

const DOC_TYPE_COLORS = {
  resume: '#6366f1', aadhaar: '#FF4757', pan: '#FA8231', passport: '#38F9D7',
  education: '#43E97B', experience: '#FF6B9D', offer_letter: '#7c3aed',
  payslip: '#10b981', certificate: '#43E97B', contract: '#22c55e',
  appointment_letter: '#4FACFE', relieving_letter: '#C850C0', other: '#94a3b8',
}

function fileExt(url = '') { return (url.split('.').pop() || '').toLowerCase() }
function fileIcon(url = '') {
  const ext = fileExt(url)
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return Image
  if (ext === 'pdf') return FileText
  return File
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, size = 'sm' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  const textSize = size === 'xs' ? 'text-[9px]' : 'text-[10px]'
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${textSize}`}
          style={{ background: cfg.bg, color: cfg.color }}>
      <Icon className={iconSize} />
      {cfg.label}
    </span>
  )
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ doc, employeeId, onClose }) {
  const ext = fileExt(doc.file_url)
  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext)
  const isPDF   = ext === 'pdf'
  const serveUrl = hrmService.getDocumentServeUrl(employeeId, doc.doc_id)
  const downloadUrl = hrmService.getDocumentServeUrl(employeeId, doc.doc_id, true)

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"
           onClick={onClose}>
        <div className="relative w-full max-w-4xl flex flex-col rounded-2xl overflow-hidden"
             style={{ background:'var(--bg-card)', border:'1px solid var(--border-card)', maxHeight:'92vh' }}
             onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
               style={{ borderBottom:'1px solid var(--border)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color:'var(--text-heading)' }}>
                {doc.doc_name}
              </span>
              <StatusBadge status={doc.status} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a href={downloadUrl}
                 className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
                 target="_blank" rel="noreferrer">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
              <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
                      style={{ color:'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4"
               style={{ minHeight:'400px', background:'var(--bg-page)' }}>
            {isImage ? (
              <img src={serveUrl} alt={doc.doc_name}
                   className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg" />
            ) : isPDF ? (
              <iframe src={serveUrl} title={doc.doc_name}
                      className="w-full rounded-xl" style={{ height:'75vh', border:'none' }} />
            ) : (
              <div className="text-center py-16">
                <File className="w-16 h-16 mx-auto mb-4" style={{ color:'var(--text-disabled)' }} />
                <p className="text-sm" style={{ color:'var(--text-muted)' }}>
                  Preview not available for this file type.
                </p>
                <a href={downloadUrl} target="_blank" rel="noreferrer"
                   className="btn-primary mt-4 inline-flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download File
                </a>
              </div>
            )}
          </div>
          {doc.status === 'rejected' && doc.rejection_reason && (
            <div className="px-5 py-3 flex-shrink-0" style={{ background:'#fee2e2', borderTop:'1px solid #fca5a5' }}>
              <p className="text-xs font-semibold text-red-700">Rejection Reason: {doc.rejection_reason}</p>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Status Update Modal ───────────────────────────────────────────────────────

function StatusModal({ doc, employeeId, onClose, onUpdated }) {
  const [status, setStatus] = useState(doc.status)
  const [reason, setReason] = useState(doc.rejection_reason || '')
  const [comments, setComments] = useState(doc.comments || '')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if ((status === 'rejected' || status === 'reupload_required') && !reason.trim()) {
      toast.error('Please provide a reason')
      return
    }
    setLoading(true)
    try {
      await hrmService.updateDocumentStatus(employeeId, doc.doc_id, {
        status, rejection_reason: reason || null, comments: comments || null,
      })
      toast.success('Status updated')
      onUpdated()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update status')
    }
    setLoading(false)
  }

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b">
            <h3 className="font-semibold text-gray-900">Update Document Status</h3>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Document: <span className="text-indigo-700">{doc.doc_name}</span></p>
            </div>
            <div>
              <label className="input-label">Status</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon
                  return (
                    <button key={key} onClick={() => setStatus(key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all
                        ${status === key ? 'ring-2 ring-offset-1' : 'border-gray-200 hover:border-gray-300'}`}
                      style={status === key ? { borderColor: cfg.color, background: cfg.bg, color: cfg.color, '--tw-ring-color': cfg.color } : {}}>
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {(status === 'rejected' || status === 'reupload_required') && (
              <div>
                <label className="input-label">Reason <span className="text-red-500">*</span></label>
                <input className="input text-sm" placeholder="Explain why the document is rejected…"
                  value={reason} onChange={e => setReason(e.target.value)} />
              </div>
            )}
            <div>
              <label className="input-label">Comments (optional)</label>
              <textarea className="input text-sm resize-none" rows={2}
                placeholder="Additional notes for the employee…"
                value={comments} onChange={e => setComments(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 p-5 pt-0">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Status
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Multi Upload Modal ────────────────────────────────────────────────────────

function MultiUploadModal({ employee, onClose, onUploaded }) {
  // fileMap: { docTypeKey: File[] }
  const [fileMap, setFileMap] = useState({})
  const [loading, setLoading] = useState(false)
  const fileRefs = useRef({})

  const handleFilePick = (cat, files) => {
    setFileMap(prev => ({
      ...prev,
      [cat.key]: cat.single ? [files[0]] : [...(prev[cat.key] || []), ...Array.from(files)],
    }))
  }

  const removeFile = (catKey, idx) => {
    setFileMap(prev => {
      const arr = [...(prev[catKey] || [])]
      arr.splice(idx, 1)
      return { ...prev, [catKey]: arr }
    })
  }

  const totalFiles = Object.values(fileMap).reduce((s, arr) => s + (arr?.length || 0), 0)

  const handleUpload = async () => {
    if (totalFiles === 0) { toast.error('Please attach at least one file'); return }
    setLoading(true)
    const fd = new FormData()
    const types = [], names = []
    for (const cat of DOC_CATEGORIES) {
      for (const file of (fileMap[cat.key] || [])) {
        fd.append('files', file)
        types.push(cat.key)
        names.push(file.name.replace(/\.[^.]+$/, ''))
      }
    }
    fd.append('doc_types', types.join(','))
    fd.append('doc_names', names.join(','))
    try {
      const res = await hrmService.multiUploadDocuments(employee.id, fd)
      toast.success(`${res.data.documents?.length || totalFiles} document(s) uploaded`)
      onUploaded()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Upload failed')
    }
    setLoading(false)
  }

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b flex-shrink-0 sticky top-0 bg-white rounded-t-2xl">
            <div>
              <h3 className="font-semibold text-gray-900">Upload Documents</h3>
              <p className="text-xs text-gray-500 mt-0.5">Employee: <span className="font-medium text-indigo-700">{employee.full_name}</span></p>
            </div>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {DOC_CATEGORIES.map(cat => {
              const files = fileMap[cat.key] || []
              return (
                <div key={cat.key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                    <span className="text-sm font-medium text-gray-800">{cat.label}</span>
                    <div className="flex items-center gap-2">
                      {files.length > 0 && (
                        <span className="text-xs text-indigo-600 font-medium">{files.length} file{files.length > 1 ? 's' : ''}</span>
                      )}
                      <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 transition-colors font-medium">
                        <Plus className="w-3.5 h-3.5" />
                        {cat.single ? 'Choose file' : 'Add files'}
                        <input
                          type="file"
                          className="hidden"
                          multiple={!cat.single}
                          accept=".pdf,.jpg,.jpeg,.png,.docx"
                          ref={el => fileRefs.current[cat.key] = el}
                          onChange={e => handleFilePick(cat, e.target.files)}
                        />
                      </label>
                    </div>
                  </div>
                  {files.length > 0 && (
                    <div className="px-4 py-2 space-y-1.5">
                      {files.map((f, i) => {
                        const Icon = fileIcon(f.name)
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                            <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="flex-1 truncate">{f.name}</span>
                            <span className="text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                            <button onClick={() => removeFile(cat.key, i)}
                              className="text-red-400 hover:text-red-600 flex-shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="p-5 pt-0 flex-shrink-0 border-t border-gray-100 mt-2">
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleUpload} disabled={loading || totalFiles === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload {totalFiles > 0 ? `${totalFiles} file${totalFiles > 1 ? 's' : ''}` : 'All'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Employee Documents Panel (expanded view) ──────────────────────────────────

function EmployeeDocPanel({ employee, onClose, onRefresh }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [statusDoc, setStatusDoc] = useState(null)
  const [showUpload, setShowUpload] = useState(false)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getDocuments(employee.id)
      setDocs(res.data.documents || [])
    } catch {}
    setLoading(false)
  }, [employee.id])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.doc_name}"?`)) return
    try {
      await hrmService.deleteDocument(employee.id, doc.doc_id)
      toast.success('Document deleted')
      loadDocs()
      onRefresh()
    } catch { toast.error('Delete failed') }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9990] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-semibold text-gray-900">{employee.full_name}</h3>
            <p className="text-xs text-gray-500">{employee.designation_name} · {employee.total_docs || docs.length} document(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowUpload(true)}
              className="btn-primary text-sm flex items-center gap-1.5 py-2">
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
          ) : docs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No documents uploaded yet.</p>
              <button onClick={() => setShowUpload(true)}
                className="mt-3 btn-primary text-sm flex items-center gap-1.5 mx-auto">
                <Upload className="w-3.5 h-3.5" /> Upload Documents
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => {
                const Icon = fileIcon(doc.file_url)
                const typeColor = DOC_TYPE_COLORS[doc.doc_type] || '#94a3b8'
                const cat = DOC_CATEGORIES.find(c => c.key === doc.doc_type)
                return (
                  <div key={doc.doc_id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-200 transition-colors group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                         style={{ background: `${typeColor}15` }}>
                      <Icon className="w-4.5 h-4.5" style={{ color: typeColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 truncate">{doc.doc_name}</span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: `${typeColor}20`, color: typeColor }}>
                          {cat?.label || doc.doc_type}
                        </span>
                        <StatusBadge status={doc.status} size="xs" />
                        {doc.version > 1 && (
                          <span className="text-[9px] text-gray-400 font-mono">v{doc.version}</span>
                        )}
                      </div>
                      {doc.status === 'rejected' && doc.rejection_reason && (
                        <p className="text-xs text-red-500 mt-0.5 truncate">Reason: {doc.rejection_reason}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setPreviewDoc(doc)}
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors" title="Preview">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setStatusDoc(doc)}
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 transition-colors" title="Update Status">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(doc)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {previewDoc && (
        <PreviewModal doc={previewDoc} employeeId={employee.id} onClose={() => setPreviewDoc(null)} />
      )}
      {statusDoc && (
        <StatusModal doc={statusDoc} employeeId={employee.id} onClose={() => setStatusDoc(null)}
          onUpdated={() => { loadDocs(); onRefresh() }} />
      )}
      {showUpload && (
        <MultiUploadModal employee={employee} onClose={() => setShowUpload(false)}
          onUploaded={() => { loadDocs(); onRefresh() }} />
      )}
    </div>
  )
}

// ── Employee Row ──────────────────────────────────────────────────────────────

function EmployeeRow({ emp, onOpen }) {
  return (
    <div
      onClick={() => onOpen(emp)}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-gray-200 hover:border-indigo-300 cursor-pointer transition-all group hover:shadow-sm"
      style={{ background: 'var(--bg-card)' }}
    >
      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
        {emp.full_name?.charAt(0) || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{emp.full_name}</p>
        <p className="text-xs text-gray-400 truncate">{emp.designation_name} {emp.employee_id ? `· ${emp.employee_id}` : ''}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Doc count chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-700">{emp.total_docs} Doc{emp.total_docs !== 1 ? 's' : ''}</span>
          {emp.pending_docs > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{emp.pending_docs} pending</span>
          )}
          {emp.rejected_docs > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{emp.rejected_docs} rejected</span>
          )}
          {emp.approved_docs > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{emp.approved_docs} approved</span>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentVault() {
  const [employees, setEmployees] = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [selectedEmp, setSelectedEmp] = useState(null)
  const PAGE_SIZE = 30

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getEmployeeDocumentCounts({
        search: search || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setEmployees(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (e) {
      toast.error('Failed to load employees')
    }
    setLoading(false)
  }, [search, page])

  useEffect(() => { setPage(1) }, [search])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color:'var(--text-heading)' }}>
            <FolderOpen className="w-6 h-6 text-indigo-600" />
            Documents
          </h1>
          <p className="text-sm mt-0.5" style={{ color:'var(--text-muted)' }}>
            {total} employee{total !== 1 ? 's' : ''} — click to view and manage documents
          </p>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <span key={key} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
                  style={{ background: cfg.bg, color: cfg.color }}>
              <Icon className="w-3.5 h-3.5" />
              {cfg.label}
            </span>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search employee name or ID…"
          className="input pl-9 text-sm"
        />
      </div>

      {/* Employee list */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16" style={{ color:'var(--text-muted)' }}>
          <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          No employees found.
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map(emp => (
            <EmployeeRow key={emp.id} emp={emp} onOpen={setSelectedEmp} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm" style={{ color:'var(--text-muted)' }}>
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
            <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {/* Employee document panel */}
      {selectedEmp && (
        <EmployeeDocPanel
          employee={selectedEmp}
          onClose={() => setSelectedEmp(null)}
          onRefresh={load}
        />
      )}
    </div>
  )
}
