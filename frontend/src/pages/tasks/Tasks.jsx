import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
  Plus, Trash2, Clock, User as UserIcon, CheckCircle2,
  RefreshCw, Loader2, List, Calendar, X,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import taskService from '../../services/taskService'
import userService from '../../services/userService'
import { selectUser } from '../../store/authSlice'

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES   = ['pending', 'in_progress', 'completed', 'cancelled']

// ── Priority badge ─────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const styles = {
    high:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.5)',  text: '#f87171' },
    urgent: { bg: 'rgba(220,38,38,0.18)',  border: 'rgba(220,38,38,0.55)', text: '#f87171' },
    medium: { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(202,138,4,0.5)',  text: '#fbbf24' },
    low:    { bg: 'rgba(100,116,139,0.15)',border: 'rgba(100,116,139,0.4)',text: '#94a3b8' },
  }
  const s = styles[priority] || styles.low
  return (
    <span style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.text,
      borderRadius: 999,
      padding: '2px 10px',
      fontSize: 12,
      fontWeight: 600,
    }}>
      {priority}
    </span>
  )
}

// ── Entity / company tag ───────────────────────────────────────────────────────
function EntityTag({ label }) {
  if (!label) return null
  return (
    <span style={{
      background: 'rgba(99,102,241,0.15)',
      border: '1px solid rgba(99,102,241,0.4)',
      color: '#a5b4fc',
      borderRadius: 999,
      padding: '2px 10px',
      fontSize: 12,
      fontWeight: 500,
    }}>
      {label}
    </span>
  )
}

// ── Status circle icon ─────────────────────────────────────────────────────────
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
    <button
      onClick={onClick}
      style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${color}`,
        background: 'transparent', cursor: 'pointer', padding: 0,
      }}
    />
  )
}

// ── Task card ──────────────────────────────────────────────────────────────────
function TaskCard({ task, onStatusChange, onDelete, isDark }) {
  const [updating, setUpdating] = useState(false)

  const cycle = { pending: 'in_progress', in_progress: 'completed', completed: 'pending', cancelled: 'pending' }
  const handleCycle = async () => {
    setUpdating(true)
    try { await onStatusChange(task.id, cycle[task.status] || 'pending') }
    finally { setUpdating(false) }
  }

  const dueDateStr = task.due_date
    ? new Date(task.due_date).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    : null

  const entityLabel = task.related_entity_name || task.related_entity_type || null

  const cardStyle = isDark ? {
    background: 'rgba(14, 20, 55, 0.38)',
    border: `1px solid ${task.is_overdue ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.12)'}`,
    borderRadius: 14,
    padding: '16px',
    marginBottom: 12,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 4px 16px rgba(0,0,20,0.30), inset 0 1px 0 rgba(255,255,255,0.07)',
  } : {
    background: '#ffffff',
    border: `1px solid ${task.is_overdue ? 'rgba(239,68,68,0.3)' : 'rgba(108,99,255,0.12)'}`,
    borderRadius: 14,
    padding: '16px',
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(108,99,255,0.06)',
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <StatusCircle status={task.status} onClick={handleCycle} loading={updating} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.4,
            color: task.status === 'completed' ? (isDark ? '#475569' : '#9ca3af') : (isDark ? '#e2e8f0' : '#1a1a2e'),
            textDecoration: task.status === 'completed' ? 'line-through' : 'none',
            marginBottom: 4,
          }}>
            {task.title}
          </div>

          {task.description && task.status === 'completed' && (
            <div style={{ fontSize: 13, color: isDark ? '#94a3b8' : '#6b7280', fontStyle: 'italic', marginBottom: 6 }}>
              {task.description}
            </div>
          )}

          {/* Badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <PriorityBadge priority={task.priority} />
            {entityLabel && <EntityTag label={entityLabel} />}
          </div>
        </div>

        <button
          onClick={() => onDelete(task.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#334155' : '#d1d5db', padding: 2, flexShrink: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = isDark ? '#334155' : '#d1d5db'}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Divider */}
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
                <UserIcon size={12} color="#64748b" />
                {task.assigned_to_name}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────
function KanbanColumn({ label, count, tasks, onStatusChange, onDelete, isDark }) {
  const colStyle = isDark ? {
    background: 'rgba(14, 20, 55, 0.32)',
    border: '1px solid rgba(255,255,255,0.11)',
    borderRadius: 16,
    padding: '20px 16px',
    flex: 1,
    minWidth: 0,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 8px 32px rgba(0,0,20,0.30), inset 0 1px 0 rgba(255,255,255,0.07)',
  } : {
    background: '#f8f9ff',
    border: '1px solid rgba(108,99,255,0.10)',
    borderRadius: 16,
    padding: '20px 16px',
    flex: 1,
    minWidth: 0,
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
      ) : (
        tasks.map(t => (
          <TaskCard key={t.id} task={t} onStatusChange={onStatusChange} onDelete={onDelete} isDark={isDark} />
        ))
      )}
    </div>
  )
}

