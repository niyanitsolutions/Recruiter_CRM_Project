import api from './api'

const auditService = {
  getAuditLogs: async (params = {}) => {
    const response = await api.get('/audit-logs/', { params })
    return response.data
  },
  getAuditLog: async (logId) => {
    const response = await api.get(`/audit-logs/${logId}`)
    return response.data
  },
  getRecentActivity: async (limit = 10) => {
    const response = await api.get('/audit-logs/recent', { params: { limit } })
    return response.data
  },
  getActivityStats: async (days = 7) => {
    const response = await api.get('/audit-logs/stats', { params: { days } })
    return response.data
  },
  getAvailableActions: async () => {
    const response = await api.get('/audit-logs/actions')
    return response.data
  },
  getAvailableEntityTypes: async () => {
    const response = await api.get('/audit-logs/entity-types')
    return response.data
  },
  getEntityHistory: async (entityType, entityId, params = {}) => {
    const response = await api.get(`/audit-logs/entity/${entityType}/${entityId}`, { params })
    return response.data
  },
  getUserActivity: async (userId, params = {}) => {
    const response = await api.get(`/audit-logs/user/${userId}`, { params })
    return response.data
  },

  // Raw login events (paginated)
  getLoginActivity: async (params = {}) => {
    const response = await api.get('/auth/login-activity', { params })
    return response.data
  },

  // Enterprise: per-user summary table
  getLoginSummary: async () => {
    const response = await api.get('/auth/login-summary')
    return response.data
  },

  // Enterprise: analytics KPI + charts
  getLoginAnalytics: async (days = 30) => {
    const response = await api.get('/auth/login-analytics', { params: { days } })
    return response.data
  },

  // Enterprise: full history for one user (for drawer)
  getLoginHistoryByUser: async (userId, params = {}) => {
    const response = await api.get(`/auth/login-history-by-user/${userId}`, { params })
    return response.data
  },
}

export default auditService
