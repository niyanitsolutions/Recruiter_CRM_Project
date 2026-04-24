import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Users, Plus, Search, Filter, Eye, Edit, Trash2,
  Mail, MapPin, FileText, Sparkles, Briefcase, X, Download, Link2, Send, Upload,
  LayoutGrid, List, Clock, Building2
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSelector } from 'react-redux'
import candidateService from '../../services/candidateService'
import applicationService from '../../services/applicationService'
import usePermissions from '../../hooks/usePermissions'
import ExportModal from '../../components/common/ExportModal'
import CandidateImportModal from '../../components/common/CandidateImportModal'
import { selectUserType } from '../../store/authSlice'

const AVATAR_GRADIENTS = [
  'var(--stat-purple)',
  'var(--stat-blue)',
  'var(--stat-green)',
  'var(--stat-orange)',
  'var(--stat-teal)',
  'var(--stat-pink)',
]

const getAvatarGradient = (name = '') => {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[idx]
}

const Candidates = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const userType = useSelector(selectUserType)
  const [candidates, setCandidates] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [viewMode, setViewMode] = useState('table')
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [searchMode, setSearchMode] = useState('filter')
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

  const [applyModal, setApplyModal] = useState(null)
  const [eligibleJobs, setEligibleJobs] = useState([])
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [applyingJobId, setApplyingJobId] = useState(null)

  useEffect(() => { loadDropdowns() }, [])
  useEffect(() => { loadCandidates() }, [pagination.page, filters, activeTab])

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

  const getStatusStyle = (status) => status === 'blacklisted'
    ? { background: 'rgba(255,71,87,0.15)', color: '#FF4757' }
    : { background: 'rgba(67,233,123,0.15)', color: '#43E97B' }

  const openResume = (resumeUrl) => {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/v1\/?$/, '')
    const url = resumeUrl.startsWith('http') ? resumeUrl : `${base}${resumeUrl}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Candidates</h1>
          <p style={{ color: 'var(--text-muted)' }}>Master talent pool — manage candidate profiles</p>
        </div>
        <div className="flex items-center gap-2">
          {has('exports:create') && (
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {has('candidates:create') && (
            <button onClick={() => setFormLinkModal(true)} className="btn-secondary flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Send Form Link
            </button>
          )}
          {has('candidates:create') && (
            <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2">
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

      {/* Tabs + View Toggle */}
      <div className="flex items-center justify-between mb-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-1">
          {[['all', 'All'], ['active', 'Active'], ['blacklisted', 'Blacklisted']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setPagination(p => ({ ...p, page: 1 })) }}
              className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
              style={activeTab === key
                ? { borderColor: 'var(--accent)', color: 'var(--accent)', marginBottom: '-1px' }
                : { borderColor: 'transparent', color: 'var(--text-muted)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="flex items-center rounded-lg p-1 mb-1"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card-alt)' }}
        >
          <button
            onClick={() => setViewMode('table')}
            className="p-1.5 rounded-md transition-colors"
            style={viewMode === 'table'
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-muted)' }
            }
            title="Table view"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className="p-1.5 rounded-md transition-colors"
            style={viewMode === 'card'
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-muted)' }
            }
            title="Card view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search / Filters */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex items-center gap-4 mb-4">
          <div
            className="flex rounded-lg p-1"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-card-alt)' }}
          >
            <button
              onClick={() => setSearchMode('filter')}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={searchMode === 'filter'
                ? { background: 'var(--accent)', color: '#fff' }
                : { color: 'var(--text-secondary)' }
              }
            >
              Filter Search
            </button>
            <button
              onClick={() => setSearchMode('keyword')}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              style={searchMode === 'keyword'
                ? { background: 'var(--accent)', color: '#fff' }
                : { color: 'var(--text-secondary)' }
              }
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
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--accent)' }} />
                <input
                  type="text"
                  placeholder="e.g., Python 3+ years Bangalore OR React senior developer remote"
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
                  className="input pl-10 w-full"
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
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
                className="btn-secondary flex items-center gap-2"
                style={showFilters ? { background: 'var(--bg-active)', color: 'var(--accent)' } : {}}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
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
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="input"
                >
                  <option value="">All Statuses</option>
                  {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <select
                  value={filters.notice_period}
                  onChange={(e) => setFilters(prev => ({ ...prev, notice_period: e.target.value }))}
                  className="input"
                >
                  <option value="">All Notice Periods</option>
                  {noticePeriods.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
                <select
                  value={filters.source}
                  onChange={(e) => setFilters(prev => ({ ...prev, source: e.target.value }))}
                  className="input"
                >
                  <option value="">All Sources</option>
                  {sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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

      {/* Loading state */}
      {loading && (
        <div className="p-8 text-center">
          <div
            className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Loading candidates...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && candidates.length === 0 && (
        <div className="p-8 text-center rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
          <p style={{ color: 'var(--text-muted)' }}>No candidates found</p>
        </div>
      )}

      {/* Card Grid View */}
      {!loading && viewMode === 'card' && candidates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidates.map(candidate => (
            <div
              key={candidate.id}
              className="p-4"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-card)',
                borderRadius: '12px',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = 'var(--shadow-elevated)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
              }}
            >
              {/* Avatar + Name + Status */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: getAvatarGradient(candidate.full_name) }}
                >
                  {candidate.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {candidate.full_name}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {candidate.email}
                  </p>
                </div>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                  style={getStatusStyle(candidate.status)}
                >
                  {candidate.status}
                </span>
              </div>

              {/* Experience + Company + Location */}
              <div className="flex flex-wrap items-center gap-3 mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{candidate.total_experience_years || 0} yrs exp</span>
                </div>
                {candidate.current_company && (
                  <div className="flex items-center gap-1 min-w-0">
                    <Building2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate" style={{ maxWidth: '100px' }}>{candidate.current_company}</span>
                  </div>
                )}
                {candidate.current_city && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{candidate.current_city}</span>
                  </div>
                )}
              </div>

              {/* Skills */}
              {(candidate.skill_tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {candidate.skill_tags.slice(0, 4).map((skill, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                    >
                      {skill}
                    </span>
                  ))}
                  {candidate.skill_tags.length > 4 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                    >
                      +{candidate.skill_tags.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Footer: notice + apps + actions */}
              <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {candidate.notice_period?.replace('_', ' ') || '—'}
                  {candidate.total_applications > 0 && (
                    <Link
                      to={`/applications?candidate_id=${candidate.id}`}
                      className="ml-2 font-medium"
                      style={{ color: 'var(--accent)' }}
                    >
                      {candidate.total_applications} app{candidate.total_applications !== 1 ? 's' : ''}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {candidate.resume_url && (
                    <button
                      onClick={() => openResume(candidate.resume_url)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                      title="View Resume"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/candidates/${candidate.id}`)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    title="View"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {has('candidates:edit') && (
                    <button
                      onClick={() => navigate(`/candidates/${candidate.id}/edit`)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {has('candidates:delete') && (
                    <button
                      onClick={() => handleDelete(candidate.id, candidate.full_name)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: '#FF4757' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table View */}
      {!loading && viewMode === 'table' && candidates.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <table className="w-full">
            <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Experience</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Skills</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Notice</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Added By</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Applied Jobs</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(candidate => (
                <tr
                  key={candidate.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{candidate.full_name}</p>
                      <div className="flex items-center gap-3 text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
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
                      <p style={{ color: 'var(--text-primary)' }}>{candidate.total_experience_years || 0} years</p>
                      {candidate.current_company && (
                        <p style={{ color: 'var(--text-muted)' }}>{candidate.current_company}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(candidate.skill_tags || []).slice(0, 3).map((skill, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs rounded-full"
                          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                        >
                          {skill}
                        </span>
                      ))}
                      {(candidate.skill_tags || []).length > 3 && (
                        <span
                          className="px-2 py-0.5 text-xs rounded-full"
                          style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                        >
                          +{candidate.skill_tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {candidate.notice_period?.replace('_', ' ') || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {candidate.partner_id
                        ? `Partner (${candidate.partner_name || 'Unknown'})`
                        : (candidate.created_by_name || '—')}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {candidate.total_applications > 0 ? (
                      <Link
                        to={`/applications?candidate_id=${candidate.id}`}
                        className="flex items-center gap-1 text-sm font-medium"
                        style={{ color: 'var(--accent)' }}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        {candidate.total_applications} job{candidate.total_applications !== 1 ? 's' : ''}
                      </Link>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--text-disabled)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={candidate.status}
                      onChange={(e) => handleStatusChange(candidate, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2"
                      style={{
                        ...getStatusStyle(candidate.status),
                        focusRingColor: 'var(--accent)',
                      }}
                    >
                      <option value="active">Active</option>
                      <option value="blacklisted">Blacklisted</option>
                      {userType !== 'partner' && (
                        <option
                          value="apply"
                          disabled={candidate.status === 'blacklisted'}
                        >
                          Apply →
                        </option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {candidate.resume_url && (
                        <button
                          onClick={() => openResume(candidate.resume_url)}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                          title="View Resume"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/candidates/${candidate.id}`)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {has('candidates:edit') && (
                        <button
                          onClick={() => navigate(`/candidates/${candidate.id}/edit`)}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {has('candidates:delete') && (
                        <button
                          onClick={() => handleDelete(candidate.id, candidate.full_name)}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: '#FF4757' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
      )}

      {/* Card view pagination */}
      {!loading && viewMode === 'card' && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={
                              job.score >= 70
                                ? { background: 'rgba(67,233,123,0.15)', color: '#43E97B' }
                                : job.score >= 40
                                ? { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
                                : { background: 'rgba(255,71,87,0.15)', color: '#FF4757' }
                            }
                          >
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
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Candidate Email <span className="text-surface-400 font-normal">(optional)</span>
            </label>
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
        <CandidateImportModal onClose={() => setImportOpen(false)} onImported={loadCandidates} />
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Candidates"
        apiPath="/export/candidates"
        extraFilters={({ status, setStatus }) => (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Status</label>
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
