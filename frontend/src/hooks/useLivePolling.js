/**
 * useLivePolling (Task 8)
 *
 * Silently re-runs a fetch function on an interval so list/dashboard data
 * stays current without a visible page refresh or loading-spinner flicker.
 * Pauses while the tab is hidden (no point burning requests in the background)
 * and resumes immediately on refocus.
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

    const tick = () => {
      if (stopped) return
      if (!document.hidden) {
        Promise.resolve(fnRef.current()).catch(() => {})
      }
      timer = setTimeout(tick, intervalMs)
    }

    timer = setTimeout(tick, intervalMs)

    const onVisible = () => {
      if (!document.hidden) {
        Promise.resolve(fnRef.current()).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, enabled])
}
