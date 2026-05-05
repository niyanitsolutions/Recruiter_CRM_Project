import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

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
  blue:   { a: '#4FACFE', b: '#00F2FE', glow: 'rgba(79,172,254,0.22)'  },
  purple: { a: '#6C63FF', b: '#9C4DFF', glow: 'rgba(108,99,255,0.22)'  },
  green:  { a: '#43E97B', b: '#38F9D7', glow: 'rgba(67,233,123,0.22)'  },
  orange: { a: '#FA8231', b: '#F6D365', glow: 'rgba(250,130,49,0.22)'  },
  red:    { a: '#FF4757', b: '#FF6B9D', glow: 'rgba(255,71,87,0.22)'   },
  teal:   { a: '#38F9D7', b: '#4FACFE', glow: 'rgba(56,249,215,0.22)'  },
  pink:   { a: '#FF6B9D', b: '#C850C0', glow: 'rgba(255,107,157,0.22)' },
  yellow: { a: '#F6D365', b: '#FDA085', glow: 'rgba(246,211,101,0.22)' },
}

const KpiCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  trend,       // { value: string, dir: 'up'|'down'|'neutral', label?: string }
  sparkline,   // number[]  — mini bar chart
  linkTo,
  delay = 0,
}) => {
  const count  = useCounter(typeof value === 'number' ? value : null)
  const [mounted, setMounted] = useState(false)
  const [hov, setHov] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const pal    = PALETTES[color] || PALETTES.blue
  const maxSp  = sparkline ? Math.max(...sparkline, 1) : 1
  const TIcon  = trend?.dir === 'up' ? TrendingUp : trend?.dir === 'down' ? TrendingDown : Minus
  const tColor = trend?.dir === 'up' ? '#43E97B'  : trend?.dir === 'down' ? '#FF4757'  : '#8B8FA8'
  const tint   = pal.glow.replace(/[\d.]+\)$/, '0.07)')

  const card = (
    <div
      className="rounded-2xl p-5 relative overflow-hidden cursor-default"
      style={{
        background:  'var(--bg-card)',
        border:      hov ? `1.5px solid ${pal.a}55` : '1px solid var(--border-card)',
        boxShadow:   hov
          ? `0 0 25px ${pal.glow}, 0 8px 32px ${pal.glow}, var(--shadow-card)`
          : `0 4px 24px ${pal.glow}, var(--shadow-card)`,
        opacity:     mounted ? 1 : 0,
        transform:   mounted
          ? (hov ? 'translateY(-2px) scale(1.03)' : 'translateY(0) scale(1)')
          : 'translateY(20px) scale(1)',
        transition:  mounted
          ? 'border 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease'
          : `opacity 0.45s ease ${delay}ms, transform 0.45s ease ${delay}ms`,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Gradient tint overlay — fades in on hover */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${tint} 0%, transparent 65%)`,
          opacity:    hov ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Gradient accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, ${pal.a}, ${pal.b})` }}
      />

      {/* Icon + trend badge */}
      <div className="relative flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${pal.a}22, ${pal.b}33)`,
            border:     `1px solid ${pal.a}40`,
            transform:  hov ? 'scale(1.1)' : 'scale(1)',
            transition: 'transform 0.3s ease',
          }}
        >
          {Icon && <Icon className="w-5 h-5" style={{ color: pal.a }} />}
        </div>

        {trend && (
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: `${tColor}18`, color: tColor }}
          >
            <TIcon className="w-3 h-3" />
            {trend.value}
          </div>
        )}
      </div>

      {/* Value */}
      <p
        className="relative text-3xl font-bold leading-none mb-1"
        style={{ color: 'var(--text-heading)', letterSpacing: '-0.5px' }}
      >
        {value == null
          ? <span style={{ color: 'var(--text-disabled)' }}>—</span>
          : typeof value === 'string'
            ? value
            : count.toLocaleString('en-IN')}
      </p>

      {/* Title */}
      <p className="relative text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>

      {/* Subtitle / trend label */}
      {(subtitle || trend?.label) && (
        <p className="relative text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {subtitle ?? trend?.label}
        </p>
      )}

      {/* Micro sparkline */}
      {sparkline && sparkline.length > 0 && (
        <div className="relative flex items-end gap-0.5 mt-3 h-8">
          {sparkline.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height:     `${Math.max(Math.round((v / maxSp) * 100), 8)}%`,
                background: i === sparkline.length - 1 ? pal.a : `${pal.a}50`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )

  return linkTo ? <Link to={linkTo} className="block">{card}</Link> : card
}

export default KpiCard
