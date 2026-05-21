/**
 * AnnouncementPopup — shows unread announcement notifications as a popup.
 * Checks once on mount for any unread announcements.
 * "Mark as Read" → marks the notification read and closes.
 * "Remind Me Later" → closes for this browser session (notification stays unread).
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Megaphone, X, Check, Clock } from 'lucide-react'
import { notificationService } from '../../services'

const SESSION_KEY = 'announcement_reminded_ids'

function getReminderIds() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function addReminderId(id) {
  const ids = getReminderIds()
  ids.add(id)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]))
}

export default function AnnouncementPopup() {
  const [notification, setNotification] = useState(null)
  const [visible, setVisible]           = useState(false)
  const [marking, setMarking]           = useState(false)

  const fetchLatest = useCallback(async () => {
    try {
      const data = await notificationService.getAll({
        page: 1, page_size: 10, is_read: false,
      })
      const list = data.items || data.notifications || []
      const reminded = getReminderIds()
      const ann = list.find(n =>
        (n.type === 'announcement' || n.notification_type === 'announcement') &&
        !reminded.has(n.id)
      )
      if (ann) {
        setNotification(ann)
        setVisible(true)
      }
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    // Small delay so the page finishes loading before showing the popup
    const t = setTimeout(fetchLatest, 1500)
    return () => clearTimeout(t)
  }, [fetchLatest])

  const handleMarkRead = async () => {
    if (!notification) return
    setMarking(true)
    try {
      await notificationService.markAsRead(notification.id)
    } catch {/* silent */}
    setVisible(false)
    setNotification(null)
    setMarking(false)
  }

  const handleRemindLater = () => {
    if (notification) addReminderId(notification.id)
    setVisible(false)
  }

  if (!visible || !notification) return null

  const title = notification.title?.replace(/^📢\s*/, '') || 'Announcement'
  const body  = notification.message || ''
  const isHigh = notification.priority === 'high' || notification.priority === 'medium'

  return (
    <div
      className="fixed bottom-6 right-6 z-[9998] w-[360px] rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
      style={{ background: 'var(--bg-card)', border: `1px solid ${isHigh ? 'rgba(245,158,11,0.40)' : 'var(--border-card)'}` }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          background: 'rgba(245,158,11,0.08)',
          borderBottom: '1px solid rgba(245,158,11,0.15)',
        }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
          <Megaphone className="w-4 h-4" style={{ color: '#F59E0B' }} />
        </div>
        <span className="flex-1 text-xs font-bold uppercase tracking-widest" style={{ color: '#F59E0B' }}>
          New Announcement
        </span>
        <button
          onClick={handleRemindLater}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-disabled)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-muted)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-disabled)'}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-heading)' }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {body.replace(/^[^:]+:\s*/, '')}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-4">
        <button
          onClick={handleMarkRead}
          disabled={marking}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.20)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
        >
          <Check className="w-3.5 h-3.5" />
          Mark as Read
        </button>
        <button
          onClick={handleRemindLater}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-active)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        >
          <Clock className="w-3.5 h-3.5" />
          Remind Me Later
        </button>
      </div>
    </div>
  )
}
