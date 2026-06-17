/**
 * useAutoLogout
 *
 * Enterprise-grade idle-session manager.  Handles:
 *
 * 1. SESSION LOCK  (Part 2 — reworked)
 *    After LOCK_MS of true inactivity (no mouse/keyboard/touch/click activity,
 *    no page interaction, and no in-flight API requests), the session is
 *    LOCKED — not logged out. Fires `session:lock` so the app can show a
 *    password-only unlock overlay over the current page. The user resumes
 *    exactly where they were after re-entering their password (no re-login).
 *
 * 2. SCREEN-LOCK / SLEEP DETECTION  (Part 7 — reworked)
 *    visibilitychange + blur/focus: records when the tab is hidden/unfocused.
 *    On return, if hidden for > LOCK_MS, lock the session (same as above,
 *    not a logout). Short tab switches / focus changes under LOCK_MS never
 *    trigger anything.
 *
 * 3. MULTI-TAB SYNC
 *    BroadcastChannel: locking/unlocking in one tab propagates to all open
 *    tabs for the same browser profile, since they share one session.
 *
 * 4. UNLOCK
 *    `session:unlock` (dispatched by SessionLockOverlay after the backend
 *    verifies the user's password) clears the lock and resets the idle
 *    clock — no token refresh or re-login involved.
 *
 * Memory-safe: all timers and listeners are cleaned up on unmount.
 */

import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { logout, logoutUser, selectIsAuthenticated } from '../store/authSlice'
import { hasPendingRequests } from '../services/api'

// ── Thresholds ──────────────────────────────────────────────────────────────────
const LOCK_MS       = 5 * 60 * 1000   // 5 min  — true-inactivity lock threshold
const PENDING_RETRY_MS = 3 * 1000     // re-check this often if a request is in flight
const PENDING_RETRY_MAX = 10          // give up waiting after ~30s and lock anyway

// ── localStorage / BroadcastChannel keys ───────────────────────────────────────
const ACTIVITY_KEY  = 'last_activity'
const HIDDEN_AT_KEY = 'crm_hidden_at'
const BC_CHANNEL    = 'crm_session'

// ── Activity events to track ────────────────────────────────────────────────────
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart', 'pointerdown']

export function useAutoLogout() {
  const dispatch        = useDispatch()
  const navigate         = useNavigate()
  const isAuthenticated = useSelector(selectIsAuthenticated)

  const idleTimerRef    = useRef(null)
  const bcRef           = useRef(null)
  const lockedRef       = useRef(false)
  const pendingRetries  = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return

    // ── Lock (called when true inactivity reaches LOCK_MS) ────────────────────
    const doLock = (broadcast = true) => {
      if (lockedRef.current) return

      // Don't interrupt an in-flight request (e.g. a slow save) — recheck soon.
      if (hasPendingRequests() && pendingRetries.current < PENDING_RETRY_MAX) {
        pendingRetries.current += 1
        idleTimerRef.current = setTimeout(() => doLock(broadcast), PENDING_RETRY_MS)
        return
      }
      pendingRetries.current = 0

      lockedRef.current = true
      clearTimeout(idleTimerRef.current)
      localStorage.removeItem(HIDDEN_AT_KEY)

      window.dispatchEvent(new CustomEvent('session:lock'))
      if (broadcast) {
        try { bcRef.current?.postMessage({ type: 'lock' }) } catch (_) {}
      }
    }

    // ── Unlock (password verified, or synced from another tab) ───────────────
    const doUnlock = (broadcast = true) => {
      if (!lockedRef.current) return
      lockedRef.current = false
      window.dispatchEvent(new CustomEvent('session:unlocked'))
      if (broadcast) {
        try { bcRef.current?.postMessage({ type: 'unlock' }) } catch (_) {}
      }
      resetIdle()
    }

    // ── Full logout (only for remote/token reasons triggered elsewhere) ───────
    const doLogout = (reason) => {
      clearTimeout(idleTimerRef.current)
      localStorage.removeItem(HIDDEN_AT_KEY)
      try { bcRef.current?.postMessage({ type: 'logout', reason }) } catch (_) {}
      window.dispatchEvent(new CustomEvent('session:expired', { detail: { reason } }))
      dispatch(logout())
      dispatch(logoutUser())
      navigate('/login', { replace: true })
    }

    // ── Idle timer management ─────────────────────────────────────────────────
    const resetIdle = () => {
      if (lockedRef.current) return   // ignore activity while the lock overlay is up
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString())
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => doLock(true), LOCK_MS)
    }

    // ── Screen-lock / sleep / tab-switch detection ────────────────────────────
    const onHide = () => {
      if (!localStorage.getItem(HIDDEN_AT_KEY)) {
        localStorage.setItem(HIDDEN_AT_KEY, Date.now().toString())
      }
    }

    const onShow = () => {
      if (lockedRef.current) return
      const hiddenAt = parseInt(localStorage.getItem(HIDDEN_AT_KEY) || '0', 10)
      if (hiddenAt && Date.now() - hiddenAt >= LOCK_MS) {
        doLock(true)
        return
      }
      localStorage.removeItem(HIDDEN_AT_KEY)
      resetIdle()
    }

    const onVisibilityChange = () => {
      if (document.hidden) onHide()
      else onShow()
    }

    // ── Manual unlock event (from SessionLockOverlay) ─────────────────────────
    const onUnlockEvent = () => doUnlock(true)

    // ── "Stay Logged In" / extend (kept for compatibility with other flows) ───
    const onExtend = () => resetIdle()

    // ── Early idle check on page refresh ─────────────────────────────────────
    const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10)
    const staleOnLoad = lastActivity && Date.now() - lastActivity >= LOCK_MS

    // ── Multi-tab BroadcastChannel ────────────────────────────────────────────
    try {
      bcRef.current = new BroadcastChannel(BC_CHANNEL)
      bcRef.current.onmessage = (e) => {
        const type = e.data?.type
        if (type === 'lock') doLock(false)
        else if (type === 'unlock') doUnlock(false)
        else if (type === 'logout') {
          clearTimeout(idleTimerRef.current)
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
    window.addEventListener('session:extend',   onExtend)
    window.addEventListener('session:unlock',   onUnlockEvent)

    // Kick off the counters (or lock immediately if already stale on load)
    if (staleOnLoad) doLock(true)
    else resetIdle()

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      clearTimeout(idleTimerRef.current)
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetIdle))
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur',  onHide)
      window.removeEventListener('focus', onShow)
      window.removeEventListener('session:extend',   onExtend)
      window.removeEventListener('session:unlock',   onUnlockEvent)
      try { bcRef.current?.close() } catch (_) {}
    }
  }, [isAuthenticated, dispatch, navigate])
}
