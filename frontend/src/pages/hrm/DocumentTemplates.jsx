import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Plus, Search, Filter, Edit2, Trash2, Copy, Eye,
  Zap, Clock, Tag, Grid, List, ChevronDown, X, MoreVertical,
  FileCheck, AlertCircle, Download, History, Star
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS = {
  offer_letter: 'Offer Letter', appointment_letter: 'Appointment Letter',
  experience_letter: 'Experience Letter', relieving_letter: 'Relieving Letter',
  joining_letter: 'Joining Letter', promotion_letter: 'Promotion Letter',
  increment_letter: 'Increment Letter', warning_letter: 'Warning Letter',
  nda_agreement: 'NDA Agreement', hr_policy: 'HR Policy',
  payslip: 'Payslip', salary_revision: 'Salary Revision Letter',
  internship_letter: 'Internship Letter', internship_completion: 'Internship Completion',
  employee_id_letter: 'Employee ID Letter', bonafide_letter: 'Bonafide Letter',
  wfh_approval: 'WFH Approval', leave_approval: 'Leave Approval',
  termination_letter: 'Termination Letter', custom: 'Custom Template',
}

const CATEGORIES = [
  { value: '', label: 'All Templates' },
  { value: 'hr', label: 'HR' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'legal', label: 'Legal' },
  { value: 'finance', label: 'Finance' },
  { value: 'employee', label: 'Employee' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'custom', label: 'Custom' },
]

const CATEGORY_COLORS = {
  hr: '#3B82F6', recruitment: '#8B5CF6', payroll: '#10B981',
  legal: '#F59E0B', finance: '#06B6D4', employee: '#EC4899',
  compliance: '#EF4444', custom: '#6B7280',
}

const DOC_TYPE_ICONS = {
  offer_letter: '📄', appointment_letter: '📋', experience_letter: '🏆',
  relieving_letter: '👋', joining_letter: '🎉', promotion_letter: '⬆️',
  increment_letter: '💰', warning_letter: '⚠️', nda_agreement: '🔒',
  hr_policy: '📚', payslip: '💵', salary_revision: '💹',
  internship_letter: '🎓', internship_completion: '🎓', employee_id_letter: '🪪',
  bonafide_letter: '📜', wfh_approval: '🏠', leave_approval: '✅',
  termination_letter: '❌', custom: '⚙️',
}

// ─── Clone Modal ──────────────────────────────────────────────────────────────

