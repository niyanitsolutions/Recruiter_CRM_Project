import React, { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts'

const COLOR_MAP = {
  applied:     '#6C63FF',
  screening:   '#4FACFE',
  shortlisted: '#38F9D7',
  interview:   '#43E97B',
  offered:     '#F6D365',
  joined:      '#FA8231',
  rejected:    '#FF4757',
}
const FALLBACK = ['#6C63FF','#4FACFE','#38F9D7','#43E97B','#F6D365','#FA8231','#FF4757']

const CandidatePipelineChart = ({ data, total }) => {
  const [active, setActive] = useState(null)

  const chartData = (data || [])
    .filter(d => d.value > 0)
    .map((d, i) => ({
      name:  d.stage,
      value: d.value,
      color: COLOR_MAP[d.stage?.toLowerCase()] || FALLBACK[i % FALLBACK.length],
    }))

  if (chartData.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-48 text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        No pipeline data
      </div>
    )
  }

  const safeTotal = total || chartData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      {/* Donut */}
      <div className="relative flex-shrink-0" style={{ width: 176, height: 176 }}>
        <ResponsiveContainer width={176} height={176}>
          <PieChart>
            <Pie
              data={chartData}
              cx={85}
              cy={85}
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
              animationBegin={200}
              animationDuration={800}
            >
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.color}
                  stroke="transparent"
                  opacity={active === null || active === i ? 1 : 0.4}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active: a, payload }) => {
                if (!a || !payload?.length) return null
                const d = payload[0]
                return (
                  <div
                    className="rounded-xl px-3 py-2 text-sm shadow-lg"
                    style={{
                      background: 'var(--bg-card-alt)',
                      border:     '1px solid var(--border-strong)',
                    }}
                  >
                    <p className="font-semibold" style={{ color: d.payload.color }}>{d.name}</p>
                    <p style={{ color: 'var(--text-primary)' }}>
                      {d.value.toLocaleString('en-IN')} candidates
                    </p>
                    {safeTotal > 0 && (
                      <p style={{ color: 'var(--text-muted)' }}>
                        {Math.round((d.value / safeTotal) * 100)}% of total
                      </p>
                    )}
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-2xl font-bold leading-none" style={{ color: 'var(--text-heading)' }}>
            {safeTotal.toLocaleString('en-IN')}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Total</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 w-full space-y-1.5 min-w-0">
        {chartData.map((item, i) => (
          <div
            key={item.name}
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all duration-150 cursor-default"
            style={{
              background: active === i ? `${item.color}12` : 'transparent',
              border:     `1px solid ${active === i ? item.color + '30' : 'transparent'}`,
            }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                {item.name}
              </span>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {item.value.toLocaleString('en-IN')}
              </span>
              <span className="text-xs w-8 text-right" style={{ color: 'var(--text-muted)' }}>
                {safeTotal > 0 ? `${Math.round((item.value / safeTotal) * 100)}%` : '0%'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CandidatePipelineChart
