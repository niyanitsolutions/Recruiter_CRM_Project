/**
 * SessionLockOverlay
 *
 * Shown after 5 full minutes of true inactivity (no mouse/keyboard/touch
 * activity, no page interaction, no in-flight requests) or after the tab
 * has been hidden/unfocused for that long. Unlike SessionExpiryModal, this
 * does NOT end the session or require re-login — the user re-enters their
 * current password to resume exactly where they left off.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Lock, Unlock, LogOut } from 'lucide-react'
import authService from '../../services/authService'

export default function SessionLockOverlay({ isOpen, userName, onUnlocked, onLogout }) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await authService.verifyPassword(password)
      onUnlocked()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Incorrect password')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-lock-title"
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         99999,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '16px',
        background:     'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(10px)',
        animation:      'slModalIn 0.22s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div
        style={{
          width:        '100%',
          maxWidth:     '400px',
          background:   'linear-gradient(145deg,#0f172a,#1e293b)',
          border:       '1px solid rgba(100,116,139,0.25)',
          borderRadius: '20px',
          padding:      '32px 28px',
          boxShadow:    '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.6)',
          animation:    'slCardIn 0.28s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.25)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={28} color="#94a3b8" />
          </div>
        </div>

        <h2 id="session-lock-title" style={{ textAlign: 'center', color: '#f1f5f9', fontSize: '20px', fontWeight: '700', marginBottom: '6px', letterSpacing: '-0.02em' }}>
          Session Locked
        </h2>
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13.5px', lineHeight: '1.6', marginBottom: '24px' }}>
          {userName ? `${userName}, ` : ''}enter your password to continue.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Password"
            autoComplete="current-password"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: '12px',
              border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.09)'}`,
              background: 'rgba(255,255,255,0.04)', color: '#f1f5f9', fontSize: '14px',
              marginBottom: '8px', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: '#f87171', fontSize: '12.5px', marginBottom: '12px' }}>{error}</p>
          )}

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="submit"
              disabled={busy || !password}
              style={{
                width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
                fontWeight: '700', fontSize: '14px', cursor: busy || !password ? 'default' : 'pointer',
                opacity: busy || !password ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              <Unlock size={15} />
              {busy ? 'Verifying…' : 'Unlock'}
            </button>

            <button
              type="button"
              onClick={onLogout}
              style={{
                width: '100%', padding: '11px', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.09)', background: 'transparent',
                color: '#64748b', fontWeight: '500', fontSize: '13px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <LogOut size={13} />
              Not you? Logout
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes slModalIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slCardIn  { from { opacity: 0; transform: scale(0.95) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>,
    document.body
  )
}
