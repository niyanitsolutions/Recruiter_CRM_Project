import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Edit2, Trash2, Eye, Users, UserPlus,
  CheckCircle2, AlertCircle, Building2, TrendingUp, UserMinus,
  Filter, ChevronLeft, ChevronRight,
} from 'lucide-react'
import hrmService from '../../services/hrmService'
import EmployeeAvatar from '../../components/common/EmployeeAvatar'

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  active:     { bg: 'var(--bg-success)',  color: 'var(--text-success)',  label: 'Active' },
  inactive:   { bg: 'var(--bg-card-alt)', color: 'var(--text-muted)',   label: 'Inactive' },
  terminated: { bg: 'var(--bg-danger)',   color: 'var(--text-danger)',   label: 'Terminated' },
  on_leave:   { bg: 'var(--bg-warning)', color: 'var(--text-warning)',  label: 'On Leave' },
  resigned:   { bg: 'var(--bg-card-alt)', color: 'var(--text-muted)',   label: 'Resigned' },
}

function calcProfilePct(emp) {
  if (!emp) return 0
  const addr = emp.address_info || {}
  const bank = emp.bank_details || {}
  const sections = [
    Boolean(emp.phone && emp.date_of_birth && emp.gender && emp.blood_group &&
      emp.pan_number && emp.aadhaar_number && addr.street && addr.city && addr.state && addr.zip_code),
    Boolean((emp.department_id || emp.department_name) &&
      (emp.designation_id || emp.designation_name) && emp.date_of_joining),
    Boolean(bank.bank_name && bank.account_number && bank.ifsc_code && bank.account_holder_name),
    (emp.emergency_contacts || []).some(c => c?.name && c?.relationship && c?.phone) ||
      Boolean(emp.emergency_contact?.name),
    (emp.qualifications || []).length >= 1,
    Boolean(emp.background_check?.status),
    (emp.documents || []).length >= 1,
  ]
  return Math.round((sections.filter(Boolean).length / sections.length) * 100)
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.inactive
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

function ProfileBadge({ status }) {
  if (status === 'complete')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
        <CheckCircle2 className="w-3 h-3" /> Complete
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
      <AlertCircle className="w-3 h-3" /> Incomplete
    </span>
  )
}

function AccountBadge({ emp }) {
  if (emp.crm_user_id)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
      <AlertCircle className="w-3 h-3" /> None
    </span>
  )
}

