import React, { useState, useEffect } from 'react'
import { Plus, Megaphone, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import hrmService from '../../services/hrmService'

const TYPE_COLORS = {
  general:     'bg-blue-100 text-blue-700',
  holiday:     'bg-green-100 text-green-700',
  policy:      'bg-purple-100 text-purple-700',
  urgent:      'bg-red-100 text-red-700',
  event:       'bg-yellow-100 text-yellow-700',
  birthday:    'bg-pink-100 text-pink-700',
  anniversary: 'bg-orange-100 text-orange-700',
}

export default function Announcements() {
  const [anns, setAnns]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editAnn, setEditAnn]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({ title: '', body: '', announcement_type: 'general' })

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

  const openCreate = () => { setForm({ title: '', body: '', announcement_type: 'general' }); setEditAnn(null); setShowForm(true) }
  const openEdit = (a) => { setForm({ title: a.title, body: a.body, announcement_type: a.announcement_type, is_active: a.is_active }); setEditAnn(a); setShowForm(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editAnn) await hrmService.updateAnnouncement(editAnn.id, form)
      else await hrmService.createAnnouncement(form)
      setShowForm(false)
      load()
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return
    await hrmService.deleteAnnouncement(id)
    load()
  }

  const toggleActive = async (a) => {
    await hrmService.updateAnnouncement(a.id, { is_active: !a.is_active })
    load()
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

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleSave} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">{editAnn ? 'Edit Announcement' : 'New Announcement'}</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Title</label>
              <input className="input w-full mt-1" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Body</label>
              <textarea className="input w-full mt-1" rows={4} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select className="input w-full mt-1" value={form.announcement_type} onChange={e => setForm(f => ({ ...f, announcement_type: e.target.value }))}>
                {['general','holiday','policy','urgent','event','birthday','anniversary'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)
        ) : anns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            <Megaphone className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No announcements yet
          </div>
        ) : anns.map(a => (
          <div key={a.id} className={`bg-white rounded-xl border p-4 flex gap-4 ${a.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[a.announcement_type] || ''}`}>{a.announcement_type}</span>
                <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('en-IN')}</span>
              </div>
              <h3 className="font-semibold text-gray-900">{a.title}</h3>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{a.body}</p>
            </div>
            <div className="flex items-start gap-2">
              <button onClick={() => toggleActive(a)} className={`p-1.5 rounded ${a.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                {a.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => openEdit(a)} className="p-1.5 hover:bg-yellow-50 rounded text-yellow-500"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(a.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
