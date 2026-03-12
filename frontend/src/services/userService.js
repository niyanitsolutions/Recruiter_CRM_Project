import api from './api'

const userService = {
  // Get all users with filters
  getUsers: async (params = {}) => {
    const response = await api.get('/users/', { params })
    return response.data
  },

  // Get user by ID
  getUser: async (userId) => {
    const response = await api.get(`/users/${userId}`)
    return response.data
  },

  // Create new user
  createUser: async (userData) => {
    const response = await api.post('/users/', userData)
    return response.data
  },

  // Update user
  updateUser: async (userId, userData) => {
    const response = await api.put(`/users/${userId}`, userData)
    return response.data
  },

  // Delete user
  deleteUser: async (userId) => {
    const response = await api.delete(`/users/${userId}`)
    return response.data
  },

  // Update user status
  updateUserStatus: async (userId, status) => {
    const response = await api.put(`/users/${userId}/status`, null, { params: { status } })
    return response.data
  },

  // Reset user password (admin)
  resetUserPassword: async (userId, passwordData) => {
    const response = await api.post(`/users/${userId}/reset-password`, passwordData)
    return response.data
  },

  // Get user's direct reports
  getUserReports: async (userId) => {
    const response = await api.get(`/users/${userId}/reports`)
    return response.data
  },

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await api.get('/users/dashboard-stats')
    return response.data
  },

  // Get available roles for dropdown
  getAvailableRoles: async () => {
    const response = await api.get('/users/roles')
    return response.data
  },

  // Get available statuses for dropdown
  getAvailableStatuses: async () => {
    const response = await api.get('/users/statuses')
    return response.data
  },

  // Validate field uniqueness
  validateField: async (field, value, excludeUserId = null) => {
    const params = { field, value }
    if (excludeUserId) params.exclude_user_id = excludeUserId
    const response = await api.get('/users/validate-field', { params })
    return response.data
  },

  // Get current user profile
  getMyProfile: async () => {
    const response = await api.get('/users/me')
    return response.data
  },

  // Update own profile
  updateMyProfile: async (profileData) => {
    const response = await api.put('/users/me', profileData)
    return response.data
  },

  // Change own password
  changePassword: async (passwordData) => {
    const response = await api.post('/users/me/change-password', passwordData)
    return response.data
  },

  // Get hierarchical org tree
  getOrgTree: async () => {
    const response = await api.get('/users/org-tree')
    return response.data
  },
}

export default userService