function ProfileBar({ pct }) {
  const color = pct >= 80 ? 'var(--text-success)' : pct >= 50 ? 'var(--text-warning)' : 'var(--text-danger)'
  const bg    = pct >= 80 ? 'var(--bg-success)' : pct >= 50 ? 'var(--bg-warning)' : 'var(--bg-danger)'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-card-alt)' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold w-8 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, accent }) {
  return (
    <div
      className="rounded-xl p-4 flex items-center gap-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: accent + '1a' }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none" style={{ color: 'var(--text-heading)' }}>
          {value ?? '—'}
        </p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Employees() {
  const navigate = useNavigate()

  const [employees, setEmployees] = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [search,    setSearch]    = useState('')
  const [status,    setStatus]    = useState('')
  const [loading,   setLoading]   = useState(true)

  const [stats, setStats] = useState({ active: null, onLeave: null, terminated: null })

  const PAGE_SIZE = 20
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Fetch employee list ────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listEmployees({
        page,
        page_size: PAGE_SIZE,
        search:    search  || undefined,
        status:    status  || undefined,
      })
      setEmployees(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch { /* swallow */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [page, status])
  useEffect(() => {
    const t = setTimeout(load, 400)
    return () => clearTimeout(t)
  }, [search])

  // ── Fetch summary stats in parallel ───────────────────────────────
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [activeRes, leaveRes, termRes] = await Promise.all([
          hrmService.listEmployees({ status: 'active',     page_size: 1 }),
          hrmService.listEmployees({ status: 'on_leave',   page_size: 1 }),
          hrmService.listEmployees({ status: 'terminated', page_size: 1 }),
        ])
        setStats({
          active:     activeRes.data.total,
          onLeave:    leaveRes.data.total,
          terminated: termRes.data.total,
        })
      } catch { /* swallow */ }
    }
    fetchStats()
  }, [])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete employee "${name}"?`)) return
    await hrmService.deleteEmployee(id)
    load()
  }

  return (
    <div className="p-6 space-y-5">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Employees</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {total} total employee{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link to="/hrm/employees/new" className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Employee
        </Link>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Employees" value={total}             icon={Users}     accent="#6366f1" />
        <SummaryCard label="Active"          value={stats.active}      icon={TrendingUp} accent="#10b981" />
        <SummaryCard label="On Leave"        value={stats.onLeave}     icon={Building2}  accent="#f59e0b" />
        <SummaryCard label="Terminated"      value={stats.terminated}  icon={UserMinus}  accent="#ef4444" />
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            className="input pl-9 w-full"
            placeholder="Search by name, email, ID…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="relative">
          <Filter
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <select
            className="input pl-9 pr-8 w-40 appearance-none"
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On Leave</option>
            <option value="terminated">Terminated</option>
            <option value="resigned">Resigned</option>
          </select>
        </div>
      </div>

      {/* ── Employee table ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border-card)' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Profile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td colSpan={6} className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full animate-pulse" style={{ background: 'var(--bg-card-alt)' }} />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-40 rounded animate-pulse" style={{ background: 'var(--bg-card-alt)' }} />
                          <div className="h-3 w-28 rounded animate-pulse" style={{ background: 'var(--bg-card-alt)' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No employees found</p>
                    <p className="text-xs mt-1 opacity-60">Try adjusting your search or filters</p>
                  </td>
                </tr>
              ) : employees.map(emp => {
                const pct = calcProfilePct(emp)
                return (
                  <tr
                    key={emp.id}
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Employee column */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar name={emp.full_name} photoUrl={emp.photo_url} size={40} />
                        <div className="min-w-0">
                          <p className="font-semibold truncate" style={{ color: 'var(--text-heading)' }}>
                            {emp.full_name}
                          </p>
                          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                            {emp.employee_id}
                          </p>
                          {emp.email && (
                            <p className="text-xs truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
                              {emp.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role/Dept column */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {emp.designation_name || '—'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {emp.department_name || ''}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={emp.employment_status} />
                    </td>

                    {/* Profile */}
                    <td className="px-4 py-3" style={{ minWidth: 160 }}>
                      <div className="space-y-1.5">
                        <ProfileBadge status={emp.employee_profile_status} />
                        <ProfileBar pct={pct} />
                        {emp.employee_profile_status === 'complete' ? (
                          <button
                            onClick={() => navigate(`/hrm/employees/${emp.id}`)}
                            className="text-xs hover:underline"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            View Profile
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/hrm/employees/${emp.id}/edit`)}
                            className="text-xs hover:underline"
                            style={{ color: 'var(--text-info)' }}
                          >
                            Complete Profile
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Account */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <AccountBadge emp={emp} />
                        {!emp.crm_user_id ? (
                          <button
                            onClick={() => navigate(`/users/new?employee_id=${emp.id}`)}
                            className="inline-flex items-center gap-1 text-xs hover:underline"
                            style={{ color: 'var(--text-info)' }}
                          >
                            <UserPlus className="w-3 h-3" /> Create Account
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/users/${emp.crm_user_id}`)}
                            className="text-xs hover:underline"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            View User
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => navigate(`/hrm/employees/${emp.id}`)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--text-info)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-info)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/hrm/employees/${emp.id}/edit`)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--text-warning)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-warning)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id, emp.full_name)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--text-danger)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-danger)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {total > PAGE_SIZE && (
          <div
            className="flex items-center justify-between px-4 py-3 text-sm"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded-lg disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span style={{ color: 'var(--text-muted)' }}>
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-lg disabled:opacity-40"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