// ── Create modal ──────────────────────────────────────────────────────────────
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

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(4px)',
  }

  const modalStyle = isDark ? {
    background: 'rgba(10, 14, 42, 0.88)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: 20,
    padding: '32px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 25px 60px rgba(0,0,0,0.75)',
  } : {
    background: '#ffffff',
    border: '1px solid rgba(108,99,255,0.15)',
    borderRadius: 20,
    padding: '32px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 20px 60px rgba(108,99,255,0.15)',
  }

  const labelStyle = { fontSize: 12, fontWeight: 500, color: isDark ? '#94a3b8' : '#6b7280', display: 'block', marginBottom: 4 }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: isDark ? '#f1f5f9' : '#1a1a2e', margin: 0 }}>Add Task</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Task title" className="input" required />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Optional details" className="input" style={{ resize: 'vertical' }} />
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
            <button
              type="submit"
              disabled={saving}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                boxShadow: '0 0 20px rgba(124,58,237,0.5)',
                color: '#fff',
                border: 'none',
                borderRadius: 24,
                padding: '10px 20px',
                fontWeight: 600,
                fontSize: 14,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: saving ? 0.7 : 1,
              }}
            >
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

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Tasks() {
  const currentUser = useSelector(selectUser)
  const [tasks,       setTasks]      = useState([])
  const [users,       setUsers]      = useState([])
  const [loading,     setLoading]    = useState(true)
  const [showCreate,  setShowCreate] = useState(false)
  const [view,        setView]       = useState('list')
  const [total,       setTotal]      = useState(0)
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [myOnly, setMyOnly]  = useState(false)

  // detect dark/light from html element
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.getAttribute('data-theme') !== 'light'
  )
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = { page_size: 50 }
      if (filterStatus)   params.status   = filterStatus
      if (filterPriority) params.priority = filterPriority
      if (myOnly)         params.my_tasks = true
      const res = await taskService.getTasks(params)
      setTasks(res.tasks || [])
      setTotal(res.total || 0)
    } catch { toast.error('Failed to load tasks') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus, filterPriority, myOnly])
  useEffect(() => {
    userService.getUsers({ page_size: 100 }).then(r => setUsers(r.data || [])).catch(() => {})
  }, [])

  const handleCreate = async (data) => {
    await taskService.createTask(data)
    toast.success('Task created')
    load()
  }

  const handleStatusChange = async (id, status) => {
    await taskService.updateTask(id, { status })
    setTasks(prev => prev.map(t => t.id === id
      ? { ...t, status, is_overdue: status === 'completed' ? false : t.is_overdue }
      : t
    ))
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

  const pageStyle = {
    padding: '24px',
    maxWidth: 1200,
    margin: '0 auto',
  }

  const addBtnStyle = {
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    boxShadow: '0 0 20px rgba(124,58,237,0.5)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 24,
    padding: '10px 20px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'box-shadow 0.2s',
  }

  const toggleBtnStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 20,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s',
    ...(active ? {
      background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
      boxShadow: '0 0 16px rgba(124,58,237,0.6)',
      color: '#ffffff',
    } : {
      background: 'transparent',
      color: '#94a3b8',
      boxShadow: 'none',
    }),
  })

  return (
    <div style={pageStyle}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1a1a2e', margin: 0, lineHeight: 1.2 }}>Tasks</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>Manage your tasks and schedule</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* List / Calendar toggle */}
          <div style={{
            display: 'flex',
            background: isDark ? 'rgba(14, 20, 55, 0.38)' : 'rgba(108,99,255,0.08)',
            border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(108,99,255,0.15)',
            borderRadius: 24,
            padding: 4,
          }}>
            <button style={toggleBtnStyle(view === 'list')} onClick={() => setView('list')}>
              <List size={15} /> List
            </button>
            <button style={toggleBtnStyle(view === 'calendar')} onClick={() => setView('calendar')}>
              <Calendar size={15} /> Calendar
            </button>
          </div>

          {/* Add Task */}
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
        <button
          onClick={() => setMyOnly(p => !p)}
          style={{
            padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            border: `1px solid ${myOnly ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.10)'}`,
            background: myOnly ? 'rgba(124,58,237,0.18)' : 'transparent',
            color: myOnly ? '#a78bfa' : '#94a3b8',
          }}
        >
          My Tasks
        </button>
        <button
          onClick={load}
          style={{ padding: '10px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#64748b' }}
        >
          <RefreshCw size={14} />
        </button>
        <span style={{ fontSize: 13, color: '#64748b', marginLeft: 4 }}>{total} task{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Board */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 size={36} color="#7c3aed" style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <KanbanColumn
            label="Pending"
            count={grouped.pending.length}
            tasks={grouped.pending}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            isDark={isDark}
          />
          <KanbanColumn
            label="In Progress"
            count={grouped.in_progress.length}
            tasks={grouped.in_progress}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            isDark={isDark}
          />
          <KanbanColumn
            label="Completed"
            count={grouped.completed.length}
            tasks={grouped.completed}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            isDark={isDark}
          />
        </div>
      )}

      {showCreate && (
        <CreateModal
          users={users}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          isDark={isDark}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
