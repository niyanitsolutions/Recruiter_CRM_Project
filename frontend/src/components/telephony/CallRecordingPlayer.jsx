import { useState, useEffect } from 'react'
import { Download, Loader2, Music4 } from 'lucide-react'
import telephonyService from '../../services/telephonyService'
import { useTelephony } from '../../context/TelephonyContext'

/**
 * Renders an audio player + download link for a call recording — but ONLY
 * if the active provider's capability table actually supports recording
 * retrieval. Renders nothing at all otherwise (never a disabled/greyed
 * section — fully hidden, per the capability-driven UI requirement).
 */
export default function CallRecordingPlayer({ callId, recordingUrl, duration }) {
  const { capabilities } = useTelephony()
  const [url, setUrl] = useState(recordingUrl || null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (url || !callId || !capabilities.recording_retrieval) return
    setLoading(true)
    telephonyService.getRecording(callId)
      .then(r => setUrl(r.data?.data?.recording_url || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [callId, url, capabilities.recording_retrieval])

  if (!capabilities.recording_retrieval) return null

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-surface-500">
        <Music4 className="w-3.5 h-3.5" /> Recording {duration ? `(${duration}s)` : ''}
      </label>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-surface-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading recording...</div>
      ) : url ? (
        <div className="flex items-center gap-2">
          <audio controls src={url} className="flex-1 h-9" />
          <a href={url} download target="_blank" rel="noreferrer" className="p-2 rounded-lg text-surface-500 hover:bg-surface-100" title="Download">
            <Download className="w-4 h-4" />
          </a>
        </div>
      ) : (
        <p className="text-xs text-surface-400">No recording available for this call.</p>
      )}
    </div>
  )
}
