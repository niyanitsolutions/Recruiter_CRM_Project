import { useState, useEffect, useCallback } from 'react'
import {
  Megaphone, Plus, Pencil, Trash2, CheckCircle2, XCircle,
  Loader2, RefreshCw, Bell, Monitor, AlertTriangle, FileText,
  Calendar, Users, Tag, Eye, EyeOff, ChevronDown, X, Save,
  Zap, BarChart2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import communicationService from '../../services/communicationService'

// ─── Constants ────────────────────────────────────────────────────────────────

const ANNOUNCEMENT_TYPES = [
  { value: 'marquee',          label: 'Scrolling Marquee',  icon: '📢', desc: 'Scrolling ticker at top of dashboard' },
  { value: 'popup',            label: 'Popup Banner',       icon: '🎉', desc: 'Modal shown immediately after login' },
  { value: 'dashboard_banner', label: 'Dashboard Banner',   icon: '📌', desc: 'Banner inside tenant dashboard' },
  { value: 'release_notes',    label: 'Release Notes',      icon: '🚀', desc: 'Version/feature release information' },
  { value: 'maintenance_alert',label: 'Maintenance Alert',  icon: '🔧', desc: 'Scheduled downtime notification' },
]

const PRIORITIES = [
  { value: 'critical', label: 'Critical', color: 'text-red-700 bg-red-100 border-red-200' },
  { value: 'high',     label: 'High',     color: 'text-orange-700 bg-orange-100 border-orange-200' },
  { value: 'medium',   label: 'Medium',   color: 'text-amber-700 bg-amber-100 border-amber-200' },
  { value: 'low',      label: 'Low',      color: 'text-emerald-700 bg-emerald-100 border-emerald-200' },
]

const DISPLAY_LOCATIONS = [
  { value: 'login',               label: 'Login Screen' },
  { value: 'dashboard',           label: 'Dashboard' },
  { value: 'top_marquee',         label: 'Top Marquee' },
  { value: 'notification_center', label: 'Notification Center' },
  { value: 'popup',               label: 'Popup Modal' },
]

const AUDIENCE_TYPES = [
  { value: 'all',               label: 'All Tenants' },
  { value: 'trial',             label: 'Trial Tenants' },
  { value: 'active_subscriber', label: 'Active Subscribers' },
  { value: 'expired',           label: 'Expired Subscribers' },
  { value: 'enterprise',        label: 'Enterprise Plan' },
  { value: 'professional',      label: 'Professional Plan' },
  { value: 'starter',           label: 'Starter Plan' },
  { value: 'specific',          label: 'Specific Tenant(s)' },
]

const PRIORITY_COLORS = {
  critical: 'text-red-700 bg-red-50 border-red-200',
  high:     'text-orange-700 bg-orange-50 border-orange-200',
  medium:   'text-amber-700 bg-amber-50 border-amber-200',
  low:      'text-emerald-700 bg-emerald-50 border-emerald-200',
}

const TYPE_ICONS = {
  marquee:           '📢',
  popup:             '🎉',
  dashboard_banner:  '📌',
  release_notes:     '🚀',
  maintenance_alert: '🔧',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toLocalInputDate(iso) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

// ─── Form modal ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '',
  description: '',
  rich_text: '',
  image_url: '',
  announcement_type: 'marquee',
  display_locations: [],
  target_audience: { type: 'all', tenant_ids: [], roles: ['all'] },
  priority: 'medium',
  cta_button_text: '',
  cta_url: '',
  start_date: null,
  end_date: null,
  is_active: true,
}

function AnnouncementForm({ initial, onSave, onClose }) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState(() => initial ? {
    ...EMPTY_FORM,
    ...initial,
    start_date: initial.start_date ? toLocalInputDate(initial.start_date) : '',
    end_date:   initial.end_date   ? toLocalInputDate(initial.end_date)   : '',
    display_locations: initial.display_locations || [],
    target_audience: initial.target_audience || EMPTY_FORM.target_audience,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }))
  const setAudience = (key, val) => setForm(p => ({ ...p, target_audience: { ...p.target_audience, [key]: val } }))

  const toggleLocation = (loc) => {
    setForm(p => {
      const locs = p.display_locations || []
      return {
        ...p,
        display_locations: locs.includes(loc) ? locs.filter(l => l !== loc) : [...locs, loc],
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required.'); return }
    if (!form.announcement_type) { toast.error('Type is required.'); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date:   form.end_date   ? new Date(form.end_date).toISOString()   : null,
      }
      const res = isEdit
        ? await communicationService.update(initial.id, payload)
        : await communicationService.create(payload)
      toast.success(isEdit ? 'Announcement updated.' : 'Announcement created.')
      onSave(res.data.announcement || res.data)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-200">
          <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary-500" />
            {isEdit ? 'Edit Announcement' : 'New Announcement'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-surface-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Type */}
          <div>
            <label className="form-label">Announcement Type *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ANNOUNCEMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('announcement_type', t.value)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left text-sm transition-colors ${
                    form.announcement_type === t.value
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="form-label">Title *</label>
            <input
              type="text"
              className="input-field"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Announcement title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Description</label>
            <textarea
              className="input-field min-h-[80px] resize-none"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Short description shown in notification center"
            />
          </div>

          {/* Rich text body */}
          <div>
            <label className="form-label">Body / Rich Text (HTML supported)</label>
            <textarea
              className="input-field min-h-[100px] resize-y font-mono text-sm"
              value={form.rich_text}
              onChange={e => set('rich_text', e.target.value)}
              placeholder="<p>Full announcement body with <strong>HTML</strong> support.</p>"
            />
          </div>

          {/* Image URL */}
          <div>
            <label className="form-label">Image URL (Optional)</label>
            <input
              type="url"
              className="input-field"
              value={form.image_url}
              onChange={e => set('image_url', e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* CTA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">CTA Button Text</label>
              <input
                type="text"
                className="input-field"
                value={form.cta_button_text}
                onChange={e => set('cta_button_text', e.target.value)}
                placeholder="Learn More"
              />
            </div>
            <div>
              <label className="form-label">CTA URL</label>
              <input
                type="url"
                className="input-field"
                value={form.cta_url}
                onChange={e => set('cta_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Priority + Active */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Priority</label>
              <div className="relative">
                <select
                  className="input-field appearance-none pr-8"
                  value={form.priority}
                  onChange={e => set('priority', e.target.value)}
                >
                  {PRIORITIES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary-500"
                  checked={form.is_active}
                  onChange={e => set('is_active', e.target.checked)}
                />
                <span className="text-sm font-medium text-surface-700">Active</span>
              </label>
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Start Date / Time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={form.start_date || ''}
                onChange={e => set('start_date', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">End Date / Time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={form.end_date || ''}
                onChange={e => set('end_date', e.target.value)}
              />
            </div>
          </div>

          {/* Display locations */}
          <div>
            <label className="form-label">Display Locations</label>
            <div className="flex flex-wrap gap-2">
              {DISPLAY_LOCATIONS.map(loc => (
                <button
                  key={loc.value}
                  type="button"
                  onClick={() => toggleLocation(loc.value)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    (form.display_locations || []).includes(loc.value)
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-surface-200 text-surface-600 hover:border-surface-300'
                  }`}
                >
                  {loc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target audience */}
          <div>
            <label className="form-label">Target Audience</label>
            <div className="relative">
              <select
                className="input-field appearance-none pr-8"
                value={form.target_audience?.type || 'all'}
                onChange={e => setAudience('type', e.target.value)}
              >
                {AUDIENCE_TYPES.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
            </div>
            {form.target_audience?.type === 'specific' && (
              <div className="mt-2">
                <label className="form-label">Tenant IDs (comma-separated)</label>
                <input
                  type="text"
                  className="input-field"
                  value={(form.target_audience?.tenant_ids || []).join(', ')}
                  onChange={e => setAudience('tenant_ids', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="tenant-id-1, tenant-id-2"
                />
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-700 border border-surface-300 rounded-xl hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Announcement card ────────────────────────────────────────────────────────

function AnnouncementCard({ item, onEdit, onDelete, onToggle }) {
  const [actionLoading, setActionLoading] = useState(false)

  const handleToggle = async () => {
    setActionLoading(true)
    await onToggle(item)
    setActionLoading(false)
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this announcement?')) return
    setActionLoading(true)
    await onDelete(item.id)
    setActionLoading(false)
  }

  const pColor = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-opacity ${item.is_active ? '' : 'opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl flex-shrink-0">{TYPE_ICONS[item.announcement_type] || '📢'}</span>
            <div className="min-w-0">
              <p className="font-semibold text-surface-900 text-sm truncate">{item.title}</p>
              <p className="text-xs text-surface-400 truncate mt-0.5">{item.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${pColor}`}>
              {item.priority}
            </span>
            {item.is_active
              ? <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Active</span>
              : <span className="text-xs text-surface-500 bg-surface-50 border border-surface-200 px-2 py-0.5 rounded-full">Inactive</span>
            }
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-surface-400">
          <span className="flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {ANNOUNCEMENT_TYPES.find(t => t.value === item.announcement_type)?.label || item.announcement_type}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {AUDIENCE_TYPES.find(a => a.value === item.target_audience?.type)?.label || 'All'}
          </span>
          {(item.start_date || item.end_date) && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {item.start_date ? formatDate(item.start_date) : '—'} → {item.end_date ? formatDate(item.end_date) : 'No end'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 py-2 bg-surface-50 border-t border-surface-100">
        <button
          onClick={() => onEdit(item)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-surface-600 hover:bg-surface-200 rounded-lg transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
        <button
          onClick={handleToggle}
          disabled={actionLoading}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-surface-600 hover:bg-surface-200 rounded-lg transition-colors disabled:opacity-50"
        >
          {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : item.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {item.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={handleDelete}
          disabled={actionLoading}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 ml-auto"
        >
          {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Delete
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TYPE_FILTER_OPTIONS = [{ value: '', label: 'All Types' }, ...ANNOUNCEMENT_TYPES.map(t => ({ value: t.value, label: t.label }))]

export default function CommunicationCenter() {
  const [loading, setLoading]         = useState(true)
  const [items, setItems]             = useState([])
  const [stats, setStats]             = useState(null)
  const [typeFilter, setTypeFilter]   = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [editItem, setEditItem]       = useState(null)
  const [activeTab, setActiveTab]     = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (typeFilter) params.announcement_type = typeFilter
      if (activeFilter !== '') params.is_active = activeFilter === 'true'
      const [listRes, statsRes] = await Promise.all([
        communicationService.list(params),
        communicationService.getStats(),
      ])
      setItems(listRes.data.items || [])
      setStats(statsRes.data)
    } catch {
      toast.error('Failed to load announcements.')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, activeFilter])

  useEffect(() => { load() }, [load])

  const handleSaved = (saved) => {
    setShowForm(false)
    setEditItem(null)
    load()
  }

  const handleEdit = (item) => {
    setEditItem(item)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    try {
      await communicationService.delete(id)
      toast.success('Announcement deleted.')
      load()
    } catch {
      toast.error('Delete failed.')
    }
  }

  const handleToggle = async (item) => {
    try {
      await communicationService.toggle(item.id)
      toast.success(item.is_active ? 'Deactivated.' : 'Activated.')
      load()
    } catch {
      toast.error('Toggle failed.')
    }
  }

  const filteredItems = activeTab === 'all'
    ? items
    : items.filter(i => i.announcement_type === activeTab)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <Megaphone className="w-7 h-7 text-primary-500" />
            Communication Center
          </h1>
          <p className="text-surface-500 mt-1">
            Broadcast announcements, banners, and updates to all tenants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setEditItem(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total',     value: stats.total,     color: 'text-surface-700', bg: 'bg-surface-50' },
            { label: 'Active',    value: stats.active,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'Critical',  value: stats.critical,  color: 'text-red-700',     bg: 'bg-red-50' },
            { label: 'Scheduled', value: stats.scheduled, color: 'text-blue-700',    bg: 'bg-blue-50' },
            { label: 'Expired',   value: stats.expired,   color: 'text-surface-500', bg: 'bg-surface-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-surface-100`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
              <p className="text-xs text-surface-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Type tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-surface-200">
        {[{ value: 'all', label: 'All', icon: '📋' }, ...ANNOUNCEMENT_TYPES].map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === tab.value
                ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.value !== 'all' && stats?.by_type?.[tab.value] ? (
              <span className="text-xs bg-surface-100 text-surface-500 px-1.5 py-0.5 rounded-full">
                {stats.by_type[tab.value]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Active filter ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-surface-500">Show:</span>
        {[['', 'All'], ['true', 'Active'], ['false', 'Inactive']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setActiveFilter(val)}
            className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
              activeFilter === val
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-surface-200 text-surface-500 hover:border-surface-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 text-surface-400">
          <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No announcements found</p>
          <p className="text-sm mt-1">Create your first announcement to reach tenants.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map(item => (
            <AnnouncementCard
              key={item.id}
              item={item}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* ── Form modal ─────────────────────────────────────────────────────── */}
      {showForm && (
        <AnnouncementForm
          initial={editItem}
          onSave={handleSaved}
          onClose={() => { setShowForm(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}
