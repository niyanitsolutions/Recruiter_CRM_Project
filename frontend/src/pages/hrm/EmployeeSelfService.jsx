/**
 * Employee Self-Service portal — profile, attendance, payslips, leave, documents, assets.
 * Employee ID is resolved dynamically via /me/today (server-side), NOT from JWT.
 * This ensures the portal works even when the JWT was issued before employee linking.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import {
  User, Clock, Calendar, Banknote, Plus, UserX, X,
  Loader2, FolderOpen, Package, FileText, Download, Eye,
  ChevronLeft, ChevronRight, History, MapPin, Wifi, Home,
  Briefcase, CheckCircle, XCircle, AlertCircle, LogIn, LogOut, RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import { formatDate, formatTimeOnly } from '../../utils/format'
import ModalPortal from '../../components/common/ModalPortal'
import { PayslipDocument } from './Payroll'

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
  present:     { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  late:        { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  absent:      { bg: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  half_day:    { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  on_leave:    { bg: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  wfh:         { bg: 'rgba(99,102,241,0.15)',  color: '#818CF8' },
  hybrid:      { bg: 'rgba(139,92,246,0.15)',  color: '#8B5CF6' },
  field_work:  { bg: 'rgba(251,146,60,0.15)',  color: '#FB923C' },
  auto_closed: { bg: 'rgba(156,163,175,0.15)', color: '#9CA3AF' },
  holiday:     { bg: 'rgba(108,99,255,0.15)',  color: '#A78BFA' },
  weekend:     { bg: 'rgba(139,143,168,0.10)', color: '#8B8FA8' },
  pending:     { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  approved:    { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  rejected:    { bg: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  cancelled:   { bg: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  paid:        { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  draft:       { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  active:      { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  assigned:    { bg: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  returned:    { bg: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  available:   { bg: 'rgba(67,233,123,0.10)',  color: '#10b981' },
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
        <Field label="Date of Joining"   value={emp.date_of_joining ? formatDate(emp.date_of_joining) : null} />
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

// Haversine distance in metres (mirrors backend calculation for client-side preview)
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6_371_000
  const toRad = x => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const WMR_MODE_LABEL = { wfh: 'Work From Home', hybrid: 'Hybrid', field: 'Field Work' }
const WMR_STATUS_COLOR = {
  pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  approved:  { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  rejected:  { bg: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  cancelled: { bg: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  expired:   { bg: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
}

// ── Work Mode Request Modal ────────────────────────────────────────────────────

function WorkModeRequestModal({ onClose, onSuccess }) {
  const today = fmtDate(new Date())
  const [form, setForm] = useState({ work_mode: 'wfh', from_date: today, to_date: today, reason: '' })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.from_date) { toast.error('From date is required'); return }
    if (!form.to_date)   { toast.error('To date is required'); return }
    if (!form.reason.trim()) { toast.error('Reason is required'); return }
    if (form.from_date > form.to_date) { toast.error('From date must be on or before To date'); return }
    setSaving(true)
    try {
      await hrmService.submitWorkModeRequest(form)
      toast.success('Work mode request submitted for approval')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit request')
    }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Home style={{ width: 20, height: 20, color: 'var(--accent)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Apply Work Mode</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Work Mode *
            </label>
            <select value={form.work_mode} onChange={e => set('work_mode', e.target.value)} required
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '9px 12px', fontSize: 14, color: 'var(--text-body)', outline: 'none' }}>
              <option value="wfh">Work From Home (WFH)</option>
              <option value="hybrid">Hybrid</option>
              <option value="field">Field Work</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                From Date *
              </label>
              <input type="date" value={form.from_date} min={today}
                onChange={e => set('from_date', e.target.value)} required
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '9px 12px', fontSize: 14, color: 'var(--text-body)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                To Date *
              </label>
              <input type="date" value={form.to_date} min={form.from_date || today}
                onChange={e => set('to_date', e.target.value)} required
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '9px 12px', fontSize: 14, color: 'var(--text-body)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Reason *
            </label>
            <textarea value={form.reason} onChange={e => set('reason', e.target.value)}
              placeholder="e.g. Working from home due to personal reasons"
              rows={3} required
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '10px 12px', fontSize: 14, color: 'var(--text-body)', resize: 'vertical',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 0.8s linear infinite' }} /> : <Plus style={{ width: 14, height: 14 }} />}
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Punch-In Panel ─────────────────────────────────────────────────────────────

function PunchInPanel({ todayCtx, onPunchIn, onPunchOut, activeSession, elapsed, punching }) {
  const [locationStatus, setLocationStatus] = useState('unknown') // 'checking'|'in_office'|'approved'|'blocked'|'geo_off'|'unknown'
  const [locationLabel, setLocationLabel]   = useState('')
  const [userCoords, setUserCoords]         = useState(null)
  const locationCheckedRef = useRef(false)

  useEffect(() => {
    if (locationCheckedRef.current) return
    locationCheckedRef.current = true

    const geoEnabled = todayCtx?.geo_fence_enabled
    const activeWM   = todayCtx?.active_work_mode
    const activeExc  = todayCtx?.active_exception

    if (!geoEnabled) {
      // Geo fence off — determine mode from WMR only
      if (activeWM) {
        const label = WMR_MODE_LABEL[activeWM.work_mode] || activeWM.work_mode
        setLocationStatus('approved')
        setLocationLabel(`${label} Approved`)
      } else {
        setLocationStatus('geo_off')
        setLocationLabel('Office')
      }
      return
    }

    // Geo fence enabled — request browser location
    if (!navigator.geolocation) {
      if (activeWM) {
        setLocationStatus('approved')
        setLocationLabel(`${WMR_MODE_LABEL[activeWM.work_mode] || activeWM.work_mode} Approved`)
      } else if (activeExc) {
        setLocationStatus('approved')
        setLocationLabel('Exception Active')
      } else {
        setLocationStatus('blocked')
        setLocationLabel('Location unavailable — contact HR')
      }
      return
    }

    setLocationStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setUserCoords({ latitude, longitude })
        const officeLat = todayCtx?.office_lat
        const officeLon = todayCtx?.office_lon
        const radius    = todayCtx?.geo_fence_radius || 100

        if (officeLat != null && officeLon != null) {
          const dist = haversineMeters(latitude, longitude, officeLat, officeLon)
          if (dist <= radius) {
            setLocationStatus('in_office')
            setLocationLabel('Office')
            return
          }
        }

        // Outside office
        if (activeExc) {
          setLocationStatus('approved')
          setLocationLabel('Exception Active')
        } else if (activeWM) {
          const label = WMR_MODE_LABEL[activeWM.work_mode] || activeWM.work_mode
          setLocationStatus('approved')
          setLocationLabel(`${label} Approved`)
        } else {
          setLocationStatus('blocked')
          setLocationLabel('Outside Office — Contact HR')
        }
      },
      () => {
        // Location denied
        if (activeWM) {
          setLocationStatus('approved')
          setLocationLabel(`${WMR_MODE_LABEL[activeWM.work_mode] || activeWM.work_mode} Approved`)
        } else if (activeExc) {
          setLocationStatus('approved')
          setLocationLabel('Exception Active')
        } else if (todayCtx?.geo_fence_enabled) {
          setLocationStatus('blocked')
          setLocationLabel('Enable location or contact HR')
        } else {
          setLocationStatus('geo_off')
          setLocationLabel('Office')
        }
      },
      { timeout: 8000 }
    )
  }, [todayCtx])

  const statusColor = {
    checking:  { bg: 'rgba(79,172,254,0.12)', color: '#4FACFE', border: 'rgba(79,172,254,0.3)' },
    in_office: { bg: 'rgba(67,233,123,0.12)', color: '#43E97B', border: 'rgba(67,233,123,0.3)' },
    geo_off:   { bg: 'rgba(67,233,123,0.12)', color: '#43E97B', border: 'rgba(67,233,123,0.3)' },
    approved:  { bg: 'rgba(99,102,241,0.12)', color: '#818CF8', border: 'rgba(99,102,241,0.3)' },
    blocked:   { bg: 'rgba(255,71,87,0.12)',  color: '#FF4757', border: 'rgba(255,71,87,0.3)' },
    unknown:   { bg: 'rgba(139,143,168,0.1)', color: '#8B8FA8', border: 'rgba(139,143,168,0.2)' },
  }[locationStatus] || {}

  const fmtSecs = s => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
    return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(sec).padStart(2,'0')}s`
  }

  const isCheckedIn = !!activeSession?.check_in && !activeSession?.check_out
  const isBlocked   = locationStatus === 'blocked'

  // Phase 6: Shift window gate
  const shiftStart = todayCtx?.shift_start
  const shiftEnd   = todayCtx?.shift_end
  const shiftGrace = todayCtx?.shift_grace ?? 15
  const shiftName  = todayCtx?.shift_name

  const shiftWindowStatus = (() => {
    if (!shiftStart || isCheckedIn) return 'open'   // already checked in — no gate
    const now = new Date()
    const [sh, sm] = shiftStart.split(':').map(Number)
    const shiftDt = new Date(now); shiftDt.setHours(sh, sm, 0, 0)
    const openFrom = new Date(shiftDt.getTime() - 30 * 60000)  // 30 min early entry allowed
    const closedAt = shiftEnd ? (() => {
      const [eh, em] = shiftEnd.split(':').map(Number)
      const endDt = new Date(now); endDt.setHours(eh, em, 0, 0)
      // For overnight shifts or when end < start, add a day
      if (endDt <= shiftDt) endDt.setDate(endDt.getDate() + 1)
      return new Date(endDt.getTime() + 2 * 3600000)   // close 2h after shift end
    })() : null

    if (now < openFrom) return 'before'
    if (closedAt && now > closedAt) return 'after'
    return 'open'
  })()

  const fmt12 = (t) => {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${String(m).padStart(2, '0')} ${period}`
  }

  const isPunchInDisabled = punching || isBlocked || locationStatus === 'checking' || shiftWindowStatus === 'before'

  return (
    <div className="rounded-xl border p-4 space-y-3"
         style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>

      {/* Phase 6: Shift window info */}
      {shiftStart && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
             style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <Clock style={{ width: 13, height: 13, color: '#818CF8', flexShrink: 0 }} />
          <span className="text-xs" style={{ color: '#818CF8' }}>
            {shiftName ? `${shiftName}: ` : 'Shift: '}
            <strong>{fmt12(shiftStart)}{shiftEnd ? ` – ${fmt12(shiftEnd)}` : ''}</strong>
            {shiftGrace > 0 ? ` · ${shiftGrace}m grace` : ''}
          </span>
        </div>
      )}

      {/* Before shift banner (Phase 6) */}
      {shiftWindowStatus === 'before' && !isCheckedIn && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
             style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
          <AlertCircle style={{ width: 14, height: 14, color: '#F59E0B', flexShrink: 0 }} />
          <span className="text-xs" style={{ color: '#F59E0B' }}>
            Your shift starts at <strong>{fmt12(shiftStart)}</strong>. Punch-in will open 30 minutes before.
          </span>
        </div>
      )}

      {/* Location status badge */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
           style={{ background: statusColor.bg, border: `1px solid ${statusColor.border}` }}>
        {locationStatus === 'checking'
          ? <Loader2 style={{ width: 14, height: 14, color: statusColor.color }} className="animate-spin flex-shrink-0" />
          : locationStatus === 'blocked'
          ? <AlertCircle style={{ width: 14, height: 14, color: statusColor.color, flexShrink: 0 }} />
          : locationStatus === 'approved'
          ? <Home style={{ width: 14, height: 14, color: statusColor.color, flexShrink: 0 }} />
          : <MapPin style={{ width: 14, height: 14, color: statusColor.color, flexShrink: 0 }} />
        }
        <div>
          <p className="text-xs font-semibold" style={{ color: statusColor.color }}>
            Location Status
          </p>
          <p className="text-sm font-medium" style={{ color: statusColor.color }}>
            {locationStatus === 'checking' ? 'Detecting location…' : locationLabel || 'Unknown'}
          </p>
        </div>
      </div>

      {/* Active session banner */}
      {isCheckedIn && elapsed > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
             style={{ background: 'rgba(67,233,123,0.08)', border: '1px solid rgba(67,233,123,0.2)' }}>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <span className="text-sm font-medium" style={{ color: '#43E97B' }}>
            Active — {fmtSecs(elapsed)}
          </span>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
            In since {formatTimeOnly(activeSession.check_in.endsWith('Z') ? activeSession.check_in : activeSession.check_in + 'Z')}
          </span>
        </div>
      )}

      {/* Blocked message */}
      {isBlocked && !isCheckedIn && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
          Your organization requires office location login. Please contact HR if you require remote access approval.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!isCheckedIn ? (
          <button
            onClick={() => onPunchIn(userCoords)}
            disabled={isPunchInDisabled}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--accent)', opacity: isPunchInDisabled ? 0.5 : 1,
              cursor: isPunchInDisabled ? 'not-allowed' : 'pointer' }}>
            {punching ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {punching ? 'Punching In…' : shiftWindowStatus === 'before' ? `Shift at ${fmt12(shiftStart)}` : 'Punch In'}
          </button>
        ) : (
          <button
            onClick={onPunchOut}
            disabled={punching}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)',
              opacity: punching ? 0.5 : 1, cursor: punching ? 'not-allowed' : 'pointer' }}>
            {punching ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {punching ? 'Punching Out…' : 'Punch Out'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Shift Change Request Modal (employee view) ────────────────────────────────

function ShiftChangeRequestModal({ todayCtx, onClose, onSuccess }) {
  const [shifts, setShifts] = useState([])
  const [form, setForm]     = useState({
    requested_shift_id: '',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    hrmService.listShifts().then(r => setShifts(r.data || [])).catch(() => {})
  }, [])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (!form.requested_shift_id) { setErr('Please select a shift'); return }
    if (!form.effective_from) { setErr('Effective from date is required'); return }
    if (!form.reason.trim()) { setErr('Please provide a reason'); return }
    if (form.effective_to && form.effective_to < form.effective_from) { setErr('End date must be after start date'); return }
    setErr(''); setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.effective_to) delete payload.effective_to
      await hrmService.submitShiftChangeRequest(payload)
      toast.success('Shift change request submitted')
      onSuccess()
      onClose()
    } catch (e) { setErr(e?.response?.data?.detail || 'Failed to submit') }
    setSaving(false)
  }

  const currentShift = todayCtx?.shift_name
    ? `${todayCtx.shift_name} (${todayCtx.shift_start}–${todayCtx.shift_end})`
    : todayCtx?.shift_start ? `${todayCtx.shift_start}–${todayCtx.shift_end}` : 'Default shift'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center',
      padding:16, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background:'var(--bg-modal, var(--bg-card))', border:'1px solid var(--border-card)',
        borderRadius:20, boxShadow:'0 24px 80px rgba(0,0,0,0.5)', width:'100%', maxWidth:440,
        maxHeight:'90vh', overflowY:'auto', padding:24 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text-heading)', margin:0 }}>Request Shift Change</h3>
          <button onClick={onClose} style={{ padding:6, borderRadius:8, border:'none', background:'var(--bg-alt)', cursor:'pointer', color:'var(--text-muted)', lineHeight:0 }}>
            <XCircle style={{ width:16, height:16 }} />
          </button>
        </div>
        <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:16, fontSize:12, background:'var(--bg-alt)', color:'var(--text-muted)' }}>
          Current shift: <strong style={{ color:'var(--text-body)' }}>{currentShift}</strong>
        </div>
        {err && <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:16, fontSize:13, background:'var(--bg-danger)', color:'var(--text-danger)' }}>{err}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Requested Shift *</span>
            <select className="input" style={{ width:'100%', fontSize:14 }} value={form.requested_shift_id} onChange={e => set('requested_shift_id', e.target.value)}>
              <option value="">Select shift…</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
            </select>
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Effective From *</span>
              <input type="date" className="input" style={{ width:'100%', fontSize:14 }} value={form.effective_from} onChange={e => set('effective_from', e.target.value)} />
            </label>
            <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>End Date (blank = permanent)</span>
              <input type="date" className="input" style={{ width:'100%', fontSize:14 }} value={form.effective_to} onChange={e => set('effective_to', e.target.value)} />
            </label>
          </div>
          <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Reason *</span>
            <textarea className="input w-full text-sm" rows={3} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Briefly explain why you need a different shift…" />
          </label>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:14, cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ flex:1, padding:'10px 0', borderRadius:12, border:'none', background:'var(--accent)', color:'#fff', fontSize:14, fontWeight:600, cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {saving && <Loader2 style={{ width:16, height:16, animation:'spin 0.8s linear infinite' }} />}
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AttendanceTab() {
  // ── History state ───────────────────────────────────────────────────────────
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

  // ── Today / punch state ─────────────────────────────────────────────────────
  const [todayCtx, setTodayCtx]     = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [elapsed, setElapsed]       = useState(0)
  const [punching, setPunching]     = useState(false)

  // ── Work Mode Request state ─────────────────────────────────────────────────
  const [showWMRModal, setShowWMRModal] = useState(false)
  const [wmrList, setWmrList]       = useState([])
  const [wmrLoading, setWmrLoading] = useState(false)
  const [cancellingId, setCancellingId] = useState(null)

  // ── Shift Change Request state ───────────────────────────────────────────────
  const [showSCRModal, setShowSCRModal] = useState(false)
  const [scrList, setScrList]       = useState([])
  const [scrLoading, setScrLoading] = useState(false)
  const [cancellingScr, setCancellingScr] = useState(null)

  // ── Load today context + session ────────────────────────────────────────────
  const loadToday = useCallback(async () => {
    try {
      const r = await hrmService.getMyTodayAttendance()
      const data = r.data
      setTodayCtx(data)
      if (data?.check_in && !data?.check_out) setActiveSession(data)
      else setActiveSession(null)
    } catch {}
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  // ── Tick timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeSession?.check_in) { setElapsed(0); return }
    const tick = () => {
      const ci = new Date(activeSession.check_in.endsWith('Z') ? activeSession.check_in : activeSession.check_in + 'Z')
      const breakSecs = (activeSession.total_break_minutes || 0) * 60
      setElapsed(Math.floor((Date.now() - ci.getTime()) / 1000) - breakSecs)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeSession])

  // ── Load WMR list ───────────────────────────────────────────────────────────
  const loadWMR = useCallback(async () => {
    setWmrLoading(true)
    try {
      const r = await hrmService.listMyWorkModeRequests({ page_size: 20 })
      setWmrList(r.data?.items || [])
    } catch {}
    setWmrLoading(false)
  }, [])

  useEffect(() => { loadWMR() }, [loadWMR])

  // ── Load SCR list ───────────────────────────────────────────────────────────
  const loadSCR = useCallback(async () => {
    setScrLoading(true)
    try {
      const r = await hrmService.listMyShiftChangeRequests({ page_size: 10 })
      setScrList(r.data?.items || [])
    } catch {}
    setScrLoading(false)
  }, [])

  useEffect(() => { loadSCR() }, [loadSCR])

  // ── History load ────────────────────────────────────────────────────────────
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

  // ── Punch In / Out ──────────────────────────────────────────────────────────
  const handlePunchIn = async (coords) => {
    setPunching(true)
    try {
      await hrmService.checkIn({
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      })
      toast.success('Punched in successfully')
      await loadToday()
      load(1)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Punch in failed')
    }
    setPunching(false)
  }

  const handlePunchOut = async () => {
    setPunching(true)
    try {
      await hrmService.checkOut({})
      toast.success('Punched out successfully')
      setActiveSession(null)
      await loadToday()
      load(1)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Punch out failed')
    }
    setPunching(false)
  }

  // ── Cancel WMR ─────────────────────────────────────────────────────────────
  const handleCancelWMR = async (id) => {
    setCancellingId(id)
    try {
      await hrmService.cancelWorkModeRequest(id)
      toast.success('Request cancelled')
      await loadWMR()
      await loadToday()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel request')
    }
    setCancellingId(null)
  }

  // ── Export ──────────────────────────────────────────────────────────────────
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

  const summary = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
  const isWeekendOrHoliday = todayCtx?.is_weekend || todayCtx?.is_holiday
  const isOnLeave = todayCtx?.is_on_leave

  return (
    <div className="p-6 space-y-5">

      {/* ── Punch-In Panel (hidden on weekend/holiday/leave if already punched) ── */}
      {!isWeekendOrHoliday && !isOnLeave && (
        <PunchInPanel
          todayCtx={todayCtx}
          activeSession={activeSession}
          elapsed={elapsed}
          punching={punching}
          onPunchIn={handlePunchIn}
          onPunchOut={handlePunchOut}
        />
      )}

      {/* Weekend/holiday/leave notice */}
      {(isWeekendOrHoliday || isOnLeave) && (
        <div className="px-4 py-3 rounded-xl text-sm"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', color: 'var(--text-muted)' }}>
          {todayCtx?.is_holiday ? `🎉 Today is a holiday: ${todayCtx.holiday_name}`
           : todayCtx?.is_weekend ? '📅 Today is a weekend'
           : '🌴 You have approved leave today'}
        </div>
      )}

      {/* ── Work Mode Requests ──────────────────────────────────────────────── */}
      <div className="rounded-xl border overflow-hidden"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b"
             style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-alt)' }}>
          <div className="flex items-center gap-2">
            <Home className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>Work Mode Requests</span>
          </div>
          <button
            onClick={() => setShowWMRModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus className="w-3.5 h-3.5" /> Apply Work Mode
          </button>
        </div>

        {wmrLoading ? (
          <div className="py-6 flex justify-center" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : wmrList.length === 0 ? (
          <div className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No work mode requests. Click <strong>Apply Work Mode</strong> to submit one.
          </div>
        ) : (
          <div>
            {wmrList.map(req => {
              const sc = WMR_STATUS_COLOR[req.status] || { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' }
              const canCancel = req.status === 'pending' || req.status === 'approved'
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3 border-b"
                     style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>
                        {WMR_MODE_LABEL[req.work_mode] || req.work_mode}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={{ background: sc.bg, color: sc.color }}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {req.from_date} – {req.to_date} · {req.reason}
                    </p>
                    {req.rejected_reason && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-danger)' }}>
                        Rejected: {req.rejected_reason}
                      </p>
                    )}
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => handleCancelWMR(req.id)}
                      disabled={cancellingId === req.id}
                      className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)',
                        opacity: cancellingId === req.id ? 0.5 : 1, cursor: cancellingId === req.id ? 'not-allowed' : 'pointer' }}>
                      {cancellingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cancel'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Attendance History ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>Attendance History</h3>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
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
          <div className="flex flex-wrap gap-1.5 mb-3">
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

        {error && (
          <div className="px-3 py-2 rounded-lg text-sm mb-3" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
            {error}
          </div>
        )}

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
                    const checkIn  = rec.check_in  ? formatTimeOnly(rec.check_in.endsWith('Z')  ? rec.check_in  : rec.check_in  + 'Z') : '—'
                    const checkOut = rec.check_out ? formatTimeOnly(rec.check_out.endsWith('Z') ? rec.check_out : rec.check_out + 'Z') : '—'
                    // rec.date is a plain calendar date — build from Y/M/D parts so
                    // display never shifts due to a timezone conversion. Includes a
                    // weekday name, which the centralized formatter doesn't support,
                    // so this stays a documented exception rather than using it.
                    const dateStr  = rec.date
                      ? (() => {
                          const [y, m, d] = rec.date.split('-').map(Number)
                          return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', weekday: 'short' })
                        })()
                      : '—'
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
                      if (page <= 3) pg = i + 1
                      else if (page >= pages - 2) pg = pages - 4 + i
                      else pg = page - 2 + i
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

      {/* ── Shift Change Requests ──────────────────────────────────────────── */}
      <div className="rounded-xl border overflow-hidden"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>Shift Change Requests</span>
          </div>
          <button onClick={() => setShowSCRModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus className="w-3.5 h-3.5" /> Request
          </button>
        </div>
        {scrLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
        ) : scrList.length === 0 ? (
          <div className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No shift change requests yet</div>
        ) : (
          <div>
            {scrList.map(req => {
              const sc = { pending: { bg:'rgba(251,191,36,0.12)', color:'#F59E0B' }, approved: { bg:'rgba(52,211,153,0.12)', color:'#10B981' }, rejected: { bg:'rgba(248,113,113,0.12)', color:'#EF4444' }, cancelled: { bg:'rgba(139,143,168,0.1)', color:'#8B8FA8' } }[req.status] || { bg:'rgba(139,143,168,0.1)', color:'#8B8FA8' }
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
                     style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>
                      {req.requested_shift_name}
                      {req.current_shift_name ? <span className="text-xs font-normal ml-1.5" style={{ color: 'var(--text-muted)' }}>(from {req.current_shift_name})</span> : null}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {req.effective_from}{req.effective_to ? ` – ${req.effective_to}` : ' onwards'} · {req.reason}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ background: sc.bg, color: sc.color }}>{req.status}</span>
                    {req.status === 'pending' && (
                      <button onClick={async () => {
                        if (!window.confirm('Cancel this shift change request?')) return
                        setCancellingScr(req.id)
                        try { await hrmService.cancelShiftChangeRequest(req.id); toast.success('Request cancelled'); loadSCR() }
                        catch (e) { toast.error(e?.response?.data?.detail || 'Failed') }
                        setCancellingScr(null)
                      }} disabled={cancellingScr === req.id}
                        className="p-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)', opacity: cancellingScr===req.id?0.5:1 }}>
                        {cancellingScr === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Work Mode Request Modal */}
      {showWMRModal && (
        <WorkModeRequestModal
          onClose={() => setShowWMRModal(false)}
          onSuccess={() => { loadWMR(); loadToday() }}
        />
      )}

      {/* Shift Change Request Modal */}
      {showSCRModal && (
        <ShiftChangeRequestModal
          todayCtx={todayCtx}
          onClose={() => setShowSCRModal(false)}
          onSuccess={() => { loadSCR() }}
        />
      )}
    </div>
  )
}

// ── Payslips Tab ──────────────────────────────────────────────────────────────

const MONTH_NAMES_PS = ['','January','February','March','April','May','June',
  'July','August','September','October','November','December']

function PayslipsTab() {
  const user = useSelector(selectUser)
  const companyName = user?.companyName || user?.company_name || ''

  const [payslips,  setPayslips]  = useState([])
  const [structure, setStructure] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [viewPs,    setViewPs]    = useState(null)

  useEffect(() => {
    Promise.all([
      hrmService.listOwnPayslips({ page_size: 24 }),
      hrmService.getPayrollStructure(),
    ])
      .then(([psRes, structRes]) => {
        setPayslips(psRes.data?.items || psRes.data || [])
        setStructure(structRes.data)
      })
      .catch(err => {
        const msg = err?.response?.data?.detail || 'Failed to load payslips'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [])

  const fmt = n => n != null
    ? n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    : '—'

  const monthLabel = (m) => {
    const mn = Number(m)
    if (!mn || mn < 1 || mn > 12) return '—'
    return MONTH_NAMES_PS[mn]
  }

  const printPayslip = () => {
    const area = document.getElementById('ess-payslip-print-area')
    if (!area || !viewPs) return
    const w = window.open('', '_blank', 'width=900,height=700')
    w.document.write(`<html><head><title>Payslip</title>
      <style>body{margin:0;padding:0}@media print{body{margin:0}}</style>
      </head><body>${area.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading payslips…</div>
  )

  if (error) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
      <Banknote className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{error}</p>
    </div>
  )

  return (
    <div className="p-6">
      {payslips.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <Banknote className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No payslips available yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payslips.map(ps => (
            <div
              key={ps.id}
              className="flex items-center justify-between py-3"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div>
                <p className="font-medium" style={{ color: 'var(--text-body)' }}>
                  {monthLabel(ps.month)} {ps.year ?? ''}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Net: {fmt(ps.net_salary)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={ps.status} />
                <button
                  onClick={() => setViewPs(ps)}
                  className="p-1.5 rounded"
                  style={{ color: 'var(--text-muted)' }}
                  title="View payslip"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setViewPs(ps); setTimeout(printPayslip, 300) }}
                  className="p-1.5 rounded"
                  style={{ color: 'var(--text-muted)' }}
                  title="Download PDF"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payslip View Modal */}
      {viewPs && (
        <ModalPortal isOpen>
          <div className="fixed inset-0 z-[9998] bg-black/50" onClick={() => setViewPs(null)} />
          <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-gray-900">
                  Payslip — {monthLabel(viewPs.month)} {viewPs.year}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={printPayslip}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </button>
                  <button onClick={() => setViewPs(null)}>
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="p-4" id="ess-payslip-print-area">
                <PayslipDocument ps={viewPs} companyName={companyName} structure={structure} />
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
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
                  {formatDate(l.from_date)}
                  {' – '}
                  {formatDate(l.to_date)}
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
  pending:           { label: 'Pending',        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  approved:          { label: 'Approved',        color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  rejected:          { label: 'Rejected',        color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  reupload_required: { label: 'Reupload Req.',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
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
                {doc.uploaded_at ? ` · ${formatDate(doc.uploaded_at)}` : ''}
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
              <div className="flex flex-col gap-1 flex-shrink-0">
                {/* Preview link — uses static URL so no auth headers needed */}
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Preview"
                >
                  <Eye className="w-4 h-4" />
                </a>
                {/* Download link with correct filename */}
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
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
  const [error, setError]     = useState(null)

  useEffect(() => {
    hrmService.getMyAssets()
      .then(r => setAssets(r.data?.items || []))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load assets'))
      .finally(() => setLoading(false))
  }, [])

  const fmtDate = (dt) => dt ? formatDate(dt) : null

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )

  if (error) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{error}</p>
    </div>
  )

  return (
    <div className="p-6 space-y-3">
      {assets.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-3" style={{ color: 'var(--text-muted)' }}>
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">No assets assigned to you</p>
          <p className="text-xs opacity-70">Assets assigned by HR will appear here.</p>
        </div>
      ) : assets.map(asset => (
        <div
          key={asset.id}
          className="rounded-xl p-4"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ background: 'rgba(124,58,237,0.12)' }}>
              <Package className="w-5 h-5" style={{ color: '#7c3aed' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 justify-between flex-wrap">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-body)' }}>
                  {asset.brand ? `${asset.brand} ${asset.model_name || ''}`.trim() : asset.asset_tag}
                </p>
                <StatusBadge status={asset.status} />
              </div>
              <div className="mt-1 space-y-0.5">
                <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                  <span className="font-medium">Type:</span> {asset.asset_type?.replace(/_/g, ' ')}
                  {asset.asset_tag && <span> · <span className="font-mono">{asset.asset_tag}</span></span>}
                </p>
                {asset.serial_number && (
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    S/N: {asset.serial_number}
                  </p>
                )}
                {asset.assigned_on && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Assigned: {fmtDate(asset.assigned_on)}
                  </p>
                )}
                {asset.warranty_expiry && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Warranty until: {fmtDate(asset.warranty_expiry)}
                  </p>
                )}
              </div>
            </div>
          </div>
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
