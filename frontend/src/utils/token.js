const TOKEN_KEY = 'access_token'
const USER_KEY = 'user_data'

/**
 * Get access token from localStorage
 */
export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * Set access token in localStorage
 */
export const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * Remove access token from localStorage
 */
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Get user data from localStorage
 */
export const getUser = () => {
  const userData = localStorage.getItem(USER_KEY)
  if (userData) {
    try {
      return JSON.parse(userData)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Set user data in localStorage
 */
export const setUser = (user) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/**
 * Remove user data from localStorage
 */
export const removeUser = () => {
  localStorage.removeItem(USER_KEY)
}

/**
 * Check if token is expired
 */
export const isTokenExpired = (token) => {
  if (!token) return true

  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const exp = payload.exp * 1000 // Convert to milliseconds
    return Date.now() >= exp
  } catch {
    return true
  }
}

/**
 * Get token expiry time
 */
export const getTokenExpiry = (token) => {
  if (!token) return null

  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return new Date(payload.exp * 1000)
  } catch {
    return null
  }
}

/**
 * Parse JWT payload
 */
export const parseToken = (token) => {
  if (!token) return null

  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}