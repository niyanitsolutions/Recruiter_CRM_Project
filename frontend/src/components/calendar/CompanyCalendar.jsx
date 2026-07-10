import { useMemo, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addWeeks, subWeeks, isSameMonth, isSameDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from 'lucide-react'
import { useLocalization } from '../../hooks/useLocalization'

/**
 * Reusable company calendar grid — month/week view, Today/Prev/Next
 * navigation, click-a-day event list. Purely presentational: the host page
 * fetches events (via hrmService.getCalendarEvents) and passes them in; all
 * visibility/permission filtering already happened server-side, so every
 * event passed here is safe to render as-is.
 */
const TYPE_STYLE = {
  holiday:       { color: '#3b82f6', label: 'Holiday' },
  leave:         { color: '#8b5cf6', label: 'Leave' },
  wfh:           { color: '#10b981', label: 'WFH' },
  shift_change:  { color: '#f59e0b', label: 'Shift Change' },
}

function eventLabel(ev) {
  if (ev.type === 'holiday') return ev.title
  const who = ev.employee_name ? `${ev.employee_name} — ` : ''
  return `${who}${ev.title}`
}

function dayKey(d) {
  return d.toISOString().slice(0, 10)
}

function eventsForDay(events, day) {
  const key = dayKey(day)
  return events.filter(ev => {
    const start = ev.date_start
    const end = ev.date_end || ev.date_start
    return start && key >= start && key <= end
  })
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

  const goToday = () => onMonthChange(new Date())
  const goPrev = () => onMonthChange(view === 'week' ? subWeeks(month, 1) : subMonths(month, 1))
  const goNext = () => onMonthChange(view === 'week' ? addWeeks(month, 1) : addMonths(month, 1))

  const dayEvents = selectedDay ? eventsForDay(events, selectedDay) : []

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      {/* Header — nav + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} aria-label="Previous">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold min-w-[140px] text-center" style={{ color: 'var(--text-heading)' }}>
            {fmtDate(month)}
          </span>
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
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" style={{ color: 'var(--text-muted)' }} />}
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
      <div className="grid grid-cols-7 gap-1 px-4 pt-3 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-xs font-semibold py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1 px-4 pb-4">
        {gridDays.map(day => {
          const dEvents = eventsForDay(events, day)
          const inMonth = view === 'week' || isSameMonth(day, month)
          const isToday = isSameDay(day, new Date())
          const isSelected = selectedDay && isSameDay(day, selectedDay)
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(day)}
              className="rounded-lg p-1.5 text-left transition-colors min-h-[64px] flex flex-col gap-0.5"
              style={{
                background: isSelected ? 'var(--bg-active)' : 'transparent',
                border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                opacity: inMonth ? 1 : 0.35,
                cursor: 'pointer',
              }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{day.getDate()}</span>
              <div className="flex flex-col gap-0.5">
                {dEvents.slice(0, 2).map(ev => (
                  <span key={ev.id} className="text-[10px] px-1 rounded truncate"
                    style={{ background: (TYPE_STYLE[ev.type]?.color || '#94a3b8') + '22', color: TYPE_STYLE[ev.type]?.color || '#94a3b8' }}>
                    {eventLabel(ev)}
                  </span>
                ))}
                {dEvents.length > 2 && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+{dEvents.length - 2} more</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="px-4 pb-4">
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-hover)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-heading)' }}>{fmtDate(selectedDay)}</p>
            {dayEvents.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No events on this day.</p>
            ) : (
              <ul className="space-y-1.5">
                {dayEvents.map(ev => (
                  <li key={ev.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_STYLE[ev.type]?.color || '#94a3b8' }} />
                    {eventLabel(ev)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 px-4" style={{ color: 'var(--text-muted)' }}>
          <CalendarDays className="w-6 h-6" />
          <p className="text-xs">No events this {view}.</p>
        </div>
      )}
    </div>
  )
}

export { TYPE_STYLE, eventsForDay }
