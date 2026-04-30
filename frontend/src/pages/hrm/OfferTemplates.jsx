import React, { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, FileText, ChevronDown, ChevronUp, Wand2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

const TEMPLATE_TYPES = [
  { value: 'offer_letter', label: 'Offer Letter' },
  { value: 'appointment_letter', label: 'Appointment Letter' },
  { value: 'experience_letter', label: 'Experience Letter' },
  { value: 'relieving_letter', label: 'Relieving Letter' },
  { value: 'custom', label: 'Custom' },
]

const TYPE_COLORS = {
  offer_letter:       'bg-blue-100 text-blue-700',
  appointment_letter: 'bg-green-100 text-green-700',
  experience_letter:  'bg-purple-100 text-purple-700',
  relieving_letter:   'bg-orange-100 text-orange-700',
  custom:             'bg-gray-100 text-gray-700',
}

const PLACEHOLDERS = [
  '{{candidate_name}}', '{{position}}', '{{department}}', '{{ctc}}',
  '{{joining_date}}', '{{company_name}}', '{{manager_name}}', '{{location}}',
]

const EMPTY_TEMPLATE = {
  name: '',
  template_type: 'offer_letter',
  subject: '',
  body: '',
  is_default: false,
  salary_components: [],
  policies: [],
  rules: [],
}

const EMPTY_GENERATE = {
  candidate_name: '',
  position: '',
  department: '',
  ctc: '',
  joining_date: '',
  company_name: '',
  manager_name: '',
  location: '',
}

function SectionToggle({ label, count, open, onToggle, children }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide w-full text-left mb-2"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {label}
        {count > 0 && <span className="normal-case font-normal text-gray-400 ml-1">({count})</span>}
      </button>
      {open && children}
    </div>
  )
}

function TemplateForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  const [salaryOpen, setSalaryOpen] = useState(false)
  const [policiesOpen, setPoliciesOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const textareaRef = useRef(null)

  const insertPlaceholder = (ph) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setForm(f => ({ ...f, body: f.body + ph }))
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const body = textarea.value
    const newBody = body.substring(0, start) + ph + body.substring(end)
    setForm(f => ({ ...f, body: newBody }))
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = textarea.selectionEnd = start + ph.length
    }, 0)
  }

  const addSalary = () =>
    setForm(f => ({ ...f, salary_components: [...f.salary_components, { label: '', value: '', is_fixed: true }] }))
  const removeSalary = (i) =>
    setForm(f => ({ ...f, salary_components: f.salary_components.filter((_, idx) => idx !== i) }))
  const updateSalary = (i, field, val) =>
    setForm(f => ({
      ...f,
      salary_components: f.salary_components.map((s, idx) => idx === i ? { ...s, [field]: val } : s),
    }))

  const addListItem = (field) =>
    setForm(f => ({ ...f, [field]: [...f[field], ''] }))
  const removeListItem = (field, i) =>
    setForm(f => ({ ...f, [field]: f[field].filter((_, idx) => idx !== i) }))
  const updateListItem = (field, i, val) =>
    setForm(f => ({ ...f, [field]: f[field].map((v, idx) => idx === i ? val : v) }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      policies: form.policies.filter(p => p.trim()),
      rules: form.rules.filter(r => r.trim()),
      salary_components: form.salary_components.filter(s => s.label.trim()),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Basic */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-sm font-medium text-gray-700">Template Name <span className="text-red-500">*</span></label>
          <input
            className="input w-full mt-1"
            placeholder="e.g. Standard Offer Letter"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Type <span className="text-red-500">*</span></label>
          <select
            className="input w-full mt-1"
            value={form.template_type}
            onChange={e => setForm(f => ({ ...f, template_type: e.target.value }))}
          >
            {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Subject / Title</label>
          <input
            className="input w-full mt-1"
            placeholder="Email subject or document title"
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
          />
        </div>
      </div>

      {/* Body editor */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">Body / Content <span className="text-red-500">*</span></label>
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDERS.map(ph => (
              <button
                key={ph}
                type="button"
                onClick={() => insertPlaceholder(ph)}
                className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 font-mono"
              >
                {ph}
              </button>
            ))}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          className="input w-full resize-none font-mono text-sm"
          rows={10}
          placeholder="Write your template body here. Use placeholders like {{candidate_name}} for dynamic content."
          value={form.body}
          onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          required
        />
        <p className="text-xs text-gray-400 mt-1">Click a placeholder above to insert it at the cursor.</p>
      </div>

      {/* Salary Components */}
      <SectionToggle
        label="Salary Components"
        count={form.salary_components.length}
        open={salaryOpen}
        onToggle={() => setSalaryOpen(o => !o)}
      >
        <div className="space-y-2 mt-2">
          {form.salary_components.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="Label (e.g. Basic Salary)"
                value={s.label}
                onChange={e => updateSalary(i, 'label', e.target.value)}
              />
              <input
                className="input w-36"
                placeholder="Value / Amount"
                value={s.value}
                onChange={e => updateSalary(i, 'value', e.target.value)}
              />
              <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={s.is_fixed}
                  onChange={e => updateSalary(i, 'is_fixed', e.target.checked)}
                />
                Fixed
              </label>
              <button type="button" onClick={() => removeSalary(i)} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addSalary} className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Component
          </button>
        </div>
      </SectionToggle>

      {/* Policies */}
      <SectionToggle
        label="Policies"
        count={form.policies.length}
        open={policiesOpen}
        onToggle={() => setPoliciesOpen(o => !o)}
      >
        <div className="space-y-2 mt-2">
          {form.policies.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="Policy statement"
                value={p}
                onChange={e => updateListItem('policies', i, e.target.value)}
              />
              <button type="button" onClick={() => removeListItem('policies', i)} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => addListItem('policies')} className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Policy
          </button>
        </div>
      </SectionToggle>

      {/* Rules */}
      <SectionToggle
        label="Terms & Rules"
        count={form.rules.length}
        open={rulesOpen}
        onToggle={() => setRulesOpen(o => !o)}
      >
        <div className="space-y-2 mt-2">
          {form.rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="Rule or term"
                value={r}
                onChange={e => updateListItem('rules', i, e.target.value)}
              />
              <button type="button" onClick={() => removeListItem('rules', i)} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => addListItem('rules')} className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </button>
        </div>
      </SectionToggle>

      {/* Default flag */}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
        />
        Set as default template for this type
      </label>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save Template'}
        </button>
      </div>
    </form>
  )
}

function GenerateModal({ template, onClose }) {
  const [form, setForm] = useState(EMPTY_GENERATE)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)

  const handleGenerate = async (e) => {
    e.preventDefault()
    setGenerating(true)
    try {
      const res = await hrmService.generateFromTemplate(template.id, form)
      setResult(res.data)
      toast.success('Document generated')
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to generate document'
      toast.error(msg)
    }
    setGenerating(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 py-8 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Generate Document</h2>
            <p className="text-sm text-gray-500">{template.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {!result ? (
          <form onSubmit={handleGenerate} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Candidate Name</label>
                <input
                  className="input w-full mt-1"
                  placeholder="Full name"
                  value={form.candidate_name}
                  onChange={e => setForm(f => ({ ...f, candidate_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Position / Role</label>
                <input
                  className="input w-full mt-1"
                  placeholder="e.g. Software Engineer"
                  value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Department</label>
                <input
                  className="input w-full mt-1"
                  placeholder="e.g. Engineering"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">CTC / Package</label>
                <input
                  className="input w-full mt-1"
                  placeholder="e.g. ₹8,00,000 per annum"
                  value={form.ctc}
                  onChange={e => setForm(f => ({ ...f, ctc: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Joining Date</label>
                <input
                  type="date"
                  className="input w-full mt-1"
                  value={form.joining_date}
                  onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Location</label>
                <input
                  className="input w-full mt-1"
                  placeholder="e.g. Bangalore"
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Company Name</label>
                <input
                  className="input w-full mt-1"
                  placeholder="Your company name"
                  value={form.company_name}
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Reporting Manager</label>
                <input
                  className="input w-full mt-1"
                  placeholder="Manager's full name"
                  value={form.manager_name}
                  onChange={e => setForm(f => ({ ...f, manager_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={generating} className="btn-primary flex items-center gap-2">
                <Wand2 className="w-4 h-4" />
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4">
            {result.subject && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Subject</p>
                <p className="text-gray-900">{result.subject}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Document Body</p>
              <pre className="whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 max-h-96 overflow-y-auto font-sans">
                {result.rendered_body}
              </pre>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(result.rendered_body)}
                className="btn-secondary text-sm"
              >
                Copy to Clipboard
              </button>
              <button type="button" onClick={onClose} className="btn-primary text-sm">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OfferTemplates() {
  const [templates, setTemplates]       = useState([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [mode, setMode]                 = useState(null) // null | 'create' | 'edit'
  const [editing, setEditing]           = useState(null)
  const [generating, setGenerating]     = useState(null)
  const [saving, setSaving]             = useState(false)
  const [filterType, setFilterType]     = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterType) params.template_type = filterType
      const res = await hrmService.listTemplates(params)
      setTemplates(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [filterType])

  const openCreate = () => {
    setEditing(null)
    setMode('create')
  }

  const openEdit = async (id) => {
    try {
      const res = await hrmService.getTemplate(id)
      setEditing(res.data)
      setMode('edit')
    } catch {}
  }

  const handleSave = async (data) => {
    setSaving(true)
    try {
      if (mode === 'create') {
        await hrmService.createTemplate(data)
        toast.success('Template created')
      } else {
        await hrmService.updateTemplate(editing.id, data)
        toast.success('Template updated')
      }
      setMode(null)
      setEditing(null)
      load()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to save template'
      toast.error(msg)
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return
    try {
      await hrmService.deleteTemplate(id)
      toast.success('Template deleted')
      load()
    } catch {
      toast.error('Failed to delete template')
    }
  }

  const typeLabel = (val) => TEMPLATE_TYPES.find(t => t.value === val)?.label || val

  if (mode) {
    const initial = mode === 'edit' && editing
      ? {
          name: editing.name || '',
          template_type: editing.template_type || 'offer_letter',
          subject: editing.subject || '',
          body: editing.body || '',
          is_default: editing.is_default || false,
          salary_components: editing.salary_components || [],
          policies: editing.policies || [],
          rules: editing.rules || [],
        }
      : EMPTY_TEMPLATE

    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => { setMode(null); setEditing(null) }} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {mode === 'create' ? 'Create Template' : 'Edit Template'}
          </h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <TemplateForm
            initial={initial}
            onSave={handleSave}
            onCancel={() => { setMode(null); setEditing(null) }}
            saving={saving}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offer Templates</h1>
          <p className="text-sm text-gray-500">{total} template{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !filterType ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {TEMPLATE_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setFilterType(t.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterType === t.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No templates yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first offer letter template</p>
          <button onClick={openCreate} className="mt-4 btn-primary text-sm">
            <Plus className="w-4 h-4 inline mr-1" /> Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{t.name}</h3>
                    {t.is_default && (
                      <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">Default</span>
                    )}
                  </div>
                  {t.subject && <p className="text-sm text-gray-500 mt-0.5 truncate">{t.subject}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TYPE_COLORS[t.template_type] || 'bg-gray-100 text-gray-700'}`}>
                  {typeLabel(t.template_type)}
                </span>
              </div>

              {/* Body preview */}
              <p className="text-sm text-gray-500 line-clamp-2">{t.body}</p>

              {/* Stats */}
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {t.salary_components?.length > 0 && (
                  <span>{t.salary_components.length} salary component{t.salary_components.length !== 1 ? 's' : ''}</span>
                )}
                {t.policies?.length > 0 && (
                  <span>{t.policies.length} polic{t.policies.length !== 1 ? 'ies' : 'y'}</span>
                )}
                {t.rules?.length > 0 && (
                  <span>{t.rules.length} rule{t.rules.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                <button
                  onClick={() => setGenerating(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Generate
                </button>
                <button
                  onClick={() => openEdit(t.id)}
                  className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="flex items-center justify-center text-sm text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {generating && (
        <GenerateModal template={generating} onClose={() => setGenerating(null)} />
      )}
    </div>
  )
}
