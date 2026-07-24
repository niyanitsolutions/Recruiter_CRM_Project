import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import ModalPortal from '../common/ModalPortal'
import taskService from '../../services/taskService'

/**
 * Thin wrapper around the EXISTING task-creation API (`POST /tasks/`,
 * `taskService.createTask`) — no new task system. Pre-fills
 * `related_entity_type`/`related_entity_id` (fields the backend TaskCreate
 * model already supports but no other page in the app populates yet).
 */
export default function QuickTaskModal({ log, defaultTitle, defaultPriority = 'medium', onClose, onCreated }) {
  const [title, setTitle] = useState(defaultTitle || '')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState(defaultPriority)
  const [saving, setSaving] = useState(false)

  const relatedType = log?.candidate_id ? 'candidate' : log?.employee_id ? 'employee' : null
  const relatedId = log?.candidate_id || log?.employee_id || null

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await taskService.createTask({
        title: title.trim(),
        priority,
        due_date: dueDate || undefined,
        related_entity_type: relatedType || undefined,
        related_entity_id: relatedId || undefined,
      })
      toast.success('Task created.')
      onCreated?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal isOpen={true}>
      <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-surface-900">Create Task</h3>
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface-100 text-surface-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-surface-500">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input-field mt-1" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-surface-500">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input-field mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className="input-field mt-1">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            {relatedType && <p className="text-xs text-surface-400">Linked to this {relatedType}.</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-surface-600 hover:bg-surface-100">Cancel</button>
            <button
              type="button" onClick={handleSave} disabled={!title.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
