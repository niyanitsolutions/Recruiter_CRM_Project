import React, { useState, useEffect } from 'react'
import {
  Plus, Megaphone, Edit2, Trash2, ToggleLeft, ToggleRight,
  Eye, Mail, Users, CheckCircle, AlertTriangle, Info, Bell,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  general:     'bg-blue-100 text-blue-700',
  holiday:     'bg-green-100 text-green-700',
  policy:      'bg-purple-100 text-purple-700',
  urgent:      'bg-red-100 text-red-700',
  event:       'bg-yellow-100 text-yellow-700',
  birthday:    'bg-pink-100 text-pink-700',
  anniversary: 'bg-orange-100 text-orange-700',
}

const PRIORITY_STYLES = {
  low:      { icon: Info,          cls: 'text-gray-400',  label: 'Low' },
  normal:   { icon: Bell,          cls: 'text-blue-400',  label: 'Normal' },
  high:     { icon: AlertTriangle, cls: 'text-yellow-500',label: 'High' },
  critical: { icon: AlertTriangle, cls: 'text-red-500',   label: 'Critical' },
}

const TYPES   = ['general','holiday','policy','urgent','event','birthday','anniversary']
const PRIORIT = ['low','normal','high','critical']

const EMPTY_FORM = {
  title: '', body: '', announcement_type: 'general', priority: 'normal',
  requires_acknowledgement: false, send_email: false,
  publish_at: '', expires_at: '', attachment_url: '',
}

// ── Create / Edit Modal ───────────────────────────────────────────────────────

