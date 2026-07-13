import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Coffee,
  Users, Wifi, Activity, Settings, Save, Loader2, LogOut,
  CalendarDays, FileText, Shield, SlidersHorizontal,
  Download, Search, ChevronLeft, ChevronRight, TrendingUp, RotateCcw, X,
  Plus, Trash2, Edit2, Home, UserCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { selectUser } from '../../store/authSlice'
import { usePermissions } from '../../hooks/usePermissions'
import hrmService from '../../services/hrmService'
import { getTenantTimezone, formatTimeOnly, formatDateTime } from '../../utils/format'
import { useLivePolling } from '../../hooks/useLivePolling'
import { publish, LIVE_TOPICS } from '../../utils/liveUpdateBus'
import TableScroll from '../../components/common/TableScroll'
import CompanyCalendar, { toDateKey } from '../../components/calendar/CompanyCalendar'
import HolidayManagement from './HolidayManagement'
import LeavePolicyManagement from './LeavePolicyManagement'
import ShiftManagement from './ShiftManagement'

// ── Formatting helpers ─────────────────────────────────────────────────────────

/**
 * Convert decimal hours to human-readable "Xh Ym" format.
 * Examples: 0.03 → "2m", 0.08 → "5m", 2.2 → "2h 12m", 8.5 → "8h 30m"
 */
