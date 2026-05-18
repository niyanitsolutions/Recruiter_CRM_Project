/**
 * useSessionWebSocket
 *
 * Maintains a persistent WebSocket to the backend /ws/session endpoint
 * while the user is authenticated.  Handles all session-lifecycle events
 * and translates them into CustomEvents that the rest of the app consumes:
 *
 *  session_revoked      → 'session:expired'       (reason='remote')
 *  all_sessions_revoked → 'session:expired'       (reason='remote', only if THIS session was revoked)
 *  login_request        → 'session:login_request' (Device A shows approval modal)
 *  login_approved       → 'session:expired' reason='approved' (Device A cleanly ends session)
 *  login_denied         → 'session:login_denied'   (Device B shows denial message)
 *  ping                 → silently ignored
 *
 * Reconnection: exponential backoff starting at 1 s, capped at 30 s.
 *               4001 (invalid/expired token) is a permanent error — no retry.
 *
 * Heartbeat: POST /sessions/heartbeat every 5 minutes to keep the session
 *            alive in the DB and to poll for pending login requests as a
 *            fallback when the WS missed the push notification.
 */

import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectToken } from '../store/authSlice'
import { parseToken } from '../utils/token'
import api from '../services/api'

const HEARTBEAT_MS   = 5 * 60 * 1000   // 5 minutes
const RECONNECT_BASE = 1_000            // initial backoff
const RECONNECT_MAX  = 30_000           // cap backoff at 30 s

/** Convert the HTTP API base URL to a WebSocket base URL. */
function getWsBase() {
  const apiUrl = import.meta.env.VITE_API_URL || '/api/v1'
  if (apiUrl.startsWith('http://'))  return apiUrl.replace('http://',  'ws://')
  if (apiUrl.startsWith('https://')) return apiUrl.replace('https://', 'wss://')
  // Relative URL — derive from window.location
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${apiUrl}`
}

export function useSessionWebSocket() {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const token           = useSelector(selectToken)

  const wsRef           = useRef(null)
  const reconnectTimer  = useRef(null)
  const heartbeatTimer  = useRef(null)
  const backoffMs       = useRef(RECONNECT_BASE)
  const unmounted       = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !token) return
    unmounted.current = false

    // ── Derive the current session's JTI from the access token ───────────────
    // Used to decide whether 'all_sessions_revoked' applies to this device.
    const currentJti = parseToken(token)?.jti || null

    // ── WS connection ─────────────────────────────────────────────────────────
    const connect = () => {
      if (unmounted.current) return

      try {
        const ws = new WebSocket(
          `${getWsBase()}/ws/session?token=${encodeURIComponent(token)}`
        )
        wsRef.current = ws

        ws.onopen = () => {
          backoffMs.current = RECONNECT_BASE  // reset backoff on first success
        }

        ws.onmessage = (event) => {
          let msg
          try { msg = JSON.parse(event.data) } catch { return }

          switch (msg.type) {
            case 'session_revoked':
              // Only log out THIS device if its JTI matches
              if (!currentJti || msg.session_id === currentJti) {
                window.dispatchEvent(new CustomEvent('session:expired', {
                  detail: { reason: 'remote', message: msg.message },
                }))
              }
              break

            case 'all_sessions_revoked':
              // Log out if this device is NOT the one that initiated the revoke
              if (currentJti && msg.except !== currentJti) {
                window.dispatchEvent(new CustomEvent('session:expired', {
                  detail: { reason: 'remote', message: msg.message },
                }))
              }
              break

            case 'login_request':
              window.dispatchEvent(new CustomEvent('session:login_request', {
                detail: {
                  requestId:    msg.request_id,
                  deviceInfo:   msg.device_info   || '',
                  ipAddress:    msg.ip_address     || '',
                  requestedAt:  msg.requested_at   || null,
                  message:      msg.message        || '',
                },
              }))
              break

            case 'login_approved':
              // This device (Device A) approved access for another device.
              // The backend already revoked this session — signal a clean end.
              // SessionExpiryModal will show "You approved access for another device."
              window.dispatchEvent(new CustomEvent('session:expired', {
                detail: { reason: 'approved', message: 'You approved access for another device.' },
              }))
              break

            case 'login_denied':
              window.dispatchEvent(new CustomEvent('session:login_denied', {
                detail: { requestId: msg.request_id },
              }))
              break

            case 'ping':
              // Server keepalive — no response needed
              break

            default:
              break
          }
        }

        ws.onclose = (event) => {
          if (unmounted.current) return
          // 4001 = rejected by server (bad/expired token) — don't retry
          if (event.code === 4001) return
          scheduleReconnect()
        }

        ws.onerror = () => {
          // onclose fires after onerror — reconnect is handled there
        }
      } catch {
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (unmounted.current) return
      reconnectTimer.current = setTimeout(() => {
        backoffMs.current = Math.min(backoffMs.current * 2, RECONNECT_MAX)
        connect()
      }, backoffMs.current)
    }

    // ── Session heartbeat ─────────────────────────────────────────────────────
    // Keeps the DB session alive and polls for pending login requests as a
    // fallback for when WS is temporarily disconnected.
    const runHeartbeat = async () => {
      if (unmounted.current) return
      try {
        const res     = await api.post('/sessions/heartbeat')
        const pending = res.data?.pending_request
        if (pending) {
          // Device A has a pending approval that arrived through DB polling
          // (fallback when the real-time WS push was missed)
          window.dispatchEvent(new CustomEvent('session:login_request', {
            detail: {
              requestId:    pending.request_id,
              deviceInfo:   pending.device_info  || '',
              ipAddress:    pending.ip_address   || '',
              requestedAt:  pending.requested_at || null,
              message:      'Someone is requesting access to your account.',
              fromHeartbeat: true,
            },
          }))
        }
      } catch {
        // Heartbeat errors are silent — session expiry is handled by api.js
      }
      if (!unmounted.current) {
        heartbeatTimer.current = setTimeout(runHeartbeat, HEARTBEAT_MS)
      }
    }

    connect()
    // Stagger the first heartbeat so it doesn't race with initial WS connect
    heartbeatTimer.current = setTimeout(runHeartbeat, 10_000)

    return () => {
      unmounted.current = true
      clearTimeout(reconnectTimer.current)
      clearTimeout(heartbeatTimer.current)
      try { wsRef.current?.close() } catch (_) {}
      wsRef.current = null
    }
  }, [isAuthenticated, token])
}
