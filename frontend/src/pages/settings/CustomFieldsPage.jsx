import { useState, useEffect, useCallback } from 'react'
import { FormInput, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import settingsService from '../../services/settingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SelectField,
  SaveBtn, CancelBtn, SkeletonLoader, Toggle,
} from './SettingsLayout'

const ENTITY_TYPES = [
  { value: 'candidate', label: 'Candidate' },
  { value: 'job', label: 'Job' },
  { value: 'client', label: 'Client' },
  { value: 'application', label: 'Application' },
  { value: 'interview', label: 'Interview' },
]

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'boolean', label: 'Yes/No Toggle' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'textarea', label: 'Long Text' },
]

const EMPTY = {
  name: '', label: '', field_type: 'text', entity_type: 'candidate',
  is_required: false, options: [], placeholder: '', hint: '',
}

const Modal = ({ open, onClose, children }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

const CustomFieldsPage = () => {
  const [fields, setFields]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [deleting, setDeleting] = useState(null)
  const [filterEntity, setFilterEntity] = useState('all')
  const [newOption, setNewOption] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await settingsService.getCustomFields()
      setFields(res.data || [])
    } catch {
      toast.error('Failed to load custom fields')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = (f) => {
    setEditing(f.id || f._id)
    setForm({
      name: f.name || '', label: f.label || f.name || '',
      field_type: f.field_type || 'text', entity_type: f.entity_type || 'candidate',
      is_required: f.is_required || false, options: f.options || [],
      placeholder: f.placeholder || '', hint: f.hint || '',
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Field name required'); return }
    try {
      setSaving(true)
      if (editing) {
        await settingsService.updateCustomField(editing, form)
        toast.success('Field updated')
      } else {
        await settingsService.createCustomField(form)
        toast.success('Field created')
      }
      setModal(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save field')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      setDeleting(id)
      await settingsService.deleteCustomField(id)
      toast.success('Field deleted')
      load()
    } catch {
      toast.error('Failed to delete field')
    } finally {
      setDeleting(null)
    }
  }

  const addOption = () => {
    const v = newOption.trim()
    if (!v || form.options.includes(v)) return
    setForm(f => ({ ...f, options: [...f.options, v] }))
    setNewOption('')
  }

  const removeOption = (opt) => setForm(f => ({ ...f, options: f.options.filter(o => o !== opt) }))

  const filtered = filterEntity === 'all' ? fields : fields.filter(f => f.entity_type === filterEntity)

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb page="Custom Fields" />
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Custom Fields" description="Add custom data fields to candidates, jobs, clients, and more." />
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors">
          <Plus className="w-4 h-4" /> New Field
        </button>
      </div>

      {/* Entity filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {['all', ...ENTITY_TYPES.map(e => e.value)].map(e => (
          <button
            key={e}
            onClick={() => setFilterEntity(e)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize
                        ${filterEntity === e ? 'bg-accent-600 text-white' : 'bg-white border border-surface-200 text-surface-600 hover:bg-surface-50'}`}
          >
            {e === 'all' ? 'All' : e}
          </button>
        ))}
      </div>

      <SectionCard icon={FormInput} className="[&_.p-6]:p-0">
        <div className="flex items-center justify-between px-6 py-3 border-b border-surface-100">
          <p className="text-sm text-surface-500">{filtered.length} field{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-surface-400">
            <FormInput className="w-10 h-10" />
            <p className="text-sm">No custom fields yet.</p>
            <button onClick={openCreate} className="text-sm text-accent-600 hover:underline">Add Field</button>
          </div>
        ) : (
          <div className="divide-y divide-surface-50">
            {filtered.map(field => {
              const fid = field.id || field._id
              return (
                <div key={fid} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-surface-900 text-sm">{field.label || field.name}</p>
                      {field.is_required && <span className="text-xs text-danger-500">Required</span>}
                    </div>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {field.entity_type} · {field.field_type}
                      {field.name && field.name !== field.label ? ` · key: ${field.name}` : ''}
                    </p>
                  </div>
                  <button onClick={() => openEdit(field)} className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4 text-surface-500" />
                  </button>
                  <button onClick={() => handleDelete(fid)} disabled={deleting === fid} className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors">
                    {deleting === fid ? <Loader2 className="w-4 h-4 animate-spin text-danger-500" /> : <Trash2 className="w-4 h-4 text-danger-500" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <Modal open={modal} onClose={() => setModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">{editing ? 'Edit Field' : 'New Custom Field'}</h3>
          <button onClick={() => setModal(false)} className="p-1 hover:bg-surface-100 rounded-lg"><X className="w-4 h-4 text-surface-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Field Label" required hint="Shown to users">
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. LinkedIn URL" />
            </Field>
            <Field label="Field Key" hint="Used in API / exports">
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. linkedin_url" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Field Type">
              <SelectField value={form.field_type} onChange={e => setForm(f => ({ ...f, field_type: e.target.value }))}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectField>
            </Field>
            <Field label="Entity">
              <SelectField value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))}>
                {ENTITY_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </SelectField>
            </Field>
          </div>

          <Field label="Placeholder">
            <Input value={form.placeholder} onChange={e => setForm(f => ({ ...f, placeholder: e.target.value }))} placeholder="Placeholder text..." />
          </Field>

          <Field label="Helper Text">
            <Input value={form.hint} onChange={e => setForm(f => ({ ...f, hint: e.target.value }))} placeholder="Short description shown below the field" />
          </Field>

          {(form.field_type === 'select' || form.field_type === 'multi_select') && (
            <Field label="Options">
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[2rem]">
                {form.options.map(opt => (
                  <span key={opt} className="flex items-center gap-1 px-2 py-1 bg-surface-100 text-surface-700 text-xs rounded-lg">
                    {opt}
                    <button onClick={() => removeOption(opt)} className="hover:text-danger-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={newOption} onChange={e => setNewOption(e.target.value)} placeholder="Add option…" onKeyDown={e => e.key === 'Enter' && addOption()} className="flex-1" />
                <button onClick={addOption} className="px-3 py-2 bg-accent-50 text-accent-700 text-sm rounded-lg hover:bg-accent-100 transition-colors">Add</button>
              </div>
            </Field>
          )}

          <div className="border border-surface-100 rounded-lg px-3">
            <Toggle checked={form.is_required} onChange={v => setForm(f => ({ ...f, is_required: v }))} label="Required Field" description="Users must fill this field" />
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

export default CustomFieldsPage
