import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit, Building2, MapPin, Clock,
  Users, IndianRupee, AlertCircle, Search
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/jobService'
import applicationService from '../../services/applicationService'

const JobDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState(null)
  const [applications, setApplications] = useState([])

  useEffect(() => {
    loadJob()
  }, [id])

  const loadJob = async () => {
    try {
      setLoading(true)
      const jobRes = await jobService.getJob(id)
      setJob(jobRes.data)
    } catch (error) {
      console.error('Failed to load job:', error)
      toast.error(error.response?.data?.detail || 'Failed to load job')
      navigate('/jobs')
      return
    } finally {
      setLoading(false)
    }

    // Load applications separately — don't let this failure affect job view
    try {
      const appsRes = await applicationService.getApplications({ job_id: id, page_size: 10 })
      setApplications(appsRes.data || [])
    } catch (error) {
      console.error('Failed to load applications for job:', error)
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

  const getAppStatusBadge = (status) => {
    const colors = {
      applied: 'bg-blue-100 text-blue-800',
      screening: 'bg-yellow-100 text-yellow-800',
      shortlisted: 'bg-purple-100 text-purple-800',
      interview: 'bg-indigo-100 text-indigo-800',
      offered: 'bg-orange-100 text-orange-800',
      joined: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-6 text-center">
        <p className="text-surface-500">Job not found</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/jobs')}
            className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              {job.priority === 'urgent' && (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <h1 className="text-2xl font-bold text-surface-900">{job.title}</h1>
            </div>
            <p className="text-surface-500">{job.job_code}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(job.status)}`}>
            {job.status?.replace('_', ' ')}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityBadge(job.priority)}`}>
            {job.priority}
          </span>
          <Link
            to={`/jobs/edit/${id}`}
            className="btn-secondary flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client & Location */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-surface-500">Client</p>
                  <p className="font-medium text-surface-900">{job.client_name}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-surface-500">Location</p>
                  <p className="font-medium text-surface-900">
                    {job.city}, {job.state}, {job.country}
                  </p>
                  <p className="text-sm text-surface-500 capitalize">{job.work_mode}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-surface-500">Experience</p>
                  <p className="font-medium text-surface-900">
                    {job.experience?.min || 0} - {job.experience?.max || 'Any'} years
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                  <IndianRupee className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-surface-500">Salary Range</p>
                  <p className="font-medium text-surface-900">
                    ₹{job.salary?.min || 0} - ₹{job.salary?.max || 'Negotiable'} LPA
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Positions Progress */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Positions</h2>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-surface-600">
                    {job.filled_positions || 0} of {job.total_positions} filled
                  </span>
                  <span className="text-sm font-medium text-surface-900">
                    {Math.round(((job.filled_positions || 0) / job.total_positions) * 100)}%
                  </span>
                </div>
                <div className="w-full h-3 bg-surface-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${((job.filled_positions || 0) / job.total_positions) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-center px-4 border-l border-surface-200">
                <p className="text-2xl font-bold text-surface-900">{job.total_applications || 0}</p>
                <p className="text-sm text-surface-500">Applications</p>
              </div>
            </div>
          </div>

          {/* Eligibility Criteria */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Eligibility Criteria</h2>
            
            {/* Mandatory Skills */}
            {job.eligibility_criteria?.mandatory_skills?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-surface-500 mb-2">Mandatory Skills</p>
                <div className="flex flex-wrap gap-2">
                  {job.eligibility_criteria.mandatory_skills.map((skill, i) => (
                    <span key={i} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Skills */}
            {job.eligibility_criteria?.optional_skills?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-surface-500 mb-2">Good to Have</p>
                <div className="flex flex-wrap gap-2">
                  {job.eligibility_criteria.optional_skills.map((skill, i) => (
                    <span key={i} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-surface-200">
              <div>
                <p className="text-sm text-surface-500">Max Notice Period</p>
                <p className="font-medium text-surface-900">
                  {job.eligibility_criteria?.notice_period_max?.replace('_', ' ') || 'Any'}
                </p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Max Current CTC</p>
                <p className="font-medium text-surface-900">
                  {job.eligibility_criteria?.ctc_max ? `₹${job.eligibility_criteria.ctc_max} LPA` : 'Any'}
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          {job.description && (
            <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">Description</h2>
              <p className="text-surface-600 whitespace-pre-wrap">{job.description}</p>
            </div>
          )}

          {/* Requirements */}
          {job.requirements && (
            <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">Requirements</h2>
              <p className="text-surface-600 whitespace-pre-wrap">{job.requirements}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Actions</h2>
            <div className="space-y-2">
              <Link
                to={`/jobs/${id}/matching`}
                className="w-full btn-primary justify-center flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                Find Matching Candidates
              </Link>
              <Link
                to={`/applications?job_id=${id}`}
                className="w-full btn-secondary justify-center flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                View All Applications
              </Link>
            </div>
          </div>

          {/* Quick Info */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Quick Info</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-surface-500">Job Type</p>
                <p className="font-medium text-surface-900 capitalize">{job.job_type?.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Posted</p>
                <p className="font-medium text-surface-900">
                  {new Date(job.created_at).toLocaleDateString()}
                </p>
              </div>
              {job.target_date && (
                <div>
                  <p className="text-sm text-surface-500">Target Date</p>
                  <p className="font-medium text-surface-900">
                    {new Date(job.target_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-surface-500">Visible to Partners</p>
                <p className="font-medium text-surface-900">
                  {job.visible_to_partners ? 'Yes' : 'No'}
                </p>
              </div>
              {job.partner_commission && (
                <div>
                  <p className="text-sm text-surface-500">Partner Commission</p>
                  <p className="font-medium text-surface-900">{job.partner_commission}%</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Applications */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-900">Recent Applications</h2>
              <Link to={`/applications?job_id=${id}`} className="text-sm text-primary-600 hover:text-primary-700">
                View All
              </Link>
            </div>
            
            {applications.length === 0 ? (
              <p className="text-surface-500 text-sm">No applications yet</p>
            ) : (
              <div className="space-y-3">
                {applications.slice(0, 5).map(app => (
                  <Link
                    key={app.id}
                    to={`/applications/${app.id}`}
                    className="block p-3 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors"
                  >
                    <p className="font-medium text-surface-900 text-sm">{app.candidate_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAppStatusBadge(app.status)}`}>
                        {app.status?.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-surface-500">
                        {new Date(app.applied_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default JobDetails