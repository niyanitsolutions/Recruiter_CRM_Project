/**
 * PunchInModal — shown once per day when the user hasn't punched in yet.
 *
 * Work mode is determined automatically from the employee's active approved
 * work-mode request. The user cannot select or change it manually.
 *
 * Falls back to "office" when no approved request exists for today.
 *
 * Geo-location is still captured and sent to the backend for geo-fence
 * validation (the backend enforces geo-fence rules server-side).
 */
import React, { useState, useEffect } from 'react'
import {
  Clock, MapPin, Loader2, Wifi, Home, Building2, X, Briefcase,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../common/ModalPortal'

const MODE_META = {
  office: { label: 'In Office',       icon: Building2, colorClass: 'text-blue-600'   },
  wfh:    { label: 'Work From Home',  icon: Home,      colorClass: 'text-green-600'  },
  hybrid: { label: 'Hybrid',          icon: Wifi,      colorClass: 'text-purple-600' },
  field:  { label: 'Field Work',      icon: Briefcase, colorClass: 'text-orange-600' },
}

export default function PunchInModal({ isOpen, onClose, onDismiss, onPunchedIn }) {
  const [determinedMode, setDeterminedMode] = useState('office')
  const [modeLoading,    setModeLoading]    = useState(false)
  const [geo,            setGeo]            = useState(null)
  const [geoLoading,     setGeoLoading]     = useState(false)
  const [loading,        setLoading]        = useState(false)

  useEffect(() => {
    if (!isOpen) return

    // Fetch the system-determined work mode for today
    setModeLoading(true)
    hrmService.getMyActiveWorkMode()
      .then(res => {
        const active = res?.data?.active
        if (active && active.work_mode) {
          setDeterminedMode(active.work_mode)
        } else {
          setDeterminedMode('office')
        }
      })
      .catch(() => setDeterminedMode('office'))
      .finally(() => setModeLoading(false))

    // Auto-request geo for backend geo-fence validation
    if (navigator.geolocation) {
      setGeoLoading(true)
      navigator.geolocation.getCurrentPosition(
        pos => {
          setGeo({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy })
          setGeoLoading(false)
        },
        () => setGeoLoading(false),
        { timeout: 8000, enableHighAccuracy: false },
      )
    }
  }, [isOpen])

  const handlePunchIn = async () => {
    setLoading(true)
    try {
      const res = await hrmService.checkIn({
        work_mode: determinedMode,
        latitude:  geo?.latitude  ?? null,
        longitude: geo?.longitude ?? null,
      })
      toast.success('Punched in! Have a productive day.')
      onPunchedIn(res?.data ?? null)
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to punch in'
      toast.error(typeof msg === 'string' ? msg : 'Failed to punch in')
    }
    setLoading(false)
  }

  const modeMeta = MODE_META[determinedMode] || MODE_META.office
  const ModeIcon = modeMeta.icon

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
        <div className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
          style={{ background: 'var(--bg-card)' }}>

          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white relative">
            <button onClick={onClose} className="absolute top-3 right-3 text-white/70 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Good morning!</h2>
                <p className="text-sm text-white/80">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>
            <p className="text-sm text-white/90 mt-3">Please punch in to start your workday.</p>
          </div>

          {/* Work Mode (system-determined, read-only) */}
          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                 style={{ color: 'var(--text-muted)' }}>
                Today's Work Mode
              </p>
              {modeLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border"
                     style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Determining…</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2"
                     style={{ borderColor: 'var(--accent)', background: 'var(--bg-info)' }}>
                  <ModeIcon className={`w-5 h-5 ${modeMeta.colorClass}`} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-link)' }}>
                    {modeMeta.label}
                  </span>
                </div>
              )}
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {determinedMode === 'office'
                  ? 'Default — no remote approval active for today'
                  : 'Based on your approved work mode request'}
              </p>
            </div>

            {/* Geo status */}
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <MapPin className="w-3.5 h-3.5" />
              {geoLoading ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Detecting location…
                </span>
              ) : geo ? (
                <span style={{ color: 'var(--text-success)' }}>
                  Location captured ({geo.accuracy ? Math.round(geo.accuracy) + 'm accuracy' : 'OK'})
                </span>
              ) : (
                <span>Location not available</span>
              )}
            </div>

            <button
              onClick={handlePunchIn}
              disabled={loading || modeLoading}
              className="w-full py-3 text-base font-semibold flex items-center justify-center gap-2 rounded-xl text-white transition-opacity disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
              {loading ? 'Punching In…' : 'Punch In'}
            </button>
            <button
              onClick={onDismiss ?? onClose}
              className="w-full text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
