import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Edit2, Trash2, Download, Upload, Copy,
  CalendarDays, RefreshCw, Search, AlertCircle, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import usePermissions from '../../hooks/usePermissions'
import { publish, LIVE_TOPICS } from '../../utils/liveUpdateBus'

const HOLIDAY_TYPES = [
  { value: 'national', label: 'National Holiday',  color: '#ef4444' },
  { value: 'festival', label: 'Festival Holiday',  color: '#f59e0b' },
  { value: 'company',  label: 'Company Holiday',   color: '#3b82f6' },
  { value: 'optional', label: 'Optional Holiday',  color: '#8b5cf6' },
]
const TYPE_MAP = Object.fromEntries(HOLIDAY_TYPES.map(t => [t.value, t]))

const CURRENT_YEAR = new Date().getFullYear()

function TypeBadge({ type }) {
  const t = TYPE_MAP[type] || TYPE_MAP.company
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: t.color + '22', color: t.color }}>
      {t.label}
    </span>
  )
}

function HolidayForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: '', date: '', holiday_type: 'national',
    description: '', is_paid: true, is_recurring: false,
    ...initial,
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
          {initial ? 'Edit Holiday' : 'Add Holiday'}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Holiday Name *
            </label>
            <input className="input w-full" value={form.name}
                   onChange={e => set('name', e.target.value)} placeholder="e.g. Independence Day" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Date *</label>
            <input type="date" className="input w-full" value={form.date}
                   onChange={e => set('date', e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Type</label>
            <select className="input w-full" value={form.holiday_type}
                    onChange={e => set('holiday_type', e.target.value)}>
              {HOLIDAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Description
            </label>
            <textarea className="input w-full resize-none" rows={2} value={form.description || ''}
                      onChange={e => set('description', e.target.value)} placeholder="Optional notes..." />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="is_paid" checked={form.is_paid}
                   onChange={e => set('is_paid', e.target.checked)}
                   className="w-4 h-4 accent-blue-500" />
            <label htmlFor="is_paid" className="text-sm" style={{ color: 'var(--text-body)' }}>Paid Holiday</label>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="is_recurring" checked={form.is_recurring}
                   onChange={e => set('is_recurring', e.target.checked)}
                   className="w-4 h-4 accent-blue-500" />
            <label htmlFor="is_recurring" className="text-sm" style={{ color: 'var(--text-body)' }}>
              Recurring Every Year
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name || !form.date}
            className="btn-primary flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? 'Update' : 'Add Holiday'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HolidayManagement() {
  const { has } = usePermissions()
  const canManage = has('hrm:attendance:manage')
  const [year, setYear] = useState(CURRENT_YEAR)
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [modal, setModal] = useState(null)   // null | 'create' | holiday-obj (edit)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const fileRef = useRef()

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listHolidays({ year, page_size: 200 })
      setHolidays(res.data?.items || res.data || [])
    } catch { toast.error('Failed to load holidays') }
    setLoading(false)
  }

  useEffect(() => { load() }, [year])

  const filtered = holidays.filter(h => {
    if (typeFilter && h.holiday_type !== typeFilter) return false
    if (search && !h.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (modal?.id) {
        await hrmService.updateHoliday(modal.id, form)
        toast.success('Holiday updated')
      } else {
        await hrmService.createHoliday(form)
        toast.success('Holiday added')
      }
      setModal(null)
      load()
      publish(LIVE_TOPICS.CALENDAR)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save holiday')
    }
    setSaving(false)
  }

  const handleDelete = async (h) => {
    if (!confirm(`Delete "${h.name}"?`)) return
    setDeleting(h.id)
    try {
      await hrmService.deleteHoliday(h.id)
      toast.success('Holiday deleted')
      load()
      publish(LIVE_TOPICS.CALENDAR)
    } catch { toast.error('Failed to delete holiday') }
    setDeleting(null)
  }

  const handleCopyNextYear = async () => {
    try {
      const res = await hrmService.copyHolidaysToNextYear()
      toast.success(`${res.data.created} holidays copied to ${res.data.year}`)
      publish(LIVE_TOPICS.CALENDAR)
    } catch { toast.error('Copy failed') }
  }

  const handleExport = async () => {
    try {
      const res = await hrmService.exportHolidaysCsv(year)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = `holidays_${year}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      // Pass the selected year so year-less dates (e.g. "26-Jan") resolve correctly.
      const res = await hrmService.importHolidaysCsv(formData, year)
      const d = res.data
      const created = d.created ?? d.created_count ?? 0
      const skipped = d.skipped ?? d.skipped_count ?? 0
      if (created > 0) {
        toast.success(`Imported ${created} holiday${created !== 1 ? 's' : ''}${skipped ? `, ${skipped} skipped` : ''}`)
      } else {
        toast(`No new holidays imported${skipped ? ` — ${skipped} row(s) skipped` : ''}`, { icon: 'ℹ️' })
      }
      if (d.errors?.length) {
        console.warn('Holiday import — skipped rows:', d.errors)
        const preview = d.errors.slice(0, 3).join('\n')
        toast.error(
          `${d.errors.length} row(s) skipped:\n${preview}${d.errors.length > 3 ? '\n…see console for the rest' : ''}`,
          { duration: 6000 },
        )
      }
      load()
      publish(LIVE_TOPICS.CALENDAR)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Import failed')
    }
    e.target.value = ''
  }

  const dayOfWeek = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Holiday Management</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} holidays in {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year selector */}
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input text-sm"
          >
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {canManage && (
            <>
              <button onClick={handleCopyNextYear} title="Copy recurring to next year"
                      className="btn-secondary flex items-center gap-1.5 text-sm">
                <Copy className="w-4 h-4" /> Copy to {year + 1}
              </button>
              <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-sm">
                <Download className="w-4 h-4" /> Export
              </button>
              <button onClick={() => fileRef.current?.click()}
                      className="btn-secondary flex items-center gap-1.5 text-sm">
                <Upload className="w-4 h-4" /> Import
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
              </button>
              <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-1.5 text-sm">
                <Plus className="w-4 h-4" /> Add Holiday
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input className="input w-full pl-9 text-sm" placeholder="Search holidays..."
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {HOLIDAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={load} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* CSV template hint */}
      {canManage && (
        <div className="text-xs p-3 rounded-lg flex items-start gap-2"
             style={{ background: 'var(--bg-info)', color: 'var(--text-info)', border: '1px solid var(--border-card)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            CSV import format: <strong>name, date (YYYY-MM-DD), type (national/festival/company/optional),
            description, is_paid (true/false), is_recurring (true/false)</strong>
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
            <p style={{ color: 'var(--text-muted)' }}>No holidays found for {year}</p>
            {canManage && (
              <button onClick={() => setModal('create')} className="btn-primary mt-4 text-sm">
                Add First Holiday
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                {['Date', 'Day', 'Holiday Name', 'Type', 'Paid', 'Recurring', canManage && 'Actions']
                  .filter(Boolean).map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-body)' }}>
                    {h.date}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {dayOfWeek(h.date)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{h.name}</p>
                    {h.description && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{h.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={h.holiday_type} />
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: h.is_paid ? 'var(--text-success)' : 'var(--text-muted)' }}>
                    {h.is_paid ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: h.is_recurring ? 'var(--text-info)' : 'var(--text-muted)' }}>
                    {h.is_recurring ? 'Yes' : 'No'}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModal(h)}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(h)} disabled={deleting === h.id}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: 'var(--text-danger)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-danger)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                          {deleting === h.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <HolidayForm
          initial={modal === 'create' ? null : modal}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
