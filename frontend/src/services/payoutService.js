/**
 * Payout Service - Phase 4
 * API calls for partner payouts and invoices
 */
import api from './api'

const BASE_URL = '/payouts'

const payoutService = {
  // ============== Payouts ==============
  
  // Get all payouts with filters
  getAll: async (params = {}) => {
    const response = await api.get(BASE_URL, { params })
    return response.data
  },

  // Get payout by ID
  getById: async (id) => {
    const response = await api.get(`${BASE_URL}/${id}`)
    return response.data
  },

  // Get my payouts (Partner)
  getMyPayouts: async (params = {}) => {
    const response = await api.get(`${BASE_URL}/my-payouts`, { params })
    return response.data
  },

  // Get my stats (Partner)
  getMyStats: async () => {
    const response = await api.get(`${BASE_URL}/my-stats`)
    return response.data
  },

  // Get eligible payouts (Partner)
  getEligiblePayouts: async () => {
    const response = await api.get(`${BASE_URL}/eligible`)
    return response.data
  },

  // Get accounts dashboard
  getAccountsDashboard: async () => {
    const response = await api.get(`${BASE_URL}/accounts-dashboard`)
    return response.data
  },

  // Update payout eligibility (admin/scheduler)
  updateEligibility: async () => {
    const response = await api.post(`${BASE_URL}/update-eligibility`)
    return response.data
  },

  // Get partner stats
  getPartnerStats: async (partnerId) => {
    const response = await api.get(`${BASE_URL}/partner/${partnerId}/stats`)
    return response.data
  },

  // ============== Invoices ==============
  
  // Get all invoices
  getInvoices: async (params = {}) => {
    const response = await api.get(`${BASE_URL}/invoices`, { params })
    return response.data
  },

  // Get invoice by ID
  getInvoiceById: async (id) => {
    const response = await api.get(`${BASE_URL}/invoices/${id}`)
    return response.data
  },

  // Get my invoices (Partner)
  getMyInvoices: async (params = {}) => {
    const response = await api.get(`${BASE_URL}/invoices/my-invoices`, { params })
    return response.data
  },

  // Get pending approval invoices (Accounts)
  getPendingApproval: async () => {
    const response = await api.get(`${BASE_URL}/invoices/pending-approval`)
    return response.data
  },

  // Get pending payment invoices (Accounts)
  getPendingPayment: async () => {
    const response = await api.get(`${BASE_URL}/invoices/pending-payment`)
    return response.data
  },

  // Raise invoice (Partner)
  raiseInvoice: async (data) => {
    const response = await api.post(`${BASE_URL}/invoices`, data)
    return response.data
  },

  // Approve invoice (Accounts)
  approveInvoice: async (id, data = {}) => {
    const response = await api.post(`${BASE_URL}/invoices/${id}/approve`, data)
    return response.data
  },

  // Reject invoice (Accounts)
  rejectInvoice: async (id, data) => {
    const response = await api.post(`${BASE_URL}/invoices/${id}/reject`, data)
    return response.data
  },

  // Record payment (Accounts)
  recordPayment: async (id, data) => {
    const response = await api.post(`${BASE_URL}/invoices/${id}/record-payment`, data)
    return response.data
  },
}

export default payoutService