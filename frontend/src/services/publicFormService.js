import api from './api'
import axios from 'axios'

// Authenticated endpoints (require login)
const publicFormService = {
  createForm: async (jobId, expiryDate = null) => {
    const response = await api.post('/candidates/public-forms', {
      job_id: jobId,
      expiry_date: expiryDate,
    })
    return response.data
  },

  listForms: async () => {
    const response = await api.get('/candidates/public-forms')
    return response.data
  },

  getForm: async (formId) => {
    const response = await api.get(`/candidates/public-forms/${formId}`)
    return response.data
  },

  updateForm: async (formId, updates) => {
    const response = await api.put(`/candidates/public-forms/${formId}`, updates)
    return response.data
  },

  deleteForm: async (formId) => {
    const response = await api.delete(`/candidates/public-forms/${formId}`)
    return response.data
  },

  getQrCodeUrl: (formId, frontendBaseUrl) => {
    const base = import.meta.env.VITE_API_BASE_URL || ''
    return `${base}/api/v1/candidates/public-forms/${formId}/qr?frontend_base_url=${encodeURIComponent(frontendBaseUrl)}`
  },
}

// Public endpoints (no auth — use plain axios)
const _publicBaseURL = (import.meta.env.VITE_API_BASE_URL || '') + '/api/v1'

const publicApplyService = {
  getFormMeta: async (slug) => {
    const response = await axios.get(`${_publicBaseURL}/public/apply/${slug}`)
    return response.data
  },

  trackOpen: async (slug) => {
    try {
      await axios.post(`${_publicBaseURL}/public/apply/${slug}/open`)
    } catch (_e) {
      // non-critical
    }
  },

  submitForm: async (slug, data) => {
    const response = await axios.post(`${_publicBaseURL}/public/apply/${slug}`, data)
    return response.data
  },

  uploadResume: async (slug, candidateId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await axios.post(
      `${_publicBaseURL}/public/apply/${slug}/resume?candidate_id=${candidateId}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return response.data
  },
}

export { publicFormService, publicApplyService }
export default publicFormService
