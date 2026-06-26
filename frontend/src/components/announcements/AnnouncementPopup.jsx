/**
 * AnnouncementPopup
 * Modal shown after login for "popup" display_location announcements.
 * - Analytics: tracks view on mount, CTA on click, dismiss on close
 * - "Don't show again" permanently dismisses via API
 * - Multi-popup carousel with dot navigation
 * - Priority-based header colour
 * - Image support (image_path preferred over image_url)
 */
import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink, ChevronLeft, ChevronRight, Rocket, Wrench, AlertTriangle, Bell } from 'lucide-react'
import { tenantAnnouncementService } from '../../services/communicationService'

const PRIORITY_HEADERS = {
  critical: 'bg-red-600 text-white',
  high:     'bg-orange-500 text-white',
  medium:   'bg-indigo-600 text-white',
  low:      'bg-slate-700 text-white',
}

function TypeIcon({ type, size = 24 }) {
  if (type === 'release_notes')     return <Rocket size={size} />
  if (type === 'maintenance_alert') return <Wrench size={size} />
  if (type === 'popup')             return <Bell size={size} />
  return <Bell size={size} />
}

export default function AnnouncementPopup() {
  const [popups,          setPopups]          = useState([])
  const [index,           setIndex]           = useState(0)
  const [visible,         setVisible]         = useState(false)
  const [sessionDismissed, setSessionDismissed] = useState(() => new Set())
  const trackedRef = useRef(new Set())

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await tenantAnnouncementService.getActive('popup')
        if (!mounted) return
        const items = (res.data?.items || []).filter(
          i => i.announcement_type === 'popup' && !sessionDismissed.has(i.id)
        )
        if (items.length > 0) {
          setPopups(items)
          setIndex(0)
          setVisible(true)
        }
      } catch {}
    }
    load()
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track view when popup becomes visible for a new item
  const current = popups[index]
  useEffect(() => {
    if (!current) return
    if (trackedRef.current.has(current.id)) return
    trackedRef.current.add(current.id)
    tenantAnnouncementService.track(current.id, 'views').catch(() => {})
  }, [current])

  if (!visible || !current) return null

  const headerStyle = PRIORITY_HEADERS[current.priority] || PRIORITY_HEADERS.medium
  const imgSrc      = current.image_path || current.image_url || null

  const handleClose = (trackDismiss = true) => {
    if (trackDismiss) {
      tenantAnnouncementService.dismiss(current.id, false).catch(() => {})
    }
    setSessionDismissed(prev => new Set([...prev, current.id]))
    if (index < popups.length - 1) {
      setIndex(i => i + 1)
    } else {
      setVisible(false)
    }
  }

  const handleDontShowAgain = async () => {
    try { await tenantAnnouncementService.dismiss(current.id, true) } catch {}
    handleClose(false)
  }

  const handleCtaClick = () => {
    tenantAnnouncementService.track(current.id, 'cta_clicks').catch(() => {})
  }

  const prev = () => setIndex(i => (i - 1 + popups.length) % popups.length)
  const next = () => setIndex(i => (i + 1) % popups.length)

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      style={{ animation: 'fadein 0.2s ease' }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'popIn 0.25s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Coloured header */}
        <div className={`${headerStyle} px-5 py-4 relative`}>
          <div className="flex items-center gap-3">
            <div className="opacity-90">
              <TypeIcon type={current.announcement_type} size={22} />
            </div>
            <h2 className="text-base font-bold leading-tight flex-1 pr-2">{current.title}</h2>
            <button
              onClick={() => handleClose(true)}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
          {popups.length > 1 && (
            <p className="text-xs mt-1 opacity-70">Announcement {index + 1} of {popups.length}</p>
          )}
        </div>

        {/* Image */}
        {imgSrc && (
          <div className="h-44 overflow-hidden">
            <img
              src={imgSrc}
              alt={current.title}
              className="w-full h-full object-cover"
              onError={e => { e.target.parentElement.style.display = 'none' }}
            />
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4 max-h-60 overflow-y-auto">
          {current.rich_text ? (
            <div
              className="text-gray-700 text-sm prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: current.rich_text }}
            />
          ) : current.description ? (
            <p className="text-gray-600 text-sm leading-relaxed">{current.description}</p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 flex items-center gap-3 flex-wrap border-t border-gray-100 pt-3">
          {current.cta_button_text && current.cta_url && (
            <a
              href={current.cta_url}
              target={current.cta_target === 'same_tab' ? '_self' : '_blank'}
              rel="noopener noreferrer"
              onClick={handleCtaClick}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              {current.cta_button_text}
              <ExternalLink size={13} />
            </a>
          )}

          <button
            onClick={() => handleClose(true)}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Close
          </button>

          <button
            onClick={handleDontShowAgain}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            Don't show again
          </button>
        </div>

        {/* Pagination for multiple popups */}
        {popups.length > 1 && (
          <div className="flex items-center justify-center gap-2 pb-4">
            <button onClick={prev} className="p-1 text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} />
            </button>
            {popups.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`transition-all rounded-full ${
                  i === index ? 'bg-indigo-500 w-4 h-2' : 'bg-gray-300 w-2 h-2'
                }`}
              />
            ))}
            <button onClick={next} className="p-1 text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.93) translateY(8px) }
          to   { opacity: 1; transform: scale(1) translateY(0) }
        }
      `}</style>
    </div>
  )
}
