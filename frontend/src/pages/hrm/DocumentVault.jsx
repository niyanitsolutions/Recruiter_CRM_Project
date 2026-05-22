import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen, Upload, Trash2, Download, Search, Loader2,
  FileText, Image, File, Eye, Plus, X, ChevronDown, Shield,
  Star, Tag, LayoutList, Grid3x3, Filter, RefreshCw, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

// ── Constants ──────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  'offer_letter', 'appointment_letter', 'contract', 'id_proof',
  'pan_card', 'aadhaar', 'passport', 'resume', 'certificate',
  'experience_letter', 'relieving_letter', 'payslip', 'other',
]

const DOC_TYPE_LABELS = {
  offer_letter: 'Offer Letter', appointment_letter: 'Appointment Letter',
  contract: 'Contract', id_proof: 'ID Proof', pan_card: 'PAN Card',
  aadhaar: 'Aadhaar', passport: 'Passport', resume: 'Resume',
  certificate: 'Certificate', experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter', payslip: 'Payslip', other: 'Other',
}

const DOC_TYPE_COLORS = {
  offer_letter: '#7c3aed', appointment_letter: '#4FACFE', contract: '#22c55e',
  id_proof: '#F6A535', pan_card: '#FA8231', aadhaar: '#FF4757',
  passport: '#38F9D7', resume: '#6366f1', certificate: '#43E97B',
  experience_letter: '#FF6B9D', relieving_letter: '#C850C0',
  payslip: '#10b981', other: '#94a3b8',
}

function fileExt(url = '') { return url.split('.').pop()?.toLowerCase() || '' }

function fileIcon(url = '') {
  const ext = fileExt(url)
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return Image
  if (ext === 'pdf') return FileText
  return File
}