function formatHours(hours) {
  if (hours === null || hours === undefined || hours === 0) return '—'
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  if (totalMinutes === 0) return '—'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Format break duration in minutes as "Xm" or "Xh Ym". */
function formatMinutes(minutes) {
  if (!minutes) return '—'
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

const STATUS_LABEL = {
  present:    'Present',
  late:       'Late',
  absent:     'Absent',
  on_leave:   'On Leave',
  wfh:        'WFH',
  hybrid:     'Hybrid',
  field_work: 'Field Work',
  half_day:   'Half Day',
  holiday:    'Holiday',
  weekend:    'Weekend',
  auto_closed:'Auto Closed',
}

const STATUS_STYLE = {
  present:    { background: 'var(--bg-success)',  color: 'var(--text-success)' },
  late:       { background: 'var(--bg-warning)',  color: 'var(--text-warning)' },
  absent:     { background: 'var(--bg-danger)',   color: 'var(--text-danger)' },
  on_leave:   { background: 'var(--bg-info)',     color: 'var(--text-info)' },
  wfh:        { background: 'var(--bg-info)',     color: 'var(--text-info)' },
  hybrid:     { background: 'var(--bg-info)',     color: 'var(--text-info)' },
  field_work: { background: 'var(--bg-warning)',  color: 'var(--text-warning)' },
  half_day:   { background: 'var(--bg-warning)',  color: 'var(--text-warning)' },
  holiday:    { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' },
  weekend:    { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' },
  auto_closed:{ background: 'var(--bg-card-alt)', color: 'var(--text-muted)' },
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, iconColor }) {
  return (
    <div className="rounded-xl border p-4 flex items-center gap-3"
         style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
      <Icon className={`w-8 h-8 flex-shrink-0 ${iconColor}`} />
      <div>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{value ?? '—'}</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  )
}

// ── Recovery Modal ─────────────────────────────────────────────────────────────

function RecoveryModal({ record, onClose, onSuccess }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) { toast.error('Recovery reason is required'); return }
    setSaving(true)
    try {
      await hrmService.recoverAttendance(record.id, { recovery_reason: reason.trim() })
      toast.success('Attendance recovered — employee can now continue working')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Recovery failed')
    } finally {
      setSaving(false)
    }
  }

  const fmtTime = (dt) => {
    if (!dt) return '—'
    return formatTimeOnly(dt.endsWith('Z') ? dt : dt + 'Z')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RotateCcw style={{ width: 20, height: 20, color: 'var(--accent)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Recover Attendance</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: '12px 14px', borderRadius: 10, marginBottom: 16,
          background: 'var(--bg-warning)', border: '1px solid var(--border-warning)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-warning)', margin: 0, lineHeight: 1.5 }}>
            <strong>{record.employee_name}</strong> punched in at <strong>{fmtTime(record.check_in)}</strong> and
            accidentally punched out at <strong>{fmtTime(record.check_out)}</strong>.
            <br />The recovery gap will be tracked as a break. Worked time before the accidental punch-out is preserved.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Recovery Reason *
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Employee accidentally clicked punch out while on a call"
              rows={3}
              required
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '10px 12px', fontSize: 14, color: 'var(--text-body)', resize: 'vertical',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 0.8s linear infinite' }} /> : <RotateCcw style={{ width: 14, height: 14 }} />}
              {saving ? 'Recovering…' : 'Recover Attendance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Settings tab ───────────────────────────────────────────────────────────────

function SettingsTab() {
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await hrmService.getAttendanceSettings()
      setCfg(r.data)
    } catch {
      toast.error('Failed to load attendance settings')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      await hrmService.updateAttendanceSettings(cfg)
      toast.success('Attendance settings saved')
    } catch {
      toast.error('Failed to save settings')
    }
    setSaving(false)
  }

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }))

  if (loading || !cfg) return (
    <div className="p-6">
      <div className="h-6 w-48 rounded animate-pulse" style={{ background: 'var(--bg-card-alt)' }} />
    </div>
  )

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Attendance Settings</h2>

      {/* Office Hours */}
      <div className="rounded-xl border p-5 space-y-4"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Office Hours</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Office Start Time</span>
            <input type="time" value={cfg.office_start_time} onChange={e => set('office_start_time', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Office End Time</span>
            <input type="time" value={cfg.office_end_time} onChange={e => set('office_end_time', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Grace Period (minutes)</span>
            <input type="number" min="0" max="120" value={cfg.grace_minutes}
              onChange={e => set('grace_minutes', parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
          </label>
        </div>
      </div>

      {/* Work Hours */}
      <div className="rounded-xl border p-5 space-y-4"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Work Hours Thresholds</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Half Day Hours</span>
            <input type="number" min="0.5" max="12" step="0.5" value={cfg.half_day_hours}
              onChange={e => set('half_day_hours', parseFloat(e.target.value) || 4.5)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Work hours below this = Half Day</p>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Full Day Hours</span>
            <input type="number" min="1" max="24" step="0.5" value={cfg.full_day_hours}
              onChange={e => set('full_day_hours', parseFloat(e.target.value) || 8.0)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
          </label>
        </div>
      </div>

      {/* Break Limits */}
      <div className="rounded-xl border p-5 space-y-4"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Break Limits</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Max Break Duration (minutes)</span>
            <input type="number" min="0" max="480" value={cfg.max_break_minutes}
              onChange={e => set('max_break_minutes', parseInt(e.target.value, 10) || 90)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Max Break Sessions per Day</span>
            <input type="number" min="0" max="20" value={cfg.max_breaks}
              onChange={e => set('max_breaks', parseInt(e.target.value, 10) || 5)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
          </label>
        </div>
      </div>

      {/* IP Restriction */}
      <div className="rounded-xl border p-5 space-y-4"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Office IP Restriction</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.ip_restriction_enabled}
            onChange={e => set('ip_restriction_enabled', e.target.checked)}
            className="w-4 h-4 rounded" />
          <span className="text-sm" style={{ color: 'var(--text-body)' }}>
            Restrict office check-in to approved IP addresses
          </span>
        </label>
        {cfg.ip_restriction_enabled && (
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Approved IPs (one per line, CIDR notation supported)
            </span>
            <textarea
              rows={4}
              value={(cfg.approved_ips || []).join('\n')}
              onChange={e => set('approved_ips', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              placeholder="192.168.1.0/24&#10;10.0.0.1"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)', resize: 'vertical' }}
            />
          </label>
        )}
      </div>

      {/* Working Days */}
      <div className="rounded-xl border p-5 space-y-4"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Company Working Days</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Days NOT checked are treated as weekends. Individual employees can have different schedules.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, idx) => {
            const checked = (cfg.working_days || [0,1,2,3,4]).includes(idx)
            return (
              <button key={idx} type="button"
                onClick={() => {
                  const cur = cfg.working_days || [0,1,2,3,4]
                  set('working_days', checked ? cur.filter(d => d !== idx) : [...cur, idx].sort())
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: checked ? 'var(--accent)' : 'var(--bg-alt)',
                  color: checked ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                {day}
              </button>
            )
          })}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Weekend: {['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            .filter((_, i) => !(cfg.working_days || [0,1,2,3,4]).includes(i)).join(', ') || 'None'}
        </p>
      </div>

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: 'var(--accent)' }}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}

// ── Date-range utilities (shared) ──────────────────────────────────────────────

const fmt = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const PRESETS = [
  { key: 'today',         label: 'Today' },
  { key: 'yesterday',     label: 'Yesterday' },
  { key: 'this_week',     label: 'This Week' },
  { key: 'last_week',     label: 'Last Week' },
  { key: 'this_month',    label: 'This Month' },
  { key: 'last_month',    label: 'Last Month' },
  { key: 'this_quarter',  label: 'This Quarter' },
  { key: 'last_quarter',  label: 'Last Quarter' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'this_year',     label: 'This Year' },
  { key: 'last_year',     label: 'Last Year' },
  { key: 'custom',        label: 'Custom Range' },
]

function calcPreset(key) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const y = today.getFullYear(), mo = today.getMonth()
  switch (key) {
    case 'today':         return { start: today, end: today }
    case 'yesterday': {   const d = new Date(today); d.setDate(d.getDate() - 1); return { start: d, end: d } }
    case 'this_week': {   const d = new Date(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { start: d, end: today } }
    case 'last_week': {
      const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7)
      const sun = new Date(mon);   sun.setDate(mon.getDate() + 6)
      return { start: mon, end: sun }
    }
    case 'this_month':   return { start: new Date(y, mo, 1),     end: today }
    case 'last_month':   return { start: new Date(y, mo - 1, 1), end: new Date(y, mo, 0) }
    case 'this_quarter': { const q = Math.floor(mo / 3); return { start: new Date(y, q * 3, 1), end: today } }
    case 'last_quarter': {
      const q = Math.floor(mo / 3) - 1
      const qy = q < 0 ? y - 1 : y, aq = ((q % 4) + 4) % 4
      return { start: new Date(qy, aq * 3, 1), end: new Date(qy, aq * 3 + 3, 0) }
    }
    case 'last_6_months': { const d = new Date(today); d.setDate(d.getDate() - 180); return { start: d, end: today } }
    case 'this_year':     return { start: new Date(y, 0, 1), end: today }
    case 'last_year':     return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31) }
    default:              return { start: today, end: today }
  }
}

// ── Trend Chart ────────────────────────────────────────────────────────────────

function TrendChart({ data }) {
  if (!data || data.length < 2) return null
  const maxVal = Math.max(...data.map(d => d.present + d.absent + d.late), 1)
  const H = 72
  const bw = data.length > 180 ? 3 : data.length > 60 ? 5 : 8
  const gap = data.length > 180 ? 1 : 2
  const totalW = Math.max(data.length * (bw + gap), 400)

  return (
    <div className="rounded-xl border p-4"
         style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Daily Trend · {data.length} days
        </p>
        <div className="flex items-center gap-4">
          {[['#43E97B','Present'],['#FF4757','Absent'],['#F59E0B','Late']].map(([color, label]) => (
            <span key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color, opacity: 0.85 }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={totalW} height={H + 18} style={{ display: 'block', minWidth: '100%' }}>
          {data.map((d, i) => {
            const x = i * (bw + gap) + 1
            const pH = (d.present / maxVal) * H
            const aH = (d.absent  / maxVal) * H
            const lH = (d.late    / maxVal) * H
            const bottom = H
            return (
              <g key={d.date}>
                <rect x={x} y={bottom - pH}          width={bw} height={pH} fill="#43E97B" opacity={0.85} rx="1" />
                <rect x={x} y={bottom - pH - lH}     width={bw} height={lH} fill="#F59E0B" opacity={0.85} rx="1" />
                <rect x={x} y={bottom - pH - lH - aH} width={bw} height={aH} fill="#FF4757" opacity={0.75} rx="1" />
                {data.length <= 31 && (
                  <text x={x + bw / 2} y={H + 13} textAnchor="middle" fontSize="8" fill="var(--text-disabled)">
                    {new Date(d.date + 'T12:00:00').getDate()}
                  </text>
                )}
              </g>
            )
          })}
          <line x1="0" y1={H} x2={totalW} y2={H} stroke="var(--border-subtle)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  )
}

// ── Unified Dashboard + History Tab ───────────────────────────────────────────

function DashboardTab() {
  const { has } = usePermissions()
  const canManage = has('hrm:attendance:manage')

  // ── Filters ────────────────────────────────────────────────────────────────
  const [preset,       setPreset]       = useState('today')
  const [customStart,  setCustomStart]  = useState('')
  const [customEnd,    setCustomEnd]    = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modeFilter,   setModeFilter]   = useState('')
  const [search,       setSearch]       = useState('')
  const [page,         setPage]         = useState(1)
  const PAGE_SIZE = 50

  // ── Data ───────────────────────────────────────────────────────────────────
  const [liveRecords, setLiveRecords] = useState([])
  const [histRecords, setHistRecords] = useState([])
  const [stats,       setStats]       = useState(null)
  const [trend,       setTrend]       = useState([])
  const [total,       setTotal]       = useState(0)
  const [pages,       setPages]       = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [exporting,   setExporting]   = useState(false)
  const [checking,    setChecking]    = useState(null)
  const [error,       setError]       = useState(null)
  const [recoveryRec, setRecoveryRec] = useState(null)  // record to recover

  const isToday = preset === 'today'

  const range = useMemo(() => {
    if (preset === 'custom') {
      return customStart && customEnd ? { start: customStart, end: customEnd } : null
    }
    const r = calcPreset(preset)
    return r ? { start: fmt(r.start), end: fmt(r.end) } : null
  }, [preset, customStart, customEnd])

  const rangeLabel = range
    ? range.start === range.end ? range.start : `${range.start} → ${range.end}`
    : ''

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async (pg = 1) => {
    if (!range) return
    setLoading(true); setError(null)
    try {
      if (isToday) {
        const statsParams = {}
        if (search)       statsParams.search    = search
        if (statusFilter) statsParams.status    = statusFilter
        if (modeFilter)   statsParams.work_mode = modeFilter
        const [recRes, statsRes] = await Promise.allSettled([
          hrmService.getTeamToday(),
          hrmService.getAttendanceTodayStats(statsParams),
        ])
        let recs = recRes.status === 'fulfilled' ? (recRes.value.data || []) : []
        if (statusFilter) recs = recs.filter(r => r.status === statusFilter)
        if (modeFilter)   recs = recs.filter(r => r.work_mode === modeFilter)
        if (search)       recs = recs.filter(r => (r.employee_name || '').toLowerCase().includes(search.toLowerCase()))
        setLiveRecords(recs)
        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
        setTrend([])
      } else {
        const params = { start_date: range.start, end_date: range.end, page: pg, page_size: PAGE_SIZE }
        if (search)       params.search    = search
        if (statusFilter) params.status    = statusFilter
        if (modeFilter)   params.work_mode = modeFilter
        const statsParams = { start_date: range.start, end_date: range.end }
        if (search)       statsParams.search    = search
        if (statusFilter) statsParams.status    = statusFilter
        if (modeFilter)   statsParams.work_mode = modeFilter
        const [histRes, statsRes] = await Promise.allSettled([
          hrmService.getTeamAttendanceHistory(params),
          hrmService.getAttendanceRangeStats(statsParams),
        ])
        if (histRes.status === 'fulfilled') {
          setHistRecords(histRes.value.data?.items || [])
          setTotal(histRes.value.data?.total  || 0)
          setPages(histRes.value.data?.pages  || 1)
          setPage(pg)
        } else {
          setError(histRes.reason?.response?.data?.detail || 'Failed to load records')
        }
        if (statsRes.status === 'fulfilled') {
          const d = statsRes.value.data
          setStats(d); setTrend(d.trend || [])
        }
      }
    } catch {
      setError('Failed to load attendance data')
    }
    setLoading(false)
  }, [range?.start, range?.end, isToday, statusFilter, modeFilter, search])

  useEffect(() => { load(1) }, [load])

  // Auto-refresh when viewing today
  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => load(1), 60_000)
    return () => clearInterval(id)
  }, [isToday, load])

  // ── Today actions ──────────────────────────────────────────────────────────
  const isOnBreak = (rec) => {
    const b = rec.breaks || []; return b.length > 0 && !b[b.length - 1].end
  }
  const fmtTime = (dt) => {
    if (!dt) return '—'
    return formatTimeOnly(dt.endsWith('Z') ? dt : dt + 'Z')
  }

  const handleCheckIn    = async (empId) => { setChecking(empId+'_in');    try { await hrmService.checkIn({ employee_id: empId });    load(1) } catch (err) { toast.error(err?.response?.data?.detail || 'Check-in failed') }    setChecking(null) }
  const handleCheckOut   = async (empId) => { setChecking(empId+'_out');   try { await hrmService.checkOut({ employee_id: empId });   load(1) } catch (err) { toast.error(err?.response?.data?.detail || 'Check-out failed') }   setChecking(null) }
  const handleBreakStart = async (empId) => { setChecking(empId+'_bs');    try { await hrmService.startBreak({ employee_id: empId }); toast.success('Break started'); load(1) } catch (err) { toast.error(err?.response?.data?.detail || 'Failed') } setChecking(null) }
  const handleBreakEnd   = async (empId) => { setChecking(empId+'_be');    try { await hrmService.endBreak({ employee_id: empId });   toast.success('Break ended');   load(1) } catch { toast.error('Failed') } setChecking(null) }

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!range) return
    setExporting(true)
    try {
      const params = { start_date: range.start, end_date: range.end }
      if (statusFilter) params.status = statusFilter
      if (modeFilter)   params.work_mode = modeFilter
      if (search)       params.search = search
      const r = await hrmService.exportTeamAttendanceCsv(params)
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url
      a.download = `attendance-${range.start}-to-${range.end}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
    setExporting(false)
  }

  // ── Dynamic cards ──────────────────────────────────────────────────────────
  const S = stats || {}

  // attended = present + late + half_day + wfh (all statuses where employee showed up)
  const attendedCount = S.attended ?? ((S.present || 0) + (S.late || 0) + (S.half_day || 0) + (S.wfh || 0))

  const CARDS = isToday ? [
    { label: 'Total Employees',   value: S.total_employees   ?? '—', icon: Users,        iconColor: 'text-blue-500' },
    { label: 'Present Today',     value: S.present           ?? '—', icon: CheckCircle,  iconColor: 'text-green-500' },
    { label: 'Absent Today',      value: S.absent            ?? '—', icon: XCircle,      iconColor: 'text-red-500' },
    { label: 'Working Now',       value: S.currently_working ?? '—', icon: Activity,     iconColor: 'text-emerald-500' },
    { label: 'On Break',          value: S.on_break          ?? '—', icon: Coffee,       iconColor: 'text-yellow-500' },
    { label: 'Late Arrivals',     value: S.late              ?? '—', icon: AlertCircle,  iconColor: 'text-orange-500' },
    { label: 'Half Day',          value: S.half_day          ?? '—', icon: Clock,        iconColor: 'text-purple-500' },
    { label: 'On Leave',          value: S.on_leave          ?? '—', icon: Wifi,         iconColor: 'text-indigo-500' },
  ] : [
    { label: 'Attended',          value: attendedCount,                                                               icon: CheckCircle,  iconColor: 'text-green-500' },
    { label: 'Absent',            value: S.absent           ?? '—',                                                   icon: XCircle,      iconColor: 'text-red-500' },
    { label: 'Late',              value: S.late             ?? '—',                                                   icon: AlertCircle,  iconColor: 'text-orange-500' },
    { label: 'Half Day',          value: S.half_day         ?? '—',                                                   icon: Clock,        iconColor: 'text-purple-500' },
    { label: 'On Leave',          value: S.on_leave         ?? '—',                                                   icon: Wifi,         iconColor: 'text-indigo-500' },
    { label: 'WFH',               value: S.wfh              ?? '—',                                                   icon: Users,        iconColor: 'text-blue-500' },
    { label: 'Total Work Hrs',    value: S.total_work_hours      > 0 ? formatHours(S.total_work_hours)      : '—',   icon: Activity,     iconColor: 'text-emerald-500' },
    { label: 'Overtime Hrs',      value: S.total_overtime_hours  > 0 ? formatHours(S.total_overtime_hours)  : '—',   icon: TrendingUp,   iconColor: 'text-yellow-500' },
  ]

  const presetLabel  = PRESETS.find(p => p.key === preset)?.label || preset
  const records      = isToday ? liveRecords : histRecords
  const working      = isToday ? (S.currently_working ?? 0) : 0
  const onBreakCnt   = isToday ? (S.on_break ?? 0) : 0
  const colSpan      = canManage ? 9 : 8
  const hasFilters   = statusFilter || modeFilter || search
  const resetFilters = () => { setStatusFilter(''); setModeFilter(''); setSearch('') }

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>

      {/* ── Filter bar (sticky, single horizontal row) ── */}
      <div className="sticky top-0 z-20 px-4 pt-3 pb-2"
           style={{ background: 'var(--bg-main)' }}>
        <div className="rounded-xl border px-3 py-2"
             style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

          {/* ── Date preset ── */}
          <select
            value={preset}
            onChange={e => { setPreset(e.target.value); setPage(1) }}
            style={{
              width: 180, height: 32, flexShrink: 0,
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-body)', fontSize: '0.75rem',
              padding: '0 8px', outline: 'none', cursor: 'pointer',
            }}>
            {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>

          {/* Custom date range pickers (only when custom selected) */}
          {preset === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={e => { setCustomStart(e.target.value); setPage(1) }}
                style={{
                  width: 136, height: 32, flexShrink: 0,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-body)', fontSize: '0.75rem',
                  padding: '0 8px', outline: 'none',
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }}>–</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => { setCustomEnd(e.target.value); setPage(1) }}
                style={{
                  width: 136, height: 32, flexShrink: 0,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-body)', fontSize: '0.75rem',
                  padding: '0 8px', outline: 'none',
                }}
              />
            </>
          )}

          {/* Range badge (non-custom presets) */}
          {preset !== 'custom' && rangeLabel && (
            <span style={{
              fontSize: '0.7rem', padding: '2px 8px', borderRadius: 6, flexShrink: 0, whiteSpace: 'nowrap',
              background: 'var(--bg-info)', color: 'var(--text-info)',
            }}>
              {rangeLabel}
            </span>
          )}

          {/* ── Divider ── */}
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />

          {/* ── Status filter ── */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            style={{
              width: 180, height: 32, flexShrink: 0,
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-body)', fontSize: '0.75rem',
              padding: '0 8px', outline: 'none', cursor: 'pointer',
            }}>
            <option value="">All Statuses</option>
            {['present','late','absent','half_day','on_leave','wfh','holiday','weekend'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>

          {/* ── Mode filter ── */}
          <select
            value={modeFilter}
            onChange={e => { setModeFilter(e.target.value); setPage(1) }}
            style={{
              width: 180, height: 32, flexShrink: 0,
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-body)', fontSize: '0.75rem',
              padding: '0 8px', outline: 'none', cursor: 'pointer',
            }}>
            <option value="">All Modes</option>
            {['office','wfh','hybrid','field'].map(m => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>

          {/* ── Employee search (fluid) ── */}
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 220 }}>
            <Search style={{ position: 'absolute', left: 8, top: 8, width: 14, height: 14, pointerEvents: 'none', color: 'var(--text-disabled)' }} />
            <input
              placeholder="Search employee…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(1)}
              style={{
                width: '100%', height: 32,
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-body)', fontSize: '0.75rem',
                padding: '0 8px 0 28px', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ── Action buttons ── */}
          {hasFilters && (
            <button
              onClick={resetFilters}
              style={{
                height: 32, padding: '0 10px', borderRadius: 8, flexShrink: 0,
                background: 'var(--bg-alt)', color: 'var(--text-muted)',
                fontSize: '0.75rem', fontWeight: 500, border: 'none', cursor: 'pointer',
              }}>
              Reset
            </button>
          )}
          <button
            onClick={() => load(page)}
            title="Refresh"
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'var(--bg-alt)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <RefreshCw style={{ width: 14, height: 14, color: 'var(--text-muted)' }}
                       className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !range}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8, flexShrink: 0,
              background: 'var(--bg-success)', color: 'var(--text-success)',
              fontSize: '0.75rem', fontWeight: 500, border: 'none',
              cursor: exporting || !range ? 'not-allowed' : 'pointer',
              opacity: exporting || !range ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}>
            {exporting ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Download style={{ width: 12, height: 12 }} />}
            Export
          </button>
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="px-4 pb-4 space-y-4">

      {/* ── Live banner ── */}
      {isToday && !loading && (working > 0 || onBreakCnt > 0) && (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl flex-wrap"
             style={{ background: 'rgba(67,233,123,0.08)', border: '1px solid rgba(67,233,123,0.2)' }}>
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#43E97B' }}>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            {working} currently working
          </span>
          {onBreakCnt > 0 && (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-warning)' }}>
              <Coffee className="w-4 h-4" /> {onBreakCnt} on break
            </span>
          )}
          <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
            Auto-refreshes every 60s
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="px-3 py-2 rounded-lg text-sm flex items-center gap-2"
             style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CARDS.map(c => (
          <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} iconColor={c.iconColor} />
        ))}
      </div>

      {/* ── Trend chart (multi-day only) ── */}
      {!isToday && trend.length > 1 && <TrendChart data={trend} />}

      {/* ── Table ── */}
      <div className="rounded-xl border overflow-hidden"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b"
             style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-alt)' }}>
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-disabled)' }}>
            {isToday ? "Today's Attendance" : `${presetLabel} · ${total} records`}
          </span>
          {!isToday && total > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Page {page} of {pages}
            </span>
          )}
        </div>

        <TableScroll>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-alt)' }}>
                {['Employee','Date','Status','Check In','Check Out','Worked','Break','OT',
                  ...(canManage ? ['Actions'] : [])].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                      style={{ color: 'var(--text-disabled)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={colSpan} className="px-3 py-2.5">
                    <div className="h-4 rounded animate-pulse" style={{ background: 'var(--bg-card-alt)' }} />
                  </td></tr>
                ))
              ) : records.length === 0 ? (
                <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No attendance records for {isToday ? 'today' : 'this period'}
                  {preset === 'custom' && (!customStart || !customEnd) && (
                    <span className="block text-xs opacity-60 mt-1">Select start and end dates above</span>
                  )}
                </td></tr>
              ) : records.map((rec, idx) => {
                const onBrk = isToday ? isOnBreak(rec) : false
                const st = STATUS_STYLE[rec.status] || {}
                const dateLabel = rec.date
                  // rec.date is a plain calendar date (no time component) — build
                  // it from explicit Y/M/D parts so the displayed date never
                  // shifts due to a timezone conversion (it isn't a UTC instant).
                  ? (() => {
                      const [y, m, d] = rec.date.split('-').map(Number)
                      return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', weekday: 'short' })
                    })()
                  : isToday
                  ? new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', weekday: 'short', timeZone: getTenantTimezone() })
                  : '—'
                return (
                  <tr key={rec.id || idx}
                      style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-row-alt)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text-heading)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rec.employee_name || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: 'var(--text-body)' }}>{dateLabel}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={st}>
                        {STATUS_LABEL[rec.status] || rec.status || '—'}
                        {rec.is_late && rec.late_by_minutes > 0 ? ` +${rec.late_by_minutes}m` : ''}
                      </span>
                      {onBrk && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>Break</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>{fmtTime(rec.check_in)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>{fmtTime(rec.check_out)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-xs"
                        style={{ color: rec.check_in && !rec.check_out && isToday ? 'var(--text-success)' : 'var(--text-heading)' }}>
                      {rec.check_out ? formatHours(rec.work_hours) : rec.check_in && isToday ? 'Live' : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>
                      {rec.total_break_minutes > 0 ? formatMinutes(rec.total_break_minutes) : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs"
                        style={{ color: rec.overtime_hours > 0 ? 'var(--text-warning)' : 'var(--text-muted)' }}>
                      {rec.overtime_hours > 0 ? formatHours(rec.overtime_hours) : '—'}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {isToday && !rec.check_in && (
                            <button disabled={checking === rec.employee_id+'_in'}
                              onClick={() => handleCheckIn(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium text-white"
                              style={{ background: 'var(--accent)' }}>In</button>
                          )}
                          {isToday && rec.check_in && !rec.check_out && !onBrk && (
                            <button disabled={checking === rec.employee_id+'_bs'}
                              onClick={() => handleBreakStart(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>Brk</button>
                          )}
                          {isToday && rec.check_in && !rec.check_out && onBrk && (
                            <button disabled={checking === rec.employee_id+'_be'}
                              onClick={() => handleBreakEnd(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>End</button>
                          )}
                          {isToday && rec.check_in && !rec.check_out && (
                            <button disabled={checking === rec.employee_id+'_out'}
                              onClick={() => handleCheckOut(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
                              <LogOut className="w-3 h-3" />
                            </button>
                          )}
                          {rec.check_in && rec.check_out && !rec.check_out?.startsWith?.('—') && (
                            <button
                              onClick={() => setRecoveryRec(rec)}
                              title="Recover Attendance — reopen accidental punch-out"
                              className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                              style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}>
                              <RotateCcw className="w-3 h-3" /> Recover
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableScroll>

        {/* Pagination (historical) */}
        {!isToday && pages > 1 && (
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
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                let pg = i + 1
                if (pages > 7) {
                  if (page <= 4)             pg = i + 1
                  else if (page >= pages - 3) pg = pages - 6 + i
                  else                        pg = page - 3 + i
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
      </div>{/* end px-4 pb-4 body */}

      {recoveryRec && (
        <RecoveryModal
          record={recoveryRec}
          onClose={() => setRecoveryRec(null)}
          onSuccess={() => load(page)}
        />
      )}
    </div>
  )
}


// ── Calendar Tab ───────────────────────────────────────────────────────────────

function CalendarTab() {
  const [month, setMonth] = useState(new Date())
  const [view, setView] = useState('month')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return { from: toDateKey(start), to: toDateKey(end) }
  }, [month])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await hrmService.getCalendarEvents(range.from, range.to)
      setEvents(res.data?.data || [])
    } catch { /* silent — calendar is supplementary, not business-critical */ }
    if (!silent) setLoading(false)
  }, [range.from, range.to])

  useEffect(() => { load() }, [load])
  useLivePolling(() => load(true), 20000, true, [LIVE_TOPICS.CALENDAR])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <CompanyCalendar
        events={events}
        loading={loading}
        month={month}
        onMonthChange={setMonth}
        view={view}
        onViewChange={setView}
      />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'dashboard',    label: 'Dashboard',        icon: Activity },
  { key: 'calendar',     label: 'Calendar',         icon: CalendarDays },
  { key: 'holidays',     label: 'Holidays',         icon: CalendarDays,      perm: 'hrm:attendance:team' },
  { key: 'leave_policy', label: 'Leave Policies',   icon: FileText,          perm: 'hrm:attendance:team' },
  { key: 'shifts',       label: 'Shifts',           icon: Clock,             perm: 'hrm:attendance:team' },
  { key: 'work_mode',    label: 'Work Modes',       icon: Home,              perm: 'hrm:attendance:team' },
  { key: 'exceptions',   label: 'Exceptions',       icon: UserCheck,         perm: 'hrm:attendance:manage' },
  { key: 'geo_fence',    label: 'Geo Fence',        icon: Shield,            perm: 'hrm:attendance:manage' },
  { key: 'settings',     label: 'Attendance Rules', icon: SlidersHorizontal, perm: 'hrm:attendance:manage' },
]

// ── Shift Assignments Tab ─────────────────────────────────────────────────────

function ShiftAssignmentsTab() {
  const [list, setList]         = useState([])
  const [shifts, setShifts]     = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]   = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [page, setPage]         = useState(1)
  const [pages, setPages]       = useState(1)
  const [total, setTotal]       = useState(0)
  const [deletingId, setDeletingId] = useState(null)

  const loadList = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const r = await hrmService.listShiftAssignments({ page: pg, page_size: 20 })
      const d = r.data; setList(d.items || []); setTotal(d.total || 0); setPages(d.pages || 1); setPage(pg)
    } catch { toast.error('Failed to load shift assignments') }
    setLoading(false)
  }, [])

  useEffect(() => { loadList(1) }, [loadList])

  useEffect(() => {
    Promise.all([
      hrmService.listShifts().catch(() => ({ data: [] })),
      hrmService.listEmployees({ page_size: 200 }).catch(() => ({ data: { items: [] } })),
    ]).then(([sr, er]) => {
      setShifts(sr.data || [])
      setEmployees(er.data?.items || [])
    })
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this shift assignment?')) return
    setDeletingId(id)
    try { await hrmService.deleteShiftAssignment(id); toast.success('Assignment removed'); loadList(page) }
    catch { toast.error('Failed to remove') }
    setDeletingId(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Shift Assignments</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Assign shifts with effective date ranges. Temporary assignments auto-revert when expired.
          </p>
        </div>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}>
          <Plus className="w-4 h-4" /> New Assignment
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : list.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Clock className="w-10 h-10 opacity-30" /><p className="text-sm">No shift assignments yet</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-alt)' }}>
                  {['Employee','Shift','From','To','Type','Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-disabled)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => {
                  const now = new Date()
                  const from = new Date(a.effective_from + 'T00:00:00')
                  const to   = a.effective_to ? new Date(a.effective_to + 'T23:59:59') : null
                  const isActive = now >= from && (!to || now <= to)
                  return (
                    <tr key={a.id} style={{ background: i%2===0?'transparent':'var(--bg-row-alt)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{a.employee_name || a.employee_id}</div>
                        {isActive && <span className="text-xs font-medium" style={{ color: 'var(--text-success)' }}>● Active</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm" style={{ color: 'var(--text-body)' }}>{a.shift_name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.shift_start} – {a.shift_end}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>{a.effective_from}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>{a.effective_to || '∞ Permanent'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: a.is_temporary ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)',
                            color: a.is_temporary ? '#F59E0B' : '#10B981' }}>
                          {a.is_temporary ? 'Temporary' : 'Permanent'}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => { setEditItem(a); setShowModal(true) }}
                            className="p-1.5 rounded-lg" style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(a.id)} disabled={deletingId === a.id}
                            className="p-1.5 rounded-lg" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)', opacity: deletingId===a.id?0.5:1 }}>
                            {deletingId===a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-alt)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Page {page} of {pages} · {total} records</span>
              <div className="flex gap-1">
                <button onClick={() => loadList(page-1)} disabled={page<=1} className="p-1.5 rounded" style={{ opacity: page<=1?0.4:1 }}>
                  <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => loadList(page+1)} disabled={page>=pages} className="p-1.5 rounded" style={{ opacity: page>=pages?0.4:1 }}>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ShiftAssignmentModal
          item={editItem} shifts={shifts} employees={employees}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSuccess={() => { loadList(page); setShowModal(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}

function ShiftAssignmentModal({ item, shifts, employees, onClose, onSuccess }) {
  const isEdit = !!item
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    employee_id:   item?.employee_id   ?? '',
    shift_id:      item?.shift_id      ?? '',
    effective_from: item?.effective_from ?? today,
    effective_to:  item?.effective_to  ?? '',
    is_temporary:  item?.is_temporary  ?? false,
    reason:        item?.reason        ?? '',
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

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (!isEdit && !form.employee_id) { setErr('Select an employee'); return }
    if (!form.shift_id) { setErr('Select a shift'); return }
    if (!form.effective_from) { setErr('Effective from date is required'); return }
    if (form.effective_to && form.effective_to < form.effective_from) { setErr('End date must be after start date'); return }
    setErr(''); setSaving(true)
    try {
      const payload = { ...form, is_temporary: form.is_temporary || !!form.effective_to }
      if (!payload.effective_to) delete payload.effective_to
      if (!payload.reason) delete payload.reason
      if (isEdit) {
        await hrmService.updateShiftAssignment(item.id, payload)
        toast.success('Assignment updated')
      } else {
        await hrmService.createShiftAssignment(payload)
        toast.success('Shift assigned successfully')
      }
      onSuccess()
    } catch (e) { setErr(e?.response?.data?.detail || 'Failed to save') }
    setSaving(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center',
      padding:16, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background:'var(--bg-modal, var(--bg-card))', border:'1px solid var(--border-card)',
        borderRadius:20, boxShadow:'0 24px 80px rgba(0,0,0,0.5)', width:'100%', maxWidth:480,
        maxHeight:'90vh', overflowY:'auto', padding:24 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text-heading)', margin:0 }}>
            {isEdit ? 'Edit Shift Assignment' : 'Assign Shift'}
          </h3>
          <button onClick={onClose} style={{ padding:6, borderRadius:8, border:'none', background:'var(--bg-alt)', cursor:'pointer', color:'var(--text-muted)', lineHeight:0 }}>
            <X style={{ width:16, height:16 }} />
          </button>
        </div>
        {err && <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:16, fontSize:13, background:'var(--bg-danger)', color:'var(--text-danger)' }}>{err}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <label style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Employee *</span>
            <select className="input" style={{ width:'100%', fontSize:14 }} value={form.employee_id}
              onChange={e => set('employee_id', e.target.value)} disabled={isEdit}>
              <option value="">Select employee…</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name} {emp.employee_code ? `(${emp.employee_code})` : ''}</option>)}
            </select>
          </label>
          <label style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Shift *</span>
            <select className="input" style={{ width:'100%', fontSize:14 }} value={form.shift_id} onChange={e => set('shift_id', e.target.value)}>
              <option value="">Select shift…</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
            </select>
          </label>
          <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Effective From *</span>
            <input type="date" className="input" style={{ width:'100%', fontSize:14 }} value={form.effective_from} onChange={e => set('effective_from', e.target.value)} />
          </label>
          <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Effective To (leave blank = permanent)</span>
            <input type="date" className="input" style={{ width:'100%', fontSize:14 }} value={form.effective_to} onChange={e => set('effective_to', e.target.value)} />
          </label>
          <label style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Reason</span>
            <input type="text" className="input" style={{ width:'100%', fontSize:14 }} value={form.reason}
              onChange={e => set('reason', e.target.value)} placeholder="e.g. Client project, rotation…" />
          </label>
          <label style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
            <input type="checkbox" style={{ width:16, height:16, accentColor:'var(--accent)' }}
              checked={form.is_temporary} onChange={e => set('is_temporary', e.target.checked)} />
            <span style={{ fontSize:14, color:'var(--text-body)' }}>Temporary assignment (reverts after end date)</span>
          </label>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:14, cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ flex:1, padding:'10px 0', borderRadius:12, border:'none', background:'var(--accent)', color:'#fff', fontSize:14, fontWeight:600, cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {saving && <Loader2 style={{ width:16, height:16, animation:'spin 0.8s linear infinite' }} />}
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shift Change Requests Tab (HR view) ───────────────────────────────────────

function ShiftChangesTab() {
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [total, setTotal]     = useState(0)
  const [actionId, setActionId] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const r = await hrmService.listShiftChangeRequests({ status: statusFilter || undefined, page: pg, page_size: 20 })
      const d = r.data; setList(d.items || []); setTotal(d.total || 0); setPages(d.pages || 1); setPage(pg)
    } catch { toast.error('Failed to load shift change requests') }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load(1) }, [load])

  const handleApprove = async (id) => {
    setActionId(id)
    try { await hrmService.approveShiftChangeRequest(id); toast.success('Request approved'); load(page); publish(LIVE_TOPICS.CALENDAR) }
    catch (e) { toast.error(e?.response?.data?.detail || 'Failed') }
    setActionId(null)
  }

  const handleReject = async () => {
    if (!rejectModal) return
    setActionId(rejectModal)
    try {
      await hrmService.rejectShiftChangeRequest(rejectModal, { review_reason: rejectReason })
      toast.success('Request rejected'); setRejectModal(null); setRejectReason(''); load(page); publish(LIVE_TOPICS.CALENDAR)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed') }
    setActionId(null)
  }

  const STATUS_STYLE = {
    pending:   { bg:'rgba(251,191,36,0.15)',  color:'#F59E0B' },
    approved:  { bg:'rgba(52,211,153,0.15)',  color:'#10B981' },
    rejected:  { bg:'rgba(248,113,113,0.15)', color:'#EF4444' },
    cancelled: { bg:'rgba(139,143,168,0.12)', color:'#8B8FA8' },
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold flex-1" style={{ color: 'var(--text-heading)' }}>Shift Change Requests</h2>
        {['', 'pending', 'approved', 'rejected', 'cancelled'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: statusFilter===s?'var(--accent)':'var(--bg-card)', color: statusFilter===s?'#fff':'var(--text-muted)', border:`1px solid ${statusFilter===s?'var(--accent)':'var(--border-card)'}` }}>
            {s===''?'All':s.charAt(0).toUpperCase()+s.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : list.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <RotateCcw className="w-10 h-10 opacity-30" /><p className="text-sm">No shift change requests</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-alt)' }}>
                {['Employee','Current Shift','Requested Shift','Period','Reason','Status','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-disabled)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((req, i) => {
                const sc = STATUS_STYLE[req.status] || { bg:'rgba(139,143,168,0.12)', color:'#8B8FA8' }
                return (
                  <tr key={req.id} style={{ background:i%2===0?'transparent':'var(--bg-row-alt)', borderBottom:'1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium" style={{ color:'var(--text-heading)' }}>{req.employee_name || req.employee_id}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color:'var(--text-muted)' }}>{req.current_shift_name || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm" style={{ color:'var(--text-body)' }}>{req.requested_shift_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color:'var(--text-muted)' }}>{req.effective_from}{req.effective_to ? ` – ${req.effective_to}` : ' onwards'}</td>
                    <td className="px-3 py-2 text-xs max-w-40 truncate" style={{ color:'var(--text-muted)' }} title={req.reason}>{req.reason}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ background:sc.bg, color:sc.color }}>{req.status}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {req.status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleApprove(req.id)} disabled={actionId===req.id}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background:'var(--bg-success)', color:'var(--text-success)', opacity:actionId===req.id?0.5:1 }}>
                            {actionId===req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Approve
                          </button>
                          <button onClick={() => { setRejectModal(req.id); setRejectReason('') }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background:'var(--bg-danger)', color:'var(--text-danger)' }}>
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t" style={{ borderColor:'var(--border-subtle)', background:'var(--bg-alt)' }}>
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>Page {page} of {pages} · {total} requests</span>
              <div className="flex gap-1">
                <button onClick={() => load(page-1)} disabled={page<=1} className="p-1.5 rounded" style={{ opacity:page<=1?0.4:1 }}><ChevronLeft className="w-4 h-4" style={{ color:'var(--text-muted)' }} /></button>
                <button onClick={() => load(page+1)} disabled={page>=pages} className="p-1.5 rounded" style={{ opacity:page>=pages?0.4:1 }}><ChevronRight className="w-4 h-4" style={{ color:'var(--text-muted)' }} /></button>
              </div>
            </div>
          )}
        </div>
      )}
      {rejectModal && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }} onClick={() => setRejectModal(null)}>
          <div style={{ background:'var(--bg-modal, var(--bg-card))', border:'1px solid var(--border-card)', borderRadius:20, boxShadow:'0 24px 80px rgba(0,0,0,0.5)', width:'100%', maxWidth:380, padding:24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text-heading)', marginBottom:16 }}>Reject Request</h3>
            <label style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>Reason (optional)</span>
              <textarea className="input w-full text-sm" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why…" />
            </label>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setRejectModal(null)} style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:14, cursor:'pointer' }}>Cancel</button>
              <button onClick={handleReject} disabled={actionId===rejectModal} style={{ flex:1, padding:'10px 0', borderRadius:12, border:'none', background:'#EF4444', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {actionId===rejectModal && <Loader2 style={{ width:16, height:16, animation:'spin 0.8s linear infinite' }} />} Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Work Mode Requests Tab (HR view) ──────────────────────────────────────────

const WMR_MODE_LABEL = { wfh: 'Work From Home', hybrid: 'Hybrid', field: 'Field Work' }
const WMR_STATUS_COLOR = {
  pending:   { bg: 'rgba(251,191,36,0.15)',  color: '#F59E0B' },
  approved:  { bg: 'rgba(52,211,153,0.15)',  color: '#10B981' },
  rejected:  { bg: 'rgba(248,113,113,0.15)', color: '#EF4444' },
  cancelled: { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' },
  expired:   { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' },
}

function WorkModeTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [actionId, setActionId] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const r = await hrmService.listWorkModeRequests({ status: statusFilter || undefined, page: pg, page_size: 20 })
      const d = r.data
      setList(d.items || [])
      setTotal(d.total || 0)
      setPages(d.pages || 1)
      setPage(pg)
    } catch { toast.error('Failed to load work mode requests') }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load(1) }, [load])

  const handleApprove = async (id) => {
    setActionId(id)
    try {
      await hrmService.approveWorkModeRequest(id)
      toast.success('Request approved')
      load(page)
      publish(LIVE_TOPICS.CALENDAR)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve')
    }
    setActionId(null)
  }

  const handleReject = async () => {
    if (!rejectModal) return
    setActionId(rejectModal)
    try {
      await hrmService.rejectWorkModeRequest(rejectModal, { reason: rejectReason })
      toast.success('Request rejected')
      setRejectModal(null); setRejectReason('')
      load(page)
      publish(LIVE_TOPICS.CALENDAR)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject')
    }
    setActionId(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold flex-1" style={{ color: 'var(--text-heading)' }}>Work Mode Requests</h2>
        {['', 'pending', 'approved', 'rejected', 'cancelled', 'expired'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: statusFilter === s ? 'var(--accent)' : 'var(--bg-card)',
              color: statusFilter === s ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${statusFilter === s ? 'var(--accent)' : 'var(--border-card)'}`,
            }}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Home className="w-10 h-10 opacity-30" />
          <p className="text-sm">No work mode requests{statusFilter ? ` with status "${statusFilter}"` : ''}</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden"
             style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-alt)' }}>
                {['Employee','Mode','Period','Reason','Status','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                      style={{ color: 'var(--text-disabled)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((req, i) => {
                const sc = WMR_STATUS_COLOR[req.status] || { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' }
                return (
                  <tr key={req.id}
                      style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-row-alt)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>
                        {req.employee_name || req.employee_id}
                      </div>
                      {req.employee_code && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{req.employee_code}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm" style={{ color: 'var(--text-body)' }}>
                      {WMR_MODE_LABEL[req.work_mode] || req.work_mode}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>
                      {req.from_date} – {req.to_date}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-48 truncate" style={{ color: 'var(--text-muted)' }}
                        title={req.reason}>{req.reason}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={{ background: sc.bg, color: sc.color }}>{req.status}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {req.status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleApprove(req.id)}
                            disabled={actionId === req.id}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background: 'var(--bg-success)', color: 'var(--text-success)',
                              opacity: actionId === req.id ? 0.5 : 1 }}>
                            {actionId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Approve
                          </button>
                          <button onClick={() => { setRejectModal(req.id); setRejectReason('') }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      )}
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
                Page {page} of {pages} · {total} requests
              </span>
              <div className="flex gap-1">
                <button onClick={() => load(page - 1)} disabled={page <= 1}
                  className="p-1.5 rounded" style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                  <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => load(page + 1)} disabled={page >= pages}
                  className="p-1.5 rounded" style={{ opacity: page >= pages ? 0.4 : 1 }}>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setRejectModal(null)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
               style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-card)' }}
               onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-heading)' }}>Reject Request</h3>
            <label className="block space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Reason (optional)</span>
              <textarea className="input w-full text-sm" rows={3} value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why you are rejecting this request…" />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-2 rounded-xl text-sm border"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={actionId === rejectModal}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--color-danger, #EF4444)' }}>
                {actionId === rejectModal ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Attendance Exceptions Tab (HR/Owner) ──────────────────────────────────────

function ExceptionsTab() {
  const [list, setList]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [employees, setEmployees] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [page, setPage]         = useState(1)
  const [pages, setPages]       = useState(1)
  const [total, setTotal]       = useState(0)

  const loadList = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const r = await hrmService.listAttendanceExceptions({ page: pg, page_size: 20 })
      const d = r.data
      setList(d.items || [])
      setTotal(d.total || 0)
      setPages(d.pages || 1)
      setPage(pg)
    } catch { toast.error('Failed to load exceptions') }
    setLoading(false)
  }, [])

  useEffect(() => { loadList(1) }, [loadList])

  useEffect(() => {
    hrmService.listEmployees({ page_size: 200 })
      .then(r => setEmployees(r.data?.items || []))
      .catch(() => {})
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this exception?')) return
    setDeletingId(id)
    try {
      await hrmService.deleteAttendanceException(id)
      toast.success('Exception deleted')
      loadList(page)
    } catch { toast.error('Failed to delete') }
    setDeletingId(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Attendance Exceptions</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Grant temporary access windows — bypass geo fence or IP restriction for specific employees
          </p>
        </div>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}>
          <Plus className="w-4 h-4" /> New Exception
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <UserCheck className="w-10 h-10 opacity-30" />
          <p className="text-sm">No attendance exceptions configured</p>
          <p className="text-xs opacity-60">Click "New Exception" to grant a temporary access window</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden"
             style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-alt)' }}>
                  {['Employee','Reason','From','To','Allow Login','Bypass Geo','Bypass IP','Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: 'var(--text-disabled)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((ex, i) => {
                  const now = new Date()
                  const from = new Date(ex.from_datetime)
                  const to   = new Date(ex.to_datetime)
                  const isActive = now >= from && now <= to
                  const isExpired = now > to
                  return (
                    <tr key={ex.id}
                        style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-row-alt)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>
                          {ex.employee_name || ex.employee_id}
                        </div>
                        {isActive && (
                          <span className="text-xs font-medium" style={{ color: 'var(--text-success)' }}>● Active</span>
                        )}
                        {isExpired && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Expired</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-48 truncate" style={{ color: 'var(--text-muted)' }}
                          title={ex.reason}>{ex.reason}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>
                        {formatDateTime(ex.from_datetime)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-body)' }}>
                        {formatDateTime(ex.to_datetime)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ex.allow_login
                          ? <CheckCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--text-success)' }} />
                          : <XCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--text-danger)' }} />}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ex.bypass_geo_fence
                          ? <CheckCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--text-success)' }} />
                          : <XCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--text-muted)' }} />}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ex.bypass_ip_restriction
                          ? <CheckCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--text-success)' }} />
                          : <XCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--text-muted)' }} />}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => { setEditItem(ex); setShowModal(true) }}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}
                            title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(ex.id)} disabled={deletingId === ex.id}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)',
                              opacity: deletingId === ex.id ? 0.5 : 1 }}
                            title="Delete">
                            {deletingId === ex.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
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
                <button onClick={() => loadList(page - 1)} disabled={page <= 1}
                  className="p-1.5 rounded" style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                  <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => loadList(page + 1)} disabled={page >= pages}
                  className="p-1.5 rounded" style={{ opacity: page >= pages ? 0.4 : 1 }}>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ExceptionModal
          item={editItem}
          employees={employees}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSuccess={() => { loadList(page); setShowModal(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}

function ExceptionModal({ item, employees, onClose, onSuccess }) {
  const isEdit = !!item
  const [form, setForm] = useState({
    employee_id:           item?.employee_id           ?? '',
    reason:                item?.reason                ?? '',
    from_datetime:         item?.from_datetime         ? item.from_datetime.slice(0, 16) : '',
    to_datetime:           item?.to_datetime           ? item.to_datetime.slice(0, 16)   : '',
    allow_login:           item?.allow_login           ?? true,
    bypass_geo_fence:      item?.bypass_geo_fence      ?? false,
    bypass_ip_restriction: item?.bypass_ip_restriction ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ESC key closes modal
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (!form.employee_id) { setErr('Please select an employee'); return }
    if (!form.reason.trim()) { setErr('Reason is required'); return }
    if (!form.from_datetime || !form.to_datetime) { setErr('Both dates are required'); return }
    if (new Date(form.to_datetime) <= new Date(form.from_datetime)) {
      setErr('End time must be after start time'); return
    }
    setErr(''); setSaving(true)
    try {
      const payload = {
        ...form,
        from_datetime: new Date(form.from_datetime).toISOString(),
        to_datetime:   new Date(form.to_datetime).toISOString(),
      }
      if (isEdit) {
        await hrmService.updateAttendanceException(item.id, payload)
        toast.success('Exception updated')
      } else {
        await hrmService.createAttendanceException(payload)
        toast.success('Exception created')
      }
      onSuccess()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to save exception')
    }
    setSaving(false)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-modal, var(--bg-card))',
          border: '1px solid var(--border-card)',
          borderRadius: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 24,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
            {isEdit ? 'Edit Exception' : 'New Attendance Exception'}
          </h3>
          <button onClick={onClose}
            style={{ padding: 6, borderRadius: 8, border: 'none', background: 'var(--bg-alt)', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 0 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {err && (
          <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13,
            background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>{err}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Employee *</span>
            <select className="input" style={{ width: '100%', fontSize: 14 }} value={form.employee_id}
              onChange={e => set('employee_id', e.target.value)} disabled={isEdit}>
              <option value="">Select employee…</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} {emp.employee_code ? `(${emp.employee_code})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Reason *</span>
            <input type="text" className="input" style={{ width: '100%', fontSize: 14 }} value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder="e.g. Client visit, power outage, travelling…" />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>From *</span>
            <input type="datetime-local" className="input" style={{ width: '100%', fontSize: 14 }} value={form.from_datetime}
              onChange={e => set('from_datetime', e.target.value)} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>To *</span>
            <input type="datetime-local" className="input" style={{ width: '100%', fontSize: 14 }} value={form.to_datetime}
              onChange={e => set('to_datetime', e.target.value)} />
          </label>

          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', paddingTop: 4 }}>
            <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} checked={form.allow_login}
              onChange={e => set('allow_login', e.target.checked)} />
            <span style={{ fontSize: 14, color: 'var(--text-body)' }}>Allow login during this window</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} checked={form.bypass_geo_fence}
              onChange={e => set('bypass_geo_fence', e.target.checked)} />
            <span style={{ fontSize: 14, color: 'var(--text-body)' }}>Bypass Geo Fence</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} checked={form.bypass_ip_restriction}
              onChange={e => set('bypass_ip_restriction', e.target.checked)} />
            <span style={{ fontSize: 14, color: 'var(--text-body)' }}>Bypass IP Restriction</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 0.8s linear infinite' }} /> : null}
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GeoFenceTab() {
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const geoFenceApiError = (e, fallback) => {
    const detail = e?.response?.data?.detail
    if (typeof detail === 'string' && detail.trim() && !/unexpected error/i.test(detail)) return detail
    if (!e?.response) return 'Network unavailable. Please check your connection and try again.'
    return fallback
  }

  const load = useCallback(async () => {
    try { const r = await hrmService.getAttendanceSettings(); setCfg(r.data) }
    catch (e) { toast.error(geoFenceApiError(e, 'Unable to load Geo Fence settings. Please try again.')) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    // Client-side validation mirrors the backend's -90..90 / -180..180 / 10..10000 bounds
    if (cfg.geo_fence_enabled) {
      const lat = parseFloat(cfg.geo_fence_latitude)
      const lng = parseFloat(cfg.geo_fence_longitude)
      const rad = parseInt(cfg.geo_fence_radius_meters, 10)
      if (cfg.geo_fence_latitude === '' || cfg.geo_fence_latitude == null || Number.isNaN(lat) || lat < -90 || lat > 90) {
        toast.error('Office Latitude must be a number between -90 and 90.'); return
      }
      if (cfg.geo_fence_longitude === '' || cfg.geo_fence_longitude == null || Number.isNaN(lng) || lng < -180 || lng > 180) {
        toast.error('Office Longitude must be a number between -180 and 180.'); return
      }
      if (cfg.geo_fence_radius_meters === '' || Number.isNaN(rad) || rad < 10 || rad > 10000) {
        toast.error('Radius must be a number between 10 and 10,000 metres.'); return
      }
    }
    if (cfg.ip_restriction_enabled && (!cfg.approved_ips || cfg.approved_ips.length === 0)) {
      toast.error('IP Restriction is enabled but no IP addresses were added. Add an IP or turn it off.'); return
    }
    setSaving(true)
    try {
      // Coerce to real numbers only at save time — the inputs keep whatever
      // raw string the user is typing (see `set`) so backspace/clear/paste
      // behave like a normal input instead of snapping back to a default.
      const payload = {
        ...cfg,
        geo_fence_radius_meters: parseInt(cfg.geo_fence_radius_meters, 10) || 100,
        geo_fence_latitude:  cfg.geo_fence_latitude  === '' || cfg.geo_fence_latitude  == null ? null : parseFloat(cfg.geo_fence_latitude),
        geo_fence_longitude: cfg.geo_fence_longitude === '' || cfg.geo_fence_longitude == null ? null : parseFloat(cfg.geo_fence_longitude),
      }
      await hrmService.updateAttendanceSettings(payload)
      setCfg(payload)
      toast.success('Geo fence settings saved')
    } catch (e) {
      toast.error(geoFenceApiError(e, 'Geo Fence settings could not be saved. Please verify the entered values.'))
    }
    setSaving(false)
  }
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }))

  if (loading || !cfg) return (
    <div className="p-6"><div className="h-6 w-48 rounded animate-pulse" style={{ background: 'var(--bg-card-alt)' }} /></div>
  )

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Geo Fence Settings</h2>

      <div className="rounded-xl border p-5 space-y-4"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.geo_fence_enabled}
                 onChange={e => set('geo_fence_enabled', e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm font-medium" style={{ color: 'var(--text-body)' }}>
            Enable Geo Fence for Office Check-In
          </span>
        </label>
        {cfg.geo_fence_enabled && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <label className="space-y-1 col-span-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Radius (meters) — employees must be within this distance to check in
              </span>
              <input type="number" min={10} max={10000} value={cfg.geo_fence_radius_meters}
                     onChange={e => set('geo_fence_radius_meters', e.target.value)}
                     className="w-full rounded-lg px-3 py-2 text-sm"
                     style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Office Latitude (-90 to 90)</span>
              <input type="number" step="0.000001" min={-90} max={90} value={cfg.geo_fence_latitude ?? ''}
                     onChange={e => set('geo_fence_latitude', e.target.value)}
                     placeholder="e.g. 12.9716"
                     className="w-full rounded-lg px-3 py-2 text-sm"
                     style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Office Longitude (-180 to 180)</span>
              <input type="number" step="0.000001" min={-180} max={180} value={cfg.geo_fence_longitude ?? ''}
                     onChange={e => set('geo_fence_longitude', e.target.value)}
                     placeholder="e.g. 77.5946"
                     className="w-full rounded-lg px-3 py-2 text-sm"
                     style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
            </label>
          </div>
        )}
      </div>

      {/* IP Restriction */}
      <div className="rounded-xl border p-5 space-y-4"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>IP Restriction</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={cfg.ip_restriction_enabled}
                 onChange={e => set('ip_restriction_enabled', e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm" style={{ color: 'var(--text-body)' }}>
            Restrict office check-in to approved IP addresses
          </span>
        </label>
        {cfg.ip_restriction_enabled && (
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Approved IPs (one per line, CIDR notation supported)
            </span>
            <textarea rows={4}
              value={(cfg.approved_ips || []).join('\n')}
              onChange={e => set('approved_ips', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              placeholder="192.168.1.0/24&#10;10.0.0.1"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)', resize: 'vertical' }}
            />
          </label>
        )}
      </div>

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: 'var(--accent)' }}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Geo Fence Settings'}
      </button>
    </div>
  )
}

// ── Shifts Page (3 inner sub-tabs: Shifts / Shift Assignments / Shift Changes) ──

const SHIFT_SUBTABS = [
  { key: 'shifts',       label: 'Shifts',            icon: Clock },
  { key: 'assignments',  label: 'Shift Assignments',  icon: Users },
  { key: 'changes',      label: 'Shift Changes',      icon: RotateCcw },
]

function ShiftsPage() {
  const [sub, setSub] = useState('shifts')

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="px-6 pt-4 pb-0" style={{ background: 'var(--bg-page)' }}>
        <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {SHIFT_SUBTABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setSub(t.key)}
                className="px-4 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  color:      sub === t.key ? 'var(--text-link)' : 'var(--text-muted)',
                  background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
                }}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {sub === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                        style={{ background: 'var(--text-link)' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {sub === 'shifts'      && <ShiftManagement />}
        {sub === 'assignments' && <ShiftAssignmentsTab />}
        {sub === 'changes'     && <ShiftChangesTab />}
      </div>
    </div>
  )
}

export default function Attendance() {
  const { has } = usePermissions()
  const visibleTabs = TABS.filter(t => !t.perm || has(t.perm))
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-0" style={{ background: 'var(--bg-page)' }}>
        <div className="mb-4">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Attendance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Manage attendance, holidays, leave policies and shifts
          </p>
        </div>
        <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="px-4 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  color:      activeTab === tab.key ? 'var(--text-link)' : 'var(--text-muted)',
                  background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
                }}>
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                        style={{ background: 'var(--text-link)' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'dashboard'    && <DashboardTab />}
        {activeTab === 'calendar'     && <CalendarTab />}
        {activeTab === 'holidays'     && <HolidayManagement />}
        {activeTab === 'leave_policy' && <LeavePolicyManagement />}
        {activeTab === 'shifts'       && <ShiftsPage />}
        {activeTab === 'work_mode'    && <WorkModeTab />}
        {activeTab === 'exceptions'   && <ExceptionsTab />}
        {activeTab === 'geo_fence'    && <GeoFenceTab />}
        {activeTab === 'settings'     && <SettingsTab />}
      </div>
    </div>
  )
}
