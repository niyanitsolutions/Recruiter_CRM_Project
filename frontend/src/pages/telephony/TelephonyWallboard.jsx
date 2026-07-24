import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Radio, Users, PhoneCall, PhoneMissed, Clock3, TrendingUp, ArrowLeft, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import userService from '../../services/userService'
import { useCRMEvents } from '../../context/CRMSocketContext'
import { selectTelephonyEnabled } from '../../store/authSlice'

function Tile({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}26` }}>
        <Icon className="w-6 h-6" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-3xl font-bold text-white">{value}</p>
        <p className="text-sm text-white/50">{label}</p>
      </div>
    </div>
  )
}

/**
 * Standalone fullscreen route (/telephony/wallboard) — intentionally
 * rendered OUTSIDE Layout.jsx's sidebar/topbar chrome and outside
 * TelephonyContext (CRMSocketProvider is mounted above the router in
 * App.jsx, so useCRMEvents still works here). Re-fetches the composed
 * snapshot when a relevant WebSocket event arrives — no polling loop.
 */
export default function TelephonyWallboard() {
  const telephonyEnabled = useSelector(selectTelephonyEnabled)
  const [data, setData] = useState(null)
  const [names, setNames] = useState({})

  const load = useCallback(() => {
    telephonyService.getWallboard().then(r => setData(r.data)).catch(() => toast.error('Failed to load wallboard.'))
  }, [])

  useEffect(() => { if (telephonyEnabled) load() }, [telephonyEnabled, load])

  // Name resolution is a cosmetic nicety — falls back to raw user_id for a
  // supervisor without users:view, same pattern as AgentPerformance.jsx.
  useEffect(() => {
    userService.getUsers({ page_size: 200 }).then(res => {
      const list = Array.isArray(res) ? res : (res?.users || res?.items || [])
      const map = {}
      list.forEach(u => { map[u.id || u._id] = u.full_name || u.username })
      setNames(map)
    }).catch(() => {})
  }, [])
  useCRMEvents('telephony.call_updated', load, null, [load])
  useCRMEvents('telephony.presence_updated', load, null, [load])

  if (!telephonyEnabled) {
    return (
      <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center text-white/50 gap-3">
        <Phone className="w-10 h-10 text-white/20" />
        <p>Telephony is not enabled for your organization.</p>
        <Link to="/telephony" className="text-primary-400 hover:underline text-sm">Back to Telephony</Link>
      </div>
    )
  }

  if (!data) {
    return <div className="min-h-screen bg-surface-900 flex items-center justify-center text-white/50">Loading wallboard…</div>
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'linear-gradient(160deg, #0f172a, #1e293b)' }}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link to="/telephony" className="text-white/40 hover:text-white/80"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio className="w-6 h-6 text-emerald-400 animate-pulse" /> Live Wallboard
          </h1>
        </div>
        <span className="text-xs text-white/40">Live · updates automatically</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
        <Tile icon={Radio} label="Live Calls" value={data.live_calls ?? 0} accent="#10b981" />
        <Tile icon={Users} label="Agents Online" value={data.agents_online ?? 0} accent="#6366f1" />
        <Tile icon={PhoneCall} label="Available" value={data.agents_available ?? 0} accent="#22c55e" />
        <Tile icon={PhoneMissed} label="Busy / On Call" value={data.agents_busy ?? 0} accent="#f59e0b" />
        <Tile icon={PhoneCall} label="Today's Calls" value={data.total_calls ?? 0} accent="#8b5cf6" />
        <Tile icon={PhoneMissed} label="Missed" value={data.missed ?? 0} accent="#ef4444" />
        <Tile icon={Clock3} label="Avg Talk Time" value={`${data.avg_duration ?? 0}s`} accent="#0ea5e9" />
        <Tile icon={TrendingUp} label="Success Rate" value={`${data.success_rate ?? 0}%`} accent="#14b8a6" />
      </div>

      <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 className="text-sm font-semibold text-white/70 mb-4 uppercase tracking-wide">Top Performers Today</h2>
        {(data.top_performers || []).length === 0 ? (
          <p className="text-white/40 text-sm">No call activity yet.</p>
        ) : (
          <div className="space-y-3">
            {data.top_performers.map((a, idx) => (
              <div key={a.user_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 text-white/70 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                  <span className="text-white/90 font-medium">{names[a.user_id] || a.user_id}</span>
                </div>
                <div className="flex items-center gap-6 text-white/50">
                  <span>{a.total_calls} calls</span>
                  <span>{a.success_rate}% success</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
