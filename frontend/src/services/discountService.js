import api from './api'

const discountService = {
  getDiscounts: (params = {}) => api.get('/discounts/', { params }),
  getDiscount: (id) => api.get(`/discounts/${id}`),
  createDiscount: (data) => api.post('/discounts/', data),
  updateDiscount: (id, data) => api.put(`/discounts/${id}`, data),
  deleteDiscount: (id) => api.delete(`/discounts/${id}`),
  validateCode: (params) => api.get('/discounts/validate', { params }),
}

export default discountService
