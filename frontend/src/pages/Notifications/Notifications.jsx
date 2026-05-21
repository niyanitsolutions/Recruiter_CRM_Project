import React, { useState, useEffect } from 'react'
import { 
  Bell, CheckCircle, Check, CheckCheck, Trash2, 
  Settings, Filter, Clock, AlertCircle, DollarSign,
  UserPlus, FileText, Calendar
} from 'lucide-react'
import { notificationService } from '../../services'

const TYPE_ICONS = {
  // Recruitment / Onboarding
  offer_released:    UserPlus,
  offer_accepted:    CheckCircle,
  offer_declined:    AlertCircle,
  doj_confirmed:     Calendar,
  doj_reminder:      Clock,
  doj_extended:      Clock,
  candidate_joined:  UserPlus,
  candidate_no_show: AlertCircle,
  document_pending:  FileText,
  document_submitted:FileText,
  document_verified: CheckCircle,
  document_rejected: AlertCircle,
  // Financial
  payout_eligible:   DollarSign,
  invoice_raised:    FileText,
  invoice_approved:  CheckCircle,
  invoice_rejected:  AlertCircle,
  payment_processed: DollarSign,
  // Reminders
  day_10_reminder:   Clock,
  day_30_reminder:   Clock,
  payout_day_reminder: DollarSign,
  // Task / Mention
  task_assigned:     FileText,
  mention:           Bell,
  system_alert:      AlertCircle,
  // HRM
  hrm_user_created:   UserPlus,
  hrm_emp_created:    UserPlus,
  hrm_leave_applied:  Calendar,
  hrm_leave_action:   CheckCircle,
  hrm_offer_sent:     FileText,
  hrm_onboard_update: CheckCircle,
  hrm_review_created: FileText,
  hrm_review_submitted: CheckCircle,
  announcement:       Bell,
  interview_scheduled: Calendar,
  default:            Bell,
}

const TYPE_COLORS = {
  offer_released:    'bg-blue-100 text-blue-600',
  offer_accepted:    'bg-green-100 text-green-600',
  offer_declined:    'bg-red-100 text-red-600',
  doj_confirmed:     'bg-teal-100 text-teal-600',
  doj_reminder:      'bg-orange-100 text-orange-600',
  doj_extended:      'bg-yellow-100 text-yellow-600',
  candidate_joined:  'bg-emerald-100 text-emerald-600',
  candidate_no_show: 'bg-red-100 text-red-600',
  document_pending:  'bg-yellow-100 text-yellow-600',
  document_submitted:'bg-blue-100 text-blue-600',
  document_verified: 'bg-green-100 text-green-600',
  document_rejected: 'bg-red-100 text-red-600',
  payout_eligible:   'bg-purple-100 text-purple-600',
  invoice_raised:    'bg-yellow-100 text-yellow-600',
  invoice_approved:  'bg-green-100 text-green-600',
  invoice_rejected:  'bg-red-100 text-red-600',
  payment_processed: 'bg-green-100 text-green-600',
  day_10_reminder:   'bg-orange-100 text-orange-600',
  day_30_reminder:   'bg-orange-100 text-orange-600',
  payout_day_reminder:'bg-purple-100 text-purple-600',
  task_assigned:     'bg-blue-100 text-blue-600',
  mention:           'bg-indigo-100 text-indigo-600',
  system_alert:      'bg-red-100 text-red-600',
  hrm_user_created:  'bg-indigo-100 text-indigo-600',
  hrm_emp_created:   'bg-teal-100 text-teal-600',
  hrm_leave_applied: 'bg-yellow-100 text-yellow-600',
  hrm_leave_action:  'bg-green-100 text-green-600',
  hrm_offer_sent:    'bg-blue-100 text-blue-600',
  hrm_onboard_update:'bg-emerald-100 text-emerald-600',
  hrm_review_created:'bg-purple-100 text-purple-600',
  hrm_review_submitted:'bg-green-100 text-green-600',
  announcement:      'bg-orange-100 text-orange-600',
  interview_scheduled:'bg-blue-100 text-blue-600',
  default:           'bg-gray-100 text-gray-600',
}

