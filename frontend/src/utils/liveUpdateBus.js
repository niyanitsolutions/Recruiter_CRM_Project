/**
 * liveUpdateBus — in-memory pub/sub used to trigger an immediate refetch on
 * whichever pages are mounted right now, right after a mutation succeeds
 * elsewhere, instead of waiting for the next polling tick (up to 5s away).
 *
 * This does not replace useLivePolling's interval (kept as-is, unchanged) —
 * it just lets a successful mutation "nudge" any subscribed pollers to run
 * now. Cross-tab/cross-session updates (another user's action) still arrive
 * within one polling interval, same as before.
 */
const listeners = new Map() // topic -> Set<callback>

export function publish(topic) {
  const set = listeners.get(topic)
  if (!set) return
  set.forEach((cb) => {
    try { cb(topic) } catch { /* listener errors must not break other listeners */ }
  })
}

export function publishAll(topics) {
  topics.forEach(publish)
}

export function subscribe(topic, cb) {
  let set = listeners.get(topic)
  if (!set) { set = new Set(); listeners.set(topic, set) }
  set.add(cb)
  return () => { set.delete(cb) }
}

export const LIVE_TOPICS = {
  USERS:      'users',
  EMPLOYEES:  'employees',
  CANDIDATES: 'candidates',
  ATTENDANCE: 'attendance',
  AUTH:       'auth',
  DASHBOARD:  'dashboard',
  CALENDAR:   'calendar',
}
