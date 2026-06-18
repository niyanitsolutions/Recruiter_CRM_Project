import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Search, Download, Trash2, Archive, Eye, Printer, X, Loader2,
  FileText, Wand2, MoreVertical, ExternalLink, RefreshCw,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const STATUS_COLORS = {
  generated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  sent:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  signed:    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  archived:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  draft:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
}

function DocMenu({ doc, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [pos, setPos]   = useState({ top: 0, right: 0 })
  const btnRef          = useRef(null)
  const id   = doc._id || doc.id
  const pdf  = documentCenterService.downloadPDF(id)
  const docx = documentCenterService.downloadDOCX(id)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!btnRef.current?.contains(e.target)) setOpen(false) }
    const onScroll = () => setOpen(false)
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const above = rect.bottom + 240 > window.innerHeight
      setPos({
        top: above ? rect.top - 240 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(v => !v)
  }

  const doArchive = async () => {
    setOpen(false)
    setBusy('arc')
    try { await documentCenterService.archiveGenerated(id); toast.success('Archived'); onRefresh() }
    catch { toast.error('Failed') }
    finally { setBusy('') }
  }
  const doDelete = async () => {
    setOpen(false)
    if (!confirm('Permanently delete this document?')) return
    setBusy('del')
    try { await documentCenterService.deleteGenerated(id); toast.success('Deleted'); onRefresh() }
    catch { toast.error('Failed') }
    finally { setBusy('') }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="p-1.5 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        style={{ borderColor: 'var(--border)' }}
      >
        {busy
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-muted)' }} />
          : <MoreVertical className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] py-1 rounded-xl overflow-hidden"
            style={{
              top: pos.top,
              right: pos.right,
              width: 176,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            {doc.pdf_url && (
              <a href={doc.pdf_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm"
                style={{ color: 'var(--text-primary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
                onClick={() => setOpen(false)}
              >
                <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> View PDF
              </a>
            )}
            <a href={pdf}
              className="flex items-center gap-2 px-3 py-2 text-sm"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              onClick={() => setOpen(false)}
            >
              <Download className="w-3.5 h-3.5" style={{ color: '#10b981' }} /> Download PDF
            </a>
            <a href={docx}
              className="flex items-center gap-2 px-3 py-2 text-sm"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              onClick={() => setOpen(false)}
            >
              <Download className="w-3.5 h-3.5" style={{ color: '#10b981' }} /> Download DOCX
            </a>
            <button
              onClick={() => { window.open(pdf, '_blank'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <Printer className="w-3.5 h-3.5" style={{ color: '#6366f1' }} /> Print
            </button>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 12px' }} />
            <button
              onClick={doArchive}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <Archive className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} /> Archive
            </button>
            <button
              onClick={doDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm"
              style={{ color: '#ef4444' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function GenerateModal({ templateId, onClose, onDone }) {
  const [templates, setTemplates] = useState([])
  const [tmplId,    setTmplId]    = useState(templateId || '')
  const [docName,   setDocName]   = useState('')
  const [empId,     setEmpId]     = useState('')
  const [employees, setEmployees] = useState([])
  const [genPdf,    setGenPdf]    = useState(true)
  const [genDocx,   setGenDocx]   = useState(false)
  const [busy,      setBusy]      = useState(false)

  useEffect(() => {
    documentCenterService.listTemplates({ limit: 200 })
      .then(r => {
        const list = r.data?.data?.templates || []
        setTemplates(list)
        if (!templateId && list.length > 0) setTmplId(list[0]._id || list[0].id)
      }).catch(() => {})
    import('../../../services/api').then(m => m.default.get('/employees', { params: { limit: 200 } })
      .then(r => setEmployees(r.data?.data?.employees || r.data?.data || []))
      .catch(() => {})
    )
  }, [templateId])

  useEffect(() => {
    const t = templates.find(t => (t._id || t.id) === tmplId)
    if (t) setDocName(`${t.name} - ${new Date().toLocaleDateString()}`)
  }, [tmplId, templates])

  const handleGenerate = async () => {
    if (!tmplId)         { toast.error('Select a template'); return }
    if (!docName.trim()) { toast.error('Document name required'); return }
    setBusy(true)
    try {
      await documentCenterService.generateDocument({
        template_id: tmplId, document_name: docName,
        employee_id: empId || null, field_values: {},
        generate_pdf: genPdf, generate_docx: genDocx,
      })
      toast.success('Document generated!')
      onDone?.(); onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Generation failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl w-full max-w-md shadow-2xl" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-heading)' }}>Generate Document</h3>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Template *</label>
            <select value={tmplId} onChange={e => setTmplId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <option value="">— Select Template —</option>
              {templates.map(t => <option key={t._id||t.id} value={t._id||t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Document Name *</label>
            <input value={docName} onChange={e => setDocName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Employee (optional)</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <option value="">— No Employee —</option>
              {employees.map(e => <option key={e._id||e.id} value={e._id||e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-body)' }}>
              <input type="checkbox" checked={genPdf} onChange={e => setGenPdf(e.target.checked)} className="accent-violet-600" /> PDF
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-body)' }}>
              <input type="checkbox" checked={genDocx} onChange={e => setGenDocx(e.target.checked)} className="accent-violet-600" /> DOCX
            </label>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm border font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Cancel</button>
          <button onClick={handleGenerate} disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GeneratedDocuments() {
  const [searchParams] = useSearchParams()
  const tmplParam = searchParams.get('tmpl') || ''

  const [docs,    setDocs]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('')
  const [showGen, setShowGen] = useState(!!tmplParam)
  const [skip,    setSkip]    = useState(0)
  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listGenerated({
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        skip, limit: LIMIT,
      })
      const d = r.data?.data
      setDocs(d?.documents || [])
      setTotal(d?.total || 0)
    } catch { toast.error('Failed to load documents') }
    finally { setLoading(false) }
  }, [search, status, skip])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Generated Documents</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{total} document{total !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowGen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            <Wand2 className="w-4 h-4" /> Generate New
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setSkip(0) }}
              placeholder="Search documents…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setSkip(0) }}
            className="px-3 py-2 text-sm rounded-lg border"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <option value="">All Statuses</option>
            <option value="generated">Generated</option>
            <option value="sent">Sent</option>
            <option value="signed">Signed</option>
            <option value="archived">Archived</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-violet-600" /></div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FileText className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium mb-1" style={{ color: 'var(--text-heading)' }}>No documents found</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Generate your first document from a template</p>
            <button onClick={() => setShowGen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
              <Wand2 className="w-4 h-4" /> Generate Document
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                {['Document Name', 'Template', 'Employee', 'Status', 'Created', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc._id||doc.id} className="hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3">
                    <div className="font-medium truncate max-w-xs" style={{ color: 'var(--text-heading)' }} title={doc.document_name}>
                      {doc.document_name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{doc.template_name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-body)' }}>{doc.employee_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.status] || 'bg-gray-100 text-gray-600'}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {doc.pdf_url && (
                        <a href={doc.pdf_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                          <Eye className="w-3 h-3" /> View
                        </a>
                      )}
                      <a href={documentCenterService.downloadPDF(doc._id||doc.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                        <Download className="w-3 h-3" /> PDF
                      </a>
                      <DocMenu doc={doc} onRefresh={load} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > LIMIT && (
        <div className="flex items-center justify-between px-6 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {skip + 1}–{Math.min(skip + LIMIT, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button disabled={skip === 0} onClick={() => setSkip(s => Math.max(0, s - LIMIT))}
              className="px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Previous</button>
            <button disabled={skip + LIMIT >= total} onClick={() => setSkip(s => s + LIMIT)}
              className="px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Next</button>
          </div>
        </div>
      )}

      {showGen && (
        <GenerateModal templateId={tmplParam} onClose={() => setShowGen(false)} onDone={load} />
      )}
    </div>
  )
}
