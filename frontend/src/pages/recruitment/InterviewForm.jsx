import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Calendar, ArrowLeft, Video, Phone, MapPin,
  AlertTriangle, ToggleLeft, ToggleRight
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import interviewService from '../../services/interviewService'
import applicationService from '../../services/applicationService'
import matchingService from '../../services/matchingService'
import jobService from '../../services/jobService'
import pipelineService from '../../services/pipelineService'
import userService from '../../services/userService'

const InterviewForm = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillApplicationId = searchParams.get('application_id')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Dropdown data
  const [jobs, setJobs] = useState([])
  const [stages, setStages] = useState([])
  const [modes, setModes] = useState([])
  const [users, setUsers] = useState([])

  // Candidate selection
  const [manualMode, setManualMode] = useState(false)
  const [eligibleApplications, setEligibleApplications] = useState([])  // {id, candidate_name, candidate_id}
  const [allApplications, setAllApplications] = useState([])
  const [eligibilityWarning, setEligibilityWarning] = useState('')
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  const [formData, setFormData] = useState({
    application_id: prefillApplicationId || '',  // manual mode
    candidate_id: '',                             // auto mode (from matching_results)
    job_id: '',
    stage_id: '',
    interview_mode: 'video',
    scheduled_date: '',
    scheduled_time: '',
    duration_minutes: 60,
    interviewer_ids: [],
    meeting_link: '',
    venue: '',
    dial_in_number: '',
    instructions: ''
  })

  // Load initial data
  useEffect(() => {
    loadBase()
  }, [])

  // When job changes — load pipeline stages + candidates
  useEffect(() => {
    if (formData.job_id) {
      loadStagesForJob(formData.job_id)
      loadCandidatesForJob(formData.job_id)
      setFormData(prev => ({ ...prev, stage_id: '', application_id: prefillApplicationId || '' }))
      setEligibilityWarning('')
    } else {
      setStages([])
      setEligibleApplications([])
      setAllApplications([])
    }
  }, [formData.job_id])

  // Pre-fill job from application if coming with application_id
  useEffect(() => {
    if (prefillApplicationId) {
      setManualMode(true)  // coming from application link → use manual mode
      loadApplicationAndSetJob(prefillApplicationId)
    }
  }, [prefillApplicationId])

  const loadBase = async () => {
    const [modeRes, userRes, jobRes] = await Promise.allSettled([
      interviewService.getModes(),
      userService.getUsers({ page_size: 100 }),
      jobService.getJobs({ status: 'open,on_hold', page_size: 200 }),
    ])
    if (modeRes.status === 'fulfilled') setModes(modeRes.value.data || [])
    if (userRes.status === 'fulfilled') setUsers(userRes.value.data || [])
    if (jobRes.status === 'fulfilled') setJobs(jobRes.value.data || [])
  }

  const loadApplicationAndSetJob = async (appId) => {
    try {
      setLoading(true)
      const res = await applicationService.getApplication(appId)
      const app = res.data
      if (app?.job_id) {
        setFormData(prev => ({ ...prev, job_id: app.job_id, application_id: appId }))
      }
    } catch (err) {
      toast.error('Failed to load application')
    } finally {
      setLoading(false)
    }
  }

  const loadStagesForJob = async (jobId) => {
    try {
      const res = await pipelineService.getStagesForJob(jobId)
      setStages(res.data || [])
    } catch (err) {
      setStages([])
    }
  }

  const loadCandidatesForJob = async (jobId) => {
    try {
      setLoadingCandidates(true)

      // Auto mode: eligible candidates from matching_results (score >= 60, percentage OK)
      // Only candidates who also have an application are returned (needed for scheduling)
      const eligRes = await matchingService.getEligibleForInterview(jobId)
      setEligibleApplications(eligRes.data || [])

      // Manual mode: all applications for the job (any status)
      const allRes = await applicationService.getApplications({ job_id: jobId, page_size: 200 })
      setAllApplications(allRes.data || [])
    } catch (err) {
      console.error('Failed to load candidates:', err)
    } finally {
      setLoadingCandidates(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'application_id' && manualMode) {
      // Check eligibility: find this application's candidate_id in eligibleApplications
      const selectedApp = allApplications.find(a => a.id === value)
      const isEligible = eligibleApplications.some(
        c => c.candidate_id === selectedApp?.candidate_id
      )
      setEligibilityWarning(
        value && !isEligible
          ? 'Candidate does not meet job eligibility criteria.'
          : ''
      )
    }
  }

  const handleInterviewerChange = (userId) => {
    setFormData(prev => ({
      ...prev,
      interviewer_ids: prev.interviewer_ids.includes(userId)
        ? prev.interviewer_ids.filter(id => id !== userId)
        : [...prev.interviewer_ids, userId]
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Field-specific validation with clear messages
    const candidateSelected = manualMode ? formData.application_id : formData.candidate_id
    if (!formData.job_id) {
      toast.error('Please select a job')
      return
    }
    if (!candidateSelected) {
      toast.error(manualMode ? 'Please select a candidate application' : 'Please select an eligible candidate')
      return
    }
    if (stages.length === 0) {
      toast.error('No interview stages configured for this job. Set up a pipeline in Interview Settings first.')
      return
    }
    if (!formData.stage_id) {
      toast.error('Please select an interview stage')
      return
    }
    if (!formData.scheduled_date) {
      toast.error('Please select an interview date')
      return
    }
    if (!formData.scheduled_time) {
      toast.error('Please select an interview time')
      return
    }
    if (formData.interviewer_ids.length === 0) {
      toast.error('Please select at least one interviewer')
      return
    }

    try {
      setSaving(true)

      const payload = {
        stage_id: formData.stage_id,
        interview_mode: formData.interview_mode,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time,
        duration_minutes: Number(formData.duration_minutes),
        interviewer_ids: formData.interviewer_ids,
        meeting_link: formData.meeting_link || undefined,
        venue: formData.venue || undefined,
        dial_in_number: formData.dial_in_number || undefined,
        instructions: formData.instructions || undefined,
      }

      if (manualMode) {
        payload.application_id = formData.application_id
      } else {
        payload.candidate_id = formData.candidate_id
        payload.job_id = formData.job_id
      }

      await interviewService.scheduleInterview(payload)
      toast.success('Interview scheduled successfully')
      navigate('/interviews')
    } catch (err) {
      console.error('Failed to schedule interview:', err)
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
        : detail || err.message || 'Failed to schedule interview'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const getModeIcon = (mode) => {
    const icons = { video: Video, phone: Phone, in_person: MapPin }
    return icons[mode] || Video
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/interviews')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Schedule Interview</h1>
          <p className="text-surface-500">Set up a new interview</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Step 1 — Job + Candidate */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Job &amp; Candidate</h2>

          {/* Job selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Job <span className="text-red-500">*</span>
            </label>
            <select
              name="job_id"
              value={formData.job_id}
              onChange={handleChange}
              className="input w-full"
              required
            >
              <option value="">Select Job</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title} — {j.client_name || ''}</option>
              ))}
            </select>
          </div>

          {/* Candidate selection */}
          {formData.job_id && (
            <>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-surface-700">
                  Candidate <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(m => !m)
                    setEligibilityWarning('')
                    setFormData(prev => ({ ...prev, candidate_id: '', application_id: '' }))
                  }}
                  className="flex items-center gap-1 text-xs text-surface-500 hover:text-primary-600"
                >
                  {manualMode
                    ? <><ToggleRight className="w-4 h-4 text-primary-600" /> Manual mode ON</>
                    : <><ToggleLeft className="w-4 h-4" /> Auto (eligible only)</>}
                </button>
              </div>

              {loadingCandidates ? (
                <div className="text-sm text-surface-400">Loading candidates…</div>
              ) : manualMode ? (
                /* Manual mode — all applications, by application_id */
                <select
                  name="application_id"
                  value={formData.application_id}
                  onChange={handleChange}
                  className="input w-full"
                  required
                >
                  <option value="">Select any candidate ({allApplications.length})</option>
                  {allApplications.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.candidate_name} {a.status === 'rejected' ? '⚠ rejected' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                /* Auto mode — eligible candidates from matching_results, by candidate_id */
                <select
                  name="candidate_id"
                  value={formData.candidate_id}
                  onChange={handleChange}
                  className="input w-full"
                  required
                >
                  <option value="">Select eligible candidate ({eligibleApplications.length})</option>
                  {eligibleApplications.map(c => (
                    <option key={c.candidate_id} value={c.candidate_id}>
                      {c.candidate_name} — Score: {c.final_score}%
                    </option>
                  ))}
                </select>
              )}

              {eligibilityWarning && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {eligibilityWarning}
                </div>
              )}

              {!manualMode && eligibleApplications.length === 0 && !loadingCandidates && (
                <p className="text-sm text-amber-600 mt-2">
                  No eligible candidates for this job. Run matching first, or switch to manual mode.
                </p>
              )}
            </>
          )}
        </div>

        {/* Step 2 — Stage + Mode + Date */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Interview Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Interview Stage <span className="text-red-500">*</span>
              </label>
              <select
                name="stage_id"
                value={formData.stage_id}
                onChange={handleChange}
                className="input w-full"
                required
                disabled={!formData.job_id || stages.length === 0}
              >
                <option value="">
                  {!formData.job_id
                    ? 'Select a job first'
                    : stages.length === 0
                      ? 'No stages — configure pipeline first'
                      : `Select stage (${stages.length} available)`}
                </option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.order}. {s.stage_name}
                  </option>
                ))}
              </select>
              {formData.job_id && stages.length === 0 && !loadingCandidates && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-semibold text-red-700">No interview rounds configured for this job.</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Go to <strong>Settings → Interview Settings</strong> and create a pipeline for this job before scheduling.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Interview Mode <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {modes.map(m => {
                  const Icon = getModeIcon(m.value)
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, interview_mode: m.value }))}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                        formData.interview_mode === m.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-surface-200 hover:bg-surface-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm">{m.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="scheduled_date"
                value={formData.scheduled_date}
                onChange={handleChange}
                className="input w-full"
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                name="scheduled_time"
                value={formData.scheduled_time}
                onChange={handleChange}
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Duration (minutes)</label>
              <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="input w-full">
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mode-specific fields */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">
            {formData.interview_mode === 'video' && 'Video Conference Details'}
            {formData.interview_mode === 'phone' && 'Phone Interview Details'}
            {formData.interview_mode === 'in_person' && 'In-Person Interview Details'}
          </h2>

          {formData.interview_mode === 'video' && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Meeting Link</label>
              <input type="url" name="meeting_link" value={formData.meeting_link} onChange={handleChange}
                className="input w-full" placeholder="https://meet.google.com/..." />
            </div>
          )}
          {formData.interview_mode === 'phone' && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Dial-in Number</label>
              <input type="tel" name="dial_in_number" value={formData.dial_in_number} onChange={handleChange}
                className="input w-full" placeholder="+91 ..." />
            </div>
          )}
          {formData.interview_mode === 'in_person' && (
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Venue / Address</label>
              <textarea name="venue" value={formData.venue} onChange={handleChange}
                className="input w-full" rows={2} placeholder="Office address..." />
            </div>
          )}
        </div>

        {/* Interviewers */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">
            Interviewers <span className="text-red-500">*</span>
          </h2>
          <p className="text-sm text-surface-500 mb-4">Select one or more interviewers</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {users.map(user => (
              <label
                key={user.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  formData.interviewer_ids.includes(user.id)
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-surface-200 hover:bg-surface-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={formData.interviewer_ids.includes(user.id)}
                  onChange={() => handleInterviewerChange(user.id)}
                  className="rounded"
                />
                <div>
                  <p className="text-sm font-medium text-surface-900">{user.full_name}</p>
                  <p className="text-xs text-surface-500">{user.designation || user.role}</p>
                </div>
              </label>
            ))}
          </div>

          {formData.interviewer_ids.length > 0 && (
            <p className="text-sm text-primary-600 mt-3">{formData.interviewer_ids.length} interviewer(s) selected</p>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Instructions</h2>
          <textarea name="instructions" value={formData.instructions} onChange={handleChange}
            className="input w-full" rows={3}
            placeholder="Any special instructions for the candidate or interviewer..." />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => navigate('/interviews')} className="btn-secondary">Cancel</button>
          <button
            type="submit"
            disabled={saving || (formData.job_id && stages.length === 0 && !loadingCandidates)}
            className="btn-primary flex items-center gap-2"
            title={formData.job_id && stages.length === 0 ? 'Configure a pipeline for this job first' : undefined}
          >
            {saving ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Scheduling...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                Schedule Interview
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default InterviewForm
