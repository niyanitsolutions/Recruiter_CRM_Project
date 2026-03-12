/**
 * Onboard Service - Phase 4
 * API calls for onboarding management
 */
import api from './api'

const BASE_URL = '/onboards'

const onboardService = {
  // ============== CRUD ==============
  
  // Get all onboards with filters
  getAll: async (params = {}) => {
    const response = await api.get(BASE_URL, { params })
    return response.data
  },

  // Get onboard by ID
  getById: async (id) => {
    const response = await api.get(`${BASE_URL}/${id}`)
    return response.data
  },

  // Create new onboard (when offer is released)
  create: async (data) => {
    const response = await api.post(BASE_URL, data)
    return response.data
  },

  // Update onboard
  update: async (id, data) => {
    const response = await api.put(`${BASE_URL}/${id}`, data)
    return response.data
  },

  // Delete onboard
  delete: async (id) => {
    const response = await api.delete(`${BASE_URL}/${id}`)
    return response.data
  },

  // ============== Dashboard ==============
  
  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await api.get(`${BASE_URL}/dashboard`)
    return response.data
  },

  // Get reminders due today
  getRemindersDue: async () => {
    const response = await api.get(`${BASE_URL}/reminders-due`)
    return response.data
  },

  // Get upcoming DOJ
  getUpcomingDOJ: async (days = 7) => {
    const response = await api.get(`${BASE_URL}/upcoming-doj`, { params: { days } })
    return response.data
  },

  // ============== Status Management ==============
  
  // Update status
  updateStatus: async (id, data) => {
    const response = await api.put(`${BASE_URL}/${id}/status`, data)
    return response.data
  },

  // Accept offer
  acceptOffer: async (id, expectedDoj) => {
    const response = await api.post(`${BASE_URL}/${id}/accept-offer`, null, {
      params: { expected_doj: expectedDoj }
    })
    return response.data
  },

  // Decline offer
  declineOffer: async (id, reason = null) => {
    const response = await api.post(`${BASE_URL}/${id}/decline-offer`, null, {
      params: { reason }
    })
    return response.data
  },

  // Confirm DOJ
  confirmDOJ: async (id) => {
    const response = await api.post(`${BASE_URL}/${id}/confirm-doj`)
    return response.data
  },

  // Extend DOJ
  extendDOJ: async (id, data) => {
    const response = await api.post(`${BASE_URL}/${id}/extend-doj`, data)
    return response.data
  },

  // Mark as joined
  markJoined: async (id, actualDoj) => {
    const response = await api.post(`${BASE_URL}/${id}/mark-joined`, null, {
      params: { actual_doj: actualDoj }
    })
    return response.data
  },

  // Mark as no-show
  markNoShow: async (id, reason = null) => {
    const response = await api.post(`${BASE_URL}/${id}/mark-no-show`, null, {
      params: { reason }
    })
    return response.data
  },

  // ============== Documents ==============
  
  // Get documents
  getDocuments: async (id) => {
    const response = await api.get(`${BASE_URL}/${id}/documents`)
    return response.data
  },

  // Update document status
  updateDocument: async (id, data) => {
    const response = await api.put(`${BASE_URL}/${id}/documents`, data)
    return response.data
  },

  // ============== Day Counter ==============
  
  // Update day counters (admin/scheduler)
  updateDayCounters: async () => {
    const response = await api.post(`${BASE_URL}/update-day-counters`)
    return response.data
  },
}

export default onboardService