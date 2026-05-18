/**
 * SessionExpiryModal
 *
 * Shown in two scenarios:
 *  1. Idle timeout — user was inactive for too long (reason = "idle")
 *  2. Remote kick   — another device logged in and ended this session (reason = "remote")
 *
 * Rendered as a portal over the entire app so it always appears on top.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LogIn, Monitor, Clock, ShieldAlert } from 'lucide-react'

const REASONS = {
  idle:       { icon: Clock,        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  title: 'Session Expired',            subtitle: 'Your session has expired due to inactivity.\nPlease login again to continue.' },
  remote:     { icon: Monitor,      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   title: 'Session Ended',              subtitle: 'Your session was ended because this account\nlogged in on another device.' },
  token:      { icon: ShieldAlert,  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)', title: 'Session Expired',            subtitle: 'Your session has expired.\nPlease login again to continue.' },
}

export default function SessionExpiryModal({ isOpen, reason = 'idle', onLoginAgain, onCancel }) {
  const cfg    = REASONS[reason] || REASONS.idle
  const Icon   = cfg.icon
  const btnRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => btnRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expiry-title"
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          99999,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         '16px',
        background:      'rgba(0,0,0,0.72)',
        backdropFilter:  'blur(6px)',
        animation:       'seModalIn 0.22s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div
        style={{
          width:           '100%',
          maxWidth:        '420px',
          background:      'linear-gradient(145deg,#0f172a,#1e293b)',
          border:          `1px solid ${cfg.border}`,
          borderRadius:    '20px',
          padding:         '32px 28px',
          boxShadow:       `0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.6), 0 0 40px ${cfg.bg}`,
          animation:       'seCardIn 0.28s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width:          '64px',
            height:         '64px',
            borderRadius:   '50%',
            background:     cfg.bg,
            border:         `1px solid ${cfg.border}`,
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
          }}>
            <Icon size={28} color={cfg.color} />
          </div>
        </div>

        {/* Title */}
        <h2
          id="session-expiry-title"
          style={{
            textAlign:    'center',
            color:        '#f1f5f9',
            fontSize:     '20px',
            fontWeight:   '700',
            marginBottom: '10px',
            letterSpacing: '-0.02em',
          }}
        >
          {cfg.title}
        </h2>

        {/* Subtitle */}
        <p style={{
          textAlign:    'center',
          color:        '#94a3b8',
          fontSize:     '13.5px',
          lineHeight:   '1.6',
          marginBottom: '28px',
          whiteSpace:   'pre-line',
        }}>
          {cfg.subtitle}
        </p>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '24px' }} />

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            ref={btnRef}
            onClick={onLoginAgain}
            style={{
              width:        '100%',
              padding:      '12px',
              borderRadius: '12px',
              border:       'none',
              background:   'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color:        '#fff',
              fontWeight:   '700',
              fontSize:     '14px',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          '8px',
              boxShadow:    '0 0 20px rgba(99,102,241,0.35)',
              transition:   'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 28px rgba(99,102,241,0.5)' }}
            onMouseOut={e  => { e.currentTarget.style.transform = 'scale(1)';    e.currentTarget.style.boxShadow = '0 0 20px rgba(99,102,241,0.35)' }}
          >
            <LogIn size={15} />
            Login Again
          </button>

          <button
            onClick={onCancel}
            style={{
              width:        '100%',
              padding:      '11px',
              borderRadius: '12px',
              border:       '1px solid rgba(255,255,255,0.09)',
              background:   'transparent',
              color:        '#64748b',
              fontWeight:   '500',
              fontSize:     '13px',
              cursor:       'pointer',
              transition:   'color 0.15s, background 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#94a3b8' }}
            onMouseOut={e  => { e.currentTarget.style.background = 'transparent';             e.currentTarget.style.color = '#64748b' }}
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes seModalIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes seCardIn  { from { opacity: 0; transform: scale(0.95) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>,
    document.body
  )
}
