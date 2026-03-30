import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Briefcase, Tag, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SelectField,
  SaveBtn, CancelBtn, SkeletonLoader, Toggle,
} from './SettingsLayout'

const Modal = ({ open, title, children, onClose }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-100 rounded-lg"><X className="w-4 h-4 text-surface-500" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const ItemRow = ({ item, onEdit, onDelete, deleting }) => (
  <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-50 transition-colors">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-surface-900">{item.name}</p>
      {item.description && <p className="text-xs text-surface-400 mt-0.5 truncate">{item.description}</p>}
    </div>
    <span className={`text-xs px-2 py-0.5 rounded-full ${item.is_active !== false ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'}`}>
      {item.is_active !== false ? 'Active' : 'Inactive'}
    </span>
    <button onClick={() => onEdit(item)} className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors">
      <Pencil className="w-3.5 h-3.5 text-surface-500" />
    </button>
    <button onClick={() => onDelete(item.id)} disabled={deleting === item.id} className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors">
      {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-danger-500" /> : <Trash2 className="w-3.5 h-3.5 text-danger-500" />}
    </button>
  </div>
)

const JobCategoriesPage = () => {
  const [categories, setCategories] = useState([])
  const [skills, setSkills]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [activeTab, setActiveTab]   = useState('categories')
  const [modal, setModal]           = useState(null) // null | 'category' | 'skill'
  const [editing, setEditing]       = useState(null)
  const [catForm, setCatForm]       = useState({ name: '', parent_id: '', description: '', is_active: true })
  const [skillForm, setSkillForm]   = useState({ name: '', category_id: '', description: '', is_active: true })
  const [deleting, setDeleting]     = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [cRes, sRes] = await Promise.all([
        tenantSettingsService.getJobCategories(),
        tenantSettingsService.getSkills(),
      ])
      setCategories(cRes.data || [])
      setSkills(sRes.data || [])
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCategoryModal = (cat = null) => {
    setEditing(cat?.id || null)
    setCatForm(cat ? { name: cat.name, parent_id: cat.parent_id || '', description: cat.description || '', is_active: cat.is_active !== false } : { name: '', parent_id: '', description: '', is_active: true })
    setModal('category')
  }

  const openSkillModal = (skill = null) => {
    setEditing(skill?.id || null)
    setSkillForm(skill ? { name: skill.name, category_id: skill.category_id || '', description: skill.description || '', is_active: skill.is_active !== false } : { name: '', category_id: '', description: '', is_active: true })
    setModal('skill')
  }

  const saveCategory = async () => {
    if (!catForm.name.trim()) { toast.error('Name required'); return }
    try {
      setSaving(true)
      if (editing) {
        await tenantSettingsService.updateJobCategory(editing, catForm)
        toast.success('Category updated')
      } else {
        await tenantSettingsService.createJobCategory(catForm)
        toast.success('Category created')
      }
      setModal(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveSkill = async () => {
    if (!skillForm.name.trim()) { toast.error('Name required'); return }
    try {
      setSaving(true)
      if (editing) {
        await tenantSettingsService.updateSkill(editing, skillForm)
        toast.success('Skill updated')
      } else {
        await tenantSettingsService.createSkill(skillForm)
        toast.success('Skill created')
      }
      setModal(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const deleteCategory = async (id) => {
    try { setDeleting(id); await tenantSettingsService.deleteJobCategory(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed to delete') }
    finally { setDeleting(null) }
  }

  const deleteSkill = async (id) => {
    try { setDeleting(id); await tenantSettingsService.deleteSkill(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed to delete') }
    finally { setDeleting(null) }
  }

  const topCategories = categories.filter(c => !c.parent_id)
  const getChildren = (parentId) => categories.filter(c => c.parent_id === parentId)

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb page="Job Categories & Skills" />
      <PageHeader title="Job Categories & Skills" description="Manage your job taxonomy and skill library." />

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-xl mb-6 w-fit">
        {['categories', 'skills'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize
                        ${activeTab === tab ? 'bg-white text-accent-600 shadow-sm' : 'text-surface-500 hover:text-surface-800'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'categories' && (
        <SectionCard
          title="Job Categories"
          icon={Briefcase}
          className="[&_.p-6]:p-0"
        >
          <div className="flex items-center justify-between px-6 py-3 border-b border-surface-100">
            <p className="text-sm text-surface-500">{categories.length} categories</p>
            <button onClick={() => openCategoryModal()} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-600 text-white text-xs font-medium rounded-lg hover:bg-accent-700 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Category
            </button>
          </div>
          <div className="divide-y divide-surface-50">
            {topCategories.length === 0 && (
              <p className="text-sm text-surface-400 text-center py-8">No categories yet.</p>
            )}
            {topCategories.map(cat => (
              <div key={cat.id}>
                <ItemRow item={cat} onEdit={openCategoryModal} onDelete={deleteCategory} deleting={deleting} />
                {getChildren(cat.id).map(child => (
                  <div key={child.id} className="pl-8 border-l-2 border-surface-100 ml-6">
                    <ItemRow item={child} onEdit={openCategoryModal} onDelete={deleteCategory} deleting={deleting} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {activeTab === 'skills' && (
        <SectionCard title="Skills" icon={Tag} className="[&_.p-6]:p-0">
          <div className="flex items-center justify-between px-6 py-3 border-b border-surface-100">
            <p className="text-sm text-surface-500">{skills.length} skills</p>
            <button onClick={() => openSkillModal()} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-600 text-white text-xs font-medium rounded-lg hover:bg-accent-700 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Skill
            </button>
          </div>
          <div className="divide-y divide-surface-50">
            {skills.length === 0 && (
              <p className="text-sm text-surface-400 text-center py-8">No skills yet.</p>
            )}
            {skills.map(skill => (
              <ItemRow key={skill.id} item={skill} onEdit={openSkillModal} onDelete={deleteSkill} deleting={deleting} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Category Modal */}
      <Modal open={modal === 'category'} title={editing ? 'Edit Category' : 'New Category'} onClose={() => setModal(null)}>
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Technology" />
          </Field>
          <Field label="Parent Category">
            <SelectField value={catForm.parent_id} onChange={e => setCatForm(f => ({ ...f, parent_id: e.target.value }))}>
              <option value="">None (top-level)</option>
              {categories.filter(c => c.id !== editing).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Description">
            <Input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </Field>
          <div className="border border-surface-100 rounded-lg px-3">
            <Toggle checked={catForm.is_active} onChange={v => setCatForm(f => ({ ...f, is_active: v }))} label="Active" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <CancelBtn onClick={() => setModal(null)} />
            <SaveBtn saving={saving} onClick={saveCategory} label={editing ? 'Update' : 'Create'} />
          </div>
        </div>
      </Modal>

      {/* Skill Modal */}
      <Modal open={modal === 'skill'} title={editing ? 'Edit Skill' : 'New Skill'} onClose={() => setModal(null)}>
        <div className="space-y-4">
          <Field label="Skill Name" required>
            <Input value={skillForm.name} onChange={e => setSkillForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. React.js" />
          </Field>
          <Field label="Category">
            <SelectField value={skillForm.category_id} onChange={e => setSkillForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
          </Field>
          <Field label="Description">
            <Input value={skillForm.description} onChange={e => setSkillForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </Field>
          <div className="border border-surface-100 rounded-lg px-3">
            <Toggle checked={skillForm.is_active} onChange={v => setSkillForm(f => ({ ...f, is_active: v }))} label="Active" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <CancelBtn onClick={() => setModal(null)} />
            <SaveBtn saving={saving} onClick={saveSkill} label={editing ? 'Update' : 'Create'} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default JobCategoriesPage
