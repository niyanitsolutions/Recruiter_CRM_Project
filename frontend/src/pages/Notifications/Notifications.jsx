import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell, Check, CheckCheck, Trash2, Settings,
  Clock, AlertCircle, DollarSign, UserPlus, FileText,
  Calendar, CheckCircle, RefreshCw, CreditCard, Users2, Megaphone,
} from 'lucide-react'
import { notificationService } from '../../services'
import { getTenantTimezone } from '../../utils/format'

const TYPE_ICONS = {
  offer_released:       UserPlus,
  offer_accepted:       CheckCircle,
  offer_declined:       AlertCircle,
  doj_confirmed:        Calendar,
  doj_reminder:         Clock,
  doj_extended:         Clock,
  candidate_joined:     UserPlus,
  candidate_no_show:    AlertCircle,
  document_pending:     FileText,
  document_submitted:   FileText,
  document_verified:    CheckCircle,
  document_rejected:    AlertCircle,
  payout_eligible:      DollarSign,
  invoice_raised:       FileText,
  invoice_approved:     CheckCircle,
  invoice_rejected:     AlertCircle,
  payment_processed:    DollarSign,
  day_10_reminder:      Clock,
  day_30_reminder:      Clock,
  payout_day_reminder:  DollarSign,
  task_assigned:        FileText,
  mention:              Bell,
  system_alert:         AlertCircle,
  hrm_user_created:     UserPlus,
  hrm_emp_created:      UserPlus,
  hrm_leave_applied:    Calendar,
  hrm_leave_action:     CheckCircle,
  hrm_offer_sent:       FileText,
  hrm_onboard_update:   CheckCircle,
  hrm_review_created:   FileText,
  hrm_review_submitted: CheckCircle,
  announcement:         Megaphone,
  interview_scheduled:  Calendar,
  sync_pending:         RefreshCw,
  subscription_expiry:  CreditCard,
  seat_limit_reached:   Users2,
  attendance_punch_in:  Clock,
  attendance_punch_out: Clock,
  attendance_pending:   AlertCircle,
}

