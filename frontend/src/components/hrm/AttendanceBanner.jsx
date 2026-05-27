/**
 * AttendanceBanner — persistent top banner showing punch-in/out status.
 * Shows for any user that has a linked employee profile (resolved server-side).
 * Does NOT depend on hrmEmployeeId being in the JWT — uses /me/today endpoint
 * which resolves the employee link via JWT → DB → email match.
 * Auto-polls every 5 minutes and handles auto-punch-out at midnight.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Clock, Coffee, LogOut, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import hrmService from '../../services/hrmService'
import PunchInModal from './PunchInModal'

const DISMISS_KEY = 'attendance_modal_dismissed'
const todayStr = () => new Date().toISOString().slice(0, 10)

function formatDuration(hours) {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function AttendanceBanner() {
  const user = useSelector(selectUser)

  const [record,          setRecord]          = useState(null)
  const [recordLoaded,    setRecordLoaded]    = useState(false)
  const [resolvedEmpId,   setResolvedEmpId]   = useState(null)  // from /me/today response
  const [showModal,       setShowModal]       = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [elapsed,         setElapsed]         = useState(0)     // seconds since check_in

  // Only internal users (non-partner) can have employee profiles
  const isPartner = user?.userType === 'partner'

  const loadRecord = useCallback(async () => {
    if (!user || isPartner) return
    try {
      const res = await hrmService.getMyTodayAttendance()
      const data = res.data

      // null = no employee profile exists for this user
      if (!data || typeof data !== 'object') {
        setResolvedEmpId(null)
        setRecord(null)
        return
      }

      // Always store the resolved employee ID (present even when not punched in)
      setResolvedEmpId(data.employee_id || null)

      // An attendance record exists when check_in is set (or record has an id)
      const hasRecord = !!(data.check_in || (data.id && data.id !== data.employee_id))
      setRecord(hasRecord ? data : null)
    } catch {
      // API failed — fall back to JWT employee ID so banner still shows
      const fallbackEmpId = user?.hrmEmployeeId || null
      setResolvedEmpId(prev => prev || fallbackEmpId)
      setRecord(null)
    } finally {
      setRecordLoaded(true)
    }
  }, [user, isPartner])

  // Load on mount and every 5 minutes
  useEffect(() => {
    loadRecord()
    const id = setInterval(loadRecord, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadRecord])

  // Live elapsed timer — ticks every minute while punched in
  useEffect(() => {
    if (!record?.check_in || record?.check_out) return
    const update = () => {
      const diff = (Date.now() - new Date(record.check_in).getTime()) / 1000
      setElapsed(Math.max(0, diff))
    }
    update()
    const id = setInterval(update, 60 * 1000)
    return () => clearInterval(id)
  }, [record?.check_in, record?.check_out])

  // Auto-show punch-in modal only AFTER API confirms: employee exists + no record today
  useEffect(() => {
    if (!recordLoaded || !resolvedEmpId) return  // wait for API
    if (record !== null) return                   // already has activity today
    if (localStorage.getItem(DISMISS_KEY) === todayStr()) return
    setShowModal(true)
  }, [recordLoaded, resolvedEmpId, record])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, todayStr())
    setShowModal(false)
  }

  const handlePunchedIn = useCallback(() => {
    localStorage.removeItem(DISMISS_KEY)
    loadRecord()
  }, [loadRecord])

  // Auto punch-out at midnight
  useEffect(() => {
    if (!record?.check_in || record?.check_out) return
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    const msToMidnight = midnight.getTime() - now.getTime()
    const id = setTimeout(async () => {
      try {
        // Backend resolves employee_id from JWT/DB — no need to pass it
        await hrmService.checkOut({})
        loadRecord()
        toast('Auto punch-out at midnight', { icon: '🌙' })
      } catch {}
    }, msToMidnight)
    return () => clearTimeout(id)
  }, [record?.check_in, record?.check_out])

  const handlePunchOut = async () => {
    setLoading(true)
    try {
      const geo = await getGeo()
      // Backend resolves employee_id — only pass geo
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
    } catch { toast.error('Failed') }
    setLoading(false)
  }

  const handleEndBreak = async () => {
    setLoading(true)
    try {
      await hrmService.endBreak({})
      toast.success('Break ended')
      loadRecord()
    } catch { toast.error('Failed') }
    setLoading(false)
  }

  // Hide if: not loaded yet, partner account, or no employee profile
  if (!recordLoaded || isPartner || !resolvedEmpId) return null

  const onBreak    = record?.breaks?.length > 0 && !record.breaks[record.breaks.length - 1]?.end
  const checkedIn  = !!record?.check_in
  const checkedOut = !!record?.check_out

  const elapsedHours = elapsed / 3600
  const workHoursDisplay = checkedOut ? record.work_hours : elapsedHours

  const bannerStyle = checkedOut
    ? { background: 'var(--bg-card-alt)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }
    : onBreak
    ? { background: 'var(--bg-warning)', color: 'var(--text-warning)', borderBottom: '1px solid var(--border)' }
    : checkedIn
    ? { background: 'var(--bg-success)', color: 'var(--text-success)', borderBottom: '1px solid var(--border)' }
    : { background: 'var(--bg-danger)', color: 'var(--text-danger)', borderBottom: '1px solid var(--border)' }

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
          <span>Punched out — worked <strong>{formatDuration(record.work_hours)}</strong> today{record.is_half_day ? ' (half day)' : ''}</span>
        ) : checkedIn ? (
          <>
            <span>
              {onBreak ? 'On break · ' : ''}
              Clocked in at <strong>{new Date(record.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong>
              {!onBreak && <> · <strong>{formatDuration(workHoursDisplay)}</strong> so far</>}
            </span>
            {record.work_mode && record.work_mode !== 'office' && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-white/60 capitalize">{record.work_mode.replace('_', ' ')}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!onBreak ? (
                <button onClick={handleStartBreak} disabled={loading}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                  style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                  <Coffee className="w-3.5 h-3.5" /> Break
                </button>
              ) : (
                <button onClick={handleEndBreak} disabled={loading}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                  style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
                  <Clock className="w-3.5 h-3.5" /> End Break
                </button>
              )}
              <button onClick={handlePunchOut} disabled={loading}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Punch Out
              </button>
            </div>
          </>
        ) : (
          <>
            <span>You haven't punched in today.</span>
            <button onClick={() => setShowModal(true)}
              className="ml-auto flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold text-white"
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
