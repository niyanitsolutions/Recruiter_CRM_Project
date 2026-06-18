import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  ArrowLeft, Edit2, Mail, Phone, MapPin, Briefcase, Calendar,
  GraduationCap, ExternalLink, FileText, Building2, Download,
  Clock, Award, ChevronRight, CheckCircle, XCircle, AlertCircle,
  User, Star, Hash, Globe, Linkedin, RefreshCw,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import candidateService from '../../services/candidateService'
import applicationService from '../../services/applicationService'
import { selectUserType } from '../../store/authSlice'
import { formatDate, formatDateTime, getInitials } from '../../utils/format'
import EmployeeAvatar from '../../components/common/EmployeeAvatar'

// ── Status config ─────────────────────────────────────────────────────────────
const CANDIDATE_STATUS = {
  active:      { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500', label: 'Active' },
  blacklisted: { bg: 'bg-danger-100',  text: 'text-danger-700',  dot: 'bg-danger-500',  label: 'Blacklisted' },
}

const APP_STATUS = {
  applied:        { bg: 'bg-accent-100',   text: 'text-accent-700'   },
  eligible:       { bg: 'bg-teal-100',     text: 'text-teal-700'     },
  screening:      { bg: 'bg-yellow-100',   text: 'text-yellow-700'   },
  shortlisted:    { bg: 'bg-purple-100',   text: 'text-purple-700'   },
  interview:      { bg: 'bg-indigo-100',   text: 'text-indigo-700'   },
  offered:        { bg: 'bg-orange-100',   text: 'text-orange-700'   },
  offer_accepted: { bg: 'bg-success-100',  text: 'text-success-700'  },
  offer_declined: { bg: 'bg-danger-100',   text: 'text-danger-700'   },
  joined:         { bg: 'bg-success-200',  text: 'text-success-800'  },
  rejected:       { bg: 'bg-danger-100',   text: 'text-danger-700'   },
  on_hold:        { bg: 'bg-surface-100',  text: 'text-surface-600'  },
  withdrawn:      { bg: 'bg-pink-100',     text: 'text-pink-700'     },
}

// ── Reusable sub-components ───────────────────────────────────────────────────
const SidebarField = ({ icon: Icon, label, value, href, iconColor = 'text-surface-400' }) => {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-surface-400 mb-0.5">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
             className="text-sm font-medium text-accent-600 hover:text-accent-700 truncate block">
            {value}
          </a>
        ) : (
          <p className="text-sm font-medium text-surface-900 break-words">{value}</p>
        )}
      </div>
    </div>
  )
}

const StatCard = ({ label, value, sub, colorClass = 'text-surface-900', bgClass = 'bg-surface-50' }) => (
  <div className={`${bgClass} rounded-xl p-4 border border-surface-200`}>
    <p className="text-xs text-surface-500 mb-1 font-medium">{label}</p>
    <p className={`text-xl font-bold ${colorClass}`}>{value ?? '—'}</p>
    {sub && <p className="text-xs text-surface-400 mt-0.5">{sub}</p>}
  </div>
)

const SectionHeader = ({ title, count }) => (
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">{title}</h3>
    {count != null && (
      <span className="px-2 py-0.5 bg-surface-100 text-surface-500 rounded-full text-xs font-medium">{count}</span>
    )}
  </div>
)

const AppStatusBadge = ({ status }) => {
  const cfg = APP_STATUS[status] || APP_STATUS.applied
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
const Skeleton = () => (
  <div className="p-6 max-w-7xl mx-auto animate-pulse space-y-6">
    <div className="flex gap-3">
      <div className="h-9 w-9 bg-surface-200 rounded-lg" />
      <div className="h-7 w-48 bg-surface-200 rounded" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="space-y-4">
        <div className="h-80 bg-surface-200 rounded-xl" />
        <div className="h-40 bg-surface-200 rounded-xl" />
      </div>
      <div className="lg:col-span-3 space-y-4">
        <div className="h-12 bg-surface-200 rounded-xl" />
        <div className="h-28 bg-surface-200 rounded-xl" />
        <div className="h-40 bg-surface-200 rounded-xl" />
        <div className="h-32 bg-surface-200 rounded-xl" />
      </div>
    </div>
  </div>
)

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview'            },
  { id: 'skills',      label: 'Skills & Education'  },
  { id: 'applications',label: 'Applications'        },
  { id: 'timeline',    label: 'Timeline'            },
]

