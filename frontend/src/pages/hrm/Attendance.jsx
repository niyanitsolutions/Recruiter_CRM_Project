import React, { useState, useEffect, useCallback } from 'react'
import {
  Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Coffee,
  Users, Wifi, Activity, Settings, Save, Loader2, LogOut,
  CalendarDays, FileText, Shield, SlidersHorizontal,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import { usePermissions } from '../../hooks/usePermissions'
import hrmService from '../../services/hrmService'
import TableScroll from '../../components/common/TableScroll'
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
  present:  'Present',
  late:     'Late',
  absent:   'Absent',
  on_leave: 'On Leave',
  wfh:      'WFH',
  half_day: 'Half Day',
  holiday:  'Holiday',
  weekend:  'Weekend',
}

const STATUS_STYLE = {
  present:  { background: 'var(--bg-success)',  color: 'var(--text-success)' },
  late:     { background: 'var(--bg-warning)',  color: 'var(--text-warning)' },
  absent:   { background: 'var(--bg-danger)',   color: 'var(--text-danger)' },
  on_leave: { background: 'var(--bg-info)',     color: 'var(--text-info)' },
  wfh:      { background: 'var(--bg-info)',     color: 'var(--text-info)' },
  half_day: { background: 'var(--bg-warning)',  color: 'var(--text-warning)' },
  holiday:  { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' },
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

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: 'var(--accent)' }}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}

// ── Today's attendance tab ─────────────────────────────────────────────────────

