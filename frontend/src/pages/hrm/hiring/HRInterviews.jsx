import React, { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Plus, Calendar, History, X, CalendarPlus, FileText } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'
import TableScroll from '../../../components/common/TableScroll'
import SearchableSelect from '../../../components/common/SearchableSelect'
import ActionMenu, { ActionMenuItem } from '../../../components/common/ActionMenu'
import { getTenantTimezone } from '../../../utils/format'

// Loaded once per modal-open rather than per-keystroke — Internal Hiring
// candidate volumes are small, so a single fetch is enough for the search box.
const candidateToOption = (c) => ({
  value: c.id,
  label: `${c.full_name} — ${c.email}`,
  searchText: `${c.full_name} ${c.email}`,
})

const RESULT_COLORS = {
  pending:    'bg-gray-100 text-gray-600',
  passed:     'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
  on_hold:    'bg-yellow-100 text-yellow-700',
  no_show:    'bg-orange-100 text-orange-700',
  cancelled:  'bg-gray-100 text-gray-500',
  rescheduled:'bg-blue-100 text-blue-700',
}

const RESULT_LABELS = {
  pending: 'Pending', passed: 'Passed', failed: 'Failed', on_hold: 'On Hold',
  no_show: 'Absent', cancelled: 'Cancelled', rescheduled: 'Rescheduled',
}

const RATING_FIELDS = [
  ['technical_rating', 'Technical Rating'],
  ['communication_rating', 'Communication Rating'],
  ['problem_solving_rating', 'Problem Solving Rating'],
  ['behaviour_rating', 'Behaviour / Culture Fit Rating'],
]

const emptyScheduleForm = () => ({
  // Job-first flow: HR picks the Job → the candidate list is filtered to that
  // job → rounds come from the job's configured interview_rounds (HR no longer
  // types round names). interviewers = [{id, name, email}] chosen from Active
  // Employees; the round is auto-determined server-side.
  job_id: '', candidate_id: '', mode: 'video',
  date: '', time: '', duration_minutes: 60,
  location_or_link: '', notes: '', interviewers: [],
  send_candidate_email: true, send_interviewer_email: true,
})

// Interview types. `in_person` keeps its stored value but reads "Face-to-Face".
// Each type drives which detail field is shown and required.
const INTERVIEW_TYPES = [
  { value: 'video',     label: 'Video' },
  { value: 'phone',     label: 'Phone' },
  { value: 'in_person', label: 'Face-to-Face' },
  { value: 'online',    label: 'Online' },
]

const MODE_FIELD = {
  video:     { label: 'Meeting Link',    placeholder: 'https://meet.google.com/…', error: 'Meeting link is required for a video interview' },
  online:    { label: 'Meeting Link',    placeholder: 'https://…',                 error: 'Meeting link is required for an online interview' },
  in_person: { label: 'Office Location', placeholder: 'e.g. HQ, 4th Floor, Room 2', error: 'Office location is required for a face-to-face interview' },
  phone:     { label: 'Phone Number',    placeholder: 'e.g. +91 98765 43210',       error: 'Phone number is required for a phone interview' },
}

// Employment statuses that count as "active" staff eligible to interview.
const ACTIVE_EMP_STATUSES = new Set(['active', 'probation', 'notice_period', 'on_leave'])

// Rating field validation — numbers only, 1 to 5. Returns '' when valid (or
// when left blank, since every rating is optional).
const ratingError = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  const n = Number(value)
  if (Number.isNaN(n)) return 'Enter a number'
  if (n < 1 || n > 5) return 'Must be between 1 and 5'
  return ''
}

/**
 * Safely turn an API error into a display string. FastAPI validation errors
 * return `detail` as an ARRAY of objects; passing that straight to toast makes
 * React try to render an object as a child, which throws and trips the global
 * error boundary. Always collapse to a string.
 */
const apiErrorMessage = (err, fallback) => {
  const d = err?.response?.data?.detail
  if (typeof d === 'string' && d.trim()) return d
  if (Array.isArray(d)) {
    const msgs = d.map(x => (typeof x === 'string' ? x : x?.msg)).filter(Boolean)
    if (msgs.length) return msgs.join(', ')
  }
  if (d && typeof d === 'object' && typeof d.msg === 'string') return d.msg
  return fallback
}

const emptyFeedbackForm = () => ({
  interviewer_name: '', technical_rating: '', communication_rating: '',
  problem_solving_rating: '', behaviour_rating: '', overall_rating: '',
  overallTouched: false, feedback: '', result: 'passed', notify_candidate: true,
  rejection_reason: '',
})

// Structured reasons offered when a candidate is failed/rejected (section: Fail flow).
const REJECTION_REASONS = ['Communication', 'Technical', 'Salary', 'Experience', 'Culture Fit', 'Other']

const emptyEditForm = () => ({ scheduled_at: '', duration_minutes: 60, mode: 'video', location_or_link: '' })

