import api from './api'

const adminDashboardService = {
  // Get complete dashboard data
  // days=0 means "All Time" (no date filter); days>0 means last N days
  getDashboardData: async (days = 0) => {
    const params = days > 0 ? { days } : {}
    const response = await api.get('/admin/dashboard/', { params })
    return response.data
  },

  // Get users summary
  getUsersSummary: async () => {
    const response = await api.get('/admin/dashboard/users-summary')
    return response.data
  },

  // Get recent users
  getRecentUsers: async (limit = 5) => {
    const response = await api.get('/admin/dashboard/recent-users', { params: { limit } })
    return response.data
  },

  // Get recently active users
  getRecentlyActiveUsers: async (limit = 5) => {
    const response = await api.get('/admin/dashboard/recently-active', { params: { limit } })
    return response.data
  },

  // Get activity chart data
  getActivityChartData: async (days = 7) => {
    const response = await api.get('/admin/dashboard/activity-chart', { params: { days } })
    return response.data
  },

  // Get system health
  getSystemHealth: async () => {
    const response = await api.get('/admin/dashboard/system-health')
    return response.data
  },
}

export default adminDashboardService