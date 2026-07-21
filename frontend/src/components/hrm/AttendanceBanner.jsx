/**
 * AttendanceBanner — persistent top banner showing punch-in/out status.
 *
 * Shows for ALL non-partner internal users.
 *
 * Timer correctness:
 *   - Backend stores datetimes as naive UTC and _serialize appends 'Z' so
 *     new Date("...Z") always parses as UTC regardless of client timezone.
 *   - Work timer ticks every second (HH:MM:SS display).
 *   - Break timer runs independently while on break.
 *   - Net work time = gross elapsed − completed breaks − current break.
 *
 * Timer fix (Issue 1):
 *   - After a successful punch-in, the check-in API response is used directly
 *     to set the record state — no second round-trip to /me/today.
 *     This eliminates the race condition where the extra GET could return stale
 *     data before MongoDB propagates the write.
 *
 * Leave/holiday/weekend suppression (Issue 2):
 *   - /me/today now returns is_holiday, is_weekend, is_on_leave, and leave fields.
 *   - The punch-in modal is not shown for any of these conditions.
 *   - A context-aware status message is shown in the banner instead.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Clock, Coffee, LogOut, Loader2, AlertCircle, Calendar, Sun, Umbrella } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import hrmService from '../../services/hrmService'
import { getTenantTimezone } from '../../utils/format'
import PunchInModal from './PunchInModal'
import { publish, LIVE_TOPICS } from '../../utils/liveUpdateBus'

// The punch-in popup's visibility is derived from today's attendance record
// (backend truth: record.check_in) combined with two dismissal signals:
//   - "X" (close icon)     — transient, in-memory only. Reappears on refresh,
//                            navigation, or re-login while not yet punched in.
//   - "Remind me later"    — persisted per user for the current (tenant) day
//                            via localStorage, so it survives refresh/hard
//                            refresh/logout/login. It resets automatically
//                            once the tenant-local calendar day changes.
// Neither ever reappears once the user has actually punched in.
const REMIND_LATER_KEY_PREFIX = 'punchin_remind_later_'

function remindLaterKey(userId) {
  return `${REMIND_LATER_KEY_PREFIX}${userId || 'anon'}`
}

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

// Tenant-local calendar date as YYYY-MM-DD — used to scope the "remind me
// later" dismissal to the current day (not the browser's UTC day).
function tenantToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: getTenantTimezone() })
}

function leaveTypeLabel(lt) {
  if (!lt) return 'Leave'
  return lt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function AttendanceBanner() {
  const user = useSelector(selectUser)
  const location = useLocation()

  const [record,        setRecord]        = useState(null)
  const [recordLoaded,  setRecordLoaded]  = useState(false)
  // resolvedEmpId: real employee ID, OR '__PENDING__' sentinel for users without profiles
  const [resolvedEmpId, setResolvedEmpId] = useState(null)
  const [showModal,     setShowModal]     = useState(false)
  const [loading,       setLoading]       = useState(false)
  // Transient (in-memory) — hides the popup for the current view only. Reset on
  // navigation so the reminder reappears until the user actually punches in.
  // Set by BOTH "X" and "Remind me later" (both close the popup immediately);
  // only "Remind me later" additionally sets `remindedToday` below.
  const [dismissed,     setDismissed]     = useState(false)
  // Persisted (localStorage) — true once "Remind me later" has been clicked
  // for the current tenant-local day. Survives refresh/logout/login; never
  // set by "X". Re-derived whenever the logged-in user becomes known.
  const [remindedToday, setRemindedToday] = useState(false)
  // True when the last /me/today load failed — we then can't confirm punch-in
  // status, so we must NOT nag with the popup (prevents the false popup on a
  // network blip / reconnect after the user already punched in).
  const [loadErrored,   setLoadErrored]   = useState(false)

  // Today's context — determines whether to show punch-in modal
  const [isHoliday,   setIsHoliday]   = useState(false)
  const [holidayName, setHolidayName] = useState(null)
  const [isWeekend,   setIsWeekend]   = useState(false)
  const [leaveInfo,   setLeaveInfo]   = useState(null)  // approved leave doc or null

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
      setLoadErrored(false)
      const data = res.data

      if (!data || typeof data !== 'object') {
        setResolvedEmpId(null)
        setRecord(null)
        setLeaveInfo(null)
        return
      }

      // Backend returns { awaiting_profile: true } when no employee profile exists.
      if (data.awaiting_profile) {
        setResolvedEmpId('__PENDING__')
        setRecord(null)
        setLeaveInfo(null)
        return
      }

      setResolvedEmpId(data.employee_id || null)

      // Extract leave/holiday/weekend context from the extended /me/today response
      setIsHoliday(!!data.is_holiday)
      setHolidayName(data.holiday_name || null)
      setIsWeekend(!!data.is_weekend)
      setLeaveInfo(data.is_on_leave ? (data.leave || null) : null)

      const hasRecord = !!(data.check_in || (data.id && data.id !== data.employee_id))
      setRecord(hasRecord ? data : null)
    } catch {
      setLoadErrored(true)
      // API error — fall back to JWT employee ID so banner stays visible
      const fallback = user?.hrmEmployeeId || null
      setResolvedEmpId(prev => prev || fallback || '__PENDING__')
      setRecord(null)
      setLeaveInfo(null)
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

  // Re-derive the persisted "remind me later" flag whenever the user changes
  // (login/logout/switch account on the same browser).
  useEffect(() => {
    if (!user?.id) { setRemindedToday(false); return }
    setRemindedToday(localStorage.getItem(remindLaterKey(user.id)) === tenantToday())
  }, [user?.id])

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

  // ── Auto-show punch-in modal — driven purely by today's attendance record ───
  // Show ONLY when we can positively confirm the user has NOT punched in today.
  // Never show if: still loading, no real employee profile, the load errored
  // (status unknown), already punched in (record.check_in), a non-working day
  // (holiday/weekend/approved leave), dismissed via X in this view, or
  // "remind me later" was clicked earlier today (persisted).
  useEffect(() => {
    if (!recordLoaded || !resolvedEmpId || resolvedEmpId === '__PENDING__') return
    if (loadErrored) return                              // status unknown — don't nag
    if (record?.check_in) return                         // punched in today (backend truth)
    if (isHoliday || isWeekend || leaveInfo) return      // no punch needed today
    if (dismissed) return                                // transiently dismissed this view
    if (remindedToday) return                            // "remind me later" for today
    setShowModal(true)
  }, [recordLoaded, resolvedEmpId, record, isHoliday, isWeekend, leaveInfo, loadErrored, dismissed, remindedToday])

  // Reset the transient dismiss when the route changes, so the reminder popup
  // reappears on navigation while the user has still not punched in (spec:
  // Refresh / Navigate / Re-login all bring it back until Punch In succeeds).
  useEffect(() => {
    setDismissed(false)
  }, [location.pathname])

  // ── Auto punch-out at midnight (client-side safety net) ─────────────────────
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
        publish(LIVE_TOPICS.ATTENDANCE); publish(LIVE_TOPICS.DASHBOARD)
        toast('Auto punch-out at midnight', { icon: '🌙' })
      } catch {}
    }, midnight.getTime() - now.getTime())
    return () => clearTimeout(id)
  }, [record?.check_in, record?.check_out, loadRecord])

  // "X" (close icon) — hide for THIS view only, no persistence. The small
  // attendance status widget stays visible; the popup returns on the next
  // navigation/refresh/re-login while the user has still not punched in.
  const handleClose = () => {
    setDismissed(true)
    setShowModal(false)
  }

  // "Remind me later" — hide the popup for the rest of the current tenant-
  // local day. Persisted so it survives refresh/hard refresh/logout/login;
  // it is NOT a punch-in, and the dashboard Punch In button/status widget
  // remains fully visible and functional throughout.
  const handleRemindLater = () => {
    if (user?.id) {
      localStorage.setItem(remindLaterKey(user.id), tenantToday())
    }
    setRemindedToday(true)
    setDismissed(true)
    setShowModal(false)
  }

  // After a successful punch-in:
  //   1. Optimistically update the record from the API response when check_in is present
  //      (office, WFH, hybrid, field all use the same logic — no mode-specific branching).
  //   2. Always reload from server after 1.5 s as a reconciliation step.
  //      The delay handles MongoDB replica-set replication lag: the primary write is
  //      committed before the response arrives, but a secondary used for reads may not
  //      have caught up yet.  1.5 s covers all observed replication windows in production.
  const handlePunchedIn = useCallback((checkInData) => {
    setDismissed(false)
    setRemindedToday(false)
    if (user?.id) localStorage.removeItem(remindLaterKey(user.id))
    if (checkInData && checkInData.check_in) {
      // Immediate optimistic update — timer and dashboard update at once
      setRecord(checkInData)
      if (checkInData.employee_id) {
        setResolvedEmpId(checkInData.employee_id)
      }
    }
    // Reconcile from server for ALL work modes after a short delay.
    // Covers replica-set lag, any edge case where the direct response lacked
    // check_in, and keeps ESS + attendance page in sync without a page refresh.
    setTimeout(() => loadRecord(), 1500)
    publish(LIVE_TOPICS.ATTENDANCE); publish(LIVE_TOPICS.DASHBOARD)
  }, [loadRecord, user?.id])

  const handlePunchOut = async () => {
    setLoading(true)
    try {
      const geo = await getGeo()
      await hrmService.checkOut({ ...geo })
      toast.success('Punched out. See you tomorrow!')
      loadRecord()
      publish(LIVE_TOPICS.ATTENDANCE); publish(LIVE_TOPICS.DASHBOARD)
    } catch { toast.error('Punch out failed') }
    setLoading(false)
  }

  const handleStartBreak = async () => {
    setLoading(true)
    try {
      await hrmService.startBreak({})
      toast.success('Break started')
      loadRecord()
    } catch (err) {
      // Surfaces the configured break-limit message from the backend
      toast.error(err?.response?.data?.detail || 'Failed to start break')
    }
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
  if (!recordLoaded || isPartner || !resolvedEmpId) return null

  const checkedIn  = !!record?.check_in
  const checkedOut = !!record?.check_out

  const checkInTime = parseUTC(record?.check_in)
  const checkInStr  = checkInTime
    ? checkInTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: getTenantTimezone() })
    : null

  const pillStyle = checkedOut
    ? { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' }
    : onBreak
    ? { background: 'var(--bg-warning)',  color: 'var(--text-warning)' }
    : checkedIn
    ? { background: 'var(--bg-success)',  color: 'var(--text-success)' }
    : leaveInfo
    ? { background: 'var(--bg-info)',     color: 'var(--text-info)' }
    : isHoliday
    ? { background: 'var(--bg-info)',     color: 'var(--text-info)' }
    : isWeekend
    ? { background: 'var(--bg-card-alt)', color: 'var(--text-muted)' }
    : { background: 'var(--bg-danger)',   color: 'var(--text-danger)' }

  // Compact header widget — fits inline in TopBar (Part of Task 1: attendance
  // moved out of its own full-width row so dashboard content starts right
  // below the header).
  return (
    <>
      <PunchInModal
        isOpen={showModal}
        onClose={handleClose}
        onDismiss={handleRemindLater}
        onPunchedIn={handlePunchedIn}
      />

      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors flex-shrink-0"
        style={pillStyle}
        title={checkedOut ? `Worked ${formatHM(record.work_hours)} today` : undefined}
      >
        <Clock className="w-3.5 h-3.5 flex-shrink-0" />

        {checkedOut ? (
          <span className="whitespace-nowrap">Worked <strong>{formatHM(record.work_hours)}</strong></span>

        ) : checkedIn ? (
          <>
            {onBreak ? (
              <span className="whitespace-nowrap">On break <strong className="font-mono">{formatHMS(breakSecs)}</strong></span>
            ) : (
              <span className="font-mono font-semibold whitespace-nowrap">{formatHMS(workSecs)}</span>
            )}
            {!onBreak ? (
              <button onClick={handleStartBreak} disabled={loading}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
                style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                <Coffee className="w-3 h-3" /> Break
              </button>
            ) : (
              <button onClick={handleEndBreak} disabled={loading}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
                style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
                <Clock className="w-3 h-3" /> End
              </button>
            )}
            <button onClick={handlePunchOut} disabled={loading}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
              style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
              Punch Out
            </button>
          </>

        ) : leaveInfo ? (
          <span className="whitespace-nowrap" title={`${leaveInfo.from_date} – ${leaveInfo.to_date}`}>
            <Calendar className="w-3.5 h-3.5 inline mr-1" />On {leaveTypeLabel(leaveInfo.leave_type)}
          </span>

        ) : isHoliday ? (
          <span className="whitespace-nowrap" title={holidayName}>
            <Sun className="w-3.5 h-3.5 inline mr-1" />Holiday
          </span>

        ) : isWeekend ? (
          <span className="whitespace-nowrap">
            <Umbrella className="w-3.5 h-3.5 inline mr-1" />Weekend
          </span>

        ) : (
          <>
            {resolvedEmpId === '__PENDING__' && (
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap"
              style={{ background: 'var(--accent)' }}>
              <Clock className="w-3 h-3" /> Punch In
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
