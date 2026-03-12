import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Users, ArrowLeft, RefreshCw, UserPlus, Briefcase,
  CheckCircle, XCircle, AlertTriangle, MapPin, Clock, Award
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/jobService'
import matchingService from '../../services/matchingService'
import applicationService from '../../services/applicationService'

// ── Criterion Row ──────────────────────────────────────────────────────────────
const CriterionRow = ({ label, status, detail }) => {
  const isGood = ['Matched', 'Fully Matched', 'Eligible', 'Preferred Location',
                  'No Criteria', 'No Skills Required'].includes(status)
  const isWarn = ['Partially Matched', 'Not Specified', 'Overqualified', 'Not Provided'].includes(status)

  const color = isGood ? 'text-green-600' : isWarn ? 'text-amber-600' : 'text-red-600'
  const Icon  = isGood ? CheckCircle : isWarn ? AlertTriangle : XCircle

  return (
    <div className={`flex items-start gap-1.5 text-xs ${color}`}>
      <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span className="font-medium text-surface-600">{label}:</span>
      <span className="font-medium">{detail || status}</span>
    </div>
  )
}

// ── Score Badge ────────────────────────────────────────────────────────────────
const ScoreBadge = ({ score }) => {
  const cls =
    score >= 80 ? 'bg-green-100 text-green-800 border-green-200' :
    score >= 60 ? 'bg-blue-100 text-blue-800 border-blue-200' :
    score >= 40 ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-red-100 text-red-800 border-red-200'
  return (
    <span className={`px-2.5 py-1 rounded-full text-sm font-bold border ${cls}`}>
      {score}%
    </span>
  )
}

// ── Eligibility Badge ──────────────────────────────────────────────────────────
const EligibilityBadge = ({ status }) =>
  status === 'eligible'
    ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Eligible</span>
    : <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Not Eligible</span>

