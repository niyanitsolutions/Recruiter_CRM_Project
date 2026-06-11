/**
 * EditPipelineModal
 *
 * Opened from the Interview Pipeline selector inside the Job Form when the
 * user clicks "Edit Pipeline" on the currently-selected pipeline.
 *
 * Fetches full pipeline details on mount, then lets the user edit:
 *   - Pipeline name
 *   - Stage list (add, remove, reorder, rename, mode/duration/flags)
 *
 * On successful save:
 *   onUpdated(updatedPipeline)  — parent can refresh its pipeline list
 */
import React, { useState, useCallback, useEffect } from 'react'
import {
  X, Plus, Trash2, ChevronUp, ChevronDown,
  GitBranch, Clock, Video, Phone, Users,
  CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import pipelineService from '../../services/pipelineService'
import clientService from '../../services/clientService'
import ModalPortal from '../common/ModalPortal'

const STAGE_MODES = [
  { value: 'video',     label: 'Video Call',  icon: Video },
  { value: 'phone',     label: 'Phone Call',  icon: Phone },
  { value: 'in_person', label: 'In Person',   icon: Users },
]

const DURATION_OPTIONS = [
  { value: 15,  label: '15 min' },
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hr' },
  { value: 90,  label: '1.5 hr' },
  { value: 120, label: '2 hr' },
]

function makeStage(name = '', order = 1) {
  return {
    _key:              Math.random().toString(36).slice(2),
    stage_name:        name,
    order,
    mode:              'video',
    duration:          60,
    is_mandatory:      true,
    requires_feedback: true,
    auto_advance:      false,
    auto_reject:       false,
  }
}

function ToggleChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
        active
          ? 'bg-accent-600 text-white border-accent-600'
          : 'bg-transparent text-surface-500 border-surface-300 hover:border-accent-400'
      }`}
    >
      {children}
    </button>
  )
}

function StageCard({ stage, index, total, onChange, onMove, onRemove }) {
  const [expanded, setExpanded] = useState(true)
  const update = (field, value) => onChange(stage._key, field, value)
  const ModeIcon = STAGE_MODES.find(m => m.value === stage.mode)?.icon || Video

  return (
    <div
      className="rounded-xl border transition-all"
      style={{
        background:  'var(--bg-card)',
        borderColor: expanded ? 'var(--accent)' : 'var(--border-card)',
        borderWidth: expanded ? '1.5px' : '1px',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {index + 1}
        </span>
        <span
          className="flex-1 font-medium text-sm truncate"
          style={{ color: stage.stage_name ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          {stage.stage_name || 'Untitled Stage'}
        </span>
        <span className="hidden sm:flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <ModeIcon className="w-3 h-3" />
          {STAGE_MODES.find(m => m.value === stage.mode)?.label}
          <span className="mx-1">·</span>
          <Clock className="w-3 h-3" />
          {DURATION_OPTIONS.find(d => d.value === stage.duration)?.label || `${stage.duration}m`}
        </span>
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onMove(stage._key, -1)}
            disabled={index === 0}
            className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors"
          >
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            type="button"
            onClick={() => onMove(stage._key, 1)}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-colors"
          >
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(stage._key) }}
          className="p-1 rounded hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="pt-4">
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Stage Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={stage.stage_name}
              onChange={e => update('stage_name', e.target.value)}
              placeholder="e.g. Technical Round"
              className="input w-full text-sm"
              onClick={e => e.stopPropagation()}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Interview Mode
              </label>
              <select
                value={stage.mode}
                onChange={e => update('mode', e.target.value)}
                className="input w-full text-sm"
              >
                {STAGE_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Duration
              </label>
              <select
                value={stage.duration}
                onChange={e => update('duration', Number(e.target.value))}
                className="input w-full text-sm"
              >
                {DURATION_OPTIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Stage Rules
            </label>
            <div className="flex flex-wrap gap-2">
              <ToggleChip active={stage.is_mandatory}      onClick={() => update('is_mandatory',      !stage.is_mandatory)}>Mandatory</ToggleChip>
              <ToggleChip active={stage.requires_feedback} onClick={() => update('requires_feedback', !stage.requires_feedback)}>Feedback Required</ToggleChip>
              <ToggleChip active={stage.auto_advance}      onClick={() => update('auto_advance',      !stage.auto_advance)}>Auto Advance</ToggleChip>
              <ToggleChip active={stage.auto_reject}       onClick={() => update('auto_reject',       !stage.auto_reject)}>Auto Reject on Fail</ToggleChip>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function EditPipelineModal({ pipelineId, onClose, onUpdated }) {
  const [fetching, setFetching]   = useState(true)
  const [saving, setSaving]       = useState(false)
  const [name, setName]           = useState('')
  const [description, setDesc]    = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [stages, setStages]       = useState([])
  const [nameError, setNameError]     = useState('')
  const [clientError, setClientError] = useState('')
  const [stagesError, setStagesError] = useState('')

  const [clients, setClients]       = useState([])
  const [clientId, setClientId]     = useState('')
  const [clientName, setClientName] = useState('')

  // Fetch pipeline details and clients list in parallel
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [pipeline, clientsRes] = await Promise.all([
          pipelineService.getPipeline(pipelineId),
          clientService.getClientsDropdown(),
        ])
        if (cancelled) return
        setClients(clientsRes.data || [])
        setName(pipeline.name || '')
        setDesc(pipeline.description || '')
        setIsDefault(pipeline.is_default || false)
        setClientId(pipeline.client_id || '')
        setClientName(pipeline.client_name || '')
        const sorted = [...(pipeline.stages || [])].sort((a, b) => a.order - b.order)
        setStages(sorted.map(s => ({
          _key:              Math.random().toString(36).slice(2),
          stage_name:        s.stage_name,
          order:             s.order,
          mode:              s.mode || 'video',
          duration:          s.duration || 60,
          is_mandatory:      s.is_mandatory ?? true,
          requires_feedback: s.requires_feedback ?? true,
          auto_advance:      s.auto_advance ?? false,
          auto_reject:       s.auto_reject ?? false,
        })))
      } catch {
        if (!cancelled) toast.error('Failed to load pipeline details')
      } finally {
        if (!cancelled) setFetching(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [pipelineId])

  // ── Stage helpers ───────────────────────────────────────────────────────────

  const addStage = () => {
    setStages(prev => [...prev, makeStage('', prev.length + 1)])
    setStagesError('')
  }

  const removeStage = (key) => {
    setStages(prev => prev.filter(s => s._key !== key).map((s, i) => ({ ...s, order: i + 1 })))
  }

  const updateStage = useCallback((key, field, value) => {
    setStages(prev => prev.map(s => s._key === key ? { ...s, [field]: value } : s))
  }, [])

  const moveStage = (key, dir) => {
    setStages(prev => {
      const idx  = prev.findIndex(s => s._key === key)
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    let valid = true
    if (!name.trim()) { setNameError('Pipeline name is required'); valid = false }
    else setNameError('')

    if (!clientId) { setClientError('Client is required'); valid = false }
    else setClientError('')

    if (stages.length === 0) {
      setStagesError('Add at least one stage'); valid = false
    } else if (stages.some(s => !s.stage_name.trim())) {
      setStagesError('All stages must have a name'); valid = false
    } else {
      setStagesError('')
    }

    if (!valid) return

    try {
      setSaving(true)
      const payload = {
        name:        name.trim(),
        description: description.trim() || null,
        is_default:  isDefault,
        client_id:   clientId,
        client_name: clientName,
        stages:      stages.map((s, i) => ({
          stage_name:        s.stage_name.trim(),
          order:             i + 1,
          mode:              s.mode,
          duration:          s.duration,
          is_mandatory:      s.is_mandatory,
          requires_feedback: s.requires_feedback,
          auto_advance:      s.auto_advance,
          auto_reject:       s.auto_reject,
        })),
      }
      const updated = await pipelineService.updatePipeline(pipelineId, payload)
      toast.success(`Pipeline "${name.trim()}" updated successfully`)
      onUpdated(updated)
    } catch (err) {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : 'Failed to update pipeline'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ModalPortal isOpen>
      <div
        style={{
          position:       'fixed',
          inset:          0,
          zIndex:         9999,
          display:        'flex',
          alignItems:     'flex-start',
          justifyContent: 'center',
          background:     'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          padding:        '24px 16px',
          overflowY:      'auto',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          style={{
            width:         '100%',
            maxWidth:      680,
            background:    'var(--bg-card)',
            border:        '1px solid var(--border-card)',
            borderRadius:  20,
            boxShadow:     '0 24px 64px rgba(0,0,0,0.4)',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.15)' }}
              >
                <GitBranch className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  Edit Interview Pipeline
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Update pipeline name and interview stages
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-100 transition-colors"
            >
              <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {/* Body */}
          {fetching ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading pipeline…</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Pipeline Details */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Pipeline Details
                </h3>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Pipeline Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); if (e.target.value) setNameError('') }}
                    placeholder="e.g. Senior Software Engineer Pipeline"
                    className={`input w-full ${nameError ? 'border-red-400' : ''}`}
                  />
                  {nameError && (
                    <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {nameError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Client <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={clientId}
                    onChange={e => {
                      const opt = clients.find(c => c.value === e.target.value)
                      setClientId(e.target.value)
                      setClientName(opt?.label || '')
                      if (e.target.value) setClientError('')
                    }}
                    className={`input w-full text-sm ${clientError ? 'border-red-400' : ''}`}
                  >
                    <option value="">Select a client…</option>
                    {clients.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  {clientError && (
                    <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {clientError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Brief description of when to use this pipeline..."
                    rows={2}
                    className="input w-full text-sm resize-none"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={e => setIsDefault(e.target.checked)}
                    className="rounded"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    Set as company default pipeline
                  </span>
                </label>
              </section>

              {/* Stages */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Interview Stages
                    <span
                      className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)' }}
                    >
                      {stages.length}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={addStage}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors btn-primary"
                  >
                    <Plus className="w-3 h-3" />
                    Add Stage
                  </button>
                </div>

                {stagesError && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {stagesError}
                  </div>
                )}

                {stages.length === 0 ? (
                  <div
                    className="rounded-xl border-2 border-dashed p-8 text-center"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-card-alt)' }}
                  >
                    <GitBranch className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
                    <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No stages</p>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Add at least one interview stage.</p>
                    <button type="button" onClick={addStage} className="btn-primary inline-flex items-center gap-2 text-sm">
                      <Plus className="w-4 h-4" /> Add Stage
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stages.map((stage, i) => (
                      <StageCard
                        key={stage._key}
                        stage={stage}
                        index={i}
                        total={stages.length}
                        onChange={updateStage}
                        onMove={moveStage}
                        onRemove={removeStage}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Footer */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-card-alt)' }}
          >
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {stages.length} stage{stages.length !== 1 ? 's' : ''} defined
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || fetching}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Save Changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
