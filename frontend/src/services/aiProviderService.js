import api from './api'

const aiProviderService = {
  /** Get supported providers and available models */
  getProviders() {
    return api.get('/super-admin/ai-provider/providers')
  },

  /** Get the current AI provider configuration (API key is masked) */
  getConfig() {
    return api.get('/super-admin/ai-provider')
  },

  /** Save (create or update) the AI provider configuration */
  saveConfig(data) {
    return api.post('/super-admin/ai-provider', data)
  },

  /** Remove the stored API key without deleting the rest of the configuration */
  removeApiKey() {
    return api.delete('/super-admin/ai-provider/api-key')
  },

  /** Test a provider configuration before saving */
  testConnection(data) {
    return api.post('/super-admin/ai-provider/test', data)
  },
}

export default aiProviderService
