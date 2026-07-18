import { useMemo, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addWeeks, subWeeks, isSameMonth, isSameDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, X } from 'lucide-react'
import { useLocalization } from '../../hooks/useLocalization'
import ModalPortal from '../common/ModalPortal'

/**
 * Reusable company calendar grid — month/week view, month/year selectors,
 * Today/Prev/Next navigation, click-a-day event popup. Purely presentational:
 * the host page fetches events (via hrmService.getCalendarEvents) and passes
 * them in; all visibility/permission filtering already happened server-side,
 * so every event passed here is safe to render as-is.
 */
const TYPE_STYLE = {
  holiday:       { color: '#3b82f6', label: 'Holiday' },
  leave:         { color: '#8b5cf6', label: 'Leave' },
  wfh:           { color: '#10b981', label: 'WFH' },
  shift_change:  { color: '#f59e0b', label: 'Shift Change' },
  company_event: { color: '#6366f1', label: 'Company Event' },
}

// Company events carry a per-event color; everything else uses its type color.
function evColor(ev) {
  if (ev.type === 'company_event' && ev.meta?.color) return ev.meta.color
  return TYPE_STYLE[ev.type]?.color || '#94a3b8'
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function eventLabel(ev) {
  if (ev.type === 'holiday' || ev.type === 'company_event') return ev.title
  const who = ev.employee_name ? `${ev.employee_name} — ` : ''
  return `${who}${ev.title}`
}

function eventTooltip(ev) {
  if (ev.type === 'holiday') {
    return `${ev.title}${ev.meta?.holiday_type ? ` (${capitalize(ev.meta.holiday_type)})` : ''}`
  }
  if (ev.type === 'company_event') {
    return `${ev.title}${ev.meta?.location ? ` @ ${ev.meta.location}` : ''}`
  }
  return `${ev.employee_name || 'Employee'} — ${ev.title}`
}

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Local calendar-date key ("YYYY-MM-DD") for a browser-local Date object.
 *
 * Deliberately NOT `date.toISOString().slice(0, 10)` — toISOString() converts
 * to UTC first, which silently shifts the date back a day for any positive
 * UTC-offset timezone (e.g. India). A calendar grid cell is a plain calendar
 * date, not an instant, so it must be read via local getters only.
 */
function toDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function eventsForDay(events, day) {
  const key = toDateKey(day)
  return events.filter(ev => {
    const start = ev.date_start
    const end = ev.date_end || ev.date_start
    return start && key >= start && key <= end
  })
}

// ── Event detail popup (day click) ──────────────────────────────────────────

function EventDetailRow({ ev, fmtDate }) {
  const style = TYPE_STYLE[ev.type] || { color: '#94a3b8', label: ev.type }
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-hover)', borderLeft: `3px solid ${evColor(ev)}` }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-heading)' }}>{style.label}</span>
      </div>
      {ev.type === 'holiday' && (
        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p className="font-medium" style={{ color: 'var(--text-heading)' }}>{ev.title}</p>
          {ev.meta?.holiday_type && <p>Type: {capitalize(ev.meta.holiday_type)}</p>}
          {ev.meta?.description && <p>{ev.meta.description}</p>}
          <p>{ev.meta?.is_paid === false ? 'Unpaid' : 'Paid'} · {ev.meta?.is_recurring ? 'Recurring annually' : 'One-time'}</p>
        </div>
      )}
      {ev.type === 'leave' && (
        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p className="font-medium" style={{ color: 'var(--text-heading)' }}>{ev.employee_name || 'Employee'}</p>
          <p>Leave Type: {ev.title}</p>
          <p>From: {fmtDate(ev.date_start)} · To: {fmtDate(ev.date_end)}</p>
          {ev.meta?.total_days != null && <p>Duration: {ev.meta.total_days} day{ev.meta.total_days === 1 ? '' : 's'}</p>}
          <p>Status: Approved</p>
        </div>
      )}
      {ev.type === 'wfh' && (
        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p className="font-medium" style={{ color: 'var(--text-heading)' }}>{ev.employee_name || 'Employee'}</p>
          <p>Mode: {ev.title}</p>
          <p>From: {fmtDate(ev.date_start)} · To: {fmtDate(ev.date_end)}</p>
        </div>
      )}
      {ev.type === 'shift_change' && (
        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p className="font-medium" style={{ color: 'var(--text-heading)' }}>{ev.employee_name || 'Employee'}</p>
          <p>Effective From: {fmtDate(ev.date_start)} · To: {fmtDate(ev.date_end)}</p>
        </div>
      )}
      {ev.type === 'company_event' && (
        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <p className="font-medium" style={{ color: 'var(--text-heading)' }}>{ev.title}</p>
          {ev.meta?.description && <p>{ev.meta.description}</p>}
          <p>
            {fmtDate(ev.date_start)}{ev.date_end && ev.date_end !== ev.date_start ? ` · to ${fmtDate(ev.date_end)}` : ''}
            {!ev.meta?.all_day && ev.meta?.start_time ? ` · ${ev.meta.start_time}${ev.meta?.end_time ? `–${ev.meta.end_time}` : ''}` : ' · All day'}
          </p>
          {ev.meta?.location && <p>Location: {ev.meta.location}</p>}
          {ev.meta?.meeting_link && (
            <p>
              Meeting:{' '}
              <a href={ev.meta.meeting_link} target="_blank" rel="noopener noreferrer"
                 className="underline" style={{ color: evColor(ev) }}>
                Join link
              </a>
            </p>
          )}
          {ev.meta?.repeat && ev.meta.repeat !== 'none' && <p>Repeats: {capitalize(ev.meta.repeat)}</p>}
          {ev.meta?.created_by_name && <p style={{ color: 'var(--text-muted)' }}>By {ev.meta.created_by_name}</p>}
        </div>
      )}
    </div>
  )
}

