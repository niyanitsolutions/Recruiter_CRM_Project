import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Upload, FileText, Loader2, ArrowLeft, ArrowRight,
  CheckCircle, X, FileWarning, File, Trash2,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'
import QuickBuilder from './QuickBuilder'

const ALLOWED = ['docx', 'pdf']

// ─── Step 1: Upload ────────────────────────────────────────────────────────────
function UploadStep({ onImported }) {
  const [file,        setFile]        = useState(null)
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [dragging,    setDragging]    = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const inputRef = useRef(null)

  const pickFile = (f) => {
    if (!f) return
    const ext = f.name.rsplit?.('.', 1)?.[1]?.toLowerCase() ||
                f.name.split('.').pop().toLowerCase()
    if (!ALLOWED.includes(ext)) {
      toast.error(`Unsupported format. Use DOCX or PDF.`)
      return
    }
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  const handleUpload = async () => {
    if (!file) { toast.error('Please select a file'); return }
    if (!name.trim()) { toast.error('Template name is required'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', name)
      fd.append('description', description)
      const r = await documentCenterService.importDocument(fd)
      const doc = r.data?.data
      toast.success('File imported — opening editor')
      onImported(doc)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Import failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-full p-8 flex flex-col items-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-heading)' }}>Import & Edit</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Upload a DOCX or PDF file. We'll parse the content and open it in the Quick Builder for editing.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-6 ${
            dragging ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20' : ''
          }`}
          style={{ borderColor: dragging ? '#7c3aed' : 'var(--border)' }}
        >
          <input ref={inputRef} type="file" accept=".docx,.pdf" className="sr-only"
            onChange={e => pickFile(e.target.files[0])} />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--bg-secondary)' }}>
                <FileText className="w-8 h-8 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>{file.name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {(file.size / 1024).toFixed(0)} KB · {file.name.split('.').pop().toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-green-600">
                <CheckCircle className="w-4 h-4" />
                Ready to import
              </div>
              <button onClick={e => { e.stopPropagation(); setFile(null); setName('') }}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 mt-1">
                <Trash2 className="w-3 h-3" /> Remove file
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--bg-secondary)' }}>
                <Upload className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>
                  Drop your file here, or click to browse
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Supports DOCX and PDF · Max 20 MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Supported formats info */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { fmt: 'DOCX', desc: 'Preserves paragraphs, headings, tables & lists' },
            { fmt: 'PDF',  desc: 'Extracts readable text (formatting may vary)' },
          ].map(f => (
            <div key={f.fmt} className="flex items-start gap-2 p-3 rounded-xl border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <File className="w-4 h-4 mt-0.5 flex-shrink-0 text-violet-500" />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-heading)' }}>{f.fmt}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Template details */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Template Name *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Offer Letter 2024"
              className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of this template…"
              className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
          </div>
        </div>

        {/* Import button */}
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
          ) : (
            <><ArrowRight className="w-4 h-4" /> Import & Open Editor</>
          )}
        </button>

        {/* Notice */}
        <div className="flex items-start gap-2 mt-4 p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
          <FileWarning className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            The importer extracts text content. Complex PDF layouts, special fonts, and embedded graphics may not be perfectly preserved.
            You can always add HR placeholders, tables, and styling after import.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ImportEditor() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [imported, setImported] = useState(null)

  // After import, navigate to the edit URL so QuickBuilder picks up the id
  useEffect(() => {
    if (imported) {
      const templateId = imported._id || imported.id
      navigate(`/hrm/doc-center/import/${templateId}`, { replace: true })
    }
  }, [imported, navigate])

  // If opened with an existing imported template ID → go straight to editor
  if (id) {
    return <QuickBuilder onSaved={() => navigate('/hrm/doc-center/templates')} />
  }

  if (imported) {
    // Navigation in progress — show nothing
    return null
  }

  return <UploadStep onImported={setImported} />
}
