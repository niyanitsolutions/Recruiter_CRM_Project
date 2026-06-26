import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Megaphone, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Loader2, RefreshCw, Bell, Monitor, AlertTriangle, FileText,
  Calendar, Users, Tag, X, Save, ChevronDown,
  BarChart2, Image, Upload, ExternalLink, Clock, Globe,
  CheckCircle2, XCircle, Zap, Eye, EyeOff, Info, Rocket,
  Wrench, Radio, UserCheck, Building2, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import communicationService from '../../services/communicationService'
import RichTextEditor from '../../components/announcements/RichTextEditor'
import SearchableMultiSelect from '../../components/common/SearchableMultiSelect'

// ─── Constants ────────────────────────────────────────────────────────────────

const ANNOUNCEMENT_TYPES = [
  { value: 'marquee',           label: 'Marquee',     icon: Radio,         desc: 'Scrolling ticker at top' },
  { value: 'popup',             label: 'Popup Modal', icon: Bell,          desc: 'Modal after login' },
  { value: 'dashboard_banner',  label: 'Dashboard',   icon: Monitor,       desc: 'Banner in dashboard' },
  { value: 'release_notes',     label: 'Release Notes', icon: Rocket,      desc: 'Version / feature update' },
  { value: 'maintenance_alert', label: 'Maintenance', icon: Wrench,        desc: 'Downtime warning' },
]

const DISPLAY_LOCATIONS = [
  { value: 'login',               label: 'Login Screen',       icon: UserCheck },
  { value: 'dashboard',           label: 'Dashboard',          icon: Monitor },
  { value: 'top_marquee',         label: 'Top Marquee',        icon: Radio },
  { value: 'notification_center', label: 'Notification Center', icon: Bell },
  { value: 'popup',               label: 'Popup Modal',        icon: Megaphone },
]

const PRIORITIES = [
  { value: 'critical', label: 'Critical', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'high',     label: 'High',     color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'medium',   label: 'Medium',   color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'low',      label: 'Low',      color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
]

const AUDIENCE_GROUPS = [
  { value: 'everyone',         label: 'Everyone',             icon: Globe,     desc: 'All tenant users' },
  { value: 'tenant_based',     label: 'Tenant-Based',         icon: Building2, desc: 'Filter by subscription plan' },
  { value: 'user_based',       label: 'User-Based',           icon: UserCheck, desc: 'Target by user role or specific users' },
  { value: 'department_based', label: 'Department-Based',     icon: Users,     desc: 'Filter by department' },
  { value: 'role_based',       label: 'Role-Based',           icon: Tag,       desc: 'Filter by system role slug' },
]

const TENANT_FILTERS = [
  { value: 'all',               label: 'All Tenants' },
  { value: 'trial',             label: 'Trial Users' },
  { value: 'active_subscriber', label: 'Active Subscribers' },
  { value: 'expired',           label: 'Expired' },
  { value: 'enterprise',        label: 'Enterprise Plan' },
  { value: 'professional',      label: 'Professional Plan' },
  { value: 'starter',           label: 'Starter Plan' },
  { value: 'specific',          label: 'Specific Tenant(s)' },
]

const USER_ROLES = [
  'owner', 'admin', 'recruiter', 'hr', 'hiring_manager', 'interviewer', 'employee',
]

const STATUSES = [
  { value: 'published', label: 'Published', color: 'text-green-700 bg-green-50 border-green-200' },
  { value: 'draft',     label: 'Draft',     color: 'text-gray-600 bg-gray-50 border-gray-200' },
]

const TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney',
]

const PRIORITY_BADGES = {
  critical: 'text-red-700 bg-red-50 border-red-200',
  high:     'text-orange-700 bg-orange-50 border-orange-200',
  medium:   'text-amber-700 bg-amber-50 border-amber-200',
  low:      'text-emerald-700 bg-emerald-50 border-emerald-200',
}

