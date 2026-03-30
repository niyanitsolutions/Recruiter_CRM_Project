import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, SlidersHorizontal, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SelectField,
  SaveBtn, CancelBtn, SkeletonLoader, Toggle,
} from './SettingsLayout'

const ENTITIES = ['job', 'candidate', 'client', 'application', 'interview']
const METRICS = [
  { value: 'time_to_fill', label: 'Time to Fill (Job Posting → Placement)' },
  { value: 'time_to_hire', label: 'Time to Hire (Application → Offer)' },
  { value: 'time_to_screen', label: 'Time to Screen (Application → First Interview)' },
  { value: 'response_time', label: 'Response Time (Client Query → Response)' },
  { value: 'feedback_time', label: 'Interview Feedback Submission' },
]

const EMPTY = { name: '', entity: 'job', metric: 'time_to_fill', target_days: 30, warning_days: 25, escalation_levels: [], is_active: true }

const Modal = ({ open, onClose, children }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

const SLAConfigPage = () => {
  const [rules, setRules]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getSLARules()
      setRules(res.data || [])
    } catch { toast.error('Failed to load SLA rules') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = (r) => { setEditing(r.id); setForm({ ...EMPTY, ...r }); setModal(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    try {
      setSaving(true)
      if (editing) {
        await tenantSettingsService.updateSLARule(editing, form)
        toast.success('SLA rule updated')
      } else {
        await tenantSettingsService.createSLARule(form)
        toast.success('SLA rule created')
      }
      setModal(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try { setDeleting(id); await tenantSettingsService.deleteSLARule(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed to delete') }
    finally { setDeleting(null) }
  }

  const addEscalation = () => {
    const nextLevel = (form.escalation_levels?.length || 0) + 1
    setForm(f => ({ ...f, escalation_levels: [...(f.escalation_levels || []), { level: nextLevel, notify_role: 'admin', after_hours: 24 }] }))
  }

  const updateEscalation = (idx, field, value) => {
    const levels = [...form.escalation_levels]
    levels[idx] = { ...levels[idx], [field]: field === 'after_hours' ? parseInt(value) || 0 : value }
    setForm(f => ({ ...f, escalation_levels: levels }))
  }

  const removeEscalation = (idx) => setForm(f => ({ ...f, escalation_levels: f.escalation_levels.filter((_, i) => i !== idx) }))

  const metricLabel = (value) => METRICS.find(m => m.value === value)?.label || value

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb page="SLA Configuration" />
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="SLA Configuration" description="Define service level agreements and escalation paths for key metrics." />
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors">
          <Plus className="w-4 h-4" /> New SLA Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-100 flex flex-col items-center gap-3 py-16 text-surface-400">
          <SlidersHorizontal className="w-10 h-10" />
          <p className="text-sm">No SLA rules configured yet.</p>
          <button onClick={openCreate} className="text-sm text-accent-600 hover:underline">Create SLA Rule</button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-surface-100 px-6 py-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-orange-50 rounded-lg flex-shrink-0">
                  <SlidersHorizontal className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-surface-900">{r.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_active !== false ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'}`}>
                      {r.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {metricLabel(r.metric)} · Target: {r.target_days}d · Warning at: {r.warning_days}d
                  </p>
                  {r.escalation_levels?.length > 0 && (
                    <p className="text-xs text-surface-400 mt-0.5">
                      {r.escalation_levels.length} escalation level(s)
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(r)} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4 text-surface-500" />
                  </button>
                  <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="p-2 hover:bg-danger-50 rounded-lg transition-colors">
                    {deleting === r.id ? <Loader2 className="w-4 h-4 animate-spin text-danger-500" /> : <Trash2 className="w-4 h-4 text-danger-500" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">{editing ? 'Edit SLA Rule' : 'New SLA Rule'}</h3>
          <button onClick={() => setModal(false)} className="p-1 hover:bg-surface-100 rounded-lg"><X className="w-4 h-4 text-surface-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Rule Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Time to Fill — Engineering" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Entity">
              <SelectField value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}>
                {ENTITIES.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
              </SelectField>
            </Field>
            <Field label="Metric">
              <SelectField value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}>
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </SelectField>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Target (days)">
              <Input type="number" min={1} value={form.target_days} onChange={e => setForm(f => ({ ...f, target_days: parseInt(e.target.value) || 30 }))} className="w-24" />
            </Field>
            <Field label="Warning Threshold (days)" hint="Warn when this close to breaching SLA">
              <Input type="number" min={1} value={form.warning_days} onChange={e => setForm(f => ({ ...f, warning_days: parseInt(e.target.value) || 25 }))} className="w-24" />
            </Field>
          </div>

          {/* Escalation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-surface-700">Escalation Levels</label>
              <button onClick={addEscalation} className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700">
                <Plus className="w-3.5 h-3.5" /> Add Level
              </button>
            </div>
            <div className="space-y-2">
              {form.escalation_levels?.map((lvl, idx) => (
                <div key={idx} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-end p-3 bg-surface-50 rounded-xl">
                  <span className="text-xs font-semibold text-surface-500 self-center">L{lvl.level}</span>
                  <Field label="Notify Role">
                    <SelectField value={lvl.notify_role} onChange={e => updateEscalation(idx, 'notify_role', e.target.value)}>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </SelectField>
                  </Field>
                  <Field label="After (hours)">
                    <Input type="number" min={1} value={lvl.after_hours} onChange={e => updateEscalation(idx, 'after_hours', e.target.value)} />
                  </Field>
                  <button onClick={() => removeEscalation(idx)} className="p-2 hover:bg-danger-50 rounded-lg self-end"><Trash2 className="w-3.5 h-3.5 text-danger-500" /></button>
                </div>
              ))}
              {!form.escalation_levels?.length && <p className="text-xs text-surface-400 text-center py-2">No escalation levels</p>}
            </div>
          </div>

          <div className="border border-surface-100 rounded-lg px-3">
            <Toggle checked={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} label="Active" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <CancelBtn onClick={() => setModal(false)} />
            <SaveBtn saving={saving} onClick={handleSave} label={editing ? 'Update' : 'Create'} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default SLAConfigPage
