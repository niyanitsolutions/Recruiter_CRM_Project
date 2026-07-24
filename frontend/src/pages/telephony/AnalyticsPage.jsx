import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Loader2, Clock3, PhoneMissed, PhoneOff, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'
import TelephonyExportButton from '../../components/telephony/TelephonyExportButton'

function SlaCard({ icon: Icon, label, value, sample, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}1a` }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-lg font-bold text-surface-900">{value}</p>
        <p className="text-xs text-surface-400">{label}{sample != null ? ` · n=${sample}` : ''}</p>
      </div>
    </div>
  )
}

const PERIODS = [
  { key: 'hourly', label: 'Hourly (24h)' },
  { key: 'daily', label: 'Daily (30d)' },
  { key: 'weekly', label: 'Weekly (90d)' },
  { key: 'monthly', label: 'Monthly (12mo)' },
]

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('daily')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [sla, setSla] = useState(null)
  const [departments, setDepartments] = useState([])

  const load = useCallback(async (p) => {
    try {
      setLoading(true)
      const [analyticsRes, slaRes, deptRes] = await Promise.all([
        telephonyService.getAnalytics(p),
        telephonyService.getSlaMetrics().catch(() => null),
        telephonyService.getDepartmentAnalytics().catch(() => null),
      ])
      setData(analyticsRes.data)
      if (slaRes) setSla(slaRes.data)
      if (deptRes) setDepartments(deptRes.data?.departments || [])
    } catch {
      toast.error('Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900">Call Analytics</h2>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface-50 rounded-xl p-1">
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p.key ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <TelephonyExportButton type="calls" label="Export Calls" />
        </div>
      </div>

      {/* Phase 4: SLA metrics */}
      {sla && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SlaCard icon={Clock3} label="Avg Pickup Time" value={sla.avg_pickup_time_seconds != null ? `${sla.avg_pickup_time_seconds}s` : '—'} sample={sla.pickup_sample_size} accent="#0ea5e9" />
          <SlaCard icon={PhoneMissed} label="Missed Rate" value={`${sla.missed_rate_pct}%`} accent="#ef4444" />
          <SlaCard icon={PhoneOff} label="Avg Callback SLA" value={sla.avg_callback_sla_seconds != null ? `${sla.avg_callback_sla_seconds}s` : '—'} sample={sla.callback_sample_size} accent="#f59e0b" />
          <SlaCard icon={CheckCircle2} label="Avg Resolution Time" value={sla.avg_resolution_time_seconds != null ? `${sla.avg_resolution_time_seconds}s` : '—'} sample={sla.resolution_sample_size} accent="#22c55e" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
      ) : !data || data.series.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-200 p-10 text-center text-surface-400">No call data for this period.</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-surface-200 p-5">
            <h3 className="text-sm font-semibold text-surface-700 mb-3">Call Volume</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2} />
                <Line type="monotone" dataKey="answered" name="Answered" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="missed" name="Missed" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-surface-200 p-5">
              <h3 className="text-sm font-semibold text-surface-700 mb-3">Average Duration</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avg_duration" name="Avg Duration (s)" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl border border-surface-200 p-5">
              <h3 className="text-sm font-semibold text-surface-700 mb-3">Provider Comparison</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.provider_comparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name="Total" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="answered" name="Answered" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Phase 4: department comparison */}
          {departments.length > 0 && (
            <div className="bg-white rounded-2xl border border-surface-200 p-5">
              <h3 className="text-sm font-semibold text-surface-700 mb-3">Calls by Department</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={departments}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name="Total" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="answered" name="Answered" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="missed" name="Missed" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