const EMPTY_FORM = {
  title:             '',
  description:       '',
  rich_text:         '',
  image_url:         '',
  image_path:        '',
  announcement_type: 'marquee',
  display_locations: [],
  target_audience: {
    audience_groups:  ['everyone'],
    tenant_filter:    'all',
    tenant_ids:       [],
    user_roles:       [],
    specific_user_ids:[],
    departments:      [],
    role_slugs:       [],
    type:             'all',
    roles:            [],
  },
  priority:        'medium',
  status:          'published',
  cta_button_text: '',
  cta_url:         '',
  cta_target:      'new_tab',
  start_date:      '',
  end_date:        '',
  never_expire:    true,
  timezone:        'UTC',
  is_active:       true,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function toInputDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 16) } catch { return '' }
}

function TypeIcon({ type, size = 16 }) {
  const found = ANNOUNCEMENT_TYPES.find(t => t.value === type)
  const Icon = found?.icon || Bell
  return <Icon size={size} />
}

// ─── Image upload area ────────────────────────────────────────────────────────

function ImageUploader({ announcementId, currentPath, currentUrl, onImageChange }) {
  const inputRef   = useRef(null)
  const [uploading, setUploading] = useState(false)
  const preview = currentPath || currentUrl || null

  const handleFile = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext)) {
      toast.error('Invalid file type. Use JPG, PNG, WEBP, or SVG.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large (max 5 MB)')
      return
    }

    if (announcementId) {
      // Upload immediately if announcement exists
      setUploading(true)
      try {
        const res = await communicationService.uploadImage(announcementId, file)
        onImageChange(res.data.image_path, '')
        toast.success('Image uploaded')
      } catch {
        toast.error('Image upload failed')
      } finally {
        setUploading(false)
      }
    } else {
      // Announcement not saved yet — store as local object URL; upload after save
      const localUrl = URL.createObjectURL(file)
      onImageChange('', localUrl, file)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  const handleRemove = async () => {
    if (announcementId && currentPath) {
      try { await communicationService.removeImage(announcementId) } catch {}
    }
    onImageChange('', '')
  }

  if (preview) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
        <img
          src={preview.startsWith('blob:') ? preview : preview}
          alt="Announcement"
          className="w-full h-44 object-cover"
        />
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="p-1.5 bg-white/90 hover:bg-white rounded-lg shadow text-gray-700 text-xs flex items-center gap-1"
          >
            <Upload size={12} /> Replace
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="p-1.5 bg-red-500/90 hover:bg-red-600 rounded-lg shadow text-white text-xs flex items-center gap-1"
          >
            <X size={12} /> Remove
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.svg" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-lg p-6 text-center cursor-pointer transition-colors bg-gray-50 hover:bg-indigo-50/30"
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={24} className="text-indigo-500 animate-spin" />
          <span className="text-sm text-gray-500">Uploading…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Image size={28} className="text-gray-400" />
          <p className="text-sm font-medium text-gray-600">Click or drag to upload</p>
          <p className="text-xs text-gray-400">JPG, PNG, WEBP, SVG — max 5 MB</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.svg" className="hidden" onChange={e => handleFile(e.target.files[0])} />
    </div>
  )
}

// ─── Audience editor ──────────────────────────────────────────────────────────

