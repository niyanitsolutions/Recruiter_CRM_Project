import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen, Upload, Trash2, Download, Search, Loader2,
  FileText, Image, File, Eye, Plus, X, Check, AlertCircle,
  Clock, CheckCircle, XCircle, RotateCcw, Users, Link, Copy,
  RefreshCw, Shield, Calendar,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

// ── Constants ──────────────────────────────────────────────────────────────────

const DOC_CATEGORIES = [
  { key: 'resume',             label: 'Resume',             single: true },
  { key: 'aadhaar',            label: 'Aadhaar',            single: true },
  { key: 'pan',                label: 'PAN',                single: true },
  { key: 'passport',           label: 'Passport',           single: true },
  { key: 'education',          label: 'Education',          single: false },
  { key: 'experience',         label: 'Experience',         single: false },
  { key: 'offer_letter',       label: 'Offer Letter',       single: true },
  { key: 'payslip',            label: 'Payslip',            single: false },
  { key: 'certificate',        label: 'Certificate',        single: false },
  { key: 'contract',           label: 'Contract',           single: true },
  { key: 'appointment_letter', label: 'Appointment Letter', single: true },
  { key: 'relieving_letter',   label: 'Relieving Letter',   single: true },
  { key: 'other',              label: 'Other',              single: false },
]

const STATUS_CONFIG = {
  pending:           { label: 'Pending',       color: '#f59e0b', bg: '#fef3c7', icon: Clock },
  approved:          { label: 'Approved',       color: '#10b981', bg: '#d1fae5', icon: CheckCircle },
  rejected:          { label: 'Rejected',       color: '#ef4444', bg: '#fee2e2', icon: XCircle },
  reupload_required: { label: 'Reupload Req.', color: '#8b5cf6', bg: '#ede9fe', icon: RotateCcw },
}

const TOKEN_STATUS_CFG = {
  active:  { label: 'Active',   color: '#10b981', bg: '#d1fae5' },
  used:    { label: 'Used',     color: '#6366f1', bg: '#eef2ff' },
  expired: { label: 'Expired',  color: '#f59e0b', bg: '#fef3c7' },
  revoked: { label: 'Disabled', color: '#94a3b8', bg: '#f1f5f9' },
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

function fmtDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
}

// ── Status Badge ──────────────────────────────────────────────────────────────

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

