/**
 * HRM Sync Panel — resolve User↔Employee linking gaps
 * Shows two lists:
 *   Left:  CRM users without an employee record  → "Create Employee" (one-click)
 *   Right: HRM employees without a CRM user       → "Create User" (one-click, role selection)
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Users, UserPlus, RefreshCw, CheckCircle, AlertCircle, Loader2, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

const ROLES = [
  { value: 'hr',                    label: 'HR' },
  { value: 'candidate_coordinator', label: 'Candidate Coordinator' },
  { value: 'client_coordinator',    label: 'Client Coordinator' },
  { value: 'accounts',              label: 'Accounts' },
]

function StatusBadge({ count, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
      count === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {count === 0 ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {count} {label}
    </span>
  )
}

// ── Unlinked CRM Users (need employee record) ─────────────────────────────────
function UnlinkedUsersPanel({ onSync }) {
  const [users, setUsers]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState({}) // { [user_id]: true }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getUnlinkedUsers({ page, page_size: 10 })
      const data = res.data
      setUsers(data.items || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Failed to load unlinked users')
    }
    setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleSync = async (user) => {
    setSyncing(s => ({ ...s, [user.id]: true }))
    try {
      const res = await hrmService.syncUserToEmployee(user.id)
      const data = res.data
      if (data.success) {
        toast.success(`Employee record created for ${user.full_name}`)
        load()
        onSync()
      } else {
        toast.error(data.message || 'Sync failed')
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Sync failed')
    }
    setSyncing(s => ({ ...s, [user.id]: false }))
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,172,254,0.12)' }}>
            <Users className="w-4 h-4" style={{ color: '#4FACFE' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>CRM Users Without Employee Record</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create a linked employee profile</p>
          </div>
        </div>
        <StatusBadge count={total} label="unlinked" />
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <CheckCircle className="w-8 h-8 text-green-500" />
            All CRM users have employee records
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
                  style={{ background: '#4FACFE' }}>
                  {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{u.full_name || '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{u.email} · {u.role}</p>
                </div>
                <button
                  onClick={() => handleSync(u)}
                  disabled={syncing[u.id]}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(79,172,254,0.12)', color: '#4FACFE', border: '1px solid rgba(79,172,254,0.25)' }}
                  onMouseEnter={e => { if (!syncing[u.id]) e.currentTarget.style.background = 'rgba(79,172,254,0.22)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,172,254,0.12)' }}
                >
                  {syncing[u.id]
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <UserPlus className="w-3.5 h-3.5" />}
                  Create Employee
                </button>
              </div>
            ))}
          </div>
        )}

        {total > 10 && (
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Page {page} · {total} total</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 rounded text-xs disabled:opacity-40"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={users.length < 10}
                className="px-2 py-1 rounded text-xs disabled:opacity-40"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Unlinked Employees (need CRM user account) ────────────────────────────────
function UnlinkedEmployeesPanel({ onSync }) {
  const [employees, setEmployees] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState({})
  const [roleFor, setRoleFor]     = useState({}) // { [emp_id]: role }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getUnlinkedEmployees({ page, page_size: 10 })
      const data = res.data
      setEmployees(data.items || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Failed to load unlinked employees')
    }
    setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const handleSync = async (emp) => {
    setSyncing(s => ({ ...s, [emp.id]: true }))
    const role = roleFor[emp.id] || 'hr'
    try {
      const res = await hrmService.syncEmployeeToUser(emp.id, { role })
      const data = res.data
      if (data.success) {
        const msg = data.user?.temp_password
          ? `User created. Temp password: ${data.user.temp_password}`
          : data.message || 'User account created'
        toast.success(msg, { duration: 6000 })
        load()
        onSync()
      } else {
        toast.error(data.message || 'Sync failed')
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Sync failed')
    }
    setSyncing(s => ({ ...s, [emp.id]: false }))
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(56,249,215,0.12)' }}>
            <UserX className="w-4 h-4" style={{ color: '#38F9D7' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>Employees Without CRM User Account</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create a linked CRM user account</p>
          </div>
        </div>
        <StatusBadge count={total} label="unlinked" />
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <CheckCircle className="w-8 h-8 text-green-500" />
            All employees have CRM user accounts
          </div>
        ) : (
          <div className="space-y-2">
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
                  style={{ background: '#38F9D7', color: '#065f46' }}>
                  {(emp.full_name || emp.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{emp.full_name || '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{emp.email} · {emp.employee_id}</p>
                </div>
                <select
                  value={roleFor[emp.id] || 'hr'}
                  onChange={e => setRoleFor(r => ({ ...r, [emp.id]: e.target.value }))}
                  className="flex-shrink-0 text-xs rounded-lg px-2 py-1.5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button
                  onClick={() => handleSync(emp)}
                  disabled={syncing[emp.id]}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(56,249,215,0.12)', color: '#0f766e', border: '1px solid rgba(56,249,215,0.35)' }}
                  onMouseEnter={e => { if (!syncing[emp.id]) e.currentTarget.style.background = 'rgba(56,249,215,0.22)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56,249,215,0.12)' }}
                >
                  {syncing[emp.id]
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <UserPlus className="w-3.5 h-3.5" />}
                  Create User
                </button>
              </div>
            ))}
          </div>
        )}

        {total > 10 && (
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Page {page} · {total} total</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 rounded text-xs disabled:opacity-40"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={employees.length < 10}
                className="px-2 py-1 rounded text-xs disabled:opacity-40"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HRMSyncPanel() {
  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [rev, setRev]         = useState(0) // incremented after any sync to refresh status

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.getSyncStatus()
      setStatus(res.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus, rev])

  const onSync = () => setRev(r => r + 1)

  const totalPending = (status?.unlinked_users || 0) + (status?.unlinked_employees || 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>User ↔ Employee Sync</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Resolve linking gaps between CRM user accounts and HRM employee records
          </p>
        </div>
        <button
          onClick={() => setRev(r => r + 1)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Status summary */}
      {!loading && status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Users',     value: status.total_users,     color: '#7c3aed' },
            { label: 'Total Employees', value: status.total_employees, color: '#4FACFE' },
            { label: 'Linked',          value: status.linked,          color: '#22c55e' },
            { label: 'Unlinked',        value: totalPending,           color: totalPending > 0 ? '#f59e0b' : '#22c55e' },
          ].map(s => (
            <div key={s.label} className="rounded-xl px-4 py-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value ?? '—'}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Panels */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <UnlinkedUsersPanel onSync={onSync} />
        <UnlinkedEmployeesPanel onSync={onSync} />
      </div>
    </div>
  )
}
