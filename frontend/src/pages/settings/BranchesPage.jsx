import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, GitBranch, X, Loader2, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, Field, Input, SaveBtn, CancelBtn, SkeletonLoader, Toggle,
} from './SettingsLayout'

const EMPTY = {
  branch_name: '', address: '', city: '', state: '', country: 'India',
  pincode: '', phone: '', email: '', is_active: true, is_head_office: false,
}

const Modal = ({ open, title, children, onClose }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-surface-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-100 rounded-lg">
            <X className="w-4 h-4 text-surface-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const BranchesPage = () => {
  const [branches, setBranches] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getBranches()
      setBranches(res.data || [])
    } catch {
      toast.error('Failed to load branches')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true) }
  const openEdit = (b) => { setEditing(b.id); setForm({ ...EMPTY, ...b }); setModalOpen(true) }

  const handleSave = async () => {
    if (!form.branch_name.trim()) { toast.error('Branch name is required'); return }
    try {
      setSaving(true)
      if (editing) {
        await tenantSettingsService.updateBranch(editing, form)
        toast.success('Branch updated')
      } else {
        await tenantSettingsService.createBranch(form)
        toast.success('Branch created')
      }
      setModalOpen(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save branch')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      setDeleting(id)
      await tenantSettingsService.deleteBranch(id)
      toast.success('Branch deleted')
      load()
    } catch {
      toast.error('Failed to delete branch')
    } finally {
      setDeleting(null)
    }
  }

  const f = (field) => e => setForm(prev => ({ ...prev, [field]: e.target.value }))

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb page="Branches" />
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Branches" description="Manage office locations and branch details." />
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Branch
        </button>
      </div>

      {branches.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-100 flex flex-col items-center gap-3 py-16 text-surface-400">
          <GitBranch className="w-10 h-10" />
          <p className="text-sm">No branches configured yet.</p>
          <button onClick={openCreate} className="text-sm text-accent-600 hover:underline">Add Branch</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {branches.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-surface-100 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-600" />
                  <span className="font-medium text-surface-900 text-sm">{b.branch_name}</span>
                  {b.is_head_office && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-50 text-yellow-700 text-xs rounded-full">
                      <Star className="w-3 h-3" /> HQ
                    </span>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${b.is_active ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'}`}>
                  {b.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {b.address && <p className="text-xs text-surface-500 mb-1">{b.address}</p>}
              <p className="text-xs text-surface-500">
                {[b.city, b.state, b.country].filter(Boolean).join(', ')}
                {b.pincode ? ` - ${b.pincode}` : ''}
              </p>
              {(b.phone || b.email) && (
                <p className="text-xs text-surface-400 mt-1">
                  {b.phone}{b.phone && b.email ? ' · ' : ''}{b.email}
                </p>
              )}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-50">
                <button onClick={() => openEdit(b)} className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors">
                  <Pencil className="w-4 h-4 text-surface-500" />
                </button>
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={deleting === b.id}
                  className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                >
                  {deleting === b.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-danger-500" />
                    : <Trash2 className="w-4 h-4 text-danger-500" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title={editing ? 'Edit Branch' : 'New Branch'} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <Field label="Branch Name" required>
            <Input value={form.branch_name} onChange={f('branch_name')} placeholder="Head Office" />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={f('address')} placeholder="123 Main Street" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><Input value={form.city} onChange={f('city')} placeholder="Mumbai" /></Field>
            <Field label="State"><Input value={form.state} onChange={f('state')} placeholder="Maharashtra" /></Field>
            <Field label="Country"><Input value={form.country} onChange={f('country')} placeholder="India" /></Field>
            <Field label="Pincode"><Input value={form.pincode} onChange={f('pincode')} placeholder="400001" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input value={form.phone} onChange={f('phone')} placeholder="+91 22 1234 5678" /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={f('email')} placeholder="branch@company.com" /></Field>
          </div>
          <div className="border border-surface-100 rounded-lg px-4 divide-y divide-surface-50">
            <Toggle
              checked={form.is_active}
              onChange={v => setForm(p => ({ ...p, is_active: v }))}
              label="Active"
              description="Inactive branches are hidden from dropdowns"
            />
            <Toggle
              checked={form.is_head_office}
              onChange={v => setForm(p => ({ ...p, is_head_office: v }))}
              label="Head Office"
              description="Only one branch can be marked as head office"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <CancelBtn onClick={() => setModalOpen(false)} />
            <SaveBtn saving={saving} onClick={handleSave} label={editing ? 'Update' : 'Create'} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default BranchesPage
