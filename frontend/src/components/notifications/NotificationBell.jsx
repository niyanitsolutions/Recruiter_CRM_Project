import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Check, CheckCheck, X,
  UserPlus, DollarSign, FileText,
  Clock, AlertCircle, Calendar
} from 'lucide-react'
import { notificationService } from '../../services'

const TYPE_ICONS = {
  offer_released:    UserPlus,
  offer_accepted:    Check,
  candidate_joined:  UserPlus,
  payout_eligible:   DollarSign,
  invoice_raised:    FileText,
  invoice_approved:  Check,
  invoice_rejected:  AlertCircle,
  payment_processed: DollarSign,
  day_10_reminder:   Clock,
  day_30_reminder:   Clock,
  interview_scheduled: Calendar,
  task_assigned:     FileText,
  system_alert:      AlertCircle,
}

const TYPE_COLORS = {
  offer_released:    { bg: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  offer_accepted:    { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  candidate_joined:  { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  payout_eligible:   { bg: 'rgba(108,99,255,0.15)',  color: '#A78BFA' },
  invoice_raised:    { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  invoice_approved:  { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  invoice_rejected:  { bg: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  payment_processed: { bg: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  day_10_reminder:   { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  day_30_reminder:   { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  interview_scheduled: { bg: 'rgba(79,172,254,0.15)', color: '#4FACFE' },
  task_assigned:     { bg: 'rgba(56,249,215,0.15)',  color: '#38F9D7' },
  system_alert:      { bg: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  default:           { bg: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
}

const formatRelative = (iso) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const POLL_INTERVAL = 30_000 // 30 seconds

const NotificationBell = () => {
  const navigate   = useNavigate()
  const dropRef    = useRef(null)
  const pollRef    = useRef(null)

  const [open,       setOpen]       = useState(false)
  const [items,      setItems]      = useState([])
  const [unread,     setUnread]     = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  // ── Fetch unread count (lightweight, runs on poll) ─────────────────────────
  const refreshCount = useCallback(async () => {
    try {
      const data = await notificationService.getUnreadCount()
      setUnread(data.count ?? data.unread_count ?? 0)
    } catch {/* silent */}
  }, [])

  // ── Fetch full list (runs when dropdown opens) ─────────────────────────────
  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await notificationService.getAll({ page: 1, page_size: 15 })
      const list = data.items || data.notifications || []
      setItems(list)
      setUnread(list.filter(n => !n.is_read).length)
    } catch {/* silent */}
    finally { setLoading(false) }
  }, [])

  // ── Poll for unread count every 30 s ──────────────────────────────────────
  useEffect(() => {
    refreshCount()
    pollRef.current = setInterval(refreshCount, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [refreshCount])

  // ── Load items when dropdown opens ────────────────────────────────────────
  useEffect(() => {
    if (open) loadItems()
  }, [open, loadItems])

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markOne = async (id) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(c => Math.max(0, c - 1))
    try { await notificationService.markAsRead(id) } catch {/* silent */}
  }

  const markAll = async () => {
    setMarkingAll(true)
    try {
      await notificationService.markAllAsRead()
      setItems(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnread(0)
    } catch {/* silent */}
    finally { setMarkingAll(false) }
  }

  return (
    <div className="relative" ref={dropRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg transition-all duration-200"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
        aria-label={`Notifications${unread ? ` — ${unread} unread` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full
              text-[10px] font-bold flex items-center justify-center text-white"
            style={{ background: '#FF4757' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[380px] rounded-2xl
            shadow-2xl overflow-hidden z-50 animate-slide-up"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>
                Notifications
              </h3>
              {unread > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(255,71,87,0.15)', color: '#FF4757' }}
                >
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAll}
                  disabled={markingAll}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                    transition-colors disabled:opacity-50"
                  style={{ color: 'var(--accent)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-disabled)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[400px]">
            {loading ? (
              <div className="p-8 text-center">
                <div
                  className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full mx-auto"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                />
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No notifications yet</p>
              </div>
            ) : (
              items.map(n => {
                const colorCfg = TYPE_COLORS[n.notification_type || n.type] || TYPE_COLORS.default
                const Icon     = TYPE_ICONS[n.notification_type || n.type] || Bell
                return (
                  <div
                    key={n.id}
                    className="flex gap-3 px-4 py-3 cursor-pointer transition-colors"
                    style={{
                      background:   n.is_read ? '' : colorCfg.bg,
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = n.is_read ? '' : colorCfg.bg}
                    onClick={() => !n.is_read && markOne(n.id)}
                  >
                    {/* Icon dot */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: colorCfg.bg }}
                    >
                      <Icon className="w-4 h-4" style={{ color: colorCfg.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {n.title || n.subject || 'Notification'}
                      </p>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {n.message || n.body || ''}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
                        {formatRelative(n.created_at)}
                      </p>
                    </div>

                    {!n.is_read && (
                      <button
                        onClick={e => { e.stopPropagation(); markOne(n.id) }}
                        className="mt-1 p-1 rounded flex-shrink-0 transition-colors"
                        style={{ color: 'var(--text-disabled)' }}
                        onMouseEnter={e => e.currentTarget.style.color = colorCfg.color}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-disabled)'}
                        title="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div
            className="px-4 py-2.5"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <button
              className="text-sm font-medium w-full text-center transition-colors"
              style={{ color: 'var(--accent)' }}
              onClick={() => { setOpen(false); navigate('/notifications') }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
