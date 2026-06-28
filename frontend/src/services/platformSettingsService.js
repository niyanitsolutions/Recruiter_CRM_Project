import api from './api'

const platformSettingsService = {
  getSettings: () => api.get('/platform-settings'),
  updateSettings: (data) => api.put('/platform-settings', data),
  testSmtp: (smtpFields) => api.post('/platform-settings/smtp-test', smtpFields),
}

export default platformSettingsService
