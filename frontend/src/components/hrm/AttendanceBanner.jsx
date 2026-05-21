/**
 * AttendanceBanner — persistent top banner showing punch-in/out status.
 * Shows for HRM users who have an employee record.
 * Auto-polls today's record every 5 minutes and handles auto-punch-out at midnight.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Clock, Coffee, LogOut, Loader2, MapPin } from 'lucide-react'
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
  const [record, setRecord]       = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [elapsed, setElapsed]     = useState(0)   // seconds since check_in

  const employeeId = user?.hrm_employee_id

  const loadRecord = useCallback(async () => {
    if (!employeeId) return
    try {
      const res = await hrmService.getTodayAttendance(employeeId)
      setRecord(res.data || null)
    } catch {}
  }, [employeeId])

  // Load on mount and every 5 minutes
  useEffect(() => {
    loadRecord()
    const id = setInterval(loadRecord, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadRecord])

  // Live elapsed timer
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

  // Auto-show punch-in modal on mount if no record and not dismissed today
  useEffect(() => {
    if (!employeeId || record !== null) return
    if (localStorage.getItem(DISMISS_KEY) === todayStr()) return
    setShowModal(true)
  }, [employeeId, record])

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
        await hrmService.checkOut({ employee_id: employeeId })
        loadRecord()
        toast('Auto punch-out at midnight', { icon: '🌙' })
      } catch {}
    }, msToMidnight)
    return () => clearTimeout(id)
  }, [record?.check_in, record?.check_out, employeeId])

  const handlePunchOut = async () => {
    setLoading(true)
    try {
      const geo = await getGeo()
      await hrmService.checkOut({ employee_id: employeeId, ...geo })
      toast.success('Punched out. See you tomorrow!')
      loadRecord()
    } catch { toast.error('Punch out failed') }
    setLoading(false)
  }

  const handleStartBreak = async () => {
    setLoading(true)
    try {
      await hrmService.startBreak({ employee_id: employeeId })
      toast.success('Break started')
      loadRecord()
    } catch { toast.error('Failed') }
    setLoading(false)
  }

  const handleEndBreak = async () => {
    setLoading(true)
    try {
      await hrmService.endBreak({ employee_id: employeeId })
      toast.success('Break ended')
      loadRecord()
    } catch { toast.error('Failed') }
    setLoading(false)
  }

  if (!employeeId) return null

  const onBreak = record?.breaks?.length > 0 && !record.breaks[record.breaks.length - 1]?.end
  const checkedIn = !!record?.check_in
  const checkedOut = !!record?.check_out

  const elapsedHours = elapsed / 3600
  const workHoursDisplay = checkedOut ? record.work_hours : elapsedHours

  return (
    <>
      <PunchInModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onDismiss={handleDismiss}
        onPunchedIn={handlePunchedIn}
        employeeId={employeeId}
      />

      <div className={`w-full px-4 py-2 flex items-center gap-4 text-sm transition-colors ${
        checkedOut   ? 'bg-gray-100 text-gray-600' :
        onBreak      ? 'bg-amber-50 text-amber-800 border-b border-amber-200' :
        checkedIn    ? 'bg-green-50 text-green-800 border-b border-green-200' :
                       'bg-red-50 text-red-800 border-b border-red-200'
      }`}>
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
                  className="flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium">
                  <Coffee className="w-3.5 h-3.5" /> Break
                </button>
              ) : (
                <button onClick={handleEndBreak} disabled={loading}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 text-xs font-medium">
                  <Clock className="w-3.5 h-3.5" /> End Break
                </button>
              )}
              <button onClick={handlePunchOut} disabled={loading}
                className="flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Punch Out
              </button>
            </div>
          </>
        ) : (
          <>
            <span>You haven't punched in today.</span>
            <button onClick={() => setShowModal(true)}
              className="ml-auto flex items-center gap-1 px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-xs font-semibold">
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
