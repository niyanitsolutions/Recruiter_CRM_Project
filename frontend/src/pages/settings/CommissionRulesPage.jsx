import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, BadgeDollarSign, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SelectField,
  SaveBtn, CancelBtn, SkeletonLoader, Toggle,
} from './SettingsLayout'

const EMPTY = {
  name: '', type: 'percentage', rate: '', fixed_amount: '',
  slabs: [], applicable_to: 'all', is_active: true,
}

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

const CommissionRulesPage = () => {
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
      const res = await tenantSettingsService.getCommissionRules()
      setRules(res.data || [])
    } catch { toast.error('Failed to load rules') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = (r) => {
    setEditing(r.id)
    setForm({ name: r.name, type: r.type, rate: r.rate ?? '', fixed_amount: r.fixed_amount ?? '', slabs: r.slabs || [], applicable_to: r.applicable_to || 'all', is_active: r.is_active !== false })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    try {
      setSaving(true)
      const payload = {
        ...form,
        rate: form.rate !== '' ? parseFloat(form.rate) : null,
        fixed_amount: form.fixed_amount !== '' ? parseFloat(form.fixed_amount) : null,
      }
      if (editing) {
        await tenantSettingsService.updateCommissionRule(editing, payload)
        toast.success('Rule updated')
      } else {
        await tenantSettingsService.createCommissionRule(payload)
        toast.success('Rule created')
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
    try { setDeleting(id); await tenantSettingsService.deleteCommissionRule(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed to delete') }
    finally { setDeleting(null) }
  }

  const addSlab = () => {
    setForm(f => ({ ...f, slabs: [...f.slabs, { from_amount: 0, to_amount: null, rate: 0 }] }))
  }

  const updateSlab = (idx, field, value) => {
    const slabs = [...form.slabs]
    slabs[idx] = { ...slabs[idx], [field]: value === '' ? null : parseFloat(value) }
    setForm(f => ({ ...f, slabs }))
  }

  const removeSlab = (idx) => setForm(f => ({ ...f, slabs: f.slabs.filter((_, i) => i !== idx) }))

  const typeLabel = (type, r) => {
    if (type === 'percentage') return `${r.rate}%`
    if (type === 'fixed') return `₹${r.fixed_amount?.toLocaleString()}`
    return `Slab (${r.slabs?.length || 0} levels)`
  }

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb page="Commission & Payout Rules" />
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Commission & Payout Rules" description="Define how commissions are calculated for placements." />
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-100 flex flex-col items-center gap-3 py-16 text-surface-400">
          <BadgeDollarSign className="w-10 h-10" />
          <p className="text-sm">No commission rules configured yet.</p>
          <button onClick={openCreate} className="text-sm text-accent-600 hover:underline">Add Rule</button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-surface-100 px-6 py-4 flex items-center gap-4">
              <div className="p-2 bg-yellow-50 rounded-lg"><BadgeDollarSign className="w-5 h-5 text-yellow-600" /></div>
              <div className="flex-1">
                <p className="font-medium text-surface-900">{r.name}</p>
                <p className="text-xs text-surface-500 mt-0.5">
                  {typeLabel(r.type, r)} · {r.applicable_to} placements
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_active !== false ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'}`}>
                {r.is_active !== false ? 'Active' : 'Inactive'}
              </span>
              <button onClick={() => openEdit(r)} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
                <Pencil className="w-4 h-4 text-surface-500" />
              </button>
              <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="p-2 hover:bg-danger-50 rounded-lg transition-colors">
                {deleting === r.id ? <Loader2 className="w-4 h-4 animate-spin text-danger-500" /> : <Trash2 className="w-4 h-4 text-danger-500" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">{editing ? 'Edit Rule' : 'New Commission Rule'}</h3>
          <button onClick={() => setModal(false)} className="p-1 hover:bg-surface-100 rounded-lg"><X className="w-4 h-4 text-surface-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Rule Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Standard Placement Fee" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Commission Type">
              <SelectField value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount</option>
                <option value="slab">Slab-based</option>
              </SelectField>
            </Field>
            <Field label="Applicable To">
              <SelectField value={form.applicable_to} onChange={e => setForm(f => ({ ...f, applicable_to: e.target.value }))}>
                <option value="all">All Placements</option>
                <option value="permanent">Permanent Only</option>
                <option value="contract">Contract Only</option>
              </SelectField>
            </Field>
          </div>

          {form.type === 'percentage' && (
            <Field label="Commission Rate (%)">
              <Input type="number" min={0} max={100} step={0.1} value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className="w-32" placeholder="8.5" />
            </Field>
          )}

          {form.type === 'fixed' && (
            <Field label="Fixed Amount (₹)">
              <Input type="number" min={0} value={form.fixed_amount} onChange={e => setForm(f => ({ ...f, fixed_amount: e.target.value }))} className="w-40" placeholder="50000" />
            </Field>
          )}

          {form.type === 'slab' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-surface-700">Slab Table</label>
                <button onClick={addSlab} className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700">
                  <Plus className="w-3.5 h-3.5" /> Add Slab
                </button>
              </div>
              <div className="border border-surface-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-50">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500">From (₹)</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500">To (₹)</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500">Rate (%)</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {form.slabs.map((slab, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2"><Input type="number" value={slab.from_amount ?? ''} onChange={e => updateSlab(idx, 'from_amount', e.target.value)} className="w-24" /></td>
                        <td className="px-3 py-2"><Input type="number" value={slab.to_amount ?? ''} placeholder="∞" onChange={e => updateSlab(idx, 'to_amount', e.target.value)} className="w-24" /></td>
                        <td className="px-3 py-2"><Input type="number" value={slab.rate ?? ''} onChange={e => updateSlab(idx, 'rate', e.target.value)} className="w-24" /></td>
                        <td className="px-3 py-2"><button onClick={() => removeSlab(idx)} className="p-1 hover:bg-danger-50 rounded"><Trash2 className="w-3.5 h-3.5 text-danger-500" /></button></td>
                      </tr>
                    ))}
                    {form.slabs.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-xs text-surface-400 py-4">No slabs added yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

export default CommissionRulesPage
