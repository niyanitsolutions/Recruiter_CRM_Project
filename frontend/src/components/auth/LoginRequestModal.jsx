/**
 * LoginRequestModal  (Device A)
 *
 * Shown on the ACTIVE device (Device A) when Device B sends a login request
 * via POST /sessions/request-access.  Arrives as a 'session:login_request'
 * CustomEvent pushed by useSessionWebSocket (real-time) or the heartbeat poll.
 *
 * The user can:
 *   Allow — approve the request (Device A's session ends, Device B logs in)
 *   Deny  — block the request  (Device B sees "denied" and cannot proceed)
 *
 * Phases:
 *   prompt   → main UI with device info + TTL countdown
 *   approving / denying → loading state
 *   approved / denied   → confirmation screen, auto-closes
 *   expired             → 5-min TTL ran out
 *   error               → API failure with retry option
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Monitor, Globe, Clock, CheckCircle, XCircle, Shield, Loader2 } from 'lucide-react'
import api from '../../services/api'

const STYLES = `
  @keyframes lrFadeIn { from { opacity:0 } to { opacity:1 } }
  @keyframes lrCardIn { from { opacity:0; transform:scale(0.95) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
  @keyframes lrSpin   { to { transform:rotate(360deg) } }
  @keyframes lrPulse  { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
`

function timeSince(isoStr) {
  if (!isoStr) return null
  const diff = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)}h ago`
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ color: '#64748b', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 1, wordBreak: 'break-all' }}>
          {value || '—'}
        </div>
      </div>
    </div>
  )
}

function SpinnerIcon({ size = 14 }) {
  return (
    <Loader2
      size={size}
      style={{ animation: 'lrSpin 0.7s linear infinite', flexShrink: 0 }}
    />
  )
}

/**
 * LoginRequestModal
 *
 * Props:
 *   isOpen      {boolean}
 *   requestData {{ requestId, deviceInfo, ipAddress, requestedAt, message }}
 *   onClose     {() => void}
 */
