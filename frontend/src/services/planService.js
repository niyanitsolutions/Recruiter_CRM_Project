import api from './api'

const planService = {
  /**
   * Get all available plans.
   * Uses /auth/plans — the public endpoint that returns per-user pricing fields
   * (price_per_user_monthly / price_per_user_yearly) expected by the plan UI.
   */
  getPlans: () => {
    return api.get('/auth/plans')
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