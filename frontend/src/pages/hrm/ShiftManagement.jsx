import React, { useState, useEffect } from 'react'
import {
  Plus, Edit2, Trash2, RefreshCw, Clock, Loader2, Users, Star,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import usePermissions from '../../hooks/usePermissions'

const SHIFT_TYPES = [
  { value: 'morning',    label: 'Morning',    icon: '🌅' },
  { value: 'evening',    label: 'Evening',    icon: '🌇' },
  { value: 'night',      label: 'Night',      icon: '🌙' },
  { value: 'flexible',   label: 'Flexible',   icon: '🕐' },
  { value: 'rotational', label: 'Rotational', icon: '🔄' },
]
const SHIFT_TYPE_MAP = Object.fromEntries(SHIFT_TYPES.map(t => [t.value, t]))

const EMPTY_FORM = {
  name: '', shift_type: 'morning', start_time: '09:00', end_time: '18:00',
  grace_minutes: 15, working_hours: 8, break_duration_minutes: 60,
  is_overnight: false, is_default: false, applicable_departments: [],
}

function ShiftForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const toggle = (k) => setForm(p => ({ ...p, [k]: !p[k] }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
          {initial?.id ? 'Edit Shift' : 'Create Shift'}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Shift Name *</label>
            <input className="input w-full" value={form.name}
                   onChange={e => set('name', e.target.value)} placeholder="e.g. Morning Shift" />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Shift Type</label>
            <select className="input w-full text-sm" value={form.shift_type}
                    onChange={e => set('shift_type', e.target.value)}>
              {SHIFT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Grace Minutes</label>
            <input type="number" min={0} max={120} className="input w-full text-sm"
                   value={form.grace_minutes} onChange={e => set('grace_minutes', parseInt(e.target.value) || 0)} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Start Time *</label>
            <input type="time" className="input w-full text-sm" value={form.start_time}
                   onChange={e => set('start_time', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>End Time *</label>
            <input type="time" className="input w-full text-sm" value={form.end_time}
                   onChange={e => set('end_time', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Working Hours</label>
            <input type="number" min={0.5} max={24} step={0.5} className="input w-full text-sm"
                   value={form.working_hours} onChange={e => set('working_hours', parseFloat(e.target.value) || 8)} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Break Duration (min)</label>
            <input type="number" min={0} max={480} className="input w-full text-sm"
                   value={form.break_duration_minutes}
                   onChange={e => set('break_duration_minutes', parseInt(e.target.value) || 0)} />
          </div>

          <div className="col-span-2 flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_overnight} onChange={() => toggle('is_overnight')}
                     className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Overnight Shift (crosses midnight)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_default} onChange={() => toggle('is_default')}
                     className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Set as Default Shift</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name}
                  className="btn-primary flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial?.id ? 'Update Shift' : 'Create Shift'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignModal({ shifts, onAssign, onCancel, assigning }) {
  const [employeeId, setEmployeeId] = useState('')
  const [shiftId, setShiftId] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>Assign Shift to Employee</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Employee ID</label>
            <input className="input w-full" value={employeeId}
                   onChange={e => setEmployeeId(e.target.value)} placeholder="Enter employee ID" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Shift</label>
            <select className="input w-full" value={shiftId} onChange={e => setShiftId(e.target.value)}>
              <option value="">Select shift...</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time} – {s.end_time})</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={() => onAssign({ employee_id: employeeId, shift_id: shiftId })}
                  disabled={assigning || !employeeId || !shiftId}
                  className="btn-primary flex items-center gap-2">
            {assigning && <Loader2 className="w-4 h-4 animate-spin" />}
            Assign
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ShiftManagement() {
  const { has } = usePermissions()
  const canManage = has('hrm:attendance:manage')
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [assignModal, setAssignModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listShifts({ include_inactive: true })
      setShifts(Array.isArray(res.data) ? res.data : [])
    } catch { toast.error('Failed to load shifts') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (modal?.id) {
        await hrmService.updateShift(modal.id, form)
        toast.success('Shift updated')
      } else {
        await hrmService.createShift(form)
        toast.success('Shift created')
      }
      setModal(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save shift')
    }
    setSaving(false)
  }

  const handleDelete = async (s) => {
    if (!confirm(`Delete shift "${s.name}"?`)) return
    try {
      await hrmService.deleteShift(s.id)
      toast.success('Shift deleted')
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cannot delete shift')
    }
  }

  const handleAssign = async (data) => {
    setAssigning(true)
    try {
      await hrmService.assignShift(data)
      toast.success('Shift assigned successfully')
      setAssignModal(false)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Assignment failed')
    }
    setAssigning(false)
  }

  const handleSeedDefaults = async () => {
    setSeeding(true)
    try {
      const res = await hrmService.seedDefaultShifts()
      toast.success(res.data.message)
      load()
    } catch { toast.error('Seed failed') }
    setSeeding(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Shift Management</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{shifts.length} shifts configured</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={handleSeedDefaults} disabled={seeding}
                    className="btn-secondary flex items-center gap-2 text-sm">
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Seed Defaults
            </button>
            <button onClick={() => setAssignModal(true)}
                    className="btn-secondary flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" /> Assign to Employee
            </button>
            <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Create Shift
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : shifts.length === 0 ? (
        <div className="text-center p-10 rounded-xl"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
          <p style={{ color: 'var(--text-muted)' }}>No shifts configured</p>
          {canManage && (
            <button onClick={handleSeedDefaults} className="btn-primary mt-4 text-sm">
              Load Default Shifts
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map(s => {
            const typeInfo = SHIFT_TYPE_MAP[s.shift_type] || SHIFT_TYPE_MAP.morning
            return (
              <div key={s.id} className="rounded-xl p-5 space-y-3"
                   style={{
                     background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                     opacity: s.is_active ? 1 : 0.6,
                   }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{typeInfo.icon}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>{s.name}</p>
                        {s.is_default && (
                          <Star className="w-3.5 h-3.5 fill-current" style={{ color: '#f59e0b' }} />
                        )}
                      </div>
                      <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{typeInfo.label}</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setModal(s)} className="p-1.5 rounded-lg"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 rounded-lg"
                              style={{ color: 'var(--text-danger)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-danger)'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Time row */}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <span className="font-mono font-medium" style={{ color: 'var(--text-heading)' }}>
                    {s.start_time} – {s.end_time}
                  </span>
                  {s.is_overnight && (
                    <span className="text-xs px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}>Overnight</span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Working</p>
                    <p className="font-semibold" style={{ color: 'var(--text-heading)' }}>{s.working_hours}h</p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Grace</p>
                    <p className="font-semibold" style={{ color: 'var(--text-heading)' }}>{s.grace_minutes}m</p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Break</p>
                    <p className="font-semibold" style={{ color: 'var(--text-heading)' }}>{s.break_duration_minutes}m</p>
                  </div>
                </div>

                {!s.is_active && (
                  <p className="text-xs text-center py-1 rounded"
                     style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                    Inactive
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal !== null && (
        <ShiftForm
          initial={modal?.id ? modal : null}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          saving={saving}
        />
      )}
      {assignModal && (
        <AssignModal
          shifts={shifts.filter(s => s.is_active)}
          onAssign={handleAssign}
          onCancel={() => setAssignModal(false)}
          assigning={assigning}
        />
      )}
    </div>
  )
}
