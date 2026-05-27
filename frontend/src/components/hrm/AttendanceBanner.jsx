/**
 * AttendanceBanner — persistent top banner showing punch-in/out status.
 *
 * Shows for ALL non-partner internal users:
 *   - Users with an employee profile: full punch-in/out + break controls.
 *   - Users without a profile: shows "Punch In" anyway; backend auto-creates
 *     a minimal employee profile on first punch-in (path 5 in _resolve_emp_id).
 *
 * Timer correctness:
 *   - Backend stores datetimes as naive UTC and _serialize appends 'Z' so
 *     new Date("...Z") always parses as UTC regardless of client timezone.
 *   - Work timer ticks every second (HH:MM:SS display).
 *   - Break timer runs independently while on break.
 *   - Net work time = gross elapsed − completed breaks − current break.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Clock, Coffee, LogOut, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import hrmService from '../../services/hrmService'
import PunchInModal from './PunchInModal'

const DISMISS_KEY = 'attendance_modal_dismissed'
const todayStr = () => new Date().toISOString().slice(0, 10)

// HH:MM:SS — used for live work/break timers
function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// "2h 30m" — used for completed work hours display (punch-out)
function formatHM(hours) {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Parse a datetime string from the API safely as UTC.
// Backend appends 'Z' via _serialize; this guard handles edge cases.
function parseUTC(str) {
  if (!str) return null
  const s = typeof str === 'string' && !str.endsWith('Z') && !str.includes('+')
    ? str + 'Z'
    : str
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export default function AttendanceBanner() {
  const user = useSelector(selectUser)

  const [record,        setRecord]        = useState(null)
  const [recordLoaded,  setRecordLoaded]  = useState(false)
  // resolvedEmpId: real employee ID, OR '__PENDING__' sentinel for users without profiles
  const [resolvedEmpId, setResolvedEmpId] = useState(null)
  const [showModal,     setShowModal]     = useState(false)
  const [loading,       setLoading]       = useState(false)

  // Live timers — tracked in refs + state for second-level precision
  const [workSecs,  setWorkSecs]  = useState(0)   // net work seconds
  const [breakSecs, setBreakSecs] = useState(0)   // current break seconds
  const workTimerRef  = useRef(null)
  const breakTimerRef = useRef(null)

  const isPartner = user?.userType === 'partner'

  // ── Load today's record ─────────────────────────────────────────────────────
  const loadRecord = useCallback(async () => {
    if (!user || isPartner) return
    try {
      const res  = await hrmService.getMyTodayAttendance()
      const data = res.data

      // null / non-object → no response (shouldn't normally happen)
      if (!data || typeof data !== 'object') {
        setResolvedEmpId(null)
        setRecord(null)
        return
      }

      // Backend returns { awaiting_profile: true } when no employee profile exists.
      // We show the banner anyway — profile auto-created on first punch-in.
      if (data.awaiting_profile) {
        setResolvedEmpId('__PENDING__')
        setRecord(null)
        return
      }

      setResolvedEmpId(data.employee_id || null)
      const hasRecord = !!(data.check_in || (data.id && data.id !== data.employee_id))
      setRecord(hasRecord ? data : null)
    } catch {
      // API error — fall back to JWT employee ID so banner stays visible
      const fallback = user?.hrmEmployeeId || null
      setResolvedEmpId(prev => prev || fallback || '__PENDING__')
      setRecord(null)
    } finally {
      setRecordLoaded(true)
    }
  }, [user, isPartner])

  // Initial load + 5-minute poll
  useEffect(() => {
    loadRecord()
    const id = setInterval(loadRecord, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadRecord])

  // ── Work timer (second-level) ───────────────────────────────────────────────
  useEffect(() => {
    if (workTimerRef.current) clearInterval(workTimerRef.current)

    const checkIn  = parseUTC(record?.check_in)
    const checkOut = parseUTC(record?.check_out)
    if (!checkIn || checkOut) { setWorkSecs(0); return }

    const completedBreakSecs = (record?.total_break_minutes || 0) * 60

    const tick = () => {
      const gross = (Date.now() - checkIn.getTime()) / 1000
      setWorkSecs(Math.max(0, gross - completedBreakSecs))
    }
    tick()
    workTimerRef.current = setInterval(tick, 1000)
    return () => clearInterval(workTimerRef.current)
  }, [record?.check_in, record?.check_out, record?.total_break_minutes])

  // ── Break timer (second-level) ──────────────────────────────────────────────
  const breaks    = record?.breaks || []
  const lastBreak = breaks.length > 0 ? breaks[breaks.length - 1] : null
  const onBreak   = !!(lastBreak && !lastBreak.end)

  useEffect(() => {
    if (breakTimerRef.current) clearInterval(breakTimerRef.current)
    if (!onBreak) { setBreakSecs(0); return }

    const breakStart = parseUTC(lastBreak?.start)
    if (!breakStart) { setBreakSecs(0); return }

    const tick = () => {
      setBreakSecs(Math.max(0, (Date.now() - breakStart.getTime()) / 1000))
      // Also keep work timer accurate while on break
      const checkIn = parseUTC(record?.check_in)
      if (checkIn) {
        const completedBreakSecs = (record?.total_break_minutes || 0) * 60
        const currentBreakSecs  = Math.max(0, (Date.now() - breakStart.getTime()) / 1000)
        const gross = (Date.now() - checkIn.getTime()) / 1000
        setWorkSecs(Math.max(0, gross - completedBreakSecs - currentBreakSecs))
      }
    }
    tick()
    breakTimerRef.current = setInterval(tick, 1000)
    return () => clearInterval(breakTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBreak, lastBreak?.start])

  // ── Auto-show punch-in modal once per day ───────────────────────────────────
  useEffect(() => {
    if (!recordLoaded || !resolvedEmpId) return
    if (record !== null) return
    if (localStorage.getItem(DISMISS_KEY) === todayStr()) return
    setShowModal(true)
  }, [recordLoaded, resolvedEmpId, record])

  // ── Auto punch-out at midnight ──────────────────────────────────────────────
  useEffect(() => {
    const checkIn  = parseUTC(record?.check_in)
    const checkOut = parseUTC(record?.check_out)
    if (!checkIn || checkOut) return
    const now      = new Date()
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0)
    const id = setTimeout(async () => {
      try {
        await hrmService.checkOut({})
        loadRecord()
        toast('Auto punch-out at midnight', { icon: '🌙' })
      } catch {}
    }, midnight.getTime() - now.getTime())
    return () => clearTimeout(id)
  }, [record?.check_in, record?.check_out, loadRecord])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, todayStr())
    setShowModal(false)
  }

  const handlePunchedIn = useCallback(() => {
    localStorage.removeItem(DISMISS_KEY)
    loadRecord()
  }, [loadRecord])

  const handlePunchOut = async () => {
    setLoading(true)
    try {
      const geo = await getGeo()
      await hrmService.checkOut({ ...geo })
      toast.success('Punched out. See you tomorrow!')
      loadRecord()
    } catch { toast.error('Punch out failed') }
    setLoading(false)
  }

  const handleStartBreak = async () => {
    setLoading(true)
    try {
      await hrmService.startBreak({})
      toast.success('Break started')
      loadRecord()
    } catch { toast.error('Failed to start break') }
    setLoading(false)
  }

  const handleEndBreak = async () => {
    setLoading(true)
    try {
      await hrmService.endBreak({})
      toast.success('Break ended')
      loadRecord()
    } catch { toast.error('Failed to end break') }
    setLoading(false)
  }

  // ── Render guard ─────────────────────────────────────────────────────────────
  // Hide for: not loaded, partner, or no resolved ID (truly no profile AND fallback unavailable)
  if (!recordLoaded || isPartner || !resolvedEmpId) return null

  const checkedIn  = !!record?.check_in
  const checkedOut = !!record?.check_out

  const checkInTime = parseUTC(record?.check_in)
  const checkInStr  = checkInTime
    ? checkInTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  const bannerStyle = checkedOut
    ? { background: 'var(--bg-card-alt)', color: 'var(--text-muted)',    borderBottom: '1px solid var(--border)' }
    : onBreak
    ? { background: 'var(--bg-warning)',  color: 'var(--text-warning)',  borderBottom: '1px solid var(--border)' }
    : checkedIn
    ? { background: 'var(--bg-success)',  color: 'var(--text-success)',  borderBottom: '1px solid var(--border)' }
    : { background: 'var(--bg-danger)',   color: 'var(--text-danger)',   borderBottom: '1px solid var(--border)' }

  return (
    <>
      <PunchInModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onDismiss={handleDismiss}
        onPunchedIn={handlePunchedIn}
      />

      <div className="w-full px-4 py-2 flex items-center gap-4 text-sm transition-colors" style={bannerStyle}>
        <Clock className="w-4 h-4 flex-shrink-0" />

        {checkedOut ? (
          /* ── Checked out state ── */
          <span>
            Punched out — worked{' '}
            <strong>{formatHM(record.work_hours)}</strong> today
            {record.is_late ? <span className="ml-2 text-xs opacity-75">(arrived late)</span> : null}
            {record.is_half_day ? <span className="ml-2 text-xs opacity-75">(half day)</span> : null}
          </span>

        ) : checkedIn ? (
          /* ── Checked in state ── */
          <>
            <span className="flex items-center gap-2 min-w-0">
              {onBreak
                ? <span>On break — <strong>{formatHMS(breakSecs)}</strong></span>
                : <>
                    Clocked in at <strong>{checkInStr}</strong>
                    <span className="font-mono font-semibold ml-1">{formatHMS(workSecs)}</span>
                  </>
              }
              {onBreak && (
                <span className="text-xs opacity-75 ml-1">
                  (net work: {formatHMS(workSecs)})
                </span>
              )}
            </span>

            {record.work_mode && record.work_mode !== 'office' && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-white/60 capitalize flex-shrink-0">
                {record.work_mode.replace('_', ' ')}
              </span>
            )}

            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {!onBreak ? (
                <button onClick={handleStartBreak} disabled={loading}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
                  style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                  <Coffee className="w-3.5 h-3.5" /> Break
                </button>
              ) : (
                <button onClick={handleEndBreak} disabled={loading}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
                  style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
                  <Clock className="w-3.5 h-3.5" /> End Break
                </button>
              )}
              <button onClick={handlePunchOut} disabled={loading}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
                style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Punch Out
              </button>
            </div>
          </>

        ) : (
          /* ── Not punched in state (includes awaiting_profile) ── */
          <>
            {resolvedEmpId === '__PENDING__' ? (
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                You haven&apos;t punched in today.
                <span className="text-xs opacity-70">(Profile will be created on first punch-in)</span>
              </span>
            ) : (
              <span>You haven&apos;t punched in today.</span>
            )}
            <button onClick={() => setShowModal(true)}
              className="ml-auto flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold text-white flex-shrink-0"
              style={{ background: 'var(--accent)' }}>
              <Clock className="w-3.5 h-3.5" /> Punch In
            </button>
          </>
        )}
      </div>
    </>
  )
}

async function getGeo() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve({}); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve({}),
      { timeout: 4000 }
    )
  })
}
