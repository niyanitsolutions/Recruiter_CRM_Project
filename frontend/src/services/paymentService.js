import api from './api'

const paymentService = {
  /**
   * Create Razorpay order
   */
  createOrder: (tenantId, planId, billingCycle = 'monthly') => {
    return api.post('/payments/create-order', {
      tenant_id: tenantId,
      plan_id: planId,
      billing_cycle: billingCycle,
    })
  },

  /**
   * Verify payment after Razorpay completion
   */
  verifyPayment: (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
    return api.post('/payments/verify', {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    })
  },

  /**
   * Get payment history
   */
  getHistory: (page = 1, limit = 20) => {
    return api.get('/payments/history', { params: { page, limit } })
  },

  /**
   * Get invoice details
   */
  getInvoice: (paymentId) => {
    return api.get(`/payments/invoice/${paymentId}`)
  },

  /**
   * Get current subscription
   */
  getCurrentSubscription: () => {
    return api.get('/payments/current-subscription')
  },
}

export default paymentService