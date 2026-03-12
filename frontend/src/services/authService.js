import api from './api'

const authService = {
  /**
   * Login with identifier (username/email/mobile) and password
   */
  login: (credentials) => {
    return api.post('/auth/login', credentials)
  },

  /**
   * Register a new company
   */
  register: (data) => {
    return api.post('/auth/register', data)
  },

  /**
   * Refresh access token
   */
  refreshToken: (refreshToken) => {
    return api.post('/auth/refresh', { refresh_token: refreshToken })
  },

  /**
   * Get current user info
   */
  getCurrentUser: () => {
    return api.get('/auth/me')
  },

  /**
   * Forgot password - initiate reset
   */
  forgotPassword: (email) => {
    return api.post('/auth/forgot-password', { email })
  },

  /**
   * Reset password with token
   */
  resetPassword: (token, newPassword) => {
    return api.post('/auth/reset-password', {
      token,
      new_password: newPassword,
    })
  },

  /**
   * Change password (authenticated)
   */
  changePassword: (currentPassword, newPassword) => {
    return api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
  },

  /**
   * Validate registration field
   */
  validateField: (field, value) => {
    return api.post('/auth/validate-field', null, {
      params: { field, value },
    })
  },

  /**
   * Invalidate the current session on the backend.
   * Records logout_at so any in-flight refresh tokens are treated as revoked.
   */
  logout: () => {
    return api.post('/auth/logout')
  },

  /**
   * Get available plans for registration
   */
  getPlans: () => {
    return api.get('/auth/plans')
  },

  /**
   * Verify email address using the token from the verification link
   */
  verifyEmail: (token, type = 'tenant') => {
    return api.get('/auth/verify-email', { params: { token, type } })
  },

  /**
   * Resend email verification link
   */
  resendVerification: (email) => {
    return api.post('/auth/resend-verification', { email })
  },
}

export default authService