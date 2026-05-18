/**
 * ActiveSessionsPage
 *
 * Enterprise-grade session manager — shows all active sessions for the
 * current user with device, IP, login time, last-active, and a "current"
 * badge.  Users can revoke individual sessions or log out all other devices
 * at once.
 *
 * Accessible at:
 *   /my-sessions            — all authenticated company users
 *   /settings/active-sessions — admins via settings menu
 *
 * API:
 *   GET    /sessions                  — list active sessions
 *   DELETE /sessions/{session_id}     — revoke one session
 *   DELETE /sessions                  — revoke all except current
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Monitor, Smartphone, Globe, Clock, RefreshCw, LogOut,
  Shield, CheckCircle, Loader2, AlertTriangle, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { Breadcrumb, PageHeader, SectionCard } from './SettingsLayout'

// ── User-agent helpers ──────────────────────────────────────────────────────────

function parseUA(ua = '') {
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown OS', isMobile: false }

  let browser = 'Unknown browser'
  let os      = 'Unknown OS'

  if (/Edg\//.test(ua))             browser = 'Microsoft Edge'
  else if (/OPR\//.test(ua))        browser = 'Opera'
  else if (/Firefox\//.test(ua))    browser = 'Firefox'
  else if (/Chrome\//.test(ua))     browser = 'Chrome'
  else if (/Safari\//.test(ua))     browser = 'Safari'
  else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer'

  if (/Windows NT 10/.test(ua))        os = 'Windows 11/10'
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7'
  else if (/Windows/.test(ua))         os = 'Windows'
  else if (/Mac OS X/.test(ua))        os = 'macOS'
  else if (/iPhone/.test(ua))          os = 'iOS (iPhone)'
  else if (/iPad/.test(ua))            os = 'iOS (iPad)'
  else if (/Android/.test(ua))         os = 'Android'
  else if (/Linux/.test(ua))           os = 'Linux'

  const isMobile = /iPhone|Android|Mobile/.test(ua)
  return { browser, os, isMobile }
}

function formatRelative(isoStr) {
  if (!isoStr) return '—'
  const diff = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—'
  try {
    return new Date(isoStr).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return isoStr
  }
}

// ── Session card ────────────────────────────────────────────────────────────────

function SessionCard({ session, onRevoke, revoking }) {
  const { browser, os, isMobile } = parseUA(session.device_info)
  const DevIcon = isMobile ? Smartphone : Monitor

  return (
    <div
      style={{
        background:   session.is_current
          ? 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.06))'
          : 'rgba(255,255,255,0.03)',
        border:       session.is_current
          ? '1px solid rgba(99,102,241,0.35)'
          : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        padding:      '16px 18px',
        display:      'flex',
        alignItems:   'flex-start',
        gap:          14,
        transition:   'border-color 0.2s',
      }}
    >
      {/* Device icon */}
      <div
        style={{
          width:          44,
          height:         44,
          borderRadius:   10,
          background:     session.is_current
            ? 'rgba(99,102,241,0.15)'
            : 'rgba(255,255,255,0.06)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}
      >
        <DevIcon size={20} color={session.is_current ? '#818cf8' : '#64748b'} />
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600 }}>
            {browser}
          </span>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            on {os}
          </span>
          {session.is_current && (
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          4,
                padding:      '2px 8px',
                borderRadius: 20,
                background:   'rgba(34,197,94,0.12)',
                border:       '1px solid rgba(34,197,94,0.3)',
                color:        '#4ade80',
                fontSize:     11,
                fontWeight:   600,
              }}
            >
              <CheckCircle size={10} />
              This device
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 6 }}>
          <MetaItem icon={<Globe size={11} />} label={session.ip_address || 'Unknown IP'} />
          <MetaItem
            icon={<Clock size={11} />}
            label={`Logged in ${formatRelative(session.login_time)}`}
            title={formatDateTime(session.login_time)}
          />
          {session.last_active && (
            <MetaItem
              icon={<Shield size={11} />}
              label={`Active ${formatRelative(session.last_active)}`}
              title={formatDateTime(session.last_active)}
            />
          )}
        </div>
      </div>

      {/* Revoke button — hidden for current session */}
      {!session.is_current && (
        <button
          onClick={() => onRevoke(session.session_id)}
          disabled={revoking === session.session_id}
          title="Revoke this session"
          style={{
            flexShrink:     0,
            width:          34,
            height:         34,
            borderRadius:   8,
            background:     'rgba(239,68,68,0.08)',
            border:         '1px solid rgba(239,68,68,0.2)',
            color:          '#f87171',
            cursor:         revoking ? 'not-allowed' : 'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            opacity:        revoking === session.session_id ? 0.6 : 1,
            transition:     'background 0.15s, opacity 0.15s',
          }}
          onMouseEnter={e => { if (!revoking) e.currentTarget.style.background = 'rgba(239,68,68,0.16)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
        >
          {revoking === session.session_id
            ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} />
            : <Trash2 size={14} />
          }
        </button>
      )}
    </div>
  )
}

