import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FileText, Plus, Search, Edit2, Trash2, Copy, Eye,
  Zap, Clock, Grid, List, X, MoreVertical,
  FileCheck, Download, History, Star, Archive,
  Upload, RotateCcw, ChevronRight, Tag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

// ─── Doc type config (icons, labels, descriptions, categories) ──────────────

const DOC_TYPE_CONFIG = {
  offer_letter:          { label: 'Offer Letter',           emoji: '📄', desc: 'Formal job offer with CTC details',          category: 'recruitment' },
  appointment_letter:    { label: 'Appointment Letter',     emoji: '📋', desc: 'Official employee appointment confirmation',  category: 'hr' },
  experience_letter:     { label: 'Experience Letter',      emoji: '🏆', desc: 'Work experience certificate for alumni',      category: 'hr' },
  relieving_letter:      { label: 'Relieving Letter',       emoji: '👋', desc: 'Employee relieving acceptance letter',        category: 'hr' },
  joining_letter:        { label: 'Joining Letter',         emoji: '🎉', desc: 'Welcome-to-company letter for new joinees',   category: 'hr' },
  promotion_letter:      { label: 'Promotion Letter',       emoji: '⬆️', desc: 'Employee promotion announcement',            category: 'hr' },
  increment_letter:      { label: 'Increment Letter',       emoji: '💰', desc: 'Salary increment notification letter',        category: 'hr' },
  warning_letter:        { label: 'Warning Letter',         emoji: '⚠️', desc: 'Official employee warning notice',           category: 'hr' },
  nda_agreement:         { label: 'NDA Agreement',          emoji: '🔒', desc: 'Non-disclosure and confidentiality agreement', category: 'legal' },
  hr_policy:             { label: 'HR Policy',              emoji: '📚', desc: 'Company policy and guidelines document',      category: 'hr' },
  payslip:               { label: 'Payslip',                emoji: '💵', desc: 'Monthly salary slip with full breakdown',      category: 'payroll' },
  salary_revision:       { label: 'Salary Revision',        emoji: '💹', desc: 'Salary revision letter with new CTC',         category: 'payroll' },
  internship_letter:     { label: 'Internship Letter',      emoji: '🎓', desc: 'Internship offer letter',                     category: 'recruitment' },
  internship_completion: { label: 'Internship Completion',  emoji: '🏅', desc: 'Internship completion certificate',           category: 'hr' },
  employee_id_letter:    { label: 'Employee ID Letter',     emoji: '🪪', desc: 'Employee ID card issuance letter',             category: 'employee' },
  bonafide_letter:       { label: 'Bonafide Letter',        emoji: '📜', desc: 'Bonafide certificate for employees',          category: 'employee' },
  wfh_approval:          { label: 'WFH Approval',           emoji: '🏠', desc: 'Work from home approval letter',              category: 'hr' },
  leave_approval:        { label: 'Leave Approval',         emoji: '✅', desc: 'Leave request approval letter',               category: 'hr' },
  termination_letter:    { label: 'Termination Letter',     emoji: '🚫', desc: 'Employee termination letter',                 category: 'hr' },
  custom:                { label: 'Custom Template',        emoji: '⚙️', desc: 'Build any custom document from scratch',      category: 'custom' },
}

const WIZARD_GROUPS = [
  { label: 'HR Letters',        types: ['offer_letter','appointment_letter','joining_letter','experience_letter','relieving_letter'] },
  { label: 'Compensation',      types: ['increment_letter','salary_revision','payslip','promotion_letter'] },
  { label: 'Compliance & Legal',types: ['warning_letter','nda_agreement','hr_policy','termination_letter'] },
  { label: 'Employee Docs',     types: ['bonafide_letter','employee_id_letter','wfh_approval','leave_approval'] },
  { label: 'Internship',        types: ['internship_letter','internship_completion'] },
  { label: 'Custom',            types: ['custom'] },
]

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'hr', label: 'HR' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'legal', label: 'Legal' },
  { value: 'employee', label: 'Employee' },
  { value: 'custom', label: 'Custom' },
]

