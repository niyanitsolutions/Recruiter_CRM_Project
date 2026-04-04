import { useState, useEffect, useCallback } from 'react'
import { UserPlus2, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SaveBtn, CancelBtn, SkeletonLoader, Toggle,
} from './SettingsLayout'

const EMPTY = { name: '', description: '', is_active: true }

const Modal = ({ open, onClose, children }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {children}
      </div>
    </div>
  )
}

const CandidateSourcesPage = () => {
  const [sources, setSources]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [deleting, setDeleting] = useState(null)

  const DEFAULT_SOURCES = [
    'LinkedIn', 'Naukri', 'Indeed', 'Referral', 'Website', 'Campus', 'Job Fair',
    'HeadHunting', 'Walk-in', 'Agency', 'Internal Transfer',
  ]

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getCandidateSources()
      setSources(res.data || [])
    } catch {
      toast.error('Failed to load candidate sources')
      setSources(DEFAULT_SOURCES.map((name, i) => ({ id: `default-${i}`, name, is_active: true, is_default: true })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = (s) => {
    if (s.is_default) { toast.error('Default sources cannot be edited'); return }
    setEditing(s.id)
    setForm({ name: s.name, description: s.description || '', is_active: s.is_active !== false })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Source name required'); return }
    try {
      setSaving(true)
      if (editing) {
        await tenantSettingsService.updateCandidateSource(editing, form)
        toast.success('Source updated')
      } else {
        await tenantSettingsService.createCandidateSource(form)
        toast.success('Source created')
      }
      setModal(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s) => {
    if (s.is_default) { toast.error('Default sources cannot be deleted'); return }
    try {
      setDeleting(s.id)
      await tenantSettingsService.deleteCandidateSource(s.id)
      toast.success('Source deleted')
      load()
    } catch {
      toast.error('Failed to delete source')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Breadcrumb page="Candidate Sources" />
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Candidate Sources" description="Track where your candidates come from." />
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Source
        </button>
      </div>

      <SectionCard icon={UserPlus2} className="[&_.p-6]:p-0">
        <div className="divide-y divide-surface-50">
          {sources.map(s => (
            <div key={s.id} className="flex items-center gap-4 px-6 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-surface-900 text-sm">{s.name}</p>
                  {s.is_default && <span className="text-xs px-1.5 py-0.5 bg-surface-100 text-surface-500 rounded">Default</span>}
                </div>
                {s.description && <p className="text-xs text-surface-500 mt-0.5">{s.description}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active !== false ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'}`}>
                {s.is_active !== false ? 'Active' : 'Inactive'}
              </span>
              {!s.is_default && (
                <>
                  <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4 text-surface-500" />
                  </button>
                  <button onClick={() => handleDelete(s)} disabled={deleting === s.id} className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors">
                    {deleting === s.id ? <Loader2 className="w-4 h-4 animate-spin text-danger-500" /> : <Trash2 className="w-4 h-4 text-danger-500" />}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <Modal open={modal} onClose={() => setModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">{editing ? 'Edit Source' : 'New Candidate Source'}</h3>
          <button onClick={() => setModal(false)} className="p-1 hover:bg-surface-100 rounded-lg"><X className="w-4 h-4 text-surface-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Source Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. LinkedIn Ads" />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </Field>
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

export default CandidateSourcesPage