// ── Main Component ─────────────────────────────────────────────────────────────
const JobMatchingCandidates = () => {
  const navigate = useNavigate()
  const { id: jobId } = useParams()

  const [job, setJob] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading]   = useState(true)
  const [running, setRunning]   = useState(false)
  const [applying, setApplying] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])  // candidate_ids
  const [activeTab, setActiveTab] = useState('all')   // all | eligible | partial | low

  useEffect(() => { loadPage() }, [jobId])

  const loadPage = async () => {
    try {
      setLoading(true)
      const [jobRes, matchRes] = await Promise.all([
        jobService.getJob(jobId),
        matchingService.getMatchingResults(jobId),
      ])
      setJob(jobRes.data)
      const data = matchRes.data || []
      if (data.length === 0) {
        // No stored results yet — auto-run on first visit
        await runMatchingSilent()
      } else {
        setCandidates(data)
      }
    } catch (error) {
      console.error('Failed to load matching page:', error)
      toast.error(error.response?.data?.detail || 'Failed to load matching data')
      navigate('/jobs')
    } finally {
      setLoading(false)
    }
  }

  const runMatchingSilent = async () => {
    try {
      const res = await matchingService.runMatching(jobId)
      setCandidates(res.data || [])
    } catch (err) {
      console.error('Auto-matching failed:', err)
    }
  }

  const handleRunMatching = async () => {
    try {
      setRunning(true)
      const res = await matchingService.runMatching(jobId)
      setCandidates(res.data || [])
      setSelectedIds([])
      toast.success(`Matching complete — ${res.count} candidates scored`)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to run matching')
    } finally {
      setRunning(false)
    }
  }

  const toggleSelect = (candidateId) => {
    setSelectedIds(prev =>
      prev.includes(candidateId)
        ? prev.filter(i => i !== candidateId)
        : [...prev, candidateId]
    )
  }

  const toggleSelectAll = () => {
    const visible = filteredCandidates.map(c => c.candidate_id)
    const allSelected = visible.every(id => selectedIds.includes(id))
    setSelectedIds(prev =>
      allSelected
        ? prev.filter(id => !visible.includes(id))
        : [...new Set([...prev, ...visible])]
    )
  }

  const handleBulkApply = async () => {
    if (selectedIds.length === 0) { toast.error('Select at least one candidate'); return }
    try {
      setApplying(true)
      const res = await applicationService.bulkApply(jobId, selectedIds)
      const ok   = res.data?.success?.length || 0
      const fail = res.data?.failed?.length  || 0
      if (ok)   toast.success(`${ok} candidate(s) applied successfully`)
      if (fail) toast.error(`${fail} application(s) failed (may already exist)`)
      setSelectedIds([])
      await runMatchingSilent()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to apply candidates')
    } finally {
      setApplying(false)
    }
  }

  // ── Tabs & filtering ─────────────────────────────────────────────────────
  const stats = {
    all:      candidates.length,
    eligible: candidates.filter(c => c.eligibility_status === 'eligible').length,
    partial:  candidates.filter(c => c.skill_status === 'Partially Matched').length,
    low:      candidates.filter(c => c.final_score < 40).length,
  }

  const filteredCandidates = candidates.filter(c => {
    if (activeTab === 'eligible') return c.eligibility_status === 'eligible'
    if (activeTab === 'partial')  return c.skill_status === 'Partially Matched'
    if (activeTab === 'low')      return c.final_score < 40
    return true
  })

  const allVisibleSelected =
    filteredCandidates.length > 0 &&
    filteredCandidates.every(c => selectedIds.includes(c.candidate_id))

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="animate-spin w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full" />
        <p className="text-surface-500">Running matching engine…</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/jobs')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Candidate Matching</h1>
            <p className="text-surface-500 text-sm">Eligibility breakdown for each candidate</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button onClick={handleBulkApply} disabled={applying} className="btn-primary flex items-center gap-2">
              {applying
                ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Applying…</>
                : <><UserPlus className="w-4 h-4" /> Apply {selectedIds.length} Selected</>
              }
            </button>
          )}
          <button onClick={handleRunMatching} disabled={running} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running…' : 'Refresh Matching'}
          </button>
        </div>
      </div>

      {/* Job Info */}
      {job && (
        <div className="bg-gradient-to-r from-primary-50 to-indigo-50 rounded-xl border border-primary-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-6 h-6 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-surface-900">{job.title}</h2>
              <div className="flex flex-wrap gap-4 mt-1 text-sm text-surface-500">
                <span>{job.client_name}</span>
                {job.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.city}</span>}
                {job.experience && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {job.experience.min_years}–{job.experience.max_years ?? '∞'} yrs
                  </span>
                )}
                {job.min_percentage && (
                  <span className="flex items-center gap-1"><Award className="w-3 h-3" />Min {job.min_percentage}%</span>
                )}
              </div>
            </div>
          </div>

          {job.eligibility?.mandatory_skills?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-primary-200">
              <p className="text-xs text-surface-500 mb-2">Required Skills:</p>
              <div className="flex flex-wrap gap-1.5">
                {job.eligibility.mandatory_skills.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white border border-primary-200 text-primary-700 text-xs rounded-full font-medium">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats / Tab bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { key: 'all',      label: 'Total',           activeColor: 'border-surface-400 bg-surface-50' },
          { key: 'eligible', label: 'Eligible',         activeColor: 'border-green-400 bg-green-50' },
          { key: 'partial',  label: 'Partial Match',    activeColor: 'border-amber-400 bg-amber-50' },
          { key: 'low',      label: 'Low Match (<40%)', activeColor: 'border-red-400 bg-red-50' },
        ].map(({ key, label, activeColor }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-xl border-2 p-3 text-center transition-all ${
              activeTab === key
                ? `${activeColor} shadow-sm`
                : 'border-surface-200 bg-white hover:bg-surface-50'
            }`}
          >
            <p className="text-2xl font-bold text-surface-900">{stats[key]}</p>
            <p className="text-xs text-surface-500 mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      {/* Candidates Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
        {filteredCandidates.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-500 font-medium">No candidates in this category</p>
            <p className="text-sm text-surface-400 mt-1">
              {activeTab !== 'all' ? 'Switch to "All" tab to see everyone' : 'Click "Refresh Matching" to scan candidates'}
            </p>
          </div>
        ) : (
          <>
            {/* Select-all row */}
            <div className="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-surface-300"
                />
                <span className="text-sm text-surface-600">Select All ({filteredCandidates.length})</span>
              </label>
              {selectedIds.length > 0 && (
                <span className="text-sm text-primary-600 font-medium">{selectedIds.length} selected</span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="w-10 px-4 py-3"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Candidate</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Criteria Breakdown</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Skills</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Score</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Eligibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredCandidates.map((c) => (
                    <tr
                      key={c.candidate_id || c.id}
                      className={`transition-colors hover:bg-surface-50 ${selectedIds.includes(c.candidate_id) ? 'bg-primary-50/50' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(c.candidate_id)}
                          onChange={() => toggleSelect(c.candidate_id)}
                          className="rounded border-surface-300"
                        />
                      </td>

                      {/* Candidate */}
                      <td className="px-4 py-4">
                        <p className="font-semibold text-surface-900 text-sm">{c.candidate_name}</p>
                        <p className="text-xs text-surface-500 mt-0.5">{c.candidate_email}</p>
                        {c.candidate_exp !== undefined && (
                          <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{c.candidate_exp} yrs
                          </p>
                        )}
                      </td>

                      {/* Criteria breakdown */}
                      <td className="px-4 py-4">
                        <div className="space-y-1.5">
                          <CriterionRow
                            label="Skills"
                            status={c.skill_status}
                            detail={
                              c.skill_status === 'No Skills Required'
                                ? 'No skills required'
                                : `${c.matched_skills?.length ?? 0}/${(c.matched_skills?.length ?? 0) + (c.missing_skills?.length ?? 0)} matched (${c.skill_match_percent}%)`
                            }
                          />
                          <CriterionRow label="Location"   status={c.location_status}   detail={c.location_status} />
                          <CriterionRow label="Experience" status={c.experience_status} detail={c.experience_status} />
                          <CriterionRow label="Percentage" status={c.percentage_status} detail={c.percentage_status} />
                        </div>
                      </td>

                      {/* Skills chips */}
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(c.matched_skills || []).slice(0, 3).map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">✓ {s}</span>
                          ))}
                          {(c.missing_skills || []).slice(0, 2).map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">✗ {s}</span>
                          ))}
                          {(c.missing_skills || []).length > 2 && (
                            <span className="px-2 py-0.5 bg-surface-100 text-surface-500 text-xs rounded-full">
                              +{c.missing_skills.length - 2} missing
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-4 text-center">
                        <ScoreBadge score={c.final_score} />
                      </td>

                      {/* Eligibility */}
                      <td className="px-4 py-4 text-center">
                        <EligibilityBadge status={c.eligibility_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-surface-500">
        <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Met</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Partial</span>
        <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> Not met</span>
        <span className="ml-auto italic">Eligible = Score ≥ 60% AND percentage not below minimum</span>
      </div>
    </div>
  )
}

export default JobMatchingCandidates