const Notifications = () => {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [filters, setFilters] = useState({
    is_read: null,
    notification_type: '',
    page: 1,
    page_size: 20
  })
  const [pagination, setPagination] = useState({ total: 0, pages: 1 })

  useEffect(() => {
    fetchNotifications()
    fetchUnreadCount()
  }, [filters])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const response = await notificationService.getAll(filters)
      setNotifications(response.items || [])
      setPagination({ total: response.total, pages: response.pages || 1 })
      setUnreadCount(response.unread_count || 0)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const response = await notificationService.getUnreadCount()
      setUnreadCount(response.unread_count || 0)
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }

  const handleMarkAsRead = async (id) => {
    try {
      await notificationService.markAsRead(id)
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const handleDelete = async (id) => {
    try {
      await notificationService.delete(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const getIcon = (type) => {
    const IconComponent = TYPE_ICONS[type] || TYPE_ICONS.default
    return IconComponent
  }

  const getIconColor = (type) => {
    return TYPE_COLORS[type] || TYPE_COLORS.default
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now - date) / 1000)
    
    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Bell className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Notifications</h1>
            <p className="text-surface-600">
              {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-2 px-4 py-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              <CheckCheck className="w-5 h-5" />
              Mark all as read
            </button>
          )}
          <button
            className="flex items-center gap-2 px-4 py-2 border border-surface-300 rounded-lg hover:bg-surface-50"
          >
            <Settings className="w-5 h-5" />
            Preferences
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-surface-200">
        <div className="flex flex-wrap gap-4">
          <select
            value={filters.is_read === null ? '' : filters.is_read.toString()}
            onChange={(e) => setFilters(prev => ({ 
              ...prev, 
              is_read: e.target.value === '' ? null : e.target.value === 'true',
              page: 1 
            }))}
            className="px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Notifications</option>
            <option value="false">Unread Only</option>
            <option value="true">Read Only</option>
          </select>
          <select
            value={filters.notification_type}
            onChange={(e) => setFilters(prev => ({ ...prev, notification_type: e.target.value, page: 1 }))}
            className="px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Types</option>
            <optgroup label="Recruitment">
              <option value="offer_released">Offer Released</option>
              <option value="offer_accepted">Offer Accepted</option>
              <option value="offer_declined">Offer Declined</option>
              <option value="candidate_joined">Candidate Joined</option>
              <option value="candidate_no_show">Candidate No Show</option>
              <option value="doj_confirmed">DOJ Confirmed</option>
              <option value="doj_reminder">DOJ Reminder</option>
              <option value="document_pending">Document Pending</option>
              <option value="document_verified">Document Verified</option>
            </optgroup>
            <optgroup label="Financial">
              <option value="payout_eligible">Payout Eligible</option>
              <option value="invoice_raised">Invoice Raised</option>
              <option value="invoice_approved">Invoice Approved</option>
              <option value="invoice_rejected">Invoice Rejected</option>
              <option value="payment_processed">Payment Processed</option>
            </optgroup>
            <optgroup label="HRM">
              <option value="hrm_user_created">User Created (HRM)</option>
              <option value="hrm_emp_created">Employee Created</option>
              <option value="hrm_leave_applied">Leave Applied</option>
              <option value="hrm_leave_action">Leave Action</option>
              <option value="hrm_offer_sent">Offer Sent (HRM)</option>
              <option value="hrm_onboard_update">Onboarding Update</option>
              <option value="announcement">Announcement</option>
              <option value="interview_scheduled">Interview Scheduled</option>
            </optgroup>
            <optgroup label="System">
              <option value="task_assigned">Task Assigned</option>
              <option value="mention">Mention</option>
              <option value="system_alert">System Alert</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-surface-500">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-surface-500">
            <Bell className="w-12 h-12 mx-auto mb-4 text-surface-300" />
            <p>No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-200">
            {notifications.map((notification) => {
              const IconComponent = getIcon(notification.type)
              const iconColor = getIconColor(notification.type)
              
              return (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-surface-50 transition-colors ${
                    !notification.is_read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${iconColor}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={`font-medium ${!notification.is_read ? 'text-surface-900' : 'text-surface-700'}`}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-surface-600 mt-1">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-surface-400">
                              {formatTime(notification.created_at)}
                            </span>
                            {notification.action_url && (
                              <a
                                href={notification.action_url}
                                className="text-xs text-primary-600 hover:underline"
                              >
                                View details →
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!notification.is_read && (
                            <button
                              onClick={() => handleMarkAsRead(notification.id)}
                              className="p-2 hover:bg-surface-100 rounded-lg"
                              title="Mark as read"
                            >
                              <Check className="w-4 h-4 text-surface-500" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(notification.id)}
                            className="p-2 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-surface-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary-500 mt-2" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-600">
              Page {filters.page} of {pagination.pages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={filters.page === 1}
                className="px-3 py-1 border border-surface-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={filters.page === pagination.pages}
                className="px-3 py-1 border border-surface-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Notifications