function DayEventsModal({ day, events, onClose, fmtDate }) {
  return (
    <ModalPortal isOpen={!!day}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{day ? fmtDate(day) : ''}</h3>
            <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No events on this day.</p>
          ) : (
            <div className="space-y-2">
              {events.map(ev => <EventDetailRow key={ev.id} ev={ev} fmtDate={fmtDate} />)}
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Loading skeleton (initial load only) ────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1 px-4 pb-4">
      {Array.from({ length: 35 }, (_, i) => (
        <div key={i} className="rounded-lg min-h-[64px] animate-pulse" style={{ background: 'var(--bg-hover)' }} />
      ))}
    </div>
  )
}

export default function CompanyCalendar({ events = [], loading = false, month, onMonthChange, view = 'month', onViewChange }) {
  const { fmtDate } = useLocalization()
  const [selectedDay, setSelectedDay] = useState(null)

  const gridDays = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(month, { weekStartsOn: 1 })
      const end = endOfWeek(month, { weekStartsOn: 1 })
      return eachDayOfInterval({ start, end })
    }
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month, view])

  const yearOptions = useMemo(() => {
    const nowYear = new Date().getFullYear()
    const years = []
    for (let y = nowYear - 10; y <= nowYear + 2; y++) years.push(y)
    return years
  }, [])

  const goToday = () => onMonthChange(new Date())
  const goPrev = () => onMonthChange(view === 'week' ? subWeeks(month, 1) : subMonths(month, 1))
  const goNext = () => onMonthChange(view === 'week' ? addWeeks(month, 1) : addMonths(month, 1))
  const setMonthIndex = (idx) => onMonthChange(new Date(month.getFullYear(), idx, 1))
  const setYear = (yr) => onMonthChange(new Date(yr, month.getMonth(), 1))

  const dayEvents = selectedDay ? eventsForDay(events, selectedDay) : []
  const isInitialLoading = loading && events.length === 0

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      {/* Header — nav + month/year selectors + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={goPrev} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} aria-label="Previous">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={month.getMonth()}
            onChange={e => setMonthIndex(Number(e.target.value))}
            className="text-xs font-semibold rounded-lg px-2 py-1.5"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-heading)', border: '1px solid var(--border)' }}
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            value={month.getFullYear()}
            onChange={e => setYear(Number(e.target.value))}
            className="text-xs font-semibold rounded-lg px-2 py-1.5"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-heading)', border: '1px solid var(--border)' }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={goNext} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} aria-label="Next">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            Today
          </button>
        </div>
        <div className="flex items-center gap-1">
          {['month', 'week'].map(v => (
            <button key={v} onClick={() => onViewChange?.(v)}
              className="px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors"
              style={{
                background: view === v ? 'var(--accent)' : 'transparent',
                color: view === v ? '#fff' : 'var(--text-muted)',
              }}>
              {v}
            </button>
          ))}
          {loading && !isInitialLoading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 pt-3">
        {Object.entries(TYPE_STYLE).map(([key, s]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 px-2 sm:px-4 pt-3 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-[10px] sm:text-xs font-semibold py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>

      {isInitialLoading ? (
        <CalendarSkeleton />
      ) : (
        <div className="grid grid-cols-7 gap-1 px-2 sm:px-4 pb-4">
          {gridDays.map(day => {
            const dEvents = eventsForDay(events, day)
            const inMonth = view === 'week' || isSameMonth(day, month)
            const isToday = isSameDay(day, new Date())
            const isSelected = selectedDay && isSameDay(day, selectedDay)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className="rounded-lg p-1 sm:p-1.5 text-left transition-colors min-h-[52px] sm:min-h-[64px] flex flex-col gap-0.5"
                style={{
                  background: isSelected ? 'var(--bg-active)' : 'transparent',
                  border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                  opacity: inMonth ? 1 : 0.35,
                  cursor: 'pointer',
                }}
              >
                <span className="text-[11px] sm:text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{day.getDate()}</span>
                <div className="flex flex-col gap-0.5">
                  {dEvents.slice(0, 2).map(ev => (
                    <span key={ev.id} title={eventTooltip(ev)} className="text-[9px] sm:text-[10px] px-1 rounded truncate"
                      style={{ background: evColor(ev) + '22', color: evColor(ev) }}>
                      {eventLabel(ev)}
                    </span>
                  ))}
                  {dEvents.length > 2 && (
                    <span className="text-[9px] sm:text-[10px]" style={{ color: 'var(--text-muted)' }}>+{dEvents.length - 2} more</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <DayEventsModal day={selectedDay} events={dayEvents} onClose={() => setSelectedDay(null)} fmtDate={fmtDate} />

      {!loading && events.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 px-4" style={{ color: 'var(--text-muted)' }}>
          <CalendarDays className="w-6 h-6" />
          <p className="text-xs">No events this {view}.</p>
        </div>
      )}
    </div>
  )
}

export { TYPE_STYLE, eventsForDay, toDateKey }
