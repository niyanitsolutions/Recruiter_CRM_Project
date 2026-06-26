import api from './api'

const paymentProviderService = {
  /** Get supported providers with metadata and required fields */
  getProviders() {
    return api.get('/super-admin/payment-provider/providers')
  },

  /** Get the full payment provider configuration (secrets masked) */
  getConfig() {
    return api.get('/super-admin/payment-provider')
  },

  /** Enable or disable payments globally */
  togglePayments(enabled) {
    return api.post('/super-admin/payment-provider/toggle', { enabled })
  },

  /** Save (create or update) config for a specific provider */
  saveProvider(provider, config, activate = false) {
    return api.post('/super-admin/payment-provider/save', { provider, config, activate })
  },

  /** Switch the active payment provider */
  setActive(provider) {
    return api.post('/super-admin/payment-provider/set-active', { provider })
  },

  /** Clear the active provider */
  deactivate() {
    return api.post('/super-admin/payment-provider/deactivate')
  },

  /** Delete all configuration for a specific provider */
  deleteProvider(provider) {
    return api.delete(`/super-admin/payment-provider/${provider}`)
  },

  /** Test connection for a provider with given credentials */
  testConnection(provider, config) {
    return api.post('/super-admin/payment-provider/test', { provider, config })
  },

  /** Quick status: are payments enabled and which provider is active */
  getStatus() {
    return api.get('/super-admin/payment-provider/status')
  },
}

export default paymentProviderService
