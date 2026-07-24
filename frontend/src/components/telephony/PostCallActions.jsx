import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListTodo, BellRing, UserPlus2, CalendarPlus } from 'lucide-react'
import QuickTaskModal from './QuickTaskModal'

/**
 * "Launch the existing CRM modules rather than creating duplicate
 * functionality" — Create Task / Schedule Reminder / Create Follow-up all
 * route through the same existing Task API (there is only one task system
 * in this CRM); Schedule Interview reuses the exact deep-link convention
 * already used elsewhere (`HRCandidates.jsx`): navigate to the existing
 * interview scheduling page with the candidate pre-selected.
 */
export default function PostCallActions({ log }) {
  const navigate = useNavigate()
  const [modal, setModal] = useState(null) // 'task' | 'reminder' | 'followup' | null

  const contactName = log?.direction === 'inbound' ? log?.caller : log?.receiver

  const scheduleInterview = () => {
    if (log?.candidate_id) navigate(`/hrm/hiring/interviews?candidate=${encodeURIComponent(log.candidate_id)}`)
  }

  const modalConfig = {
    task: { title: `Follow up with ${contactName || 'contact'}`, priority: 'medium' },
    reminder: { title: `Reminder: call back ${contactName || 'contact'}`, priority: 'medium' },
    followup: { title: `Follow-up: ${contactName || 'contact'}`, priority: 'high' },
  }[modal]

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setModal('task')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium">
          <ListTodo className="w-3.5 h-3.5" /> Create Task
        </button>
        <button type="button" onClick={() => setModal('reminder')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium">
          <BellRing className="w-3.5 h-3.5" /> Schedule Reminder
        </button>
        <button type="button" onClick={() => setModal('followup')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium">
          <UserPlus2 className="w-3.5 h-3.5" /> Create Follow-up
        </button>
        {log?.candidate_id && (
          <button type="button" onClick={scheduleInterview} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium">
            <CalendarPlus className="w-3.5 h-3.5" /> Schedule Interview
          </button>
        )}
      </div>

      {modal && (
        <QuickTaskModal
          log={log}
          defaultTitle={modalConfig.title}
          defaultPriority={modalConfig.priority}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