// ── Preview Modal ──────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }) {
  const ext = fileExt(doc.file_url)
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
  const isPDF   = ext === 'pdf'
  const color   = DOC_TYPE_COLORS[doc.doc_type] || '#94a3b8'

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[9999] p-4"
           onClick={onClose}>
        <div
          className="relative w-full max-w-4xl flex flex-col rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', maxHeight: '92vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
               style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>
                {doc.doc_name}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: `${color}20`, color }}>
                {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a href={doc.file_url} download
                 className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
              <button onClick={onClose}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4"
               style={{ minHeight: '400px', background: 'var(--bg-page)' }}>
            {isImage ? (
              <img src={doc.file_url} alt={doc.doc_name}
                   className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg" />
            ) : isPDF ? (
              <iframe src={doc.file_url} title={doc.doc_name}
                      className="w-full rounded-xl"
                      style={{ height: '75vh', border: 'none' }} />
            ) : (
              <div className="text-center py-16">
                <File className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  Preview not available for this file type.
                </p>
                <a href={doc.file_url} download className="btn-primary inline-flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" /> Download File
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Upload Modal ───────────────────────────────────────────────────────────────

function UploadModal({ employee, onClose, onUploaded }) {
  const [docType, setDocType] = useState('id_proof')
  const [docName, setDocName] = useState('')
  const [file, setFile]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const handleUpload = async () => {
    if (!file)           { toast.error('Select a file'); return }
    if (!docName.trim()) { toast.error('Enter document name'); return }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('doc_type', docType)
      fd.append('doc_name', docName.trim())
      fd.append('file', file)
      await hrmService.uploadDocument(employee._id || employee.id, fd)
      toast.success('Document uploaded')
      onUploaded()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Upload failed')
    }
    setLoading(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
        <div className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <div className="flex items-center justify-between px-5 py-4"
               style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                   style={{ background: 'rgba(124,58,237,0.12)' }}>
                <Upload className="w-4 h-4" style={{ color: '#7c3aed' }} />
              </div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>
                Upload Document
              </h3>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Employee */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Employee
              </label>
              <div className="px-3 py-2 rounded-xl text-sm font-medium"
                   style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                {employee.full_name || employee.name}
              </div>
            </div>

            {/* Doc type */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Document Type
              </label>
              <select className="input w-full text-sm" value={docType}
                      onChange={e => setDocType(e.target.value)}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
              </select>
            </div>

            {/* Doc name */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Document Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input className="input w-full text-sm" placeholder="e.g. Aadhaar Card"
                     value={docName} onChange={e => setDocName(e.target.value)} />
            </div>

            {/* File drop zone */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                File <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div
                className="rounded-xl p-5 text-center cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${dragOver ? '#7c3aed' : file ? '#7c3aed' : 'var(--border)'}`,
                  background: dragOver ? 'rgba(124,58,237,0.08)' : file ? 'rgba(124,58,237,0.04)' : 'var(--bg-hover)',
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onMouseEnter={e => { if (!file && !dragOver) e.currentTarget.style.borderColor = '#7c3aed' }}
                onMouseLeave={e => { if (!file && !dragOver) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <File className="w-4 h-4" style={{ color: '#7c3aed' }} />
                    <p className="text-sm font-medium" style={{ color: '#7c3aed' }}>{file.name}</p>
                    <button
                      onClick={e => { e.stopPropagation(); setFile(null) }}
                      className="ml-1 p-0.5 rounded-full"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-7 h-7 mx-auto mb-2" style={{ color: dragOver ? '#7c3aed' : 'var(--text-disabled)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {dragOver ? 'Drop file here' : 'Click or drag & drop to upload'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
                      PDF, JPG, PNG, DOCX — max 10 MB
                    </p>
                  </>
                )}
                <input ref={fileRef} type="file" className="hidden"
                       accept=".pdf,.jpg,.jpeg,.png,.docx"
                       onChange={e => setFile(e.target.files[0] || null)} />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={handleUpload} disabled={loading}
                      className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Tag Editor ─────────────────────────────────────────────────────────────────

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const t = input.trim()
    if (!t || tags.includes(t)) { setInput(''); return }
    onChange([...tags, t])
    setInput('')
  }

  const removeTag = (tag) => onChange(tags.filter(t => t !== tag))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}>
          {tag}
          <button onClick={() => removeTag(tag)} style={{ lineHeight: 1 }}>
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
        onBlur={addTag}
        placeholder="+ tag"
        className="text-[10px] outline-none bg-transparent w-14"
        style={{ color: 'var(--text-muted)' }}
      />
    </div>
  )
}

// ── Document Card ──────────────────────────────────────────────────────────────

function DocumentCard({ doc, docIndex, employeeId, onDeleted, onPreview, onMetaChange }) {
  const [deleting, setDeleting] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const Icon  = fileIcon(doc.file_url)
  const color = DOC_TYPE_COLORS[doc.doc_type] || '#94a3b8'

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc.doc_name}"?`)) return
    setDeleting(true)
    try {
      await hrmService.deleteDocument(employeeId, docIndex)
      toast.success('Document deleted')
      onDeleted()
    } catch { toast.error('Delete failed') }
    setDeleting(false)
  }

  const toggleFavorite = async () => {
    const newVal = !doc.favorite
    setSavingMeta(true)
    try {
      await hrmService.updateDocumentMeta(employeeId, docIndex, { favorite: newVal })
      onMetaChange(docIndex, { favorite: newVal })
    } catch { toast.error('Failed to update') }
    setSavingMeta(false)
  }

  const handleTagsChange = async (newTags) => {
    onMetaChange(docIndex, { tags: newTags })
    try {
      await hrmService.updateDocumentMeta(employeeId, docIndex, { tags: newTags })
    } catch { toast.error('Failed to save tags') }
  }

  return (
    <div className="rounded-xl overflow-hidden transition-all group"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
         onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}50`; e.currentTarget.style.background = `${color}06` }}
         onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-card)' }}>
      <div className="flex items-center gap-3 p-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-heading)' }}>
            {doc.doc_name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${color}15`, color }}>
              {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
            </span>
            {doc.uploaded_at && (
              <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
                {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Favorite */}
          <button
            onClick={toggleFavorite}
            disabled={savingMeta}
            className="p-1.5 rounded-lg transition-colors"
            title={doc.favorite ? 'Remove from favorites' : 'Add to favorites'}
            style={{ color: doc.favorite ? '#f59e0b' : 'var(--text-disabled)' }}
            onMouseEnter={e => { if (!doc.favorite) e.currentTarget.style.color = '#f59e0b' }}
            onMouseLeave={e => { if (!doc.favorite) e.currentTarget.style.color = 'var(--text-disabled)' }}
          >
            <Star className="w-4 h-4" fill={doc.favorite ? 'currentColor' : 'none'} />
          </button>
          {/* Preview */}
          <button
            onClick={() => onPreview(doc)}
            className="p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            style={{ color: 'var(--text-muted)' }}
            title="Preview"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,172,254,0.10)'; e.currentTarget.style.color = '#4FACFE' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Eye className="w-4 h-4" />
          </button>
          {/* Download */}
          <a href={doc.file_url} download
             className="p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
             style={{ color: 'var(--text-muted)' }}
             title="Download"
             onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.10)'; e.currentTarget.style.color = '#22c55e' }}
             onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <Download className="w-4 h-4" />
          </a>
          {/* Delete */}
          <button onClick={handleDelete} disabled={deleting}
                  className="p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete"
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.10)'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {/* Tags row */}
      <div className="px-3 pb-2.5">
        <TagEditor
          tags={doc.tags || []}
          onChange={handleTagsChange}
        />
      </div>
    </div>
  )
}

