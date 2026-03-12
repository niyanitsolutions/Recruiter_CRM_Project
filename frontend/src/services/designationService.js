import api from './api'

const designationService = {
  // Get all designations
  getDesignations: async (params = {}) => {
    const response = await api.get('/designations/', { params })
    return response.data
  },

  // Get designation by ID
  getDesignation: async (desigId) => {
    const response = await api.get(`/designations/${desigId}`)
    return response.data
  },

  // Create new designation
  createDesignation: async (desigData) => {
    const response = await api.post('/designations/', desigData)
    return response.data
  },

  // Update designation
  updateDesignation: async (desigId, desigData) => {
    const response = await api.put(`/designations/${desigId}`, desigData)
    return response.data
  },

  // Delete designation
  deleteDesignation: async (desigId) => {
    const response = await api.delete(`/designations/${desigId}`)
    return response.data
  },

  // Get designation levels
  getDesignationLevels: async () => {
    const response = await api.get('/designations/levels')
    return response.data
  },

  // Get designations grouped by level
  getDesignationsByLevel: async () => {
    const response = await api.get('/designations/by-level')
    return response.data
  },
}

export default designationService