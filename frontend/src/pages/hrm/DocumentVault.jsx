import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen, Upload, Trash2, Download, Search, Loader2,
  FileText, Image, File, Eye, Plus, X, ChevronDown, Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

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

function fileIcon(url = '') {
  const ext = url.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return Image
  if (ext === 'pdf') return FileText
  return File
}

function UploadModal({ employee, onClose, onUploaded }) {
  const [docType, setDocType] = useState('id_proof')
  const [docName, setDocName] = useState('')
  const [file, setFile]       = useState(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef()

  const handleUpload = async () => {
    if (!file)             { toast.error('Select a file'); return }
    if (!docName.trim())   { toast.error('Enter document name'); return }
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
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Employee
              </label>
              <div className="px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                {employee.full_name || employee.name}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Document Type
              </label>
              <select className="input w-full text-sm" value={docType}
                onChange={e => setDocType(e.target.value)}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Document Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input className="input w-full text-sm" placeholder="e.g. Aadhaar Card"
                value={docName} onChange={e => setDocName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                File <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div
                className="rounded-xl p-5 text-center cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${file ? '#7c3aed' : 'var(--border)'}`,
                  background: file ? 'rgba(124,58,237,0.04)' : 'var(--bg-hover)',
                }}
                onClick={() => fileRef.current?.click()}
                onMouseEnter={e => { if (!file) e.currentTarget.style.borderColor = '#7c3aed' }}
                onMouseLeave={e => { if (!file) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                {file ? (
                  <p className="text-sm font-medium" style={{ color: '#7c3aed' }}>{file.name}</p>
                ) : (
                  <>
                    <Upload className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Click to select file</p>
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

function DocumentCard({ doc, index, employee, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const Icon  = fileIcon(doc.file_url)
  const color = DOC_TYPE_COLORS[doc.doc_type] || '#94a3b8'

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc.doc_name}"?`)) return
    setDeleting(true)
    try {
      await hrmService.deleteDocument(employee._id || employee.id, index)
      toast.success('Document deleted')
      onDeleted()
    } catch { toast.error('Delete failed') }
    setDeleting(false)
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl transition-all group"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.background = `${color}06` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-card)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-heading)' }}>
          {doc.doc_name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
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
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a href={doc.file_url} target="_blank" rel="noreferrer"
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="View"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,172,254,0.10)'; e.currentTarget.style.color = '#4FACFE' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          <Eye className="w-4 h-4" />
        </a>
        <a href={doc.file_url} download
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="Download"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.10)'; e.currentTarget.style.color = '#22c55e' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          <Download className="w-4 h-4" />
        </a>
        <button onClick={handleDelete} disabled={deleting}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="Delete"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.10)'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

function EmployeeRow({ emp, onUpload }) {
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

  const initials = emp.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('') || '?'

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
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: docs.length > 0 ? 'rgba(34,197,94,0.10)' : 'var(--bg-hover)', color: docs.length > 0 ? '#22c55e' : 'var(--text-disabled)' }}>
            {docs.length} doc{docs.length !== 1 ? 's' : ''}
          </span>
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
            <DocumentCard key={i} doc={doc} index={i} employee={emp} onDeleted={loadDocs} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DocumentVault() {
  const [employees, setEmployees]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [uploadTarget, setUploadTarget] = useState(null)
  const [page, setPage]                 = useState(1)
  const [total, setTotal]               = useState(0)
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: 'var(--text-heading)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.12)' }}>
              <Shield className="w-5 h-5" style={{ color: '#7c3aed' }} />
            </div>
            Document Vault
          </h1>
          <p className="text-sm mt-0.5 ml-11" style={{ color: 'var(--text-muted)' }}>
            {total > 0 ? `${total} employee${total !== 1 ? 's' : ''} · secure document storage` : 'Secure employee document storage'}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="input pl-9 text-sm w-64"
          />
        </div>
      </div>

      {loading ? (
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
              <EmployeeRow key={emp._id || emp.id} emp={emp} onUpload={setUploadTarget} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">
                  Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-medium rounded-lg"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                  {page} / {totalPages}
                </span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {uploadTarget && (
        <UploadModal
          employee={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploaded={() => { setUploadTarget(null); load() }}
        />
      )}
    </div>
  )
}
