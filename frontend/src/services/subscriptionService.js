/**
 * Subscription Service
 *
 * Four independent upgrade flows:
 *   extend            – Extend expiry only (extend_duration)
 *   seats             – Add seats only, preserve expiry (seat_upgrade)
 *   change_plan       – Change plan + billing cycle, same seat count (renewal)
 *   change_plan_seats – Change plan + billing cycle + add seats (renewal)
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
   * FLOW 1 — Extend subscription duration only.
   * Does NOT change plan or seat count.
   * payment_type = "extend_duration"
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
   * FLOW 2 — Add seats only.
   * Does NOT change the subscription expiry date or plan.
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
   * FLOW 3 & 4 — Change plan (and optionally seats).
   * Updates plan_name, billing_cycle, max_users, and resets plan_expiry.
   * payment_type = "renewal"
   *
   * @param {string} tenantId
   * @param {string} planId        – new plan ID
   * @param {string} billingCycle  – 'monthly' | 'yearly'
   * @param {number} userCount     – total seats after change (existingSeats for plan-only, existingSeats + added for plan+seats)
   */
  createPlanChangeOrder: (tenantId, planId, billingCycle, userCount) =>
    api.post('/auth/renew/create-order', {
      tenant_id:     tenantId,
      plan_id:       planId,
      billing_cycle: billingCycle,
      user_count:    userCount,
      payment_type:  'renewal',
      extend_months: 0,
    }),
}

export default subscriptionService
