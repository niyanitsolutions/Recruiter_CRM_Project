import api from './api'

const platformSettingsService = {
  getSettings: () => api.get('/platform-settings'),
  updateSettings: (data) => api.put('/platform-settings', data),
}

export default platformSettingsService