function CloneModal({ template, onClose, onClone }) {
  const [name, setName] = useState(`Copy of ${template.name}`)
  const [loading, setLoading] = useState(false)

  const handleClone = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await onClone(template.id, { name: name.trim() })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Clone Template
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Create a copy of <strong>{template.name}</strong>
        </p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm mb-4"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          placeholder="New template name"
          autoFocus
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleClone} disabled={loading || !name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent-blue)' }}>
            {loading ? 'Cloning...' : 'Clone Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ template, onEdit, onDelete, onClone, onGenerate, onPreview }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const catColor = CATEGORY_COLORS[template.category] || '#6B7280'
  const typeIcon = DOC_TYPE_ICONS[template.doc_type] || '📄'
  const typeLabel = DOC_TYPE_LABELS[template.doc_type] || template.doc_type

  return (
    <div className="rounded-xl border p-5 relative group transition-all hover:shadow-lg"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{ background: `${catColor}20` }}>
            {typeIcon}
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
              {template.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {typeLabel}
            </p>
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'var(--bg-secondary)' }}>
            <MoreVertical size={14} style={{ color: 'var(--text-secondary)' }} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 rounded-lg border shadow-xl py-1 min-w-[160px]"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              {[
                { icon: Edit2, label: 'Edit Template', action: () => { onEdit(template); setMenuOpen(false) } },
                { icon: Zap, label: 'Generate Document', action: () => { onGenerate(template); setMenuOpen(false) } },
                { icon: Eye, label: 'Preview', action: () => { onPreview(template); setMenuOpen(false) } },
                { icon: Copy, label: 'Clone', action: () => { onClone(template); setMenuOpen(false) } },
                { icon: History, label: 'Version History', action: () => { onEdit(template, 'versions'); setMenuOpen(false) } },
                { icon: Trash2, label: 'Delete', action: () => { onDelete(template); setMenuOpen(false) }, danger: true },
              ].map(({ icon: Icon, label, action, danger }) => (
                <button key={label} onClick={action}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ color: danger ? '#EF4444' : 'var(--text-primary)' }}>
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: `${catColor}20`, color: catColor }}>
          {template.category}
        </span>
        {template.is_default && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            Default
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full text-xs"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          v{template.version || 1}
        </span>
      </div>

      {/* Description */}
      {template.description && (
        <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {template.description}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 mb-4 text-xs" style={{ color: 'var(--text-disabled)' }}>
        <span className="flex items-center gap-1">
          <FileCheck size={11} />
          {template.generation_count || 0} generated
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {template.updated_at
            ? new Date(template.updated_at + 'Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            : '—'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => onEdit(template)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          <Edit2 size={12} /> Edit
        </button>
        <button onClick={() => onGenerate(template)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
          style={{ background: 'var(--accent-blue)' }}>
          <Zap size={12} /> Generate
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [category, setCategory]     = useState('')
  const [docType, setDocType]       = useState('')
  const [viewMode, setViewMode]     = useState('grid')
  const [page, setPage]             = useState(1)
  const [total, setTotal]           = useState(0)
  const [cloneTarget, setCloneTarget] = useState(null)
  const [menuOpen, setMenuOpen]     = useState(false)

  const PAGE_SIZE = 12

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.listDocumentTemplates({
        search: search || undefined,
        category: category || undefined,
        doc_type: docType || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setTemplates(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch {
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [search, category, docType, page])

  useEffect(() => { load() }, [load])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [search, category, docType])

  const handleDelete = async (template) => {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return
    try {
      await hrmService.deleteDocumentTemplate(template.id)
      toast.success('Template deleted')
      load()
    } catch {
      toast.error('Failed to delete template')
    }
  }

  const handleClone = async (templateId, data) => {
    try {
      const res = await hrmService.cloneDocumentTemplate(templateId, data)
      toast.success('Template cloned successfully')
      load()
    } catch {
      toast.error('Failed to clone template')
    }
  }

  const handleGenerate = (template) => {
    navigate(`/hrm/doc-generator?template=${template.id}`)
  }

  const handleEdit = (template, tab) => {
    navigate(`/hrm/doc-builder/${template.id}${tab ? `?tab=${tab}` : ''}`)
  }

  const handlePreview = (template) => {
    navigate(`/hrm/doc-generator?template=${template.id}&preview=1`)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Document Templates
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Design, manage and generate professional HR documents
          </p>
        </div>
        <button
          onClick={() => navigate('/hrm/doc-builder/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--accent-blue)' }}>
          <Plus size={16} /> New Template
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Templates', value: total, icon: FileText, color: '#3B82F6' },
          { label: 'Active', value: templates.filter(t => t.is_active).length, icon: FileCheck, color: '#10B981' },
          { label: 'Generated', value: templates.reduce((s, t) => s + (t.generation_count || 0), 0), icon: Zap, color: '#8B5CF6' },
          { label: 'Categories', value: [...new Set(templates.map(t => t.category))].length, icon: Tag, color: '#F59E0B' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${color}20` }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-secondary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Category filter */}
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        {/* Doc type filter */}
        <select value={docType} onChange={e => setDocType(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
          <option value="">All Types</option>
          {Object.entries(DOC_TYPE_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex rounded-lg border overflow-hidden"
          style={{ borderColor: 'var(--border-color)' }}>
          {[['grid', Grid], ['list', List]].map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className="px-3 py-2 transition-colors"
              style={{
                background: viewMode === mode ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                color: viewMode === mode ? '#fff' : 'var(--text-secondary)',
              }}>
              <Icon size={14} />
            </button>
          ))}
        </div>

        {(search || category || docType) && (
          <button onClick={() => { setSearch(''); setCategory(''); setDocType('') }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: '#EF444420', color: '#EF4444' }}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Category quick-tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button key={cat.value}
            onClick={() => setCategory(cat.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
            style={{
              background: category === cat.value
                ? (CATEGORY_COLORS[cat.value] || 'var(--accent-blue)')
                : 'var(--bg-secondary)',
              color: category === cat.value ? '#fff' : 'var(--text-secondary)',
            }}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-3'}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border h-48 animate-pulse"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={48} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--text-secondary)' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Templates Found</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            {search || category || docType ? 'Try different filters' : 'Create your first document template'}
          </p>
          {!search && !category && !docType && (
            <button onClick={() => navigate('/hrm/doc-builder/new')}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent-blue)' }}>
              <Plus size={14} className="inline mr-1.5" /> Create Template
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.map(t => (
            <TemplateCard key={t.id} template={t}
              onEdit={handleEdit} onDelete={handleDelete}
              onClone={setCloneTarget} onGenerate={handleGenerate}
              onPreview={handlePreview} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-4 p-4 rounded-xl border hover:shadow-md transition-all"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <div className="text-xl w-8 text-center">{DOC_TYPE_ICONS[t.doc_type] || '📄'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs"
                    style={{ background: `${CATEGORY_COLORS[t.category] || '#6B7280'}20`, color: CATEGORY_COLORS[t.category] || '#6B7280' }}>
                    {t.category}
                  </span>
                  {t.is_default && <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Default</span>}
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {DOC_TYPE_LABELS[t.doc_type]} · v{t.version || 1} · {t.generation_count || 0} generated
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleEdit(t)} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                  <Edit2 size={12} className="inline mr-1" /> Edit
                </button>
                <button onClick={() => handleGenerate(t)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--accent-blue)' }}>
                  <Zap size={12} className="inline mr-1" /> Generate
                </button>
                <button onClick={() => setCloneTarget(t)} className="p-1.5 rounded-lg"
                  style={{ background: 'var(--bg-secondary)' }}>
                  <Copy size={13} style={{ color: 'var(--text-secondary)' }} />
                </button>
                <button onClick={() => handleDelete(t)} className="p-1.5 rounded-lg"
                  style={{ background: '#EF444415' }}>
                  <Trash2 size={13} style={{ color: '#EF4444' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = page <= 3 ? i + 1 : page + i - 2
              if (pg < 1 || pg > totalPages) return null
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{
                    background: pg === page ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                    color: pg === page ? '#fff' : 'var(--text-primary)',
                  }}>
                  {pg}
                </button>
              )
            })}
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {cloneTarget && (
        <CloneModal
          template={cloneTarget}
          onClose={() => setCloneTarget(null)}
          onClone={handleClone}
        />
      )}
    </div>
  )
}
