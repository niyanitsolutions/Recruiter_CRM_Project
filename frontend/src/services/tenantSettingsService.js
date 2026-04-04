import api from './api'

const BASE = '/tenant-settings'

const tenantSettingsService = {
  // Teams
  getTeams: () => api.get(`${BASE}/teams`).then(r => r.data),
  createTeam: (data) => api.post(`${BASE}/teams`, data).then(r => r.data),
  updateTeam: (id, data) => api.put(`${BASE}/teams/${id}`, data).then(r => r.data),
  deleteTeam: (id) => api.delete(`${BASE}/teams/${id}`).then(r => r.data),

  // Branches
  getBranches: () => api.get(`${BASE}/branches`).then(r => r.data),
  createBranch: (data) => api.post(`${BASE}/branches`, data).then(r => r.data),
  updateBranch: (id, data) => api.put(`${BASE}/branches/${id}`, data).then(r => r.data),
  deleteBranch: (id) => api.delete(`${BASE}/branches/${id}`).then(r => r.data),

  // Pipeline Stages
  getPipelineStages: () => api.get(`${BASE}/pipeline-stages`).then(r => r.data),
  createPipelineStage: (data) => api.post(`${BASE}/pipeline-stages`, data).then(r => r.data),
  updatePipelineStage: (id, data) => api.put(`${BASE}/pipeline-stages/${id}`, data).then(r => r.data),
  deletePipelineStage: (id) => api.delete(`${BASE}/pipeline-stages/${id}`).then(r => r.data),
  reorderPipelineStages: (stage_ids) => api.put(`${BASE}/pipeline-stages/reorder`, { stage_ids }).then(r => r.data),

  // Job Categories
  getJobCategories: () => api.get(`${BASE}/job-categories`).then(r => r.data),
  createJobCategory: (data) => api.post(`${BASE}/job-categories`, data).then(r => r.data),
  updateJobCategory: (id, data) => api.put(`${BASE}/job-categories/${id}`, data).then(r => r.data),
  deleteJobCategory: (id) => api.delete(`${BASE}/job-categories/${id}`).then(r => r.data),

  // Skills
  getSkills: () => api.get(`${BASE}/skills`).then(r => r.data),
  createSkill: (data) => api.post(`${BASE}/skills`, data).then(r => r.data),
  updateSkill: (id, data) => api.put(`${BASE}/skills/${id}`, data).then(r => r.data),
  deleteSkill: (id) => api.delete(`${BASE}/skills/${id}`).then(r => r.data),

  // Document Templates
  getDocumentTemplates: () => api.get(`${BASE}/document-templates`).then(r => r.data),
  createDocumentTemplate: (data) => api.post(`${BASE}/document-templates`, data).then(r => r.data),
  updateDocumentTemplate: (id, data) => api.put(`${BASE}/document-templates/${id}`, data).then(r => r.data),
  deleteDocumentTemplate: (id) => api.delete(`${BASE}/document-templates/${id}`).then(r => r.data),

  // Commission Rules
  getCommissionRules: () => api.get(`${BASE}/commission-rules`).then(r => r.data),
  createCommissionRule: (data) => api.post(`${BASE}/commission-rules`, data).then(r => r.data),
  updateCommissionRule: (id, data) => api.put(`${BASE}/commission-rules/${id}`, data).then(r => r.data),
  deleteCommissionRule: (id) => api.delete(`${BASE}/commission-rules/${id}`).then(r => r.data),

  // SLA Rules
  getSLARules: () => api.get(`${BASE}/sla-rules`).then(r => r.data),
  createSLARule: (data) => api.post(`${BASE}/sla-rules`, data).then(r => r.data),
  updateSLARule: (id, data) => api.put(`${BASE}/sla-rules/${id}`, data).then(r => r.data),
  deleteSLARule: (id) => api.delete(`${BASE}/sla-rules/${id}`).then(r => r.data),

  // Single-doc settings
  getInvoiceSettings: () => api.get(`${BASE}/invoice-settings`).then(r => r.data),
  saveInvoiceSettings: (data) => api.put(`${BASE}/invoice-settings`, data).then(r => r.data),

  getLocalization: () => api.get(`${BASE}/localization`).then(r => r.data),
  saveLocalization: (data) => api.put(`${BASE}/localization`, data).then(r => r.data),

  getEmailConfig: () => api.get(`${BASE}/email-config`).then(r => r.data),
  saveEmailConfig: (data) => api.put(`${BASE}/email-config`, data).then(r => r.data),

  getNotificationMatrix: () => api.get(`${BASE}/notification-matrix`).then(r => r.data),
  saveNotificationMatrix: (data) => api.put(`${BASE}/notification-matrix`, data).then(r => r.data),

  getSecuritySettings: () => api.get(`${BASE}/security-settings`).then(r => r.data),
  saveSecuritySettings: (data) => api.put(`${BASE}/security-settings`, data).then(r => r.data),

  getResumeParsing: () => api.get(`${BASE}/resume-parsing`).then(r => r.data),
  saveResumeParsing: (data) => api.put(`${BASE}/resume-parsing`, data).then(r => r.data),

  getInterviewSettings: () => api.get(`${BASE}/interview-settings`).then(r => r.data),
  saveInterviewSettings: (data) => api.put(`${BASE}/interview-settings`, data).then(r => r.data),

  getBranding: () => api.get(`${BASE}/branding`).then(r => r.data),
  saveBranding: (data) => api.put(`${BASE}/branding`, data).then(r => r.data),

  getDataManagement: () => api.get(`${BASE}/data-management`).then(r => r.data),
  saveDataManagement: (data) => api.put(`${BASE}/data-management`, data).then(r => r.data),

  // Candidate Sources
  getCandidateSources: () => api.get(`${BASE}/candidate-sources`).then(r => r.data),
  createCandidateSource: (data) => api.post(`${BASE}/candidate-sources`, data).then(r => r.data),
  updateCandidateSource: (id, data) => api.put(`${BASE}/candidate-sources/${id}`, data).then(r => r.data),
  deleteCandidateSource: (id) => api.delete(`${BASE}/candidate-sources/${id}`).then(r => r.data),

  // Email Config Test
  testEmailConfig: (to) => api.post(`${BASE}/email-config/test`, { to }).then(r => r.data),
}

export default tenantSettingsService
