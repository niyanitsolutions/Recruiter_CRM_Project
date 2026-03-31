import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Briefcase, Plus, Search, Filter, Eye, Edit, Trash2,
  Building2, MapPin, Users, Clock, AlertCircle
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/jobService'
import usePermissions from '../../hooks/usePermissions'

const Jobs = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
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

  useEffect(() => {
    loadDropdowns()
  }, [])

  useEffect(() => {
    loadJobs()
  }, [pagination.page, filters])

  const loadDropdowns = async () => {
    try {
      const [statusRes, typeRes, modeRes, priorityRes] = await Promise.all([
        jobService.getStatuses(),
        jobService.getJobTypes(),
        jobService.getWorkModes(),
        jobService.getPriorities()
      ])
      setStatuses(statusRes.data || [])
      setJobTypes(typeRes.data || [])
      setWorkModes(modeRes.data || [])
      setPriorities(priorityRes.data || [])
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadJobs = async () => {
    try {
      setLoading(true)
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
    } catch (error) {
      toast.error('Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

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

  const getStatusBadge = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      open: 'bg-green-100 text-green-800',
      on_hold: 'bg-yellow-100 text-yellow-800',
      filled: 'bg-blue-100 text-blue-800',
      closed: 'bg-red-100 text-red-800',
      cancelled: 'bg-pink-100 text-pink-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityBadge = (priority) => {
    const colors = {
      urgent: 'bg-red-100 text-red-800 border border-red-300',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-blue-100 text-blue-800',
      low: 'bg-gray-100 text-gray-800'
    }
    return colors[priority] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Jobs</h1>
          <p className="text-surface-500">Manage job postings and requirements</p>
        </div>
        {has('jobs:create') && (
          <Link
            to="/jobs/new"
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Job
          </Link>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
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
            className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-surface-100' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-surface-200">
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
              value={filters.job_type}
              onChange={(e) => setFilters(prev => ({ ...prev, job_type: e.target.value }))}
              className="input"
            >
              <option value="">All Job Types</option>
              {jobTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <select
              value={filters.work_mode}
              onChange={(e) => setFilters(prev => ({ ...prev, work_mode: e.target.value }))}
              className="input"
            >
              <option value="">All Work Modes</option>
              {workModes.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="input"
            >
              <option value="">All Priorities</option>
              {priorities.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Jobs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2 text-surface-500">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-white rounded-xl border border-surface-200">
            <Briefcase className="w-12 h-12 text-surface-300 mx-auto mb-4" />
            <p className="text-surface-500">No jobs found</p>
          </div>
        ) : (
          jobs.map(job => (
            <div
              key={job.id}
              className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {job.priority === 'urgent' && (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <h3 className="font-semibold text-surface-900 line-clamp-1">
                      {job.title}
                    </h3>
                  </div>
                  <p className="text-sm text-surface-500">{job.job_code}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(job.status)}`}>
                  {job.status?.replace('_', ' ')}
                </span>
              </div>

              {/* Client */}
              <div className="flex items-center gap-2 text-sm text-surface-600 mb-3">
                <Building2 className="w-4 h-4 text-surface-400" />
                <span className="line-clamp-1">{job.client_name}</span>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                {job.city && (
                  <div className="flex items-center gap-1 text-surface-600">
                    <MapPin className="w-3 h-3" />
                    <span>{job.city}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-surface-600">
                  <Briefcase className="w-3 h-3" />
                  <span>{job.job_type?.replace('_', ' ')}</span>
                </div>
                {job.experience_min !== undefined && (
                  <div className="flex items-center gap-1 text-surface-600">
                    <Clock className="w-3 h-3" />
                    <span>{job.experience_min}-{job.experience_max} yrs</span>
                  </div>
                )}
              </div>

              {/* Positions */}
              <div className="flex items-center justify-between py-2 border-t border-surface-100">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-surface-400" />
                    <span className="text-surface-600">
                      {job.filled_positions || 0}/{job.total_positions} filled
                    </span>
                  </div>
                  <div className="text-surface-500">
                    {job.total_applications || 0} applications
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadge(job.priority)}`}>
                  {job.priority}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-surface-100">
                <button
                  onClick={() => {
                    if (!job.id) return
                    navigate(`/jobs/view/${job.id}`)
                  }}
                  className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                  title="View Job"
                >
                  <Eye className="w-4 h-4 text-surface-500" />
                </button>
                {has('jobs:edit') && (
                  <button
                    onClick={() => {
                      if (!job.id) return
                      navigate(`/jobs/edit/${job.id}`)
                    }}
                    className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                    title="Edit Job"
                  >
                    <Edit className="w-4 h-4 text-surface-500" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!job.id) return
                    navigate(`/jobs/${job.id}/matching`)
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
                >
                  Find Matching
                </button>
                {has('jobs:delete') && (
                  <button
                    onClick={() => handleDelete(job.id, job.title)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-surface-500">
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
    </div>
  )
}

export default Jobs