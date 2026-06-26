/**
 * LoginAnnouncement — displays active login-screen announcements before auth.
 * Fetches from public endpoint (no JWT required).
 * Shows: maintenance_alert as a full-width warning + popup for other types.
 */
import { useState, useEffect } from 'react'
import { AlertTriangle, X, Info, Megaphone, ExternalLink, Wrench, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../../services/api'

const PRIORITY_STYLES = {
  critical: {
    bar:   'bg-red-600 text-white',
    popup: 'border-red-300 bg-red-50',
    badge: 'bg-red-100 text-red-800',
    icon:  'text-red-600',
  },
  high: {
    bar:   'bg-orange-500 text-white',
    popup: 'border-orange-300 bg-orange-50',
    badge: 'bg-orange-100 text-orange-800',
    icon:  'text-orange-600',
  },
  medium: {
    bar:   'bg-blue-600 text-white',
    popup: 'border-blue-200 bg-blue-50',
    badge: 'bg-blue-100 text-blue-800',
    icon:  'text-blue-600',
  },
  low: {
    bar:   'bg-gray-600 text-white',
    popup: 'border-gray-200 bg-gray-50',
    badge: 'bg-gray-100 text-gray-700',
    icon:  'text-gray-600',
  },
}

function PriorityIcon({ priority, type, size = 16 }) {
  const cls = PRIORITY_STYLES[priority]?.icon || 'text-gray-500'
  if (type === 'maintenance_alert') return <Wrench size={size} className={cls} />
  if (priority === 'critical' || priority === 'high') return <AlertTriangle size={size} className={cls} />
  return <Info size={size} className={cls} />
}

// ── Top Banner (maintenance_alert or critical priority) ───────────────────────

function LoginBanner({ item, onDismiss }) {
  const styles = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium

  return (
    <div className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm ${styles.bar}`}>
      <PriorityIcon priority={item.priority} type={item.announcement_type} size={15} />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">{item.title}</span>
        {item.description && (
          <span className="ml-2 opacity-90 text-xs">{item.description}</span>
        )}
      </div>
      {item.cta_button_text && item.cta_url && (
        <a
          href={item.cta_url}
          target={item.cta_target === 'same_tab' ? '_self' : '_blank'}
          rel="noopener noreferrer"
          className="flex-shrink-0 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
        >
          {item.cta_button_text}
          <ExternalLink size={11} />
        </a>
      )}
      <button onClick={() => onDismiss(item.id)} className="flex-shrink-0 p-1 hover:opacity-70 transition-opacity">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Popup cards (carousel for multiple) ───────────────────────────────────────

function LoginPopupCard({ item, index, total, onDismiss, onPrev, onNext }) {
  const styles = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium
  const hasImage = item.image_path || item.image_url

  return (
    <div
      className={`w-full rounded-xl border shadow-lg overflow-hidden ${styles.popup}`}
      style={{ animation: 'slideDown 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
    >
      {/* Image */}
      {hasImage && (
        <img
          src={item.image_path || item.image_url}
          alt=""
          className="w-full h-32 object-cover"
        />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <PriorityIcon priority={item.priority} type={item.announcement_type} />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles.badge}`}>
              {item.priority}
            </span>
          </div>
          <button onClick={() => onDismiss(item.id)} className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <h3 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h3>

        {item.rich_text ? (
          <div
            className="text-xs text-gray-600 prose prose-xs max-w-none line-clamp-3"
            dangerouslySetInnerHTML={{ __html: item.rich_text }}
          />
        ) : item.description ? (
          <p className="text-xs text-gray-600 line-clamp-3">{item.description}</p>
        ) : null}

        {item.cta_button_text && item.cta_url && (
          <a
            href={item.cta_url}
            target={item.cta_target === 'same_tab' ? '_self' : '_blank'}
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {item.cta_button_text}
            <ExternalLink size={11} />
          </a>
        )}
      </div>

      {/* Carousel nav */}
      {total > 1 && (
        <div className="px-4 pb-3 flex items-center justify-between border-t border-black/10 pt-2">
          <button onClick={onPrev} className="p-1 hover:bg-black/10 rounded transition-colors">
            <ChevronLeft size={14} className="text-gray-600" />
          </button>
          <div className="flex gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === index ? 'bg-indigo-500 w-3' : 'bg-gray-300'}`}
              />
            ))}
          </div>
          <button onClick={onNext} className="p-1 hover:bg-black/10 rounded transition-colors">
            <ChevronRight size={14} className="text-gray-600" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LoginAnnouncement() {
  const [items,     setItems]     = useState([])
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('login_ann_dismissed') || '[]') } catch { return [] }
  })
  const [popupIdx, setPopupIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.get('/announcements/public')
      .then(res => { if (!cancelled) setItems(res.data?.items || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const dismiss = (id) => {
    const next = [...dismissed, id]
    setDismissed(next)
    try { sessionStorage.setItem('login_ann_dismissed', JSON.stringify(next)) } catch {}
  }

  const visible = items.filter(i => !dismissed.includes(i.id))
  if (!visible.length) return null

  // Banners: maintenance + critical priority
  const banners = visible.filter(i =>
    i.announcement_type === 'maintenance_alert' || i.priority === 'critical'
  )
  // Popup cards: everything else
  const popups  = visible.filter(i =>
    i.announcement_type !== 'maintenance_alert' && i.priority !== 'critical'
  )

  const popupVisible = popups.filter(i => !dismissed.includes(i.id))
  const safeIdx = Math.min(popupIdx, popupVisible.length - 1)
  const currentPopup = popupVisible[Math.max(0, safeIdx)]

  return (
    <>
      {/* Top banners */}
      {banners.map(item => (
        <LoginBanner key={item.id} item={item} onDismiss={dismiss} />
      ))}

      {/* Popup card */}
      {currentPopup && (
        <div className="mb-4">
          <LoginPopupCard
            item={currentPopup}
            index={safeIdx}
            total={popupVisible.length}
            onDismiss={dismiss}
            onPrev={() => setPopupIdx(i => (i - 1 + popupVisible.length) % popupVisible.length)}
            onNext={() => setPopupIdx(i => (i + 1) % popupVisible.length)}
          />
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px) }
          to   { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </>
  )
}
