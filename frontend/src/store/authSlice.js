import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import authService from '../services/authService'
import { getToken, setToken, removeToken, getUser, setUser, removeUser, isTokenExpired, parseToken } from '../utils/token'

const _API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

// ── Inactivity timeout ────────────────────────────────────────────────────────
// If the user has been idle for longer than this, clear the session on startup
// so they are forced to log in again.  The useAutoLogout hook enforces the same
// limit in real-time; this is the safety net for "closed last night, back today".
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000 // 30 minutes

// ── Build a normalised user object from a JWT payload ─────────────────────────
// The JWT contains all the fields we need; this avoids an extra /me API call.
const _userFromPayload = (payload) => {
  if (!payload) return null
  return {
    id:          payload.sub,
    username:    payload.username     || '',
    fullName:    payload.full_name    || '',
    email:       payload.email        || '',
    role:        payload.role         || null,
    userType:    payload.user_type    || 'internal',
    designation: payload.designation  || '',
    permissions: payload.permissions  || [],
    companyId:   payload.company_id   || null,
    companyName: payload.company_name || null,
    isSuperAdmin: payload.is_super_admin || false,
    isSeller:    payload.is_seller     || false,
    sellerId:    payload.seller_id     || null,
    isOwner:     payload.is_owner      || false,
  }
}

// ── Validate stored session on startup ────────────────────────────────────────
// 1. Check inactivity first — if last_activity was > 8 h ago, wipe everything
//    before even looking at the token. This handles "closed last night, back
//    this morning" without relying on token expiry alone.
const _lastActivity = parseInt(localStorage.getItem('last_activity') || '0', 10)
const _idleTooLong  = _lastActivity > 0 && (Date.now() - _lastActivity) > INACTIVITY_LIMIT_MS

if (_idleTooLong) {
  removeToken()
  removeUser()
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('last_activity')
}

// 2. If the access token exists but is expired, remove it.
//    Keep refresh_token so AuthInitializer can attempt a silent refresh.
const _storedToken = _idleTooLong ? null : getToken()
const _tokenValid  = !!_storedToken && !isTokenExpired(_storedToken)

if (!_tokenValid && _storedToken) {
  removeToken()
  removeUser()
}

// Try localStorage first; fall back to decoding the JWT if user_data is missing.
// This handles the case where user_data was cleared but the token is still valid.
const _initialUser = _tokenValid
  ? (getUser() || _userFromPayload(parseToken(_storedToken)))
  : null

// Persist the user back to localStorage if we recovered it from the JWT
if (_tokenValid && !getUser() && _initialUser) {
  setUser(_initialUser)
}

const initialState = {
  user:               _initialUser,
  token:              _tokenValid ? _storedToken : null,
  isAuthenticated:    _tokenValid,
  isLoading:          false,
  isInitializing:     !_tokenValid && !!localStorage.getItem('refresh_token'), // silent refresh pending
  error:              null,
  subscriptionExpired: null, // { type, isOwner, message, planExpiry, tenantId, companyId }
}

// ── Async thunks ──────────────────────────────────────────────────────────────

export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials)
      return response.data
    } catch (error) {
      if (error.response?.status === 403) {
        const detail = error.response.data?.detail || {}
        if (detail.email_not_verified) {
          return rejectWithValue({
            type: 'EMAIL_NOT_VERIFIED',
            email_not_verified: true,
            email:   detail.email   || '',
            message: detail.message || 'Please verify your email before logging in.',
          })
        }
      }
      if (error.response?.status === 402) {
        const detail = error.response.data?.detail || {}
        return rejectWithValue({
          type:       'SUBSCRIPTION_EXPIRED',
          isOwner:    detail.is_owner    || false,
          userType:   detail.user_type   || 'tenant',
          message:    detail.message     || 'Your subscription has expired.',
          planExpiry: detail.plan_expiry || null,
          tenantId:   detail.tenant_id   || null,
          companyId:  detail.company_id  || null,
        })
      }
      const detail = error.response?.data?.detail || 'Login failed. Please try again.'
      return rejectWithValue(typeof detail === 'string' ? detail : 'Login failed. Please try again.')
    }
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async (registrationData, { rejectWithValue }) => {
    try {
      const response = await authService.register(registrationData)
      return response.data
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.detail || 'Registration failed. Please try again.'
      )
    }
  }
)

export const refreshToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue }) => {
    try {
      const storedRefresh = localStorage.getItem('refresh_token')
      if (!storedRefresh) throw new Error('No refresh token')
      const response = await authService.refreshToken(storedRefresh)
      return response.data
    } catch (error) {
      return rejectWithValue('Session expired. Please login again.')
    }
  }
)

/**
 * Runs once on app mount (via AuthInitializer).
 * Uses plain axios — NOT the `api` instance — to avoid the response interceptor
 * trying to refresh again and calling _logout() if the refresh itself fails.
 * Decodes user data from the new JWT payload instead of making an extra /me call.
 */
export const initAuth = createAsyncThunk(
  'auth/init',
  async (_, { rejectWithValue }) => {
    const storedRefresh = localStorage.getItem('refresh_token')
    if (!storedRefresh) return rejectWithValue('no session')
    try {
      const response = await axios.post(
        `${_API_BASE}/auth/refresh`,
        { refresh_token: storedRefresh },
        { headers: { 'Content-Type': 'application/json' } }
      )
      const { access_token, refresh_token } = response.data
      // Decode user info from the new JWT — avoids a second network call
      const payload = parseToken(access_token)
      return {
        access_token,
        refresh_token,
        user: _userFromPayload(payload),
      }
    } catch {
      return rejectWithValue('session expired')
    }
  }
)

