import api from './api'

const partnerService = {
  // Get all partners with filters
  getPartners: async (params = {}) => {
    const response = await api.get('/partners/', { params })
    return response.data
  },

  // Get partner by ID
  getPartner: async (partnerId) => {
    const response = await api.get(`/partners/${partnerId}`)
    return response.data
  },

  // Create new partner
  createPartner: async (partnerData) => {
    const response = await api.post('/partners/', partnerData)
    return response.data
  },

  // Update partner
  updatePartner: async (partnerId, partnerData) => {
    const response = await api.put(`/partners/${partnerId}`, partnerData)
    return response.data
  },

  // Delete partner
  deletePartner: async (partnerId) => {
    const response = await api.delete(`/partners/${partnerId}`)
    return response.data
  },

  // Update partner status
  updatePartnerStatus: async (partnerId, status) => {
    const response = await api.put(`/partners/${partnerId}/status`, null, { params: { status } })
    return response.data
  },

  // Reset partner password (admin)
  resetPartnerPassword: async (partnerId, passwordData) => {
    const response = await api.post(`/partners/${partnerId}/reset-password`, passwordData)
    return response.data
  },

  // Get available statuses for dropdown
  getAvailableStatuses: async () => {
    const response = await api.get('/partners/statuses')
    return response.data
  },

  // Validate field uniqueness
  validateField: async (field, value, excludePartnerId = null) => {
    const params = { field, value }
    if (excludePartnerId) params.exclude_user_id = excludePartnerId
    const response = await api.get('/partners/validate-field', { params })
    return response.data
  },
}

export default partnerService
