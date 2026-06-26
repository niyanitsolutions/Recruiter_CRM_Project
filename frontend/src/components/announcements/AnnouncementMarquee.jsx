/**
 * AnnouncementMarquee
 * Scrolling ticker at the top of the tenant layout.
 * - Smooth CSS animation (no flicker from translateX tricks)
 * - Pause on hover via animationPlayState
 * - Track view on first show
 * - Refreshes every 5 minutes
 */
import { useState, useEffect, useRef } from 'react'
import { Megaphone, X, Wrench, AlertTriangle } from 'lucide-react'
import { tenantAnnouncementService } from '../../services/communicationService'

const PRIORITY_BARS = {
  critical: 'bg-red-600 text-white',
  high:     'bg-orange-500 text-white',
  medium:   'bg-indigo-600 text-white',
  low:      'bg-slate-600 text-white',
}

function ItemIcon({ type }) {
  if (type === 'maintenance_alert') return <Wrench size={13} className="flex-shrink-0" />
  if (type === 'release_notes')     return <span className="text-xs">🚀</span>
  return <Megaphone size={13} className="flex-shrink-0" />
}

export default function AnnouncementMarquee() {
  const [items,     setItems]     = useState([])
  const [dismissed, setDismissed] = useState(false)
  const [paused,    setPaused]    = useState(false)
  const trackedRef  = useRef(new Set())
  const wrapperRef  = useRef(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const res = await tenantAnnouncementService.getActive('top_marquee')
        if (!mounted) return
        const marqueeItems = (res.data?.items || []).filter(
          i => i.announcement_type === 'marquee' || i.announcement_type === 'maintenance_alert'
        )
        setItems(marqueeItems)

        // Track view for new items
        marqueeItems.forEach(item => {
          if (!trackedRef.current.has(item.id)) {
            trackedRef.current.add(item.id)
            tenantAnnouncementService.track(item.id, 'views').catch(() => {})
          }
        })
      } catch {}
    }

    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  if (dismissed || items.length === 0) return null

  const priorityOrder = ['critical', 'high', 'medium', 'low']
  const highestPriority = priorityOrder.find(p => items.some(i => i.priority === p)) || 'medium'
  const barStyle = PRIORITY_BARS[highestPriority]

  // Build ticker segments
  const segments = items.map(i => ({
    id:    i.id,
    type:  i.announcement_type,
    text:  i.title + (i.description ? ' — ' + i.description : ''),
  }))

  // Duration scales with content length: ~80px/s
  const totalLen = segments.reduce((s, seg) => s + seg.text.length, 0) + segments.length * 8
  const duration  = Math.max(18, totalLen * 0.09)

  return (
    <div
      className={`relative flex items-center overflow-hidden ${barStyle} select-none`}
      style={{ height: '36px' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Label */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 border-r border-white/20 h-full text-xs font-bold tracking-wide uppercase">
        <Megaphone size={13} />
        <span className="hidden sm:inline">Live</span>
      </div>

      {/* Scrolling ticker */}
      <div className="flex-1 overflow-hidden h-full flex items-center" ref={wrapperRef}>
        <div
          className="whitespace-nowrap text-sm font-medium flex items-center gap-0"
          style={{
            animation:          `marquee-scroll ${duration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
            willChange:         'transform',
          }}
        >
          {/* Render segments twice for seamless loop */}
          {[0, 1].map(pass => (
            <span key={pass} className="inline-flex items-center">
              {segments.map((seg, idx) => (
                <span key={`${pass}-${seg.id}`} className="inline-flex items-center gap-1.5 px-4">
                  <ItemIcon type={seg.type} />
                  <span>{seg.text}</span>
                  {(idx < segments.length - 1 || pass === 0) && (
                    <span className="opacity-40 mx-2">•</span>
                  )}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* Pause indicator */}
      {paused && (
        <div className="flex-shrink-0 px-2 text-xs opacity-70">⏸</div>
      )}

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 px-2 hover:bg-white/15 h-full flex items-center transition-colors"
        title="Dismiss ticker"
      >
        <X size={14} />
      </button>

      <style>{`
        @keyframes marquee-scroll {
          0%   { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
