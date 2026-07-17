/**
 * useAutoLogout
 *
 * After EXPIRE_MS of true inactivity (no mouse / keyboard / scroll / touch
 * activity), the session expires: auth is cleared and the user is redirected
 * to /login. A "Session Expired" modal is shown via the session:expired event.
 *
 * What does NOT trigger expiry:
 *   - Screenshot / Snipping Tool / Print Screen
 *   - Alt+Tab / browser tab switch / window blur
 *   - visibilitychange
 *   - Any temporary focus loss
 *
 * Multi-device: BroadcastChannel propagates logout to all open tabs so a
 * forced logout on one device clears all other tabs immediately.
 *
 * Memory-safe: all timers and listeners are cleaned up on unmount.
 */

import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { logout, logoutUser, selectIsAuthenticated } from '../store/authSlice'

// ── Threshold ─────────────────────────────────────────────────────────────────
// Inactivity window: the session expires after this long with no REAL user
// interaction (see ACTIVITY_EVENTS below). Background traffic — notification
// polling, WebSocket heartbeat, token refresh, dashboard polling — never
// touches this timer, so "activity" always means a real person.
const EXPIRE_MS = 10 * 60 * 1000   // 10 min of no activity

// ── localStorage / BroadcastChannel keys ──────────────────────────────────────
const ACTIVITY_KEY = 'last_activity'
const BC_CHANNEL   = 'crm_session'

// ── Activity events that reset the idle timer ─────────────────────────────────
// Intentionally excludes: visibilitychange, blur, focus (tab-switch / screenshot)
const ACTIVITY_EVENTS = ['mousemove', 'click', 'mousedown', 'keydown', 'scroll', 'touchstart']

export function useAutoLogout() {
  const dispatch        = useDispatch()
  const navigate        = useNavigate()
  const isAuthenticated = useSelector(selectIsAuthenticated)

  const idleTimerRef = useRef(null)
  const bcRef        = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) return

    // ── Expire (called after EXPIRE_MS of true inactivity) ───────────────────
    const doExpire = (broadcast = true) => {
      clearTimeout(idleTimerRef.current)
      localStorage.removeItem(ACTIVITY_KEY)

      if (broadcast) {
        try { bcRef.current?.postMessage({ type: 'logout', reason: 'idle' }) } catch (_) {}
      }

      window.dispatchEvent(new CustomEvent('session:expired', { detail: { reason: 'idle' } }))
      dispatch(logout())
      dispatch(logoutUser())
      navigate('/login', { replace: true })
    }

    // ── Idle timer ────────────────────────────────────────────────────────────
    const resetIdle = () => {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString())
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => doExpire(true), EXPIRE_MS)
    }

    // ── Multi-tab BroadcastChannel ────────────────────────────────────────────
    try {
      bcRef.current = new BroadcastChannel(BC_CHANNEL)
      bcRef.current.onmessage = (e) => {
        const type = e.data?.type
        if (type === 'logout') {
          clearTimeout(idleTimerRef.current)
          dispatch(logout())
          navigate('/login', { replace: true })
        }
      }
    } catch (_) {}

    // ── Register activity listeners ───────────────────────────────────────────
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }))

    // ── Early stale-session check on page refresh ─────────────────────────────
    const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10)
    if (lastActivity && Date.now() - lastActivity >= EXPIRE_MS) {
      doExpire(true)
    } else {
      resetIdle()
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      clearTimeout(idleTimerRef.current)
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetIdle))
      try { bcRef.current?.close() } catch (_) {}
    }
  }, [isAuthenticated, dispatch, navigate])
}
