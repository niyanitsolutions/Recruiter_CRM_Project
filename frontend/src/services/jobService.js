import api from './api'

const jobService = {
  // Get all jobs with filters
  getJobs: async (params = {}) => {
    const response = await api.get('/jobs/', { params })
    return response.data
  },

  // Get job by ID
  getJob: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}`)
    return response.data
  },

  // Create new job
  createJob: async (jobData) => {
    const response = await api.post('/jobs/', jobData)
    return response.data
  },

  // Update job
  updateJob: async (jobId, jobData) => {
    const response = await api.put(`/jobs/${jobId}`, jobData)
    return response.data
  },

  // Delete job
  deleteJob: async (jobId) => {
    const response = await api.delete(`/jobs/${jobId}`)
    return response.data
  },

  // Update job status
  updateStatus: async (jobId, status, closureReason = null) => {
    const params = { status }
    if (closureReason) params.closure_reason = closureReason
    const response = await api.put(`/jobs/${jobId}/status`, null, { params })
    return response.data
  },

  // Get jobs dropdown
  getJobsDropdown: async (status = null, clientId = null) => {
    const params = {}
    if (status) params.status = status
    if (clientId) params.client_id = clientId
    const response = await api.get('/jobs/dropdown', { params })
    return response.data
  },

  // Check candidate eligibility for job
  checkEligibility: async (jobId, candidateId) => {
    const response = await api.get(`/jobs/${jobId}/check-eligibility/${candidateId}`)
    return response.data
  },

  // Find matching candidates for job
  findMatchingCandidates: async (jobId, limit = 20) => {
    const response = await api.get(`/jobs/${jobId}/matching-candidates`, {
      params: { limit }
    })
    return response.data
  },

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await api.get('/jobs/dashboard-stats')
    return response.data
  },

  // Get statuses dropdown
  getStatuses: async () => {
    const response = await api.get('/jobs/statuses')
    return response.data
  },

  // Get job types dropdown
  getJobTypes: async () => {
    const response = await api.get('/jobs/types')
    return response.data
  },

  // Get work modes dropdown
  getWorkModes: async () => {
    const response = await api.get('/jobs/work-modes')
    return response.data
  },

  // Get priorities dropdown
  getPriorities: async () => {
    const response = await api.get('/jobs/priorities')
    return response.data
  },
}

export default jobService