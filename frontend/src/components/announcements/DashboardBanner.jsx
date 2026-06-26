/**
 * DashboardBanner
 * Type-specific banner renderers for tenant dashboard.
 *
 * Renders per type:
 *  - dashboard_banner  → standard full-width alert banner
 *  - release_notes     → timeline/card style with version tag
 *  - maintenance_alert → yellow warning with countdown if end_date set
 */
import { useState, useEffect, useRef } from 'react'
import {
  X, ExternalLink, Info, Rocket, Wrench, AlertTriangle,
  Megaphone, Clock, CheckCircle2, Zap,
} from 'lucide-react'
import { tenantAnnouncementService } from '../../services/communicationService'

const PRIORITY_STYLES = {
  critical: {
    wrapper: 'bg-red-50 border-red-300',
    icon:    'text-red-500',
    badge:   'bg-red-100 text-red-800 border-red-200',
    title:   'text-red-900',
    body:    'text-red-700',
    cta:     'bg-red-600 hover:bg-red-700 text-white',
    dismiss: 'text-red-400 hover:text-red-600 hover:bg-red-100',
  },
  high: {
    wrapper: 'bg-orange-50 border-orange-300',
    icon:    'text-orange-500',
    badge:   'bg-orange-100 text-orange-800 border-orange-200',
    title:   'text-orange-900',
    body:    'text-orange-700',
    cta:     'bg-orange-600 hover:bg-orange-700 text-white',
    dismiss: 'text-orange-400 hover:text-orange-600 hover:bg-orange-100',
  },
  medium: {
    wrapper: 'bg-blue-50 border-blue-200',
    icon:    'text-blue-500',
    badge:   'bg-blue-100 text-blue-800 border-blue-200',
    title:   'text-blue-900',
    body:    'text-blue-700',
    cta:     'bg-blue-600 hover:bg-blue-700 text-white',
    dismiss: 'text-blue-400 hover:text-blue-600 hover:bg-blue-100',
  },
  low: {
    wrapper: 'bg-gray-50 border-gray-200',
    icon:    'text-gray-400',
    badge:   'bg-gray-100 text-gray-700 border-gray-200',
    title:   'text-gray-800',
    body:    'text-gray-600',
    cta:     'bg-gray-700 hover:bg-gray-800 text-white',
    dismiss: 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
  },
}

