import api from './api'

const authService = {
  login: async (credentials) => {
    const url = `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/login`
    console.log('[AUTH] LOGIN REQUEST →', url, '| identifier:', credentials.identifier, '| password present:', !!credentials.password)
    const res = await api.post('/auth/login', credentials)
    console.log('[AUTH] LOGIN RESPONSE →', res.status, '| success:', res.data?.success, '| has_token:', !!res.data?.access_token, '| tenant_selection:', !!res.data?.tenant_selection_required)
    // Explicit guard: if server returned 200 but success===false, treat as failure
    if (!res.data || res.data.success === false) {
      console.error('[AUTH] LOGIN REJECTED — success flag is false or empty response:', res.data)
      throw new Error(res.data?.message || 'Invalid credentials')
    }
    return res
  },

  /**
   * Register a new company (subscription flow).
   * Uses 60 s timeout — creating a company DB + collections + seed roles
   * can exceed the default 15 s limit, especially on cold MongoDB instances.
   */
  register: (data) => {
    return api.post('/auth/register', data, { timeout: 60000 })
  },

  /**
   * Single-page trial setup — POST /api/v1/auth/trial-setup
   * Same extended timeout as register().
   */
  trialSetup: (data) => {
    return api.post('/auth/trial-setup', data, { timeout: 60000 })
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
   * Look up which companies are associated with an email.
   * Returns [{company_id, company_name, user_type}].
   * Used to decide whether to show scope-selection UI.
   */
  lookupForgotPasswordScope: (email) => {
    return api.post('/auth/forgot-password/lookup', { email })
  },

  /**
   * Initiate password reset.
   * resetScope: 'auto' (default) | 'single' | 'all'
   * companyId: required when resetScope='single'
   */
  forgotPassword: (email, resetScope = 'auto', companyId = null) => {
    return api.post('/auth/forgot-password', {
      email,
      reset_scope: resetScope,
      ...(companyId ? { company_id: companyId } : {}),
    })
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
   * Verify current password (used to unlock a locked session)
   */
  verifyPassword: (password) => {
    return api.post('/auth/verify-password', { password })
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
    // 120s — verify-email provisions the full company DB (23 collections + indexes);
    // the default 15s timeout fires before provisioning completes on Atlas.
    return api.get('/auth/verify-email', { params: { token, type }, timeout: 120000 })
  },

  /**
   * Resend email verification link
   */
  resendVerification: (email) => {
    return api.post('/auth/resend-verification', { email })
  },

  /**
   * Second-step login after tenant selection.
   * Called when /auth/login returns tenant_selection_required=true.
   */
  loginWithTenant: (identifier, password, company_id, extra = {}) => {
    return api.post('/auth/login-with-tenant', { identifier, password, company_id, ...extra })
  },

  /**
   * Device B — request access when a 409 active-session conflict is detected.
   * Creates a pending login_request document and pushes a real-time notification
   * to Device A (the active session) via WebSocket.
   */
  requestAccess: (identifier, password, company_code = null) => {
    return api.post('/sessions/request-access', { identifier, password, company_code })
  },

  /**
   * Device B — poll for the status of a pending login request.
   * Public endpoint — no auth token required.
   * Returns { status: 'pending' | 'approved' | 'denied' | 'expired' }
   */
  getRequestStatus: (requestId) => {
    return api.get(`/sessions/request-status/${requestId}`)
  },
}

export default authService