function MetaItem({ icon, label, title }) {
  return (
    <span
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#64748b', fontSize: 12 }}
    >
      {icon}
      {label}
    </span>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function ActiveSessionsPage() {
  const [sessions,      setSessions]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [revoking,      setRevoking]      = useState(null)   // session_id being revoked
  const [revokingAll,   setRevokingAll]   = useState(false)
  const [confirmAll,    setConfirmAll]    = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else         setRefreshing(true)
    try {
      const res = await api.get('/sessions')
      setSessions(res.data?.sessions || [])
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load sessions')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRevoke = async (sessionId) => {
    setRevoking(sessionId)
    try {
      await api.delete(`/sessions/${sessionId}`)
      toast.success('Session revoked successfully')
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to revoke session')
    } finally {
      setRevoking(null)
    }
  }

  const handleRevokeAll = async () => {
    setRevokingAll(true)
    setConfirmAll(false)
    try {
      const res = await api.delete('/sessions')
      const count = res.data?.revoked_count || 0
      toast.success(count > 0 ? `Logged out ${count} other device(s)` : 'No other sessions to revoke')
      await load(true)
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to revoke sessions')
    } finally {
      setRevokingAll(false)
    }
  }

  const otherSessions = sessions.filter(s => !s.is_current)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 32px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
      `}</style>

      <Breadcrumb page="Active Sessions" />
      <PageHeader
        title="Active Sessions"
        description="Manage all devices currently signed in to your account. Revoke access to any device instantly."
      />

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} color="#818cf8" />
          <span style={{ color: '#94a3b8', fontSize: 13 }}>
            {loading ? 'Loading…' : `${sessions.length} active session${sessions.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* Refresh */}
          <button
            onClick={() => load(true)}
            disabled={loading || refreshing}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          6,
              padding:      '8px 14px',
              borderRadius: 10,
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.1)',
              color:        '#94a3b8',
              fontSize:     13,
              cursor:       (loading || refreshing) ? 'not-allowed' : 'pointer',
              opacity:      (loading || refreshing) ? 0.6 : 1,
            }}
          >
            <RefreshCw
              size={14}
              style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}
            />
            Refresh
          </button>

          {/* Logout all */}
          {otherSessions.length > 0 && (
            <button
              onClick={() => setConfirmAll(true)}
              disabled={revokingAll}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        6,
                padding:    '8px 14px',
                borderRadius: 10,
                background:  'rgba(239,68,68,0.08)',
                border:      '1px solid rgba(239,68,68,0.25)',
                color:       '#f87171',
                fontSize:    13,
                fontWeight:  600,
                cursor:      revokingAll ? 'not-allowed' : 'pointer',
                opacity:     revokingAll ? 0.6 : 1,
              }}
            >
              {revokingAll
                ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} />
                : <LogOut size={14} />
              }
              Logout All Other Devices
            </button>
          )}
        </div>
      </div>

      {/* Confirm revoke-all dialog */}
      {confirmAll && (
        <div
          style={{
            background:   'rgba(239,68,68,0.06)',
            border:       '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12,
            padding:      '14px 18px',
            marginBottom: 16,
            display:      'flex',
            alignItems:   'center',
            gap:          12,
            flexWrap:     'wrap',
          }}
        >
          <AlertTriangle size={16} color="#f87171" style={{ flexShrink: 0 }} />
          <span style={{ color: '#fca5a5', fontSize: 13, flex: 1 }}>
            This will immediately log out all <strong>{otherSessions.length}</strong> other device(s).
            Continue?
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setConfirmAll(false)}
              style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleRevokeAll}
              style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Sessions list */}
      <SectionCard title="Sessions">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  height:       72,
                  borderRadius: 14,
                  background:   'rgba(255,255,255,0.04)',
                  animation:    'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
            <Shield size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <p style={{ fontSize: 14 }}>No active sessions found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Current session first */}
            {sessions
              .slice()
              .sort((a, b) => (b.is_current ? 1 : 0) - (a.is_current ? 1 : 0))
              .map(session => (
                <SessionCard
                  key={session.session_id}
                  session={session}
                  onRevoke={handleRevoke}
                  revoking={revoking}
                />
              ))
            }
          </div>
        )}
      </SectionCard>

      {/* Info footer */}
      <div
        style={{
          marginTop:    16,
          padding:      '12px 16px',
          borderRadius: 10,
          background:   'rgba(99,102,241,0.05)',
          border:       '1px solid rgba(99,102,241,0.12)',
          display:      'flex',
          gap:          10,
          alignItems:   'flex-start',
        }}
      >
        <Shield size={14} color="#818cf8" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          Sessions automatically expire after 24 hours of inactivity. If you notice an
          unfamiliar device, revoke it immediately and change your password.
        </p>
      </div>
    </div>
  )
}
