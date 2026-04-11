import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Calendar, ArrowLeft, AlertTriangle, ToggleLeft, ToggleRight, Layers } from 'lucide-react'
import { toast } from 'react-hot-toast'
import interviewService from '../../services/interviewService'
import applicationService from '../../services/applicationService'
import jobService from '../../services/jobService'
import pipelineService from '../../services/pipelineService'

const InterviewForm = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillApplicationId = searchParams.get('application_id')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [jobs, setJobs] = useState([])
  const [pipelineInfo, setPipelineInfo] = useState(null)   // { stages: [], name: string|null }

  // Candidate selection
  const [manualMode, setManualMode] = useState(false)
  const [activeApplications, setActiveApplications] = useState([])
  const [allApplications, setAllApplications] = useState([])
  const [eligibilityWarning, setEligibilityWarning] = useState('')
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  const [formData, setFormData] = useState({
    application_id: prefillApplicationId || '',
    job_id: '',
    scheduled_date: '',
    scheduled_time: '',
    instructions: ''
  })

  useEffect(() => {
    jobService.getJobsDropdown('open,on_hold')
      .then(res => setJobs(res.data || []))
      .catch(() => {})
  }, [])

  // When job changes — load pipeline info + candidates
  useEffect(() => {
    if (formData.job_id) {
      loadPipelineForJob(formData.job_id)
      loadCandidatesForJob(formData.job_id)
      setFormData(prev => ({ ...prev, application_id: prefillApplicationId || '' }))
      setEligibilityWarning('')
    } else {
      setPipelineInfo(null)
      setActiveApplications([])
      setAllApplications([])
    }
  }, [formData.job_id])

  // Pre-fill from application_id query param
  useEffect(() => {
    if (prefillApplicationId) {
      setManualMode(true)
      loadApplicationAndSetJob(prefillApplicationId)
    }
  }, [prefillApplicationId])

  const loadApplicationAndSetJob = async (appId) => {
    try {
      setLoading(true)
      const res = await applicationService.getApplication(appId)
      const app = res.data
      if (app?.job_id) {
        setFormData(prev => ({ ...prev, job_id: app.job_id, application_id: appId }))
      }
    } catch {
      toast.error('Failed to load application')
    } finally {
      setLoading(false)
    }
  }

  const loadPipelineForJob = async (jobId) => {
    try {
      const res = await pipelineService.getStagesForJob(jobId)
      const stages = res.data || []
      setPipelineInfo({ stages, name: null })
    } catch {
      setPipelineInfo({ stages: [], name: null })
    }
  }

  const loadCandidatesForJob = async (jobId) => {
    try {
      setLoadingCandidates(true)
      const allRes = await applicationService.getApplications({ job_id: jobId, page_size: 100 })
      const apps = allRes.data || []
      setAllApplications(apps)
      setActiveApplications(apps.filter(a => !['rejected', 'withdrawn'].includes(a.status)))
    } catch {
      toast.error('Failed to load candidates for this job')
    } finally {
      setLoadingCandidates(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'application_id' && manualMode) {
      const selectedApp = allApplications.find(a => a.id === value)
      setEligibilityWarning(
        value && ['rejected', 'withdrawn'].includes(selectedApp?.status)
          ? 'This candidate has been rejected or withdrawn from this job.'
          : ''
      )
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.job_id) { toast.error('Please select a job'); return }
    if (!formData.application_id) { toast.error('Please select a candidate'); return }
    if (!formData.scheduled_date) { toast.error('Please select Round 1 date'); return }
    if (!formData.scheduled_time) { toast.error('Please select Round 1 time'); return }

    try {
      setSaving(true)
      await interviewService.scheduleInterview({
        application_id: formData.application_id,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time,
        instructions: formData.instructions || undefined,
      })
      toast.success('Interview scheduled successfully')
      navigate('/interviews')
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
        : detail || err.message || 'Failed to schedule interview'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const hasPipeline = pipelineInfo && pipelineInfo.stages.length > 0
  const noPipeline = pipelineInfo && pipelineInfo.stages.length === 0

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/interviews')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Schedule Interview</h1>
          <p className="text-surface-500">Rounds auto-progress from the job's pipeline</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Job & Candidate */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Job &amp; Candidate</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Job <span className="text-red-500">*</span>
            </label>
            <select name="job_id" value={formData.job_id} onChange={handleChange} className="input w-full" required>
              <option value="">Select Job</option>
              {jobs.map(j => (
                <option key={j.value} value={j.value}>{j.title} — {j.client_name || ''}</option>
              ))}
            </select>
          </div>

          {/* Pipeline info */}
          {formData.job_id && pipelineInfo && (
            <div className={`mb-4 flex items-start gap-2 p-3 rounded-lg border text-sm ${
              hasPipeline
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <Layers className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {hasPipeline ? (
                <div>
                  <p className="font-medium">{pipelineInfo.stages.length}-round pipeline detected</p>
                  <p className="text-xs mt-0.5">
                    {pipelineInfo.stages.map((s, i) => `${i + 1}. ${s.stage_name}`).join(' → ')}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">No pipeline configured for this job</p>
                  <p className="text-xs mt-0.5">A single "Interview" round will be created. Configure a pipeline in <strong>Settings → Interview Settings</strong> for multi-round tracking.</p>
                </div>
              )}
            </div>
          )}

          {/* Candidate dropdown */}
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
                    setFormData(prev => ({ ...prev, application_id: '' }))
                  }}
                  className="flex items-center gap-1 text-xs text-surface-500 hover:text-primary-600"
                >
                  {manualMode
                    ? <><ToggleRight className="w-4 h-4 text-primary-600" /> Showing all (incl. rejected)</>
                    : <><ToggleLeft className="w-4 h-4" /> Active applicants only</>}
                </button>
              </div>

              {loadingCandidates ? (
                <div className="text-sm text-surface-400">Loading candidates…</div>
              ) : manualMode ? (
                <select name="application_id" value={formData.application_id} onChange={handleChange} className="input w-full" required>
                  <option value="">Select any candidate ({allApplications.length})</option>
                  {allApplications.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.candidate_name}{a.status === 'rejected' ? ' ⚠ rejected' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <select name="application_id" value={formData.application_id} onChange={handleChange} className="input w-full" required>
                  <option value="">Select candidate ({activeApplications.length})</option>
                  {activeApplications.map(a => (
                    <option key={a.id} value={a.id}>{a.candidate_name}</option>
                  ))}
                </select>
              )}

              {eligibilityWarning && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {eligibilityWarning}
                </div>
              )}

              {!manualMode && activeApplications.length === 0 && !loadingCandidates && (
                <p className="text-sm text-amber-600 mt-2">
                  No active candidates for this job. Switch to manual mode to see all.
                </p>
              )}
            </>
          )}
        </div>

        {/* Round 1 Schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Round 1 Schedule</h2>
          <p className="text-sm text-surface-500 mb-4">Set the date and time for the first round. Subsequent rounds are scheduled after each result.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </div>

        {/* Instructions (optional) */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Instructions <span className="text-surface-400 font-normal text-sm">(optional)</span></h2>
          <textarea
            name="instructions"
            value={formData.instructions}
            onChange={handleChange}
            className="input w-full"
            rows={3}
            placeholder="Any instructions for the candidate..."
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => navigate('/interviews')} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
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
