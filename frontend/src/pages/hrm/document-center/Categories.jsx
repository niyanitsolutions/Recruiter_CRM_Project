import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FolderOpen, Plus, Edit2, Trash2, Loader2, Search, RefreshCw,
  X, Check, FileText, Folder, Tag,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const ICON_OPTIONS = [
  { value: 'folder',   label: 'Folder',   Icon: Folder },
  { value: 'file',     label: 'File',     Icon: FileText },
  { value: 'tag',      label: 'Tag',      Icon: Tag },
]

const COLOR_PRESETS = [
  '#7c3aed', '#4f46e5', '#0891b2', '#059669', '#d97706',
  '#dc2626', '#db2777', '#7c3aed', '#374151', '#1e40af',
]

// ─── Category Form Modal ───────────────────────────────────────────────────────
function CategoryModal({ category, onClose, onSaved }) {
  const [name,        setName]        = useState(category?.name || '')
  const [description, setDescription] = useState(category?.description || '')
  const [color,       setColor]       = useState(category?.color || '#7c3aed')
  const [icon,        setIcon]        = useState(category?.icon || 'folder')
  const [sortOrder,   setSortOrder]   = useState(category?.sort_order ?? 0)
  const [saving,      setSaving]      = useState(false)
  const [customColor, setCustomColor] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Category name is required'); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), description, color, icon, sort_order: sortOrder }
      if (category) {
        await documentCenterService.updateCategory(category._id || category.id, payload)
        toast.success('Category updated')
      } else {
        await documentCenterService.createCategory(payload)
        toast.success('Category created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold text-base" style={{ color: 'var(--text-heading)' }}>
            {category ? 'Edit Category' : 'New Category'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: color + '20', border: `2px solid ${color}` }}>
              <FolderOpen className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>
                {name || 'Category Name'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {description || 'Category description'}
              </p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. HR Letters, Legal Documents…"
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-accent-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description…"
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-accent-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Color</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-lg transition-all hover:scale-110 flex-shrink-0"
                  style={{
                    background: c,
                    outline: color === c ? `3px solid ${c}` : 'none',
                    outlineOffset: 2,
                  }}
                  title={c}
                />
              ))}
              <button
                onClick={() => setCustomColor(v => !v)}
                className="w-7 h-7 rounded-lg border-2 border-dashed flex items-center justify-center text-xs transition-all hover:scale-110"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                title="Custom color"
              >
                +
              </button>
            </div>
            {customColor && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer border"
                  style={{ borderColor: 'var(--border)' }}
                />
                <input
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  placeholder="#7c3aed"
                  className="flex-1 px-2 py-1 text-xs rounded border font-mono focus:outline-none focus:ring-1 focus:ring-accent-500"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                />
              </div>
            )}
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={e => setSortOrder(+e.target.value)}
              min={0}
              className="w-24 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-accent-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg text-sm border font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #167CFB, #0267F9)' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : category ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Category Card ─────────────────────────────────────────────────────────────
function CategoryCard({ category, onEdit, onDelete }) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const id = category._id || category.id

  const handleDelete = async () => {
    if (!confirm(`Delete category "${category.name}"? Templates in this category will be uncategorized.`)) return
    setDeleting(true)
    try {
      await documentCenterService.deleteCategory(id)
      toast.success('Category deleted')
      onDelete()
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="group relative flex flex-col rounded-2xl border overflow-hidden transition-all hover:shadow-lg"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      {/* Color bar */}
      <div className="h-2 w-full" style={{ background: category.color || '#7c3aed' }} />

      <div className="p-5 flex-1 flex flex-col">
        {/* Icon + name */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: (category.color || '#7c3aed') + '18' }}
          >
            <FolderOpen className="w-5 h-5" style={{ color: category.color || '#7c3aed' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-heading)' }} title={category.name}>
              {category.name}
            </h3>
            {category.description && (
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                {category.description}
              </p>
            )}
          </div>
        </div>

        {/* Template count */}
        <div className="flex items-center gap-1.5 text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          <FileText className="w-3.5 h-3.5" />
          <span>{category.template_count || 0} template{(category.template_count || 0) !== 1 ? 's' : ''}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <button
            onClick={() => navigate(`/hrm/doc-center/templates?category=${id}`)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-accent-50 dark:hover:bg-accent-900/20"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
          >
            <FileText className="w-3 h-3" /> View Templates
          </button>
          <button
            onClick={() => onEdit(category)}
            className="p-1.5 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
            style={{ borderColor: 'var(--border)' }}
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg border transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            style={{ borderColor: 'var(--border)' }}
            title="Delete"
          >
            {deleting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
              : <Trash2 className="w-3.5 h-3.5 text-red-400" />
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [showModal,  setShowModal]  = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listCategories()
      setCategories(r.data?.data || [])
    } catch {
      toast.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditTarget(null); setShowModal(true) }
  const openEdit   = (cat) => { setEditTarget(cat); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditTarget(null) }

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalTemplates = categories.reduce((sum, c) => sum + (c.template_count || 0), 0)

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Categories</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} · {totalTemplates} total templates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg border" style={{ borderColor: 'var(--border)' }} title="Refresh">
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #167CFB, #0267F9)' }}
            >
              <Plus className="w-4 h-4" /> New Category
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-accent-500"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FolderOpen className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium mb-1" style={{ color: 'var(--text-heading)' }}>
              {search ? 'No matching categories' : 'No categories yet'}
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {search
                ? 'Try a different search term'
                : 'Create categories to organise your document templates'}
            </p>
            {!search && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #167CFB, #0267F9)' }}
              >
                <Plus className="w-4 h-4" /> Create First Category
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(cat => (
              <CategoryCard
                key={cat._id || cat.id}
                category={cat}
                onEdit={openEdit}
                onDelete={load}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Info Footer ── */}
      {!loading && categories.length > 0 && (
        <div className="px-6 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Tip: Deleting a category moves all its templates to "No Category". Templates are not deleted.
          </p>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <CategoryModal
          category={editTarget}
          onClose={closeModal}
          onSaved={load}
        />
      )}
    </div>
  )
}
