import api from './api'

// ─── Super Admin: manage announcements ────────────────────────────────────────

const communicationService = {
  create: (data) =>
    api.post('/super-admin/communication/announcements', data),

  list: (params = {}) =>
    api.get('/super-admin/communication/announcements', { params }),

  getById: (id) =>
    api.get(`/super-admin/communication/announcements/${id}`),

  update: (id, data) =>
    api.put(`/super-admin/communication/announcements/${id}`, data),

  toggle: (id, is_active) =>
    api.patch(`/super-admin/communication/announcements/${id}/toggle`, { is_active }),

  delete: (id) =>
    api.delete(`/super-admin/communication/announcements/${id}`),

  getStats: () =>
    api.get('/super-admin/communication/stats'),

  getAnalytics: (id) =>
    api.get(`/super-admin/communication/announcements/${id}/analytics`),

  uploadImage: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/super-admin/communication/announcements/${id}/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  removeImage: (id) =>
    api.delete(`/super-admin/communication/announcements/${id}/image`),

  searchTenants: (q = '', limit = 20) =>
    api.get('/super-admin/communication/tenant-search', { params: { q, limit } }),
}

// ─── Tenant: consume announcements ───────────────────────────────────────────

export const tenantAnnouncementService = {
  getActive: (location = null) =>
    api.get('/announcements', { params: location ? { location } : {} }),

  dismiss: (announcementId, permanent = false) =>
    api.post('/announcements/dismiss', { announcement_id: announcementId, permanent }),

  track: (announcementId, event) =>
    api.post(`/announcements/${announcementId}/track`, { event }),

  getPaymentGatewayStatus: () =>
    api.get('/payments/gateway-status'),
}

// ─── Public: no auth required ─────────────────────────────────────────────────

export const publicAnnouncementService = {
  getLoginAnnouncements: () =>
    api.get('/announcements/public'),
}

export default communicationService
