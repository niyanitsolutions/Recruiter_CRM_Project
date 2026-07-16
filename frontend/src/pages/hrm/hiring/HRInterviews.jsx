import React, { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Plus, Calendar, History, X } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'
import TableScroll from '../../../components/common/TableScroll'
import SearchableSelect from '../../../components/common/SearchableSelect'
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
  rescheduled:'bg-blue-100 text-blue-700',
}

const emptyScheduleForm = () => ({
  candidate_id: '', mode: 'video', scheduled_at: '', duration_minutes: 60,
  location_or_link: '', send_invitation_email: true,
})

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
  if (r === 'passed' && group.current.round_number >= totalRounds) return { label: 'Completed', color: 'bg-green-100 text-green-700' }
  return { label: 'In Progress', color: 'bg-blue-100 text-blue-700' }
}

function ProgressDots({ group, roundNames }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {roundNames.map((name, i) => {
        const roundNum = i + 1
        const iv = group.byRound[roundNum]
        let symbol = '○', color = 'text-gray-300'
        if (iv?.result === 'passed') { symbol = '✓'; color = 'text-green-500' }
        else if (iv?.result === 'pending') { symbol = '🟡'; color = 'text-yellow-500' }
        else if (iv?.result === 'on_hold') { symbol = '🟡'; color = 'text-yellow-500' }
        else if (iv?.result === 'failed') { symbol = '✕'; color = 'text-red-500' }
        return (
          <span key={roundNum} className={`text-xs ${color} whitespace-nowrap`} title={name}>
            {symbol} {name}
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
  const [fbForm, setFbForm] = useState({ result: 'passed', feedback: '', rating: '', notify_candidate: true })
  const [historyGroup, setHistoryGroup] = useState(null)
  const [candidateOptions, setCandidateOptions] = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const [ivRes, jobsRes] = await Promise.all([
        hrmService.listInterviews({ page: 1, page_size: 200 }),
        hrmService.listJobs({ page: 1, page_size: 200 }),
      ])
      setInterviews(ivRes.data.items || [])
      setJobsById(Object.fromEntries((jobsRes.data.items || []).map(j => [j.id, j])))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const groups = useMemo(() => groupByCandidate(interviews), [interviews])

  const openForm = async () => {
    setForm(emptyScheduleForm())
    setNextRoundInfo(null)
    setShowForm(true)
    try {
      const res = await hrmService.listHiringCandidates({ page: 1, page_size: 200 })
      setCandidateOptions((res.data.items || []).map(candidateToOption))
    } catch {}
  }

  const openFormForCandidate = (candidateId, candidateName, email) => {
    setForm({ ...emptyScheduleForm(), candidate_id: candidateId })
    setCandidateOptions(prev => prev.some(o => o.value === candidateId)
      ? prev
      : [...prev, { value: candidateId, label: `${candidateName} — ${email || ''}`, searchText: `${candidateName} ${email || ''}` }])
    setShowForm(true)
    loadNextRound(candidateId)
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

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.candidate_id) {
      toast.error('Please select a candidate')
      return
    }
    setSaving(true)
    try {
      await hrmService.createInterview(form)
      toast.success('Interview scheduled')
      setShowForm(false); load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to schedule interview')
    }
    setSaving(false)
  }

  const openFeedback = (iv) => {
    setFeedbackModal(iv)
    setFbForm({ result: 'passed', feedback: '', rating: '', notify_candidate: true })
  }

  const handleFeedback = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await hrmService.submitInterviewFeedback(feedbackModal.id, {
        ...fbForm, rating: fbForm.rating ? Number(fbForm.rating) : undefined,
      })
      setFeedbackModal(null)
      const { result, candidate_name, next_round } = res.data
      if (result === 'passed' && next_round) {
        toast.success(`${candidate_name} passed — preparing ${next_round.round_name}`)
        await load()
        openFormForCandidate(res.data.candidate_id, candidate_name)
      } else if (result === 'passed') {
        toast.success(`${candidate_name} completed the final round — moved to Offer stage`)
        load()
      } else if (result === 'failed') {
        toast.success(`${candidate_name} marked Rejected`)
        load()
      } else {
        toast.success('Feedback saved — candidate remains On Hold')
        load()
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit feedback')
    }
    setSaving(false)
  }

  const fmtFull = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { timeZone: getTenantTimezone(), day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

  const roundNamesFor = (group) => {
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

      {/* Schedule modal */}
      <ModalPortal isOpen={showForm}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Schedule Interview</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Candidate *</label>
              <SearchableSelect
                value={form.candidate_id}
                onChange={handleSelectCandidate}
                options={candidateOptions}
                placeholder="Search candidate by name or email…"
                minChars={1}
                className="mt-1"
              />
            </div>
            {form.candidate_id && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-200">
                {nextRoundLoading ? (
                  <span className="text-gray-400">Determining round…</span>
                ) : nextRoundInfo ? (
                  <>
                    <p><span className="text-gray-500">Round:</span> <span className="font-medium text-gray-900">Round {nextRoundInfo.round_number} — {nextRoundInfo.round_name}</span></p>
                    <p className="mt-1"><span className="text-gray-500">Current Stage:</span> <span className="font-medium text-gray-900 capitalize">{nextRoundInfo.current_stage}</span></p>
                  </>
                ) : (
                  <span className="text-gray-400">Select a candidate to see their round</span>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Mode</label>
                <select className="input w-full mt-1" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                  <option value="video">Video</option>
                  <option value="in_person">In Person</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Duration (min)</label>
                <input type="number" className="input w-full mt-1" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Scheduled At *</label>
                <input type="datetime-local" className="input w-full mt-1" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} required />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Meeting Link / Location</label>
                <input className="input w-full mt-1" value={form.location_or_link} onChange={e => setForm(f => ({ ...f, location_or_link: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.send_invitation_email} onChange={e => setForm(f => ({ ...f, send_invitation_email: e.target.checked }))} />
              Send Interview Invitation Email
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Scheduling…' : 'Schedule'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* Feedback modal */}
      <ModalPortal isOpen={!!feedbackModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleFeedback} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Submit Feedback — {feedbackModal?.round_name}</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Result</label>
              <select className="input w-full mt-1" value={fbForm.result} onChange={e => setFbForm(f => ({ ...f, result: e.target.value }))}>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Rating (0-5)</label>
              <input type="number" step="0.5" min="0" max="5" className="input w-full mt-1" value={fbForm.rating} onChange={e => setFbForm(f => ({ ...f, rating: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Remarks</label>
              <textarea className="input w-full mt-1" rows={3} value={fbForm.feedback} onChange={e => setFbForm(f => ({ ...f, feedback: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={fbForm.notify_candidate} onChange={e => setFbForm(f => ({ ...f, notify_candidate: e.target.checked }))} />
              Notify Candidate
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setFeedbackModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Submit'}</button>
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RESULT_COLORS[iv.result] || ''}`}>{iv.result?.replace('_', ' ')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500 text-xs">
                    <p>Scheduled By: <span className="text-gray-700">{iv.scheduled_by_name || '—'}</span></p>
                    <p>Scheduled Time: <span className="text-gray-700">{fmtFull(iv.scheduled_at)}</span></p>
                    <p>Completed Time: <span className="text-gray-700">{fmtFull(iv.completed_at)}</span></p>
                    <p>Mail Sent: <span className="text-gray-700">{iv.invitation_email_sent ? 'Invitation' : ''}{iv.invitation_email_sent && iv.result_email_sent ? ', ' : ''}{iv.result_email_sent ? 'Result' : ''}{!iv.invitation_email_sent && !iv.result_email_sent ? 'None' : ''}</span></p>
                  </div>
                  {(iv.feedback || iv.rating != null) && (
                    <p className="mt-2 text-xs text-gray-600">
                      {iv.rating != null && <span className="font-medium">Rating: {iv.rating}/5. </span>}
                      {iv.feedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
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
              return (
                <tr key={g.candidate_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{g.candidate_name}</td>
                  <td className="px-4 py-3 text-gray-600">Round {g.current.round_number} — {g.current.round_name}</td>
                  <td className="px-4 py-3"><ProgressDots group={g} roundNames={roundNames} /></td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {g.current.result === 'pending' && (
                        <button onClick={() => openFeedback(g.current)}
                          className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100">
                          Feedback
                        </button>
                      )}
                      <button onClick={() => setHistoryGroup(g)} title="View History"
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-500">
                        <History className="w-4 h-4" />
                      </button>
                    </div>
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
