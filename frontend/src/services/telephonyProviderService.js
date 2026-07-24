import api from './api'

const telephonyProviderService = {
  /** Get supported providers with metadata and required fields */
  getProviders() {
    return api.get('/super-admin/telephony-provider/providers')
  },

  /** Get all tenants with their current telephony status (management table) */
  getTenants() {
    return api.get('/super-admin/telephony-provider/tenants')
  },

  /** Get one tenant's telephony configuration (secrets masked) */
  getConfig(companyId) {
    return api.get(`/super-admin/telephony-provider/${companyId}`)
  },

  /** Save (create or update) a tenant's provider configuration */
  saveConfig(companyId, provider, credentials, callerIds = [], activate = false) {
    return api.post(`/super-admin/telephony-provider/${companyId}/save`, {
      provider, credentials, caller_ids: callerIds, activate,
    })
  },

  /** Enable or disable telephony for a tenant */
  toggle(companyId, enabled) {
    return api.post(`/super-admin/telephony-provider/${companyId}/toggle`, { enabled })
  },

  /** Switch a tenant's active provider */
  setProvider(companyId, provider) {
    return api.post(`/super-admin/telephony-provider/${companyId}/set-provider`, { provider })
  },

  /** Delete a tenant's telephony configuration */
  deleteConfig(companyId) {
    return api.delete(`/super-admin/telephony-provider/${companyId}`)
  },

  /** Test connection for a tenant + provider with given credentials */
  testConnection(companyId, provider, credentials) {
    return api.post(`/super-admin/telephony-provider/${companyId}/test`, { provider, credentials })
  },

  /** On-demand provider health check for a tenant (Phase 3) */
  getHealth(companyId) {
    return api.get(`/super-admin/telephony-provider/${companyId}/health`)
  },
}

export default telephonyProviderService