// ── Main component ────────────────────────────────────────────────────────────
const CandidateDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const userType = useSelector(selectUserType)
  const [loading, setLoading] = useState(true)
  const [candidate, setCandidate] = useState(null)
  const [applications, setApplications] = useState([])
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => { load() }, [id])

  const load = async () => {
    try {
      setLoading(true)
      const [cRes, aRes] = await Promise.all([
        candidateService.getCandidate(id),
        applicationService.getApplications({ candidate_id: id }),
      ])
      setCandidate(cRes.data)
      setApplications(aRes.data || [])
    } catch {
      toast.error('Failed to load candidate')
      navigate('/candidates')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Skeleton />

  if (!candidate) return (
    <div className="p-6 text-center py-24">
      <AlertCircle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
      <p className="text-surface-500 font-medium">Candidate not found</p>
    </div>
  )

  // Derived values
  const status = CANDIDATE_STATUS[candidate.status] || CANDIDATE_STATUS.active
  const expYrs = candidate.total_experience_years || 0
  const expMos = candidate.total_experience_months || 0
  const expLabel = expYrs > 0 ? `${expYrs}y ${expMos > 0 ? expMos + 'm' : ''}`.trim() : (expMos > 0 ? `${expMos}m` : '0')
  const totalApps  = applications.length
  const activeApps = applications.filter(a => !['rejected', 'withdrawn', 'joined', 'offer_declined'].includes(a.status)).length
  const placed     = applications.filter(a => ['joined', 'offer_accepted', 'offered'].includes(a.status)).length
  const location   = [candidate.current_city, candidate.current_state].filter(Boolean).join(', ')

  // ── Tab renderers ───────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-5">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Experience"   value={expLabel} />
        <StatCard label="Current CTC"  value={candidate.current_ctc ? `₹${candidate.current_ctc} LPA` : '—'} />
        <StatCard label="Expected CTC" value={candidate.expected_ctc ? `₹${candidate.expected_ctc} LPA` : '—'} colorClass="text-success-600" bgClass="bg-success-50" />
        <StatCard label="Notice Period" value={candidate.notice_period?.replace(/_/g, ' ') || '—'} />
      </div>

      {/* Current position */}
      <div className="bg-white border border-surface-200 rounded-xl p-5">
        <SectionHeader title="Current Position" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <SidebarField icon={Building2}   label="Company"     value={candidate.current_company}     iconColor="text-accent-500" />
          <SidebarField icon={Briefcase}   label="Designation" value={candidate.current_designation} iconColor="text-primary-500" />
          <SidebarField icon={MapPin}      label="Location"    value={location}                      iconColor="text-purple-500" />
          <SidebarField icon={Clock}       label="Work Mode"   value={candidate.work_mode_preference} iconColor="text-orange-500" />
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-white border border-surface-200 rounded-xl p-5">
        <SectionHeader title="Preferences" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-surface-500 mb-2">Willing to Relocate</p>
            <div className="flex items-center gap-2">
              {candidate.willing_to_relocate
                ? <CheckCircle className="w-4 h-4 text-success-500" />
                : <XCircle className="w-4 h-4 text-danger-400" />}
              <span className="text-sm font-medium text-surface-900">
                {candidate.willing_to_relocate ? 'Yes, open to relocation' : 'Not willing to relocate'}
              </span>
            </div>
          </div>
          {candidate.preferred_locations?.length > 0 && (
            <div>
              <p className="text-xs text-surface-500 mb-2">Preferred Locations</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.preferred_locations.map((loc, i) => (
                  <span key={i} className="px-2.5 py-1 bg-surface-100 text-surface-700 rounded-full text-xs font-medium">{loc}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {candidate.summary && (
        <div className="bg-white border border-surface-200 rounded-xl p-5">
          <SectionHeader title="Professional Summary" />
          <p className="text-surface-700 leading-relaxed text-sm whitespace-pre-wrap">{candidate.summary}</p>
        </div>
      )}

      {/* Meta */}
      <div className="bg-surface-50 border border-surface-200 rounded-xl p-5">
        <SectionHeader title="Source & Metadata" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Source',      value: candidate.source ? candidate.source.charAt(0).toUpperCase() + candidate.source.slice(1) : '—' },
            { label: 'Partner',     value: candidate.partner_name || null },
            { label: 'Added On',    value: formatDate(candidate.created_at) },
            { label: 'Last Updated',value: formatDate(candidate.updated_at) },
          ].filter(f => f.value).map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-surface-400 mb-0.5">{label}</p>
              <p className="text-sm font-medium text-surface-800">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderSkills = () => (
    <div className="space-y-5">
      {/* Skills */}
      <div className="bg-white border border-surface-200 rounded-xl p-5">
        <SectionHeader title="Technical Skills" count={(candidate.skill_tags || []).length} />
        {(candidate.skill_tags || []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {candidate.skill_tags.map((skill, i) => (
              <span key={i}
                className="px-3 py-1.5 bg-accent-50 text-accent-700 border border-accent-200 rounded-lg text-sm font-medium hover:bg-accent-100 transition-colors cursor-default">
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Star className="w-10 h-10 text-surface-300 mx-auto mb-2" />
            <p className="text-surface-500 text-sm">No skills added yet</p>
          </div>
        )}
      </div>

      {/* Education */}
      <div className="bg-white border border-surface-200 rounded-xl p-5">
        <SectionHeader title="Education" count={(candidate.education || []).length} />
        {(candidate.education || []).length > 0 ? (
          <div className="space-y-3">
            {candidate.education.map((edu, i) => (
              <div key={i} className="flex items-start gap-4 p-4 bg-surface-50 rounded-xl border border-surface-100">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-900">
                    {edu.degree || 'Degree not specified'}
                    {edu.field_of_study ? ` · ${edu.field_of_study}` : ''}
                  </p>
                  {edu.institution && (
                    <p className="text-sm text-surface-600 mt-0.5">{edu.institution}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {(edu.from_year || edu.to_year || edu.year_of_passing) && (
                      <span className="text-xs text-surface-400">
                        {edu.from_year && edu.to_year
                          ? `${edu.from_year} – ${edu.to_year}`
                          : `Class of ${edu.to_year || edu.year_of_passing}`}
                      </span>
                    )}
                    {edu.percentage != null && (
                      <span className="text-xs bg-success-100 text-success-700 px-2 py-0.5 rounded-full font-medium">
                        {edu.percentage}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <GraduationCap className="w-10 h-10 text-surface-300 mx-auto mb-2" />
            <p className="text-surface-500 text-sm">No education details added</p>
          </div>
        )}
      </div>

      {/* Certifications */}
      {(candidate.certifications || []).length > 0 && (
        <div className="bg-white border border-surface-200 rounded-xl p-5">
          <SectionHeader title="Certifications" count={candidate.certifications.length} />
          <div className="space-y-3">
            {candidate.certifications.map((cert, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg border border-surface-100">
                <Award className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-surface-900">{typeof cert === 'string' ? cert : cert.name}</p>
                  {cert.issuer && <p className="text-xs text-surface-500 mt-0.5">{cert.issuer}</p>}
                  {cert.year  && <p className="text-xs text-surface-400">{cert.year}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const renderApplications = () => (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total"  value={totalApps}  />
        <StatCard label="Active" value={activeApps} colorClass="text-accent-600"  bgClass="bg-accent-50" />
        <StatCard label="Placed" value={placed}     colorClass="text-success-600" bgClass="bg-success-50" />
      </div>

      {applications.length === 0 ? (
        <div className="text-center py-20 bg-white border border-surface-200 rounded-xl">
          <Briefcase className="w-12 h-12 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-500 font-medium">No applications yet</p>
          <p className="text-surface-400 text-sm mt-1">Applications will appear here once submitted</p>
        </div>
      ) : (
        <div className="space-y-2">
          {applications.map(app => (
            <Link
              key={app.id}
              to={`/applications/${app.id}`}
              className="flex items-center gap-4 p-4 bg-white border border-surface-200 rounded-xl hover:border-accent-300 hover:shadow-sm transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-accent-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-surface-900 truncate">{app.job_title}</p>
                <p className="text-xs text-surface-500 mt-0.5">{app.client_name}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <AppStatusBadge status={app.status} />
                <span className="text-xs text-surface-400 hidden sm:block">{formatDate(app.applied_at)}</span>
                <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-accent-500 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  const renderTimeline = () => {
    const events = [
      { dot: 'bg-accent-500', date: candidate.created_at, title: 'Profile Created', desc: `Added via ${candidate.source || 'manual entry'}` },
      ...(candidate.updated_at && candidate.updated_at !== candidate.created_at
        ? [{ dot: 'bg-primary-400', date: candidate.updated_at, title: 'Profile Updated', desc: 'Candidate profile was modified' }]
        : []),
      ...applications.map(app => ({
        dot: 'bg-purple-400',
        date: app.applied_at,
        title: `Applied — ${app.job_title}`,
        desc: app.client_name,
        badge: app.status,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))

    return (
      <div className="bg-white border border-surface-200 rounded-xl p-5">
        <SectionHeader title="Activity Timeline" count={events.length} />
        {events.length === 0 ? (
          <p className="text-surface-500 text-sm text-center py-8">No activity recorded</p>
        ) : (
          <div className="relative pl-7">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-surface-200" />
            <div className="space-y-6">
              {events.map((ev, i) => (
                <div key={i} className="relative">
                  <div className={`absolute -left-7 top-1.5 w-3 h-3 rounded-full ${ev.dot} border-2 border-white shadow`} />
                  <p className="text-sm font-semibold text-surface-900">{ev.title}</p>
                  <p className="text-xs text-surface-500 mt-0.5">{formatDateTime(ev.date)}</p>
                  {ev.desc && <p className="text-xs text-surface-400 mt-0.5">{ev.desc}</p>}
                  {ev.badge && <AppStatusBadge status={ev.badge} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const tabContent = {
    overview:     renderOverview,
    skills:       renderSkills,
    applications: renderApplications,
    timeline:     renderTimeline,
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/candidates')}
          className="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-400 font-medium">Candidates</p>
          <h1 className="text-xl font-bold text-surface-900 truncate">{candidate.full_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-400" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          {userType !== 'partner' && (
            <Link
              to={`/interviews/schedule?candidate_id=${id}`}
              className="hidden sm:flex items-center gap-2 px-3 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Schedule Interview
            </Link>
          )}
          <Link
            to={`/candidates/${id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Left sidebar ────────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile card */}
          <div className="bg-white border border-surface-200 rounded-xl p-5 sticky top-6">
            {/* Avatar + name */}
            <div className="flex flex-col items-center text-center mb-5 pb-5 border-b border-surface-100">
              <div className="mb-3">
                <EmployeeAvatar
                  name={candidate.full_name}
                  photoUrl={candidate.photo_url}
                  size={80}
                  style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
                />
              </div>
              <h2 className="text-base font-bold text-surface-900">{candidate.full_name}</h2>
              {(candidate.current_designation || candidate.current_company) && (
                <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">
                  {[candidate.current_designation, candidate.current_company].filter(Boolean).join(' · ')}
                </p>
              )}
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mt-3 ${status.bg} ${status.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>

            {/* Application mini stats */}
            <div className="grid grid-cols-3 gap-1 mb-5">
              {[
                { label: 'Total',  val: totalApps,  color: 'text-surface-900' },
                { label: 'Active', val: activeApps, color: 'text-accent-600'  },
                { label: 'Placed', val: placed,     color: 'text-success-600' },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center p-2 bg-surface-50 rounded-lg">
                  <p className={`text-lg font-bold ${color}`}>{val}</p>
                  <p className="text-xs text-surface-400">{label}</p>
                </div>
              ))}
            </div>

            {/* Contact fields */}
            <div className="space-y-3">
              <SidebarField icon={Mail}        label="Email"    value={candidate.email}  href={`mailto:${candidate.email}`}  iconColor="text-accent-500" />
              <SidebarField icon={Phone}       label="Mobile"   value={candidate.mobile} href={`tel:${candidate.mobile}`}    iconColor="text-success-500" />
              <SidebarField icon={MapPin}      label="Location" value={location}                                              iconColor="text-purple-500" />
              {candidate.linkedin_url && (
                <SidebarField icon={ExternalLink} label="LinkedIn" value="View Profile" href={candidate.linkedin_url} iconColor="text-indigo-500" />
              )}
              {candidate.portfolio_url && (
                <SidebarField icon={Globe}     label="Portfolio" value="View Portfolio" href={candidate.portfolio_url} iconColor="text-teal-500" />
              )}
            </div>

            {/* Experience pill */}
            <div className="mt-4 pt-4 border-t border-surface-100 flex items-center justify-between text-sm">
              <span className="text-surface-500">Experience</span>
              <span className="font-semibold text-surface-900">{expLabel}</span>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white border border-surface-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Quick Actions</p>
            {userType !== 'partner' && (
              <Link
                to={`/interviews/schedule?candidate_id=${id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Calendar className="w-4 h-4" />
                Schedule Interview
              </Link>
            )}
            {candidate.resume_url && (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Resume
              </a>
            )}
            <Link
              to={`/candidates/${id}/edit`}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors"
            >
              <FileText className="w-4 h-4" />
              Update Profile
            </Link>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-3">
          {/* Tab bar */}
          <div className="bg-white border border-surface-200 rounded-xl mb-5 overflow-x-auto">
            <div className="flex min-w-max">
              {TABS.map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-accent-500 text-accent-600'
                      : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
                  } ${i === 0 ? 'rounded-tl-xl' : ''}`}
                >
                  {tab.label}
                  {tab.id === 'applications' && totalApps > 0 && (
                    <span className="px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded text-xs">{totalApps}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {(tabContent[activeTab] || tabContent.overview)()}
        </div>
      </div>
    </div>
  )
}

export default CandidateDetails
