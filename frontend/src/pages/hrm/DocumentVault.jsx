import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen, Upload, Trash2, Download, Search, Loader2,
  AlertCircle, FileText, Image, File, Eye, Plus, X, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

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

function fileIcon(url = '') {
  const ext = url.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return Image
  if (ext === 'pdf') return FileText
  return File
}

function UploadModal({ employee, onClose, onUploaded }) {
  const [docType, setDocType]   = useState('id_proof')
  const [docName, setDocName]   = useState('')
  const [file, setFile]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const fileRef = useRef()

  const handleUpload = async () => {
    if (!file) { toast.error('Select a file'); return }
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold text-gray-900">Upload Document</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="input-label">Employee</label>
            <input className="input bg-gray-50" value={employee.full_name || employee.name} disabled />
          </div>
          <div>
            <label className="input-label">Document Type</label>
            <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
              {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Document Name <span className="text-red-500">*</span></label>
            <input className="input" placeholder="e.g. Aadhaar Card" value={docName} onChange={e => setDocName(e.target.value)} />
          </div>
          <div>
            <label className="input-label">File <span className="text-red-500">*</span></label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <p className="text-sm text-indigo-700 font-medium">{file.name}</p>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Click to select file</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOCX — max 10 MB</p>
                </>
              )}
              <input ref={fileRef} type="file" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={e => setFile(e.target.files[0] || null)} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleUpload} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentCard({ doc, index, employee, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const Icon = fileIcon(doc.file_url)

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
    <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-indigo-200 bg-white transition-colors group">
      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-indigo-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{doc.doc_name}</p>
        <p className="text-xs text-gray-400">
          {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
          {doc.uploaded_at && ` · ${new Date(doc.uploaded_at).toLocaleDateString('en-IN')}`}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a href={doc.file_url} target="_blank" rel="noreferrer"
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500" title="View">
          <Eye className="w-4 h-4" />
        </a>
        <a href={doc.file_url} download
          className="p-1.5 rounded-lg hover:bg-green-50 text-green-500" title="Download">
          <Download className="w-4 h-4" />
        </a>
        <button onClick={handleDelete} disabled={deleting}
          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Delete">
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

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
          {emp.full_name?.charAt(0) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{emp.full_name}</p>
          <p className="text-xs text-gray-400">{emp.designation_name} {emp.department_name ? `· ${emp.department_name}` : ''}</p>
        </div>
        {loaded && (
          <span className="text-xs text-gray-400 font-medium">{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onUpload(emp) }}
          className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 mr-1"
          title="Upload document"
        >
          <Plus className="w-4 h-4" />
        </button>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 bg-gray-50 border-t border-gray-100">
          {loading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
          {!loading && docs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No documents uploaded yet.</p>
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
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [uploadTarget, setUploadTarget] = useState(null)
  const [page, setPage]           = useState(1)
  const [total, setTotal]         = useState(0)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.listEmployees({ search: search || undefined, page, page_size: PAGE_SIZE, status: 'active' })
      setEmployees(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }, [search, page])

  useEffect(() => { setPage(1) }, [search])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-indigo-600" />
            Document Vault
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage employee documents</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="input pl-9 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>
      ) : (
        <>
          <div className="space-y-3">
            {employees.length === 0 ? (
              <div className="text-center py-16 text-gray-400">No employees found.</div>
            ) : (
              employees.map(emp => (
                <EmployeeRow key={emp._id || emp.id} emp={emp} onUpload={setUploadTarget} />
              ))
            )}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
                <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {uploadTarget && (
        <UploadModal
          employee={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploaded={() => setUploadTarget(null)}
        />
      )}
    </div>
  )
}
