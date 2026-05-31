import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  History, ChevronRight, RotateCcw, Trash2, Loader2, FileText,
  Clock, User, Search, ChevronDown, ChevronUp,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

export default function VersionHistory() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const initTemplateId = searchParams.get('template_id') || ''

  const [templates, setTemplates]    = useState([])
  const [selTmpl,   setSelTmpl]      = useState(initTemplateId)
  const [versions,  setVersions]     = useState([])
  const [loading,   setLoading]      = useState(false)
  const [restoring, setRestoring]    = useState(null)
  const [expanded,  setExpanded]     = useState(null)
  const [tmplInfo,  setTmplInfo]     = useState(null)

  useEffect(() => {
    documentCenterService.listTemplates({ limit: 200 }).then(r => setTemplates(r.data?.data?.templates || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selTmpl) { setVersions([]); return }
    setLoading(true)
    const tmpl = templates.find(t => t._id === selTmpl)
    setTmplInfo(tmpl || null)
    documentCenterService.listVersions(selTmpl)
      .then(r => setVersions(r.data?.data || []))
      .catch(() => toast.error('Failed to load versions'))
      .finally(() => setLoading(false))
  }, [selTmpl, templates])

  const handleRestore = async (versionId, versionNum) => {
    if (!confirm(`Restore version ${versionNum}? A new version will be created.`)) return
    setRestoring(versionId)
    try {
      await documentCenterService.restoreVersion(selTmpl, versionId)
      toast.success(`Restored to version ${versionNum}`)
      // Reload
      const r = await documentCenterService.listVersions(selTmpl)
      setVersions(r.data?.data || [])
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Restore failed')
    } finally {
      setRestoring(null)
    }
  }

  const handleDelete = async (versionId, versionNum) => {
    if (!confirm(`Delete version ${versionNum}? This cannot be undone.`)) return
    try {
      await documentCenterService.deleteVersion(selTmpl, versionId)
      toast.success(`Version ${versionNum} deleted`)
      setVersions(v => v.filter(x => x._id !== versionId))
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Delete failed')
    }
  }

  const currentVersion = tmplInfo?.version || 1

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <History className="w-5 h-5 text-violet-600" /> Version History
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            View, compare, and restore previous versions of any template
          </p>
        </div>
      </div>

      {/* Template selector */}
      <div className="mb-5">
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Select Template</label>
        <select value={selTmpl} onChange={e => setSelTmpl(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
          <option value="">— Choose a template —</option>
          {templates.map(t => <option key={t._id} value={t._id}>{t.name} (v{t.version})</option>)}
        </select>
      </div>

      {!selTmpl ? (
        <div className="text-center py-16 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p style={{ color: 'var(--text-muted)' }}>Select a template to view its version history</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      ) : versions.length === 0 ? (
        <div className="text-center py-16 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p style={{ color: 'var(--text-muted)' }}>No versions found for this template</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {versions.map(ver => {
            const isCurrent = ver.version === currentVersion
            const isExpanded = expanded === ver._id
            return (
              <div key={ver._id}
                className={`border rounded-xl overflow-hidden transition-all ${isCurrent ? 'border-violet-400' : ''}`}
                style={{ borderColor: isCurrent ? '#7c3aed' : 'var(--border)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isCurrent ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    v{ver.version}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--text-heading)' }}>{ver.name}</span>
                      {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Current</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(ver.created_at).toLocaleString()}</span>
                      {ver.created_by_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{ver.created_by_name}</span>}
                      {ver.change_summary && <span className="italic truncate max-w-48">{ver.change_summary}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setExpanded(isExpanded ? null : ver._id)}
                      className="p-1.5 rounded hover:bg-gray-100 transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
                    </button>
                    {!isCurrent && (
                      <>
                        <button onClick={() => handleRestore(ver._id, ver.version)} disabled={!!restoring}
                          title="Restore this version"
                          className="p-1.5 rounded hover:bg-violet-50 transition-colors">
                          {restoring === ver._id ? <Loader2 className="w-4 h-4 animate-spin text-violet-600" /> : <RotateCcw className="w-4 h-4 text-violet-600" />}
                        </button>
                        <button onClick={() => handleDelete(ver._id, ver.version)}
                          title="Delete this version"
                          className="p-1.5 rounded hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Content Preview</p>
                    <div
                      className="text-xs rounded-lg p-3 max-h-40 overflow-y-auto"
                      style={{ background: 'var(--bg-primary)', color: 'var(--text-body)' }}
                      dangerouslySetInnerHTML={{ __html: ver.content?.body_html?.slice(0, 600) || '<em>No content</em>' }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
