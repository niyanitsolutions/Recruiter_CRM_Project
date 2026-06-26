/**
 * DashboardBanner
 * Renders active "dashboard_banner" and "release_notes" announcements
 * as dismissible banners inside the tenant dashboard.
 * Each banner can be dismissed for the session.
 */
import { useState, useEffect } from 'react'
import { X, ExternalLink, Info, Rocket, Wrench, AlertTriangle, Megaphone } from 'lucide-react'
import { tenantAnnouncementService } from '../../services/communicationService'

const BANNER_STYLES = {
  critical: {
    wrapper: 'bg-red-50 border-red-300',
    icon:    'text-red-500',
    title:   'text-red-900',
    body:    'text-red-700',
    cta:     'bg-red-600 hover:bg-red-700 text-white',
    dismiss: 'text-red-400 hover:text-red-600 hover:bg-red-100',
  },
  high: {
    wrapper: 'bg-orange-50 border-orange-300',
    icon:    'text-orange-500',
    title:   'text-orange-900',
    body:    'text-orange-700',
    cta:     'bg-orange-600 hover:bg-orange-700 text-white',
    dismiss: 'text-orange-400 hover:text-orange-600 hover:bg-orange-100',
  },
  medium: {
    wrapper: 'bg-blue-50 border-blue-200',
    icon:    'text-blue-500',
    title:   'text-blue-900',
    body:    'text-blue-700',
    cta:     'bg-blue-600 hover:bg-blue-700 text-white',
    dismiss: 'text-blue-400 hover:text-blue-600 hover:bg-blue-100',
  },
  low: {
    wrapper: 'bg-surface-50 border-surface-200',
    icon:    'text-surface-400',
    title:   'text-surface-800',
    body:    'text-surface-600',
    cta:     'bg-surface-700 hover:bg-surface-800 text-white',
    dismiss: 'text-surface-400 hover:text-surface-600 hover:bg-surface-100',
  },
}

const TYPE_ICONS = {
  dashboard_banner:  Info,
  release_notes:     Rocket,
  maintenance_alert: Wrench,
  marquee:           Megaphone,
  popup:             AlertTriangle,
}

function SingleBanner({ item, onDismiss }) {
  const s = BANNER_STYLES[item.priority] || BANNER_STYLES.medium
  const Icon = TYPE_ICONS[item.announcement_type] || Info

  return (
    <div className={`relative rounded-xl border p-4 ${s.wrapper} flex items-start gap-3`}>
      <div className={`flex-shrink-0 mt-0.5 ${s.icon}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${s.title}`}>{item.title}</p>
        {item.description && (
          <p className={`text-sm mt-0.5 ${s.body}`}>{item.description}</p>
        )}
        {item.rich_text && (
          <div
            className={`text-sm mt-1 prose prose-sm max-w-none ${s.body}`}
            dangerouslySetInnerHTML={{ __html: item.rich_text }}
          />
        )}
        {item.cta_button_text && item.cta_url && (
          <a
            href={item.cta_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${s.cta}`}
          >
            {item.cta_button_text}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <button
        onClick={() => onDismiss(item.id)}
        className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${s.dismiss}`}
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function DashboardBanner() {
  const [banners, setBanners]     = useState([])
  const [dismissed, setDismissed] = useState(new Set())

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
      } catch { /* silent */ }
    }

    load()
    return () => { mounted = false }
  }, [])

  const handleDismiss = (id) => {
    setDismissed(prev => new Set([...prev, id]))
    // Session-only dismiss — no API call (user can reload to see again)
    // For permanent dismiss they use the popup's "Don't show again"
  }

  const visible = banners.filter(b => !dismissed.has(b.id))
  if (visible.length === 0) return null

  return (
    <div className="space-y-3 mb-4">
      {visible.map(banner => (
        <SingleBanner key={banner.id} item={banner} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}
