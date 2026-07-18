import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Edit2, Trash2, Eye, Users, UserPlus,
  CheckCircle2, AlertCircle, Building2, TrendingUp, UserMinus,
  Filter, ChevronLeft, ChevronRight, ShieldAlert,
  Link2, ArrowUpFromLine, ChevronDown, Mail, Copy, Check, Loader2,
} from 'lucide-react'
import hrmService from '../../services/hrmService'
import subscriptionService from '../../services/subscriptionService'
import { useLivePolling } from '../../hooks/useLivePolling'
import { publish, LIVE_TOPICS } from '../../utils/liveUpdateBus'
import EmployeeAvatar from '../../components/common/EmployeeAvatar'
import ModalPortal from '../../components/common/ModalPortal'
import SeatLimitModal from '../../components/subscription/SeatLimitModal'
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  probation:          { bg: 'var(--bg-info)',     color: 'var(--text-info)',     label: 'Probation' },
  active:             { bg: 'var(--bg-success)',  color: 'var(--text-success)',  label: 'Active' },
  notice_period:      { bg: 'var(--bg-warning)',  color: 'var(--text-warning)',  label: 'Notice Period' },
  inactive:           { bg: 'var(--bg-card-alt)', color: 'var(--text-muted)',   label: 'Inactive' },
  terminated:         { bg: 'var(--bg-danger)',   color: 'var(--text-danger)',   label: 'Terminated' },
  on_leave:           { bg: 'var(--bg-warning)', color: 'var(--text-warning)',  label: 'On Leave' },
  resigned:           { bg: 'var(--bg-card-alt)', color: 'var(--text-muted)',   label: 'Resigned' },
  pending_hr_review:  { bg: '#fef3c7',            color: '#92400e',              label: 'Pending HR Review' },
  profile_incomplete: { bg: 'var(--bg-card-alt)', color: 'var(--text-muted)',   label: 'Profile Incomplete' },
  ready_for_approval: { bg: 'var(--bg-info)',     color: 'var(--text-info)',     label: 'Ready for Approval' },
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

