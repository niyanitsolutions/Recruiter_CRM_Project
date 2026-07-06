import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Calendar, ArrowLeft, AlertTriangle, ToggleLeft, ToggleRight,
  Layers, CheckCircle, XCircle, ShieldAlert, Loader2
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import interviewService from '../../services/interviewService'
import applicationService from '../../services/applicationService'
import jobService from '../../services/jobService'
import pipelineService from '../../services/pipelineService'
import SearchableSelect from '../../components/common/SearchableSelect'
import DraftRecoveryBanner from '../../components/common/DraftRecoveryBanner'
import { useDraftRecovery } from '../../hooks/useDraftRecovery'

// ── Validation panel ──────────────────────────────────────────────────────────
const ValidationPanel = ({ result, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
        style={{ background: 'rgba(139,143,168,0.1)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        Checking scheduling eligibility…
      </div>
    )
  }

  if (!result) return null

  const { can_schedule, blocks = [], warnings = [], retry_count = 0 } = result

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.25)', color: '#FF4757' }}>
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{block.message}</span>
        </div>
      ))}
      {warnings.map((warn, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{warn.message}</span>
        </div>
      ))}
      {can_schedule && blocks.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'rgba(67,233,123,0.1)', border: '1px solid rgba(67,233,123,0.25)', color: '#43E97B' }}>
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Candidate is eligible for scheduling
          {retry_count > 0 && ` — attempt ${retry_count + 1} of 3`}
        </div>
      )}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────
