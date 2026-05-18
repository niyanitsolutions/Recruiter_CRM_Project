/**
 * useAutoLogout
 *
 * Enterprise-grade idle-session manager.  Handles:
 *
 * 1. SESSION WARNING  (Part 2)
 *    Fires a `session:warning` CustomEvent 2 minutes before the idle limit
 *    so the app can show a "Session expiring soon" modal.
 *    If the user clicks "Stay Logged In", dispatch `session:extend` → this
 *    hook resets the idle clock without any page reload.
 *
 * 2. IDLE TIMEOUT  (Part 2)
 *    Full logout after IDLE_MS of inactivity.  Fires `session:expired` with
 *    reason="idle" so the app shows an "Session Expired" modal instead of a
 *    silent redirect.
 *
 * 3. SCREEN-LOCK / SLEEP DETECTION  (Part 7)
 *    visibilitychange + blur/focus: records when the tab is hidden.  On
 *    return after > LOCK_MS, logout immediately (no warning needed).
 *
 * 4. MULTI-TAB SYNC  (Part 7)
 *    BroadcastChannel: logout on one tab propagates to all open tabs.
 *    The receiving tab wipes local state only — no duplicate API call.
 *
 * 5. SMART AUTO-ALLOW  (Part 7)
 *    If the existing session's last_activity is older than SMART_ALLOW_MS
 *    at login time, the backend will find no active session; this hook does
 *    not need to do anything extra for that case.
 *
 * Memory-safe: all timers and listeners are cleaned up on unmount.
 */

import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { logout, logoutUser, selectIsAuthenticated } from '../store/authSlice'

// ── Thresholds ──────────────────────────────────────────────────────────────────
const IDLE_MS     = 30 * 60 * 1000   // 30 min  — full idle timeout
const WARNING_MS  =  2 * 60 * 1000   // 2 min   — warning fires this early
const LOCK_MS     =  5 * 60 * 1000   // 5 min   — screen-lock grace period

// ── localStorage / BroadcastChannel keys ───────────────────────────────────────
const ACTIVITY_KEY  = 'last_activity'
const HIDDEN_AT_KEY = 'crm_hidden_at'
const BC_CHANNEL    = 'crm_session'

// ── Activity events to track ────────────────────────────────────────────────────
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart', 'pointerdown']

export function useAutoLogout() {
  const dispatch        = useDispatch()
  const navigate        = useNavigate()
  const isAuthenticated = useSelector(selectIsAuthenticated)

  const idleTimerRef    = useRef(null)
  const warnTimerRef    = useRef(null)
  const warnShownRef    = useRef(false)   // prevent duplicate warning events
  const bcRef           = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) return

    // ── Core logout (idle / lock) ─────────────────────────────────────────────
    const doLogout = (reason) => {
      clearTimeout(idleTimerRef.current)
      clearTimeout(warnTimerRef.current)
      warnShownRef.current = false
      localStorage.removeItem(HIDDEN_AT_KEY)

      // Broadcast so sibling tabs also log out
      try { bcRef.current?.postMessage({ type: 'logout', reason }) } catch (_) {}

      // Emit event so App.jsx can show the proper modal before navigating
      window.dispatchEvent(new CustomEvent('session:expired', { detail: { reason } }))

      dispatch(logoutUser())
      navigate('/login', { replace: true })
    }

    // ── Warning (fires WARNING_MS before idle expiry) ─────────────────────────
    const doWarn = () => {
      if (warnShownRef.current) return
      warnShownRef.current = true
      window.dispatchEvent(new CustomEvent('session:warning'))
    }

    // ── Idle timer management ─────────────────────────────────────────────────
    const resetIdle = () => {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString())

      // Dismiss any active warning when the user resumes activity
      if (warnShownRef.current) {
        warnShownRef.current = false
        window.dispatchEvent(new CustomEvent('session:warning:dismiss'))
      }

      clearTimeout(idleTimerRef.current)
      clearTimeout(warnTimerRef.current)

      // Set warning timer first, then full-logout timer
      warnTimerRef.current = setTimeout(doWarn,    IDLE_MS - WARNING_MS)
      idleTimerRef.current = setTimeout(() => doLogout('idle'), IDLE_MS)
    }

    // ── Screen-lock / sleep detection ─────────────────────────────────────────
    const onHide = () => {
      if (!localStorage.getItem(HIDDEN_AT_KEY)) {
        localStorage.setItem(HIDDEN_AT_KEY, Date.now().toString())
      }
    }

    const onShow = () => {
      const hiddenAt = parseInt(localStorage.getItem(HIDDEN_AT_KEY) || '0', 10)
      if (hiddenAt && Date.now() - hiddenAt > LOCK_MS) {
        doLogout('lock')
        return
      }
      localStorage.removeItem(HIDDEN_AT_KEY)
      resetIdle()
    }

    const onVisibilityChange = () => {
      if (document.hidden) onHide()
      else onShow()
    }

    // ── "Stay Logged In" handler (from SessionWarningModal via App.jsx) ───────
    // App.jsx dispatches `session:extend` after refreshing the token.
    const onExtend = () => {
      warnShownRef.current = false
      resetIdle()
    }

    // ── Early idle check on page refresh ─────────────────────────────────────
    const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10)
    if (lastActivity && Date.now() - lastActivity > IDLE_MS) {
      doLogout('idle')
      return   // listeners not registered yet — no cleanup needed
    }

    // ── Multi-tab BroadcastChannel ────────────────────────────────────────────
    try {
      bcRef.current = new BroadcastChannel(BC_CHANNEL)
      bcRef.current.onmessage = (e) => {
        if (e.data?.type === 'logout') {
          clearTimeout(idleTimerRef.current)
          clearTimeout(warnTimerRef.current)
          dispatch(logout())
          navigate('/login', { replace: true })
        }
      }
    } catch (_) {}

    // ── Register all listeners ────────────────────────────────────────────────
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }))
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur',  onHide)
    window.addEventListener('focus', onShow)
    window.addEventListener('session:extend', onExtend)

    // Kick off the counters
    resetIdle()

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      clearTimeout(idleTimerRef.current)
      clearTimeout(warnTimerRef.current)
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetIdle))
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur',  onHide)
      window.removeEventListener('focus', onShow)
      window.removeEventListener('session:extend', onExtend)
      try { bcRef.current?.close() } catch (_) {}
    }
  }, [isAuthenticated, dispatch, navigate])
}
