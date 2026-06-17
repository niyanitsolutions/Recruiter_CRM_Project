import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
  Plus, Trash2, Clock, User as UserIcon, CheckCircle2,
  RefreshCw, Loader2, List, Calendar, X, ChevronLeft, ChevronRight,
  MessageSquare, Send,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import taskService from '../../services/taskService'
import userService from '../../services/userService'
import { selectUser } from '../../store/authSlice'
import { useLivePolling } from '../../hooks/useLivePolling'

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES   = ['pending', 'in_progress', 'completed', 'cancelled']

// ── Helpers ────────────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const styles = {
    high:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.5)',  text: '#f87171' },
    urgent: { bg: 'rgba(220,38,38,0.18)',  border: 'rgba(220,38,38,0.55)', text: '#f87171' },
    medium: { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(202,138,4,0.5)',  text: '#fbbf24' },
    low:    { bg: 'rgba(100,116,139,0.15)',border: 'rgba(100,116,139,0.4)',text: '#94a3b8' },
  }
  const s = styles[priority] || styles.low
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
      {priority}
    </span>
  )
}

function EntityTag({ label }) {
  if (!label) return null
  return (
    <span style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500 }}>
      {label}
    </span>
  )
}

function StatusCircle({ status, onClick, loading }) {
  if (loading) return <Loader2 size={22} color="#7c3aed" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
  if (status === 'completed') {
    return (
      <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
        <CheckCircle2 size={22} color="#22c55e" fill="#22c55e" />
      </button>
    )
  }
  const color = status === 'in_progress' ? '#f59e0b' : '#334155'
  return (
    <button onClick={onClick} style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `2px solid ${color}`, background: 'transparent', cursor: 'pointer', padding: 0 }} />
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onStatusChange, onDelete, onOpen, isDark }) {
  const [updating, setUpdating] = useState(false)
  const cycle = { pending: 'in_progress', in_progress: 'completed', completed: 'pending', cancelled: 'pending' }
  const handleCycle = async (e) => {
    e.stopPropagation()
    setUpdating(true)
    try { await onStatusChange(task.id, cycle[task.status] || 'pending') }
    finally { setUpdating(false) }
  }
  const dueDateStr = task.due_date
    ? new Date(task.due_date).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    : null
  const cardStyle = isDark ? {
    background: 'rgba(14,20,55,0.38)', border: `1px solid ${task.is_overdue ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.12)'}`,
    borderRadius: 14, padding: '16px', marginBottom: 12, cursor: 'pointer',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 4px 16px rgba(0,0,20,0.30), inset 0 1px 0 rgba(255,255,255,0.07)',
  } : {
    background: '#ffffff', border: `1px solid ${task.is_overdue ? 'rgba(239,68,68,0.3)' : 'rgba(108,99,255,0.12)'}`,
    borderRadius: 14, padding: '16px', marginBottom: 12, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(108,99,255,0.06)',
  }

  return (
    <div style={cardStyle} onClick={() => onOpen(task)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <StatusCircle status={task.status} onClick={handleCycle} loading={updating} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4, color: task.status === 'completed' ? (isDark ? '#475569' : '#9ca3af') : (isDark ? '#e2e8f0' : '#1a1a2e'), textDecoration: task.status === 'completed' ? 'line-through' : 'none', marginBottom: 4 }}>
            {task.title}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <PriorityBadge priority={task.priority} />
            {(task.related_entity_name || task.related_entity_type) && <EntityTag label={task.related_entity_name || task.related_entity_type} />}
            {(task.comments?.length > 0) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#64748b' }}>
                <MessageSquare size={11} /> {task.comments.length}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#334155' : '#d1d5db', padding: 2, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = isDark ? '#334155' : '#d1d5db'}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {(dueDateStr || task.assigned_to_name) && (
        <>
          <div style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(108,99,255,0.08)', margin: '10px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {dueDateStr && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: task.is_overdue ? '#f87171' : (isDark ? '#94a3b8' : '#9ca3af') }}>
                <Clock size={12} color={task.is_overdue ? '#f87171' : '#64748b'} />
                {task.is_overdue && '⚠ '}{dueDateStr}
              </span>
            )}
            {task.assigned_to_name && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: isDark ? '#94a3b8' : '#9ca3af', marginLeft: 'auto' }}>
                <UserIcon size={12} color="#64748b" /> {task.assigned_to_name}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ label, count, tasks, onStatusChange, onDelete, onOpen, isDark }) {
  const colStyle = isDark ? {
    background: 'rgba(14,20,55,0.32)', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 16, padding: '20px 16px', flex: 1, minWidth: 0,
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,20,0.30), inset 0 1px 0 rgba(255,255,255,0.07)',
  } : {
    background: '#f8f9ff', border: '1px solid rgba(108,99,255,0.10)', borderRadius: 16, padding: '20px 16px', flex: 1, minWidth: 0,
    boxShadow: '0 2px 12px rgba(108,99,255,0.06)',
  }
  return (
    <div style={colStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: isDark ? '#e2e8f0' : '#1a1a2e' }}>{label}</span>
        <span style={{ fontSize: 14, color: '#64748b' }}>({count})</span>
      </div>
      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: '#334155' }}>No tasks</div>
      ) : tasks.map(t => (
        <TaskCard key={t.id} task={t} onStatusChange={onStatusChange} onDelete={onDelete} onOpen={onOpen} isDark={isDark} />
      ))}
    </div>
  )
}

