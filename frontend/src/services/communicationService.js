import api from './api'

// ─── Super Admin: manage announcements ────────────────────────────────────────

const communicationService = {
  /** Create a new announcement */
  create(data) {
    return api.post('/super-admin/communication/announcements', data)
  },

  /** List all announcements with optional filters */
  list(params = {}) {
    return api.get('/super-admin/communication/announcements', { params })
  },

  /** Get one announcement by ID */
  getById(id) {
    return api.get(`/super-admin/communication/announcements/${id}`)
  },

  /** Update an announcement */
  update(id, data) {
    return api.put(`/super-admin/communication/announcements/${id}`, data)
  },

  /** Toggle active state */
  toggle(id) {
    return api.patch(`/super-admin/communication/announcements/${id}/toggle`)
  },

  /** Activate */
  activate(id) {
    return api.patch(`/super-admin/communication/announcements/${id}/activate`)
  },

  /** Deactivate */
  deactivate(id) {
    return api.patch(`/super-admin/communication/announcements/${id}/deactivate`)
  },

  /** Delete (soft) */
  delete(id) {
    return api.delete(`/super-admin/communication/announcements/${id}`)
  },

  /** Stats for dashboard card */
  getStats() {
    return api.get('/super-admin/communication/stats')
  },
}

// ─── Tenant: consume announcements ───────────────────────────────────────────

export const tenantAnnouncementService = {
  /** Fetch active announcements for the current tenant */
  getActive(location = null) {
    const params = location ? { location } : {}
    return api.get('/announcements', { params })
  },

  /** Dismiss an announcement (permanent = "Don't show again") */
  dismiss(announcementId, permanent = false) {
    return api.post('/announcements/dismiss', { announcement_id: announcementId, permanent })
  },

  /** Check if payments are enabled */
  getPaymentGatewayStatus() {
    return api.get('/payments/gateway-status')
  },
}

export default communicationService
