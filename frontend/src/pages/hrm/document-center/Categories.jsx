import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Folder, Loader2, Check, X } from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const ICONS   = ['folder', 'file', 'briefcase', 'star', 'award', 'tag', 'layers', 'grid']
const PALETTE = ['#7c3aed','#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#64748b','#1f2937']

const CategoryForm = ({ initial, onSave, onCancel }) => {
  const [name,  setName]  = useState(initial?.name  || '')
  const [desc,  setDesc]  = useState(initial?.description || '')
  const [color, setColor] = useState(initial?.color || '#7c3aed')
  const [icon,  setIcon]  = useState(initial?.icon  || 'folder')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try { await onSave({ name: name.trim(), description: desc, color, icon }) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-xl p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} required
          className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          placeholder="e.g. HR Letters" />
      </div>
      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
        <input value={desc} onChange={e => setDesc(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          placeholder="Category description…" />
      </div>
      <div>
        <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Color</label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="w-7 h-7 rounded-full border-2 transition-all"
              style={{ background: c, borderColor: color === c ? 'white' : 'transparent', boxShadow: color === c ? `0 0 0 2px ${c}` : 'none' }} />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Cancel</button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white rounded-lg"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {initial ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  )
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showNew,    setShowNew]    = useState(false)
  const [editing,    setEditing]    = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listCategories()
      setCategories(r.data?.data || [])
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (data) => {
    try {
      await documentCenterService.createCategory(data)
      toast.success('Category created')
      setShowNew(false)
      load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed') }
  }

  const handleUpdate = async (id, data) => {
    try {
      await documentCenterService.updateCategory(id, data)
      toast.success('Category updated')
      setEditing(null)
      load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this category? Templates in this category will be uncategorized.')) return
    try {
      await documentCenterService.deleteCategory(id)
      toast.success('Deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Categories</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Organize templates into categories</p>
        </div>
        <button onClick={() => { setShowNew(true); setEditing(null) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

      {showNew && (
        <div className="mb-4">
          <CategoryForm onSave={handleCreate} onCancel={() => setShowNew(false)} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      ) : categories.length === 0 && !showNew ? (
        <div className="text-center py-16 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <Folder className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p style={{ color: 'var(--text-muted)' }}>No categories yet. Create one to organize your templates.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map(cat => (
            editing === cat._id ? (
              <CategoryForm key={cat._id} initial={cat}
                onSave={(data) => handleUpdate(cat._id, data)}
                onCancel={() => setEditing(null)} />
            ) : (
              <div key={cat._id}
                className="flex items-center gap-4 border rounded-xl p-4 transition-colors hover:border-violet-300"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: cat.color + '20' }}>
                  <Folder className="w-5 h-5" style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>{cat.name}</p>
                  {cat.description && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{cat.description}</p>}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{cat.template_count || 0} templates</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(cat._id)} className="p-1.5 rounded hover:bg-gray-100"><Pencil className="w-4 h-4 text-violet-600" /></button>
                  <button onClick={() => handleDelete(cat._id)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