function TodayTab() {
  const [records,  setRecords]  = useState([])
  const [stats,    setStats]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [checking, setChecking] = useState(null)
  const { has } = usePermissions()
  const canManage = has('hrm:attendance:manage')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recRes, statsRes] = await Promise.allSettled([
        hrmService.getTeamToday(),
        hrmService.getAttendanceTodayStats(),
      ])
      setRecords(recRes.status === 'fulfilled' ? (recRes.value.data || []) : [])
      setStats(statsRes.status === 'fulfilled' ? statsRes.value.data : null)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCheckIn = async (empId) => {
    setChecking(empId + '_in')
    try { await hrmService.checkIn({ employee_id: empId }); load() } catch {}
    setChecking(null)
  }

  const handleCheckOut = async (empId) => {
    setChecking(empId + '_out')
    try { await hrmService.checkOut({ employee_id: empId }); load() } catch {}
    setChecking(null)
  }

  const handleBreakStart = async (empId) => {
    setChecking(empId + '_brk_start')
    try {
      await hrmService.startBreak({ employee_id: empId })
      toast.success('Break started')
      load()
    } catch { toast.error('Failed to start break') }
    setChecking(null)
  }

  const handleBreakEnd = async (empId) => {
    setChecking(empId + '_brk_end')
    try {
      await hrmService.endBreak({ employee_id: empId })
      toast.success('Break ended')
      load()
    } catch { toast.error('Failed to end break') }
    setChecking(null)
  }

  const fmt = (dt) => dt
    ? new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—'

  const isOnBreak = (rec) => {
    const breaks = rec.breaks || []
    return breaks.length > 0 && !breaks[breaks.length - 1].end
  }

  // ── Summary cards — sourced from stats endpoint when available,
  //    fall back to computing from records array for non-managers.
  const S = stats || {}
  const totalEmp = S.total_employees ?? '—'
  const present  = S.present            ?? records.filter(r => r.check_in).length
  const absent   = S.absent             ?? '—'
  const curWork  = S.currently_working  ?? records.filter(r => r.check_in && !r.check_out).length
  const onBreak  = S.on_break           ?? records.filter(r => isOnBreak(r)).length
  const lateCount = S.late             ?? records.filter(r => r.is_late).length
  const halfDay  = S.half_day           ?? records.filter(r => r.is_half_day).length
  const onLeave  = S.on_leave           ?? records.filter(r => r.status === 'on_leave').length

  const CARDS = [
    { label: 'Total Employees',   value: totalEmp, icon: Users,        iconColor: 'text-blue-500' },
    { label: 'Present Today',     value: present,  icon: CheckCircle,  iconColor: 'text-green-500' },
    { label: 'Absent Today',      value: absent,   icon: XCircle,      iconColor: 'text-red-500' },
    { label: 'Currently Working', value: curWork,  icon: Activity,     iconColor: 'text-emerald-500' },
    { label: 'On Break',          value: onBreak,  icon: Coffee,       iconColor: 'text-yellow-500' },
    { label: 'Late Today',        value: lateCount, icon: AlertCircle, iconColor: 'text-orange-500' },
    { label: 'Half Day',          value: halfDay,  icon: Clock,        iconColor: 'text-purple-500' },
    { label: 'On Leave',          value: onLeave,  icon: Wifi,         iconColor: 'text-indigo-500' },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CARDS.map(c => (
          <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} iconColor={c.iconColor} />
        ))}
      </div>

      {/* Records table */}
      <div className="rounded-xl overflow-hidden"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                {['Employee', 'Status', 'Check In', 'Check Out', 'Break', 'Worked', ...(canManage ? ['Actions'] : [])].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}><td colSpan={canManage ? 7 : 6} className="px-4 py-3">
                    <div className="h-4 rounded animate-pulse" style={{ background: 'var(--bg-card-alt)' }} />
                  </td></tr>
                ))
              ) : records.length === 0 ? (
                <tr><td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center"
                        style={{ color: 'var(--text-muted)' }}>No attendance records for today</td></tr>
              ) : records.map(rec => {
                const onBrk = isOnBreak(rec)
                return (
                  <tr key={rec.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-heading)' }}>
                      {rec.employee_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={STATUS_STYLE[rec.status] ?? { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' }}>
                        {STATUS_LABEL[rec.status] ?? rec.status}
                        {rec.is_late && rec.late_by_minutes > 0 && ` (+${rec.late_by_minutes}m late)`}
                      </span>
                      {onBrk && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                          On Break
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{fmt(rec.check_in)}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{fmt(rec.check_out)}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {rec.total_break_minutes > 0 ? formatMinutes(rec.total_break_minutes) : '—'}
                      {rec.breaks && rec.breaks.length > 1
                        ? <span className="ml-1 text-xs opacity-60">({rec.breaks.length}x)</span>
                        : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {rec.check_out
                        ? <span className="font-semibold">{formatHours(rec.work_hours)}</span>
                        : rec.check_in
                        ? <span style={{ color: 'var(--text-success)' }}>Live</span>
                        : '—'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {!rec.check_in && (
                            <button disabled={checking === rec.employee_id + '_in'}
                              onClick={() => handleCheckIn(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium text-white"
                              style={{ background: 'var(--bg-success)' }}>
                              Check In
                            </button>
                          )}
                          {rec.check_in && !rec.check_out && !onBrk && (
                            <button disabled={checking === rec.employee_id + '_brk_start'}
                              onClick={() => handleBreakStart(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                              Break
                            </button>
                          )}
                          {rec.check_in && !rec.check_out && onBrk && (
                            <button disabled={checking === rec.employee_id + '_brk_end'}
                              onClick={() => handleBreakEnd(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
                              End Break
                            </button>
                          )}
                          {rec.check_in && !rec.check_out && (
                            <button disabled={checking === rec.employee_id + '_out'}
                              onClick={() => handleCheckOut(rec.employee_id)}
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
                              <span className="flex items-center gap-1">
                                <LogOut className="w-3 h-3" /> Out
                              </span>
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
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'dashboard',     label: 'Dashboard',            icon: Activity },
  { key: 'holidays',      label: 'Holiday Management',   icon: CalendarDays,       perm: 'hrm:attendance:team' },
  { key: 'leave_policy',  label: 'Leave Policies',       icon: FileText,           perm: 'hrm:attendance:team' },
  { key: 'shifts',        label: 'Shift Management',     icon: Clock,              perm: 'hrm:attendance:team' },
  { key: 'geo_fence',     label: 'Geo Fence',            icon: Shield,             perm: 'hrm:attendance:manage' },
  { key: 'settings',      label: 'Attendance Rules',     icon: SlidersHorizontal,  perm: 'hrm:attendance:manage' },
]

function GeoFenceTab() {
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try { const r = await hrmService.getAttendanceSettings(); setCfg(r.data) }
    catch { toast.error('Failed to load geo fence settings') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try { await hrmService.updateAttendanceSettings(cfg); toast.success('Geo fence settings saved') }
    catch { toast.error('Failed to save') }
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
                     onChange={e => set('geo_fence_radius_meters', parseInt(e.target.value) || 100)}
                     className="w-full rounded-lg px-3 py-2 text-sm"
                     style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Office Latitude</span>
              <input type="number" step="0.000001" value={cfg.geo_fence_latitude || ''}
                     onChange={e => set('geo_fence_latitude', parseFloat(e.target.value) || null)}
                     placeholder="e.g. 12.9716"
                     className="w-full rounded-lg px-3 py-2 text-sm"
                     style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Office Longitude</span>
              <input type="number" step="0.000001" value={cfg.geo_fence_longitude || ''}
                     onChange={e => set('geo_fence_longitude', parseFloat(e.target.value) || null)}
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
        {activeTab === 'dashboard'    && <TodayTab />}
        {activeTab === 'holidays'     && <HolidayManagement />}
        {activeTab === 'leave_policy' && <LeavePolicyManagement />}
        {activeTab === 'shifts'       && <ShiftManagement />}
        {activeTab === 'geo_fence'    && <GeoFenceTab />}
        {activeTab === 'settings'     && <SettingsTab />}
      </div>
    </div>
  )
}