const InterviewForm = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillApplicationId = searchParams.get('application_id')

  const [loading,          setLoading]          = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [jobs,             setJobs]             = useState([])
  const [pipelineInfo,     setPipelineInfo]     = useState(null)
  const [manualMode,       setManualMode]       = useState(false)
  const [activeApps,       setActiveApps]       = useState([])
  const [allApps,          setAllApps]          = useState([])
  const [loadingCandidates,setLoadingCandidates]= useState(false)
  const [validating,       setValidating]       = useState(false)
  const [validationResult, setValidationResult] = useState(null)

  const _validateTimer = useRef(null)

  const [formData, setFormData] = useState({
    application_id: prefillApplicationId || '',
    job_id:         '',
    scheduled_date: '',
    scheduled_time: '',
    instructions:   '',
    meeting_link:    '',
    assessment_link: '',
  })
  const [notifyCandidate, setNotifyCandidate] = useState(true)

  const [submitted, setSubmitted] = useState(false)
  const { draftAvailable, draftSavedAt, restoreDraft, discardDraft } = useDraftRecovery(
    'interview', null, formData, setFormData,
    { isDirty: (d) => !!(d.job_id || d.application_id), isSubmitted: submitted }
  )

  // Load jobs on mount
  useEffect(() => {
    jobService.getJobsDropdown('open,on_hold')
      .then(res => setJobs(res.data || []))
      .catch(() => {})
  }, [])

  // When job changes — reload pipeline + candidates
  useEffect(() => {
    if (formData.job_id) {
      loadPipelineForJob(formData.job_id)
      loadCandidatesForJob(formData.job_id)
      setFormData(prev => ({ ...prev, application_id: prefillApplicationId || '' }))
      setValidationResult(null)
    } else {
      setPipelineInfo(null)
      setActiveApps([])
      setAllApps([])
      setValidationResult(null)
    }
  }, [formData.job_id])

  // Pre-fill from URL param
  useEffect(() => {
    if (prefillApplicationId) {
      setManualMode(true)
      loadApplicationAndSetJob(prefillApplicationId)
    }
  }, [prefillApplicationId])

  // Run pre-flight validation 400ms after candidate selection
  useEffect(() => {
    clearTimeout(_validateTimer.current)
    if (formData.application_id) {
      setValidating(true)
      setValidationResult(null)
      _validateTimer.current = setTimeout(async () => {
        try {
          const res = await interviewService.validateScheduling({ application_id: formData.application_id })
          setValidationResult(res.data)
        } catch {
          setValidationResult(null)
        } finally {
          setValidating(false)
        }
      }, 400)
    } else {
      setValidationResult(null)
    }
    return () => clearTimeout(_validateTimer.current)
  }, [formData.application_id])

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
      setPipelineInfo({ stages: res.data || [] })
    } catch {
      setPipelineInfo({ stages: [] })
    }
  }

  const loadCandidatesForJob = async (jobId) => {
    try {
      setLoadingCandidates(true)
      const res = await applicationService.getApplications({ job_id: jobId, page_size: 100 })
      const apps = res.data || []
      setAllApps(apps)
      setActiveApps(apps.filter(a => !['rejected', 'withdrawn'].includes(a.status)))
    } catch {
      toast.error('Failed to load candidates for this job')
    } finally {
      setLoadingCandidates(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const isBlocked = validationResult && !validationResult.can_schedule
  const canSubmit = !saving && !validating && !isBlocked

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.job_id)          { toast.error('Please select a job');             return }
    if (!formData.application_id)  { toast.error('Please select a candidate');       return }
    if (!formData.scheduled_date)  { toast.error('Please select Round 1 date');     return }
    if (!formData.scheduled_time)  { toast.error('Please select Round 1 time');     return }
    if (isBlocked) {
      toast.error(validationResult.blocks[0]?.message || 'Candidate is not eligible')
      return
    }
    try {
      setSaving(true)
      await interviewService.scheduleInterview({
        application_id: formData.application_id,
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time,
        instructions:   formData.instructions || undefined,
        meeting_link:    formData.meeting_link || undefined,
        assessment_link: formData.assessment_link || undefined,
        send_notification: notifyCandidate,
      })
      setSubmitted(true)
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
        <div className="animate-spin w-8 h-8 border-2 rounded-full"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const hasPipeline = pipelineInfo && pipelineInfo.stages.length > 0

  return (
    <div className="p-6 max-w-2xl mx-auto page-enter">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/interviews')}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = ''}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Schedule Interview</h1>
          <p style={{ color: 'var(--text-muted)' }}>Rounds auto-progress from the job's pipeline</p>
        </div>
      </div>

      {draftAvailable && (
        <DraftRecoveryBanner savedAt={draftSavedAt} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Job & Candidate */}
        <div className="rounded-xl p-6"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>
            Job &amp; Candidate
          </h2>

          {/* Job select */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>
              Job <span style={{ color: '#FF4757' }}>*</span>
            </label>
            <SearchableSelect
              value={formData.job_id}
              onChange={(val) => setFormData(prev => ({ ...prev, job_id: val }))}
              options={jobs.map(j => ({
                value: j.value,
                label: `${j.title} — ${j.client_name || ''}`,
                searchText: `${j.title} ${j.client_name || ''}`,
              }))}
              placeholder="Search job by title or client…"
              minChars={3}
            />
          </div>

          {/* Pipeline info badge */}
          {formData.job_id && pipelineInfo && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg text-sm"
              style={hasPipeline
                ? { background: 'rgba(67,233,123,0.08)', border: '1px solid rgba(67,233,123,0.25)', color: '#43E97B' }
                : { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }
              }>
              <Layers className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {hasPipeline ? (
                <div>
                  <p className="font-medium">{pipelineInfo.stages.length}-round pipeline detected</p>
                  <p className="text-xs mt-0.5" style={{ opacity: 0.85 }}>
                    {pipelineInfo.stages.map((s, i) => `${i + 1}. ${s.stage_name}`).join(' → ')}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">No pipeline configured for this job</p>
                  <p className="text-xs mt-0.5" style={{ opacity: 0.85 }}>
                    A single "Interview" round will be created.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Candidate select */}
          {formData.job_id && (
            <>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-label)' }}>
                  Candidate <span style={{ color: '#FF4757' }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(m => !m)
                    setValidationResult(null)
                    setFormData(prev => ({ ...prev, application_id: '' }))
                  }}
                  className="flex items-center gap-1 text-xs transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {manualMode
                    ? <><ToggleRight className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Showing all (incl. rejected)</>
                    : <><ToggleLeft className="w-4 h-4" /> Active applicants only</>
                  }
                </button>
              </div>

              {loadingCandidates ? (
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading candidates…</div>
              ) : manualMode ? (
                <select name="application_id" value={formData.application_id} onChange={handleChange}
                  className="input w-full" required>
                  <option value="">Select any candidate ({allApps.length})</option>
                  {allApps.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.candidate_name}
                      {a.status === 'rejected'  ? ' ⚠ rejected'  : ''}
                      {a.status === 'withdrawn' ? ' ⚠ withdrawn' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <select name="application_id" value={formData.application_id} onChange={handleChange}
                  className="input w-full" required>
                  <option value="">Select candidate ({activeApps.length})</option>
                  {activeApps.map(a => (
                    <option key={a.id} value={a.id}>{a.candidate_name}</option>
                  ))}
                </select>
              )}

              {!manualMode && activeApps.length === 0 && !loadingCandidates && (
                <p className="text-sm mt-2" style={{ color: '#F59E0B' }}>
                  No active candidates for this job. Switch to manual mode to see all.
                </p>
              )}

              {/* Smart validation panel */}
              {formData.application_id && (
                <div className="mt-4">
                  <ValidationPanel result={validationResult} loading={validating} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Round 1 Schedule */}
        <div className="rounded-xl p-6"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-heading)' }}>
            Round 1 Schedule
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Set the date and time for the first round. Subsequent rounds are scheduled after each result.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>
                Date <span style={{ color: '#FF4757' }}>*</span>
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
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>
                Time <span style={{ color: '#FF4757' }}>*</span>
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

        {/* Links */}
        <div className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>
            Links
            <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </h2>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>
              Interview / Meeting Link
            </label>
            <input
              type="url"
              name="meeting_link"
              value={formData.meeting_link}
              onChange={handleChange}
              className="input w-full"
              placeholder="https://meet.google.com/…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>
              Assessment / Form Link
            </label>
            <input
              type="url"
              name="assessment_link"
              value={formData.assessment_link}
              onChange={handleChange}
              className="input w-full"
              placeholder="https://forms.example.com/…"
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-xl p-6"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>
            Instructions
            <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </h2>
          <textarea
            name="instructions"
            value={formData.instructions}
            onChange={handleChange}
            className="input w-full"
            rows={3}
            placeholder="Any instructions for the candidate…"
          />
        </div>

        {/* Hard-block summary banner */}
        {isBlocked && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg"
            style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.3)', color: '#FF4757' }}>
            <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Scheduling blocked</p>
              <p className="text-xs mt-0.5" style={{ opacity: 0.85 }}>
                Resolve the issues above before scheduling this interview.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={notifyCandidate}
              onChange={e => setNotifyCandidate(e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: 'var(--accent)' }}
            />
            Notify Candidate by Email
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/interviews')} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling…</>
                : <><Calendar className="w-4 h-4" /> Schedule Interview</>
              }
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default InterviewForm
