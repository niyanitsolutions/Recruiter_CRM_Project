import api from './api'

const planService = {
  /**
   * Get all available plans
   */
  getPlans: (includeTrial = true) => {
    return api.get('/plans/', { params: { include_trial: includeTrial } })
  },

  /**
   * Get plan by ID
   */
  getPlan: (planId) => {
    return api.get(`/plans/${planId}`)
  },

  /**
   * Initiate plan upgrade
   */
  upgradePlan: (planId, billingCycle = 'monthly') => {
    return api.post('/plans/upgrade', null, {
      params: { plan_id: planId, billing_cycle: billingCycle },
    })
  },
}

export default planService