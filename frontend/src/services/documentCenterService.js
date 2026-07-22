import api from './api'

const BASE = '/doc-center'

// ─── Categories ───────────────────────────────────────────────────────────────
const listCategories  = ()           => api.get(`${BASE}/categories`)
const createCategory  = (data)       => api.post(`${BASE}/categories`, data)
const updateCategory  = (id, data)   => api.put(`${BASE}/categories/${id}`, data)
const deleteCategory  = (id)         => api.delete(`${BASE}/categories/${id}`)

// ─── Templates ────────────────────────────────────────────────────────────────
const listTemplates   = (params = {}) => api.get(`${BASE}/templates`, { params })
const getTemplate     = (id)          => api.get(`${BASE}/templates/${id}`)
const createTemplate  = (data)        => api.post(`${BASE}/templates`, data)
const updateTemplate  = (id, data)    => api.put(`${BASE}/templates/${id}`, data)
const deleteTemplate  = (id)          => api.delete(`${BASE}/templates/${id}`)
const toggleFavorite  = (id)          => api.post(`${BASE}/templates/${id}/favorite`)
const duplicateTemplate = (id)        => api.post(`${BASE}/templates/${id}/duplicate`)

// ─── Version History ──────────────────────────────────────────────────────────
const listVersions   = (templateId)             => api.get(`${BASE}/templates/${templateId}/versions`)
const restoreVersion = (templateId, versionId)  => api.post(`${BASE}/templates/${templateId}/versions/${versionId}/restore`)
const deleteVersion  = (templateId, versionId)  => api.delete(`${BASE}/templates/${templateId}/versions/${versionId}`)

// ─── Document Generation ──────────────────────────────────────────────────────
const getGenerateContext = (templateId, params = {}) =>
  api.get(`${BASE}/templates/${templateId}/generate-context`, { params })
const generateDocument = (data)   => api.post(`${BASE}/generate`, data)
const listGenerated    = (params) => api.get(`${BASE}/generated`, { params })
const archiveGenerated = (id)     => api.post(`${BASE}/generated/${id}/archive`)
const deleteGenerated  = (id)     => api.delete(`${BASE}/generated/${id}`)
const downloadPDF      = (id)     => `${api.defaults.baseURL}${BASE}/generate/${id}/pdf`
const downloadDOCX     = (id)     => `${api.defaults.baseURL}${BASE}/generate/${id}/docx`

// ─── Approvals ────────────────────────────────────────────────────────────────
const requestApproval = (data)        => api.post(`${BASE}/approvals`, data)
const listApprovals   = (params)      => api.get(`${BASE}/approvals`, { params })
const reviewApproval  = (id, data)    => api.post(`${BASE}/approvals/${id}/review`, data)

// ─── Import ───────────────────────────────────────────────────────────────────
const importDocument = (formData) =>
  api.post(`${BASE}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// ─── Template Library ─────────────────────────────────────────────────────────
const getLibrary        = ()                  => api.get(`${BASE}/library`)
const createFromLibrary = (key, category_id)  =>
  api.post(`${BASE}/library/${key}/create`, null, { params: { category_id } })

// ─── Archive ──────────────────────────────────────────────────────────────────
const listArchive       = (params)  => api.get(`${BASE}/archive`, { params })
const unarchiveTemplate = (id)      => api.post(`${BASE}/archive/${id}/restore`)

// ─── Global Version History ───────────────────────────────────────────────────
const listAllVersions = (params) => api.get(`${BASE}/versions`, { params })

const documentCenterService = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
  toggleFavorite, duplicateTemplate,
  listVersions, restoreVersion, deleteVersion,
  listAllVersions,
  getGenerateContext,
  generateDocument, listGenerated, archiveGenerated, deleteGenerated, downloadPDF, downloadDOCX,
  requestApproval, listApprovals, reviewApproval,
  importDocument,
  getLibrary, createFromLibrary,
  listArchive, unarchiveTemplate,
}

export default documentCenterService
