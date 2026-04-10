import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Users, Plus, Search, Filter, Eye, Edit, Trash2,
  Mail, MapPin, FileText, Sparkles, Briefcase, X, Download, Link2, Send, Upload
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSelector } from 'react-redux'
import candidateService from '../../services/candidateService'
import applicationService from '../../services/applicationService'
import usePermissions from '../../hooks/usePermissions'
import ExportModal from '../../components/common/ExportModal'
import CandidateImportModal from '../../components/common/CandidateImportModal'
import { selectUserType } from '../../store/authSlice'

const Candidates = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const userType = useSelector(selectUserType)
  const [candidates, setCandidates] = useState([])
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'active' | 'blacklisted'
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [searchMode, setSearchMode] = useState('filter') // 'filter' or 'keyword'
  const [keywordSearch, setKeywordSearch] = useState('')
  const [filters, setFilters] = useState({
    keyword: '',
    skills: '',
    min_experience: '',
    max_experience: '',
    status: '',
    source: '',
    notice_period: '',
    location: ''
  })
  const [showFilters, setShowFilters] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [sources, setSources] = useState([])
  const [noticePeriods, setNoticePeriods] = useState([])

  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [formLinkModal, setFormLinkModal] = useState(false)
  const [formLinkEmail, setFormLinkEmail] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback for non-HTTPS or browsers that block clipboard API
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        return ok
      } catch {
        return false
      }
    }
  }

  const handleGenerateFormLink = async () => {
    try {
      setGeneratingLink(true)
      const res = await candidateService.generateFormLink(formLinkEmail.trim() || null)
      const url = `${window.location.origin}/apply/${res.token}`

      if (res.email_sent) {
        await copyToClipboard(url)
        toast.success('Form link sent to candidate email!')
      } else if (formLinkEmail.trim() && !res.email_enabled) {
        // Email was entered but service is disabled — copy instead
        await copyToClipboard(url)
        toast.success('Email service disabled. Link copied instead.')
      } else {
        const copied = await copyToClipboard(url)
        toast.success(copied ? 'Link copied to clipboard!' : 'Link generated! Share this URL: ' + url)
      }

      setFormLinkModal(false)
      setFormLinkEmail('')
    } catch {
      toast.error('Failed to generate form link')
    } finally {
      setGeneratingLink(false)
    }
  }

  // Apply modal state
  const [applyModal, setApplyModal] = useState(null)        // null | { candidate }
  const [eligibleJobs, setEligibleJobs] = useState([])
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [applyingJobId, setApplyingJobId] = useState(null)

  useEffect(() => {
    loadDropdowns()
  }, [])

  useEffect(() => {
    loadCandidates()
  }, [pagination.page, filters, activeTab])

  const loadDropdowns = async () => {
    try {
      const [statusRes, sourceRes, noticeRes] = await Promise.all([
        candidateService.getStatuses(),
        candidateService.getSources(),
        candidateService.getNoticePeriods()
      ])
      setStatuses(statusRes.data || [])
      setSources(sourceRes.data || [])
      setNoticePeriods(noticeRes.data || [])
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadCandidates = async () => {
    try {
      setLoading(true)
      const params = {
        page: pagination.page,
        page_size: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      }
      if (activeTab === 'active') params.status = 'active'
      if (activeTab === 'blacklisted') params.status = 'blacklisted'
      const response = await candidateService.getCandidates(params)
      setCandidates(response.data || [])
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.total_pages || 0
      }))
    } catch (error) {
      toast.error('Failed to load candidates')
    } finally {
      setLoading(false)
    }
  }

  const handleKeywordSearch = async () => {
    if (!keywordSearch.trim()) return
    try {
      setLoading(true)
      const response = await candidateService.searchCandidates(keywordSearch, {
        page: pagination.page,
        page_size: 20
      })
      setCandidates(response.data || [])
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.total_pages || 0
      }))
      if (response.search_info) {
        toast.success(`Found ${response.pagination?.total || 0} candidates`)
      }
    } catch (error) {
      toast.error('Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (candidateId, candidateName) => {
    if (!confirm(`Are you sure you want to delete "${candidateName}"?`)) return
    try {
      await candidateService.deleteCandidate(candidateId)
      toast.success('Candidate deleted successfully')
      loadCandidates()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete candidate')
    }
  }

  const handleStatusChange = async (candidate, newValue) => {
    if (newValue === 'apply') {
      if (candidate.status === 'blacklisted') {
        toast.error('Blacklisted candidates cannot apply.')
        return
      }
      setApplyModal({ candidate })
      setEligibleJobs([])
      setEligibleLoading(true)
      try {
        const res = await candidateService.getEligibleJobs(candidate.id)
        setEligibleJobs(res.data || [])
      } catch (err) {
        toast.error('Failed to load eligible jobs.')
      } finally {
        setEligibleLoading(false)
      }
      return
    }
    try {
      await candidateService.updateStatus(candidate.id, newValue)
      toast.success(`Status updated to ${newValue === 'active' ? 'Active' : 'Blacklisted'}`)
      loadCandidates()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update status')
    }
  }

  const handleApplyToJob = async (jobId) => {
    if (!applyModal) return
    setApplyingJobId(jobId)
    try {
      const res = await applicationService.createApplication({
        candidate_id: applyModal.candidate.id,
        job_id: jobId
      })
      if (res && res.success === false) {
        toast.error(res.message || 'Failed to apply.')
      } else {
        toast.success('Application created successfully.')
        setEligibleJobs(prev =>
          prev.map(j => j.job_id === jobId ? { ...j, already_applied: true } : j)
        )
        loadCandidates()
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail?.toLowerCase().includes('already applied')) {
        toast.error('Candidate has already applied to this job.')
        setEligibleJobs(prev =>
          prev.map(j => j.job_id === jobId ? { ...j, already_applied: true } : j)
        )
      } else {
        toast.error(detail || 'Failed to apply.')
      }
    } finally {
      setApplyingJobId(null)
    }
  }

  // Global status only: Active (green) or Blacklisted (red)
  const getStatusBadge = (status) => {
    if (status === 'blacklisted') return 'bg-red-200 text-red-900'
    return 'bg-green-100 text-green-800' // active + any legacy values → green
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Candidates</h1>
          <p className="text-surface-500">Master talent pool — manage candidate profiles</p>
        </div>
        <div className="flex items-center gap-2">
          {has('exports:create') && (
            <button
              onClick={() => setExportOpen(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {has('candidates:create') && (
            <button
              onClick={() => setFormLinkModal(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              Send Form Link
            </button>
          )}
          {has('candidates:create') && (
            <button
              onClick={() => setImportOpen(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
          )}
          {has('candidates:create') && (
            <Link to="/candidates/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Candidate
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-200">
        {[['all', 'All'], ['active', 'Active'], ['blacklisted', 'Blacklisted']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setPagination(p => ({ ...p, page: 1 })) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search / Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex rounded-lg border border-surface-200 p-1">
            <button
              onClick={() => setSearchMode('filter')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === 'filter' ? 'bg-primary-500 text-white' : 'text-surface-600 hover:bg-surface-100'
              }`}
            >
              Filter Search
            </button>
            <button
              onClick={() => setSearchMode('keyword')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                searchMode === 'keyword' ? 'bg-primary-500 text-white' : 'text-surface-600 hover:bg-surface-100'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              AI Keyword Search
            </button>
          </div>
        </div>

        {searchMode === 'keyword' ? (
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-500" />
                <input
                  type="text"
                  placeholder="e.g., Python 3+ years Bangalore OR React senior developer remote"
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
                  className="input pl-10 w-full"
                />
              </div>
              <p className="text-xs text-surface-500 mt-1">
                Try: "Python 3+ years", "React Node Mumbai", "Java senior developer"
              </p>
            </div>
            <button onClick={handleKeywordSearch} className="btn-primary">Search</button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    type="text"
                    placeholder="Search by name, email, skills..."
                    value={filters.keyword}
                    onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
                    className="input pl-10 w-full"
                  />
                </div>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-surface-100' : ''}`}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-surface-200">
                <input
                  type="text"
                  placeholder="Skills (comma separated)"
                  value={filters.skills}
                  onChange={(e) => setFilters(prev => ({ ...prev, skills: e.target.value }))}
                  className="input"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min Exp"
                    value={filters.min_experience}
                    onChange={(e) => setFilters(prev => ({ ...prev, min_experience: e.target.value }))}
                    className="input w-full"
                  />
                  <input
                    type="number"
                    placeholder="Max Exp"
                    value={filters.max_experience}
                    onChange={(e) => setFilters(prev => ({ ...prev, max_experience: e.target.value }))}
                    className="input w-full"
                  />
                </div>
                {/* Status filter only shows Active / Blacklisted (from API) */}
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="input"
                >
                  <option value="">All Statuses</option>
                  {statuses.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <select
                  value={filters.notice_period}
                  onChange={(e) => setFilters(prev => ({ ...prev, notice_period: e.target.value }))}
                  className="input"
                >
                  <option value="">All Notice Periods</option>
                  {noticePeriods.map(n => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
                <select
                  value={filters.source}
                  onChange={(e) => setFilters(prev => ({ ...prev, source: e.target.value }))}
                  className="input"
                >
                  <option value="">All Sources</option>
                  {sources.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Location"
                  value={filters.location}
                  onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
                  className="input"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Candidates Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
            <p className="mt-2 text-surface-500">Loading candidates...</p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-surface-300 mx-auto mb-4" />
            <p className="text-surface-500">No candidates found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Candidate</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Experience</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Skills</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Notice</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Partner</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Applied Jobs</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-surface-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {candidates.map(candidate => (
                <tr key={candidate.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium text-surface-900">{candidate.full_name}</p>
                      <div className="flex items-center gap-3 text-sm text-surface-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {candidate.email}
                        </span>
                        {candidate.current_city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {candidate.current_city}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm">
                      <p className="text-surface-900">{candidate.total_experience_years || 0} years</p>
                      {candidate.current_company && (
                        <p className="text-surface-500">{candidate.current_company}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(candidate.skill_tags || []).slice(0, 3).map((skill, i) => (
                        <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 text-xs rounded-full">
                          {skill}
                        </span>
                      ))}
                      {(candidate.skill_tags || []).length > 3 && (
                        <span className="px-2 py-0.5 bg-surface-100 text-surface-600 text-xs rounded-full">
                          +{candidate.skill_tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-600">
                      {candidate.notice_period?.replace('_', ' ') || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-600">
                      {candidate.partner_name || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {candidate.total_applications > 0 ? (
                      <Link
                        to={`/applications?candidate_id=${candidate.id}`}
                        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 font-medium"
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        {candidate.total_applications} job{candidate.total_applications !== 1 ? 's' : ''}
                      </Link>
                    ) : (
                      <span className="text-sm text-surface-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={candidate.status}
                      onChange={(e) => handleStatusChange(candidate, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-primary-300 ${getStatusBadge(candidate.status)}`}
                    >
                      <option value="active">Active</option>
                      <option value="blacklisted">Blacklisted</option>
                      {userType !== 'partner' && (
                        <option
                          value="apply"
                          disabled={candidate.status === 'blacklisted'}
                          className="font-semibold text-primary-700"
                        >
                          Apply →
                        </option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {candidate.resume_url && (
                        <a
                          href={candidate.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                          title="View Resume"
                        >
                          <FileText className="w-4 h-4 text-surface-500" />
                        </a>
                      )}
                      <button
                        onClick={() => navigate(`/candidates/${candidate.id}`)}
                        className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-surface-500" />
                      </button>
                      {has('candidates:edit') && (
                        <button
                          onClick={() => navigate(`/candidates/${candidate.id}/edit`)}
                          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4 text-surface-500" />
                        </button>
                      )}
                      {has('candidates:delete') && (
                        <button
                          onClick={() => handleDelete(candidate.id, candidate.full_name)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-500">
              Showing {candidates.length} of {pagination.total} candidates
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Eligible Jobs Modal (Apply action) */}
      {applyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-surface-200">
              <div>
                <h3 className="text-lg font-semibold text-surface-900">
                  Apply — {applyModal.candidate.full_name}
                </h3>
                <p className="text-sm text-surface-500 mt-0.5">Select a job to apply this candidate</p>
              </div>
              <button
                onClick={() => setApplyModal(null)}
                className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-surface-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {eligibleLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
                </div>
              ) : eligibleJobs.length === 0 ? (
                <p className="text-center text-surface-500 py-12">No open jobs found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200">
                      <th className="text-left py-2 px-3 font-medium text-surface-600">Job</th>
                      <th className="text-left py-2 px-3 font-medium text-surface-600">Client</th>
                      <th className="text-left py-2 px-3 font-medium text-surface-600">Match</th>
                      <th className="text-right py-2 px-3 font-medium text-surface-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {eligibleJobs.map(job => (
                      <tr key={job.job_id} className="hover:bg-surface-50">
                        <td className="py-3 px-3">
                          <p className="font-medium text-surface-900">{job.job_title}</p>
                          {job.job_code && (
                            <p className="text-xs text-surface-400">{job.job_code}</p>
                          )}
                        </td>
                        <td className="py-3 px-3 text-surface-600">{job.client_name || '—'}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            job.score >= 70 ? 'bg-green-100 text-green-800' :
                            job.score >= 40 ? 'bg-yellow-100 text-yellow-800' :
                                              'bg-red-100 text-red-800'
                          }`}>
                            {job.score}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {job.already_applied ? (
                            <span className="text-xs text-surface-400 italic">Already applied</span>
                          ) : (
                            <button
                              onClick={() => handleApplyToJob(job.job_id)}
                              disabled={applyingJobId === job.job_id}
                              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                            >
                              {applyingJobId === job.job_id ? 'Applying…' : 'Apply'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form Link Modal */}
      {formLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setFormLinkModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-surface-900">Send Candidate Form Link</h3>
              <button onClick={() => setFormLinkModal(false)} className="p-1.5 rounded-lg hover:bg-surface-100">
                <X className="w-4 h-4 text-surface-500" />
              </button>
            </div>
            <p className="text-sm text-surface-500 mb-4">
              Enter the candidate's email to send them a self-registration link, or leave blank to copy it to clipboard.
            </p>
            <label className="block text-sm font-medium text-surface-700 mb-1">Candidate Email <span className="text-surface-400 font-normal">(optional)</span></label>
            <input
              type="email"
              value={formLinkEmail}
              onChange={e => setFormLinkEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !generatingLink && handleGenerateFormLink()}
              placeholder="candidate@example.com"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setFormLinkModal(false)} className="flex-1 px-4 py-2 text-sm border border-surface-200 rounded-lg hover:bg-surface-50">
                Cancel
              </button>
              <button
                onClick={handleGenerateFormLink}
                disabled={generatingLink}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                <Send className="w-4 h-4" />
                {generatingLink ? 'Generating…' : (formLinkEmail.trim() ? 'Send Link' : 'Copy Link')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importOpen && (
        <CandidateImportModal
          onClose={() => setImportOpen(false)}
          onImported={loadCandidates}
        />
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Candidates"
        apiPath="/export/candidates"
        extraFilters={({ status, setStatus }) => (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input w-full">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="blacklisted">Blacklisted</option>
            </select>
          </div>
        )}
      />
    </div>
  )
}

export default Candidates
