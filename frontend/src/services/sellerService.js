import api from './api'

const sellerService = {
  // Trailing slash required — FastAPI @router.get("/") is mounted at /sellers/
  getSellers: (params = {}) => api.get('/sellers/', { params }),
  getSeller: (id) => api.get(`/sellers/${id}`),
  getSellerStats: (id) => api.get(`/sellers/${id}/stats`),
  createSeller: (data) => api.post('/sellers/', data),
  updateSeller: (id, data) => api.put(`/sellers/${id}`, data),
  deleteSeller: (id) => api.delete(`/sellers/${id}`),

  // Seat status
  getSellerSeatStatus: (id) => api.get(`/sellers/${id}/seat-status`),
  extendSubscription: (id, data) => api.post(`/sellers/${id}/extend-subscription`, data),

  // Update margin
  updateMargin: (id, marginPercentage) =>
    api.put(`/sellers/${id}`, { margin_percentage: marginPercentage }),

  getSubscriptions: (params = {}) => api.get('/super-admin/subscriptions', { params }),
  getReports: (reportType = 'revenue') => api.get('/super-admin/reports', { params: { report_type: reportType } }),
}

export default sellerService
