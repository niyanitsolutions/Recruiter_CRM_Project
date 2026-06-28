import api from './api'
import axios from 'axios'

// ── Authenticated endpoints (require login) ────────────────────────────────────
const publicFormService = {
  /** Get current user's public form (null if not generated yet). */
  getMyForm: () => api.get('/candidates/my-public-form').then(r => r.data),

  /** Generate a permanent public form for the current user (idempotent). */
  generate: () => api.post('/candidates/my-public-form').then(r => r.data),

  /** Activate or deactivate the current user's public form. */
  setEnabled: (isEnabled) =>
    api.put('/candidates/my-public-form', { is_enabled: isEnabled }).then(r => r.data),

  /** URL for the QR code PNG — fetched via authenticated request. */
  qrImageUrl: (frontendBaseUrl) => {
    const base = import.meta.env.VITE_API_BASE_URL || ''
    return `${base}/api/v1/candidates/my-public-form/qr?frontend_base_url=${encodeURIComponent(frontendBaseUrl)}`
  },
}

// ── Public submission endpoints (no auth — plain axios) ───────────────────────
const _publicBase = (import.meta.env.VITE_API_BASE_URL || '') + '/api/v1'

export const publicApplyService = {
  getFormMeta: (slug) =>
    axios.get(`${_publicBase}/public/apply/${slug}`).then(r => r.data),

  trackOpen: (slug) =>
    axios.post(`${_publicBase}/public/apply/${slug}/open`).catch(() => {}),

  submit: (slug, data) =>
    axios.post(`${_publicBase}/public/apply/${slug}`, data).then(r => r.data),

  uploadResume: (slug, candidateId, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return axios
      .post(`${_publicBase}/public/apply/${slug}/resume?candidate_id=${candidateId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data)
  },

  uploadPhoto: (slug, candidateId, blob) => {
    const fd = new FormData()
    fd.append('file', blob, 'photo.jpg')
    return axios
      .post(`${_publicBase}/public/apply/${slug}/photo?candidate_id=${candidateId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data)
  },
}

export default publicFormService
