import api from './api'

const applicationService = {
  // Get all applications with filters
  getApplications: async (params = {}) => {
    const response = await api.get('/applications/', { params })
    return response.data
  },

  // Get application by ID
  getApplication: async (applicationId) => {
    const response = await api.get(`/applications/${applicationId}`)
    return response.data
  },

  // Create new application (apply candidate to job)
  createApplication: async (applicationData) => {
    const response = await api.post('/applications/', applicationData)
    return response.data
  },

  // Update application status
  updateStatus: async (applicationId, statusData) => {
    const response = await api.put(`/applications/${applicationId}/status`, statusData)
    return response.data
  },

  // Assign application to coordinator
  assignApplication: async (applicationId, assignedTo) => {
    const response = await api.put(`/applications/${applicationId}/assign`, null, {
      params: { assigned_to: assignedTo }
    })
    return response.data
  },

  // Delete application
  deleteApplication: async (applicationId) => {
    const response = await api.delete(`/applications/${applicationId}`)
    return response.data
  },

  // Bulk apply candidates to job
  bulkApply: async (jobId, candidateIds) => {
    const params = new URLSearchParams()
    params.append('job_id', jobId)
    candidateIds.forEach(id => params.append('candidate_ids', id))
    const response = await api.post(`/applications/bulk-apply?${params.toString()}`)
    return response.data
  },

  // Bulk update status
  bulkUpdateStatus: async (applicationIds, status, remarks = null) => {
    const params = { application_ids: applicationIds, status }
    if (remarks) params.remarks = remarks
    const response = await api.put('/applications/bulk-status', null, { params })
    return response.data
  },

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await api.get('/applications/dashboard-stats')
    return response.data
  },

  // Get statuses dropdown
  getStatuses: async () => {
    const response = await api.get('/applications/statuses')
    return response.data
  },

  // Get rejection reasons dropdown
  getRejectionReasons: async () => {
    const response = await api.get('/applications/rejection-reasons')
    return response.data
  },
}

export default applicationService