import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Briefcase, Plus, Search, Filter, Eye, Edit, Trash2,
  Building2, MapPin, Users, Clock, AlertCircle, Download, Upload,
  List, LayoutGrid, RefreshCw
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSelector } from 'react-redux'
import jobService from '../../services/jobService'
import usePermissions from '../../hooks/usePermissions'
import ExportModal from '../../components/common/ExportModal'
import { useLivePolling } from '../../hooks/useLivePolling'
import JobImportModal from '../../components/common/JobImportModal'
import { SkeletonTableRows, SkeletonCards } from '../../components/common/SkeletonLoader'
import { selectUserType } from '../../store/authSlice'
import TableScroll from '../../components/common/TableScroll'

const _dropdownCache = { statuses: null, jobTypes: null, workModes: null, priorities: null }

const STATUS_COLORS = {
  draft:     { border: '#8B8FA8', badge: { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' } },
  open:      { border: '#43E97B', badge: { background: 'rgba(67,233,123,0.15)',  color: '#43E97B' } },
  on_hold:   { border: '#F59E0B', badge: { background: 'rgba(245,158,11,0.15)',  color: '#F59E0B' } },
  filled:    { border: '#4FACFE', badge: { background: 'rgba(79,172,254,0.15)',  color: '#4FACFE' } },
  closed:    { border: '#FF4757', badge: { background: 'rgba(255,71,87,0.15)',   color: '#FF4757' } },
  cancelled: { border: '#FF6B9D', badge: { background: 'rgba(255,107,157,0.15)', color: '#FF6B9D' } },
}

const PRIORITY_STYLES = {
  urgent: { background: 'rgba(255,71,87,0.15)',   color: '#FF4757', boxShadow: 'inset 0 0 0 1px rgba(255,71,87,0.4)' },
  high:   { background: 'rgba(251,146,60,0.15)',  color: '#FB923C' },
  medium: { background: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  low:    { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
}

const Jobs = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const userType = useSelector(selectUserType)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({
    keyword: '',
    client_id: '',
    status: '',
    job_type: '',
    work_mode: '',
    priority: ''
  })
  const [showFilters, setShowFilters] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [jobTypes, setJobTypes] = useState([])
  const [workModes, setWorkModes] = useState([])
  const [priorities, setPriorities] = useState([])
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [viewMode, setViewMode] = useState('table')
  const _debounceTimer = useRef(null)
  const _prevKeyword = useRef(filters.keyword)

  useEffect(() => { loadDropdowns() }, [])

  useEffect(() => {
    if (_debounceTimer.current) clearTimeout(_debounceTimer.current)
    const keywordChanged = filters.keyword !== _prevKeyword.current
    _prevKeyword.current = filters.keyword
    const delay = keywordChanged ? 400 : 0
    _debounceTimer.current = setTimeout(() => { loadJobs() }, delay)
    return () => clearTimeout(_debounceTimer.current)
  }, [pagination.page, filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDropdowns = async () => {
    if (_dropdownCache.statuses) {
      setStatuses(_dropdownCache.statuses)
      setJobTypes(_dropdownCache.jobTypes)
      setWorkModes(_dropdownCache.workModes)
      setPriorities(_dropdownCache.priorities)
      return
    }
    try {
      const [statusRes, typeRes, modeRes, priorityRes] = await Promise.all([
        jobService.getStatuses(),
        jobService.getJobTypes(),
        jobService.getWorkModes(),
        jobService.getPriorities()
      ])
      _dropdownCache.statuses   = statusRes.data || []
      _dropdownCache.jobTypes   = typeRes.data || []
      _dropdownCache.workModes  = modeRes.data || []
      _dropdownCache.priorities = priorityRes.data || []
      setStatuses(_dropdownCache.statuses)
      setJobTypes(_dropdownCache.jobTypes)
      setWorkModes(_dropdownCache.workModes)
      setPriorities(_dropdownCache.priorities)
    } catch (error) {
      toast.error('Failed to load filter options')
    }
  }

  const loadJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const params = {
        page: pagination.page,
        page_size: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      }
      const response = await jobService.getJobs(params)
      setJobs(response.data || [])
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.total_pages || 0
      }))
    } catch {
      if (!silent) toast.error('Failed to load jobs')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Live background refresh (Task 8) — silent, no visible reload
  useLivePolling(() => loadJobs(true), 5000)

  const handleDelete = async (jobId, jobTitle) => {
    if (!confirm(`Are you sure you want to delete "${jobTitle}"?`)) return
    try {
      await jobService.deleteJob(jobId)
      toast.success('Job deleted successfully')
      loadJobs()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete job')
    }
  }

  const getCardStyle = (status) => ({
    background: 'var(--bg-card)',
    border: '1px solid var(--border-card)',
    borderTop: `3px solid ${STATUS_COLORS[status]?.border || '#8B8FA8'}`,
    borderRadius: '12px',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
  })

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Jobs</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage job postings and requirements</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {has('exports:create') && (
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {has('jobs:create') && (
            <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Import
            </button>
          )}
          {has('jobs:create') && (
            <Link to="/jobs/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Job
            </Link>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search jobs..."
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
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="input"
            >
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={filters.job_type}
              onChange={(e) => setFilters(prev => ({ ...prev, job_type: e.target.value }))}
              className="input"
            >
              <option value="">All Job Types</option>
              {jobTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select
              value={filters.work_mode}
              onChange={(e) => setFilters(prev => ({ ...prev, work_mode: e.target.value }))}
              className="input"
            >
              <option value="">All Work Modes</option>
              {workModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="input"
            >
              <option value="">All Priorities</option>
              {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* View Toggle */}
      <div className="flex items-center justify-end mb-4 gap-1">
        <button
          onClick={() => setViewMode('table')}
          className="p-2 rounded-lg transition-colors"
          style={viewMode === 'table' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}
          title="Table view"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => setViewMode('card')}
          className="p-2 rounded-lg transition-colors"
          style={viewMode === 'card' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}
          title="Card view"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          {loading ? (
            <SkeletonTableRows rows={8} cols={8} />
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center">
              <Briefcase className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
              <p style={{ color: 'var(--text-muted)' }}>No jobs found</p>
            </div>
          ) : (
            <TableScroll>
            <table className="w-full">
              <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Job</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Client</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Type / Mode</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Experience</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Positions</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Priority</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr
                    key={job.id}
                    className="transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    onClick={() => navigate(`/jobs/view/${job.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {job.priority === 'urgent' && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#FF4757' }} />}
                        <div>
                          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{job.title}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{job.job_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                        <span>{job.client_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {job.job_type?.replace('_', ' ')}
                        {job.work_mode && ` · ${job.work_mode?.replace('_', ' ')}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {job.experience_min !== undefined ? `${job.experience_min}–${job.experience_max} yrs` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {job.filled_positions || 0}/{job.total_positions}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={PRIORITY_STYLES[job.priority] || PRIORITY_STYLES.low}>
                        {job.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-medium" style={STATUS_COLORS[job.status]?.badge || STATUS_COLORS.draft.badge}>
                        {job.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`/jobs/view/${job.id}`)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = ''} title="View"><Eye className="w-4 h-4" /></button>
                        {has('jobs:edit') && <button onClick={() => navigate(`/jobs/edit/${job.id}`)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = ''} title="Edit"><Edit className="w-4 h-4" /></button>}
                        {has('jobs:delete') && <button onClick={() => handleDelete(job.id, job.title)} className="p-2 rounded-lg transition-colors" style={{ color: '#FF4757' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'} onMouseLeave={e => e.currentTarget.style.background = ''} title="Delete"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}
        </div>
      )}

      {/* Card View */}
      {viewMode === 'card' && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full">
            <SkeletonCards count={6} />
          </div>
        ) : jobs.length === 0 ? (
          <div
            className="col-span-full p-8 text-center rounded-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          >
            <Briefcase className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
            <p style={{ color: 'var(--text-muted)' }}>No jobs found</p>
          </div>
        ) : (
          jobs.map(job => (
            <div
              key={job.id}
              className="p-4 animate-stagger"
              style={getCardStyle(job.status)}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = 'var(--shadow-elevated)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    {job.priority === 'urgent' && (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF4757' }} />
                    )}
                    <h3 className="font-semibold line-clamp-1" style={{ color: 'var(--text-primary)' }}>
                      {job.title}
                    </h3>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{job.job_code}</p>
                </div>
                <span
                  className="px-2 py-1 rounded-full text-xs font-medium flex-shrink-0"
                  style={STATUS_COLORS[job.status]?.badge || STATUS_COLORS.draft.badge}
                >
                  {job.status?.replace('_', ' ')}
                </span>
              </div>

              {/* Client */}
              <div className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="line-clamp-1">{job.client_name}</span>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                {job.city && (
                  <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <MapPin className="w-3 h-3" />
                    <span>{job.city}</span>
                  </div>
                )}
                <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                  <Briefcase className="w-3 h-3" />
                  <span>{job.job_type?.replace('_', ' ')}</span>
                </div>
                {job.experience_min !== undefined && (
                  <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <Clock className="w-3 h-3" />
                    <span>{job.experience_min}-{job.experience_max} yrs</span>
                  </div>
                )}
              </div>

              {/* Positions */}
              <div className="flex items-center justify-between py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {job.filled_positions || 0}/{job.total_positions} filled
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {job.total_applications || 0} apps
                  </div>
                </div>
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={PRIORITY_STYLES[job.priority] || PRIORITY_STYLES.low}
                >
                  {job.priority}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => { if (!job.id) return; navigate(`/jobs/view/${job.id}`) }}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                  title="View Job"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {has('jobs:edit') && (
                  <button
                    onClick={() => { if (!job.id) return; navigate(`/jobs/edit/${job.id}`) }}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    title="Edit Job"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                {userType !== 'partner' && (
                  <button
                    onClick={() => { if (!job.id) return; navigate(`/jobs/${job.id}/matching`) }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    style={{ color: 'var(--accent)', border: '1px solid rgba(108,99,255,0.35)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    Find Matching
                  </button>
                )}
                {has('jobs:delete') && (
                  <button
                    onClick={() => handleDelete(job.id, job.title)}
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
            </div>
          ))
        )}
      </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Showing {jobs.length} of {pagination.total} jobs
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

      {importOpen && (
        <JobImportModal onClose={() => setImportOpen(false)} onImported={loadJobs} />
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Jobs"
        apiPath="/export/jobs"
        extraFilters={({ status, setStatus }) => (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input w-full">
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
      />
    </div>
  )
}

export default Jobs
