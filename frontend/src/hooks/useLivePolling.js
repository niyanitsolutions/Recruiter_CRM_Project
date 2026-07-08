/**
 * useLivePolling (Task 8)
 *
 * Silently re-runs a fetch function on an interval so list/dashboard data
 * stays current without a visible page refresh or loading-spinner flicker.
 * Pauses while the tab is hidden (no point burning requests in the background)
 * and resumes immediately on refocus.
 *
 * In-flight guard: skips a tick (or the refocus refresh) if the previous call
 * to `fn` hasn't resolved yet, so a slow response can never overlap with the
 * next poll — avoids piling up duplicate concurrent requests and the resulting
 * risk of a stale response landing after a newer one.
 */
import { useEffect, useRef } from 'react'

const DEFAULT_INTERVAL_MS = 5000

export function useLivePolling(fn, intervalMs = DEFAULT_INTERVAL_MS, enabled = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return

    let timer = null
    let stopped = false
    let inFlight = false

    const runIfIdle = () => {
      if (inFlight) return
      inFlight = true
      Promise.resolve(fnRef.current())
        .catch(() => {})
        .finally(() => { inFlight = false })
    }

    const tick = () => {
      if (stopped) return
      if (!document.hidden) runIfIdle()
      timer = setTimeout(tick, intervalMs)
    }

    timer = setTimeout(tick, intervalMs)

    const onVisible = () => {
      if (!document.hidden) runIfIdle()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, enabled])
}
