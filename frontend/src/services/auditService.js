import api from './api'

const auditService = {
  // Get audit logs with filters
  getAuditLogs: async (params = {}) => {
    const response = await api.get('/audit-logs/', { params })
    return response.data
  },

  // Get single audit log
  getAuditLog: async (logId) => {
    const response = await api.get(`/audit-logs/${logId}`)
    return response.data
  },

  // Get recent activity
  getRecentActivity: async (limit = 10) => {
    const response = await api.get('/audit-logs/recent', { params: { limit } })
    return response.data
  },

  // Get activity stats
  getActivityStats: async (days = 7) => {
    const response = await api.get('/audit-logs/stats', { params: { days } })
    return response.data
  },

  // Get available actions for filtering
  getAvailableActions: async () => {
    const response = await api.get('/audit-logs/actions')
    return response.data
  },

  // Get available entity types for filtering
  getAvailableEntityTypes: async () => {
    const response = await api.get('/audit-logs/entity-types')
    return response.data
  },

  // Get entity history
  getEntityHistory: async (entityType, entityId, params = {}) => {
    const response = await api.get(`/audit-logs/entity/${entityType}/${entityId}`, { params })
    return response.data
  },

  // Get user activity
  getUserActivity: async (userId, params = {}) => {
    const response = await api.get(`/audit-logs/user/${userId}`, { params })
    return response.data
  },

  // Get login activity logs
  getLoginActivity: async (params = {}) => {
    const response = await api.get('/auth/login-activity', { params })
    return response.data
  },
}

export default auditService