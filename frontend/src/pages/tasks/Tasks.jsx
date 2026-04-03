import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import {
  Plus, CheckCircle2, Clock, AlertCircle, Trash2,
  ChevronDown, Filter, RefreshCw, Circle, Loader2
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import taskService from '../../services/taskService'
import userService from '../../services/userService'
import { selectUser } from '../../store/authSlice'

// ── constants ─────────────────────────────────────────────────────────────────
const PRIORITY_COLORS = {
  low:    { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8',  dot: '#64748b' },
  medium: { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24',  dot: '#f59e0b' },
  high:   { bg: 'rgba(239,68,68,0.15)',   text: '#fca5a5',  dot: '#ef4444' },
  urgent: { bg: 'rgba(220,38,38,0.2)',    text: '#f87171',  dot: '#dc2626' },
}
const STATUS_ICONS = {
  pending:     <Circle size={15} color="#64748b" />,
  in_progress: <Clock size={15} color="#f59e0b" />,
  completed:   <CheckCircle2 size={15} color="#10b981" />,
  cancelled:   <AlertCircle size={15} color="#ef4444" />,
}
const STATUSES   = ['pending','in_progress','completed','cancelled']
const PRIORITIES = ['low','medium','high','urgent']

// ── small helpers ─────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const c = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 10px', borderRadius:999, background:c.bg, color:c.text, fontSize:11, fontWeight:600 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:c.dot }} />
      {priority}
    </span>
  )
}

// ── task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onStatusChange, onDelete }) {
  const [updating, setUpdating] = useState(false)

  const cycleStatus = async () => {
    const next = { pending:'in_progress', in_progress:'completed', completed:'pending', cancelled:'pending' }
    setUpdating(true)
    try { await onStatusChange(task.id, next[task.status] || 'pending') }
    finally { setUpdating(false) }
  }

  const overdue = task.is_overdue
  const dueDateStr = task.due_date
    ? new Date(task.due_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : null

  return (
    <div style={{
      background: 'rgba(13,21,53,0.6)',
      border: `1px solid ${overdue ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.15)'}`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      transition: 'border-color 0.2s',
    }}>
      {/* status toggle */}
      <button onClick={cycleStatus} disabled={updating}
        style={{ background:'none', border:'none', cursor:'pointer', padding:0, marginTop:2, flexShrink:0 }}>
        {updating
          ? <Loader2 size={15} color="#6366f1" style={{ animation:'spin 0.8s linear infinite' }} />
          : STATUS_ICONS[task.status]}
      </button>

      {/* content */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:14, fontWeight:600,
          color: task.status === 'completed' ? '#475569' : '#e2e8f0',
          textDecoration: task.status === 'completed' ? 'line-through' : 'none',
          marginBottom:4,
        }}>
          {task.title}
        </div>
        {task.description && (
          <div style={{ fontSize:12, color:'#64748b', marginBottom:6 }}>{task.description}</div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <PriorityBadge priority={task.priority} />
          {task.assigned_to_name && (
            <span style={{ fontSize:11, color:'#64748b' }}>→ {task.assigned_to_name}</span>
          )}
          {dueDateStr && (
            <span style={{ fontSize:11, color: overdue ? '#f87171' : '#64748b' }}>
              {overdue ? '⚠ ' : ''}{dueDateStr}
            </span>
          )}
          {task.related_entity_type && (
            <span style={{ fontSize:11, color:'#475569', background:'rgba(51,65,85,0.4)', padding:'1px 8px', borderRadius:999 }}>
              {task.related_entity_type}
            </span>
          )}
        </div>
      </div>

      {/* delete */}
      <button onClick={() => onDelete(task.id)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'#334155', padding:2, flexShrink:0 }}
        onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
        onMouseLeave={e => e.currentTarget.style.color='#334155'}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ── create modal ──────────────────────────────────────────────────────────────
function CreateModal({ users, onClose, onCreate }) {
  const [form, setForm] = useState({ title:'', description:'', priority:'medium', due_date:'', assigned_to:'' })
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

  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}>
      <div style={{ background:'#0d1535', border:'1px solid rgba(99,102,241,0.25)', borderRadius:16, padding:'28px 32px', width:'100%', maxWidth:480 }}>
        <h2 style={{ color:'#f1f5f9', fontSize:16, fontWeight:700, marginBottom:20 }}>New Task</h2>
        <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, color:'#94a3b8', display:'block', marginBottom:4 }}>Title *</label>
            <input value={form.title} onChange={e => setForm(p=>({...p, title:e.target.value}))}
              placeholder="Task title" style={{ width:'100%' }} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'#94a3b8', display:'block', marginBottom:4 }}>Description</label>
            <textarea value={form.description} onChange={e => setForm(p=>({...p, description:e.target.value}))}
              rows={2} placeholder="Optional details" style={{ width:'100%', resize:'vertical' }} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:12, color:'#94a3b8', display:'block', marginBottom:4 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm(p=>({...p, priority:e.target.value}))} style={{ width:'100%' }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, color:'#94a3b8', display:'block', marginBottom:4 }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p=>({...p, due_date:e.target.value}))} style={{ width:'100%' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, color:'#94a3b8', display:'block', marginBottom:4 }}>Assign To</label>
            <select value={form.assigned_to} onChange={e => setForm(p=>({...p, assigned_to:e.target.value}))} style={{ width:'100%' }}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:6 }}>
            <button type="button" onClick={onClose}
              style={{ padding:'8px 20px', borderRadius:8, background:'transparent', border:'1px solid rgba(99,102,241,0.2)', color:'#94a3b8', cursor:'pointer', fontSize:13 }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
const Tasks = () => {
  const currentUser = useSelector(selectUser)
  const [tasks,       setTasks]       = useState([])
  const [users,       setUsers]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [myOnly,      setMyOnly]      = useState(false)
  const [total,       setTotal]       = useState(0)

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
    const res = await taskService.createTask(data)
    toast.success('Task created')
    load()
    return res
  }

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

  return (
    <div style={{ padding:24, maxWidth:1100, margin:'0 auto' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#f1f5f9', margin:0 }}>Tasks</h1>
          <p style={{ fontSize:13, color:'#64748b', margin:'4px 0 0' }}>{total} task{total !== 1 ? 's' : ''} total</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          {/* filters */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding:'6px 12px', borderRadius:8, fontSize:12, minWidth:120 }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            style={{ padding:'6px 12px', borderRadius:8, fontSize:12, minWidth:110 }}>
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => setMyOnly(p => !p)}
            style={{ padding:'6px 12px', borderRadius:8, fontSize:12, cursor:'pointer', border:'1px solid rgba(99,102,241,0.3)', background: myOnly ? 'rgba(99,102,241,0.2)' : 'transparent', color: myOnly ? '#818cf8' : '#94a3b8' }}>
            My Tasks
          </button>
          <button onClick={load} style={{ padding:'6px 10px', borderRadius:8, background:'transparent', border:'1px solid rgba(51,65,85,0.5)', cursor:'pointer', color:'#64748b' }}>
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Plus size={15} /> New Task
          </button>
        </div>
      </div>

      {/* board columns */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}>
          <Loader2 size={32} color="#6366f1" style={{ animation:'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:20 }}>
          {[
            { key:'pending',     label:'Pending',     color:'#6366f1' },
            { key:'in_progress', label:'In Progress', color:'#f59e0b' },
            { key:'completed',   label:'Completed',   color:'#10b981' },
          ].map(col => (
            <div key={col.key}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background:col.color, flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:700, color:'#94a3b8', letterSpacing:'0.06em', textTransform:'uppercase' }}>{col.label}</span>
                <span style={{ marginLeft:'auto', fontSize:12, color:'#475569', background:'rgba(30,41,59,0.6)', padding:'1px 8px', borderRadius:999 }}>
                  {grouped[col.key]?.length || 0}
                </span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {grouped[col.key]?.length === 0
                  ? <div style={{ fontSize:12, color:'#334155', textAlign:'center', padding:'20px 0' }}>No tasks</div>
                  : grouped[col.key].map(t => (
                    <TaskCard key={t.id} task={t} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                  ))
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateModal users={users} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default Tasks
