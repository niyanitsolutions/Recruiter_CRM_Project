import React, { useState, useEffect } from 'react'
import {
  Plus, Edit2, Trash2, RefreshCw, FileText, Loader2,
  ChevronDown, ChevronUp, CheckCircle2, XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import usePermissions from '../../hooks/usePermissions'

const LEAVE_TYPES = [
  { value: 'sick',        label: 'Sick Leave',        color: '#ef4444' },
  { value: 'casual',      label: 'Casual Leave',      color: '#f59e0b' },
  { value: 'earned',      label: 'Earned Leave',      color: '#10b981' },
  { value: 'annual',      label: 'Annual Leave',      color: '#3b82f6' },
  { value: 'maternity',   label: 'Maternity Leave',   color: '#ec4899' },
  { value: 'paternity',   label: 'Paternity Leave',   color: '#6366f1' },
  { value: 'marriage',    label: 'Marriage Leave',    color: '#8b5cf6' },
  { value: 'bereavement', label: 'Bereavement Leave', color: '#6b7280' },
  { value: 'comp_off',    label: 'Compensatory Off',  color: '#0ea5e9' },
  { value: 'wfh',         label: 'Work From Home',    color: '#06b6d4' },
  { value: 'custom',      label: 'Custom',            color: '#a855f7' },
]
const APPROVAL_LEVELS = [
  { value: 'none',             label: 'No Approval Required' },
  { value: 'manager',          label: 'Reporting Manager' },
  { value: 'hr',               label: 'HR Only' },
  { value: 'manager_then_hr',  label: 'Manager → HR' },
]

const EMPTY_FORM = {
  leave_type: 'casual', name: '', code: '', color: '#3b82f6',
  annual_allocation: 12, carry_forward_allowed: false, max_carry_forward: '',
  encashment_allowed: false, negative_balance_allowed: false,
  approval_level: 'manager', document_required: false,
  min_days: 0.5, max_days: '', gender_restriction: '',
  applicable_departments: [], applicable_designations: [],
  probation_restriction: false, notice_period_restriction: false,
}

function Flag({ on, onLabel = 'Yes', offLabel = 'No' }) {
  return on
    ? <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-success)' }}>
        <CheckCircle2 className="w-3.5 h-3.5" />{onLabel}
      </span>
    : <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        <XCircle className="w-3.5 h-3.5" />{offLabel}
      </span>
}

function PolicyForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const toggle = (k) => setForm(p => ({ ...p, [k]: !p[k] }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto space-y-4"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
          {initial?.id ? 'Edit Leave Policy' : 'Add Leave Policy'}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          {/* Leave Type */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Leave Type</label>
            <select className="input w-full text-sm" value={form.leave_type}
                    onChange={e => set('leave_type', e.target.value)}>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {/* Code */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Code * (e.g. SL, CL, EL)
            </label>
            <input className="input w-full text-sm" value={form.code}
                   onChange={e => set('code', e.target.value.toUpperCase())}
                   placeholder="SL" maxLength={10} />
          </div>
          {/* Name */}
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Policy Name *</label>
            <input className="input w-full text-sm" value={form.name}
                   onChange={e => set('name', e.target.value)} placeholder="Sick Leave" />
          </div>
          {/* Annual allocation */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Annual Allocation (days) *</label>
            <input type="number" min={0} step={0.5} className="input w-full text-sm" value={form.annual_allocation}
                   onChange={e => set('annual_allocation', parseFloat(e.target.value) || 0)} />
          </div>
          {/* Approval */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Approval Level</label>
            <select className="input w-full text-sm" value={form.approval_level}
                    onChange={e => set('approval_level', e.target.value)}>
              {APPROVAL_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          {/* Min / Max days */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Min Days Per Application</label>
            <input type="number" min={0.5} step={0.5} className="input w-full text-sm" value={form.min_days}
                   onChange={e => set('min_days', parseFloat(e.target.value) || 0.5)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Max Days Per Application</label>
            <input type="number" min={0} step={0.5} className="input w-full text-sm"
                   value={form.max_days || ''} placeholder="No limit"
                   onChange={e => set('max_days', e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          {/* Gender restriction */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Gender Restriction</label>
            <select className="input w-full text-sm" value={form.gender_restriction || ''}
                    onChange={e => set('gender_restriction', e.target.value || null)}>
              <option value="">None (All Genders)</option>
              <option value="male">Male Only</option>
              <option value="female">Female Only</option>
            </select>
          </div>
          {/* Color */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Badge Color</label>
              <input type="color" className="w-full h-10 rounded cursor-pointer border"
                     style={{ border: '1px solid var(--border)' }}
                     value={form.color} onChange={e => set('color', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Carry-forward row */}
        <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Carry Forward & Encashment
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.carry_forward_allowed}
                     onChange={() => toggle('carry_forward_allowed')} className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Carry Forward Allowed</span>
            </label>
            {form.carry_forward_allowed && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Max Carry Forward (days)
                </label>
                <input type="number" min={0} step={1} className="input w-full text-sm"
                       value={form.max_carry_forward || ''} placeholder="No limit"
                       onChange={e => set('max_carry_forward', e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.encashment_allowed}
                     onChange={() => toggle('encashment_allowed')} className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Encashment Allowed</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.negative_balance_allowed}
                     onChange={() => toggle('negative_balance_allowed')} className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Allow Negative Balance</span>
            </label>
          </div>
        </div>

        {/* Rules row */}
        <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Restrictions
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.document_required}
                     onChange={() => toggle('document_required')} className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Document Required</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.probation_restriction}
                     onChange={() => toggle('probation_restriction')} className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Restrict During Probation</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.notice_period_restriction}
                     onChange={() => toggle('notice_period_restriction')} className="w-4 h-4 accent-blue-500" />
              <span style={{ color: 'var(--text-body)' }}>Restrict During Notice Period</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name || !form.code}
                  className="btn-primary flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial?.id ? 'Update Policy' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LeavePolicyManagement() {
  const { has } = usePermissions()
  const canManage = has('hrm:attendance:manage')
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [seeding, setSeeding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listLeavePolicies({ include_inactive: true })
      setPolicies(Array.isArray(res.data) ? res.data : [])
    } catch { toast.error('Failed to load leave policies') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        max_days: form.max_days || null,
        max_carry_forward: form.max_carry_forward || null,
        gender_restriction: form.gender_restriction || null,
        annual_allocation: Number(form.annual_allocation),
        min_days: Number(form.min_days),
      }
      if (modal?.id) {
        await hrmService.updateLeavePolicy(modal.id, payload)
        toast.success('Policy updated')
      } else {
        await hrmService.createLeavePolicy(payload)
        toast.success('Policy created')
      }
      setModal(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save policy')
    }
    setSaving(false)
  }

  const handleDelete = async (p) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    try {
      await hrmService.deleteLeavePolicy(p.id)
      toast.success('Policy deleted')
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cannot delete policy')
    }
  }

  const handleSeedDefaults = async () => {
    setSeeding(true)
    try {
      const res = await hrmService.seedDefaultLeavePolicies()
      toast.success(res.data.message)
      load()
    } catch { toast.error('Seed failed') }
    setSeeding(false)
  }

  const approvalLabel = (level) => APPROVAL_LEVELS.find(a => a.value === level)?.label || level

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Leave Policy Management</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{policies.length} policies configured</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={handleSeedDefaults} disabled={seeding}
                    className="btn-secondary flex items-center gap-2 text-sm">
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Seed Defaults
            </button>
            <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Add Policy
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center p-10 rounded-xl"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
          <p style={{ color: 'var(--text-muted)' }}>No leave policies configured</p>
          {canManage && (
            <button onClick={handleSeedDefaults} className="btn-primary mt-4 text-sm">
              Load Default Policies
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden"
                 style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', opacity: p.is_active ? 1 : 0.6 }}>
              {/* Header row */}
              <div className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                   onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color || '#3b82f6' }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>{p.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                          style={{ background: 'var(--bg-card-alt)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                      {p.code}
                    </span>
                    {!p.is_active && (
                      <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                        Inactive
                      </span>
                    )}
                    {p.is_system_default && (
                      <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}>
                        Default
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    <strong>{p.annual_allocation}</strong> days/yr
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{approvalLabel(p.approval_level)}</span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal(p)} className="p-1.5 rounded-lg"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!p.is_system_default && (
                      <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg"
                              style={{ color: 'var(--text-danger)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-danger)'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                {expanded === p.id
                  ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />}
              </div>

              {/* Detail panel */}
              {expanded === p.id && (
                <div className="px-4 pb-4 pt-0 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm"
                     style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Carry Forward</p>
                    <Flag on={p.carry_forward_allowed} onLabel={p.max_carry_forward ? `Yes (max ${p.max_carry_forward}d)` : 'Yes'} />
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Encashment</p>
                    <Flag on={p.encashment_allowed} />
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Negative Balance</p>
                    <Flag on={p.negative_balance_allowed} />
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Document Required</p>
                    <Flag on={p.document_required} />
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Min Days</p>
                    <p style={{ color: 'var(--text-body)' }}>{p.min_days} day{p.min_days !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Max Days</p>
                    <p style={{ color: 'var(--text-body)' }}>{p.max_days || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Gender Restriction</p>
                    <p style={{ color: 'var(--text-body)' }}>{p.gender_restriction ? `${p.gender_restriction} only` : 'None'}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Probation Blocked</p>
                    <Flag on={p.probation_restriction} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <PolicyForm
          initial={modal?.id ? modal : null}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
