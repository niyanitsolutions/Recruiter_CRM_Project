import api from './api'

const tenantService = {
  /**
   * Get current tenant details
   */
  getCurrentTenant: () => {
    return api.get('/tenants/current')
  },

  /**
   * Get current plan and usage
   */
  getPlanUsage: () => {
    return api.get('/tenants/plan')
  },

  /**
   * Update tenant details
   */
  updateTenant: (data) => {
    return api.put('/tenants/update', null, { params: data })
  },

  /**
   * Validate registration field
   */
  validateField: (field, value) => {
    return api.post('/tenants/validate', { field, value })
  },
}

export default tenantService