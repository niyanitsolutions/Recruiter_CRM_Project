/**
 * Employee Self-Service portal — profile, attendance, payslips, leave apply
 */
import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import {
  User, Clock, Calendar, Banknote, Download, Plus,
  CheckCircle, AlertCircle, Loader2, UserX,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

const TABS = [
  { key: 'profile',     label: 'My Profile',    icon: User },
  { key: 'attendance',  label: 'Attendance',     icon: Clock },
  { key: 'payslips',    label: 'Payslips',       icon: Banknote },
  { key: 'leaves',      label: 'Leave',          icon: Calendar },
]

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

  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>
  if (!emp) return <div className="p-6 text-center text-gray-400">No employee record linked to your account.</div>

  const field = (label, value) => value ? (
    <div key={label}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  ) : null

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600">
          {emp.full_name?.charAt(0) || '?'}
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{emp.full_name}</h2>
          <p className="text-sm text-gray-500">{emp.designation_name || ''} {emp.department_name ? `· ${emp.department_name}` : ''}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 capitalize">
            {emp.employment_status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {field('Employee ID', emp.employee_id)}
        {field('Email', emp.email)}
        {field('Phone', emp.phone)}
        {field('Department', emp.department_name)}
        {field('Designation', emp.designation_name)}
        {field('Reporting Manager', emp.reporting_manager_name)}
        {field('Employment Type', emp.employment_type?.replace('_', ' '))}
        {field('Date of Joining', emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString('en-IN') : null)}
        {field('Work Location', emp.work_location)}
        {field('Shift', emp.shift_start_time && emp.shift_end_time ? `${emp.shift_start_time} – ${emp.shift_end_time}` : null)}
      </div>
    </div>
  )
}

// ── Attendance Tab ────────────────────────────────────────────────────────────

function AttendanceTab({ employeeId }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    hrmService.getMonthlyAttendance(employeeId, year, month)
      .then(r => setRecords(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year, month, employeeId])

  const STATUS_STYLE = {
    present:  'bg-green-100 text-green-700',
    late:     'bg-yellow-100 text-yellow-700',
    absent:   'bg-red-100 text-red-700',
    half_day: 'bg-orange-100 text-orange-700',
    on_leave: 'bg-blue-100 text-blue-700',
    wfh:      'bg-indigo-100 text-indigo-700',
    holiday:  'bg-purple-100 text-purple-700',
    weekend:  'bg-gray-100 text-gray-500',
  }

  const summary = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select className="input w-40" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {[...Array(12)].map((_, i) => (
            <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
          ))}
        </select>
        <select className="input w-24" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(summary).map(([status, count]) => (
          <span key={status} className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>
            {status.replace('_', ' ')}: {count}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No records for this month</div>
      ) : (
        <div className="space-y-1">
          {records.map(r => (
            <div key={r.id || r.date} className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
              <span className="text-gray-700 w-28">{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium w-24 text-center ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                {r.status?.replace('_', ' ')}
              </span>
              <span className="text-gray-500 w-24 text-center">
                {r.check_in ? new Date(r.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                {' – '}
                {r.check_out ? new Date(r.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
              <span className="text-gray-600 w-16 text-right">{r.work_hours ? `${r.work_hours}h` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Payslips Tab ──────────────────────────────────────────────────────────────

function PayslipsTab({ employeeId }) {
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    hrmService.listOwnPayslips({ page_size: 24 })
      .then(r => setPayslips(r.data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fmt = n => n?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) || '—'

  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>

  return (
    <div className="p-6 space-y-3">
      {payslips.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No payslips yet</div>
      ) : payslips.map(ps => (
        <div key={ps.id} className="flex items-center justify-between py-3 border-b border-gray-100">
          <div>
            <p className="font-medium text-gray-800">
              {new Date(2000, ps.month - 1).toLocaleString('default', { month: 'long' })} {ps.year}
            </p>
            <p className="text-xs text-gray-500">Net: {fmt(ps.net_salary)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              ps.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>{ps.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Leave Tab ─────────────────────────────────────────────────────────────────

function LeaveTab({ employeeId }) {
  const [leaves, setLeaves]     = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [showApply, setShowApply] = useState(false)
  const [form, setForm]         = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' })
  const [saving, setSaving]     = useState(false)

  const load = async () => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await hrmService.listLeaves({ employee_id: employeeId, page_size: 20 })
      setLeaves(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [employeeId])

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

  const STATUS_STYLE = {
    pending:  'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled:'bg-gray-100 text-gray-600',
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} leave applications</p>
        <button onClick={() => setShowApply(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      <ModalPortal isOpen={showApply}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleApply} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl mx-4">
            <h2 className="text-lg font-semibold">Apply for Leave</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Leave Type</label>
              <select className="input w-full mt-1" value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
                {['casual','sick','earned','maternity','paternity','unpaid','compensatory'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">From</label>
                <input type="date" className="input w-full mt-1" value={form.from_date}
                  onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">To</label>
                <input type="date" className="input w-full mt-1" value={form.to_date}
                  onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Reason</label>
              <textarea className="input w-full mt-1 resize-none" rows={3} value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowApply(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Submitting…' : 'Submit'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading…</div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No leave applications</div>
      ) : (
        <div className="space-y-2">
          {leaves.map(l => (
            <div key={l.id} className="flex items-start justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-800 capitalize">{l.leave_type?.replace('_', ' ')} Leave</p>
                <p className="text-xs text-gray-500">
                  {new Date(l.from_date).toLocaleDateString('en-IN')} – {new Date(l.to_date).toLocaleDateString('en-IN')}
                  {l.total_days ? ` · ${l.total_days} day${l.total_days > 1 ? 's' : ''}` : ''}
                </p>
                {l.reason && <p className="text-xs text-gray-500 mt-0.5">{l.reason}</p>}
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-gray-100 text-gray-600'}`}>
                {l.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EmployeeSelfService() {
  const user = useSelector(selectUser)
  const employeeId = user?.hrmEmployeeId
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>My ESS Portal</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Employee Self-Service</p>
      </div>

      {!employeeId && (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(245,158,11,0.12)' }}>
            <UserX className="w-8 h-8" style={{ color: '#F59E0B' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-heading)' }}>
            Employee Profile Not Available
          </h2>
          <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>
            Your account is not linked to an employee profile yet. Please contact your HR administrator to set up your employee record.
          </p>
        </div>
      )}

      {!employeeId ? null :
      <>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative"
              style={{
                color: activeTab === tab.key ? 'var(--text-link)' : 'var(--text-muted)',
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--text-link)' }} />
              )}
            </button>
          ))}
        </div>

        {activeTab === 'profile'    && <ProfileTab    employeeId={employeeId} />}
        {activeTab === 'attendance' && <AttendanceTab  employeeId={employeeId} />}
        {activeTab === 'payslips'   && <PayslipsTab    employeeId={employeeId} />}
        {activeTab === 'leaves'     && <LeaveTab       employeeId={employeeId} />}
      </div>
      </>}
    </div>
  )
}
