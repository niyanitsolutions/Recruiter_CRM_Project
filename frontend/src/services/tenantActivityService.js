import api from './api'

// Super Admin — Tenant Activity Monitoring & Business Notifications (additive)
const tenantActivityService = {
  /**
   * Tenant Monitoring dashboard stat cards
   */
  getDashboard: () => {
    return api.get('/super-admin/activity-monitor/dashboard')
  },

  /**
   * Filtered tenant list: all | trial | paid | expired | inactive | active | payment_failed
   */
  getTenants: (params = {}) => {
    return api.get('/super-admin/activity-monitor/tenants', { params })
  },

  /**
   * Super Admin notification feed
   */
  getNotifications: (params = {}) => {
    return api.get('/super-admin/activity-monitor/notifications', { params })
  },

  markNotificationRead: (notificationId) => {
    return api.put(`/super-admin/activity-monitor/notifications/${notificationId}/read`)
  },

  /**
   * Tenant Activity Monitoring settings (enabled, inactivity_days)
   */
  getSettings: () => {
    return api.get('/super-admin/activity-monitor/settings')
  },

  updateSettings: (data) => {
    return api.put('/super-admin/activity-monitor/settings', data)
  },
}

export default tenantActivityService
