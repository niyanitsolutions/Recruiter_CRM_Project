import React from 'react'

// Pulse animation driven by a CSS variable so it respects the active theme.
const pulse = {
  background: 'var(--skeleton-bg, linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-card-alt) 50%, var(--bg-hover) 75%))',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.4s infinite linear',
}

// Inject the keyframes once
if (typeof document !== 'undefined' && !document.getElementById('skeleton-style')) {
  const s = document.createElement('style')
  s.id = 'skeleton-style'
  s.textContent = `@keyframes skeleton-shimmer { from{background-position:200% 0} to{background-position:-200% 0} }`
  document.head.appendChild(s)
}

export const SkeletonBox = ({ className = '', style = {} }) => (
  <div className={`rounded-lg ${className}`} style={{ ...pulse, ...style }} />
)

/** Row skeleton for table/list pages */
export const SkeletonTableRows = ({ rows = 8, cols = 5 }) => (
  <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
    {/* Header */}
    <div className="flex gap-4 px-4 py-3" style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonBox key={i} className="h-4 flex-1" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4 px-4 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonBox key={c} className="h-4 flex-1" style={{ opacity: 1 - c * 0.08 }} />
        ))}
      </div>
    ))}
  </div>
)

/** Card grid skeleton */
export const SkeletonCards = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex items-center gap-3 mb-4">
          <SkeletonBox className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBox className="h-4 w-3/4" />
            <SkeletonBox className="h-3 w-1/2" />
          </div>
        </div>
        <SkeletonBox className="h-3 mb-2" />
        <SkeletonBox className="h-3 w-4/5 mb-3" />
        <div className="flex gap-1">
          <SkeletonBox className="h-5 w-14 rounded-full" />
          <SkeletonBox className="h-5 w-14 rounded-full" />
        </div>
      </div>
    ))}
  </div>
)

const KPI_GRID_COLS = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  8: 'lg:grid-cols-8',
}

/** KPI card row skeleton (4 cards) */
export const SkeletonKpiRow = ({ count = 4 }) => (
  <div className={`grid grid-cols-2 ${KPI_GRID_COLS[count] ?? 'lg:grid-cols-4'} gap-4`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex items-start justify-between mb-4">
          <SkeletonBox className="w-11 h-11 rounded-xl" />
          <SkeletonBox className="h-5 w-16 rounded-full" />
        </div>
        <SkeletonBox className="h-8 w-24 mb-2" />
        <SkeletonBox className="h-3 w-32" />
      </div>
    ))}
  </div>
)
