/**
 * SessionWarningModal
 *
 * Shown ~2 minutes before the idle-timeout expires.
 * Displays a live countdown and offers:
 *  - "Stay Logged In"  → refresh token + reset idle timer (via session:extend event)
 *  - "Logout"          → immediate graceful logout
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, LogOut, ShieldCheck } from 'lucide-react'

// Warning fires this many seconds before expiry; countdown matches it.
const WARNING_SECS = 120  // 2 minutes

export default function SessionWarningModal({ isOpen, onStayLoggedIn, onLogout }) {
  const [secs, setSecs]   = useState(WARNING_SECS)
  const intervalRef       = useRef(null)
  const stayBtnRef        = useRef(null)
  const [staying, setStaying] = useState(false)

  // Restart countdown each time the modal opens
  useEffect(() => {
    if (!isOpen) {
      clearInterval(intervalRef.current)
      setSecs(WARNING_SECS)
      setStaying(false)
      return
    }
    setSecs(WARNING_SECS)
    setTimeout(() => stayBtnRef.current?.focus(), 50)
    intervalRef.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [isOpen])

  const handleStay = async () => {
    setStaying(true)
    clearInterval(intervalRef.current)
    await onStayLoggedIn()
    setStaying(false)
  }

  if (!isOpen) return null

  const mins    = Math.floor(secs / 60)
  const secsPad = String(secs % 60).padStart(2, '0')
  const pct     = (secs / WARNING_SECS) * 100

  // Colour transitions: green → amber → red
  const urgency = secs < 30 ? '#ef4444' : secs < 60 ? '#f59e0b' : '#22c55e'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-warn-title"
      aria-live="polite"
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         99998,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '16px',
        background:     'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(5px)',
        animation:      'swModalIn 0.22s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div
        style={{
          width:         '100%',
          maxWidth:      '400px',
          background:    'linear-gradient(145deg,#0f172a,#1e293b)',
          border:        '1px solid rgba(245,158,11,0.3)',
          borderRadius:  '20px',
          padding:       '28px 24px',
          boxShadow:     '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.6), 0 0 40px rgba(245,158,11,0.1)',
          animation:     'swCardIn 0.28s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Icon + countdown ring */}
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* SVG ring */}
            <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="4" />
              <circle
                cx="36" cy="36" r="30" fill="none"
                stroke={urgency}
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 30}`}
                strokeDashoffset={`${2 * Math.PI * 30 * (1 - pct / 100)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
              />
            </svg>
            {/* Countdown label */}
            <div style={{
              position:  'absolute',
              color:     urgency,
              fontWeight: '800',
              fontSize:  '15px',
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 0.5s',
            }}>
              {mins}:{secsPad}
            </div>
          </div>
        </div>

        {/* Title */}
        <h2
          id="session-warn-title"
          style={{ textAlign: 'center', color: '#f1f5f9', fontSize: '18px', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.02em' }}
        >
          Session Expiring Soon
        </h2>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', lineHeight: '1.6', marginBottom: '24px' }}>
          Your session will expire in{' '}
          <span style={{ color: urgency, fontWeight: '700', transition: 'color 0.5s' }}>
            {mins > 0 ? `${mins} min ${secsPad} sec` : `${secs} seconds`}
          </span>
          {' '}due to inactivity.
        </p>

        {/* Progress bar */}
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.07)', borderRadius: '99px', marginBottom: '24px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '99px',
            background: urgency,
            width: `${pct}%`,
            transition: 'width 1s linear, background 0.5s',
          }} />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            ref={stayBtnRef}
            onClick={handleStay}
            disabled={staying}
            style={{
              width:        '100%',
              padding:      '12px',
              borderRadius: '12px',
              border:       'none',
              background:   staying ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color:        '#fff',
              fontWeight:   '700',
              fontSize:     '14px',
              cursor:       staying ? 'not-allowed' : 'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          '8px',
              boxShadow:    staying ? 'none' : '0 0 20px rgba(99,102,241,0.35)',
              transition:   'transform 0.15s, box-shadow 0.15s, background 0.15s',
            }}
            onMouseOver={e => { if (!staying) { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 28px rgba(99,102,241,0.5)' } }}
            onMouseOut={e  => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = staying ? 'none' : '0 0 20px rgba(99,102,241,0.35)' }}
          >
            {staying
              ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'swSpin 0.7s linear infinite' }} /> Extending session…</>
              : <><ShieldCheck size={15} /> Stay Logged In</>
            }
          </button>

          <button
            onClick={onLogout}
            disabled={staying}
            style={{
              width:        '100%',
              padding:      '11px',
              borderRadius: '12px',
              border:       '1px solid rgba(239,68,68,0.25)',
              background:   'transparent',
              color:        '#f87171',
              fontWeight:   '500',
              fontSize:     '13px',
              cursor:       staying ? 'not-allowed' : 'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          '7px',
              transition:   'background 0.15s, border-color 0.15s',
            }}
            onMouseOver={e => { if (!staying) { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)' } }}
            onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)' }}
          >
            <LogOut size={14} /> Logout Now
          </button>
        </div>
      </div>

      <style>{`
        @keyframes swModalIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes swCardIn  { from { opacity: 0; transform: scale(0.95) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes swSpin    { to   { transform: rotate(360deg) } }
      `}</style>
    </div>,
    document.body
  )
}
