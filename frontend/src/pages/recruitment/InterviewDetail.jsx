import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Briefcase, Building2, Layers,
  CheckCircle2, XCircle, PauseCircle, Clock, ChevronRight,
  Calendar, MessageSquare
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import interviewService from '../../services/interviewService'
import usePermissions from '../../hooks/usePermissions'

const RESULT_STYLES = {
  passed:   { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle2, iconColor: 'text-green-600' },
  failed:   { bg: 'bg-red-100',   text: 'text-red-800',   icon: XCircle,      iconColor: 'text-red-600'   },
  on_hold:  { bg: 'bg-yellow-100',text: 'text-yellow-800',icon: PauseCircle,  iconColor: 'text-yellow-600'},
  pending:  { bg: 'bg-gray-100',  text: 'text-gray-600',  icon: Clock,        iconColor: 'text-gray-400'  },
}

const OVERALL_STATUS_STYLES = {
  in_progress: 'bg-blue-100 text-blue-800',
  selected:    'bg-green-100 text-green-800',
  failed:      'bg-red-100 text-red-800',
  on_hold:     'bg-yellow-100 text-yellow-800',
}

const InterviewDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { has } = usePermissions()

  const [interview, setInterview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Round result form state
  const [roundResult, setRoundResult] = useState('')
  const [roundFeedback, setRoundFeedback] = useState('')
  const [nextRoundDate, setNextRoundDate] = useState('')
  const [nextRoundTime, setNextRoundTime] = useState('')

  useEffect(() => {
    loadInterview()
  }, [id])

  const loadInterview = async () => {
    try {
      setLoading(true)
      const res = await interviewService.getInterview(id)
      setInterview(res.data)
    } catch {
      toast.error('Failed to load interview')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRound = async () => {
    if (!roundResult) { toast.error('Please select a result'); return }

    try {
      setSubmitting(true)
      await interviewService.submitRoundResult(id, {
        result: roundResult,
        feedback: roundFeedback,
        next_round_date: roundResult === 'passed' && nextRoundDate ? nextRoundDate : undefined,
        next_round_time: roundResult === 'passed' && nextRoundTime ? nextRoundTime : undefined,
      })
      toast.success(
        roundResult === 'passed'
          ? interview.rounds.length > (interview.current_round_index + 1)
            ? 'Round passed — next round activated'
            : 'All rounds passed — candidate selected!'
          : roundResult === 'failed'
          ? 'Round failed — candidate placed on 3-day cooldown'
          : 'Round placed on hold'
      )
      // Reset form
      setRoundResult('')
      setRoundFeedback('')
      setNextRoundDate('')
      setNextRoundTime('')
      loadInterview()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save result')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!interview) {
    return <div className="p-6 text-center text-surface-500">Interview not found</div>
  }

  const rounds = interview.rounds || []
  const currentIdx = interview.current_round_index ?? 0
  const currentRound = rounds[currentIdx]
  const isConcluded = ['selected', 'failed'].includes(interview.overall_status)

  const overallLabel = {
    in_progress: 'In Progress',
    selected: 'Selected',
    failed: 'Failed',
    on_hold: 'On Hold',
  }[interview.overall_status] || interview.overall_status

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/interviews')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-surface-900">Interview Detail</h1>
          <p className="text-surface-500">Round-by-round progress</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${OVERALL_STATUS_STYLES[interview.overall_status] || 'bg-gray-100 text-gray-700'}`}>
          {overallLabel}
        </span>
      </div>

      {/* Candidate / Job info */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-surface-500">Candidate</p>
              <p className="font-semibold text-surface-900">{interview.candidate_name}</p>
              {interview.candidate_email && <p className="text-xs text-surface-400">{interview.candidate_email}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-surface-500">Job</p>
              <p className="font-semibold text-surface-900">{interview.job_title}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-surface-500">Client</p>
              <p className="font-semibold text-surface-900">{interview.client_name || '—'}</p>
            </div>
          </div>
        </div>

        {interview.pipeline_name && (
          <div className="mt-3 pt-3 border-t border-surface-100 flex items-center gap-2 text-sm text-surface-600">
            <Layers className="w-4 h-4" />
            <span>Pipeline: <span className="font-medium">{interview.pipeline_name}</span></span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {rounds.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-700">Pipeline Progress</h2>
            <span className="text-xs text-surface-500">
              Round {isConcluded ? rounds.length : currentIdx + 1} of {rounds.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {rounds.map((r, i) => {
              const isDone = r.result !== 'pending'
              const isActive = i === currentIdx && !isConcluded
              const resultStyle = RESULT_STYLES[r.result] || RESULT_STYLES.pending
              const Icon = resultStyle.icon

              return (
                <React.Fragment key={i}>
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      isActive
                        ? 'border-primary-500 bg-primary-50'
                        : isDone
                        ? `${resultStyle.bg} border-transparent`
                        : 'border-surface-300 bg-surface-50'
                    }`}>
                      <Icon className={`w-4 h-4 ${isActive ? 'text-primary-600' : resultStyle.iconColor}`} />
                    </div>
                    <p className={`text-xs mt-1 text-center font-medium ${isActive ? 'text-primary-700' : 'text-surface-500'}`}>
                      {r.round_name.length > 12 ? r.round_name.slice(0, 10) + '…' : r.round_name}
                    </p>
                    {isDone && (
                      <p className={`text-xs ${resultStyle.text}`}>{r.result}</p>
                    )}
                  </div>
                  {i < rounds.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-surface-300 flex-shrink-0 mb-5" />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}

      {/* Round History */}
      {rounds.filter(r => r.result !== 'pending').length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-5 mb-5">
          <h2 className="text-base font-semibold text-surface-900 mb-4">Round History</h2>
          <div className="space-y-3">
            {rounds.filter(r => r.result !== 'pending').map((r, i) => {
              const s = RESULT_STYLES[r.result] || RESULT_STYLES.pending
              const Icon = s.icon
              return (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${s.bg}`}>
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${s.iconColor}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-surface-900">
                        Round {r.round_number} — {r.round_name}
                      </p>
                      <span className={`text-xs font-semibold capitalize ${s.text}`}>{r.result}</span>
                    </div>
                    {r.feedback && <p className="text-sm text-surface-600 mt-1">{r.feedback}</p>}
                    {r.completed_date && (
                      <p className="text-xs text-surface-400 mt-1">
                        {new Date(r.completed_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Current Round Action */}
      {currentRound && !isConcluded && has('interviews:update_status') && (
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-5 mb-5">
          <h2 className="text-base font-semibold text-surface-900 mb-1">
            Current Round: <span className="text-primary-700">{currentRound.round_name}</span>
          </h2>
          {currentRound.scheduled_date && (
            <p className="text-sm text-surface-500 mb-4 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Scheduled: {currentRound.scheduled_date}
              {currentRound.scheduled_time && ` at ${currentRound.scheduled_time}`}
            </p>
          )}

          {/* Result buttons */}
          <div className="mb-4">
            <p className="text-sm font-medium text-surface-700 mb-2">Mark Result</p>
            <div className="flex gap-3">
              {[
                { value: 'passed',  label: 'Pass',    color: 'bg-green-500 hover:bg-green-600 text-white', active: 'ring-2 ring-green-400' },
                { value: 'failed',  label: 'Fail',    color: 'bg-red-500 hover:bg-red-600 text-white',     active: 'ring-2 ring-red-400'   },
                { value: 'on_hold', label: 'On Hold', color: 'bg-yellow-500 hover:bg-yellow-600 text-white', active: 'ring-2 ring-yellow-400' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRoundResult(opt.value)}
                  className={`px-5 py-2 rounded-lg font-medium text-sm transition-all ${opt.color} ${roundResult === opt.value ? opt.active : 'opacity-80'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback text */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Feedback <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={roundFeedback}
              onChange={e => setRoundFeedback(e.target.value)}
              className="input w-full"
              rows={2}
              placeholder="Brief notes about this round…"
            />
          </div>

          {/* Next round scheduling (only on pass + more rounds) */}
          {roundResult === 'passed' && currentIdx + 1 < rounds.length && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Schedule Next Round: {rounds[currentIdx + 1]?.round_name}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-blue-700 mb-1">Date <span className="text-blue-400">(optional)</span></label>
                  <input
                    type="date"
                    value={nextRoundDate}
                    onChange={e => setNextRoundDate(e.target.value)}
                    className="input w-full text-sm"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="block text-xs text-blue-700 mb-1">Time <span className="text-blue-400">(optional)</span></label>
                  <input
                    type="time"
                    value={nextRoundTime}
                    onChange={e => setNextRoundTime(e.target.value)}
                    className="input w-full text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleSubmitRound}
            disabled={!roundResult || submitting}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Saving…</>
            ) : (
              'Save Round Result'
            )}
          </button>
        </div>
      )}

      {/* Concluded state */}
      {isConcluded && (
        <div className={`rounded-xl p-5 border text-center ${
          interview.overall_status === 'selected'
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          {interview.overall_status === 'selected' ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="font-semibold text-green-800 text-lg">Candidate Selected!</p>
              <p className="text-sm text-green-600 mt-1">All rounds passed. Onboarding record created automatically.</p>
            </>
          ) : (
            <>
              <XCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <p className="font-semibold text-red-800 text-lg">Interview Failed</p>
              <p className="text-sm text-red-600 mt-1">Candidate is on a 3-day cooldown before becoming eligible again.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default InterviewDetail
