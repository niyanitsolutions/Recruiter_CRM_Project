import { useState, useEffect, useCallback } from 'react'
import { Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const NOTIFICATION_EVENTS = [
  { section: 'Recruitment',
    events: [
      { key: 'new_candidate',        label: 'New Candidate Added' },
      { key: 'candidate_status',     label: 'Candidate Status Changed' },
      { key: 'resume_parsed',        label: 'Resume Auto-Parsed' },
      { key: 'job_posted',           label: 'New Job Posted' },
      { key: 'job_closed',           label: 'Job Closed / Filled' },
      { key: 'application_received', label: 'New Application Received' },
    ],
  },
  { section: 'Interviews',
    events: [
      { key: 'interview_scheduled',  label: 'Interview Scheduled' },
      { key: 'interview_reminder',   label: 'Interview Reminder (before)' },
      { key: 'interview_feedback',   label: 'Interview Feedback Submitted' },
      { key: 'interview_cancelled',  label: 'Interview Cancelled' },
    ],
  },
  { section: 'Onboarding & Finance',
    events: [
      { key: 'offer_sent',           label: 'Offer Letter Sent' },
      { key: 'offer_accepted',       label: 'Offer Accepted' },
      { key: 'onboard_started',      label: 'Onboarding Started' },
      { key: 'invoice_generated',    label: 'Invoice Generated' },
      { key: 'payment_received',     label: 'Payment Received' },
    ],
  },
  { section: 'System',
    events: [
      { key: 'user_created',         label: 'New User Created' },
      { key: 'user_login',           label: 'User Login' },
      { key: 'failed_login',         label: 'Failed Login Attempt' },
      { key: 'target_achieved',      label: 'Target Achieved' },
      { key: 'sla_breach',           label: 'SLA Breach Warning' },
    ],
  },
]

const DEFAULT_MATRIX = {}
NOTIFICATION_EVENTS.forEach(sec => {
  sec.events.forEach(ev => {
    DEFAULT_MATRIX[ev.key] = { email: true, in_app: true }
  })
})

const ToggleCell = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                ${checked ? 'bg-accent-600' : 'bg-surface-300'}`}
  >
    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow
                      transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
)

const NotificationSettingsPage = () => {
  const [matrix, setMatrix]   = useState(DEFAULT_MATRIX)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getNotificationMatrix()
      if (res.data?.matrix && Object.keys(res.data.matrix).length > 0) {
        setMatrix({ ...DEFAULT_MATRIX, ...res.data.matrix })
      }
    } catch {
      toast.error('Failed to load notification settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveNotificationMatrix({ matrix })
      toast.success('Notification settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (key, channel) => {
    setMatrix(m => ({
      ...m,
      [key]: { ...m[key], [channel]: !(m[key]?.[channel] ?? true) },
    }))
  }

  const toggleAll = (channel, value) => {
    setMatrix(m => {
      const updated = { ...m }
      Object.keys(updated).forEach(k => {
        updated[k] = { ...updated[k], [channel]: value }
      })
      return updated
    })
  }

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Breadcrumb page="Notification Preferences" />
      <PageHeader title="Notification Preferences" description="Configure which events trigger email or in-app notifications." />

      <SectionCard title="Notification Matrix" icon={Bell} className="[&_.p-6]:p-0">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px] gap-2 px-6 py-3 bg-surface-50 border-b border-surface-100">
          <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Event</span>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Email</span>
            <div className="flex gap-1.5 text-xs text-surface-400">
              <button onClick={() => toggleAll('email', true)} className="hover:text-success-600">All</button>
              <span>/</span>
              <button onClick={() => toggleAll('email', false)} className="hover:text-danger-500">None</button>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide">In-App</span>
            <div className="flex gap-1.5 text-xs text-surface-400">
              <button onClick={() => toggleAll('in_app', true)} className="hover:text-success-600">All</button>
              <span>/</span>
              <button onClick={() => toggleAll('in_app', false)} className="hover:text-danger-500">None</button>
            </div>
          </div>
        </div>

        {NOTIFICATION_EVENTS.map(sec => (
          <div key={sec.section}>
            <div className="px-6 py-2 bg-surface-50 border-y border-surface-100">
              <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide">{sec.section}</p>
            </div>
            {sec.events.map(({ key, label }) => {
              const prefs = matrix[key] || { email: true, in_app: true }
              return (
                <div key={key} className="grid grid-cols-[1fr_100px_100px] gap-2 items-center px-6 py-3 hover:bg-surface-50 transition-colors border-b border-surface-50 last:border-0">
                  <span className="text-sm text-surface-800">{label}</span>
                  <div className="flex justify-center">
                    <ToggleCell checked={!!prefs.email} onChange={() => toggle(key, 'email')} />
                  </div>
                  <div className="flex justify-center">
                    <ToggleCell checked={!!prefs.in_app} onChange={() => toggle(key, 'in_app')} />
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default NotificationSettingsPage
