import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, GripVertical, Workflow, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, Toggle, SaveBtn, SkeletonLoader,
} from './SettingsLayout'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

const PipelineStagePage = () => {
  const [stages, setStages]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const dragIdx = useRef(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getPipelineStages()
      setStages(res.data || [])
    } catch {
      toast.error('Failed to load pipeline stages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newName.trim()) { toast.error('Stage name is required'); return }
    try {
      setSaving(true)
      await tenantSettingsService.createPipelineStage({ name: newName.trim(), color: newColor })
      setNewName('')
      toast.success('Stage added')
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add stage')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (stage, enabled) => {
    try {
      await tenantSettingsService.updatePipelineStage(stage.id, { is_enabled: enabled })
      setStages(s => s.map(st => st.id === stage.id ? { ...st, is_enabled: enabled } : st))
    } catch {
      toast.error('Failed to update stage')
    }
  }

  const handleColorChange = async (stage, color) => {
    try {
      await tenantSettingsService.updatePipelineStage(stage.id, { color })
      setStages(s => s.map(st => st.id === stage.id ? { ...st, color } : st))
    } catch {
      toast.error('Failed to update color')
    }
  }

  const handleNameChange = async (stage, name) => {
    if (!name.trim()) return
    try {
      await tenantSettingsService.updatePipelineStage(stage.id, { name: name.trim() })
      toast.success('Stage renamed')
    } catch {
      toast.error('Failed to rename stage')
    }
  }

  const handleDelete = async (id) => {
    try {
      await tenantSettingsService.deletePipelineStage(id)
      toast.success('Stage deleted')
      load()
    } catch {
      toast.error('Failed to delete stage')
    }
  }

  // Drag-and-drop reorder
  const handleDragStart = (idx) => { dragIdx.current = idx }
  const handleDragOver = (e, idx) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    const reordered = [...stages]
    const [moved] = reordered.splice(dragIdx.current, 1)
    reordered.splice(idx, 0, moved)
    dragIdx.current = idx
    setStages(reordered)
  }
  const handleDrop = async () => {
    dragIdx.current = null
    try {
      await tenantSettingsService.reorderPipelineStages(stages.map(s => s.id))
      toast.success('Order saved')
    } catch {
      toast.error('Failed to save order')
      load()
    }
  }

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Breadcrumb page="Pipeline Stages" />
      <PageHeader
        title="Pipeline Stages"
        description="Configure the hiring pipeline. Drag to reorder, toggle to enable/disable, and pick a colour per stage."
      />

      <SectionCard title="Stages" icon={Workflow}>
        {stages.length === 0 && (
          <p className="text-sm text-surface-400 text-center py-6">No stages yet. Add your first stage below.</p>
        )}

        <div className="space-y-2 mb-6">
          {stages.map((stage, idx) => (
            <div
              key={stage.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={handleDrop}
              className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-100 cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-4 h-4 text-surface-400 flex-shrink-0" />

              {/* Color picker */}
              <div className="relative flex-shrink-0">
                <input
                  type="color"
                  value={stage.color || '#6366f1'}
                  onChange={e => handleColorChange(stage, e.target.value)}
                  className="w-7 h-7 rounded-lg border border-surface-200 cursor-pointer p-0.5"
                  title="Pick color"
                />
              </div>

              <input
                defaultValue={stage.name}
                onBlur={e => handleNameChange(stage, e.target.value)}
                className="flex-1 bg-transparent text-sm font-medium text-surface-900 focus:outline-none focus:bg-white focus:border focus:border-accent-300 focus:rounded px-2 py-1"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(stage, !stage.is_enabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                              ${stage.is_enabled ? 'bg-accent-600' : 'bg-surface-300'}`}
                  title={stage.is_enabled ? 'Disable' : 'Enable'}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow
                                    transition-transform ${stage.is_enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <button
                  onClick={() => handleDelete(stage.id)}
                  className="p-1.5 hover:bg-danger-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-danger-500" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add new stage */}
        <div className="border-t border-surface-100 pt-4">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">Add New Stage</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="w-9 h-9 rounded-lg border border-surface-200 cursor-pointer p-0.5 flex-shrink-0"
            />
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Technical Screening"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1"
            />
            <SaveBtn saving={saving} onClick={handleAdd} label="Add" />
          </div>

          {/* Preset colors */}
          <div className="flex gap-2 mt-3">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-surface-900 scale-125' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </SectionCard>

      <p className="text-xs text-surface-400 mt-4 text-center">
        Drag rows to reorder stages · Changes to colour and enabled state are saved instantly
      </p>
    </div>
  )
}

export default PipelineStagePage
