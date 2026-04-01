import api from './api'

const candidateService = {
  // Get all candidates with filters
  getCandidates: async (params = {}) => {
    const response = await api.get('/candidates/', { params })
    return response.data
  },

  // Search candidates by keywords (AI-powered)
  searchCandidates: async (query, params = {}) => {
    const response = await api.get('/candidates/search', { 
      params: { q: query, ...params } 
    })
    return response.data
  },

  // Get candidate by ID
  getCandidate: async (candidateId) => {
    const response = await api.get(`/candidates/${candidateId}`)
    return response.data
  },

  // Create new candidate
  createCandidate: async (candidateData) => {
    const response = await api.post('/candidates/', candidateData)
    return response.data
  },

  // Update candidate
  updateCandidate: async (candidateId, candidateData) => {
    const response = await api.put(`/candidates/${candidateId}`, candidateData)
    return response.data
  },

  // Delete candidate
  deleteCandidate: async (candidateId) => {
    const response = await api.delete(`/candidates/${candidateId}`)
    return response.data
  },

  // Update candidate status
  updateStatus: async (candidateId, status, remarks = null) => {
    const params = { status }
    if (remarks) params.remarks = remarks
    const response = await api.put(`/candidates/${candidateId}/status`, null, { params })
    return response.data
  },

  // Assign candidate to coordinator
  assignCandidate: async (candidateId, assignedTo) => {
    const response = await api.put(`/candidates/${candidateId}/assign`, null, {
      params: { assigned_to: assignedTo }
    })
    return response.data
  },

  // Parse resume using AI
  parseResume: async (resumeText, candidateId = null) => {
    const formData = new FormData()
    formData.append('resume_text', resumeText)
    if (candidateId) formData.append('candidate_id', candidateId)
    const response = await api.post('/candidates/parse-resume', formData)
    return response.data
  },

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await api.get('/candidates/dashboard-stats')
    return response.data
  },

  // Get statuses dropdown
  getStatuses: async () => {
    const response = await api.get('/candidates/statuses')
    return response.data
  },

  // Get sources dropdown
  getSources: async () => {
    const response = await api.get('/candidates/sources')
    return response.data
  },

  // Get notice periods dropdown
  getNoticePeriods: async () => {
    const response = await api.get('/candidates/notice-periods')
    return response.data
  },

  // Get open jobs with eligibility scores for a candidate
  getEligibleJobs: async (candidateId) => {
    const response = await api.get(`/candidates/${candidateId}/eligible-jobs`)
    return response.data
  },

  // Generate a shareable self-registration link for external candidates
  generateFormLink: async () => {
    const response = await api.post('/candidates/generate-form-link')
    return response.data
  },

  // Extract & parse a resume file for form auto-fill (no candidate_id needed)
  parseResumeFile: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const response = await api.post('/candidates/extract-resume', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  // Upload resume file (PDF / DOC / DOCX)
  uploadResume: async (candidateId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post(`/candidates/${candidateId}/resume`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },
}

export default candidateService