import api from './api'

const settingsService = {
  // ============== Custom Fields ==============
  getCustomFields: async (entityType = null) => {
    const params = entityType ? { entity_type: entityType } : {}
    const response = await api.get('/settings/custom-fields', { params })
    return response.data
  },

  createCustomField: async (fieldData) => {
    const response = await api.post('/settings/custom-fields', fieldData)
    return response.data
  },

  updateCustomField: async (fieldId, fieldData) => {
    const response = await api.put(`/settings/custom-fields/${fieldId}`, fieldData)
    return response.data
  },

  deleteCustomField: async (fieldId) => {
    const response = await api.delete(`/settings/custom-fields/${fieldId}`)
    return response.data
  },

  getEntityTypes: async () => {
    const response = await api.get('/settings/custom-fields/entity-types')
    return response.data
  },

  getFieldTypes: async () => {
    const response = await api.get('/settings/custom-fields/field-types')
    return response.data
  },

  // ============== Interview Stages ==============
  getInterviewStages: async () => {
    const response = await api.get('/settings/interview-stages')
    return response.data
  },

  getInterviewStagesDropdown: async () => {
    const response = await api.get('/settings/interview-stages/dropdown')
    return response.data
  },

  initializeInterviewStages: async () => {
    const response = await api.post('/settings/interview-stages/initialize')
    return response.data
  },

  createInterviewStage: async (stageData) => {
    const response = await api.post('/settings/interview-stages', stageData)
    return response.data
  },

  updateInterviewStage: async (stageId, stageData) => {
    const response = await api.put(`/settings/interview-stages/${stageId}`, stageData)
    return response.data
  },

  deleteInterviewStage: async (stageId) => {
    const response = await api.delete(`/settings/interview-stages/${stageId}`)
    return response.data
  },

  reorderInterviewStages: async (stageOrders) => {
    const response = await api.put('/settings/interview-stages/reorder', stageOrders)
    return response.data
  },

  // ============== Email Templates ==============
  getEmailTemplates: async () => {
    const response = await api.get('/settings/email-templates')
    return response.data
  },

  initializeEmailTemplates: async () => {
    const response = await api.post('/settings/email-templates/initialize')
    return response.data
  },

  getEmailTemplate: async (templateCode) => {
    const response = await api.get(`/settings/email-templates/${templateCode}`)
    return response.data
  },

  updateEmailTemplate: async (templateId, templateData) => {
    const response = await api.put(`/settings/email-templates/${templateId}`, templateData)
    return response.data
  },

  // ============== Company Settings ==============
  getCompanySettings: async () => {
    const response = await api.get('/settings/company')
    return response.data
  },

  updateCompanySettings: async (settingsData) => {
    const response = await api.put('/settings/company', settingsData)
    return response.data
  },
}

export default settingsService