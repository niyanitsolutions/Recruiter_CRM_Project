import { useState, useEffect, useCallback } from 'react'
import { CalendarCheck, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SelectField,
  SaveBtn, CancelBtn, Toggle, SkeletonLoader, ActionBar,
} from './SettingsLayout'

const DEFAULT = {
  round_types: [
    { name: 'Phone Screening', is_enabled: true },
    { name: 'Technical Round', is_enabled: true },
    { name: 'HR Round', is_enabled: true },
    { name: 'Final Round', is_enabled: true },
  ],
  default_duration_minutes: 60,
  buffer_time_minutes: 15,
  auto_calendar_invite: false,
  reminder_hours_before: [24, 1],
  feedback_required: true,
  feedback_questions: [
    'Rate the candidate\'s technical skills (1-10)',
    'How well did the candidate communicate?',
    'Would you recommend this candidate?',
  ],
  allow_reschedule: true,
  max_reschedule_count: 2,
}

const InterviewSettingsPage = () => {
  const [data, setData]       = useState(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newRound, setNewRound]       = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getInterviewSettings()
      if (res.data && Object.keys(res.data).length > 0) {
        setData({ ...DEFAULT, ...res.data })
      }
    } catch {
      toast.error('Failed to load interview settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveInterviewSettings(data)
      toast.success('Interview settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (field, value) => setData(d => ({ ...d, [field]: value }))

  const addRound = () => {
    if (!newRound.trim()) return
    set('round_types', [...data.round_types, { name: newRound.trim(), is_enabled: true }])
    setNewRound('')
  }

  const toggleRound = (idx, enabled) => {
    const rounds = [...data.round_types]
    rounds[idx] = { ...rounds[idx], is_enabled: enabled }
    set('round_types', rounds)
  }

  const deleteRound = (idx) => {
    set('round_types', data.round_types.filter((_, i) => i !== idx))
  }

  const addQuestion = () => {
    if (!newQuestion.trim()) return
    set('feedback_questions', [...data.feedback_questions, newQuestion.trim()])
    setNewQuestion('')
  }

  const deleteQuestion = (idx) => {
    set('feedback_questions', data.feedback_questions.filter((_, i) => i !== idx))
  }

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Interview Settings" />
      <PageHeader title="Interview Settings" description="Configure default interview behaviour, reminders, and feedback templates." />

      {/* Round Types */}
      <SectionCard title="Interview Round Types" icon={CalendarCheck}>
        <div className="space-y-2 mb-4">
          {data.round_types.map((round, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-100">
              <span className="flex-1 text-sm font-medium text-surface-900">{round.name}</span>
              <button
                type="button"
                onClick={() => toggleRound(idx, !round.is_enabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                            ${round.is_enabled ? 'bg-accent-600' : 'bg-surface-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                                  ${round.is_enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <button onClick={() => deleteRound(idx)} className="p-1 hover:bg-danger-50 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-danger-500" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newRound}
            onChange={e => setNewRound(e.target.value)}
            placeholder="Add new round type…"
            onKeyDown={e => e.key === 'Enter' && addRound()}
            className="flex-1"
          />
          <button onClick={addRound} className="flex items-center gap-1 px-3 py-2 bg-accent-50 text-accent-700 text-sm font-medium rounded-lg hover:bg-accent-100 transition-colors">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </SectionCard>

      {/* Timing */}
      <SectionCard title="Scheduling Defaults">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default Duration (minutes)">
            <Input type="number" min={15} step={15} value={data.default_duration_minutes} onChange={e => set('default_duration_minutes', parseInt(e.target.value) || 60)} />
          </Field>
          <Field label="Buffer Time (minutes)" hint="Gap between consecutive interviews">
            <Input type="number" min={0} step={5} value={data.buffer_time_minutes} onChange={e => set('buffer_time_minutes', parseInt(e.target.value) || 0)} />
          </Field>
        </div>
        <div className="mt-4 border border-surface-100 rounded-xl px-4 divide-y divide-surface-50">
          <Toggle
            checked={data.auto_calendar_invite}
            onChange={v => set('auto_calendar_invite', v)}
            label="Auto Calendar Invite"
            description="Automatically send calendar invites when interview is scheduled"
          />
          <Toggle
            checked={data.allow_reschedule}
            onChange={v => set('allow_reschedule', v)}
            label="Allow Reschedule"
            description="Candidates / interviewers can request reschedule"
          />
        </div>
        {data.allow_reschedule && (
          <div className="mt-4">
            <Field label="Max Reschedule Count" hint="Maximum times an interview can be rescheduled">
              <Input type="number" min={1} max={10} value={data.max_reschedule_count} onChange={e => set('max_reschedule_count', parseInt(e.target.value) || 2)} className="w-32" />
            </Field>
          </div>
        )}
      </SectionCard>

      {/* Feedback */}
      <SectionCard title="Feedback Settings">
        <div className="border border-surface-100 rounded-xl px-4 mb-4">
          <Toggle
            checked={data.feedback_required}
            onChange={v => set('feedback_required', v)}
            label="Require Feedback"
            description="Interviewers must submit feedback before interview can be closed"
          />
        </div>

        {data.feedback_required && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-surface-700">Feedback Questions</p>
            {data.feedback_questions.map((q, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-surface-50 rounded-lg">
                <span className="flex-1 text-sm text-surface-800">{q}</span>
                <button onClick={() => deleteQuestion(idx)} className="p-1 hover:bg-danger-50 rounded">
                  <Trash2 className="w-3.5 h-3.5 text-danger-500" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <Input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Add a feedback question…" onKeyDown={e => e.key === 'Enter' && addQuestion()} className="flex-1" />
              <button onClick={addQuestion} className="flex items-center gap-1 px-3 py-2 bg-accent-50 text-accent-700 text-sm rounded-lg hover:bg-accent-100 transition-colors">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default InterviewSettingsPage