function useCountdown(endDate) {
  const [time, setTime] = useState('')
  useEffect(() => {
    if (!endDate) return
    const tick = () => {
      const diff = new Date(endDate) - Date.now()
      if (diff <= 0) { setTime('Expired'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTime(`${h}h ${m}m ${s}s remaining`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endDate])
  return time
}

// ── Dashboard Banner (standard) ───────────────────────────────────────────────

function StandardBanner({ item, onDismiss }) {
  const s    = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium
  const Icon = item.announcement_type === 'marquee' ? Megaphone
             : item.priority === 'critical' ? AlertTriangle
             : Info

  return (
    <div className={`relative rounded-xl border px-4 py-3.5 ${s.wrapper} flex items-start gap-3`}>
      <div className={`flex-shrink-0 mt-0.5 ${s.icon}`}><Icon size={18} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className={`font-semibold text-sm ${s.title}`}>{item.title}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s.badge}`}>{item.priority}</span>
        </div>
        {item.description && <p className={`text-sm ${s.body}`}>{item.description}</p>}
        {item.rich_text && (
          <div
            className={`text-sm mt-1 prose prose-sm max-w-none ${s.body}`}
            dangerouslySetInnerHTML={{ __html: item.rich_text }}
          />
        )}
        {item.cta_button_text && item.cta_url && (
          <a
            href={item.cta_url}
            target={item.cta_target === 'same_tab' ? '_self' : '_blank'}
            rel="noopener noreferrer"
            onClick={() => tenantAnnouncementService.track(item.id, 'cta_clicks').catch(() => {})}
            className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${s.cta}`}
          >
            {item.cta_button_text} <ExternalLink size={11} />
          </a>
        )}
      </div>
      <button onClick={() => onDismiss(item.id)} className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${s.dismiss}`} title="Dismiss">
        <X size={15} />
      </button>
    </div>
  )
}

// ── Release Notes (timeline style) ───────────────────────────────────────────

function ReleaseNotesBanner({ item, onDismiss }) {
  const imgSrc = item.image_path || item.image_url || null

  return (
    <div className="relative bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 rounded-2xl overflow-hidden">
      {/* Accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-purple-500" />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Rocket size={18} className="text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-indigo-900 text-sm">{item.title}</p>
                <span className="text-xs px-2 py-0.5 bg-indigo-600 text-white rounded-full font-semibold">
                  New
                </span>
              </div>
              {item.description && (
                <p className="text-xs text-indigo-600 mt-0.5">{item.description}</p>
              )}
            </div>
          </div>
          <button onClick={() => onDismiss(item.id)} className="p-1.5 text-indigo-300 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {item.rich_text && (
          <div
            className="mt-3 text-sm text-indigo-800 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: item.rich_text }}
          />
        )}

        {imgSrc && (
          <img src={imgSrc} alt="" className="mt-3 w-full max-h-40 object-cover rounded-xl" />
        )}

        {item.cta_button_text && item.cta_url && (
          <div className="mt-3">
            <a
              href={item.cta_url}
              target={item.cta_target === 'same_tab' ? '_self' : '_blank'}
              rel="noopener noreferrer"
              onClick={() => tenantAnnouncementService.track(item.id, 'cta_clicks').catch(() => {})}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              {item.cta_button_text} <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Maintenance Alert (warning style with countdown) ─────────────────────────

function MaintenanceBanner({ item, onDismiss }) {
  const countdown = useCountdown(item.never_expire ? null : item.end_date)

  return (
    <div className="relative bg-amber-50 border-2 border-amber-400 rounded-2xl overflow-hidden">
      {/* Striped top accent */}
      <div
        className="h-1.5 w-full"
        style={{
          background: 'repeating-linear-gradient(45deg, #f59e0b, #f59e0b 8px, #fbbf24 8px, #fbbf24 16px)',
        }}
      />

      <div className="px-4 py-3.5 flex items-start gap-3">
        <div className="flex-shrink-0 p-2 bg-amber-100 rounded-xl mt-0.5">
          <Wrench size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="font-bold text-amber-900 text-sm">{item.title}</p>
            <span className="text-xs px-2 py-0.5 bg-amber-500 text-white rounded-full font-semibold flex items-center gap-1">
              <AlertTriangle size={10} /> Maintenance
            </span>
          </div>

          {item.description && (
            <p className="text-sm text-amber-800">{item.description}</p>
          )}

          {item.rich_text && (
            <div
              className="text-sm text-amber-800 mt-1 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: item.rich_text }}
            />
          )}

          {countdown && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium border border-amber-300">
              <Clock size={12} />
              {countdown}
            </div>
          )}

          {item.cta_button_text && item.cta_url && (
            <div className="mt-2">
              <a
                href={item.cta_url}
                target={item.cta_target === 'same_tab' ? '_self' : '_blank'}
                rel="noopener noreferrer"
                onClick={() => tenantAnnouncementService.track(item.id, 'cta_clicks').catch(() => {})}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors"
              >
                {item.cta_button_text} <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>

        <button onClick={() => onDismiss(item.id)} className="flex-shrink-0 p-1.5 text-amber-400 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

function BannerRouter({ item, onDismiss }) {
  if (item.announcement_type === 'release_notes')
    return <ReleaseNotesBanner item={item} onDismiss={onDismiss} />
  if (item.announcement_type === 'maintenance_alert')
    return <MaintenanceBanner item={item} onDismiss={onDismiss} />
  return <StandardBanner item={item} onDismiss={onDismiss} />
}

export default function DashboardBanner() {
  const [banners,   setBanners]   = useState([])
  const [dismissed, setDismissed] = useState(new Set())
  const trackedRef  = useRef(new Set())

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await tenantAnnouncementService.getActive('dashboard')
        if (!mounted) return
        const items = (res.data?.items || []).filter(i =>
          ['dashboard_banner', 'release_notes', 'maintenance_alert'].includes(i.announcement_type)
        )
        setBanners(items)
        // Track views for new items
        items.forEach(i => {
          if (!trackedRef.current.has(i.id)) {
            trackedRef.current.add(i.id)
            tenantAnnouncementService.track(i.id, 'views').catch(() => {})
          }
        })
      } catch {}
    }
    load()
    return () => { mounted = false }
  }, [])

  const handleDismiss = (id) => setDismissed(prev => new Set([...prev, id]))

  const visible = banners.filter(b => !dismissed.has(b.id))
  if (!visible.length) return null

  return (
    <div className="space-y-3 mb-4">
      {visible.map(banner => (
        <BannerRouter key={banner.id} item={banner} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}
