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
 *
 * Optional `topics`: subscribes to liveUpdateBus so a mutation elsewhere
 * (e.g. another page creating/deleting a user) triggers an immediate refetch
 * here instead of waiting for the next interval tick. The interval timer is
 * reset after an event-triggered run so it doesn't also fire moments later
 * (avoids a redundant duplicate request right after the nudge).
 */
import { useEffect, useRef } from 'react'
import { subscribe } from '../utils/liveUpdateBus'

const DEFAULT_INTERVAL_MS = 5000

export function useLivePolling(fn, intervalMs = DEFAULT_INTERVAL_MS, enabled = true, topics = null) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const topicsKey = Array.isArray(topics) ? topics.join(',') : ''

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

    const scheduleNext = () => {
      clearTimeout(timer)
      timer = setTimeout(tick, intervalMs)
    }

    function tick() {
      if (stopped) return
      if (!document.hidden) runIfIdle()
      scheduleNext()
    }

    timer = setTimeout(tick, intervalMs)

    const onVisible = () => {
      if (!document.hidden) runIfIdle()
    }
    document.addEventListener('visibilitychange', onVisible)

    const unsubs = topicsKey
      ? topicsKey.split(',').map((topic) => subscribe(topic, () => {
          if (stopped || document.hidden) return
          runIfIdle()
          scheduleNext() // push the next scheduled tick out — no point re-fetching again in a few ms
        }))
      : []

    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      unsubs.forEach((u) => u())
    }
  }, [intervalMs, enabled, topicsKey])
}
