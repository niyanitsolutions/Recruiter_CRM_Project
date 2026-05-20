/**
 * PunchInModal — shown once per day when the user hasn't punched in yet.
 * Captures work_mode + optional geo-location, then fires checkIn.
 */
import React, { useState, useEffect } from 'react'
import { Clock, MapPin, Loader2, Wifi, Home, Building2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../common/ModalPortal'

const WORK_MODES = [
  { key: 'office', label: 'In Office',    icon: Building2, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { key: 'wfh',    label: 'Work From Home', icon: Home,      color: 'text-green-600 bg-green-50 border-green-200' },
  { key: 'hybrid', label: 'Hybrid',       icon: Wifi,      color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { key: 'field',  label: 'Field Work',   icon: MapPin,    color: 'text-orange-600 bg-orange-50 border-orange-200' },
]

export default function PunchInModal({ isOpen, onClose, onPunchedIn, employeeId }) {
  const [workMode, setWorkMode] = useState('office')
  const [geo, setGeo]           = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (!isOpen) return
    // Auto-request geo on open
    if (navigator.geolocation) {
      setGeoLoading(true)
      navigator.geolocation.getCurrentPosition(
        pos => {
          setGeo({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy })
          setGeoLoading(false)
        },
        () => setGeoLoading(false),
        { timeout: 8000, enableHighAccuracy: false }
      )
    }
  }, [isOpen])

  const handlePunchIn = async () => {
    setLoading(true)
    try {
      await hrmService.checkIn({
        employee_id: employeeId || null,
        work_mode: workMode,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
      })
      toast.success('Punched in! Have a productive day.')
      onPunchedIn()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to punch in'
      toast.error(msg)
    }
    setLoading(false)
  }

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
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

          {/* Work Mode */}
          <div className="p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Where are you working from today?</p>
            <div className="grid grid-cols-2 gap-2">
              {WORK_MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => setWorkMode(m.key)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all
                    ${workMode === m.key ? m.color + ' border-current' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}
                >
                  <m.icon className="w-4 h-4" />
                  {m.label}
                </button>
              ))}
            </div>

            {/* Geo status */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <MapPin className="w-3.5 h-3.5" />
              {geoLoading ? (
                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Detecting location…</span>
              ) : geo ? (
                <span className="text-green-600">Location captured ({geo.accuracy ? Math.round(geo.accuracy) + 'm accuracy' : 'OK'})</span>
              ) : (
                <span>Location not available</span>
              )}
            </div>

            <button
              onClick={handlePunchIn}
              disabled={loading}
              className="w-full btn-primary py-3 text-base font-semibold flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
              {loading ? 'Punching In…' : 'Punch In'}
            </button>
            <button onClick={onClose} className="w-full text-sm text-gray-400 hover:text-gray-600">
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
