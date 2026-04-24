import api from './api'

const BASE = '/integrations'

const integrationService = {
  // Get all available provider definitions (form schemas)
  getDefinitions: () => api.get(`${BASE}/definitions`).then(r => r.data),

  // List installed integrations for the current company
  list: () => api.get(BASE).then(r => r.data),

  // Create or update an integration
  upsert: (data) => api.post(BASE, data).then(r => r.data),

  // Test connection for a given provider
  test: (provider) => api.post(`${BASE}/${provider}/test`).then(r => r.data),

  // Enable or disable a provider
  setActive: (provider, active) =>
    api.patch(`${BASE}/${provider}/active`, { active }).then(r => r.data),

  // Delete an integration config
  remove: (provider) => api.delete(`${BASE}/${provider}`).then(r => r.data),
}

export default integrationService
