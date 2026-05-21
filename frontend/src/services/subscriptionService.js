/**
 * Subscription Service
 * Fetches seat usage and subscription status from the backend.
 * Supports three upgrade payment types:
 *   seat_upgrade        – add seats only, preserve expiry
 *   extend_duration     – extend expiry only, preserve seats
 *   seat_upgrade_extend – add seats AND extend expiry together
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
   * Add seats only — does NOT change the subscription expiry date.
   * payment_type = "seat_upgrade"
   */
  createSeatUpgradeOrder: (tenantId, planId, additionalSeats, billingCycle = 'monthly') =>
    api.post('/auth/renew/create-order', {
      tenant_id:     tenantId,
      plan_id:       planId,
      billing_cycle: billingCycle,
      user_count:    additionalSeats,
      payment_type:  'seat_upgrade',
      extend_months: 0,
    }),

  /**
   * Extend subscription duration only — does NOT change seat count.
   * payment_type = "extend_duration"
   * extend_months: 1 | 3 | 6 | 12
   */
  createExtensionOrder: (tenantId, planId, extendMonths) =>
    api.post('/auth/renew/create-order', {
      tenant_id:     tenantId,
      plan_id:       planId,
      billing_cycle: 'monthly',
      user_count:    0,
      payment_type:  'extend_duration',
      extend_months: extendMonths,
    }),

  /**
   * Add seats AND extend duration together.
   * payment_type = "seat_upgrade_extend"
   */
  createCombinedUpgradeOrder: (tenantId, planId, additionalSeats, extendMonths, billingCycle = 'monthly') =>
    api.post('/auth/renew/create-order', {
      tenant_id:     tenantId,
      plan_id:       planId,
      billing_cycle: billingCycle,
      user_count:    additionalSeats,
      payment_type:  'seat_upgrade_extend',
      extend_months: extendMonths,
    }),
}

export default subscriptionService
