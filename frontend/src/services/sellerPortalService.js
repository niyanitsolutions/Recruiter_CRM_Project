import api from './api'

const sellerPortalService = {
  getDashboard: () => api.get('/seller-portal/dashboard'),
  getMyTenants: (params = {}) => api.get('/seller-portal/tenants', { params }),
  createTenant: (data) => api.post('/seller-portal/tenants', data),
  getSellerPlans: () => api.get('/seller-portal/plans'),
  getSubscriptions: (params = {}) => api.get('/seller-portal/subscriptions', { params }),
  getRevenue: (params = {}) => api.get('/seller-portal/revenue', { params }),
  getCommissions: (params = {}) => api.get('/seller-portal/commissions', { params }),
  getNotifications: () => api.get('/seller-portal/notifications'),
  getProfile: () => api.get('/seller-portal/profile'),
  updateProfile: (data) => api.put('/seller-portal/profile', data),
  changePassword: (data) => api.put('/seller-portal/profile/password', data),
}

export default sellerPortalService