// ── Employee Accordion Row ─────────────────────────────────────────────────────

function EmployeeRow({ emp, onUpload, onPreview }) {
  const [open, setOpen]       = useState(false)
  const [docs, setDocs]       = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded]   = useState(false)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getDocuments(emp._id || emp.id)
      setDocs(res.data.documents || [])
      setLoaded(true)
    } catch {}
    setLoading(false)
  }, [emp._id, emp.id])

  const toggle = () => {
    setOpen(o => !o)
    if (!loaded) loadDocs()
  }

  const handleMetaChange = (docIndex, patch) => {
    setDocs(prev => prev.map((d, i) => i === docIndex ? { ...d, ...patch } : d))
  }

  const initials = emp.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('') || '?'
  const favCount = docs.filter(d => d.favorite).length

  return (
    <div className="rounded-2xl overflow-hidden transition-all"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-semibold text-sm flex-shrink-0"
             style={{ background: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>
            {emp.full_name}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {emp.designation_name}{emp.department_name ? ` · ${emp.department_name}` : ''}
          </p>
        </div>
        {loaded && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {favCount > 0 && (
              <span className="text-xs flex items-center gap-0.5" style={{ color: '#f59e0b' }}>
                <Star className="w-3 h-3" fill="currentColor" /> {favCount}
              </span>
            )}
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: docs.length > 0 ? 'rgba(34,197,94,0.10)' : 'var(--bg-hover)', color: docs.length > 0 ? '#22c55e' : 'var(--text-disabled)' }}>
              {docs.length} doc{docs.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        <button
          onClick={e => { e.stopPropagation(); onUpload(emp) }}
          className="p-1.5 rounded-lg flex-shrink-0 transition-all mr-1"
          style={{ background: 'rgba(124,58,237,0.10)', color: '#7c3aed' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.20)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,58,237,0.10)'}
          title="Upload document"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                     style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-2"
             style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-hover)' }}>
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          )}
          {!loading && docs.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
              No documents uploaded yet.
            </p>
          )}
          {!loading && docs.map((doc, i) => (
            <DocumentCard
              key={i}
              doc={doc}
              docIndex={i}
              employeeId={emp._id || emp.id}
              onDeleted={loadDocs}
              onPreview={onPreview}
              onMetaChange={handleMetaChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Category View ──────────────────────────────────────────────────────────────

function CategoryView({ onPreview }) {
  const [items, setItems]           = useState([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [favOnly, setFavOnly]       = useState(false)
  const PAGE_SIZE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getAllDocuments({
        page,
        page_size: PAGE_SIZE,
        doc_type: typeFilter || undefined,
        search: search || undefined,
        favorites_only: favOnly || undefined,
      })
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }, [page, typeFilter, search, favOnly])

  useEffect(() => { setPage(1) }, [typeFilter, search, favOnly])
  useEffect(() => { load() }, [load])

  const handleMetaChange = async (item, patch) => {
    setItems(prev => prev.map(d =>
      d.employee_id === item.employee_id && d.doc_index === item.doc_index
        ? { ...d, ...patch }
        : d
    ))
    try {
      await hrmService.updateDocumentMeta(item.employee_id, item.doc_index, patch)
    } catch { toast.error('Failed to update') }
  }

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.doc_name}"?`)) return
    try {
      await hrmService.deleteDocument(item.employee_id, item.doc_index)
      toast.success('Document deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--text-disabled)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or document…"
            className="input pl-9 text-sm w-full"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="input text-sm"
          style={{ minWidth: '140px' }}
        >
          <option value="">All Types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
        </select>
        <button
          onClick={() => setFavOnly(f => !f)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{
            background: favOnly ? 'rgba(245,158,11,0.15)' : 'var(--bg-card)',
            border: `1px solid ${favOnly ? '#f59e0b' : 'var(--border-card)'}`,
            color: favOnly ? '#f59e0b' : 'var(--text-secondary)',
          }}
        >
          <Star className="w-4 h-4" fill={favOnly ? 'currentColor' : 'none'} />
          Favorites
        </button>
        <button onClick={load} className="btn-secondary p-2" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#7c3aed' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl p-16 flex flex-col items-center gap-3"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <FolderOpen className="w-12 h-12" style={{ color: 'var(--text-disabled)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No documents found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item, idx) => {
            const Icon  = fileIcon(item.file_url)
            const color = DOC_TYPE_COLORS[item.doc_type] || '#94a3b8'
            return (
              <div key={idx}
                   className="rounded-xl overflow-hidden transition-all group"
                   style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
                   onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}50` }}
                   onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}>
                <div className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: `${color}18` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-heading)' }}>
                      {item.doc_name}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {item.employee_name}
                      {item.designation ? ` · ${item.designation}` : ''}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: `${color}15`, color }}>
                        {DOC_TYPE_LABELS[item.doc_type] || item.doc_type}
                      </span>
                      {item.uploaded_at && (
                        <span className="text-[10px]" style={{ color: 'var(--text-disabled)' }}>
                          {new Date(item.uploaded_at).toLocaleDateString('en-IN')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleMetaChange(item, { favorite: !item.favorite })}
                      className="p-1 rounded-lg"
                      style={{ color: item.favorite ? '#f59e0b' : 'var(--text-disabled)' }}
                      title={item.favorite ? 'Unfavorite' : 'Favorite'}
                    >
                      <Star className="w-3.5 h-3.5" fill={item.favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
                {/* Tags */}
                <div className="px-3 pb-2">
                  <TagEditor
                    tags={item.tags || []}
                    onChange={async (newTags) => {
                      handleMetaChange(item, { tags: newTags })
                      try {
                        await hrmService.updateDocumentMeta(item.employee_id, item.doc_index, { tags: newTags })
                      } catch { toast.error('Failed to save tags') }
                    }}
                  />
                </div>
                {/* Actions */}
                <div className="flex items-center justify-end gap-1 px-2 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onPreview(item)}
                          className="p-1.5 rounded-lg text-xs flex items-center gap-1"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#4FACFE'; e.currentTarget.style.background = 'rgba(79,172,254,0.10)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}>
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <a href={item.file_url} download
                     className="p-1.5 rounded-lg"
                     style={{ color: 'var(--text-muted)' }}
                     onMouseEnter={e => { e.currentTarget.style.color = '#22c55e'; e.currentTarget.style.background = 'rgba(34,197,94,0.10)' }}
                     onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}>
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => handleDelete(item)}
                          className="p-1.5 rounded-lg"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(255,71,87,0.10)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
            <span className="px-3 py-1.5 text-xs font-medium rounded-lg"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
              {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DocumentVault() {
  const [employees, setEmployees]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [uploadTarget, setUploadTarget] = useState(null)
  const [previewDoc, setPreviewDoc]     = useState(null)
  const [page, setPage]                 = useState(1)
  const [total, setTotal]               = useState(0)
  const [view, setView]                 = useState('employee') // 'employee' | 'category'
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.listEmployees({
        search: search || undefined, page, page_size: PAGE_SIZE, status: 'active',
      })
      setEmployees(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }, [search, page])

  useEffect(() => { setPage(1) }, [search])
  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: 'var(--text-heading)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: 'rgba(124,58,237,0.12)' }}>
              <Shield className="w-5 h-5" style={{ color: '#7c3aed' }} />
            </div>
            Document Vault
          </h1>
          <p className="text-sm mt-0.5 ml-11" style={{ color: 'var(--text-muted)' }}>
            {total > 0
              ? `${total} employee${total !== 1 ? 's' : ''} · secure document storage`
              : 'Secure employee document storage'}
          </p>
        </div>

        {/* View toggle + search */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* View mode */}
          <div className="flex rounded-xl overflow-hidden"
               style={{ border: '1px solid var(--border-card)' }}>
            {[
              { key: 'employee', icon: LayoutList, label: 'By Employee' },
              { key: 'category', icon: Grid3x3,   label: 'By Category' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
                style={{
                  background: view === key ? 'rgba(124,58,237,0.12)' : 'var(--bg-card)',
                  color: view === key ? '#7c3aed' : 'var(--text-muted)',
                  borderRight: key === 'employee' ? '1px solid var(--border-card)' : 'none',
                }}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {view === 'employee' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                      style={{ color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employees…"
                className="input pl-9 text-sm w-56"
              />
            </div>
          )}
        </div>
      </div>

      {/* By Employee view */}
      {view === 'employee' && (
        loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#7c3aed' }} />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {employees.length === 0 ? (
                <div className="rounded-2xl p-16 flex flex-col items-center gap-3"
                     style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                       style={{ background: 'rgba(124,58,237,0.08)' }}>
                    <FolderOpen className="w-7 h-7" style={{ color: 'var(--text-disabled)' }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                    {search ? 'No employees match your search' : 'No active employees found'}
                  </p>
                </div>
              ) : employees.map(emp => (
                <EmployeeRow
                  key={emp._id || emp.id}
                  emp={emp}
                  onUpload={setUploadTarget}
                  onPreview={setPreviewDoc}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
                  <span className="px-3 py-1.5 text-xs font-medium rounded-lg"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                    {page} / {totalPages}
                  </span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* By Category view */}
      {view === 'category' && <CategoryView onPreview={setPreviewDoc} />}

      {uploadTarget && (
        <UploadModal
          employee={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploaded={() => { setUploadTarget(null); load() }}
        />
      )}

      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  )
}
