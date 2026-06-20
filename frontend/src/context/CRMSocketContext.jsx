/**
 * CRMSocketContext — app-wide singleton WebSocket + fallback polling.
 *
 * Wrap the authenticated part of the app with <CRMSocketProvider> so every
 * component can call useCRMEvents() without each creating its own socket.
 *
 * Fallback polling:
 *   When the socket is disconnected, components that register a poll callback
 *   via registerPollFallback() are called every 30 s.  Once the socket
 *   reconnects, polling stops automatically.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectIsSuperAdmin, selectIsSeller } from '../store/authSlice'
import { useCRMSocket } from '../hooks/useCRMSocket'

const POLL_INTERVAL = 30_000  // 30 s fallback polling interval

const CRMSocketContext = createContext(null)

export function CRMSocketProvider({ children }) {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const isSuperAdmin    = useSelector(selectIsSuperAdmin)
  const isSeller        = useSelector(selectIsSeller)

  // Only connect for company users (not super admin or seller)
  const shouldConnect = isAuthenticated && !isSuperAdmin && !isSeller

  const { isConnected, subscribe, unsubscribe } = useCRMSocket({ enabled: shouldConnect })

  // Poll fallback registry: callback → intervalId
  const pollCallbacksRef = useRef(new Set())
  const pollTimerRef     = useRef(null)

  // Start/stop 30-second fallback polling based on socket state
  useEffect(() => {
    if (!shouldConnect) return
    if (isConnected) {
      // Socket is live — stop polling
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    } else {
      // Socket down — start polling if not already running
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(() => {
          pollCallbacksRef.current.forEach(cb => { try { cb() } catch {} })
        }, POLL_INTERVAL)
      }
    }
    return () => {}
  }, [isConnected, shouldConnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => { clearInterval(pollTimerRef.current) }
  }, [])

  const registerPollFallback = useCallback((cb) => {
    pollCallbacksRef.current.add(cb)
    return () => { pollCallbacksRef.current.delete(cb) }
  }, [])

  const value = {
    isConnected: shouldConnect && isConnected,
    subscribe,
    unsubscribe,
    registerPollFallback,
  }

  return (
    <CRMSocketContext.Provider value={value}>
      {children}
    </CRMSocketContext.Provider>
  )
}

/**
 * Hook for components to subscribe to real-time events.
 *
 * @param {string} eventType - Event name (e.g. 'task.updated') or '*' for all
 * @param {Function} callback - Called with event data when the event fires
 * @param {Function} [pollFallback] - Called every 30 s when socket is down
 * @param {Array} deps - Effect dependencies (like useEffect deps)
 */
export function useCRMEvents(eventType, callback, pollFallback, deps = []) {
  const ctx = useContext(CRMSocketContext)

  useEffect(() => {
    if (!ctx) return
    const offWs = ctx.subscribe(eventType, callback)
    const offPoll = pollFallback ? ctx.registerPollFallback(pollFallback) : null
    return () => {
      offWs()
      if (offPoll) offPoll()
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useCRMSocketContext() {
  return useContext(CRMSocketContext)
}