// Groups the flat interview list into one entry per candidate — the list UI
// shows a single row per candidate (current round + progress), with a
// History button revealing the full per-round timeline (sections 6/7).
function groupByCandidate(interviews) {
  const map = {}
  for (const iv of interviews) {
    if (!map[iv.candidate_id]) {
      map[iv.candidate_id] = {
        candidate_id: iv.candidate_id,
        candidate_name: iv.candidate_name,
        job_id: iv.job_id,
        job_title: iv.job_title,
        byRound: {},
        all: [],
      }
    }
    map[iv.candidate_id].byRound[iv.round_number] = iv
    map[iv.candidate_id].all.push(iv)
  }
  return Object.values(map).map(g => {
    const sorted = [...g.all].sort((a, b) => a.round_number - b.round_number)
    return { ...g, all: sorted, current: sorted[sorted.length - 1] }
  })
}

function overallStatus(group, totalRounds) {
  const r = group.current?.result
  if (r === 'failed') return { label: 'Rejected', color: 'bg-red-100 text-red-700' }
  if (r === 'on_hold') return { label: 'On Hold', color: 'bg-yellow-100 text-yellow-700' }
  if (r === 'no_show') return { label: 'Absent', color: 'bg-orange-100 text-orange-700' }
  if (r === 'cancelled') return { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' }
  if (r === 'passed' && group.current.round_number >= totalRounds) return { label: 'Completed', color: 'bg-green-100 text-green-700' }
  return { label: 'In Progress', color: 'bg-blue-100 text-blue-700' }
}

// Section 8 — timeline-style progress instead of plain round names, e.g.
// "✔ Round 1 Completed", "🟡 Round 2 Scheduled", "⚪ Round 3 Pending", with
// the current round clearly highlighted.
function ProgressTimeline({ group, roundNames }) {
  return (
    <div className="flex flex-col gap-1">
      {roundNames.map((name, i) => {
        const roundNum = i + 1
        const iv = group.byRound[roundNum]
        const isCurrent = roundNum === group.current.round_number
        let symbol = '⚪', label = 'Pending', color = 'text-gray-400'
        if (iv?.result === 'passed')      { symbol = '✔'; label = 'Completed'; color = 'text-green-600' }
        else if (iv?.result === 'pending')   { symbol = '🟡'; label = 'Scheduled'; color = 'text-yellow-600' }
        else if (iv?.result === 'on_hold')   { symbol = '🟡'; label = 'On Hold'; color = 'text-yellow-600' }
        else if (iv?.result === 'no_show')   { symbol = '🟡'; label = 'Absent'; color = 'text-orange-600' }
        else if (iv?.result === 'failed')    { symbol = '✕'; label = 'Failed'; color = 'text-red-600' }
        else if (iv?.result === 'cancelled') { symbol = '⚪'; label = 'Cancelled'; color = 'text-gray-400' }
        return (
          <span
            key={roundNum}
            className={`text-xs whitespace-nowrap px-1.5 py-0.5 rounded ${color} ${isCurrent ? 'font-semibold bg-blue-50' : ''}`}
          >
            {symbol} Round {roundNum} {label} — {name}
          </span>
        )
      })}
    </div>
  )
}

export default function HRInterviews() {
  const [interviews, setInterviews] = useState([])
  const [jobsById, setJobsById]     = useState({})
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(emptyScheduleForm())
  const [nextRoundInfo, setNextRoundInfo] = useState(null)
  const [nextRoundLoading, setNextRoundLoading] = useState(false)
  const [feedbackModal, setFeedbackModal] = useState(null)
  const [fbForm, setFbForm] = useState(emptyFeedbackForm())
  const [editModal, setEditModal] = useState(null) // { interview, action: 'edit' | 'reschedule' }
  const [editForm, setEditForm] = useState(emptyEditForm())
  const [passPrompt, setPassPrompt] = useState(null) // { candidateId, candidateName, nextRound }
  const [historyGroup, setHistoryGroup] = useState(null)
  const [feedbackViewModal, setFeedbackViewModal] = useState(null) // recorded feedback (read-only)
  const [candidateOptions, setCandidateOptions] = useState([])
  const [candLoading, setCandLoading] = useState(false)
  // Job-first flow support: the list of open jobs for the Job picker and the
  // list of Active Employees for the interviewer picker (loaded on modal open).
  const [jobOptions, setJobOptions] = useState([])
  const [activeEmployees, setActiveEmployees] = useState([])
  const [refLoading, setRefLoading] = useState(false)
  // candidate_id → their interview_pipeline ([{round_number, round_name}]) so
  // the progress timeline can show the full pipeline (snapshotted from the job).
  const [pipelineByCandidate, setPipelineByCandidate] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const [ivRes, jobsRes, candRes] = await Promise.all([
        hrmService.listInterviews({ page: 1, page_size: 200 }),
        hrmService.listJobs({ page: 1, page_size: 200 }),
        hrmService.listHiringCandidates({ page: 1, page_size: 200 }),
      ])
      setInterviews(ivRes.data.items || [])
      setJobsById(Object.fromEntries((jobsRes.data.items || []).map(j => [j.id, j])))
      setPipelineByCandidate(Object.fromEntries(
        (candRes.data.items || [])
          .filter(c => Array.isArray(c.interview_pipeline) && c.interview_pipeline.length)
          .map(c => [c.id, c.interview_pipeline])
      ))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const groups = useMemo(() => groupByCandidate(interviews), [interviews])

  // Load the pickers a schedule modal needs: open jobs + active employees.
  // The two are loaded independently on purpose — a failure fetching one must
  // never leave the other silently empty (which reads as "nothing exists").
  // page_size is capped at the API maximum (200); asking for more is a 422.
  const loadFormRefData = async () => {
    setRefLoading(true)
    const [jobsRes, empRes] = await Promise.allSettled([
      hrmService.listJobs({ page: 1, page_size: 200 }),
      hrmService.listEmployees({ page: 1, page_size: 200 }),
    ])

    if (jobsRes.status === 'fulfilled') {
      setJobOptions((jobsRes.value.data.items || [])
        .filter(j => j.status === 'open')
        .map(j => ({ value: j.id, label: j.job_title, job: j })))
    } else {
      setJobOptions([])
      toast.error('Could not load jobs. Please try again.')
    }

    if (empRes.status === 'fulfilled') {
      setActiveEmployees((empRes.value.data.items || [])
        .filter(e => ACTIVE_EMP_STATUSES.has(e.employment_status))
        .map(e => ({
          id: e.id, name: e.full_name, email: e.email || '',
          designation: e.designation_name || '', department: e.department_name || '',
        })))
    } else {
      setActiveEmployees([])
      toast.error('Could not load employees. Please try again.')
    }
    setRefLoading(false)
  }

  const openForm = async () => {
    setForm(emptyScheduleForm())
    setNextRoundInfo(null)
    setCandidateOptions([])
    setShowForm(true)
    loadFormRefData()
  }

  const openFormForCandidate = async (candidateId, candidateName, email) => {
    setNextRoundInfo(null)
    setShowForm(true)
    await loadFormRefData()
    // Derive the candidate's job so the job-first form is pre-filled correctly.
    let jobId = ''
    try {
      const res = await hrmService.getHiringCandidate(candidateId)
      jobId = res.data?.job_id || ''
    } catch {}
    setForm({ ...emptyScheduleForm(), job_id: jobId, candidate_id: candidateId })
    if (jobId) await loadCandidatesForJob(jobId, candidateId, candidateName, email)
    else setCandidateOptions([{ value: candidateId, label: `${candidateName} — ${email || ''}`, searchText: `${candidateName} ${email || ''}` }])
    loadNextRound(candidateId)
  }

  const loadCandidatesForJob = async (jobId, keepId, keepName, keepEmail) => {
    setCandLoading(true)
    try {
      const res = await hrmService.listHiringCandidates({ page: 1, page_size: 200, job_id: jobId })
      let opts = (res.data.items || []).map(candidateToOption)
      // Ensure a pre-selected candidate (from the "schedule next round" flow)
      // stays selectable even if the filter would exclude them.
      if (keepId && !opts.some(o => o.value === keepId)) {
        opts = [...opts, { value: keepId, label: `${keepName} — ${keepEmail || ''}`, searchText: `${keepName} ${keepEmail || ''}` }]
      }
      setCandidateOptions(opts)
    } catch {}
    setCandLoading(false)
  }

  const handleSelectJob = (jobId) => {
    // New job → reset candidate + round; reload the candidate list for the job.
    setForm(f => ({ ...f, job_id: jobId, candidate_id: '' }))
    setNextRoundInfo(null)
    setCandidateOptions([])
    if (jobId) loadCandidatesForJob(jobId)
  }

  const loadNextRound = async (candidateId) => {
    if (!candidateId) { setNextRoundInfo(null); return }
    setNextRoundLoading(true)
    try {
      const res = await hrmService.getNextRound(candidateId)
      setNextRoundInfo(res.data)
    } catch (err) {
      setNextRoundInfo(null)
      toast.error(err?.response?.data?.detail || 'Could not determine the next round for this candidate')
    }
    setNextRoundLoading(false)
  }

  const handleSelectCandidate = (candidateId) => {
    setForm(f => ({ ...f, candidate_id: candidateId }))
    loadNextRound(candidateId)
  }

  const toggleInterviewer = (emp) => {
    setForm(f => {
      const has = f.interviewers.some(i => i.id === emp.id)
      return { ...f, interviewers: has ? f.interviewers.filter(i => i.id !== emp.id) : [...f.interviewers, emp] }
    })
  }

  const selectedJob = useMemo(() => jobOptions.find(j => j.value === form.job_id)?.job, [jobOptions, form.job_id])
  const jobRounds = selectedJob?.interview_rounds || []

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.job_id)       { toast.error('Please select a job'); return }
    if (!form.candidate_id) { toast.error('Please select a candidate'); return }
    if (!form.interviewers.length) { toast.error('Please select at least one interviewer'); return }
    if (!form.date) { toast.error('Please pick a date'); return }
    if (!form.time) { toast.error('Please pick a time'); return }
    // Type-driven detail field is mandatory (link / location / phone).
    const modeField = MODE_FIELD[form.mode] || MODE_FIELD.video
    if (!form.location_or_link.trim()) { toast.error(modeField.error); return }

    const payload = {
      candidate_id: form.candidate_id,
      job_id: form.job_id,
      mode: form.mode,
      scheduled_at: `${form.date}T${form.time}`,
      duration_minutes: form.duration_minutes,
      location_or_link: form.location_or_link.trim(),
      notes: form.notes.trim() || null,
      send_candidate_email: form.send_candidate_email,
      send_interviewer_email: form.send_interviewer_email,
      interviewers: form.interviewers.map(i => ({ id: i.id, name: i.name, email: i.email })),
    }
    setSaving(true)
    try {
      await hrmService.createInterview(payload)
      toast.success('Interview scheduled')
      setShowForm(false); load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to schedule interview')
    }
    setSaving(false)
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  const openFeedback = (iv) => {
    setFeedbackModal(iv)
    setFbForm(emptyFeedbackForm())
  }

  const handleRatingChange = (field, value) => {
    setFbForm(f => {
      const next = { ...f, [field]: value, [`${field}_error`]: ratingError(value) }
      if (!next.overallTouched) {
        // Average only the sub-ratings that actually hold a number. Each raw
        // value is filtered BEFORE converting, so the key stays in scope.
        const vals = RATING_FIELDS
          .map(([k]) => next[k])
          .filter(raw => raw !== '' && raw !== null && raw !== undefined)
          .map(Number)
          .filter(n => !Number.isNaN(n))
        next.overall_rating = vals.length
          ? String(Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10)
          : ''
      }
      return next
    })
  }

  const handleFeedback = async (e) => {
    e.preventDefault()
    if (!fbForm.result) { toast.error('Please select a recommendation'); return }
    if (!fbForm.feedback.trim()) { toast.error('Feedback comments are required'); return }
    if (!fbForm.interviewer_name.trim()) { toast.error('Please select an interviewer'); return }
    if (fbForm.result === 'failed' && !fbForm.rejection_reason) { toast.error('Please select a rejection reason'); return }

    // Ratings are optional, but any value provided must be a number from 1-5.
    // Surfaced inline per field rather than as an unhandled failure.
    const ratingErrors = {}
    for (const [key] of RATING_FIELDS) ratingErrors[`${key}_error`] = ratingError(fbForm[key])
    ratingErrors.overall_rating_error = ratingError(fbForm.overall_rating)
    if (Object.values(ratingErrors).some(Boolean)) {
      setFbForm(f => ({ ...f, ...ratingErrors }))
      toast.error('Ratings must be between 1 and 5')
      return
    }

    setSaving(true)
    try {
      const res = await hrmService.submitInterviewFeedback(feedbackModal.id, {
        result: fbForm.result,
        feedback: fbForm.feedback.trim(),
        interviewer_name: fbForm.interviewer_name.trim(),
        rejection_reason: fbForm.result === 'failed' ? fbForm.rejection_reason : undefined,
        rating: fbForm.overall_rating ? Number(fbForm.overall_rating) : undefined,
        technical_rating: fbForm.technical_rating ? Number(fbForm.technical_rating) : undefined,
        communication_rating: fbForm.communication_rating ? Number(fbForm.communication_rating) : undefined,
        problem_solving_rating: fbForm.problem_solving_rating ? Number(fbForm.problem_solving_rating) : undefined,
        behaviour_rating: fbForm.behaviour_rating ? Number(fbForm.behaviour_rating) : undefined,
        notify_candidate: fbForm.notify_candidate,
      })
      setFeedbackModal(null)
      const { result, candidate_name, candidate_id, next_round } = res.data
      await load()
      if (result === 'passed') {
        setPassPrompt({ candidateId: candidate_id, candidateName: candidate_name, nextRound: next_round })
      } else if (result === 'failed') {
        toast.success(`${candidate_name} marked Rejected`)
      } else if (result === 'no_show') {
        toast.success(`${candidate_name} marked Absent — you can reschedule or reject later`)
      } else {
        toast.success('Feedback saved — candidate remains On Hold')
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to submit feedback'))
    }
    setSaving(false)
  }

  // ── Edit / Reschedule ────────────────────────────────────────────────────

  const openEdit = (iv, action) => {
    setEditModal({ interview: iv, action })
    setEditForm({
      scheduled_at: iv.scheduled_at ? iv.scheduled_at.slice(0, 16) : '',
      duration_minutes: iv.duration_minutes,
      mode: iv.mode,
      location_or_link: iv.location_or_link || '',
    })
  }

  const handleUpdateInterview = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = editModal.action === 'reschedule'
        ? { scheduled_at: editForm.scheduled_at }
        : editForm
      await hrmService.updateInterview(editModal.interview.id, payload)
      toast.success(editModal.action === 'reschedule' ? 'Interview rescheduled' : 'Interview updated')
      setEditModal(null); load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update interview')
    }
    setSaving(false)
  }

  const handleCancelInterview = async (iv) => {
    if (!window.confirm(`Cancel the ${iv.round_name} interview for ${iv.candidate_name}?`)) return
    try {
      await hrmService.cancelInterview(iv.id)
      toast.success('Interview cancelled')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel interview')
    }
  }

  const fmtFull = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { timeZone: getTenantTimezone(), day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

  const roundNamesFor = (group) => {
    // Priority: candidate's recruiter-defined pipeline → job's configured
    // rounds → the names of the rounds actually scheduled so far (legacy).
    const pipeline = pipelineByCandidate[group.candidate_id]
    if (pipeline?.length) {
      return [...pipeline].sort((a, b) => a.round_number - b.round_number).map(r => r.round_name)
    }
    const job = jobsById[group.job_id]
    if (job?.interview_rounds?.length) {
      return [...job.interview_rounds].sort((a, b) => a.round_number - b.round_number).map(r => r.round_name)
    }
    return group.all.map(iv => iv.round_name)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
          <p className="text-sm text-gray-500">{groups.length} candidate{groups.length !== 1 ? 's' : ''} in interview pipeline</p>
        </div>
        <button onClick={openForm} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Schedule Interview
        </button>
      </div>

      {/* Schedule modal — job-first flow */}
      <ModalPortal isOpen={showForm}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Schedule Interview</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6 overflow-y-auto">
              {/* ── Position & Candidate ─────────────────────────────────── */}
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Position & Candidate</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Job <span className="text-red-500">*</span></label>
                    {refLoading ? (
                      <p className="mt-1 text-sm text-gray-400 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">Loading jobs…</p>
                    ) : jobOptions.length === 0 ? (
                      <p className="mt-1 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        No active jobs available. Create a job first.
                      </p>
                    ) : (
                      <SearchableSelect
                        value={form.job_id}
                        onChange={handleSelectJob}
                        options={jobOptions}
                        placeholder="Select an open job…"
                        minChars={0}
                        className="mt-1"
                      />
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Candidate <span className="text-red-500">*</span></label>
                    {!form.job_id ? (
                      <p className="mt-1 text-sm text-gray-400 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">Select a job first</p>
                    ) : (
                      <>
                        <SearchableSelect
                          value={form.candidate_id}
                          onChange={handleSelectCandidate}
                          options={candidateOptions}
                          placeholder={candLoading ? 'Loading candidates…' : 'Search by name or email…'}
                          minChars={0}
                          className="mt-1"
                        />
                        {!candLoading && candidateOptions.length === 0 && (
                          <p className="text-xs text-gray-400 mt-1">No candidates have applied to this job yet.</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Read-only stage + auto round */}
                {form.candidate_id && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Current Stage</label>
                      <p className="mt-1 text-sm capitalize bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700">
                        {nextRoundLoading ? 'Loading…' : (nextRoundInfo?.current_stage?.replace(/_/g, ' ') || '—')}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Next Interview Round</label>
                      <p className="mt-1 text-sm bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 font-medium text-indigo-800">
                        {nextRoundLoading ? 'Determining…'
                          : nextRoundInfo ? `Round ${nextRoundInfo.round_number} — ${nextRoundInfo.round_name}` : '—'}
                      </p>
                    </div>
                    {jobRounds.length > 0 && (
                      <p className="sm:col-span-2 text-xs text-gray-400 -mt-1">
                        Configured rounds for this job: {[...jobRounds].sort((a, b) => a.round_number - b.round_number).map(r => r.round_name).join(' → ')}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* ── Panel ───────────────────────────────────────────────── */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Interview Panel</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700">Interviewer <span className="text-red-500">*</span></label>
                  {form.interviewers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {form.interviewers.map(iv => (
                        <span key={iv.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs rounded-full pl-2.5 pr-1.5 py-1">
                          {iv.name}
                          <button type="button" onClick={() => toggleInterviewer(iv)} className="hover:text-indigo-900" aria-label={`Remove ${iv.name}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-gray-100">
                    {refLoading ? (
                      <p className="text-sm text-gray-400 px-3 py-2.5">Loading employees…</p>
                    ) : activeEmployees.length === 0 ? (
                      <p className="text-sm text-gray-400 px-3 py-2.5">No active employees available.</p>
                    ) : activeEmployees.map(emp => {
                      const checked = form.interviewers.some(i => i.id === emp.id)
                      const sub = [emp.designation, emp.department].filter(Boolean).join(' · ')
                      return (
                        <label key={emp.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => toggleInterviewer(emp)} className="shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-gray-900 truncate">{emp.name}</span>
                            {sub && <span className="block text-xs text-gray-500 truncate">{sub}</span>}
                          </span>
                          {!emp.email && <span className="text-[10px] text-gray-400 shrink-0">no email</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </section>

              {/* ── Schedule ────────────────────────────────────────────── */}
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Schedule</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Interview Type <span className="text-red-500">*</span></label>
                    <select className="input w-full mt-1" value={form.mode}
                      onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                      {INTERVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Date <span className="text-red-500">*</span></label>
                    <input type="date" className="input w-full mt-1" value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Time <span className="text-red-500">*</span></label>
                    <input type="time" className="input w-full mt-1" value={form.time}
                      onChange={e => setForm(f => ({ ...f, time: e.target.value }))} required />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Duration (min) <span className="text-red-500">*</span></label>
                    <input type="number" min="5" step="5" className="input w-full mt-1" value={form.duration_minutes}
                      onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-gray-700">
                      {(MODE_FIELD[form.mode] || MODE_FIELD.video).label} <span className="text-red-500">*</span>
                    </label>
                    <input className="input w-full mt-1" value={form.location_or_link}
                      onChange={e => setForm(f => ({ ...f, location_or_link: e.target.value }))}
                      placeholder={(MODE_FIELD[form.mode] || MODE_FIELD.video).placeholder} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Notes</label>
                  <textarea rows={2} className="input w-full mt-1" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Anything the panel should know before the interview (optional)" />
                </div>
              </section>

              {/* ── Notifications ───────────────────────────────────────── */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email Notifications</h3>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.send_candidate_email}
                    onChange={e => setForm(f => ({ ...f, send_candidate_email: e.target.checked }))} />
                  Send Email to Candidate
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.send_interviewer_email}
                    onChange={e => setForm(f => ({ ...f, send_interviewer_email: e.target.checked }))} />
                  Send Email to Interviewer
                </label>
              </section>

              {/* ── Summary ─────────────────────────────────────────────── */}
              {form.candidate_id && nextRoundInfo && (
                <div className="rounded-lg p-3 text-xs border border-indigo-100 bg-indigo-50/50 space-y-1">
                  <p className="font-semibold text-indigo-800 mb-1">Summary</p>
                  <p><span className="text-gray-500">Job:</span> {selectedJob?.job_title || '—'}</p>
                  <p><span className="text-gray-500">Round:</span> Round {nextRoundInfo.round_number} — {nextRoundInfo.round_name}</p>
                  <p><span className="text-gray-500">Type:</span> {(INTERVIEW_TYPES.find(t => t.value === form.mode) || {}).label}</p>
                  <p><span className="text-gray-500">When:</span> {form.date && form.time
                    ? new Date(`${form.date}T${form.time}`).toLocaleString('en-IN', { timeZone: getTenantTimezone(), day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'} ({form.duration_minutes} min)</p>
                  <p><span className="text-gray-500">Interviewers:</span> {form.interviewers.length ? form.interviewers.map(i => i.name).join(', ') : 'None'}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Scheduling…' : 'Schedule Interview'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* Feedback modal */}
      <ModalPortal isOpen={!!feedbackModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <form onSubmit={handleFeedback} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Submit Feedback</h2>

            <div className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-200 grid grid-cols-2 gap-2">
              <p><span className="text-gray-500">Candidate:</span> <span className="font-medium text-gray-900">{feedbackModal?.candidate_name}</span></p>
              <p><span className="text-gray-500">Job:</span> <span className="font-medium text-gray-900">{feedbackModal?.job_title || '—'}</span></p>
              <p><span className="text-gray-500">Current Round:</span> <span className="font-medium text-gray-900">Round {feedbackModal?.round_number} — {feedbackModal?.round_name}</span></p>
              <p><span className="text-gray-500">Date & Time:</span> <span className="font-medium text-gray-900">{fmtFull(feedbackModal?.scheduled_at)}</span></p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Interviewer *</label>
              <input className="input w-full mt-1" value={fbForm.interviewer_name} onChange={e => setFbForm(f => ({ ...f, interviewer_name: e.target.value }))} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {RATING_FIELDS.map(([key, label]) => (
                <div key={key}>
                  <label className="text-sm font-medium text-gray-700">{label} (1-5)</label>
                  <input type="number" min="1" max="5" step="0.5" className="input w-full mt-1"
                    value={fbForm[key]} onChange={e => handleRatingChange(key, e.target.value)} />
                  {fbForm[`${key}_error`] && <p className="text-xs text-red-600 mt-1">{fbForm[`${key}_error`]}</p>}
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Overall Rating (auto-averaged, editable)</label>
              <input type="number" min="1" max="5" step="0.1" className="input w-full mt-1"
                value={fbForm.overall_rating}
                onChange={e => setFbForm(f => ({
                  ...f,
                  overall_rating: e.target.value,
                  overall_rating_error: ratingError(e.target.value),
                  overallTouched: true,
                }))} />
              {fbForm.overall_rating_error && <p className="text-xs text-red-600 mt-1">{fbForm.overall_rating_error}</p>}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Feedback Comments *</label>
              <textarea className="input w-full mt-1" rows={3} value={fbForm.feedback} onChange={e => setFbForm(f => ({ ...f, feedback: e.target.value }))} required />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Decision *</label>
              <select className="input w-full mt-1" value={fbForm.result} onChange={e => setFbForm(f => ({ ...f, result: e.target.value }))} required>
                <option value="passed">Pass</option>
                <option value="failed">Fail / Reject</option>
                <option value="on_hold">On Hold</option>
                <option value="no_show">Absent</option>
              </select>
            </div>

            {/* Rejection reason — required on Fail/Reject (section: Fail flow) */}
            {fbForm.result === 'failed' && (
              <div>
                <label className="text-sm font-medium text-gray-700">Reason *</label>
                <select className="input w-full mt-1" value={fbForm.rejection_reason}
                  onChange={e => setFbForm(f => ({ ...f, rejection_reason: e.target.value }))} required>
                  <option value="">Select a reason…</option>
                  {REJECTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={fbForm.notify_candidate} onChange={e => setFbForm(f => ({ ...f, notify_candidate: e.target.checked }))} />
              Notify Candidate
            </label>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setFeedbackModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Feedback'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* Pass confirmation — offer to schedule next round now (section 3) */}
      <ModalPortal isOpen={!!passPrompt}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl text-center">
            <h2 className="text-lg font-semibold text-gray-900">Candidate passed this round.</h2>
            {passPrompt?.nextRound ? (
              <>
                <p className="text-sm text-gray-500 mt-2">Would you like to schedule the next round?</p>
                <div className="flex justify-center gap-3 mt-5">
                  <button className="btn-secondary" onClick={() => setPassPrompt(null)}>Later</button>
                  <button className="btn-primary" onClick={() => {
                    const p = passPrompt; setPassPrompt(null)
                    openFormForCandidate(p.candidateId, p.candidateName)
                  }}>Schedule Now</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mt-2">This was the final round. <span className="font-medium text-gray-700">Candidate Selected?</span></p>
                <div className="flex justify-center gap-3 mt-5">
                  <button className="btn-secondary" onClick={async () => {
                    const p = passPrompt; setPassPrompt(null)
                    try {
                      await hrmService.updateHiringCandidate(p.candidateId, { current_stage: 'rejected' })
                      toast.success(`${p.candidateName} marked Rejected`)
                      load()
                    } catch (err) {
                      toast.error(err?.response?.data?.detail || 'Failed to update candidate')
                    }
                  }}>No</button>
                  <button className="btn-primary" onClick={() => { setPassPrompt(null); toast.success('Candidate selected — moved to Offer stage') }}>Yes — Move to Offer</button>
                </div>
              </>
            )}
          </div>
        </div>
      </ModalPortal>

      {/* Edit / Reschedule modal */}
      <ModalPortal isOpen={!!editModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleUpdateInterview} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">{editModal?.action === 'reschedule' ? 'Reschedule Interview' : 'Edit Interview'}</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Scheduled At *</label>
              <input type="datetime-local" className="input w-full mt-1" value={editForm.scheduled_at} onChange={e => setEditForm(f => ({ ...f, scheduled_at: e.target.value }))} required />
            </div>
            {editModal?.action === 'edit' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Interview Type</label>
                  <select className="input w-full mt-1" value={editForm.mode} onChange={e => setEditForm(f => ({ ...f, mode: e.target.value }))}>
                    {INTERVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Duration (min)</label>
                  <input type="number" className="input w-full mt-1" value={editForm.duration_minutes} onChange={e => setEditForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">Meeting Link / Location</label>
                  <input className="input w-full mt-1" value={editForm.location_or_link} onChange={e => setEditForm(f => ({ ...f, location_or_link: e.target.value }))} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* History modal */}
      <ModalPortal isOpen={!!historyGroup}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Interview History — {historyGroup?.candidate_name}</h2>
              <button onClick={() => setHistoryGroup(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              {historyGroup?.all.map(iv => (
                <div key={iv.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">Round {iv.round_number} — {iv.round_name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_COLORS[iv.result] || ''}`}>{RESULT_LABELS[iv.result] || iv.result}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500 text-xs">
                    <p>Interviewer: <span className="text-gray-700">{iv.interviewer_name || '—'}</span></p>
                    <p>Scheduled Time: <span className="text-gray-700">{fmtFull(iv.scheduled_at)}</span></p>
                    <p>Completed Time: <span className="text-gray-700">{fmtFull(iv.completed_at)}</span></p>
                    {iv.rejection_reason && <p>Reject Reason: <span className="text-gray-700">{iv.rejection_reason}</span></p>}
                    <p>Mail Sent: <span className="text-gray-700">{iv.invitation_email_sent ? 'Invitation' : ''}{iv.invitation_email_sent && iv.result_email_sent ? ', ' : ''}{iv.result_email_sent ? 'Result' : ''}{!iv.invitation_email_sent && !iv.result_email_sent ? 'None' : ''}</span></p>
                  </div>
                  {(iv.technical_rating != null || iv.communication_rating != null || iv.problem_solving_rating != null || iv.behaviour_rating != null || iv.rating != null) && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-500 text-xs mt-1">
                      {iv.technical_rating != null && <p>Technical: <span className="text-gray-700">{iv.technical_rating}/5</span></p>}
                      {iv.communication_rating != null && <p>Communication: <span className="text-gray-700">{iv.communication_rating}/5</span></p>}
                      {iv.problem_solving_rating != null && <p>Problem Solving: <span className="text-gray-700">{iv.problem_solving_rating}/5</span></p>}
                      {iv.behaviour_rating != null && <p>Behaviour: <span className="text-gray-700">{iv.behaviour_rating}/5</span></p>}
                      {iv.rating != null && <p className="font-medium">Overall: <span className="text-gray-700">{iv.rating}/5</span></p>}
                    </div>
                  )}
                  {iv.feedback && <p className="mt-2 text-xs text-gray-600">{iv.feedback}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* Interview Feedback — recorded feedback for the latest round (read-only) */}
      <ModalPortal isOpen={!!feedbackViewModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Interview Feedback — {feedbackViewModal?.candidate_name}</h2>
              <button onClick={() => setFeedbackViewModal(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            {feedbackViewModal && (
              <div className="border border-gray-200 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">
                    Round {feedbackViewModal.round_number} — {feedbackViewModal.round_name}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_COLORS[feedbackViewModal.result] || ''}`}>
                    {RESULT_LABELS[feedbackViewModal.result] || feedbackViewModal.result}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500 text-xs">
                  <p>Interviewer: <span className="text-gray-700">{feedbackViewModal.interviewer_name || '—'}</span></p>
                  <p>Scheduled Time: <span className="text-gray-700">{fmtFull(feedbackViewModal.scheduled_at)}</span></p>
                  <p>Completed Time: <span className="text-gray-700">{fmtFull(feedbackViewModal.completed_at)}</span></p>
                  {feedbackViewModal.rejection_reason && (
                    <p>Reject Reason: <span className="text-gray-700">{feedbackViewModal.rejection_reason}</span></p>
                  )}
                </div>
                {(feedbackViewModal.technical_rating != null || feedbackViewModal.communication_rating != null
                  || feedbackViewModal.problem_solving_rating != null || feedbackViewModal.behaviour_rating != null
                  || feedbackViewModal.rating != null) && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-500 text-xs mt-2">
                    {feedbackViewModal.technical_rating != null && <p>Technical: <span className="text-gray-700">{feedbackViewModal.technical_rating}/5</span></p>}
                    {feedbackViewModal.communication_rating != null && <p>Communication: <span className="text-gray-700">{feedbackViewModal.communication_rating}/5</span></p>}
                    {feedbackViewModal.problem_solving_rating != null && <p>Problem Solving: <span className="text-gray-700">{feedbackViewModal.problem_solving_rating}/5</span></p>}
                    {feedbackViewModal.behaviour_rating != null && <p>Behaviour: <span className="text-gray-700">{feedbackViewModal.behaviour_rating}/5</span></p>}
                    {feedbackViewModal.rating != null && <p className="font-medium">Overall: <span className="text-gray-700">{feedbackViewModal.rating}/5</span></p>}
                  </div>
                )}
                {feedbackViewModal.strengths && (
                  <p className="mt-2 text-xs text-gray-600"><span className="text-gray-400">Strengths:</span> {feedbackViewModal.strengths}</p>
                )}
                {feedbackViewModal.weaknesses && (
                  <p className="mt-1 text-xs text-gray-600"><span className="text-gray-400">Areas to improve:</span> {feedbackViewModal.weaknesses}</p>
                )}
                {feedbackViewModal.feedback && <p className="mt-2 text-xs text-gray-600">{feedbackViewModal.feedback}</p>}
              </div>
            )}
          </div>
        </div>
      </ModalPortal>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Candidate', 'Current Round', 'Progress', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : groups.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />No interviews scheduled
              </td></tr>
            ) : groups.map(g => {
              const job = jobsById[g.job_id]
              const totalRounds = job?.interview_rounds?.length || g.all.length
              const status = overallStatus(g, totalRounds)
              const roundNames = roundNamesFor(g)
              const isPending = g.current.result === 'pending'
              // A completed round is resumable when the candidate passed and the
              // configured pipeline still has a round left. This is what makes
              // "Later" on the pass prompt safe — the next round stays reachable
              // from the actions menu instead of being lost.
              const canScheduleNext = !isPending
                && g.current.result === 'passed'
                && g.current.round_number < roundNames.length
              // Feedback already recorded on the latest round (view-only).
              const hasFeedback = !isPending && !!g.current.result && g.current.result !== 'cancelled'
              return (
                <tr key={g.candidate_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 align-top">{g.candidate_name}</td>
                  <td className="px-4 py-3 text-gray-600 align-top">Round {g.current.round_number} — {g.current.round_name}</td>
                  <td className="px-4 py-3 align-top"><ProgressTimeline group={g} roundNames={roundNames} /></td>
                  <td className="px-4 py-3 align-top">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ActionMenu>
                      {(close) => (
                        <>
                          <ActionMenuItem label="View History" icon={History} onClick={() => { setHistoryGroup(g); close() }} />
                          {isPending && (
                            <>
                              <ActionMenuItem divider />
                              <ActionMenuItem label="Submit Feedback" onClick={() => { openFeedback(g.current); close() }} />
                              <ActionMenuItem label="Edit Interview" onClick={() => { openEdit(g.current, 'edit'); close() }} />
                              <ActionMenuItem label="Reschedule Interview" onClick={() => { openEdit(g.current, 'reschedule'); close() }} />
                              <ActionMenuItem divider />
                              <ActionMenuItem label="Cancel Interview" danger onClick={() => { handleCancelInterview(g.current); close() }} />
                            </>
                          )}
                          {!isPending && (hasFeedback || canScheduleNext) && (
                            <>
                              <ActionMenuItem divider />
                              {canScheduleNext && (
                                <ActionMenuItem
                                  label="Schedule Next Round" icon={CalendarPlus}
                                  onClick={() => { openFormForCandidate(g.candidate_id, g.candidate_name); close() }}
                                />
                              )}
                              {hasFeedback && (
                                <ActionMenuItem
                                  label="Interview Feedback" icon={FileText}
                                  onClick={() => { setFeedbackViewModal(g.current); close() }}
                                />
                              )}
                            </>
                          )}
                        </>
                      )}
                    </ActionMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </TableScroll>
      </div>
    </div>
  )
}
