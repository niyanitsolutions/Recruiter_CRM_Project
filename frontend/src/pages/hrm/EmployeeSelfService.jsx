/**
 * Employee Self-Service portal — profile, attendance, payslips, leave, documents, assets.
 * Employee ID is resolved dynamically via /me/today (server-side), NOT from JWT.
 * This ensures the portal works even when the JWT was issued before employee linking.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import {
  User, Clock, Calendar, Banknote, Plus, UserX, X,
  Loader2, FolderOpen, Package, FileText, Download,
  ChevronLeft, ChevronRight, History,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

const TABS = [
  { key: 'profile',    label: 'My Profile',  icon: User },
  { key: 'attendance', label: 'Attendance',   icon: Clock },
  { key: 'payslips',   label: 'Payslips',     icon: Banknote },
  { key: 'leaves',     label: 'Leave',        icon: Calendar },
  { key: 'documents',  label: 'Documents',    icon: FolderOpen },
  { key: 'assets',     label: 'Assets',       icon: Package },
]

/** Convert decimal hours to human-readable format: 0.03 → "2m", 2.2 → "2h 12m" */
function fmtHours(hours) {
  if (!hours) return '—'
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  if (totalMinutes === 0) return '—'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const STATUS_COLORS = {
  present:  { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  late:     { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  absent:   { bg: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  half_day: { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  on_leave: { bg: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  wfh:      { bg: 'rgba(99,102,241,0.15)',  color: '#818CF8' },
  holiday:  { bg: 'rgba(108,99,255,0.15)',  color: '#A78BFA' },
  weekend:  { bg: 'rgba(139,143,168,0.10)', color: '#8B8FA8' },
  pending:  { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  approved: { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  rejected: { bg: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  cancelled:{ bg: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  paid:     { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  draft:    { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  active:   { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  assigned: { bg: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  returned: { bg: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  available:{ bg: 'rgba(67,233,123,0.10)',  color: '#10b981' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_COLORS[status] || { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' }
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ employeeId }) {
  const [emp, setEmp] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employeeId) { setLoading(false); return }
    hrmService.getEmployee(employeeId)
      .then(r => setEmp(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [employeeId])

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )
  if (!emp) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
      No employee record linked to your account.
    </div>
  )

  const Field = ({ label, value }) => value ? (
    <div>
      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-disabled)' }}>{label}</p>
      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-body)' }}>{value}</p>
    </div>
  ) : null

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}
        >
          {emp.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>{emp.full_name}</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {emp.designation_name || ''}
            {emp.department_name ? ` · ${emp.department_name}` : ''}
          </p>
          <StatusBadge status={emp.employment_status} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        <Field label="Employee ID"       value={emp.employee_id} />
        <Field label="Email"             value={emp.email} />
        <Field label="Phone"             value={emp.phone} />
        <Field label="Department"        value={emp.department_name} />
        <Field label="Designation"       value={emp.designation_name} />
        <Field label="Reporting Manager" value={emp.reporting_manager_name} />
        <Field label="Employment Type"   value={emp.employment_type?.replace(/_/g, ' ')} />
        <Field label="Date of Joining"   value={emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString('en-IN') : null} />
        <Field label="Work Location"     value={emp.work_location} />
        <Field label="Shift"             value={emp.shift_start_time && emp.shift_end_time ? `${emp.shift_start_time} – ${emp.shift_end_time}` : null} />
      </div>
    </div>
  )
}

// ── Attendance Tab ────────────────────────────────────────────────────────────

// ── Attendance helpers ─────────────────────────────────────────────────────────

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const ATT_PRESETS = [
  { key: 'today',       label: 'Today' },
  { key: 'yesterday',   label: 'Yesterday' },
  { key: 'this_week',   label: 'This Week' },
  { key: 'this_month',  label: 'This Month' },
  { key: 'last_month',  label: 'Last Month' },
  { key: 'last_3m',     label: 'Last 3 Months' },
  { key: 'custom',      label: 'Custom Range' },
]

function calcAttPreset(key) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (key) {
    case 'today':      return { start: today, end: today }
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { start: y, end: y } }
    case 'this_week': {
      const dow = today.getDay(); const sun = new Date(today); sun.setDate(today.getDate() - dow)
      const sat = new Date(sun); sat.setDate(sun.getDate() + 6); return { start: sun, end: sat }
    }
    case 'this_month':  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today }
    case 'last_month': {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const l = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: f, end: l }
    }
    case 'last_3m': {
      const s = new Date(today); s.setMonth(s.getMonth() - 3); return { start: s, end: today }
    }
    default: return null
  }
}

function AttendanceTab() {
  const [preset, setPreset]         = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd]   = useState('')
  const [records, setRecords]       = useState([])
  const [total, setTotal]           = useState(0)
  const [pages, setPages]           = useState(1)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [exporting, setExporting]   = useState(false)

  // Live timer for active session
  const [activeSession, setActiveSession] = useState(null)
  const [elapsed, setElapsed]             = useState(0)

  // Load today's active session
  useEffect(() => {
    hrmService.getMyTodayAttendance()
      .then(r => {
        const data = r.data
        if (data?.check_in && !data?.check_out) {
          setActiveSession(data)
        }
      })
      .catch(() => {})
  }, [])

  // Tick every second when active session exists
  useEffect(() => {
    if (!activeSession?.check_in) return
    const tick = () => {
      const checkedIn = new Date(activeSession.check_in.endsWith('Z') ? activeSession.check_in : activeSession.check_in + 'Z')
      const breakSecs = (activeSession.total_break_minutes || 0) * 60
      setElapsed(Math.floor((Date.now() - checkedIn.getTime()) / 1000) - breakSecs)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeSession])

  const range = preset === 'custom'
    ? (customStart && customEnd ? { start: customStart, end: customEnd } : null)
    : (() => { const r = calcAttPreset(preset); return r ? { start: fmtDate(r.start), end: fmtDate(r.end) } : null })()

  const load = useCallback(async (pg = 1) => {
    if (!range) return
    setLoading(true); setError('')
    try {
      const r = await hrmService.getMyAttendanceHistory({
        start_date: range.start, end_date: range.end, page: pg, page_size: 31,
      })
      const data = r.data
      setRecords(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setPage(pg)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load attendance records')
      setRecords([])
    }
    setLoading(false)
  }, [range?.start, range?.end])

  useEffect(() => { if (range) load(1) }, [load])

  const handleExport = async () => {
    if (!range) return
    setExporting(true)
    try {
      const r = await hrmService.exportMyAttendanceCsv({ start_date: range.start, end_date: range.end })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url
      a.download = `my-attendance-${range.start}-to-${range.end}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
    setExporting(false)
  }

  const fmtSecs = s => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
    return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(sec).padStart(2,'0')}s`
  }

  const summary = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})

  return (
    <div className="p-6 space-y-4">

      {/* Live session banner */}
      {activeSession && elapsed > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
             style={{ background: 'rgba(67,233,123,0.12)', border: '1px solid rgba(67,233,123,0.25)' }}>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <span className="text-sm font-medium" style={{ color: '#43E97B' }}>
            Active session — {fmtSecs(elapsed)}
          </span>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
            Checked in at {new Date(activeSession.check_in.endsWith('Z') ? activeSession.check_in : activeSession.check_in + 'Z')
              .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <select className="input text-sm h-9" value={preset}
          onChange={e => { setPreset(e.target.value); setPage(1) }} style={{ minWidth: 140 }}>
          {ATT_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {preset === 'custom' && (
          <>
            <input type="date" className="input text-sm h-9" value={customStart}
              onChange={e => { setCustomStart(e.target.value); setPage(1) }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
            <input type="date" className="input text-sm h-9" value={customEnd}
              onChange={e => { setCustomEnd(e.target.value); setPage(1) }} />
          </>
        )}
        <div className="flex-1" />
        <button onClick={handleExport} disabled={exporting || !range}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--bg-success)', color: 'var(--text-success)', opacity: (exporting || !range) ? 0.5 : 1 }}>
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          CSV
        </button>
      </div>

      {/* Summary badges */}
      {Object.keys(summary).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(summary).map(([st, cnt]) => {
            const cfg = STATUS_COLORS[st] || { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' }
            return (
              <span key={st} className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: cfg.bg, color: cfg.color }}>
                {st.replace(/_/g,' ')} · {cnt}
              </span>
            )
          })}
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium ml-1"
                style={{ background: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
            Total {total}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : records.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <History className="w-10 h-10 opacity-30" />
          <p className="text-sm">No attendance records for this period</p>
          {preset === 'custom' && (!customStart || !customEnd) && (
            <p className="text-xs opacity-60">Select a start and end date above</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden"
             style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-alt)' }}>
                  {['Date','Status','Check In','Check Out','Worked','Break','OT','Late'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: 'var(--text-disabled)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((rec, i) => {
                  const cfg = STATUS_COLORS[rec.status] || { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' }
                  const checkIn  = rec.check_in  ? new Date(rec.check_in.endsWith('Z')  ? rec.check_in  : rec.check_in  + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'
                  const checkOut = rec.check_out ? new Date(rec.check_out.endsWith('Z') ? rec.check_out : rec.check_out + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'
                  const dateStr  = rec.date ? new Date(rec.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', weekday: 'short' }) : '—'
                  return (
                    <tr key={rec.id || i}
                        style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-row-alt)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>{dateStr}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                              style={{ background: cfg.bg, color: cfg.color }}>
                          {rec.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>{checkIn}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>{checkOut}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs font-medium" style={{ color: 'var(--text-heading)' }}>
                        {rec.work_hours ? fmtHours(rec.work_hours) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>
                        {rec.total_break_minutes ? fmtHours(rec.total_break_minutes / 60) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs"
                          style={{ color: rec.overtime_hours > 0 ? 'var(--text-warning)' : 'var(--text-muted)' }}>
                        {rec.overtime_hours > 0 ? fmtHours(rec.overtime_hours) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs"
                          style={{ color: rec.is_late ? 'var(--text-warning)' : 'var(--text-muted)' }}>
                        {rec.is_late && rec.late_by_minutes > 0 ? `+${rec.late_by_minutes}m` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t"
                 style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-alt)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Page {page} of {pages} · {total} records
              </span>
              <div className="flex gap-1">
                <button onClick={() => load(page - 1)} disabled={page <= 1}
                  className="p-1.5 rounded" style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                  <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                  let pg = i + 1
                  if (pages > 5) {
                    if (page <= 3)        pg = i + 1
                    else if (page >= pages - 2) pg = pages - 4 + i
                    else                  pg = page - 2 + i
                  }
                  return (
                    <button key={pg} onClick={() => load(pg)}
                      className="w-7 h-7 rounded text-xs font-medium"
                      style={{ background: pg === page ? 'var(--bg-info)' : 'transparent', color: pg === page ? 'var(--text-info)' : 'var(--text-muted)' }}>
                      {pg}
                    </button>
                  )
                })}
                <button onClick={() => load(page + 1)} disabled={page >= pages}
                  className="p-1.5 rounded" style={{ opacity: page >= pages ? 0.4 : 1 }}>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Payslips Tab ──────────────────────────────────────────────────────────────

function PayslipsTab() {
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    hrmService.listOwnPayslips({ page_size: 24 })
      .then(r => setPayslips(r.data?.items || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fmt = n => n?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) || '—'

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )

  return (
    <div className="p-6 space-y-2">
      {payslips.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>No payslips yet</div>
      ) : payslips.map(ps => (
        <div
          key={ps.id}
          className="flex items-center justify-between py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <p className="font-medium" style={{ color: 'var(--text-body)' }}>
              {new Date(2000, ps.month - 1).toLocaleString('default', { month: 'long' })} {ps.year}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Net: {fmt(ps.net_salary)}</p>
          </div>
          <StatusBadge status={ps.status} />
        </div>
      ))}
    </div>
  )
}

// ── Leave Tab ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = { leave_type: '', duration: 'full_day', from_date: '', to_date: '', reason: '' }

function LeaveBalanceCard({ b }) {
  const pct = b.allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.allocated) * 100) : 0
  const color = b.color || '#3b82f6'
  return (
    <div className="rounded-xl p-3.5 flex flex-col gap-2"
         style={{ background: 'var(--bg-alt)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs font-semibold uppercase tracking-wide truncate"
              style={{ color: 'var(--text-disabled)' }}>
          {b.code || b.name}
        </span>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-xl font-bold leading-none" style={{ color: 'var(--text-heading)' }}>
          {b.remaining}
        </span>
        <span className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>/ {b.allocated}d</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        <div className="h-full rounded-full transition-all"
             style={{ width: `${pct}%`, background: pct >= 90 ? '#ef4444' : color }} />
      </div>
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-disabled)' }}>
        <span>Used {b.used}</span>
        {b.pending > 0 && <span style={{ color: '#f59e0b' }}>Pend {b.pending}</span>}
      </div>
    </div>
  )
}

function LeaveTab({ employeeId }) {
  const [leaves, setLeaves]         = useState([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [balances, setBalances]     = useState([])
  const [balLoading, setBalLoading] = useState(true)
  const [showApply, setShowApply]   = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [formError, setFormError]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [cancelLoading, setCancelLoading] = useState({})

  const loadBalances = useCallback(async () => {
    setBalLoading(true)
    try {
      const r = await hrmService.getMyLeaveBalance()
      const data = r.data || []
      setBalances(data)
      // Pre-select first leave type in form
      if (data.length > 0) setForm(f => ({ ...f, leave_type: f.leave_type || data[0].leave_type }))
    } catch { setBalances([]) }
    setBalLoading(false)
  }, [])

  const load = useCallback(async () => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await hrmService.listMyLeaves({ page_size: 50 })
      setLeaves(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch {/* silent */}
    setLoading(false)
  }, [employeeId])

  useEffect(() => { load(); loadBalances() }, [load, loadBalances])

  const openApply = () => {
    setForm({ ...EMPTY_FORM, leave_type: balances[0]?.leave_type || 'casual' })
    setFormError('')
    setShowApply(true)
  }
  const closeApply = () => { setShowApply(false); setFormError('') }

  const handleApply = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.from_date || !form.to_date) { setFormError('Select both from and to dates.'); return }
    if (form.from_date > form.to_date)    { setFormError('From date cannot be after To date.'); return }
    if (!form.reason || form.reason.trim().length < 5) { setFormError('Reason must be at least 5 characters.'); return }

    setSaving(true)
    try {
      await hrmService.applyLeave(form)
      toast.success('Leave application submitted successfully')
      closeApply()
      load()
      loadBalances()
    } catch (err) {
      // Server may return either `detail` (HTTPException) or `message` (custom handler)
      const raw = err?.response?.data
      const detail = raw?.detail || raw?.message
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail) ? detail.map(d => d?.msg || String(d)).join('; ')
        : `Submission failed: ${err?.message || 'unknown error'} (HTTP ${err?.response?.status || 'no response'})`
      console.error('[LeaveApply] error:', err?.message, err?.code, err?.response?.status, raw)
      setFormError(msg)
      toast.error(msg)
    }
    setSaving(false)
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this leave application?')) return
    setCancelLoading(p => ({ ...p, [id]: true }))
    try {
      await hrmService.cancelLeave(id)
      toast.success('Leave cancelled')
      load()
      loadBalances()
    } catch (ex) {
      toast.error(ex?.response?.data?.detail || 'Failed to cancel leave')
    }
    setCancelLoading(p => ({ ...p, [id]: false }))
  }

  return (
    <div className="p-6 space-y-5">

      {/* Balance Cards */}
      {balLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl p-3.5 animate-pulse h-24"
                 style={{ background: 'var(--bg-alt)', border: '1px solid var(--border-subtle)' }} />
          ))}
        </div>
      ) : balances.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {balances.map(b => <LeaveBalanceCard key={b.policy_id} b={b} />)}
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {total} leave application{total !== 1 ? 's' : ''}
        </p>
        <button onClick={openApply} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      {/* Apply Modal */}
      <ModalPortal isOpen={showApply}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <form
            onSubmit={handleApply}
            className="rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Apply for Leave</h2>

            {formError && (
              <div className="flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg"
                   style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}>
                <UserX className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Leave Type</label>
                <select className="input w-full mt-1" value={form.leave_type}
                        onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
                  {balances.length > 0
                    ? balances.map(b => (
                        <option key={b.policy_id} value={b.leave_type}>
                          {b.name} ({b.remaining}d left)
                        </option>
                      ))
                    : (
                      <>
                        <option value="casual">Casual Leave</option>
                        <option value="sick">Sick Leave</option>
                        <option value="earned">Earned Leave</option>
                        <option value="maternity">Maternity Leave</option>
                        <option value="paternity">Paternity Leave</option>
                        <option value="comp_off">Compensatory Off</option>
                        <option value="unpaid">Unpaid Leave</option>
                      </>
                    )
                  }
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Duration</label>
                <select className="input w-full mt-1" value={form.duration}
                        onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}>
                  <option value="full_day">Full Day</option>
                  <option value="half_day_morning">Half Day – Morning</option>
                  <option value="half_day_afternoon">Half Day – Afternoon</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>From Date</label>
                <input type="date" className="input w-full mt-1" value={form.from_date}
                       onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>To Date</label>
                <input type="date" className="input w-full mt-1" value={form.to_date}
                       min={form.from_date || undefined}
                       onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Reason <span style={{ color: 'var(--text-muted)' }}>(min 5 chars)</span>
              </label>
              <textarea className="input w-full mt-1 resize-none" rows={3}
                        placeholder="Briefly describe the reason for your leave…"
                        value={form.reason}
                        onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeApply} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* Leave List */}
      {loading ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : leaves.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No leave applications</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden"
             style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-alt)' }}>
          {leaves.map((l, i) => (
            <div
              key={l.id}
              className="flex items-start justify-between px-4 py-3 gap-3"
              style={{ borderBottom: i < leaves.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium capitalize text-sm" style={{ color: 'var(--text-body)' }}>
                    {l.leave_type?.replace(/_/g, ' ')} Leave
                  </p>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {l.duration === 'half_day_morning' ? '· AM Half'
                      : l.duration === 'half_day_afternoon' ? '· PM Half' : ''}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {new Date(l.from_date + 'T00:00:00').toLocaleDateString('en-IN')}
                  {' – '}
                  {new Date(l.to_date + 'T00:00:00').toLocaleDateString('en-IN')}
                  {l.total_days ? ` · ${l.total_days} day${l.total_days > 1 ? 's' : ''}` : ''}
                </p>
                {l.reason && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-disabled)' }}>
                    {l.reason}
                  </p>
                )}
                {l.rejection_reason && (
                  <p className="text-xs mt-0.5" style={{ color: '#ef4444' }}>
                    Rejected: {l.rejection_reason}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={l.status} />
                {l.status === 'pending' && (
                  <button
                    onClick={() => handleCancel(l.id)}
                    disabled={cancelLoading[l.id]}
                    title="Cancel Application"
                    className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
                    {cancelLoading[l.id]
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

const DOC_STATUS_CFG = {
  pending:           { label: 'Pending',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  approved:          { label: 'Approved',       color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  rejected:          { label: 'Rejected',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  reupload_required: { label: 'Reupload Req.', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
}

function DocumentsTab() {
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    hrmService.getMyDocuments()
      .then(r => setResult(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load documents'))
      .finally(() => setLoading(false))
  }, [])

  const docIconCfg = (url = '') => {
    const ext = (url.split('.').pop() || '').toLowerCase()
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return { bg: 'rgba(79,172,254,0.12)', color: '#4FACFE' }
    if (ext === 'pdf') return { bg: 'rgba(255,71,87,0.12)', color: '#FF4757' }
    return { bg: 'rgba(67,233,123,0.12)', color: '#43E97B' }
  }

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )

  if (error) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
      <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{error}</p>
    </div>
  )

  const docs = result?.documents || []
  const empId = result?.employee_id
  const message = result?.message

  if (!empId || message?.includes('No employee profile')) {
    return (
      <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
        <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No employee profile linked</p>
        <p className="text-xs mt-1 opacity-70">Ask your HR administrator to link your account to an employee record.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-3">
      {docs.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-3" style={{ color: 'var(--text-muted)' }}>
          <FolderOpen className="w-10 h-10 opacity-30" />
          <p className="text-sm">No documents uploaded yet.</p>
          <p className="text-xs opacity-70">Your HR team will upload your documents here.</p>
        </div>
      ) : docs.map((doc) => {
        const cfg = docIconCfg(doc.file_url)
        const statusCfg = DOC_STATUS_CFG[doc.status] || DOC_STATUS_CFG.pending
        const downloadUrl = hrmService.getDocumentServeUrl(empId, doc.doc_id, true)
        return (
          <div
            key={doc.doc_id || doc.doc_type}
            className="flex items-start gap-3 p-3 rounded-xl"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: cfg.bg }}
            >
              <FileText className="w-5 h-5" style={{ color: cfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-body)' }}>
                  {doc.doc_name || 'Document'}
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: statusCfg.bg, color: statusCfg.color }}>
                  {statusCfg.label}
                </span>
                {doc.version > 1 && (
                  <span className="text-[9px] text-gray-400 font-mono">v{doc.version}</span>
                )}
              </div>
              <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {doc.doc_type?.replace(/_/g, ' ')}
                {doc.uploaded_at ? ` · ${new Date(doc.uploaded_at).toLocaleDateString('en-IN')}` : ''}
              </p>
              {doc.status === 'rejected' && doc.rejection_reason && (
                <p className="text-xs mt-1 font-medium" style={{ color: '#ef4444' }}>
                  Reason: {doc.rejection_reason}
                </p>
              )}
              {doc.status === 'reupload_required' && doc.rejection_reason && (
                <p className="text-xs mt-1 font-medium" style={{ color: '#8b5cf6' }}>
                  Action needed: {doc.rejection_reason}
                </p>
              )}
              {doc.comments && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Note: {doc.comments}
                </p>
              )}
            </div>
            {doc.file_url && doc.doc_id && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Assets Tab ────────────────────────────────────────────────────────────────

function AssetsTab() {
  const [assets, setAssets]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    hrmService.getMyAssets()
      .then(r => setAssets(r.data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )

  return (
    <div className="p-6 space-y-3">
      {assets.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-3" style={{ color: 'var(--text-muted)' }}>
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm">No assets assigned to you</p>
        </div>
      ) : assets.map(asset => (
        <div
          key={asset.id}
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(124,58,237,0.12)' }}
          >
            <Package className="w-5 h-5" style={{ color: '#7c3aed' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-body)' }}>
              {asset.brand ? `${asset.brand} ${asset.model_name || ''}` : (asset.asset_tag || 'Asset')}
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {asset.asset_type?.replace(/_/g, ' ')}
              {asset.asset_tag ? ` · ${asset.asset_tag}` : ''}
            </p>
          </div>
          <StatusBadge status={asset.status} />
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EmployeeSelfService() {
  const user = useSelector(selectUser)
  const [activeTab, setActiveTab] = useState('profile')

  // Resolved employee ID — may come from JWT (fast path) or server-side resolution
  const [employeeId, setEmployeeId] = useState(user?.hrmEmployeeId || null)
  const [resolving, setResolving]   = useState(!user?.hrmEmployeeId)
  const [noEmployee, setNoEmployee] = useState(false)

  useEffect(() => {
    // If we already have the ID from JWT, skip the API call
    if (user?.hrmEmployeeId) {
      setEmployeeId(user.hrmEmployeeId)
      setResolving(false)
      return
    }
    // Resolve server-side: works even when JWT was issued before employee linking.
    // awaiting_profile means no profile yet — created on first punch-in.
    hrmService.getMyTodayAttendance()
      .then(res => {
        const data  = res.data
        const empId = data?.employee_id
        if (empId) {
          setEmployeeId(empId)
        } else {
          // awaiting_profile or null — treat as no linked profile yet
          setNoEmployee(true)
        }
      })
      .catch(() => setNoEmployee(true))
      .finally(() => setResolving(false))
  }, [user?.hrmEmployeeId])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>My ESS Portal</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Employee Self-Service</p>
      </div>

      {resolving ? (
        <div
          className="rounded-2xl p-10 flex items-center justify-center gap-3"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading your profile…</span>
        </div>
      ) : noEmployee || !employeeId ? (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(245,158,11,0.12)' }}
          >
            <UserX className="w-8 h-8" style={{ color: '#F59E0B' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-heading)' }}>
            Employee Profile Not Linked
          </h2>
          <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>
            Your account is not linked to an employee profile yet. Please contact your HR administrator.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          {/* Tabs */}
          <div className="flex border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative flex-shrink-0"
                style={{
                  color: activeTab === tab.key ? 'var(--text-link)' : 'var(--text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.key && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: 'var(--text-link)' }}
                  />
                )}
              </button>
            ))}
          </div>

          {activeTab === 'profile'    && <ProfileTab    employeeId={employeeId} />}
          {activeTab === 'attendance' && <AttendanceTab  employeeId={employeeId} />}
          {activeTab === 'payslips'   && <PayslipsTab />}
          {activeTab === 'leaves'     && <LeaveTab       employeeId={employeeId} />}
          {activeTab === 'documents'  && <DocumentsTab />}
          {activeTab === 'assets'     && <AssetsTab />}
        </div>
      )}
    </div>
  )
}