const TYPE_COLORS = {
  offer_released:       { bg: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  offer_accepted:       { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  offer_declined:       { bg: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  doj_confirmed:        { bg: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  doj_reminder:         { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  doj_extended:         { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  candidate_joined:     { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  candidate_no_show:    { bg: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  document_pending:     { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  document_submitted:   { bg: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  document_verified:    { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  document_rejected:    { bg: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  payout_eligible:      { bg: 'rgba(108,99,255,0.15)',   color: '#A78BFA' },
  invoice_raised:       { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  invoice_approved:     { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  invoice_rejected:     { bg: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  payment_processed:    { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  day_10_reminder:      { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  day_30_reminder:      { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  payout_day_reminder:  { bg: 'rgba(108,99,255,0.15)',   color: '#A78BFA' },
  task_assigned:        { bg: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  mention:              { bg: 'rgba(99,102,241,0.15)',   color: '#818CF8' },
  system_alert:         { bg: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  hrm_user_created:     { bg: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  hrm_emp_created:      { bg: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  hrm_leave_applied:    { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  hrm_leave_action:     { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  hrm_offer_sent:       { bg: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  hrm_onboard_update:   { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  hrm_review_created:   { bg: 'rgba(108,99,255,0.15)',   color: '#A78BFA' },
  hrm_review_submitted: { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  announcement:         { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  interview_scheduled:  { bg: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  sync_pending:         { bg: 'rgba(124,58,237,0.15)',   color: '#7C3AED' },
  subscription_expiry:  { bg: 'rgba(255,107,157,0.15)',  color: '#FF6B9D' },
  seat_limit_reached:   { bg: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  attendance_punch_in:  { bg: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  attendance_punch_out: { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  attendance_pending:   { bg: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  default:              { bg: 'rgba(139,143,168,0.15)',  color: '#8B8FA8' },
}

const formatTime = (iso) => {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)   return 'Just now'
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)    return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: getTenantTimezone() })
}

const Notifications = () => {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)
  const [unreadCount, setUnreadCount]     = useState(0)
  const [typeFilter, setTypeFilter]       = useState('')
  const [readFilter, setReadFilter]       = useState('')  // '' | 'false' | 'true'
  const [page, setPage]                   = useState(1)
  const [pagination, setPagination]       = useState({ total: 0, pages: 1 })

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: 20 }
      if (readFilter !== '') params.is_read = readFilter === 'true'
      if (typeFilter)        params.notification_type = typeFilter
      const response = await notificationService.getAll(params)
      setNotifications(response.items || [])
      setPagination({ total: response.total || 0, pages: response.pages || 1 })
      setUnreadCount(response.unread_count || 0)
    } catch {/* silent */}
    setLoading(false)
  }, [page, readFilter, typeFilter])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const handleMarkAsRead = async (id) => {
    try {
      await notificationService.markAsRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {/* silent */}
  }

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {/* silent */}
  }

  const handleDelete = async (id) => {
    try {
      await notificationService.delete(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch {/* silent */}
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'var(--bg-info)' }}>
            <Bell className="w-6 h-6" style={{ color: 'var(--text-info)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Notifications</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ color: 'var(--accent)', background: 'var(--bg-hover)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-active)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filters */}
      <div
        className="rounded-xl p-4 flex flex-wrap gap-3"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
      >
        <select
          value={readFilter}
          onChange={e => { setReadFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
        >
          <option value="">All Notifications</option>
          <option value="false">Unread Only</option>
          <option value="true">Read Only</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-body)' }}
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
            <option value="hrm_offer_sent">Offer Sent</option>
            <option value="hrm_onboard_update">Onboarding Update</option>
            <option value="announcement">Announcement</option>
            <option value="interview_scheduled">Interview Scheduled</option>
            <option value="attendance_punch_in">Punch In</option>
            <option value="attendance_punch_out">Punch Out</option>
          </optgroup>
          <optgroup label="System">
            <option value="task_assigned">Task Assigned</option>
            <option value="system_alert">System Alert</option>
            <option value="subscription_expiry">Subscription Expiry</option>
            <option value="seat_limit_reached">Seat Limit</option>
          </optgroup>
        </select>
      </div>

      {/* List */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
      >
        {loading ? (
          <div className="p-8 flex justify-center">
            <div
              className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No notifications</p>
          </div>
        ) : (
          <div>
            {notifications.map((n) => {
              const notifType = n.type || n.notification_type || 'default'
              const colorCfg  = TYPE_COLORS[notifType] || TYPE_COLORS.default
              const Icon      = TYPE_ICONS[notifType]  || Bell
              return (
                <div
                  key={n.id}
                  className="flex items-start gap-4 px-5 py-4 transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: n.is_read ? '' : colorCfg.bg,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.is_read ? '' : colorCfg.bg}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: colorCfg.bg }}
                  >
                    <Icon className="w-4 h-4" style={{ color: colorCfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: n.is_read ? 'var(--text-secondary)' : 'var(--text-heading)' }}>
                      {n.title || 'Notification'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {n.message || ''}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                        {formatTime(n.created_at)}
                      </span>
                      {n.action_url && (
                        <a
                          href={n.action_url}
                          className="text-xs font-medium"
                          style={{ color: 'var(--accent)' }}
                          onClick={e => { e.preventDefault(); window.location.href = n.action_url }}
                        >
                          View →
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkAsRead(n.id)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--text-disabled)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = colorCfg.color; e.currentTarget.style.background = colorCfg.bg }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-disabled)'; e.currentTarget.style.background = '' }}
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-disabled)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#FF4757'; e.currentTarget.style.background = 'rgba(255,71,87,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-disabled)'; e.currentTarget.style.background = '' }}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: colorCfg.color }} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Page {page} of {pagination.pages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg text-sm transition-colors disabled:opacity-40"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page === pagination.pages}
                className="px-3 py-1 rounded-lg text-sm transition-colors disabled:opacity-40"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
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
