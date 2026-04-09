import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  User, ArrowLeft, Edit, Mail, Phone, MapPin, Briefcase,
  Calendar, Clock, GraduationCap, ExternalLink, FileText,
  Building2, IndianRupee, CheckCircle, AlertCircle
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import candidateService from '../../services/candidateService'
import applicationService from '../../services/applicationService'
import { selectUserType } from '../../store/authSlice'

const CandidateDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const userType = useSelector(selectUserType)
  const [loading, setLoading] = useState(true)
  const [candidate, setCandidate] = useState(null)
  const [applications, setApplications] = useState([])

  useEffect(() => {
    loadCandidate()
  }, [id])

  const loadCandidate = async () => {
    try {
      setLoading(true)
      const [candidateRes, appsRes] = await Promise.all([
        candidateService.getCandidate(id),
        applicationService.getApplications({ candidate_id: id })
      ])
      setCandidate(candidateRes.data)
      setApplications(appsRes.data || [])
    } catch (error) {
      toast.error('Failed to load candidate')
      navigate('/candidates')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status) => {
    const colors = {
      // Candidate global statuses
      active: 'bg-green-100 text-green-800',
      blacklisted: 'bg-red-200 text-red-900',
      // Application pipeline statuses (used in sidebar)
      applied: 'bg-blue-100 text-blue-800',
      eligible: 'bg-teal-100 text-teal-800',
      screening: 'bg-yellow-100 text-yellow-800',
      shortlisted: 'bg-purple-100 text-purple-800',
      interview: 'bg-indigo-100 text-indigo-800',
      offered: 'bg-orange-100 text-orange-800',
      joined: 'bg-green-200 text-green-900',
      rejected: 'bg-red-100 text-red-800',
      on_hold: 'bg-gray-100 text-gray-800',
      withdrawn: 'bg-pink-100 text-pink-800',
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

  if (!candidate) {
    return (
      <div className="p-6 text-center">
        <p className="text-surface-500">Candidate not found</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/candidates')}
            className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">{candidate.full_name}</h1>
            <p className="text-surface-500">{candidate.current_designation} at {candidate.current_company}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(candidate.status)}`}>
            {candidate.status === 'blacklisted' ? 'Blacklisted' : 'Active'}
          </span>
          <Link
            to={`/candidates/${id}/edit`}
            className="btn-primary flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Information */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-surface-500">Email</p>
                  <a href={`mailto:${candidate.email}`} className="text-surface-900 hover:text-primary-600">
                    {candidate.email}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-surface-500">Phone</p>
                  <a href={`tel:${candidate.mobile}`} className="text-surface-900 hover:text-primary-600">
                    {candidate.mobile}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-surface-500">Location</p>
                  <p className="text-surface-900">{candidate.current_city}, {candidate.current_state}</p>
                </div>
              </div>

              {candidate.linkedin_url && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <ExternalLink className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-surface-500">LinkedIn</p>
                    <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700">
                      View Profile
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Professional Information */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Professional Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-surface-500 mb-1">Total Experience</p>
                <p className="text-lg font-medium text-surface-900">
                  {candidate.total_experience_years || 0} years {candidate.total_experience_months || 0} months
                </p>
              </div>

              <div>
                <p className="text-sm text-surface-500 mb-1">Current Company</p>
                <p className="text-lg font-medium text-surface-900">{candidate.current_company || '-'}</p>
              </div>

              <div>
                <p className="text-sm text-surface-500 mb-1">Current Designation</p>
                <p className="text-lg font-medium text-surface-900">{candidate.current_designation || '-'}</p>
              </div>

              <div>
                <p className="text-sm text-surface-500 mb-1">Notice Period</p>
                <p className="text-lg font-medium text-surface-900">
                  {candidate.notice_period?.replace('_', ' ') || '-'}
                </p>
              </div>

              <div>
                <p className="text-sm text-surface-500 mb-1">Current CTC</p>
                <p className="text-lg font-medium text-surface-900">
                  {candidate.current_ctc ? `₹${candidate.current_ctc} LPA` : '-'}
                </p>
              </div>

              <div>
                <p className="text-sm text-surface-500 mb-1">Expected CTC</p>
                <p className="text-lg font-medium text-surface-900">
                  {candidate.expected_ctc ? `₹${candidate.expected_ctc} LPA` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {(candidate.skill_tags || []).map((skill, i) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium"
                >
                  {skill}
                </span>
              ))}
              {(candidate.skill_tags || []).length === 0 && (
                <p className="text-surface-500">No skills added</p>
              )}
            </div>
          </div>

          {/* Education */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Education</h2>
            {(candidate.education || []).length > 0 ? (
              <div className="space-y-4">
                {candidate.education.map((edu, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium text-surface-900">
                        {edu.degree || 'Not specified'}
                        {edu.field_of_study ? ` — ${edu.field_of_study}` : ''}
                      </p>
                      {edu.institution && (
                        <p className="text-surface-600">{edu.institution}</p>
                      )}
                      <p className="text-sm text-surface-500">
                        {edu.from_year && edu.to_year
                          ? `${edu.from_year} – ${edu.to_year}`
                          : edu.to_year || edu.year_of_passing
                          ? `Graduated: ${edu.to_year || edu.year_of_passing}`
                          : 'Not Specified'}
                      </p>
                      {edu.percentage != null && (
                        <p className="text-sm text-surface-500">Score: {edu.percentage}%</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="text-surface-500 mt-2">No education details added</p>
              </div>
            )}
          </div>

          {/* Summary */}
          {candidate.summary && (
            <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">Summary</h2>
              <p className="text-surface-600 whitespace-pre-wrap">{candidate.summary}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Info */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Quick Info</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-surface-500">Source</p>
                <p className="font-medium text-surface-900 capitalize">{candidate.source || '-'}</p>
              </div>
              {candidate.partner_name && (
                <div>
                  <p className="text-sm text-surface-500">Partner</p>
                  <p className="font-medium text-surface-900">Partner ({candidate.partner_name})</p>
                </div>
              )}
              <div>
                <p className="text-sm text-surface-500">Created</p>
                <p className="font-medium text-surface-900">
                  {new Date(candidate.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Willing to Relocate</p>
                <p className="font-medium text-surface-900">
                  {candidate.willing_to_relocate ? 'Yes' : 'No'}
                </p>
              </div>
              {candidate.preferred_locations?.length > 0 && (
                <div>
                  <p className="text-sm text-surface-500">Preferred Locations</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {candidate.preferred_locations.map((loc, i) => (
                      <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Applications */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Applications ({applications.length})</h2>
            {applications.length === 0 ? (
              <p className="text-surface-500 text-sm">No applications yet</p>
            ) : (
              <div className="space-y-3">
                {applications.map(app => (
                  <Link
                    key={app.id}
                    to={`/applications/${app.id}`}
                    className="block p-3 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors"
                  >
                    <p className="font-medium text-surface-900 text-sm">{app.job_title}</p>
                    <p className="text-xs text-surface-500">{app.client_name}</p>
                    <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(app.status)}`}>
                      {app.status?.replace('_', ' ')}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Actions</h2>
            <div className="space-y-2">
              {userType !== 'partner' && (
                <Link
                  to={`/interviews/schedule?candidate_id=${id}`}
                  className="w-full btn-secondary justify-center flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Schedule Interview
                </Link>
              )}
              <button
                onClick={() => navigate(`/candidates/${id}/edit`)}
                className="w-full btn-secondary justify-center flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Update Resume
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CandidateDetails