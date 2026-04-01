const TOKEN_KEY = 'access_token'
const USER_KEY = 'user_data'
const REMEMBER_KEY = 'remember_me'
const SAVED_EMAIL_KEY = 'saved_email'

// ── Remember Me preference ────────────────────────────────────────────────────
export const setRememberMe = (val) =>
  localStorage.setItem(REMEMBER_KEY, val ? '1' : '0')

// Default true — first-time users always persist session until they opt out
export const getRememberMe = () =>
  localStorage.getItem(REMEMBER_KEY) !== '0'

// ── Saved email (auto-fill on login when Remember Me was checked) ─────────────
export const getSavedEmail = () => localStorage.getItem(SAVED_EMAIL_KEY) || ''
export const setSavedEmail = (email) => localStorage.setItem(SAVED_EMAIL_KEY, email)
export const removeSavedEmail = () => localStorage.removeItem(SAVED_EMAIL_KEY)

// ── Access token ──────────────────────────────────────────────────────────────
export const getToken = () =>
  localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)

export const setToken = (token, remember) => {
  const rem = remember !== undefined ? remember : getRememberMe()
  if (rem) {
    localStorage.setItem(TOKEN_KEY, token)
    sessionStorage.removeItem(TOKEN_KEY)
  } else {
    sessionStorage.setItem(TOKEN_KEY, token)
    localStorage.removeItem(TOKEN_KEY)
  }
}

export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

// ── Refresh token ─────────────────────────────────────────────────────────────
export const getRefreshToken = () =>
  localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token')

export const setRefreshToken = (token, remember) => {
  const rem = remember !== undefined ? remember : getRememberMe()
  if (rem) {
    localStorage.setItem('refresh_token', token)
    sessionStorage.removeItem('refresh_token')
  } else {
    sessionStorage.setItem('refresh_token', token)
    localStorage.removeItem('refresh_token')
  }
}

export const removeRefreshToken = () => {
  localStorage.removeItem('refresh_token')
  sessionStorage.removeItem('refresh_token')
}

// ── User data ─────────────────────────────────────────────────────────────────
export const getUser = () => {
  const userData = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY)
  if (userData) {
    try {
      return JSON.parse(userData)
    } catch {
      return null
    }
  }
  return null
}

export const setUser = (user, remember) => {
  const rem = remember !== undefined ? remember : getRememberMe()
  const str = JSON.stringify(user)
  if (rem) {
    localStorage.setItem(USER_KEY, str)
    sessionStorage.removeItem(USER_KEY)
  } else {
    sessionStorage.setItem(USER_KEY, str)
    localStorage.removeItem(USER_KEY)
  }
}

export const removeUser = () => {
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(USER_KEY)
}

// ── Token inspection ──────────────────────────────────────────────────────────
export const isTokenExpired = (token) => {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Date.now() >= payload.exp * 1000
  } catch {
    return true
  }
}

export const getTokenExpiry = (token) => {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return new Date(payload.exp * 1000)
  } catch {
    return null
  }
}

export const parseToken = (token) => {
  if (!token) return null
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}
