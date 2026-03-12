import api from './api'

const superAdminService = {
  /**
   * Get dashboard statistics
   */
  getDashboard: () => {
    return api.get('/super-admin/dashboard')
  },

  /**
   * List all tenants
   */
  getTenants: (params = {}) => {
    return api.get('/super-admin/tenants', { params })
  },

  /**
   * Get tenant by ID
   */
  getTenant: (tenantId) => {
    return api.get(`/super-admin/tenants/${tenantId}`)
  },

  /**
   * Update tenant status
   */
  updateTenantStatus: (tenantId, status) => {
    return api.put(`/super-admin/tenants/${tenantId}/status`, null, {
      params: { new_status: status },
    })
  },

  /**
   * Delete tenant (soft delete)
   */
  deleteTenant: (tenantId) => {
    return api.delete(`/super-admin/tenants/${tenantId}`)
  },

  /**
   * List all payments
   */
  getPayments: (params = {}) => {
    return api.get('/super-admin/payments', { params })
  },

  /**
   * Get analytics
   */
  getAnalytics: () => {
    return api.get('/super-admin/analytics')
  },

  /**
   * Seed default plans
   */
  seedPlans: () => {
    return api.post('/super-admin/seed-plans')
  },

  /**
   * Create new SuperAdmin
   */
  createSuperAdmin: (data) => {
    return api.post('/super-admin/create-super-admin', null, {
      params: data,
    })
  },

  /**
   * List SuperAdmins
   */
  getSuperAdmins: () => {
    return api.get('/super-admin/super-admins')
  },

  /**
   * Create tenant WITHOUT payment (demo / manual onboarding)
   * payment_status = 'manual_by_admin', email_verified = true
   */
  createTenant: (data) => {
    return api.post('/super-admin/tenants/create', data)
  },

  /**
   * Create tenant WITH recorded offline payment
   * payment_status = 'paid', records commission breakdown
   */
  createTenantWithPayment: (data) => {
    return api.post('/super-admin/tenants/create-with-payment', data)
  },

  /**
   * Get plans list (for create-tenant form)
   */
  getPlans: (params = {}) => {
    return api.get('/auth/plans', { params })
  },
}

export default superAdminService