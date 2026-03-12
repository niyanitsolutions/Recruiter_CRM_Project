/**
 * useAutoLogout
 *
 * Handles two independent logout triggers:
 *
 * 1. SCREEN-LOCK / SLEEP DETECTION (Part 1)
 *    Uses visibilitychange + blur/focus to record when the browser tab
 *    becomes hidden.  On return, if the tab was hidden for > LOCK_MS (5 min),
 *    the session is terminated immediately.
 *
 * 2. IDLE TIMEOUT (Part 2)
 *    A 30-minute countdown resets on any user activity (mousemove, keydown,
 *    scroll, click, touchstart).  Expiry triggers logout.
 *    On mount, the stored last_activity timestamp is checked so a browser
 *    refresh after a long idle is also caught.
 *
 * 3. MULTI-TAB SYNC (Part 4)
 *    BroadcastChannel propagates logout to every open tab so they all
 *    redirect to /login without making redundant API calls.
 *
 * Memory-safe: all listeners and timers are removed on unmount / when
 * isAuthenticated becomes false.
 */

import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { logout, logoutUser, selectIsAuthenticated } from '../store/authSlice'

// ── Thresholds ─────────────────────────────────────────────────────────────────
const IDLE_MS     = 30 * 60 * 1000   // 30 minutes — idle while screen is on
const LOCK_MS     =  5 * 60 * 1000   // 5  minutes — screen lock / sleep grace

// ── localStorage keys ──────────────────────────────────────────────────────────
// 'last_activity' is the same key used by authSlice startup check (safety net)
const ACTIVITY_KEY  = 'last_activity'
const HIDDEN_AT_KEY = 'crm_hidden_at'

// ── BroadcastChannel name ──────────────────────────────────────────────────────
const BC_CHANNEL = 'crm_session'

// ── Activity events to track ───────────────────────────────────────────────────
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart']

export function useAutoLogout() {
  const dispatch        = useDispatch()
  const navigate        = useNavigate()
  const isAuthenticated = useSelector(selectIsAuthenticated)

  // Stable refs — safe to access inside event callbacks without re-registering
  const timerRef = useRef(null)
  const bcRef    = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) return

    // ── Core logout action ────────────────────────────────────────────────────
    // Calls the backend to stamp logout_at, clears Redux/localStorage, redirects.
    // Also broadcasts to sibling tabs so they logout without a second API call.
    const doLogout = (reason) => {
      clearTimeout(timerRef.current)
      localStorage.removeItem(HIDDEN_AT_KEY)

      try { bcRef.current?.postMessage({ type: 'logout', reason }) } catch (_) {}

      dispatch(logoutUser())                      // POST /auth/logout → clear state
      navigate('/login', { replace: true })
    }

    // ── Idle timer management ─────────────────────────────────────────────────
    // Called on every user activity event.  Writes last_activity so the
    // authSlice startup check (safety net) stays current too.
    const resetIdle = () => {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString())
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => doLogout('idle'), IDLE_MS)
    }

    // ── Screen-lock / sleep detection ─────────────────────────────────────────
    // Record the moment the tab is hidden.  On return, compare elapsed time.
    const onHide = () => {
      // Only stamp once — don't overwrite if already set (e.g. blur fires
      // right before visibilitychange on the same event sequence).
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
      resetIdle()   // user is back — reset the idle clock
    }

    const onVisibilityChange = () => {
      if (document.hidden) onHide()
      else onShow()
    }

    // blur fires when the OS focus leaves the browser (e.g. switching apps,
    // locking screen).  It is a secondary signal; visibilitychange is primary.
    const onBlur  = () => onHide()
    const onFocus = () => onShow()

    // ── Early idle check (handles refresh during idle) ────────────────────────
    // If the page was refreshed after a long idle period, log out immediately
    // before registering any listeners.
    const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10)
    if (lastActivity && Date.now() - lastActivity > IDLE_MS) {
      doLogout('idle')
      return   // listeners not yet registered — no cleanup needed
    }

    // ── Multi-tab BroadcastChannel ────────────────────────────────────────────
    // Receive logout events from sibling tabs.  Only wipe local state here —
    // the originating tab already called the API.
    try {
      bcRef.current = new BroadcastChannel(BC_CHANNEL)
      bcRef.current.onmessage = (e) => {
        if (e.data?.type === 'logout') {
          clearTimeout(timerRef.current)
          dispatch(logout())                      // sync reducer, no API call
          navigate('/login', { replace: true })
        }
      }
    } catch (_) {
      // BroadcastChannel not supported (very old browsers) — fail silently
    }

    // ── Register all listeners ────────────────────────────────────────────────
    ACTIVITY_EVENTS.forEach(ev =>
      window.addEventListener(ev, resetIdle, { passive: true })
    )
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur',  onBlur)
    window.addEventListener('focus', onFocus)

    // Kick off the idle countdown
    resetIdle()

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(ev =>
        window.removeEventListener(ev, resetIdle)
      )
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur',  onBlur)
      window.removeEventListener('focus', onFocus)
      try { bcRef.current?.close() } catch (_) {}
    }
  }, [isAuthenticated, dispatch, navigate])
}
