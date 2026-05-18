import React, { useState } from 'react'

const STAGE_COLORS = [
  { a: '#6C63FF', b: '#9C4DFF', glow: 'rgba(108,99,255,0.18)' },
  { a: '#4FACFE', b: '#00F2FE', glow: 'rgba(79,172,254,0.18)'  },
  { a: '#38F9D7', b: '#43E97B', glow: 'rgba(56,249,215,0.18)'  },
  { a: '#43E97B', b: '#38F9D7', glow: 'rgba(67,233,123,0.18)'  },
  { a: '#F6D365', b: '#FDA085', glow: 'rgba(246,211,101,0.18)' },
  { a: '#FA8231', b: '#F64F59', glow: 'rgba(250,130,49,0.18)'  },
]

const HiringFunnel = ({ data, rejectedCount }) => {
  const [hovered, setHovered] = useState(null)

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-40 text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        No funnel data available
      </div>
    )
  }

  const maxVal = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="space-y-1.5">
      {data.map((item, i) => {
        const col     = STAGE_COLORS[i % STAGE_COLORS.length]
        const widthPct = Math.max(Math.round((item.value / maxVal) * 100), 22)
        const prev     = i > 0 ? data[i - 1].value : null
        const conv     = prev != null && prev > 0
          ? Math.round((item.value / prev) * 100)
          : null
        const isHigh   = conv !== null && conv >= 50

        return (
          <div key={item.stage} className="flex flex-col items-center">
            {/* Conversion arrow between stages */}
            {conv !== null && (
              <div className="flex items-center gap-1.5 my-0.5">
                <div className="w-px h-3 rounded" style={{ background: 'var(--border)' }} />
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: isHigh ? 'rgba(67,233,123,0.14)' : 'rgba(255,71,87,0.12)',
                    color:      isHigh ? '#43E97B' : '#FF4757',
                  }}
                >
                  ↓ {conv}%
                </span>
                <div className="w-px h-3 rounded" style={{ background: 'var(--border)' }} />
              </div>
            )}

            {/* Funnel bar */}
            <div
              className="flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200"
              style={{
                width:      `${widthPct}%`,
                minWidth:   '52%',
                background: hovered === i
                  ? `linear-gradient(135deg, ${col.a}28, ${col.b}14)`
                  : `linear-gradient(135deg, ${col.a}14, ${col.b}08)`,
                border:     `1px solid ${hovered === i ? col.a + '60' : col.a + '30'}`,
                boxShadow:  hovered === i ? `0 4px 16px ${col.glow}` : 'none',
                cursor:     'default',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="text-sm font-semibold" style={{ color: col.a }}>
                {item.stage}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="text-base font-bold"
                  style={{ color: 'var(--text-heading)' }}
                >
                  {item.value.toLocaleString('en-IN')}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {maxVal > 0 ? `${Math.round((item.value / maxVal) * 100)}%` : ''}
                </span>
              </div>
            </div>
          </div>
        )
      })}

      {/* Rejected branch — shown below the main funnel as a dropped-off metric */}
      {rejectedCount > 0 && (
        <div className="flex flex-col items-center mt-1">
          <div className="flex items-center gap-1.5 my-0.5">
            <div className="w-px h-3 rounded" style={{ background: 'var(--border)' }} />
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,71,87,0.10)', color: '#FF4757' }}
            >
              ↳ dropped / rejected
            </span>
            <div className="w-px h-3 rounded" style={{ background: 'var(--border)' }} />
          </div>
          <div
            className="flex items-center justify-between px-4 py-2.5 rounded-xl"
            style={{
              width: '52%', minWidth: '52%',
              background: 'rgba(255,71,87,0.06)',
              border: '1px solid rgba(255,71,87,0.22)',
            }}
          >
            <span className="text-sm font-semibold" style={{ color: '#FF4757' }}>Rejected</span>
            <span className="text-base font-bold" style={{ color: 'var(--text-heading)' }}>
              {rejectedCount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default HiringFunnel
