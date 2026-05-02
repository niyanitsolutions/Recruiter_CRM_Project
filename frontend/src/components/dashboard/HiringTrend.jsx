import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

const HiringTrend = ({ data, loading, height = 190, color = '#6C63FF', name = 'Actions' }) => {
  if (loading) {
    return (
      <div
        className="rounded-xl skeleton animate-pulse"
        style={{ height }}
      />
    )
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl text-sm gap-2"
        style={{ height, color: 'var(--text-muted)' }}
      >
        <span>No trend data available</span>
      </div>
    )
  }

  const gradId = `trendGrad_${color.replace('#', '')}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.32} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          stroke="var(--border-subtle)"
          strokeDasharray="4 4"
          vertical={false}
        />

        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />

        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div
                className="rounded-xl px-3 py-2 text-sm shadow-lg"
                style={{
                  background: 'var(--bg-card-alt)',
                  border:     '1px solid var(--border-strong)',
                }}
              >
                <p
                  className="font-semibold mb-0.5"
                  style={{ color: 'var(--text-heading)' }}
                >
                  {label}
                </p>
                {payload.map((p, i) => (
                  <p key={i} style={{ color: p.color }}>
                    {p.name}: <strong>{p.value}</strong>
                  </p>
                ))}
              </div>
            )
          }}
        />

        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{
            r:           5,
            fill:        color,
            stroke:      'var(--bg-card)',
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default HiringTrend