export const getCurrentUser = createAsyncThunk(
  'auth/getCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getCurrentUser()
      return response.data
    } catch (error) {
      return rejectWithValue('Failed to fetch user data')
    }
  }
)

/**
 * Graceful logout: tells the backend to record logout_at (invalidating any
 * outstanding refresh tokens), then wipes all local auth state.
 * Always clears local state even if the API call fails.
 */
export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { dispatch }) => {
    try {
      await authService.logout()
    } catch (_) {
      // Best-effort — never block the client-side logout
    }
    dispatch(logout())
  }
)

// ── Helper: wipe all auth state ───────────────────────────────────────────────
const _clearAuth = (state) => {
  state.user               = null
  state.token              = null
  state.isAuthenticated    = false
  state.isInitializing     = false
  state.error              = null
  state.subscriptionExpired = null
  removeToken()
  removeUser()
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('last_activity')
}

// ── Auth slice ────────────────────────────────────────────────────────────────
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => { _clearAuth(state) },
    clearError: (state) => { state.error = null; state.subscriptionExpired = null },
    setCredentials: (state, action) => {
      const { user, access_token, refresh_token } = action.payload
      state.user            = user
      state.token           = access_token
      state.isAuthenticated = true
      setToken(access_token)
      setUser(user)
      if (refresh_token) localStorage.setItem('refresh_token', refresh_token)
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Login ──────────────────────────────────────────────────────────────
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
        state.subscriptionExpired = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false
        state.isAuthenticated = true
        state.token = action.payload.access_token
        state.user = {
          id:          action.payload.user_id,
          username:    action.payload.username,
          fullName:    action.payload.full_name,
          email:       action.payload.email,
          role:        action.payload.role,
          userType:    action.payload.user_type    || 'internal',
          designation: action.payload.designation  || '',
          permissions: action.payload.permissions  || [],
          companyId:   action.payload.company_id   || null,
          companyName: action.payload.company_name || null,
          isSuperAdmin: action.payload.is_super_admin || false,
          isSeller:    action.payload.is_seller    || false,
          sellerId:    action.payload.seller_id    || null,
          isOwner:     action.payload.is_owner     || false,
        }
        setToken(action.payload.access_token)
        setUser(state.user)
        localStorage.setItem('refresh_token', action.payload.refresh_token)
        localStorage.setItem('last_activity', Date.now().toString())
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        const payload = action.payload
        if (payload && typeof payload === 'object' && payload.type === 'SUBSCRIPTION_EXPIRED') {
          state.subscriptionExpired = payload
          state.error = null  // suppress generic error toast
        } else {
          state.error = payload
          state.subscriptionExpired = null
        }
      })

      // ── Register ───────────────────────────────────────────────────────────
      .addCase(register.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(register.fulfilled, (state) => {
        state.isLoading = false
      })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

      // ── Refresh Token (in-flight, via api interceptor) ─────────────────────
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.token = action.payload.access_token
        setToken(action.payload.access_token)
        if (action.payload.refresh_token) {
          localStorage.setItem('refresh_token', action.payload.refresh_token)
        }
      })
      .addCase(refreshToken.rejected, (state) => {
        _clearAuth(state)
      })

      // ── Get Current User ───────────────────────────────────────────────────
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.user = { ...state.user, ...action.payload }
        setUser(state.user)
      })

      // ── Init Auth (silent refresh on app startup) ──────────────────────────
      .addCase(initAuth.fulfilled, (state, action) => {
        state.isInitializing  = false
        state.isAuthenticated = true
        state.token           = action.payload.access_token
        if (action.payload.user) {
          state.user = action.payload.user
          setUser(action.payload.user)
        }
        setToken(action.payload.access_token)
        if (action.payload.refresh_token) {
          localStorage.setItem('refresh_token', action.payload.refresh_token)
        }
      })
      .addCase(initAuth.rejected, (state) => {
        // Silent refresh failed — clear everything so user sees the login page
        _clearAuth(state)
      })
  },
})

export const { logout, clearError, setCredentials } = authSlice.actions
// logoutUser is already exported at declaration (createAsyncThunk)

export default authSlice.reducer

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectAuth               = (state) => state.auth
export const selectUser               = (state) => state.auth.user
export const selectIsAuthenticated    = (state) => state.auth.isAuthenticated
export const selectIsInitializing     = (state) => state.auth.isInitializing
export const selectIsSuperAdmin       = (state) => state.auth.user?.isSuperAdmin || false
export const selectIsSeller           = (state) => state.auth.user?.isSeller     || false
export const selectSellerId           = (state) => state.auth.user?.sellerId      || null
export const selectIsOwner            = (state) => state.auth.user?.isOwner       || false
export const selectUserRole           = (state) => state.auth.user?.role          || null
export const selectUserType           = (state) => state.auth.user?.userType      || 'internal'
export const selectUserPermissions    = (state) => state.auth.user?.permissions   || []
export const selectSubscriptionExpired = (state) => state.auth.subscriptionExpired || null
