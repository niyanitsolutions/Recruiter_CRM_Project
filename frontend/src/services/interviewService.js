import api from './api'

const interviewService = {
  // Get all interviews with filters
  getInterviews: async (params = {}) => {
    const response = await api.get('/interviews/', { params })
    return response.data
  },

  // Get interview by ID
  getInterview: async (interviewId) => {
    const response = await api.get(`/interviews/${interviewId}`)
    return response.data
  },

  // Schedule new interview
  scheduleInterview: async (interviewData) => {
    const response = await api.post('/interviews/', interviewData)
    return response.data
  },

  // Update interview
  updateInterview: async (interviewId, interviewData) => {
    const response = await api.put(`/interviews/${interviewId}`, interviewData)
    return response.data
  },

  // Reschedule interview
  rescheduleInterview: async (interviewId, rescheduleData) => {
    const response = await api.put(`/interviews/${interviewId}/reschedule`, rescheduleData)
    return response.data
  },

  // Submit feedback
  submitFeedback: async (interviewId, feedbackData) => {
    const response = await api.post(`/interviews/${interviewId}/feedback`, feedbackData)
    return response.data
  },

  // Cancel interview
  cancelInterview: async (interviewId, reason) => {
    const response = await api.put(`/interviews/${interviewId}/cancel`, null, {
      params: { reason }
    })
    return response.data
  },

  // Confirm interview
  confirmInterview: async (interviewId) => {
    const response = await api.put(`/interviews/${interviewId}/confirm`)
    return response.data
  },

  // Start interview
  startInterview: async (interviewId) => {
    const response = await api.put(`/interviews/${interviewId}/start`)
    return response.data
  },

  // Mark as no-show
  markNoShow: async (interviewId) => {
    const response = await api.put(`/interviews/${interviewId}/no-show`)
    return response.data
  },

  // Get today's interviews
  getTodayInterviews: async () => {
    const response = await api.get('/interviews/today')
    return response.data
  },

  // Get pending feedback
  getPendingFeedback: async () => {
    const response = await api.get('/interviews/pending-feedback')
    return response.data
  },

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await api.get('/interviews/dashboard-stats')
    return response.data
  },

  // Get statuses dropdown
  getStatuses: async () => {
    const response = await api.get('/interviews/statuses')
    return response.data
  },

  // Get modes dropdown
  getModes: async () => {
    const response = await api.get('/interviews/modes')
    return response.data
  },

  // Get results dropdown
  getResults: async () => {
    const response = await api.get('/interviews/results')
    return response.data
  },

  // Submit round result (Pass / Fail / On Hold)
  submitRoundResult: async (interviewId, data) => {
    const response = await api.put(`/interviews/${interviewId}/round-result`, data)
    return response.data
  },

  // Get candidates who passed all rounds (for Release Offer dropdown)
  getSelectedCandidates: async () => {
    const response = await api.get('/interviews/selected-candidates')
    return response.data
  },
}

export default interviewService