import React from 'react'
import { Activity } from 'lucide-react'

const DOT_COLORS = {
  candidate_added:    '#43e97b',
  job_posted:         '#4facfe',
  interview_scheduled:'#a78bfa',
  offer_sent:         '#fbbf24',
  client_added:       '#38f9d7',
  user_created:       '#6c63ff',
  onboard_started:    '#fa8231',
  default:            '#7c75b8',
}

const RecentActivity = ({ activities = [] }) => {
  if (!activities.length) return null

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>
          Recent Activity
        </h2>
        <span
          className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
        >
          {activities.length} new
        </span>
      </div>

      {/* Feed */}
      <ul>
        {activities.map((item, idx) => {
          const dot = DOT_COLORS[item.type] || DOT_COLORS.default
          const isLast = idx === activities.length - 1
          return (
            <li
              key={item.id || idx}
              className="flex items-start gap-4 px-5 py-3.5"
              style={isLast ? {} : { borderBottom: '1px solid var(--border-subtle)' }}
            >
              {/* Dot */}
              <div className="flex flex-col items-center flex-shrink-0 pt-1">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: dot, boxShadow: `0 0 6px ${dot}88` }}
                />
                {!isLast && (
                  <div
                    className="w-px flex-1 mt-1"
                    style={{ background: 'var(--border-subtle)', minHeight: 16 }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {item.description}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {item.actor && <span className="font-medium">{item.actor} · </span>}
                  {item.time}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default RecentActivity
