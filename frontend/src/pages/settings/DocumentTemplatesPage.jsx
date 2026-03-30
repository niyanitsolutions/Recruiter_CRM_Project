import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, Pencil, Trash2, X, Copy, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, Textarea, SelectField,
  SaveBtn, CancelBtn, SkeletonLoader, Toggle,
} from './SettingsLayout'

const TEMPLATE_TYPES = [
  { value: 'offer_letter',   label: 'Offer Letter' },
  { value: 'nda',            label: 'NDA / Non-Disclosure' },
  { value: 'appointment',    label: 'Appointment Letter' },
  { value: 'experience',     label: 'Experience Certificate' },
  { value: 'rejection',      label: 'Rejection Letter' },
  { value: 'other',          label: 'Other' },
]

const PLACEHOLDERS = [
  '{{candidate_name}}', '{{position}}', '{{company_name}}',
  '{{join_date}}', '{{salary}}', '{{manager_name}}',
  '{{department}}', '{{location}}', '{{today_date}}',
]

const Modal = ({ open, children, onClose }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {children}
      </div>
    </div>
  )
}

const DocumentTemplatesPage = () => {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [editing, setEditing]     = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [form, setForm]           = useState({
    name: '', type: 'offer_letter', content: '', is_active: true,
  })

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getDocumentTemplates()
      setTemplates(res.data || [])
    } catch {
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing('new')
    setForm({ name: '', type: 'offer_letter', content: '', is_active: true })
  }

  const openEdit = (t) => {
    setEditing(t.id)
    setForm({ name: t.name, type: t.type, content: t.content || '', is_active: t.is_active !== false })
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Template name required'); return }
    try {
      setSaving(true)
      if (editing === 'new') {
        await tenantSettingsService.createDocumentTemplate(form)
        toast.success('Template created')
      } else {
        await tenantSettingsService.updateDocumentTemplate(editing, form)
        toast.success('Template updated')
      }
      setEditing(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      setDeleting(id)
      await tenantSettingsService.deleteDocumentTemplate(id)
      toast.success('Template deleted')
      load()
    } catch {
      toast.error('Failed to delete template')
    } finally {
      setDeleting(null)
    }
  }

  const insertPlaceholder = (ph) => {
    setForm(f => ({ ...f, content: f.content + ph }))
  }

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb page="Document Templates" />
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Document Templates" description="Create reusable templates for offers, NDAs and other documents." />
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-100 flex flex-col items-center gap-3 py-16 text-surface-400">
          <FileText className="w-10 h-10" />
          <p className="text-sm">No templates yet.</p>
          <button onClick={openCreate} className="text-sm text-accent-600 hover:underline">Create Template</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-surface-100 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-surface-900 text-sm">{t.name}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active !== false ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'}`}>
                  {t.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-surface-500 mb-3">
                {TEMPLATE_TYPES.find(tp => tp.value === t.type)?.label || t.type}
              </p>
              {t.content && (
                <p className="text-xs text-surface-400 line-clamp-2 mb-3">{t.content}</p>
              )}
              <div className="flex items-center gap-2 pt-3 border-t border-surface-50">
                <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors">
                  <Pencil className="w-4 h-4 text-surface-500" />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  disabled={deleting === t.id}
                  className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                >
                  {deleting === t.id ? <Loader2 className="w-4 h-4 animate-spin text-danger-500" /> : <Trash2 className="w-4 h-4 text-danger-500" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">
            {editing === 'new' ? 'New Template' : 'Edit Template'}
          </h3>
          <button onClick={() => setEditing(null)} className="p-1 hover:bg-surface-100 rounded-lg">
            <X className="w-4 h-4 text-surface-500" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Template Name" required>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Offer Letter Template" />
            </Field>
            <Field label="Type">
              <SelectField value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectField>
            </Field>
          </div>

          <Field label="Available Placeholders" hint="Click to insert into content">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PLACEHOLDERS.map(ph => (
                <button
                  key={ph}
                  onClick={() => insertPlaceholder(ph)}
                  className="px-2 py-1 bg-accent-50 text-accent-700 text-xs rounded-md hover:bg-accent-100 transition-colors font-mono"
                >
                  {ph}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Content">
            <Textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Dear {{candidate_name}},&#10;&#10;We are pleased to offer you the position of {{position}}..."
              rows={10}
              className="font-mono text-xs"
            />
          </Field>

          <div className="border border-surface-100 rounded-lg px-3">
            <Toggle checked={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} label="Active" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-100">
          <CancelBtn onClick={() => setEditing(null)} />
          <SaveBtn saving={saving} onClick={handleSave} label={editing === 'new' ? 'Create' : 'Update'} />
        </div>
      </Modal>
    </div>
  )
}

export default DocumentTemplatesPage
