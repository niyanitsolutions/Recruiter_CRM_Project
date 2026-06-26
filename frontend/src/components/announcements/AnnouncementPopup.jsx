/**
 * AnnouncementPopup
 * Modal shown immediately after login for "popup" type announcements.
 * Supports "Don't show again" which permanently dismisses via API.
 * Session dismissals are tracked locally.
 */
import { useState, useEffect } from 'react'
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { tenantAnnouncementService } from '../../services/communicationService'

const PRIORITY_HEADERS = {
  critical: 'bg-red-600 text-white',
  high:     'bg-orange-500 text-white',
  medium:   'bg-primary-600 text-white',
  low:      'bg-surface-700 text-white',
}

const TYPE_ICONS = {
  popup:  '🎉',
  marquee: '📢',
  dashboard_banner: '📌',
  release_notes: '🚀',
  maintenance_alert: '🔧',
}

export default function AnnouncementPopup() {
  const [popups, setPopups]     = useState([])
  const [index, setIndex]       = useState(0)
  const [visible, setVisible]   = useState(false)
  // session-dismissed set (no API call, just local)
  const [sessionDismissed, setSessionDismissed] = useState(() => new Set())

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const res = await tenantAnnouncementService.getActive('popup')
        if (!mounted) return
        const items = (res.data?.items || []).filter(i =>
          i.announcement_type === 'popup' && !sessionDismissed.has(i.id)
        )
        if (items.length > 0) {
          setPopups(items)
          setIndex(0)
          setVisible(true)
        }
      } catch {
        // Non-critical
      }
    }

    load()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = popups[index]

  if (!visible || !current) return null

  const headerStyle = PRIORITY_HEADERS[current.priority] || PRIORITY_HEADERS.medium

  const handleClose = () => {
    setSessionDismissed(prev => new Set([...prev, current.id]))
    if (index < popups.length - 1) {
      setIndex(i => i + 1)
    } else {
      setVisible(false)
    }
  }

  const handleDontShowAgain = async () => {
    try {
      await tenantAnnouncementService.dismiss(current.id, true)
    } catch { /* silent */ }
    handleClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Coloured header bar */}
        <div className={`${headerStyle} p-4 relative`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{TYPE_ICONS[current.announcement_type] || '📢'}</span>
            <h2 className="text-lg font-bold leading-tight flex-1">{current.title}</h2>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {popups.length > 1 && (
            <p className="text-xs mt-1 opacity-75">{index + 1} of {popups.length}</p>
          )}
        </div>

        {/* Image */}
        {current.image_url && (
          <div className="relative h-40 overflow-hidden">
            <img
              src={current.image_url}
              alt={current.title}
              className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none' }}
            />
          </div>
        )}

        {/* Body */}
        <div className="p-5">
          {current.rich_text ? (
            <div
              className="text-surface-700 text-sm prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: current.rich_text }}
            />
          ) : current.description ? (
            <p className="text-surface-700 text-sm leading-relaxed">{current.description}</p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex items-center gap-3 flex-wrap">
          {current.cta_button_text && current.cta_url && (
            <a
              href={current.cta_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
            >
              {current.cta_button_text}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-surface-600 border border-surface-200 rounded-xl hover:bg-surface-50 transition-colors"
          >
            Close
          </button>

          <button
            onClick={handleDontShowAgain}
            className="ml-auto text-xs text-surface-400 hover:text-surface-600 underline underline-offset-2 transition-colors"
          >
            Don't show again
          </button>
        </div>

        {/* Pagination dots for multiple popups */}
        {popups.length > 1 && (
          <div className="flex items-center justify-center gap-1 pb-4">
            {popups.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === index ? 'bg-primary-500' : 'bg-surface-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
