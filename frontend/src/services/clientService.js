import api from './api'

const clientService = {
  // Get all clients with filters
  getClients: async (params = {}) => {
    const response = await api.get('/clients/', { params })
    return response.data
  },

  // Get client by ID
  getClient: async (clientId) => {
    const response = await api.get(`/clients/${clientId}`)
    return response.data
  },

  // Create new client
  createClient: async (clientData) => {
    const response = await api.post('/clients/', clientData)
    return response.data
  },

  // Update client
  updateClient: async (clientId, clientData) => {
    const response = await api.put(`/clients/${clientId}`, clientData)
    return response.data
  },

  // Delete client
  deleteClient: async (clientId) => {
    const response = await api.delete(`/clients/${clientId}`)
    return response.data
  },

  // Get clients dropdown
  getClientsDropdown: async () => {
    const response = await api.get('/clients/dropdown')
    return response.data
  },

  // Get client statuses
  getStatuses: async () => {
    const response = await api.get('/clients/statuses')
    return response.data
  },

  // Get client types
  getTypes: async () => {
    const response = await api.get('/clients/types')
    return response.data
  },

  // Bulk import preview — parse file, return rows with validation status
  bulkImportPreview: async (file) => {
    const form = new FormData()
    form.append('file', file)
    const response = await api.post('/clients/bulk-import/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  // Bulk import — insert valid rows into the database
  bulkImport: async (file) => {
    const form = new FormData()
    form.append('file', file)
    const response = await api.post('/clients/bulk-import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}

export default clientService