function PreviewModal({ doc, onClose }) {
  const ext = fileExt(doc.file_url)
  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext)
  const isPDF   = ext === 'pdf'

  // Use static upload URL for preview (no auth needed, served by FastAPI StaticFiles)
  const previewUrl = doc.file_url
  // Use serve endpoint with token for download (gets correct filename)
  const downloadUrl = doc.doc_id && doc.employee_id
    ? hrmService.getDocumentServeUrl(doc.employee_id, doc.doc_id, true)
    : doc.file_url

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"
           onClick={onClose}>
        <div className="relative w-full max-w-4xl flex flex-col rounded-2xl overflow-hidden"
             style={{ background:'var(--bg-card)', border:'1px solid var(--border-card)', maxHeight:'92vh' }}
             onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
               style={{ borderBottom:'1px solid var(--border)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color:'var(--text-heading)' }}>
                {doc.doc_name}
              </span>
              <StatusBadge status={doc.status} />
              {doc.version > 1 && (
                <span className="text-[9px] text-gray-400 font-mono flex-shrink-0">v{doc.version}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a href={downloadUrl} target="_blank" rel="noreferrer"
                 className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
              <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
                      style={{ color:'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4"
               style={{ minHeight:'400px', background:'var(--bg-page)' }}>
            {!doc.file_url ? (
              <div className="text-center py-16">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-300" />
                <p className="text-sm text-gray-500">No file attached to this document.</p>
              </div>
            ) : isImage ? (
              <img src={previewUrl} alt={doc.doc_name}
                   className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg"
                   onError={e => { e.target.style.display='none'; e.target.nextSibling?.style && (e.target.nextSibling.style.display='block') }} />
            ) : isPDF ? (
              <iframe src={previewUrl} title={doc.doc_name}
                      className="w-full rounded-xl" style={{ height:'75vh', border:'none' }} />
            ) : (
              <div className="text-center py-16">
                <File className="w-16 h-16 mx-auto mb-4" style={{ color:'var(--text-disabled)' }} />
                <p className="text-sm mb-4" style={{ color:'var(--text-muted)' }}>
                  Preview not available for this file type.
                </p>
                <a href={downloadUrl} target="_blank" rel="noreferrer"
                   className="btn-primary inline-flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download File
                </a>
              </div>
            )}
          </div>

          {doc.status === 'rejected' && doc.rejection_reason && (
            <div className="px-5 py-3 flex-shrink-0"
                 style={{ background:'#fee2e2', borderTop:'1px solid #fca5a5' }}>
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
  const [reason, setReason]   = useState(doc.rejection_reason || '')
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
        status,
        rejection_reason: reason.trim() || null,
        comments: comments.trim() || null,
      })
      toast.success(`Status updated to ${STATUS_CONFIG[status]?.label || status}`)
      onClose()          // close first to prevent double-clicks
      await onUpdated()  // then refresh data
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update status')
      setLoading(false)
    }
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
            <p className="text-sm text-gray-600">
              Document: <strong className="text-gray-900">{doc.doc_name}</strong>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button key={key} onClick={() => setStatus(key)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all"
                    style={status === key
                      ? { borderColor: cfg.color, background: cfg.bg, color: cfg.color }
                      : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            {(status === 'rejected' || status === 'reupload_required') && (
              <div>
                <label className="input-label">Reason <span className="text-red-500">*</span></label>
                <input className="input text-sm" autoFocus
                  placeholder="Explain why the document needs attention…"
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
          <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
            <div>
              <h3 className="font-semibold text-gray-900">Upload Documents</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Employee: <span className="font-medium text-indigo-700">{employee.full_name}</span>
              </p>
            </div>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-2">
            {DOC_CATEGORIES.map(cat => {
              const files = fileMap[cat.key] || []
              return (
                <div key={cat.key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                    <span className="text-sm font-medium text-gray-800">{cat.label}</span>
                    <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 font-medium">
                      <Plus className="w-3.5 h-3.5" />
                      {cat.single ? 'Choose file' : `Add file${files.length ? 's' : ''}`}
                      <input type="file" className="hidden" multiple={!cat.single}
                        accept=".pdf,.jpg,.jpeg,.png,.docx"
                        onChange={e => handleFilePick(cat, e.target.files)} />
                    </label>
                  </div>
                  {files.length > 0 && (
                    <div className="px-4 py-2 space-y-1.5">
                      {files.map((f, i) => {
                        const Icon = fileIcon(f.name)
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                            <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="flex-1 truncate">{f.name}</span>
                            <span className="text-gray-400 flex-shrink-0">{(f.size/1024).toFixed(0)} KB</span>
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
          <div className="p-5 border-t border-gray-100 flex-shrink-0 flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleUpload} disabled={loading || totalFiles === 0}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload {totalFiles > 0 ? `${totalFiles} file${totalFiles > 1 ? 's' : ''}` : 'Documents'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Upload Link Section (Generate / Copy / Deactivate) ────────────────────────

function UploadLinkSection({ employee, onLinkGenerated }) {
  const [tokens, setTokens]   = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [reactivating, setReactivating] = useState(false)

  const activeToken = tokens.find(t => t.status === 'active')
  const latestToken = tokens[0]  // most recent (sorted by created_at desc)

  const loadTokens = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.listDocUploadTokens({ employee_id: employee.id })
      setTokens(res.data.items || [])
    } catch {}
    setLoading(false)
  }, [employee.id])

  useEffect(() => { loadTokens() }, [loadTokens])

  const generateLink = async () => {
    setGenerating(true)
    try {
      const res = await hrmService.generateDocUploadToken({
        employee_id: employee.id,
        expiry_hours: 72,
      })
      toast.success('Upload link generated')
      if (onLinkGenerated) onLinkGenerated()
      await loadTokens()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to generate link')
    }
    setGenerating(false)
  }

  const copyLink = (token) => {
    const url = `${window.location.origin}/document-upload/${token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Link copied!')).catch(() => {
      toast.error('Copy failed — please copy manually: ' + url)
    })
  }

  const deactivate = async (tokenId) => {
    try {
      await hrmService.revokeDocUploadToken(tokenId)
      toast.success('Link disabled')
      loadTokens()
    } catch { toast.error('Failed to disable link') }
  }

  const reactivate = async (tokenId) => {
    setReactivating(true)
    try {
      const res = await hrmService.reactivateDocUploadToken(tokenId, { expiry_hours: 72 })
      toast.success('Link reactivated')
      await loadTokens()
    } catch { toast.error('Failed to reactivate link') }
    setReactivating(false)
  }

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
    </div>
  )

  return (
    <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Link className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-800">Document Upload Request Link</span>
      </div>

      {!latestToken ? (
        <div className="text-center py-2">
          <p className="text-xs text-gray-500 mb-3">
            Generate a secure link so the employee can upload their own documents.
          </p>
          <button onClick={generateLink} disabled={generating}
            className="btn-primary text-sm flex items-center gap-2 mx-auto">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
            Generate Link
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Link status row */}
          <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-mono truncate">
                  {window.location.origin}/document-upload/***
                </span>
                {(() => {
                  const cfg = TOKEN_STATUS_CFG[latestToken.status] || TOKEN_STATUS_CFG.expired
                  return (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  )
                })()}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Created {fmtDate(latestToken.created_at)}
                {latestToken.expires_at && ` · Expires ${fmtDate(latestToken.expires_at)}`}
                {latestToken.upload_count > 0 && ` · ${latestToken.upload_count} upload(s)`}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {latestToken.status === 'active' && (
              <>
                <button onClick={() => copyLink(latestToken.token || '')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Copy Link
                </button>
                <button onClick={() => deactivate(latestToken.id)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  <Shield className="w-3.5 h-3.5" /> Deactivate
                </button>
              </>
            )}
            {['used', 'expired', 'revoked'].includes(latestToken.status) && (
              <button onClick={() => reactivate(latestToken.id)} disabled={reactivating}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
                {reactivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Reactivate Link
              </button>
            )}
            <button onClick={generateLink} disabled={generating}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              New Link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Employee Documents Panel ───────────────────────────────────────────────────

function EmployeeDocPanel({ employee, onClose, onRefresh }) {
  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [statusDoc, setStatusDoc]   = useState(null)
  const [showUpload, setShowUpload] = useState(false)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getDocuments(employee.id)
      // Attach employeeId to each doc so PreviewModal can build serve URL
      const raw = res.data.documents || []
      setDocs(raw.map(d => ({ ...d, employee_id: employee.id })))
    } catch {}
    setLoading(false)
  }, [employee.id])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.doc_name}"?`)) return
    try {
      await hrmService.deleteDocument(employee.id, doc.doc_id)
      toast.success('Document deleted')
      await loadDocs()
      onRefresh()
    } catch { toast.error('Delete failed') }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9990] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">{employee.full_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {employee.designation_name}
              {employee.total_docs != null && ` · ${employee.total_docs} document(s)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowUpload(true)}
              className="btn-primary text-sm flex items-center gap-1.5 py-2">
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Upload link management */}
          <UploadLinkSection employee={employee} onLinkGenerated={onRefresh} />

          {/* Documents list */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No documents uploaded yet.</p>
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
                const downloadUrl = hrmService.getDocumentServeUrl(employee.id, doc.doc_id, true)

                return (
                  <div key={doc.doc_id || doc.doc_type}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-100 transition-colors">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                         style={{ background: `${typeColor}18` }}>
                      <Icon className="w-4 h-4" style={{ color: typeColor }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">{doc.doc_name}</span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background:`${typeColor}20`, color:typeColor }}>
                          {cat?.label || doc.doc_type}
                        </span>
                        {/* Always-visible status badge (Phase 3 & 4) */}
                        <StatusBadge status={doc.status} size="xs" />
                        {doc.version > 1 && (
                          <span className="text-[9px] text-gray-400 font-mono">v{doc.version}</span>
                        )}
                      </div>
                      {doc.status === 'rejected' && doc.rejection_reason && (
                        <p className="text-xs text-red-500 mt-0.5 truncate">Reason: {doc.rejection_reason}</p>
                      )}
                      {doc.status === 'reupload_required' && doc.rejection_reason && (
                        <p className="text-xs text-purple-500 mt-0.5 truncate">Needed: {doc.rejection_reason}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Uploaded {fmtDate(doc.uploaded_at)}
                      </p>
                    </div>

                    {/* Action buttons — ALWAYS visible (Phase 4) */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setPreviewDoc(doc)}
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors" title="Preview">
                        <Eye className="w-4 h-4" />
                      </button>
                      <a href={downloadUrl} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors" title="Download">
                        <Download className="w-4 h-4" />
                      </a>
                      <button onClick={() => setStatusDoc(doc)}
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors" title="Update Status">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(doc)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sub-modals */}
      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
      {statusDoc && (
        <StatusModal
          doc={statusDoc}
          employeeId={employee.id}
          onClose={() => setStatusDoc(null)}
          onUpdated={loadDocs}   // Phase 3 fix: pass loadDocs directly (it's async)
        />
      )}
      {showUpload && (
        <MultiUploadModal
          employee={employee}
          onClose={() => setShowUpload(false)}
          onUploaded={async () => { await loadDocs(); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Employee Row ───────────────────────────────────────────────────────────────

function EmployeeRow({ emp, onOpen }) {
  return (
    <div
      onClick={() => onOpen(emp)}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl border cursor-pointer transition-all hover:shadow-sm"
      style={{ background:'var(--bg-card)', borderColor:'var(--border-card)' }}
    >
      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
        {emp.full_name?.charAt(0) || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{emp.full_name}</p>
        <p className="text-xs text-gray-400 truncate">
          {emp.designation_name}{emp.employee_id ? ` · ${emp.employee_id}` : ''}
        </p>
      </div>
      {/* Doc count — always visible (Phase 7) */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-bold text-gray-700">{emp.total_docs} Doc{emp.total_docs !== 1 ? 's' : ''}</span>
        {emp.pending_docs > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{emp.pending_docs}p</span>
        )}
        {emp.rejected_docs > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{emp.rejected_docs}r</span>
        )}
        {emp.approved_docs > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{emp.approved_docs}✓</span>
        )}
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

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

  // Status legend
  const legend = [
    { label: 'Pending',       color: '#f59e0b', bg: '#fef3c7' },
    { label: 'Approved',      color: '#10b981', bg: '#d1fae5' },
    { label: 'Rejected',      color: '#ef4444', bg: '#fee2e2' },
    { label: 'Reupload Req.', color: '#8b5cf6', bg: '#ede9fe' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color:'var(--text-heading)' }}>
            <FolderOpen className="w-5 h-5 text-indigo-600" />
            Documents
          </h2>
          <p className="text-sm mt-0.5" style={{ color:'var(--text-muted)' }}>
            {total} employee{total !== 1 ? 's' : ''} — click to view and manage
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {legend.map(l => (
            <span key={l.label} className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: l.bg, color: l.color }}>
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or employee ID…"
          className="input pl-9 text-sm" />
      </div>

      {/* Employee list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16" style={{ color:'var(--text-muted)' }}>
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No employees found.</p>
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
          <span>Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page===1} onClick={() => setPage(p=>p-1)}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
            <button disabled={page*PAGE_SIZE>=total} onClick={() => setPage(p=>p+1)}
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