function AnnouncementFormModal({ isOpen, editAnn, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (editAnn) {
      setForm({
        title: editAnn.title || '',
        body: editAnn.body || '',
        announcement_type: editAnn.announcement_type || 'general',
        priority: editAnn.priority || 'normal',
        requires_acknowledgement: editAnn.requires_acknowledgement || false,
        send_email: editAnn.send_email || false,
        publish_at: editAnn.publish_at ? editAnn.publish_at.slice(0, 16) : '',
        expires_at: editAnn.expires_at ? editAnn.expires_at.slice(0, 16) : '',
        attachment_url: editAnn.attachment_url || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [isOpen, editAnn])

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        publish_at: form.publish_at || null,
        expires_at: form.expires_at || null,
        attachment_url: form.attachment_url || null,
      }
      if (editAnn) await hrmService.updateAnnouncement(editAnn.id, payload)
      else await hrmService.createAnnouncement(payload)
      toast.success(editAnn ? 'Updated' : 'Announcement created')
      onSaved()
      onClose()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] overflow-y-auto py-8">
        <form onSubmit={handleSave} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl mx-4">
          <h2 className="text-lg font-semibold">{editAnn ? 'Edit Announcement' : 'New Announcement'}</h2>

          <div>
            <label className="text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
            <input className="input w-full mt-1" value={form.title} onChange={e => set('title', e.target.value)} required />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Body <span className="text-red-500">*</span></label>
            <textarea className="input w-full mt-1" rows={4} value={form.body} onChange={e => set('body', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select className="input w-full mt-1" value={form.announcement_type} onChange={e => set('announcement_type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <select className="input w-full mt-1" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORIT.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Publish At</label>
              <input type="datetime-local" className="input w-full mt-1" value={form.publish_at} onChange={e => set('publish_at', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Expires At</label>
              <input type="datetime-local" className="input w-full mt-1" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Attachment URL</label>
            <input className="input w-full mt-1" placeholder="https://…" value={form.attachment_url} onChange={e => set('attachment_url', e.target.value)} />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.requires_acknowledgement}
                onChange={e => set('requires_acknowledgement', e.target.checked)} />
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="font-medium text-gray-700">Require read acknowledgement</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.send_email}
                onChange={e => set('send_email', e.target.checked)} />
              <Mail className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-gray-700">Send email broadcast to all employees</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

// ── Read Stats Modal ──────────────────────────────────────────────────────────

function ReadStatsModal({ annId, onClose }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!annId) return
    setLoading(true)
    hrmService.getAnnouncementReadStats(annId)
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [annId])

  return (
    <ModalPortal isOpen={!!annId}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Read Statistics</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          {loading ? (
            <div className="text-center py-6 text-gray-400">Loading…</div>
          ) : stats ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <span className="text-sm text-gray-600">Total Employees</span>
                <span className="font-bold text-gray-900">{stats.total_employees}</span>
              </div>
              <div className="flex items-center justify-between bg-green-50 rounded-lg p-3">
                <span className="text-sm text-gray-600">Have Read</span>
                <span className="font-bold text-green-700">{stats.read_count}</span>
              </div>
              {stats.total_employees > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (stats.read_count / stats.total_employees) * 100)}%` }} />
                </div>
              )}
              {stats.read_by?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Who read it</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {stats.read_by.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-100">
                        <span className="text-gray-700">{r.employee_name || r.employee_id}</span>
                        <span className="text-xs text-gray-400">{new Date(r.read_at).toLocaleDateString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : <div className="text-center py-6 text-gray-400">No data</div>}
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Announcements() {
  const [anns, setAnns]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editAnn, setEditAnn]   = useState(null)
  const [statsAnnId, setStatsId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listAnnouncements({ active_only: false, page, page_size: 20 })
      setAnns(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditAnn(null); setShowForm(true) }
  const openEdit = (a) => { setEditAnn(a); setShowForm(true) }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return
    try {
      await hrmService.deleteAnnouncement(id)
      toast.success('Deleted')
      load()
    } catch { toast.error('Failed to delete') }
  }

  const toggleActive = async (a) => {
    try {
      await hrmService.updateAnnouncement(a.id, { is_active: !a.is_active })
      load()
    } catch {}
  }

  const markRead = async (id) => {
    try {
      await hrmService.markAnnouncementRead(id)
      toast.success('Marked as read')
      load()
    } catch {}
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)
        ) : anns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            <Megaphone className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No announcements yet
          </div>
        ) : anns.map(a => {
          const PriorityIcon = PRIORITY_STYLES[a.priority]?.icon || Bell
          return (
            <div key={a.id} className={`bg-white rounded-xl border p-4 flex gap-4 ${a.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[a.announcement_type] || 'bg-gray-100 text-gray-600'}`}>
                    {a.announcement_type}
                  </span>
                  <PriorityIcon className={`w-3.5 h-3.5 ${PRIORITY_STYLES[a.priority]?.cls || 'text-gray-400'}`}
                    title={`Priority: ${a.priority}`} />
                  {a.send_email && <Mail className="w-3.5 h-3.5 text-blue-400" title="Email broadcast" />}
                  {a.requires_acknowledgement && <CheckCircle className="w-3.5 h-3.5 text-green-400" title="Requires acknowledgement" />}
                  <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('en-IN')}</span>
                  {a.read_by?.length > 0 && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {a.read_by.length} read
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900">{a.title}</h3>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{a.body}</p>
                {a.created_by_name && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Users className="w-3 h-3" /> By {a.created_by_name}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-1.5 flex-shrink-0">
                {a.requires_acknowledgement && (
                  <button onClick={() => markRead(a.id)}
                    className="p-1.5 hover:bg-green-50 rounded text-green-500" title="Mark as read">
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setStatsId(a.id)}
                  className="p-1.5 hover:bg-indigo-50 rounded text-indigo-400" title="Read stats">
                  <Eye className="w-4 h-4" />
                </button>
                <button onClick={() => toggleActive(a)}
                  className={`p-1.5 rounded ${a.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                  {a.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => openEdit(a)} className="p-1.5 hover:bg-yellow-50 rounded text-yellow-500">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(a.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">Prev</button>
          <span className="text-sm text-gray-500 self-center">Page {page}</span>
          <button disabled={anns.length < 20} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Next</button>
        </div>
      )}

      <AnnouncementFormModal isOpen={showForm} editAnn={editAnn} onClose={() => setShowForm(false)} onSaved={load} />
      <ReadStatsModal annId={statsAnnId} onClose={() => setStatsId(null)} />
    </div>
  )
}
