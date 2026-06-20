/**
 * useCRMSocket — tenant-isolated real-time WebSocket hook
 *
 * Connects to /api/v1/crm/ws?token=<access_token>.
 * Reconnects automatically with exponential backoff (max 30 s).
 * Falls back to 30-second polling (via onDisconnected callback) when the
 * socket is not connected, and resumes WebSocket on reconnect.
 *
 * Tenant isolation: the server joins the connection to a company room —
 * events from other companies are never delivered to this client.
 *
 * Usage:
 *   const { isConnected, subscribe, unsubscribe } = useCRMSocket()
 *   useEffect(() => {
 *     const off = subscribe('task.updated', (data) => { ... })
 *     return off
 *   }, [subscribe])
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getToken } from '../utils/token'

const WS_BASE = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || '/api/v1'
  if (apiUrl.startsWith('http')) {
    return apiUrl.replace(/^http/, 'ws')
  }
  const origin = window.location.origin
  return origin.replace(/^http/, 'ws') + apiUrl
})()

const MIN_BACKOFF = 1000   // 1 s
const MAX_BACKOFF = 30000  // 30 s

export function useCRMSocket({ enabled = true } = {}) {
  const wsRef        = useRef(null)
  const backoffRef   = useRef(MIN_BACKOFF)
  const mountedRef   = useRef(true)
  const reconnectRef = useRef(null)
  const listenersRef = useRef({})  // event_type → Set<callback>
  const enabledRef   = useRef(enabled)
  enabledRef.current = enabled

  const [isConnected, setIsConnected] = useState(false)

  const dispatch = useCallback((event_type, data) => {
    const cbs = listenersRef.current[event_type]
    if (cbs) cbs.forEach(cb => { try { cb(data) } catch {} })
    // Also notify wildcard listeners
    const all = listenersRef.current['*']
    if (all) all.forEach(cb => { try { cb({ type: event_type, data }) } catch {} })
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (!enabledRef.current) return
    const token = getToken()
    if (!token) return

    const url = `${WS_BASE}/crm/ws?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        backoffRef.current = MIN_BACKOFF
        setIsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'ping' }))
            return
          }
          if (msg.type === 'connected') return
          if (msg.type && msg.data !== undefined) {
            dispatch(msg.type, msg.data)
          }
        } catch {}
      }

      ws.onerror = () => {}

      ws.onclose = () => {
        if (!mountedRef.current) return
        setIsConnected(false)
        wsRef.current = null
        // Only reconnect when still enabled
        if (!enabledRef.current) return
        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
        reconnectRef.current = setTimeout(connect, delay)
      }
    } catch {
      setIsConnected(false)
    }
  }, [dispatch])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      setIsConnected(false)
    }
  }, [connect])

  const subscribe = useCallback((event_type, callback) => {
    if (!listenersRef.current[event_type]) {
      listenersRef.current[event_type] = new Set()
    }
    listenersRef.current[event_type].add(callback)
    return () => {
      listenersRef.current[event_type]?.delete(callback)
    }
  }, [])

  const unsubscribe = useCallback((event_type, callback) => {
    listenersRef.current[event_type]?.delete(callback)
  }, [])

  return { isConnected, subscribe, unsubscribe }
}
