import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ShieldCheck, CheckCircle2, XCircle, Radio } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'

const CAPABILITY_LABELS = {
  click_to_call: 'Click to Call',
  hangup: 'Hangup',
  hold: 'Hold',
  resume: 'Resume',
  mute: 'Mute',
  unmute: 'Unmute',
  transfer: 'Transfer',
  record_control: 'Recording Control (start/stop mid-call)',
  call_status: 'Call Status Lookup',
  call_details: 'Call Details Lookup',
  recording_retrieval: 'Recording Retrieval',
  call_logs: 'Call Logs / CDR',
  webhooks: 'Provider Webhooks',
  webhook_signature: 'Webhook Signature Verification',
  token_refresh: 'Token Refresh',
  queue_management: 'Queue Management',
  call_listen: 'Live Listen',
  call_whisper: 'Live Whisper',
  call_barge: 'Live Barge',
}

/**
 * Read-only, zero-hardcoded-provider view of exactly what the tenant's
 * active provider supports — composes the same get_capabilities() (Phase 1)
 * and get_provider_health() (Phase 3) data every other capability-gated
 * screen already relies on, just surfaced directly instead of only driving
 * show/hide logic.
 */
export default function CapabilityCenter() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await telephonyService.getCapabilityCenter()
      setData(res.data)
    } catch {
      toast.error('Failed to load capability center.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
  }
  if (!data) return null

  const { capabilities = {}, health = {} } = data

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary-500" /> Provider Capability Center
        </h2>
        <button onClick={load} className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-surface-400">Active Provider</p>
          <p className="text-sm font-semibold text-surface-900 capitalize">{health.provider?.replace(/_/g, ' ') || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-surface-400">Connection</p>
          <p className={`text-sm font-semibold flex items-center gap-1 ${health.connection?.success ? 'text-emerald-600' : 'text-red-500'}`}>
            {health.connection?.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {health.connection?.success ? 'Healthy' : 'Issue'}
          </p>
        </div>
        <div>
          <p className="text-xs text-surface-400">Webhooks (24h)</p>
          <p className="text-sm font-semibold text-surface-900">{health.webhook_count_24h ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-surface-400">Sync Errors (24h)</p>
          <p className="text-sm font-semibold text-surface-900">{health.error_count_24h ?? 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-100">
          <h3 className="text-sm font-semibold text-surface-700">Capability Truth Table</h3>
        </div>
        <div className="divide-y divide-surface-100">
          {Object.entries(CAPABILITY_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-surface-600 flex items-center gap-2">
                {['queue_management', 'call_listen', 'call_whisper', 'call_barge'].includes(key) && (
                  <Radio className="w-3.5 h-3.5 text-surface-300" />
                )}
                {label}
              </span>
              {capabilities[key] ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Supported</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-surface-400 text-xs font-medium"><XCircle className="w-3.5 h-3.5" /> Not supported</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