const CATEGORY_COLORS = {
  hr: '#3B82F6', recruitment: '#8B5CF6', payroll: '#10B981',
  legal: '#F59E0B', employee: '#EC4899', custom: '#6B7280',
}

// ─── Local-storage helpers (favorites + recently used) ───────────────────────

const FAV_KEY    = 'doc_template_favorites'
const RECENT_KEY = 'doc_template_recent'

const getFavorites = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } }
const saveFavorites = (arr) => localStorage.setItem(FAV_KEY, JSON.stringify(arr))
const getRecent    = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }

function pushRecent(template) {
  const prev = getRecent().filter(r => r.id !== template.id)
  localStorage.setItem(RECENT_KEY, JSON.stringify(
    [{ id: template.id, name: template.name, doc_type: template.doc_type },...prev].slice(0, 8)
  ))
}

function exportTemplateJson(template) {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${template.name.replace(/\s+/g,'_')}.json`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Type Wizard Modal ────────────────────────────────────────────────────────

function TypeCard({ typeKey, cfg, onSelect }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={() => onSelect(typeKey)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="text-left p-4 rounded-xl border-2 transition-all"
      style={{
        background: hovered ? 'var(--bg-hover)' : 'var(--bg-secondary)',
        borderColor: hovered ? 'var(--accent-blue)' : 'var(--border-color)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 4px 12px rgba(0,0,0,0.10)' : 'none',
      }}
    >
      <div className="text-2xl mb-2">{cfg.emoji}</div>
      <p className="font-semibold text-xs leading-tight mb-1" style={{ color: 'var(--text-primary)' }}>
        {cfg.label}
      </p>
      <p className="text-xs leading-snug" style={{
        color: 'var(--text-secondary)',
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {cfg.desc}
      </p>
      {hovered && (
        <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>
          Start Building <ChevronRight size={11} />
        </div>
      )}
    </button>
  )
}

function TypeWizard({ onSelect, onClose }) {
  const [search, setSearch] = useState('')

  const filteredEntries = search.trim()
    ? Object.entries(DOC_TYPE_CONFIG).filter(([, cfg]) =>
        cfg.label.toLowerCase().includes(search.toLowerCase()) ||
        cfg.desc.toLowerCase().includes(search.toLowerCase())
      )
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b shrink-0"
             style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Choose Template Type
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Select the type of document you want to create
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
            <X size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search template types…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {filteredEntries ? (
            filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
                No template types match your search
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredEntries.map(([key, cfg]) => (
                  <TypeCard key={key} typeKey={key} cfg={cfg} onSelect={onSelect} />
                ))}
              </div>
            )
          ) : (
            WIZARD_GROUPS.map(group => (
              <div key={group.label} className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
                    style={{ color: 'var(--text-disabled)' }}>
                  {group.label}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {group.types.map(typeKey => (
                    <TypeCard key={typeKey} typeKey={typeKey} cfg={DOC_TYPE_CONFIG[typeKey]} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Onboarding Empty State ───────────────────────────────────────────────────

function OnboardingEmpty({ onCreate }) {
  const suggestions = [
    { type: 'offer_letter',      emoji: '📄', label: 'Offer Letter' },
    { type: 'payslip',           emoji: '💵', label: 'Payslip' },
    { type: 'nda_agreement',     emoji: '🔒', label: 'NDA Document' },
    { type: 'experience_letter', emoji: '🏆', label: 'Experience Letter' },
    { type: 'hr_policy',         emoji: '📚', label: 'HR Policy' },
  ]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
           style={{ background: 'var(--bg-secondary)' }}>
        <FileText size={40} style={{ color: 'var(--accent-blue)', opacity: 0.65 }} />
      </div>

      <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        No templates created yet
      </h3>
      <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
        Create professional HR documents like:
      </p>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 justify-center mb-8">
        {suggestions.map(s => (
          <button key={s.type} onClick={() => onCreate(s.type)}
            className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all hover:scale-105 hover:shadow-sm"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <span>{s.emoji}</span>{s.label}
          </button>
        ))}
      </div>

      <button onClick={() => onCreate(null)}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-lg"
        style={{ background: 'var(--accent-blue)' }}>
        <Plus size={16} /> Create Your First Template
      </button>

      {/* How it works */}
      <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
        {[
          { num: '1', label: 'Choose type',    desc: 'Pick from 20 HR document types' },
          { num: '2', label: 'Build content',  desc: 'Drag & drop blocks, add variables' },
          { num: '3', label: 'Generate docs',  desc: 'Fill form and export PDF / DOCX' },
        ].map(step => (
          <div key={step.num} className="text-center">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white mx-auto mb-2"
                 style={{ background: 'var(--accent-blue)' }}>
              {step.num}
            </div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{step.label}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Clone Modal ──────────────────────────────────────────────────────────────

function CloneModal({ template, onClose, onClone }) {
  const [name, setName]       = useState(`Copy of ${template.name}`)
  const [loading, setLoading] = useState(false)

  const handleClone = async () => {
    if (!name.trim()) return
    setLoading(true)
    try { await onClone(template.id, { name: name.trim() }); onClose() }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-xl border p-6 w-full max-w-md shadow-2xl"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Duplicate Template</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Create a copy of <strong>{template.name}</strong>
        </p>
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm mb-4 outline-none"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          placeholder="New template name" autoFocus />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>Cancel</button>
          <button onClick={handleClone} disabled={loading || !name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent-blue)' }}>
            {loading ? 'Duplicating…' : 'Duplicate Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import JSON Modal ────────────────────────────────────────────────────────

function ImportModal({ onClose, onImport }) {
  const [json, setJson]   = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef           = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setJson(ev.target.result)
    reader.readAsText(file)
  }

  const handleImport = async () => {
    setError('')
    setLoading(true)
    try {
      const data = JSON.parse(json)
      await onImport(data)
      onClose()
    } catch (e) {
      setError(e.message?.includes('JSON') ? 'Invalid JSON format.' : (e.message || 'Import failed'))
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-xl border p-6 w-full max-w-lg shadow-2xl"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Import Template</h3>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Import a template from a JSON file exported from this system.
        </p>
        <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
        <button onClick={() => fileRef.current.click()}
          className="w-full border-2 border-dashed rounded-xl p-6 mb-4 text-center transition-colors hover:border-blue-400 cursor-pointer"
          style={{ borderColor: 'var(--border-color)' }}>
          <Upload size={24} className="mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Click to select JSON file</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>or paste JSON below</p>
        </button>
        <textarea value={json} onChange={e => { setJson(e.target.value); setError('') }}
          rows={4} placeholder='{"name": "...", "doc_type": "...", "blocks": [...]}'
          className="w-full px-3 py-2 rounded-lg border text-xs font-mono mb-2 outline-none"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', resize: 'vertical' }} />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>Cancel</button>
          <button onClick={handleImport} disabled={!json.trim() || loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ background: 'var(--accent-blue)' }}>
            {loading ? 'Importing…' : 'Import Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ template, onEdit, onDelete, onClone, onGenerate, onPreview, onArchive, isFavorite, onToggleFavorite }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()
  const cfg      = DOC_TYPE_CONFIG[template.doc_type] || { emoji: '📄', label: template.doc_type, category: 'custom' }
  const catColor = CATEGORY_COLORS[template.category] || '#6B7280'

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const isArchived = template.is_active === false

  return (
    <div className="rounded-xl border p-5 relative group transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', opacity: isArchived ? 0.75 : 1 }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
               style={{ background: `${catColor}18` }}>
            {cfg.emoji}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
              {template.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{cfg.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onToggleFavorite(template.id)}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: isFavorite ? '#fef9c3' : 'var(--bg-secondary)' }}>
            <Star size={13} style={{ color: isFavorite ? '#f59e0b' : 'var(--text-secondary)', fill: isFavorite ? '#f59e0b' : 'none' }} />
          </button>
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen(v => !v)}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'var(--bg-secondary)' }}>
              <MoreVertical size={14} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 rounded-lg border shadow-xl py-1 min-w-[175px]"
                   style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                {[
                  { icon: Edit2,    label: 'Edit Template',     action: () => { onEdit(template); setMenuOpen(false) } },
                  { icon: Zap,      label: 'Generate Document', action: () => { onGenerate(template); setMenuOpen(false) } },
                  { icon: Eye,      label: 'Preview',           action: () => { onPreview(template); setMenuOpen(false) } },
                  { icon: Copy,     label: 'Duplicate',         action: () => { onClone(template); setMenuOpen(false) } },
                  { icon: History,  label: 'Version History',   action: () => { onEdit(template, 'versions'); setMenuOpen(false) } },
                  { icon: Download, label: 'Export JSON',       action: () => { exportTemplateJson(template); setMenuOpen(false) } },
                  isArchived
                    ? { icon: RotateCcw, label: 'Restore',      action: () => { onArchive(template, true); setMenuOpen(false) } }
                    : { icon: Archive,   label: 'Archive',       action: () => { onArchive(template, false); setMenuOpen(false) } },
                  { icon: Trash2,   label: 'Delete',            action: () => { onDelete(template); setMenuOpen(false) }, danger: true },
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
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: `${catColor}18`, color: catColor }}>
          {template.category}
        </span>
        {template.is_default && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Default</span>
        )}
        {isArchived && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Archived</span>
        )}
        <span className="px-2 py-0.5 rounded-full text-xs"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          v{template.version || 1}
        </span>
      </div>

      {template.description && (
        <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {template.description}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 mb-4 text-xs" style={{ color: 'var(--text-disabled)' }}>
        <span className="flex items-center gap-1"><FileCheck size={11} />{template.generation_count || 0} docs</span>
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
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          <Edit2 size={12} /> Edit
        </button>
        <button onClick={() => onGenerate(template)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
          style={{ background: 'var(--accent-blue)' }}>
          <Zap size={12} /> Generate
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentTemplates() {
  const navigate   = useNavigate()
  const location   = useLocation()

  const [templates, setTemplates]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [category, setCategory]       = useState('')
  const [docType, setDocType]         = useState('')
  const [viewMode, setViewMode]       = useState('grid')
  const [page, setPage]               = useState(1)
  const [total, setTotal]             = useState(0)
  const [activeTab, setActiveTab]     = useState('all')       // all | favorites | archived
  const [cloneTarget, setCloneTarget] = useState(null)
  const [showWizard, setShowWizard]   = useState(false)
  const [showImport, setShowImport]   = useState(false)

  const [favorites, setFavoritesState] = useState(getFavorites)

  const PAGE_SIZE  = 12
  const isArchived = activeTab === 'archived'
  const favOnly    = activeTab === 'favorites'

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    const params = {
      search:    search    || undefined,
      category:  category  || undefined,
      doc_type:  docType   || undefined,
      is_active: isArchived ? false : undefined,
      page,
      page_size: PAGE_SIZE,
    }
    hrmService.listDocumentTemplates(params)
      .then(res => {
        if (cancelled) return
        let items = res.data?.items || []
        if (favOnly) items = items.filter(t => favorites.includes(t.id))
        setTemplates(items)
        setTotal(res.data?.total || 0)
      })
      .catch(() => {
        if (cancelled) return
        setTemplates([])
        setTotal(0)
        toast.error('Failed to load templates')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [search, category, docType, page, isArchived, favOnly, favorites, location.key])

  useEffect(() => load(), [load])
  useEffect(() => { setPage(1) }, [search, category, docType, activeTab])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleDelete = async (template) => {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return
    try { await hrmService.deleteDocumentTemplate(template.id); toast.success('Template deleted'); load() }
    catch { toast.error('Failed to delete template') }
  }

  const handleClone = async (templateId, data) => {
    try { await hrmService.cloneDocumentTemplate(templateId, data); toast.success('Template duplicated'); load() }
    catch { toast.error('Failed to duplicate template') }
  }

  const handleArchive = async (template, restore) => {
    try {
      await hrmService.updateDocumentTemplate(template.id, { ...template, is_active: restore })
      toast.success(restore ? 'Template restored' : 'Template archived')
      load()
    } catch { toast.error('Failed to update template') }
  }

  const handleToggleFavorite = (id) => {
    const updated = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id]
    setFavoritesState(updated)
    saveFavorites(updated)
  }

  const handleImport = async (data) => {
    // Strip server-generated fields so a new document is created
    const { id: _id, _id: _mongoId, created_at, updated_at, created_by, generation_count, ...rest } = data
    try {
      await hrmService.createDocumentTemplate({ ...rest, name: rest.name ? `${rest.name} (imported)` : 'Imported Template' })
      toast.success('Template imported successfully')
      load()
    } catch { throw new Error('Failed to save imported template') }
  }

  const handleWizardSelect = (docType) => {
    setShowWizard(false)
    navigate(docType ? `/hrm/doc-builder/new?type=${docType}` : '/hrm/doc-builder/new')
  }

  const handleGenerate = (template) => {
    pushRecent(template)
    navigate(`/hrm/doc-generator?template=${template.id}`)
  }

  const handleEdit    = (template, tab) => navigate(`/hrm/doc-builder/${template.id}${tab ? `?tab=${tab}` : ''}`)
  const handlePreview = (template) => { pushRecent(template); navigate(`/hrm/doc-generator?template=${template.id}&preview=1`) }

  // Recently-used cross-referenced with current template list
  const recentTemplates = React.useMemo(() => {
    const recent = getRecent()
    return recent.map(r => templates.find(t => t.id === r.id)).filter(Boolean).slice(0, 6)
  }, [templates])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Document Templates
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Design, manage and generate professional HR documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Upload size={14} /> Import
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg"
            style={{ background: 'var(--accent-blue)' }}>
            <Plus size={16} /> Create Template
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Templates',     value: total,                                                              icon: FileText,  color: '#3B82F6' },
          { label: 'Active',              value: templates.filter(t => t.is_active !== false).length,                icon: FileCheck, color: '#10B981' },
          { label: 'Docs Generated',      value: templates.reduce((s, t) => s + (t.generation_count || 0), 0),       icon: Zap,       color: '#8B5CF6' },
          { label: 'Favorites',           value: favorites.length,                                                   icon: Star,      color: '#F59E0B' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
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

      {/* ── Recently Used ── */}
      {recentTemplates.length > 0 && activeTab === 'all' && !search && !category && !docType && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5"
              style={{ color: 'var(--text-disabled)' }}>
            <Clock size={12} /> Recently Used
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentTemplates.map(t => {
              const cfg = DOC_TYPE_CONFIG[t.doc_type] || { emoji: '📄' }
              return (
                <button key={t.id} onClick={() => handleGenerate(t)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border whitespace-nowrap text-sm transition-all hover:shadow-sm shrink-0"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                  <span>{cfg.emoji}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                  <Zap size={11} style={{ color: 'var(--accent-blue)' }} />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        {[
          { key: 'all',       label: 'All Templates' },
          { key: 'favorites', label: `Favorites (${favorites.length})` },
          { key: 'archived',  label: 'Archived' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{
              borderColor: activeTab === tab.key ? 'var(--accent-blue)' : 'transparent',
              color:       activeTab === tab.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={docType} onChange={e => setDocType(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
          <option value="">All Types</option>
          {Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.emoji} {cfg.label}</option>
          ))}
        </select>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
          {[['grid', Grid], ['list', List]].map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className="px-3 py-2 transition-colors"
              style={{ background: viewMode === mode ? 'var(--accent-blue)' : 'var(--bg-secondary)', color: viewMode === mode ? '#fff' : 'var(--text-secondary)' }}>
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

      {/* ── Content ── */}
      {loading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-3'}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border h-52 animate-pulse"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} />
          ))}
        </div>
      ) : templates.length === 0 ? (
        !search && !category && !docType && activeTab === 'all' ? (
          <OnboardingEmpty onCreate={handleWizardSelect} />
        ) : (
          <div className="text-center py-16">
            <FileText size={40} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-secondary)' }} />
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              {activeTab === 'archived'  ? 'No archived templates' :
               activeTab === 'favorites' ? 'No favorites yet' :
               'No templates found'}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              {search || category || docType ? 'Try different filters' :
               activeTab === 'favorites'     ? 'Click the ★ on any template to add it here' :
               'Nothing here yet'}
            </p>
            {activeTab === 'all' && (
              <button onClick={() => setShowWizard(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--accent-blue)' }}>
                <Plus size={14} className="inline mr-1.5" />Create Template
              </button>
            )}
          </div>
        )
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.map(t => (
            <TemplateCard key={t.id} template={t}
              onEdit={handleEdit} onDelete={handleDelete}
              onClone={setCloneTarget} onGenerate={handleGenerate}
              onPreview={handlePreview} onArchive={handleArchive}
              isFavorite={favorites.includes(t.id)}
              onToggleFavorite={handleToggleFavorite} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const cfg      = DOC_TYPE_CONFIG[t.doc_type] || { emoji: '📄', label: t.doc_type }
            const catColor = CATEGORY_COLORS[t.category] || '#6B7280'
            const isFav    = favorites.includes(t.id)
            return (
              <div key={t.id} className="flex items-center gap-4 p-4 rounded-xl border hover:shadow-md transition-all"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <div className="text-xl w-8 text-center shrink-0">{cfg.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: `${catColor}18`, color: catColor }}>{t.category}</span>
                    {t.is_default && <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Default</span>}
                    {isFav && <Star size={12} style={{ color: '#f59e0b', fill: '#f59e0b' }} />}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {cfg.label} · v{t.version || 1} · {t.generation_count || 0} generated
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleToggleFavorite(t.id)} className="p-1.5 rounded-lg"
                    style={{ background: isFav ? '#fef9c3' : 'var(--bg-secondary)' }}>
                    <Star size={13} style={{ color: isFav ? '#f59e0b' : 'var(--text-secondary)', fill: isFav ? '#f59e0b' : 'none' }} />
                  </button>
                  <button onClick={() => handleEdit(t)} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                    <Edit2 size={12} className="inline mr-1" />Edit
                  </button>
                  <button onClick={() => handleGenerate(t)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: 'var(--accent-blue)' }}>
                    <Zap size={12} className="inline mr-1" />Generate
                  </button>
                  <button onClick={() => setCloneTarget(t)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--bg-secondary)' }}>
                    <Copy size={13} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                  <button onClick={() => exportTemplateJson(t)} className="p-1.5 rounded-lg"
                    style={{ background: 'var(--bg-secondary)' }}>
                    <Download size={13} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                  <button onClick={() => handleDelete(t)} className="p-1.5 rounded-lg" style={{ background: '#EF444415' }}>
                    <Trash2 size={13} style={{ color: '#EF4444' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Previous</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = page <= 3 ? i + 1 : page + i - 2
              if (pg < 1 || pg > totalPages) return null
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: pg === page ? 'var(--accent-blue)' : 'var(--bg-secondary)', color: pg === page ? '#fff' : 'var(--text-primary)' }}>
                  {pg}
                </button>
              )
            })}
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Next</button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showWizard  && <TypeWizard   onSelect={handleWizardSelect} onClose={() => setShowWizard(false)} />}
      {cloneTarget && <CloneModal   template={cloneTarget} onClose={() => setCloneTarget(null)} onClone={handleClone} />}
      {showImport  && <ImportModal  onClose={() => setShowImport(false)} onImport={handleImport} />}
    </div>
  )
}
