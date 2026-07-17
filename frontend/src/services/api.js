import axios from 'axios'
import { getToken, removeToken, removeUser } from '../utils/token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ── Request interceptor — attach auth token ───────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    // For multipart uploads: remove the instance-level Content-Type default so
    // the browser XHR can set multipart/form-data with the correct boundary.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Refresh-token deduplication state ─────────────────────────────────────────
let _isRefreshing = false
let _pendingQueue = []

const _processQueue = (error, token = null) => {
  _pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else       resolve(token)
  })
  _pendingQueue = []
}

/**
 * Hard logout: wipe local storage and fire a `session:expired` CustomEvent so
 * App.jsx can show the "Session Expired" modal instead of a silent redirect.
 * The modal's "Login Again" button handles the actual navigation to /login.
 * reason: 'token' | 'remote' | 'idle' | 'lock'
 */
const _emitExpiredAndLogout = (reason, message) => {
  removeToken()
  removeUser()
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('last_activity')

  window.dispatchEvent(new CustomEvent('session:expired', {
    detail: { reason, message }
  }))

  // Delayed hard redirect as a safety net — if the modal is dismissed or the
  // React tree is unmounted, ensure the user eventually reaches /login.
  setTimeout(() => {
    if (!localStorage.getItem('access_token')) {
      window.location.href = '/login'
    }
  }, 8000)
}

// ── Transient-failure retry (idempotent GETs only) ────────────────────────────
// A single dropped packet or a momentary 429/502/503/504 (nginx rate-limit or a
// backend restart) previously surfaced straight to the user as a failed page.
// GETs are idempotent, so retry them up to MAX_RETRIES times with a short
// backoff, honoring Retry-After when the server provides one.
// Deliberately NOT retried: mutations (POST/PUT/DELETE — no idempotency keys),
// 401s (handled by the token-refresh flow below), and client timeouts
// (ECONNABORTED — retrying piles more load onto an already-slow endpoint).
const MAX_RETRIES = 2
const RETRY_STATUS = new Set([429, 502, 503, 504])

const _isRetryableGet = (error) => {
  const cfg = error.config
  if (!cfg || (cfg.method || '').toLowerCase() !== 'get') return false
  if ((cfg._retryCount || 0) >= MAX_RETRIES) return false
  if (!error.response) {
    return error.code !== 'ECONNABORTED'   // network error yes, timeout no
  }
  return RETRY_STATUS.has(error.response.status)
}

const _retryDelayMs = (error, attempt) => {
  const retryAfter = parseInt(error.response?.headers?.['retry-after'], 10)
  if (!Number.isNaN(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 5000)   // honor server hint, cap at 5s
  }
  return attempt === 1 ? 500 : 1500
}

// ── Response interceptor ──────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // ── Transient errors on idempotent GETs — retry with backoff ─────────────
    if (_isRetryableGet(error)) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1
      const delay = _retryDelayMs(error, originalRequest._retryCount)
      await new Promise((r) => setTimeout(r, delay))
      return api(originalRequest)
    }

    // ── 401: Session terminated by another device ─────────────────────────────
    if (error.response?.status === 401) {
      const _detail = error.response.data?.detail
      if (_detail && typeof _detail === 'object' && _detail.sessionExpired === true) {
        _emitExpiredAndLogout(
          'remote',
          _detail.message || 'Your session was ended because this account logged in on another device.'
        )
        return Promise.reject(error)
      }
    }

    // ── 401 Unauthorized — attempt token refresh ──────────────────────────────
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Wrong credentials on auth endpoints — don't treat as session expiry
      const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
                             originalRequest.url?.includes('/auth/register')
      if (isAuthEndpoint) {
        return Promise.reject(error)
      }

      const storedRefresh = localStorage.getItem('refresh_token')

      if (!storedRefresh) {
        _emitExpiredAndLogout('token', 'Your session has expired. Please login again.')
        return Promise.reject(error)
      }

      // Another refresh is already in progress — queue this request
      if (_isRefreshing) {
        return new Promise((resolve, reject) => {
          _pendingQueue.push({ resolve, reject })
        })
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      // First failing request — start the refresh
      originalRequest._retry = true
      _isRefreshing = true

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`,
          { refresh_token: storedRefresh },
          { timeout: 10000 }   // hard 10 s timeout — prevents _isRefreshing from getting stuck
        )
        const { access_token } = response.data
        localStorage.setItem('access_token', access_token)
        if (response.data.refresh_token) {
          localStorage.setItem('refresh_token', response.data.refresh_token)
        }

        _processQueue(null, access_token)
        _isRefreshing = false

        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return api(originalRequest)
      } catch (refreshError) {
        _processQueue(refreshError, null)
        _isRefreshing = false

        const refreshStatus = refreshError.response?.status
        const errDetail = refreshError.response?.data?.detail || ''

        if (typeof errDetail === 'string' && errDetail.startsWith('SUBSCRIPTION_EXPIRED:')) {
          removeToken()
          removeUser()
          localStorage.removeItem('refresh_token')
          sessionStorage.setItem('login_error', errDetail.replace('SUBSCRIPTION_EXPIRED:', ''))
          _emitExpiredAndLogout('token', 'Your session has expired. Please login again.')
        } else if (refreshStatus === 401 || refreshStatus === 403) {
          // The refresh token itself was rejected — the session is truly over.
          _emitExpiredAndLogout('token', 'Your session has expired. Please login again.')
        } else {
          // Transient failure (network blip, 429 rate limit, 5xx during a
          // deploy): do NOT wipe the session. The failed requests surface
          // their errors normally, and the next 401 triggers a fresh refresh
          // attempt — which succeeds once the blip passes. Previously this
          // branch force-logged users out on any hiccup.
          console.warn('[API] Token refresh failed transiently (status:',
            refreshStatus ?? 'network', ') — keeping session for retry.')
        }
        return Promise.reject(refreshError)
      }
    }

    // ── 402 Payment Required ──────────────────────────────────────────────────
    if (error.response?.status === 402) {
      console.error('[API] Plan expired:', error.response.data?.detail)
    }

    // ── 403 Forbidden ─────────────────────────────────────────────────────────
    if (error.response?.status === 403) {
      console.error('[API] Access denied:', error.response.data?.detail)
    }

    return Promise.reject(error)
  }
)

// ── Pending-request tracker ────────────────────────────────────────────────────
// Lets useAutoLogout defer the session lock while a request is in flight, so a
// slow save/upload doesn't get interrupted by a lock screen.
let _pendingRequestCount = 0
api.interceptors.request.use((config) => {
  _pendingRequestCount += 1
  return config
})
api.interceptors.response.use(
  (response) => { _pendingRequestCount = Math.max(0, _pendingRequestCount - 1); return response },
  (error) => { _pendingRequestCount = Math.max(0, _pendingRequestCount - 1); return Promise.reject(error) }
)
export const hasPendingRequests = () => _pendingRequestCount > 0

export default api
