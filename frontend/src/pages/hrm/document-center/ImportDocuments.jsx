import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Upload, FileText, File, Globe, X, Loader2, FolderOpen } from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'
import { useEffect } from 'react'

const FILE_ICONS = { pdf: FileText, docx: File, html: Globe }

export default function ImportDocuments() {
  const navigate    = useNavigate()
  const inputRef    = useRef(null)
  const [dragging,  setDragging]  = useState(false)
  const [file,      setFile]      = useState(null)
  const [name,      setName]      = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [tags,      setTags]      = useState('')
  const [categories, setCategories] = useState([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
  }, [])

  const getExt = (filename) => (filename || '').rsplit?.('.', 1)?.[1]?.toLowerCase()
    || filename.split('.').pop().toLowerCase()

  const ALLOWED = ['pdf', 'docx', 'html', 'htm']

  const handleFile = (f) => {
    const ext = getExt(f.name)
    if (!ALLOWED.includes(ext)) {
      toast.error('Unsupported file type. Use PDF, DOCX, or HTML.')
      return
    }
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file)  { toast.error('Please select a file');           return }
    if (!name.trim()) { toast.error('Template name is required'); return }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name.trim())
    formData.append('description', description)
    if (categoryId) formData.append('category_id', categoryId)
    if (tags.trim()) formData.append('tags', tags.trim())

    setUploading(true)
    try {
      const r = await documentCenterService.importDocument(formData)
      const newId = r.data?.data?._id
      toast.success('Document imported successfully')
      if (newId) navigate(`/hrm/doc-center/builder/${newId}`)
      else navigate('/hrm/doc-center/library')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Import failed')
    } finally {
      setUploading(false)
    }
  }

  const ext = file ? getExt(file.name) : null
  const FileIcon = ext && FILE_ICONS[ext] ? FILE_ICONS[ext] : Upload

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Import Documents</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Import existing DOCX, PDF, or HTML files as templates. The content will be extracted and made editable.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragging ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20' : ''
          }`}
          style={!dragging ? { borderColor: 'var(--border)', background: 'var(--bg-secondary)' } : {}}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.html,.htm"
            className="hidden"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
          />

          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileIcon className="w-10 h-10 text-violet-600" />
              <div className="text-left">
                <p className="font-semibold" style={{ color: 'var(--text-heading)' }}>{file.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB · {ext?.toUpperCase()}</p>
              </div>
              <button type="button" onClick={e => { e.stopPropagation(); setFile(null); setName('') }}
                className="ml-4 p-1 rounded-full hover:bg-red-50">
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 mx-auto mb-3 text-violet-400" />
              <p className="font-medium" style={{ color: 'var(--text-heading)' }}>Drop a file here or click to browse</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Supported: PDF, DOCX, HTML (max 20 MB)</p>
            </>
          )}
        </div>

        {/* Metadata */}
        <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>Template Details</h3>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Template Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              placeholder="e.g. Offer Letter 2024"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Brief description of this document…"
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                <option value="">— No Category —</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Tags (comma separated)</label>
              <input value={tags} onChange={e => setTags(e.target.value)}
                placeholder="HR, Legal, Offer"
                className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/hrm/doc-center/library')}
            className="px-5 py-2 rounded-lg text-sm border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            Cancel
          </button>
          <button type="submit" disabled={uploading || !file}
            className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Importing…' : 'Import Document'}
          </button>
        </div>
      </form>
    </div>
  )
}
