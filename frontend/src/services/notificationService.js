/**
 * Notification Service - Phase 4
 * API calls for notifications and reminders
 */
import api from './api'

const BASE_URL = '/notifications'

const notificationService = {
  // ============== Notifications ==============
  
  // Get all notifications
  getAll: async (params = {}) => {
    const response = await api.get(BASE_URL, { params })
    return response.data
  },

  // Get notification by ID
  getById: async (id) => {
    const response = await api.get(`${BASE_URL}/${id}`)
    return response.data
  },

  // Get unread count
  getUnreadCount: async () => {
    const response = await api.get(`${BASE_URL}/unread-count`)
    return response.data
  },

  // Mark as read
  markAsRead: async (id) => {
    const response = await api.post(`${BASE_URL}/${id}/read`)
    return response.data
  },

  // Mark all as read
  markAllAsRead: async () => {
    const response = await api.post(`${BASE_URL}/read-all`)
    return response.data
  },

  // Delete notification
  delete: async (id) => {
    const response = await api.delete(`${BASE_URL}/${id}`)
    return response.data
  },

  // ============== Admin/System ==============
  
  // Create notification (Admin)
  create: async (data) => {
    const response = await api.post(BASE_URL, data)
    return response.data
  },

  // Create bulk notifications (Admin)
  createBulk: async (notifications) => {
    const response = await api.post(`${BASE_URL}/bulk`, notifications)
    return response.data
  },

  // ============== Reminders ==============
  
  // Create scheduled reminder
  createReminder: async (data) => {
    const response = await api.post(`${BASE_URL}/reminders`, data)
    return response.data
  },

  // Process due reminders (scheduler)
  processReminders: async () => {
    const response = await api.post(`${BASE_URL}/reminders/process`)
    return response.data
  },

  // Cancel reminder
  cancelReminder: async (id) => {
    const response = await api.delete(`${BASE_URL}/reminders/${id}`)
    return response.data
  },

  // ============== Preferences ==============
  
  // Get preferences
  getPreferences: async () => {
    const response = await api.get(`${BASE_URL}/preferences`)
    return response.data
  },

  // Update preferences
  updatePreferences: async (data) => {
    const response = await api.put(`${BASE_URL}/preferences`, data)
    return response.data
  },
}

export default notificationService