function AudienceEditor({ value, onChange }) {
  const groups = value.audience_groups || ['everyone']

  const toggleGroup = (g) => {
    if (g === 'everyone') {
      onChange({ ...value, audience_groups: ['everyone'] })
      return
    }
    const current = groups.filter(x => x !== 'everyone')
    if (current.includes(g)) {
      const next = current.filter(x => x !== g)
      onChange({ ...value, audience_groups: next.length ? next : ['everyone'] })
    } else {
      onChange({ ...value, audience_groups: [...current, g] })
    }
  }

  const set = (key, val) => onChange({ ...value, [key]: val })

  const searchTenants = async (q) => {
    try {
      const res = await communicationService.searchTenants(q)
      return (res.data?.tenants || []).map(t => ({ id: t.company_id || t.id, label: t.company_name }))
    } catch { return [] }
  }

  const selectedTenants = (value.tenant_ids || []).map(id => ({ id, label: id }))

  return (
    <div className="space-y-3">
      {/* Group selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {AUDIENCE_GROUPS.map(g => {
          const active = groups.includes(g.value)
          const Icon = g.icon
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => toggleGroup(g.value)}
              className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                active
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                {active && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <div className={`text-sm font-medium ${active ? 'text-indigo-800' : 'text-gray-700'}`}>
                  {g.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{g.desc}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Tenant-based options */}
      {groups.includes('tenant_based') && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Tenant Filter</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {TENANT_FILTERS.map(f => (
              <label key={f.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tenant_filter"
                  value={f.value}
                  checked={(value.tenant_filter || 'all') === f.value}
                  onChange={() => set('tenant_filter', f.value)}
                  className="accent-blue-600"
                />
                <span className="text-xs text-gray-700">{f.label}</span>
              </label>
            ))}
          </div>

          {value.tenant_filter === 'specific' && (
            <SearchableMultiSelect
              placeholder="Search tenants…"
              selected={selectedTenants}
              onChange={(items) => set('tenant_ids', items.map(i => i.id))}
              onSearch={(q) => searchTenants(q).then(items => ({ items }))}
            />
          )}
        </div>
      )}

      {/* User-based options */}
      {groups.includes('user_based') && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-3">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">User Roles</p>
          <div className="flex flex-wrap gap-1.5">
            {USER_ROLES.map(r => {
              const active = (value.user_roles || []).includes(r)
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    const cur = value.user_roles || []
                    set('user_roles', active ? cur.filter(x => x !== r) : [...cur, r])
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    active
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                  }`}
                >
                  {r.replace('_', ' ')}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Department-based */}
      {groups.includes('department_based') && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <label className="block text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
            Departments (comma-separated)
          </label>
          <input
            type="text"
            value={(value.departments || []).join(', ')}
            onChange={e => set('departments', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="e.g. Engineering, HR, Sales"
            className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
          />
        </div>
      )}

      {/* Role slug-based */}
      {groups.includes('role_based') && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
          <label className="block text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">
            Role Slugs (comma-separated)
          </label>
          <input
            type="text"
            value={(value.role_slugs || []).join(', ')}
            onChange={e => set('role_slugs', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="e.g. admin, hr, candidate_coordinator"
            className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
      )}
    </div>
  )
}

// ─── Announcement Form Modal ───────────────────────────────────────────────────

function AnnouncementForm({ initial, onSave, onClose }) {
  const isEdit    = !!initial?.id
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM }
    return {
      ...EMPTY_FORM,
      ...initial,
      start_date:   toInputDate(initial.start_date),
      end_date:     toInputDate(initial.end_date),
      display_locations: initial.display_locations || [],
      target_audience: {
        ...EMPTY_FORM.target_audience,
        ...(initial.target_audience || {}),
      },
    }
  })
  const [saving,     setSaving]     = useState(false)
  const [errors,     setErrors]     = useState({})
  const [pendingFile, setPendingFile] = useState(null) // file to upload after create

  const set    = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setTA  = (ta)   => setForm(p => ({ ...p, target_audience: ta }))

  const toggleLocation = (loc) => {
    setForm(p => {
      const locs = p.display_locations || []
      return { ...p, display_locations: locs.includes(loc) ? locs.filter(l => l !== loc) : [...locs, loc] }
    })
  }

  const handleImageChange = (path, url, file = null) => {
    setForm(p => ({ ...p, image_path: path, image_url: url }))
    if (file) setPendingFile(file)
    else setPendingFile(null)
  }

  const validate = () => {
    const e = {}
    if (!form.title.trim())              e.title = 'Title is required'
    if (!form.announcement_type)         e.type  = 'Type is required'
    if (!form.display_locations.length)  e.locs  = 'Select at least one display location'
    if (form.cta_url && !/^https?:\/\//i.test(form.cta_url)) e.cta_url = 'URL must start with http:// or https://'
    if (form.start_date && form.end_date && new Date(form.start_date) > new Date(form.end_date))
      e.dates = 'End date must be after start date'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e, saveAs = null) => {
    e?.preventDefault?.()
    if (!validate()) return

    setSaving(true)
    try {
      const payload = {
        ...form,
        status:     saveAs || form.status,
        is_active:  (saveAs || form.status) === 'published' && form.is_active,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date:   form.never_expire ? null : (form.end_date ? new Date(form.end_date).toISOString() : null),
        target_audience: {
          ...form.target_audience,
          type: form.target_audience.tenant_filter || form.target_audience.type || 'all',
        },
      }

      let res
      if (isEdit) {
        res = await communicationService.update(initial.id, payload)
      } else {
        res = await communicationService.create(payload)
      }

      const saved = res.data?.announcement || res.data

      // Upload pending image after announcement is created
      if (pendingFile && saved?.id) {
        try {
          const imgRes = await communicationService.uploadImage(saved.id, pendingFile)
          saved.image_path = imgRes.data?.image_path || saved.image_path
        } catch {
          toast.error('Announcement saved, but image upload failed.')
        }
      }

      toast.success(isEdit ? 'Announcement updated.' : 'Announcement created.')
      onSave(saved)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const Err = ({ field }) =>
    errors[field] ? <p className="text-xs text-red-600 mt-1">{errors[field]}</p> : null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-6 flex flex-col max-h-[94vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Megaphone size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isEdit ? 'Edit Announcement' : 'Create Announcement'}
              </h2>
              <p className="text-xs text-gray-500">Broadcast to tenant users</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* ── Two-column body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-full">

            {/* ── LEFT COLUMN: Content ── */}
            <div className="p-6 border-r border-gray-100 space-y-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Content</h3>

              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Announcement Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ANNOUNCEMENT_TYPES.map(t => {
                    const Icon = t.icon
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => { set('announcement_type', t.value); if (errors.type) setErrors(p => ({ ...p, type: '' })) }}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all text-xs ${
                          form.announcement_type === t.value
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="font-medium">{t.label}</span>
                      </button>
                    )
                  })}
                </div>
                <Err field="type" />
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={e => { set('title', e.target.value); if (errors.title) setErrors(p => ({ ...p, title: '' })) }}
                  placeholder="e.g. New Feature Release: v2.5.0"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${errors.title ? 'border-red-400' : 'border-gray-300'}`}
                />
                <Err field="title" />
              </div>

              {/* Short description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={2}
                  placeholder="Brief summary shown in list view…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              {/* Rich text body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body Content</label>
                <RichTextEditor
                  value={form.rich_text}
                  onChange={v => set('rich_text', v)}
                  placeholder="Full announcement content with formatting…"
                  minHeight="150px"
                />
              </div>

              {/* Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image <span className="text-xs text-gray-400">(optional)</span>
                </label>
                <ImageUploader
                  announcementId={isEdit ? initial?.id : null}
                  currentPath={form.image_path}
                  currentUrl={form.image_url}
                  onImageChange={handleImageChange}
                />
                {!form.image_path && (
                  <div className="mt-2">
                    <input
                      type="url"
                      value={form.image_url}
                      onChange={e => set('image_url', e.target.value)}
                      placeholder="Or paste an image URL…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Call to Action (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Button Text</label>
                    <input
                      value={form.cta_button_text}
                      onChange={e => set('cta_button_text', e.target.value)}
                      placeholder="Learn More"
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Open In</label>
                    <select
                      value={form.cta_target}
                      onChange={e => set('cta_target', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
                    >
                      <option value="same_tab">Same tab</option>
                      <option value="new_tab">New tab</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Button URL</label>
                  <input
                    type="url"
                    value={form.cta_url}
                    onChange={e => { set('cta_url', e.target.value); if (errors.cta_url) setErrors(p => ({ ...p, cta_url: '' })) }}
                    placeholder="https://…"
                    className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${errors.cta_url ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  <Err field="cta_url" />
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Settings ── */}
            <div className="p-6 space-y-5 bg-gray-50/50">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Settings</h3>

              {/* Priority + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <div className="space-y-1.5">
                    {PRIORITIES.map(p => (
                      <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="priority"
                          value={p.value}
                          checked={form.priority === p.value}
                          onChange={() => set('priority', p.value)}
                          className="accent-indigo-600"
                        />
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${p.color}`}>
                          {p.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <div className="space-y-1.5">
                    {STATUSES.map(s => (
                      <label key={s.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="status"
                          value={s.value}
                          checked={form.status === s.value}
                          onChange={() => set('status', s.value)}
                          className="accent-indigo-600"
                        />
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.color}`}>
                          {s.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Display Locations */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Locations <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {DISPLAY_LOCATIONS.map(loc => {
                    const Icon = loc.icon
                    const active = (form.display_locations || []).includes(loc.value)
                    return (
                      <label key={loc.value} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${active ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => { toggleLocation(loc.value); if (errors.locs) setErrors(p => ({ ...p, locs: '' })) }}
                          className="accent-indigo-600"
                        />
                        <Icon size={14} className={active ? 'text-indigo-600' : 'text-gray-400'} />
                        <span className={`text-sm ${active ? 'text-indigo-800 font-medium' : 'text-gray-600'}`}>{loc.label}</span>
                      </label>
                    )
                  })}
                </div>
                <Err field="locs" />
              </div>

              {/* Schedule */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock size={13} /> Schedule
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                    <input
                      type="datetime-local"
                      value={form.start_date}
                      onChange={e => { set('start_date', e.target.value); if (errors.dates) setErrors(p => ({ ...p, dates: '' })) }}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      End Date
                      {form.never_expire && <span className="ml-1 text-gray-400">(ignored)</span>}
                    </label>
                    <input
                      type="datetime-local"
                      value={form.end_date}
                      disabled={form.never_expire}
                      onChange={e => { set('end_date', e.target.value); if (errors.dates) setErrors(p => ({ ...p, dates: '' })) }}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
                    />
                  </div>
                </div>
                <Err field="dates" />

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.never_expire}
                    onChange={e => set('never_expire', e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-600">Never expire</span>
                </label>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Timezone</label>
                  <select
                    value={form.timezone}
                    onChange={e => set('timezone', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
                  >
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Audience
                </label>
                <AudienceEditor
                  value={form.target_audience}
                  onChange={setTA}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Sticky Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white flex-shrink-0 rounded-b-2xl gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {!isEdit && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSubmit(null, 'draft')}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save size={14} /> Save Draft
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit(null, 'published')}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {isEdit ? 'Save Changes' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Analytics mini-badge ─────────────────────────────────────────────────────

function AnalyticsBadges({ analytics }) {
  if (!analytics) return null
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="flex items-center gap-1" title="Views"><Eye size={11} /> {analytics.views || 0}</span>
      <span className="flex items-center gap-1" title="Dismissals"><XCircle size={11} /> {analytics.dismiss_count || 0}</span>
      <span className="flex items-center gap-1" title="CTA clicks"><ExternalLink size={11} /> {analytics.cta_clicks || 0}</span>
    </div>
  )
}

// ─── Announcement Card ────────────────────────────────────────────────────────

function AnnouncementCard({ item, onEdit, onDelete, onToggle, isDeleting }) {
  const priorityClass = PRIORITY_BADGES[item.priority] || PRIORITY_BADGES.low
  const TypeIconComp  = ANNOUNCEMENT_TYPES.find(t => t.value === item.announcement_type)?.icon || Bell
  const imgSrc        = item.image_path || item.image_url || null

  return (
    <div className={`bg-white rounded-2xl border transition-all hover:shadow-md ${item.is_active ? 'border-gray-200' : 'border-gray-100 opacity-70'}`}>
      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {imgSrc ? (
              <img src={imgSrc} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <TypeIconComp size={20} className="text-indigo-600" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{item.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description || (item.rich_text ? 'Rich content' : '')}</p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${priorityClass}`}>
              {item.priority}
            </span>
            {item.status === 'draft' && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                draft
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="px-4 pb-3 flex flex-wrap gap-x-3 gap-y-1">
        {(item.display_locations || []).map(loc => (
          <span key={loc} className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{loc.replace('_', ' ')}</span>
        ))}
      </div>

      {/* Analytics */}
      <div className="px-4 pb-3">
        <AnalyticsBadges analytics={item.analytics} />
      </div>

      {/* Schedule */}
      {(item.start_date || (!item.never_expire && item.end_date)) && (
        <div className="px-4 pb-3 flex items-center gap-1 text-xs text-gray-400">
          <Calendar size={11} />
          <span>
            {item.start_date ? formatDate(item.start_date) : 'Now'}
            {' → '}
            {item.never_expire ? 'Never expires' : (item.end_date ? formatDate(item.end_date) : '—')}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={() => onToggle(item)}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            item.is_active
              ? 'text-green-700 bg-green-50 hover:bg-green-100'
              : 'text-gray-500 bg-gray-100 hover:bg-gray-200'
          }`}
        >
          {item.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          {item.is_active ? 'Active' : 'Inactive'}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(item)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            disabled={isDeleting === item.id}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            {isDeleting === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommunicationCenter() {
  const [items,      setItems]      = useState([])
  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [formOpen,   setFormOpen]   = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [deleting,   setDeleting]   = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes] = await Promise.all([
        communicationService.list({ limit: 200 }),
        communicationService.getStats(),
      ])
      setItems(listRes.data?.items || [])
      setStats(statsRes.data)
    } catch {
      toast.error('Failed to load announcements.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = (saved) => {
    setItems(prev => {
      const idx = prev.findIndex(x => x.id === saved.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n }
      return [saved, ...prev]
    })
    setFormOpen(false)
    setEditing(null)
    load() // refresh stats
  }

  const handleEdit = (item) => { setEditing(item); setFormOpen(true) }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return
    setDeleting(id)
    try {
      await communicationService.delete(id)
      setItems(prev => prev.filter(x => x.id !== id))
      toast.success('Announcement deleted.')
      load()
    } catch {
      toast.error('Delete failed.')
    } finally {
      setDeleting(null)
    }
  }

  const handleToggle = async (item) => {
    try {
      const res = await communicationService.toggle(item.id, !item.is_active)
      const updated = res.data?.announcement || res.data
      setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
    } catch {
      toast.error('Toggle failed.')
    }
  }

  const filtered = items.filter(item => {
    if (typeFilter !== 'all' && item.announcement_type !== typeFilter) return false
    if (statusFilter === 'active' && !item.is_active) return false
    if (statusFilter === 'inactive' && item.is_active) return false
    if (statusFilter === 'draft' && item.status !== 'draft') return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="text-indigo-500" size={24} />
            Communication Center
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Broadcast announcements to all tenants</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setEditing(null); setFormOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus size={16} /> New Announcement
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total',     value: stats.total,    color: 'text-gray-700 bg-gray-50 border-gray-200' },
            { label: 'Active',    value: stats.active,   color: 'text-green-700 bg-green-50 border-green-200' },
            { label: 'Draft',     value: stats.draft,    color: 'text-gray-600 bg-gray-50 border-gray-200' },
            { label: 'Critical',  value: stats.critical, color: 'text-red-700 bg-red-50 border-red-200' },
            { label: 'Scheduled', value: stats.scheduled,color: 'text-blue-700 bg-blue-50 border-blue-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.color}`}>
              <p className="text-2xl font-bold">{s.value ?? 0}</p>
              <p className="text-xs font-medium opacity-80 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type filter */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${typeFilter === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            All Types
          </button>
          {ANNOUNCEMENT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${typeFilter === t.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {['all', 'active', 'inactive', 'draft'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${statusFilter === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Megaphone size={48} className="text-gray-200 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-400">No announcements found</p>
          <p className="text-sm text-gray-400 mt-1">Create your first announcement to get started.</p>
          <button
            onClick={() => { setEditing(null); setFormOpen(true) }}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} className="inline mr-1" /> Create Announcement
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => (
            <AnnouncementCard
              key={item.id}
              item={item}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
              isDeleting={deleting}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {formOpen && (
        <AnnouncementForm
          initial={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
