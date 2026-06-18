import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

// ── Smooth bezier sparkline path builder ─────────────────────────────────────
const buildSparkPath = (data, w, h) => {
  if (!data || data.length < 2) return { line: '', area: '' }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pad = 4
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }))
  let line = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const dx = (curr.x - prev.x) / 2.5
    line += ` C ${(prev.x + dx).toFixed(2)},${prev.y.toFixed(2)} ${(curr.x - dx).toFixed(2)},${curr.y.toFixed(2)} ${curr.x.toFixed(2)},${curr.y.toFixed(2)}`
  }
  const area = `${line} L ${w},${h} L 0,${h} Z`
  return { line, area }
}

const useCounter = (target, duration = 900) => {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null || isNaN(target)) return
    let raf
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

const PALETTES = {
  blue:   { a: '#4FACFE', b: '#00F2FE', glow: 'rgba(79,172,254,0.20)'   },
  purple: { a: '#7c3aed', b: '#9C4DFF', glow: 'rgba(124,58,237,0.20)'   },
  green:  { a: '#22c55e', b: '#38F9D7', glow: 'rgba(34,197,94,0.20)'    },
  orange: { a: '#FA8231', b: '#F6D365', glow: 'rgba(250,130,49,0.20)'   },
  red:    { a: '#FF4757', b: '#FF6B9D', glow: 'rgba(255,71,87,0.20)'    },
  teal:   { a: '#38F9D7', b: '#4FACFE', glow: 'rgba(56,249,215,0.20)'   },
  pink:   { a: '#FF6B9D', b: '#C850C0', glow: 'rgba(255,107,157,0.20)'  },
  yellow: { a: '#F6A535', b: '#FDA085', glow: 'rgba(246,165,53,0.20)'   },
  indigo: { a: '#6366f1', b: '#8b5cf6', glow: 'rgba(99,102,241,0.20)'   },
}

const KpiCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  trend,       // { value: string, dir: 'up'|'down'|'neutral' }
  sparkline,   // number[]  — mini line chart
  linkTo,
  delay = 0,
  compact = false,  // smaller card without sparkline
}) => {
  const count  = useCounter(typeof value === 'number' ? value : null)
  const [mounted, setMounted] = useState(false)
  const [hov, setHov] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const pal    = PALETTES[color] || PALETTES.blue
  const gradId = useMemo(
    () => `kpig_${color}_${(title || '').replace(/\s+/g, '').toLowerCase().slice(0, 10)}`,
    [color, title]
  )
  const tColor = trend?.dir === 'up' ? '#22c55e' : trend?.dir === 'down' ? '#ef4444' : 'var(--text-muted)'

  const sparkPaths = useMemo(
    () => (!compact && sparkline && sparkline.length > 1 ? buildSparkPath(sparkline, 100, 28) : null),
    [compact, sparkline]
  )

  const card = (
    <div
      className="rounded-xl relative overflow-hidden cursor-default"
      style={{
        background:  'var(--bg-card)',
        border:      '1px solid var(--border-card)',
        padding:     compact ? '10px 12px 8px' : '12px 14px 0',
        boxShadow:   hov
          ? `0 8px 24px ${pal.glow}, var(--shadow-card)`
          : `0 2px 8px ${pal.glow.replace(/[\d.]+\)$/, '0.06)')}, var(--shadow-card)`,
        opacity:     mounted ? 1 : 0,
        transform:   mounted
          ? (hov ? 'translateY(-2px)' : 'translateY(0)')
          : 'translateY(16px)',
        transition:  mounted
          ? 'box-shadow 0.25s ease, transform 0.25s ease'
          : `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Top gradient accent bar */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: '2px', background: `linear-gradient(90deg, ${pal.a}, ${pal.b})` }}
      />

      {/* Content wrapper — adds bottom padding if no sparkline */}
      <div style={{ paddingBottom: compact || !sparkPaths?.line ? 0 : '2px' }}>
        {/* Icon */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center mb-2"
          style={{
            background: `${pal.a}18`,
            transform: hov ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.25s ease',
          }}
        >
          {Icon && <Icon className="w-[15px] h-[15px]" style={{ color: pal.a }} />}
        </div>

        {/* Value */}
        <p
          className="font-bold leading-none mb-0.5"
          style={{
            fontSize: compact ? '20px' : '22px',
            color: 'var(--text-heading)',
            letterSpacing: '-0.5px',
          }}
        >
          {value == null
            ? <span style={{ color: 'var(--text-disabled)' }}>—</span>
            : typeof value === 'string'
              ? value
              : count.toLocaleString('en-IN')}
        </p>

        {/* Title */}
        <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{title}</p>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        )}

        {/* Trend text — inline below title/subtitle */}
        {trend && (
          <p
            className="text-[10px] font-semibold mt-1 leading-tight"
            style={{ color: tColor }}
          >
            {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '→'} {trend.value}
          </p>
        )}

        {/* Bottom padding for non-sparkline compact cards */}
        {(compact || !sparkPaths?.line) && <div style={{ height: compact ? 0 : '6px' }} />}
      </div>

      {/* SVG sparkline — full-width, flush to card bottom */}
      {!compact && sparkPaths?.line && (
        <div style={{ height: '32px', marginTop: '4px' }}>
          <svg
            viewBox="0 0 100 28"
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            style={{ display: 'block' }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={pal.a} stopOpacity="0.30" />
                <stop offset="100%" stopColor={pal.a} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={sparkPaths.area} fill={`url(#${gradId})`} />
            <path
              d={sparkPaths.line}
              fill="none"
              stroke={pal.a}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  )

  return linkTo ? <Link to={linkTo} className="block">{card}</Link> : card
}

export default KpiCard
