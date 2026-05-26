/**
 * Employee Self-Service portal — profile, attendance, payslips, leave, documents, assets.
 * Employee ID is resolved dynamically via /me/today (server-side), NOT from JWT.
 * This ensures the portal works even when the JWT was issued before employee linking.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import {
  User, Clock, Calendar, Banknote, Plus, UserX,
  Loader2, FolderOpen, Package, FileText, Download,
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

function AttendanceTab({ employeeId }) {
  const now = new Date()
  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    hrmService.getMonthlyAttendance(employeeId, year, month)
      .then(r => setRecords(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [year, month, employeeId])

  useEffect(() => { load() }, [load])

  const summary = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="input w-40"
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
        >
          {[...Array(12)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i).toLocaleString('default', { month: 'long' })}
            </option>
          ))}
        </select>
        <select
          className="input w-24"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
        >
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {Object.entries(summary).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary).map(([status, count]) => (
            <StatusBadge key={status} status={`${status}: ${count}`} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : records.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>No records for this month</div>
      ) : (
        <div className="space-y-0">
          {records.map(r => (
            <div
              key={r.id || r.date}
              className="flex items-center justify-between py-2.5 text-sm"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <span className="w-32" style={{ color: 'var(--text-body)' }}>
                {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
              </span>
              <div className="w-28 text-center">
                <StatusBadge status={r.status} />
              </div>
              <span className="w-28 text-center" style={{ color: 'var(--text-muted)' }}>
                {r.check_in ? new Date(r.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                {' – '}
                {r.check_out ? new Date(r.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
              <span className="w-16 text-right" style={{ color: 'var(--text-secondary)' }}>
                {r.work_hours ? `${r.work_hours}h` : ''}
              </span>
            </div>
          ))}
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

function LeaveTab({ employeeId }) {
  const [leaves, setLeaves]       = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [showApply, setShowApply] = useState(false)
  const [form, setForm]           = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' })
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await hrmService.listLeaves({ employee_id: employeeId, page_size: 20 })
      setLeaves(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch {/* silent */}
    setLoading(false)
  }, [employeeId])

  useEffect(() => { load() }, [load])

  const handleApply = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await hrmService.applyLeave({ ...form, employee_id: employeeId })
      toast.success('Leave application submitted')
      setShowApply(false)
      load()
    } catch { toast.error('Failed to apply') }
    setSaving(false)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} leave applications</p>
        <button onClick={() => setShowApply(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      <ModalPortal isOpen={showApply}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form
            onSubmit={handleApply}
            className="rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl mx-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Apply for Leave</h2>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Leave Type</label>
              <select
                className="input w-full mt-1"
                value={form.leave_type}
                onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
              >
                {['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid', 'compensatory'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>From</label>
                <input
                  type="date"
                  className="input w-full mt-1"
                  value={form.from_date}
                  onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>To</label>
                <input
                  type="date"
                  className="input w-full mt-1"
                  value={form.to_date}
                  onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Reason</label>
              <textarea
                className="input w-full mt-1 resize-none"
                rows={3}
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowApply(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {loading ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : leaves.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>No leave applications</div>
      ) : (
        <div className="space-y-0">
          {leaves.map(l => (
            <div
              key={l.id}
              className="flex items-start justify-between py-3"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div>
                <p className="font-medium capitalize" style={{ color: 'var(--text-body)' }}>
                  {l.leave_type?.replace(/_/g, ' ')} Leave
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {new Date(l.from_date).toLocaleDateString('en-IN')}
                  {' – '}
                  {new Date(l.to_date).toLocaleDateString('en-IN')}
                  {l.total_days ? ` · ${l.total_days} day${l.total_days > 1 ? 's' : ''}` : ''}
                </p>
                {l.reason && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{l.reason}</p>
                )}
              </div>
              <StatusBadge status={l.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab() {
  const [docs, setDocs]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    hrmService.getMyDocuments()
      .then(r => setDocs(r.data?.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const DOC_ICONS = {
    pdf:  { bg: 'rgba(255,71,87,0.12)',  color: '#FF4757' },
    image:{ bg: 'rgba(79,172,254,0.12)', color: '#4FACFE' },
    doc:  { bg: 'rgba(67,233,123,0.12)', color: '#43E97B' },
  }

  const docIconType = (url = '') => {
    const ext = url.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
    if (ext === 'pdf') return 'pdf'
    return 'doc'
  }

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )

  return (
    <div className="p-6 space-y-3">
      {docs.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-3" style={{ color: 'var(--text-muted)' }}>
          <FolderOpen className="w-10 h-10 opacity-30" />
          <p className="text-sm">No documents uploaded yet</p>
        </div>
      ) : docs.map((doc, idx) => {
        const iconType = docIconType(doc.file_url)
        const cfg = DOC_ICONS[iconType]
        return (
          <div
            key={idx}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: cfg.bg }}
            >
              <FileText className="w-5 h-5" style={{ color: cfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-body)' }}>
                {doc.doc_name || 'Document'}
              </p>
              <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {doc.doc_type?.replace(/_/g, ' ')}
                {doc.uploaded_at ? ` · ${new Date(doc.uploaded_at).toLocaleDateString('en-IN')}` : ''}
              </p>
            </div>
            {doc.file_url && (
              <a
                href={doc.file_url}
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
    // Resolve server-side: works even when JWT was issued before employee linking
    hrmService.getMyTodayAttendance()
      .then(res => {
        const empId = res.data?.employee_id
        if (empId) {
          setEmployeeId(empId)
        } else {
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