// ── Calendar View ─────────────────────────────────────────────────────────────
function CalendarView({ tasks, onOpen, isDark }) {
  const [current, setCurrent] = useState(() => new Date())
  const year  = current.getFullYear()
  const month = current.getMonth()

  const monthName = current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const firstDay  = new Date(year, month, 1).getDay()  // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Map due_date (YYYY-MM-DD string or Date) → tasks[]
  const byDay = {}
  tasks.forEach(t => {
    if (!t.due_date) return
    const d = new Date(t.due_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate()
      if (!byDay[key]) byDay[key] = []
      byDay[key].push(t)
    }
  })

  const today = new Date()
  const isToday = (day) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  const priorityColor = (p) => ({ high: '#f87171', urgent: '#f87171', medium: '#fbbf24', low: '#94a3b8' })[p] || '#94a3b8'

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }
  const cellStyle = (day) => ({
    minHeight: 90,
    borderRadius: 10,
    padding: '6px 8px',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(108,99,255,0.10)'}`,
    background: isToday(day)
      ? (isDark ? 'rgba(124,58,237,0.18)' : 'rgba(99,102,241,0.08)')
      : (isDark ? 'rgba(14,20,55,0.30)' : '#f8f9ff'),
    boxShadow: isToday(day) ? '0 0 0 2px #7c3aed' : 'none',
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setCurrent(new Date(year, month - 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 6 }}>
          <ChevronLeft size={20} />
        </button>
        <span style={{ fontSize: 18, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1a1a2e' }}>{monthName}</span>
        <button onClick={() => setCurrent(new Date(year, month + 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 6 }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Day labels */}
      <div style={gridStyle}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b', padding: '4px 0', marginBottom: 2 }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={gridStyle}>
        {cells.map((day, i) => (
          <div key={i} style={day ? cellStyle(day) : { minHeight: 90, borderRadius: 10 }}>
            {day && (
              <>
                <div style={{ fontSize: 13, fontWeight: isToday(day) ? 700 : 500, color: isToday(day) ? '#7c3aed' : (isDark ? '#94a3b8' : '#475569'), marginBottom: 4 }}>
                  {day}
                </div>
                {(byDay[day] || []).slice(0, 3).map(t => (
                  <div
                    key={t.id}
                    onClick={() => onOpen(t)}
                    style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                      background: `${priorityColor(t.priority)}22`,
                      color: priorityColor(t.priority),
                      border: `1px solid ${priorityColor(t.priority)}44`,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                    }}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                ))}
                {(byDay[day] || []).length > 3 && (
                  <div style={{ fontSize: 10, color: '#64748b' }}>+{byDay[day].length - 3} more</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Task Detail + Comments Modal ──────────────────────────────────────────────
function TaskDetailModal({ task: initialTask, onClose, onStatusChange, onDelete, isDark }) {
  const [task, setTask] = useState(initialTask)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const commentsEndRef = useRef(null)

  const cycle = { pending: 'in_progress', in_progress: 'completed', completed: 'pending', cancelled: 'pending' }

  const handleCycle = async () => {
    setUpdating(true)
    try {
      await onStatusChange(task.id, cycle[task.status] || 'pending')
      setTask(t => ({ ...t, status: cycle[t.status] || 'pending' }))
    } finally { setUpdating(false) }
  }

  const submitComment = async (e) => {
    e.preventDefault()
    if (!comment.trim()) return
    setPosting(true)
    try {
      const res = await taskService.addComment(task.id, comment.trim())
      const updated = res.data || res
      setTask(updated)
      setComment('')
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch { toast.error('Failed to add comment') }
    finally { setPosting(false) }
  }

  const overlayStyle = { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)' }
  const modalStyle = isDark ? {
    background: 'rgba(10,14,42,0.95)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(24px)',
    borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.80)',
  } : {
    background: '#ffffff', border: '1px solid rgba(108,99,255,0.15)',
    borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(108,99,255,0.15)',
  }

  const statusColors = { pending: '#94a3b8', in_progress: '#f59e0b', completed: '#22c55e', cancelled: '#64748b' }
  const textColor = isDark ? '#e2e8f0' : '#1a1a2e'
  const mutedColor = isDark ? '#64748b' : '#9ca3af'
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(108,99,255,0.08)'
  const inputStyle = { width: '100%', background: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(108,99,255,0.15)'}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, color: textColor, outline: 'none', resize: 'none', fontFamily: 'inherit' }

  const dueDateStr = task.due_date
    ? new Date(task.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <StatusCircle status={task.status} onClick={handleCycle} loading={updating} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: textColor, margin: 0, lineHeight: 1.3, textDecoration: task.status === 'completed' ? 'line-through' : 'none', opacity: task.status === 'completed' ? 0.6 : 1 }}>
              {task.title}
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: `${statusColors[task.status]}22`, color: statusColors[task.status], border: `1px solid ${statusColors[task.status]}44`, fontWeight: 600 }}>
                {task.status.replace('_', ' ')}
              </span>
              <PriorityBadge priority={task.priority} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { onDelete(task.id); onClose() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedColor, padding: 4, borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = mutedColor}
            >
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedColor, padding: 4 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {dueDateStr && (
              <div style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: mutedColor, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due Date</div>
                <div style={{ fontSize: 14, color: task.is_overdue ? '#f87171' : textColor, fontWeight: 500 }}>{dueDateStr}</div>
              </div>
            )}
            {task.assigned_to_name && (
              <div style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: mutedColor, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned To</div>
                <div style={{ fontSize: 14, color: textColor, fontWeight: 500 }}>{task.assigned_to_name}</div>
              </div>
            )}
            {task.created_by_name && (
              <div style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: mutedColor, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created By</div>
                <div style={{ fontSize: 14, color: textColor, fontWeight: 500 }}>{task.created_by_name}</div>
              </div>
            )}
          </div>

          {task.description && (
            <div style={{ marginBottom: 16, padding: '12px 14px', background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: mutedColor, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
              <p style={{ fontSize: 14, color: textColor, margin: 0, lineHeight: 1.6 }}>{task.description}</p>
            </div>
          )}

          {/* Comments */}
          <div style={{ borderTop: `1px solid ${dividerColor}`, paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <MessageSquare size={15} color="#7c3aed" />
              <span style={{ fontSize: 14, fontWeight: 600, color: textColor }}>Comments ({task.comments?.length || 0})</span>
            </div>

            {(task.comments?.length === 0 || !task.comments) && (
              <p style={{ fontSize: 13, color: mutedColor, textAlign: 'center', padding: '12px 0' }}>No comments yet. Be the first to comment!</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {(task.comments || []).map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff' }}>
                    {c.author_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{c.author_name}</span>
                      <span style={{ fontSize: 11, color: mutedColor }}>
                        {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(c.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: isDark ? '#cbd5e1' : '#374151', margin: 0, lineHeight: 1.5 }}>{c.text}</p>
                  </div>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>

            {/* Add Comment */}
            <form onSubmit={submitComment} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(e) } }}
                placeholder="Add a comment… (Enter to send, Shift+Enter for new line)"
                rows={2}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="submit"
                disabled={posting || !comment.trim()}
                style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: posting || !comment.trim() ? 'not-allowed' : 'pointer', opacity: posting || !comment.trim() ? 0.5 : 1, color: '#fff', display: 'flex', alignItems: 'center' }}
              >
                {posting ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Create Modal ──────────────────────────────────────────────────────────────
function CreateModal({ users, onClose, onCreate, isDark }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', status: 'pending', due_date: '', assigned_to: '' })
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.due_date) delete payload.due_date
      if (!payload.assigned_to) delete payload.assigned_to
      if (!payload.description) delete payload.description
      await onCreate(payload)
      onClose()
    } catch { toast.error('Failed to create task') }
    finally { setSaving(false) }
  }

  const overlayStyle = { position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }
  const modalStyle = isDark ? {
    background: 'rgba(10,14,42,0.88)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    borderRadius: 20, padding: '32px', width: '100%', maxWidth: 480, boxShadow: '0 25px 60px rgba(0,0,0,0.75)',
  } : {
    background: '#ffffff', border: '1px solid rgba(108,99,255,0.15)',
    borderRadius: 20, padding: '32px', width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(108,99,255,0.15)',
  }
  const labelStyle = { fontSize: 12, fontWeight: 500, color: isDark ? '#94a3b8' : '#6b7280', display: 'block', marginBottom: 4 }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: isDark ? '#f1f5f9' : '#1a1a2e', margin: 0 }}>Add Task</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}><X size={20} /></button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Task title" className="input" required />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional details" className="input" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="input">
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="input">
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className="input" />
          </div>
          <div>
            <label style={labelStyle}>Assign To</label>
            <select value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} className="input">
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: '0 0 20px rgba(124,58,237,0.5)', color: '#fff', border: 'none', borderRadius: 24, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={14} />}
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Tasks() {
  const currentUser = useSelector(selectUser)
  const [tasks,          setTasks]         = useState([])
  const [users,          setUsers]         = useState([])
  const [loading,        setLoading]       = useState(true)
  const [showCreate,     setShowCreate]    = useState(false)
  const [view,           setView]          = useState('list')
  const [total,          setTotal]         = useState(0)
  const [filterStatus,   setFilterStatus]  = useState('')
  const [filterPriority, setFilterPriority]= useState('')
  const [myOnly,         setMyOnly]        = useState(false)
  const [openTask,       setOpenTask]      = useState(null)

  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light')
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light'))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = { page_size: 100 }
      if (filterStatus)   params.status   = filterStatus
      if (filterPriority) params.priority = filterPriority
      if (myOnly)         params.my_tasks = true
      const res = await taskService.getTasks(params)
      setTasks(res.tasks || [])
      setTotal(res.total || 0)
    } catch { if (!silent) toast.error('Failed to load tasks') }
    finally { if (!silent) setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus, filterPriority, myOnly])

  // Live background refresh (Task 8) — silent, no visible reload
  useLivePolling(() => load(true), 5000)
  useEffect(() => { userService.getUsers({ page_size: 100 }).then(r => setUsers(r.data || [])).catch(() => {}) }, [])

  const handleCreate = async (data) => { await taskService.createTask(data); toast.success('Task created'); load() }

  const handleStatusChange = async (id, status) => {
    await taskService.updateTask(id, { status })
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, is_overdue: status === 'completed' ? false : t.is_overdue } : t))
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return
    await taskService.deleteTask(id)
    toast.success('Task deleted')
    setTasks(prev => prev.filter(t => t.id !== id))
    setTotal(p => p - 1)
  }

  const grouped = {
    pending:     tasks.filter(t => t.status === 'pending'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    completed:   tasks.filter(t => t.status === 'completed'),
  }

  const addBtnStyle = { background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: '0 0 20px rgba(124,58,237,0.5)', color: '#ffffff', border: 'none', borderRadius: 24, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
  const toggleBtn = (active) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, transition: 'all 0.2s', ...(active ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 16px rgba(124,58,237,0.6)', color: '#fff' } : { background: 'transparent', color: '#94a3b8' }) })

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1a1a2e', margin: 0 }}>Tasks</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>Manage your tasks and schedule</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: isDark ? 'rgba(14,20,55,0.38)' : 'rgba(108,99,255,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(108,99,255,0.15)', borderRadius: 24, padding: 4 }}>
            <button style={toggleBtn(view === 'list')} onClick={() => setView('list')}><List size={15} /> List</button>
            <button style={toggleBtn(view === 'calendar')} onClick={() => setView('calendar')}><Calendar size={15} /> Calendar</button>
          </div>
          <button style={addBtnStyle} onClick={() => setShowCreate(true)}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 30px rgba(124,58,237,0.7)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(124,58,237,0.5)'}
          >
            <Plus size={16} /> Add Task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input" style={{ width: 'auto', minWidth: 140 }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="input" style={{ width: 'auto', minWidth: 130 }}>
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={() => setMyOnly(p => !p)} style={{ padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${myOnly ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.10)'}`, background: myOnly ? 'rgba(124,58,237,0.18)' : 'transparent', color: myOnly ? '#a78bfa' : '#94a3b8' }}>
          My Tasks
        </button>
        <button onClick={load} style={{ padding: '10px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#64748b' }}>
          <RefreshCw size={14} />
        </button>
        <span style={{ fontSize: 13, color: '#64748b', marginLeft: 4 }}>{total} task{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Board / Calendar */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 size={36} color="#7c3aed" style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : view === 'calendar' ? (
        <CalendarView tasks={tasks} onOpen={setOpenTask} isDark={isDark} />
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <KanbanColumn label="Pending"     count={grouped.pending.length}     tasks={grouped.pending}     onStatusChange={handleStatusChange} onDelete={handleDelete} onOpen={setOpenTask} isDark={isDark} />
          <KanbanColumn label="In Progress" count={grouped.in_progress.length} tasks={grouped.in_progress} onStatusChange={handleStatusChange} onDelete={handleDelete} onOpen={setOpenTask} isDark={isDark} />
          <KanbanColumn label="Completed"   count={grouped.completed.length}   tasks={grouped.completed}   onStatusChange={handleStatusChange} onDelete={handleDelete} onOpen={setOpenTask} isDark={isDark} />
        </div>
      )}

      {showCreate && <CreateModal users={users} onClose={() => setShowCreate(false)} onCreate={handleCreate} isDark={isDark} />}

      {openTask && (
        <TaskDetailModal
          task={openTask}
          onClose={() => setOpenTask(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          isDark={isDark}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
