import axios from 'axios'
import { getToken, removeToken, removeUser } from '../utils/token'

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// ── Request interceptor — attach auth token ───────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// ── Refresh-token deduplication state ─────────────────────────────────────────
// When multiple requests fail with 401 simultaneously, only ONE refresh call is
// made. All other failing requests queue up and are retried once the refresh
// resolves (or they all fail together if the refresh itself fails).
let _isRefreshing = false
let _pendingQueue = []   // [{ resolve, reject }]

const _processQueue = (error, token = null) => {
  _pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else       resolve(token)
  })
  _pendingQueue = []
}

const _logout = () => {
  removeToken()
  removeUser()
  localStorage.removeItem('refresh_token')
  window.location.href = '/login'
}

// ── Response interceptor — handle errors ─────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // ── 401 Unauthorized ──────────────────────────────────────────────────────
    if (error.response?.status === 401 && !originalRequest._retry) {
      // A 401 on the login endpoint itself just means wrong credentials —
      // do NOT treat it as an expired session or call _logout().
      const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
                             originalRequest.url?.includes('/auth/register')
      if (isAuthEndpoint) {
        return Promise.reject(error)
      }

      const storedRefresh = localStorage.getItem('refresh_token')

      // No refresh token — logout immediately
      if (!storedRefresh) {
        _logout()
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

      // This is the first failing request — start the refresh
      originalRequest._retry = true
      _isRefreshing = true

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`,
          { refresh_token: storedRefresh }
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
        const errDetail = refreshError.response?.data?.detail || ''
        if (errDetail.startsWith('SUBSCRIPTION_EXPIRED:')) {
          removeToken()
          removeUser()
          localStorage.removeItem('refresh_token')
          sessionStorage.setItem('login_error', errDetail.replace('SUBSCRIPTION_EXPIRED:', ''))
          window.location.href = '/login'
        } else {
          _logout()
        }
        return Promise.reject(refreshError)
      }
    }

    // ── 402 Payment Required ─────────────────────────────────────────────────
    if (error.response?.status === 402) {
      console.error('Plan expired:', error.response.data?.detail)
    }

    // ── 403 Forbidden ────────────────────────────────────────────────────────
    if (error.response?.status === 403) {
      console.error('Access denied:', error.response.data?.detail)
    }

    return Promise.reject(error)
  }
)

export default api
