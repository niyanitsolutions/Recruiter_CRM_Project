/**
 * Subscription Service
 * Fetches seat usage and subscription status from the backend.
 */
import api from './api'

const subscriptionService = {
  /** Tenant: get own seat & subscription status */
  getTenantSeatStatus: () =>
    api.get('/users/seat-status'),

  /** Seller: get own seat & subscription status */
  getSellerSeatStatus: () =>
    api.get('/sellers/me/seat-status'),

  /**
   * Create a Razorpay order for seat upgrade.
   * payment_type = "seat_upgrade" tells the backend to accumulate, not replace.
   */
  createSeatUpgradeOrder: (tenantId, planId, additionalSeats, billingCycle = 'monthly') =>
    api.post('/auth/renewal-order', {
      tenant_id:    tenantId,
      plan_id:      planId,
      billing_cycle: billingCycle,
      user_count:   additionalSeats,
      payment_type: 'seat_upgrade',
    }),
}

export default subscriptionService
