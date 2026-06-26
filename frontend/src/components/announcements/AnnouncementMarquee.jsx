/**
 * AnnouncementMarquee
 * Scrolling ticker displayed at the very top of the tenant layout.
 * Shows all active "marquee" and "maintenance_alert" type announcements.
 * Loops continuously. Hidden when no active marquee announcements exist.
 */
import { useState, useEffect, useRef } from 'react'
import { Megaphone, X } from 'lucide-react'
import { tenantAnnouncementService } from '../../services/communicationService'

const PRIORITY_STYLES = {
  critical: 'bg-red-600 text-white',
  high:     'bg-orange-500 text-white',
  medium:   'bg-primary-600 text-white',
  low:      'bg-surface-700 text-white',
}

const TYPE_ICONS = {
  marquee:           '📢',
  maintenance_alert: '🔧',
}

export default function AnnouncementMarquee() {
  const [items, setItems]       = useState([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const res = await tenantAnnouncementService.getActive('top_marquee')
        if (mounted) {
          const marqueeItems = (res.data?.items || []).filter(
            i => i.announcement_type === 'marquee' || i.announcement_type === 'maintenance_alert'
          )
          setItems(marqueeItems)
        }
      } catch {
        // Silently fail — non-critical UI
      }
    }

    load()
    const interval = setInterval(load, 5 * 60 * 1000) // refresh every 5 min
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  if (dismissed || items.length === 0) return null

  // Determine bar style based on highest-priority item
  const priorityOrder = ['critical', 'high', 'medium', 'low']
  const highestPriority = priorityOrder.find(p => items.some(i => i.priority === p)) || 'medium'
  const barStyle = PRIORITY_STYLES[highestPriority] || PRIORITY_STYLES.medium

  // Build ticker text: join all titles separated by  •
  const tickerText = items
    .map(i => `${TYPE_ICONS[i.announcement_type] || '📢'} ${i.title}${i.description ? ' — ' + i.description : ''}`)
    .join('   •   ')

  return (
    <div className={`relative flex items-center overflow-hidden ${barStyle} select-none`} style={{ height: '36px' }}>
      {/* Icon */}
      <div className="flex-shrink-0 flex items-center px-3 border-r border-white/20">
        <Megaphone className="w-4 h-4" />
      </div>

      {/* Scrolling text container */}
      <div className="flex-1 overflow-hidden">
        <div
          className="whitespace-nowrap inline-block text-sm font-medium animate-marquee"
          style={{
            animation: `marquee ${Math.max(20, tickerText.length * 0.12)}s linear infinite`,
          }}
        >
          {/* Duplicate for seamless loop */}
          {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 px-2 hover:bg-white/10 h-full flex items-center transition-colors"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Inline keyframe (avoids needing tailwind plugin) */}
      <style>{`
        @keyframes marquee {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  )
}