function DeleteEmployeeDialog({ isOpen, employeeName, onConfirm, onCancel }) {
  if (!isOpen) return null
  const willDelete = [
    'Employee profile', 'HR information', 'Employee documents', 'Employee photo',
    'Attendance', 'Leave records', 'Salary records',
    'Employee onboarding records', 'Employee-specific data',
  ]
  const willKeep = [
    'Candidates', 'Clients', 'Jobs', 'Interviews', 'Applications',
    'Tasks', 'Reports', 'Business records created by this employee', 'Audit Logs',
  ]
  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
        <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
          <h3 className="text-lg font-bold text-gray-900">Delete Employee</h3>
          <p className="mt-1.5 text-sm text-gray-600">
            You are about to permanently delete <strong>{employeeName}</strong>. This cannot be undone.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-red-600 mb-1.5">Will be deleted</p>
              <ul className="space-y-1">
                {willDelete.map(item => (
                  <li key={item} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-green-600 mb-1.5">Will NOT be deleted</p>
              <ul className="space-y-1">
                {willKeep.map(item => (
                  <li key={item} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl"
            >
              Delete Employee
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
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

  // ── Subscription seat status ───────────────────────────────────────
  const [seatStatus,       setSeatStatus]       = useState(null)
  const [seatModalOpen,    setSeatModalOpen]    = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  const refreshSeatStatus = () => {
    subscriptionService.getTenantSeatStatus()
      .then(res => setSeatStatus(res.data?.data || null))
      .catch(() => {})
  }

  useEffect(() => { refreshSeatStatus() }, [])

  // ── Delete confirmation ─────────────────────────────────────────────
  const [deleteDialog, setDeleteDialog] = useState({ open: false, employee: null })

  const PAGE_SIZE = 20
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Fetch employee list ────────────────────────────────────────────
  const load = async (silent = false) => {
    if (!silent) setLoading(true)
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
    if (!silent) setLoading(false)
  }

  useEffect(() => { load() }, [page, status])
  useEffect(() => {
    const t = setTimeout(load, 400)
    return () => clearTimeout(t)
  }, [search])

  // Live background refresh — reflects another admin's create/delete within
  // seconds, and refreshes immediately when this tab's own mutation publishes.
  useLivePolling(() => load(true), 5000, true, [LIVE_TOPICS.EMPLOYEES])

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

  const handleDelete = (id, name) => {
    setDeleteDialog({ open: true, employee: { id, name } })
  }

  const confirmDelete = async () => {
    const emp = deleteDialog.employee
    if (!emp) return
    await hrmService.deleteEmployee(emp.id)
    setDeleteDialog({ open: false, employee: null })
    load()
    refreshSeatStatus()
    publish(LIVE_TOPICS.EMPLOYEES); publish(LIVE_TOPICS.DASHBOARD)
  }

  // HR approves a "Ready for Approval" employee → moves them to Active/Probation.
  const [approvingId, setApprovingId] = useState(null)
  const handleApprove = async (emp) => {
    setApprovingId(emp.id)
    try {
      await hrmService.approveEmployee(emp.id)
      await load()
      publish(LIVE_TOPICS.EMPLOYEES); publish(LIVE_TOPICS.DASHBOARD)
    } catch { /* swallow — consistent with this list's error handling */ }
    setApprovingId(null)
  }

  // ── Send Form Link (general or per-employee individual link) ────────
  const [linkModal,    setLinkModal]    = useState(false)
  const [linkEmail,    setLinkEmail]    = useState('')
  const [linkEmployee, setLinkEmployee] = useState(null) // set when opened from a specific employee row
  const [linkSending,  setLinkSending]  = useState(false)
  const [linkResult,   setLinkResult]   = useState(null) // { url, email_sent }
  const [linkCopied,   setLinkCopied]   = useState(false)

  const openLinkModal = () => {
    setLinkModal(true)
    setLinkEmail('')
    setLinkEmployee(null)
    setLinkResult(null)
    setLinkSending(false)
    setLinkCopied(false)
  }

  const openIndividualLinkModal = (emp) => {
    setLinkModal(true)
    setLinkEmail(emp.email || '')
    setLinkEmployee(emp)
    setLinkResult(null)
    setLinkSending(false)
    setLinkCopied(false)
  }

  const handleGenerateLink = async () => {
    setLinkSending(true)
    try {
      const base = window.location.origin
      const res = await hrmService.generateOnboardingLink({
        email: linkEmail.trim() || undefined,
        frontend_base_url: base,
        employee_id: linkEmployee?.id || undefined,
      })
      setLinkResult(res.data)
    } catch (err) {
      setLinkResult({ error: err.response?.data?.detail || 'Failed to generate link.' })
    } finally {
      setLinkSending(false)
    }
  }

  const handleCopyLink = () => {
    if (!linkResult?.form_url) return
    navigator.clipboard.writeText(linkResult.form_url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // ── Export ─────────────────────────────────────────────────────────
  const [exportOpen,    setExportOpen]    = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError,   setExportError]   = useState(false)
  const exportRef = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleExport = async (format) => {
    setExportOpen(false)
    setExportLoading(true)
    try {
      const res = await hrmService.exportEmployees({
        format,
        status: status || undefined,
        search: search || undefined,
      })

      const blob = res.data
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('Empty response')
      }

      // Detect error responses returned as blobs (HTML page or JSON error)
      const contentType = res.headers?.['content-type'] || ''
      if (contentType.startsWith('text/html') || contentType.includes('application/json')) {
        throw new Error('Server returned an error response instead of the file')
      }

      // Secondary guard: peek at first bytes — HTML and JSON errors start with < or {
      const prefix = await blob.slice(0, 5).text()
      const firstChar = prefix.trimStart()[0] || ''
      if (firstChar === '<' || firstChar === '{') {
        throw new Error('Corrupt response content detected')
      }

      const ext = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `employees_${new Date().toISOString().slice(0, 10)}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[Employee Export] failed:', err)
      setExportError(true)
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Employees</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {total} total employee{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Send Form Link */}
          <button
            onClick={openLinkModal}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium border transition-colors"
            style={{
              color: 'var(--text-info)',
              borderColor: 'var(--text-info)',
              background: 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-info)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Link2 className="w-4 h-4" /> Send Form Link
          </button>

          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(v => !v)}
              disabled={exportLoading}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium border transition-colors disabled:opacity-50"
              style={{
                color: 'var(--text-secondary)',
                borderColor: 'var(--border-card)',
                background: 'var(--bg-card)',
              }}
            >
              {exportLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ArrowUpFromLine className="w-4 h-4" />}
              Export
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 mt-1 w-36 rounded-xl shadow-lg py-1 z-50 border"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
              >
                {['csv', 'xlsx', 'pdf'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Export as {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Link to="/hrm/employees/new" className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Employee
          </Link>
        </div>
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
            <option value="pending_hr_review">Pending HR Review</option>
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

                    {/* Status — auto-derived workflow status (falls back to the
                        raw employment_status for older payloads). */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <StatusBadge status={emp.workflow_status || emp.employment_status} />
                        {(emp.workflow_status || emp.employment_status) === 'ready_for_approval' && (
                          <button
                            onClick={() => handleApprove(emp)}
                            disabled={approvingId === emp.id}
                            className="block text-xs hover:underline"
                            style={{ color: 'var(--text-success)' }}
                          >
                            {approvingId === emp.id ? 'Approving…' : 'Approve'}
                          </button>
                        )}
                      </div>
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
                          seatStatus?.seat_limit_reached ? (
                            <button
                              onClick={() => setSeatModalOpen(true)}
                              className="inline-flex items-center gap-1 text-xs hover:underline"
                              style={{ color: 'var(--text-danger)' }}
                              title="No available user seats. Upgrade or extend your subscription to create this user."
                            >
                              <ShieldAlert className="w-3 h-3" /> Manage Subscription
                            </button>
                          ) : (
                            <button
                              onClick={() => navigate(`/users/new?employee_id=${emp.id}`)}
                              className="inline-flex items-center gap-1 text-xs hover:underline"
                              style={{ color: 'var(--text-info)' }}
                            >
                              <UserPlus className="w-3 h-3" /> Create Account
                            </button>
                          )
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
                          onClick={() => openIndividualLinkModal(emp)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--text-info)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-info)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          title="Send Individual Link"
                        >
                          <Link2 className="w-4 h-4" />
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

      {/* ── Export Error Modal ──────────────────────────────────────────── */}
      {exportError && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-900">Export Failed</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Unable to generate export file. Please try again.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setExportError(false)}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Form Link Modal ─────────────────────────────────────────── */}
      {linkModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {linkEmployee ? `Send Link to ${linkEmployee.full_name}` : 'Send Onboarding Form Link'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {linkEmployee
                    ? 'Generates a link scoped to this employee only — it opens their own onboarding form.'
                    : 'Generate a one-time link for an employee to fill in their own details.'}
                </p>
              </div>
            </div>

            {!linkResult ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Employee Email <span className="text-gray-400 font-normal">(optional — to send the link by email)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={linkEmail}
                      onChange={e => setLinkEmail(e.target.value)}
                      placeholder="employee@example.com"
                      disabled={!!linkEmployee}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                      onKeyDown={e => e.key === 'Enter' && handleGenerateLink()}
                    />
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setLinkModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerateLink}
                    disabled={linkSending}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                  >
                    {linkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Generate Link
                  </button>
                </div>
              </>
            ) : linkResult.error ? (
              <>
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  {linkResult.error}
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setLinkResult(null)}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setLinkModal(false)}
                    className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-green-800">
                      Link Generated{linkResult.email_sent ? ' & Emailed' : ''}
                    </span>
                  </div>
                  {linkResult.email_sent && (
                    <p className="text-xs text-green-700 mb-2">Email sent to {linkEmail}.</p>
                  )}
                  <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
                    <span className="flex-1 text-xs font-mono text-gray-700 truncate">{linkResult.form_url}</span>
                    <button onClick={handleCopyLink} className="flex-shrink-0 text-indigo-600 hover:text-indigo-800">
                      {linkCopied
                        ? <Check className="w-4 h-4 text-green-600" />
                        : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">This link expires in 7 days and can only be used once.</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => linkEmployee ? openIndividualLinkModal(linkEmployee) : openLinkModal()}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700"
                  >
                    Generate Another
                  </button>
                  <button
                    onClick={() => setLinkModal(false)}
                    className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Employee Confirmation ─────────────────────────────────── */}
      <DeleteEmployeeDialog
        isOpen={deleteDialog.open}
        employeeName={deleteDialog.employee?.name}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ open: false, employee: null })}
      />

      {/* ── Subscription seat-limit modals ───────────────────────────────── */}
      <SeatLimitModal
        isOpen={seatModalOpen}
        onClose={() => setSeatModalOpen(false)}
        onUpgrade={() => { setSeatModalOpen(false); setUpgradeModalOpen(true) }}
        seatStatus={seatStatus}
      />
      <UpgradeSeatsModal
        isOpen={upgradeModalOpen}
        onClose={() => { setUpgradeModalOpen(false); refreshSeatStatus() }}
        seatStatus={seatStatus}
      />
    </div>
  )
}
