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
   *
   * activation = 'now'   → payment_type "new_subscription":
   *                        current plan ends immediately, new plan starts now.
   *                        Backend preserves licensed seats (max of current vs requested).
   * activation = 'queue' → payment_type "plan_change_queued":
   *                        paid now, activates automatically when the current
   *                        plan expires (renewal queue).
   *
   * @param {string} tenantId
   * @param {string} planId        – new plan ID
   * @param {string} billingCycle  – 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'
   * @param {number} userCount     – total seats after change
   * @param {string} activation    – 'now' | 'queue'
   */
  createPlanChangeOrder: (tenantId, planId, billingCycle, userCount, activation = 'now') =>
    api.post('/auth/renew/create-order', {
      tenant_id:     tenantId,
      plan_id:       planId,
      billing_cycle: billingCycle,
      user_count:    userCount,
      payment_type:  activation === 'queue' ? 'plan_change_queued' : 'new_subscription',
      extend_months: 0,
    }),

  /**
   * Same-plan renewal. Licensed seats are derived SERVER-SIDE (purchased seats
   * persist across renewals; any scheduled reduction applies on the new cycle).
   * payment_type = "renewal"
   */
  createRenewalOrder: (tenantId, planId, billingCycle, userCount = 0) =>
    api.post('/auth/renew/create-order', {
      tenant_id:     tenantId,
      plan_id:       planId,
      billing_cycle: billingCycle,
      user_count:    userCount,
      payment_type:  'renewal',
      extend_months: 0,
    }),

  /** Full subscription overview: licensed_seats, scheduled_seat_reduction, queued_subscriptions */
  getCurrentSubscription: () =>
    api.get('/payments/current-subscription'),

  /** Schedule a seat reduction — takes effect on the NEXT billing cycle */
  scheduleSeatReduction: (targetSeats) =>
    api.post('/payments/subscription/reduce-seats', { target_seats: targetSeats }),

  /** Cancel a pending scheduled seat reduction */
  cancelSeatReduction: () =>
    api.delete('/payments/subscription/reduce-seats'),

  /** Cancel a queued (not yet active) plan */
  cancelQueuedPlan: (entryId) =>
    api.post(`/payments/subscription/queue/${entryId}/cancel`),
}

export default subscriptionService