export default function LoginRequestModal({ isOpen, requestData, onClose }) {
  const [phase,    setPhase]    = useState('prompt')
  const [errMsg,   setErrMsg]   = useState('')
  const [timeLeft, setTimeLeft] = useState(300)

  // Reset state whenever a new request opens
  useEffect(() => {
    if (isOpen) {
      setPhase('prompt')
      setErrMsg('')
      setTimeLeft(300)
    }
  }, [isOpen, requestData?.requestId])

  // 5-minute countdown
  useEffect(() => {
    if (!isOpen || phase !== 'prompt') return
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(t); setPhase('expired'); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [isOpen, phase])

  const handleApprove = async () => {
    setPhase('approving')
    try {
      await api.post('/sessions/approve-request', { request_id: requestData.requestId })
      setPhase('approved')
      // Backend revoked Device A's session — auto-close so session:expired modal takes over.
      setTimeout(() => onClose?.(), 2000)
    } catch (e) {
      const status = e?.response?.status

      // Auth errors (401/403) mean Device A's session was already ended by the
      // backend as part of approval processing, OR by a concurrent session event.
      // Either way the approval succeeded from Device B's perspective.
      // Close gracefully — the session:expired modal will take over.
      if (!status || status === 401 || status === 403) {
        setTimeout(() => onClose?.(), 300)
        return
      }

      // 400 "already approved" — same successful outcome, close cleanly.
      if (status === 400) {
        setPhase('approved')
        setTimeout(() => onClose?.(), 1500)
        return
      }

      // Genuine failure (404 request not found, 5xx server error, etc.)
      const detail = e?.response?.data?.detail
      setErrMsg(
        typeof detail === 'string' ? detail
          : detail?.message || 'Failed to approve. Please try again.'
      )
      setPhase('error')
    }
  }

  const handleDeny = async () => {
    setPhase('denying')
    try {
      await api.post('/sessions/deny-request', { request_id: requestData.requestId })
      setPhase('denied')
      setTimeout(() => onClose?.(), 1500)
    } catch (e) {
      setErrMsg(e?.response?.data?.detail || 'Failed to deny. Please try again.')
      setPhase('error')
    }
  }

  if (!isOpen) return null

  const timeColor = timeLeft < 30 ? '#ef4444' : timeLeft < 60 ? '#f59e0b' : '#22c55e'
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const ss = String(timeLeft % 60).padStart(2, '0')

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Login request from another device"
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         99996,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        16,
        background:     'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        animation:      'lrFadeIn 0.2s ease both',
      }}
    >
      <style>{STYLES}</style>

      <div
        style={{
          width:        '100%',
          maxWidth:     430,
          background:   'linear-gradient(145deg, #0f172a, #1e293b)',
          border:       '1px solid rgba(99,102,241,0.3)',
          borderRadius: 20,
          padding:      '28px 24px',
          boxShadow:    '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.6), 0 0 48px rgba(99,102,241,0.08)',
          animation:    'lrCardIn 0.28s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* ── Approved ───────────────────────────────────────────────────────── */}
        {phase === 'approved' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <CheckCircle size={24} color="#22c55e" />
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>
              Access Approved
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
              Login request approved. Your current session is ending now.
            </p>
          </div>
        )}

        {/* ── Denied ─────────────────────────────────────────────────────────── */}
        {phase === 'denied' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <XCircle size={24} color="#ef4444" />
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>
              Access Denied
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>
              The login request has been blocked.
            </p>
          </div>
        )}

        {/* ── Expired ────────────────────────────────────────────────────────── */}
        {phase === 'expired' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Clock size={24} color="#64748b" />
            </div>
            <h3 style={{ color: '#f1f5f9', fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>
              Request Expired
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>
              The login request timed out (5-minute window closed).
            </p>
            <button
              onClick={onClose}
              style={{ marginTop: 16, padding: '9px 20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {phase === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#f87171', fontSize: 14, marginBottom: 16 }}>{errMsg}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => setPhase('prompt')}
                style={{ padding: '9px 16px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, color: '#818cf8', cursor: 'pointer', fontSize: 13 }}
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── Prompt / Loading ───────────────────────────────────────────────── */}
        {(phase === 'prompt' || phase === 'approving' || phase === 'denying') && (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={24} color="#818cf8" />
                </div>
                <span style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.25)', animation: 'lrPulse 2s ease-in-out infinite', pointerEvents: 'none' }} />
              </div>
              <h3 style={{ color: '#f1f5f9', fontSize: 17, fontWeight: 700, margin: 0 }}>
                Login Request
              </h3>
              <p style={{ color: '#94a3b8', fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
                Someone is trying to sign in to your account from another device.
              </p>
            </div>

            {/* Device info card */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InfoRow
                  icon={<Monitor size={14} />}
                  label="Device"
                  value={requestData?.deviceInfo || 'Unknown device'}
                />
                <InfoRow
                  icon={<Globe size={14} />}
                  label="IP Address"
                  value={requestData?.ipAddress || 'Unknown'}
                />
                {requestData?.requestedAt && (
                  <InfoRow
                    icon={<Clock size={14} />}
                    label="Requested"
                    value={timeSince(requestData.requestedAt)}
                  />
                )}
              </div>
            </div>

            {/* TTL countdown */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Expires in </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: timeColor, fontVariantNumeric: 'tabular-nums' }}>
                {mm}:{ss}
              </span>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              {/* Deny */}
              <button
                onClick={handleDeny}
                disabled={phase !== 'prompt'}
                style={{
                  flex:           1,
                  padding:        '11px 0',
                  borderRadius:   12,
                  background:     'rgba(239,68,68,0.08)',
                  border:         '1px solid rgba(239,68,68,0.25)',
                  color:          '#f87171',
                  cursor:         phase !== 'prompt' ? 'not-allowed' : 'pointer',
                  fontSize:       13,
                  fontWeight:     600,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            6,
                  opacity:        phase !== 'prompt' ? 0.6 : 1,
                  transition:     'opacity 0.15s',
                }}
              >
                {phase === 'denying'
                  ? <SpinnerIcon />
                  : <XCircle size={14} />
                }
                Deny
              </button>

              {/* Allow */}
              <button
                onClick={handleApprove}
                disabled={phase !== 'prompt'}
                style={{
                  flex:           2,
                  padding:        '11px 0',
                  borderRadius:   12,
                  background:     phase === 'approving'
                    ? 'linear-gradient(135deg,rgba(99,102,241,0.55),rgba(139,92,246,0.55))'
                    : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  border:         'none',
                  color:          '#fff',
                  cursor:         phase !== 'prompt' ? 'not-allowed' : 'pointer',
                  fontSize:       13,
                  fontWeight:     700,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            6,
                  opacity:        phase !== 'prompt' ? 0.7 : 1,
                  boxShadow:      '0 4px 20px rgba(99,102,241,0.28)',
                  transition:     'opacity 0.15s',
                }}
              >
                {phase === 'approving'
                  ? <><SpinnerIcon /> Allowing…</>
                  : <><CheckCircle size={14} /> Allow Access</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
