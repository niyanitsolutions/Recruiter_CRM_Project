import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Building2, MapPin, Clock, Users, IndianRupee,
  AlertCircle, Search, Briefcase, Calendar, CheckCircle, BarChart3,
  Target, Star, RefreshCw, ChevronRight, FileText, Hash, Zap,
  TrendingUp, Circle,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/jobService'
import applicationService from '../../services/applicationService'
import { formatDate, formatStatus } from '../../utils/format'

// ── Status / priority config ──────────────────────────────────────────────────
const JOB_STATUS = {
  draft:     { bg: 'bg-surface-100', text: 'text-surface-600', label: 'Draft'     },
  open:      { bg: 'bg-success-100', text: 'text-success-700', label: 'Open'      },
  on_hold:   { bg: 'bg-yellow-100',  text: 'text-yellow-700',  label: 'On Hold'   },
  filled:    { bg: 'bg-accent-100',  text: 'text-accent-700',  label: 'Filled'    },
  closed:    { bg: 'bg-danger-100',  text: 'text-danger-700',  label: 'Closed'    },
  cancelled: { bg: 'bg-pink-100',    text: 'text-pink-700',    label: 'Cancelled' },
}

const PRIORITY = {
  urgent: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Urgent' },
  high:   { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High'   },
  medium: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Medium' },
  low:    { bg: 'bg-surface-100',text: 'text-surface-600',label: 'Low'    },
}

const APP_STATUS = {
  applied:     { bg: 'bg-accent-100',   text: 'text-accent-700',   bar: 'bg-accent-500'   },
  eligible:    { bg: 'bg-teal-100',     text: 'text-teal-700',     bar: 'bg-teal-500'     },
  screening:   { bg: 'bg-yellow-100',   text: 'text-yellow-700',   bar: 'bg-yellow-500'   },
  shortlisted: { bg: 'bg-purple-100',   text: 'text-purple-700',   bar: 'bg-purple-500'   },
  interview:   { bg: 'bg-indigo-100',   text: 'text-indigo-700',   bar: 'bg-indigo-500'   },
  offered:     { bg: 'bg-orange-100',   text: 'text-orange-700',   bar: 'bg-orange-500'   },
  joined:      { bg: 'bg-success-100',  text: 'text-success-700',  bar: 'bg-success-500'  },
  rejected:    { bg: 'bg-danger-100',   text: 'text-danger-700',   bar: 'bg-danger-500'   },
  on_hold:     { bg: 'bg-surface-100',  text: 'text-surface-600',  bar: 'bg-surface-400'  },
  withdrawn:   { bg: 'bg-pink-100',     text: 'text-pink-700',     bar: 'bg-pink-500'     },
}

// ── Shared sub-components ─────────────────────────────────────────────────────
const MetaBadge = ({ icon: Icon, text }) => (
  <div className="flex items-center gap-1.5 text-sm text-surface-600">
    <Icon className="w-4 h-4 text-surface-400" />
    <span>{text}</span>
  </div>
)

const MetricCard = ({ label, value, icon: Icon, color = 'text-surface-900', bg = 'bg-surface-50', iconBg = 'bg-surface-200' }) => (
  <div className={`${bg} border border-surface-200 rounded-xl p-4 flex items-center gap-3`}>
    <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div>
      <p className="text-xs text-surface-500 font-medium">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value ?? '—'}</p>
    </div>
  </div>
)

const SectionCard = ({ title, children, className = '' }) => (
  <div className={`bg-white border border-surface-200 rounded-xl p-5 ${className}`}>
    {title && <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-4">{title}</h3>}
    {children}
  </div>
)

const SkillChip = ({ label, variant = 'primary' }) => {
  const styles = {
    primary:   'bg-danger-50 text-danger-700 border-danger-200',
    secondary: 'bg-accent-50 text-accent-700 border-accent-200',
    neutral:   'bg-surface-100 text-surface-700 border-surface-200',
  }
  return (
    <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${styles[variant]}`}>{label}</span>
  )
}

const InfoRow = ({ label, value }) => (
  <div className="flex items-start justify-between py-2.5 border-b border-surface-100 last:border-0">
    <span className="text-sm text-surface-500 flex-shrink-0">{label}</span>
    <span className="text-sm font-medium text-surface-900 text-right ml-4">{value || '—'}</span>
  </div>
)

const Skeleton = () => (
  <div className="p-6 max-w-7xl mx-auto animate-pulse space-y-6">
    <div className="h-8 w-64 bg-surface-200 rounded" />
    <div className="grid grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-surface-200 rounded-xl" />)}
    </div>
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <div className="h-40 bg-surface-200 rounded-xl" />
        <div className="h-48 bg-surface-200 rounded-xl" />
      </div>
      <div className="space-y-4">
        <div className="h-32 bg-surface-200 rounded-xl" />
        <div className="h-64 bg-surface-200 rounded-xl" />
      </div>
    </div>
  </div>
)

const TABS = [
  { id: 'overview',      label: 'Overview'         },
  { id: 'requirements',  label: 'Requirements'     },
  { id: 'applications',  label: 'Applications'     },
  { id: 'analytics',     label: 'Analytics'        },
]

// ── Main component ────────────────────────────────────────────────────────────
const JobDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState(null)
  const [applications, setApplications] = useState([])
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => { load() }, [id])

  const load = async () => {
    try {
      setLoading(true)
      const jobRes = await jobService.getJob(id)
      setJob(jobRes.data)
    } catch (err) {
      toast.error('Failed to load job')
      navigate('/jobs')
      return
    } finally {
      setLoading(false)
    }
    try {
      const appsRes = await applicationService.getApplications({ job_id: id, page_size: 50 })
      setApplications(appsRes.data || [])
    } catch { /* non-critical */ }
  }

  if (loading) return <Skeleton />
  if (!job) return (
    <div className="p-6 text-center py-24">
      <AlertCircle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
      <p className="text-surface-500 font-medium">Job not found</p>
    </div>
  )

  // Derived
  const jobStatus   = JOB_STATUS[job.status]   || JOB_STATUS.draft
  const priority    = PRIORITY[job.priority]   || PRIORITY.medium
  const filled      = job.filled_positions || 0
  const total       = job.total_positions  || 1
  const fillPct     = Math.round((filled / total) * 100)
  const totalApps   = applications.length

  // Pipeline buckets
  const pipeline = [
    { label: 'Applied',     count: applications.filter(a => a.status === 'applied').length,     bar: APP_STATUS.applied.bar     },
    { label: 'Screening',   count: applications.filter(a => a.status === 'screening').length,   bar: APP_STATUS.screening.bar   },
    { label: 'Shortlisted', count: applications.filter(a => a.status === 'shortlisted').length, bar: APP_STATUS.shortlisted.bar },
    { label: 'Interview',   count: applications.filter(a => a.status === 'interview').length,   bar: APP_STATUS.interview.bar   },
    { label: 'Offered',     count: applications.filter(a => ['offered','offer_accepted'].includes(a.status)).length, bar: APP_STATUS.offered.bar },
    { label: 'Joined',      count: applications.filter(a => a.status === 'joined').length,      bar: APP_STATUS.joined.bar      },
  ]

  // ── Tab renderers ───────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-5">
      {/* Client / Location / Details */}
      <SectionCard title="Job Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <InfoRow label="Client"         value={job.client_name} />
          <InfoRow label="Job Type"       value={job.job_type?.replace(/_/g, ' ')} />
          <InfoRow label="Location"       value={[job.city, job.state, job.country].filter(Boolean).join(', ')} />
          <InfoRow label="Work Mode"      value={job.work_mode} />
          <InfoRow label="Experience"     value={`${job.experience?.min_years ?? 0}–${job.experience?.max_years ?? '?'} years`} />
          <InfoRow label="Salary Range"   value={`₹${job.salary?.min_salary ?? 0}–${job.salary?.max_salary ?? '?'} LPA`} />
          <InfoRow label="Department"     value={job.department} />
          <InfoRow label="Posted On"      value={formatDate(job.created_at)} />
          {job.target_date && (
            <InfoRow label="Target Date"  value={formatDate(job.target_date)} />
          )}
          <InfoRow label="Visible to Partners" value={job.visible_to_partners ? 'Yes' : 'No'} />
          {job.partner_commission && (
            <InfoRow label="Partner Commission" value={`${job.partner_commission}%`} />
          )}
        </div>
      </SectionCard>

      {/* Positions progress */}
      <SectionCard title="Hiring Progress">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-surface-600 font-medium">{filled} of {total} positions filled</span>
          <span className="text-sm font-bold text-surface-900">{fillPct}%</span>
        </div>
        <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${fillPct === 100 ? 'bg-success-500' : 'bg-accent-500'}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center p-3 bg-surface-50 rounded-xl">
            <p className="text-xl font-bold text-surface-900">{total}</p>
            <p className="text-xs text-surface-500">Total Openings</p>
          </div>
          <div className="text-center p-3 bg-success-50 rounded-xl">
            <p className="text-xl font-bold text-success-600">{filled}</p>
            <p className="text-xs text-surface-500">Filled</p>
          </div>
          <div className="text-center p-3 bg-accent-50 rounded-xl">
            <p className="text-xl font-bold text-accent-600">{total - filled}</p>
            <p className="text-xs text-surface-500">Remaining</p>
          </div>
        </div>
      </SectionCard>

      {/* Description */}
      {job.description && (
        <SectionCard title="Job Description">
          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{job.description}</p>
        </SectionCard>
      )}
    </div>
  )

  const renderRequirements = () => (
    <div className="space-y-5">
      {/* Mandatory skills */}
      {(job.eligibility_criteria?.mandatory_skills || []).length > 0 && (
        <SectionCard title="Mandatory Skills">
          <div className="flex flex-wrap gap-2">
            {job.eligibility_criteria.mandatory_skills.map((s, i) => (
              <SkillChip key={i} label={s} variant="primary" />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Optional skills */}
      {(job.eligibility_criteria?.optional_skills || []).length > 0 && (
        <SectionCard title="Good to Have">
          <div className="flex flex-wrap gap-2">
            {job.eligibility_criteria.optional_skills.map((s, i) => (
              <SkillChip key={i} label={s} variant="secondary" />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Eligibility criteria */}
      <SectionCard title="Eligibility Criteria">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <InfoRow label="Experience"        value={`${job.experience?.min_years ?? 0}–${job.experience?.max_years ?? '?'} years`} />
          <InfoRow label="Max Notice Period" value={job.eligibility_criteria?.notice_period_max?.replace(/_/g, ' ') || 'Any'} />
          <InfoRow label="Max Current CTC"   value={job.eligibility_criteria?.ctc_max ? `₹${job.eligibility_criteria.ctc_max} LPA` : 'Any'} />
          <InfoRow label="Salary Range"      value={`₹${job.salary?.min_salary ?? 0}–${job.salary?.max_salary ?? '?'} LPA`} />
        </div>
      </SectionCard>

      {/* Requirements */}
      {job.requirements && (
        <SectionCard title="Requirements">
          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{job.requirements}</p>
        </SectionCard>
      )}
    </div>
  )

  const renderApplications = () => (
    <div className="space-y-4">
      {applications.length === 0 ? (
        <div className="text-center py-20 bg-white border border-surface-200 rounded-xl">
          <Users className="w-12 h-12 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-500 font-medium">No applications yet</p>
          <p className="text-surface-400 text-sm mt-1">Candidates will appear here once they apply</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-surface-500">{applications.length} total applications</p>
            <Link
              to={`/applications?job_id=${id}`}
              className="text-sm text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1"
            >
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-2">
            {applications.slice(0, 20).map(app => {
              const cfg = APP_STATUS[app.status] || APP_STATUS.applied
              return (
                <Link
                  key={app.id}
                  to={`/applications/${app.id}`}
                  className="flex items-center gap-4 p-4 bg-white border border-surface-200 rounded-xl hover:border-accent-300 hover:shadow-sm transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-surface-100 flex items-center justify-center text-surface-600 font-semibold text-sm flex-shrink-0">
                    {(app.candidate_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-surface-900 truncate">{app.candidate_name}</p>
                    <p className="text-xs text-surface-500">{formatDate(app.applied_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                      {app.status?.replace(/_/g, ' ')}
                    </span>
                    <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-accent-500 transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  const renderAnalytics = () => {
    const maxPipeline = Math.max(...pipeline.map(p => p.count), 1)
    const rejected = applications.filter(a => a.status === 'rejected').length
    const conversionRate = totalApps > 0 ? Math.round((pipeline.find(p => p.label === 'Joined')?.count / totalApps) * 100) : 0

    return (
      <div className="space-y-5">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Applications" value={totalApps}     icon={Users}       color="text-accent-600"  bg="bg-accent-50"   iconBg="bg-accent-100" />
          <MetricCard label="Shortlisted"        value={pipeline[2].count} icon={CheckCircle} color="text-purple-600" bg="bg-purple-50"  iconBg="bg-purple-100" />
          <MetricCard label="Interviews"         value={pipeline[3].count} icon={Calendar}    color="text-indigo-600" bg="bg-indigo-50"  iconBg="bg-indigo-100" />
          <MetricCard label="Joined"             value={pipeline[5].count} icon={Star}        color="text-success-600"bg="bg-success-50" iconBg="bg-success-100" />
        </div>

        {/* Pipeline funnel */}
        <SectionCard title="Hiring Pipeline">
          <div className="space-y-3">
            {pipeline.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="text-sm text-surface-600 w-28 flex-shrink-0">{stage.label}</span>
                <div className="flex-1 h-6 bg-surface-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stage.bar} rounded-full transition-all`}
                    style={{ width: `${Math.round((stage.count / maxPipeline) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-surface-900 w-8 text-right">{stage.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Outcomes */}
        <div className="grid grid-cols-2 gap-4">
          <SectionCard title="Outcomes">
            <div className="space-y-2">
              <InfoRow label="Rejected"        value={rejected} />
              <InfoRow label="On Hold"         value={applications.filter(a => a.status === 'on_hold').length} />
              <InfoRow label="Withdrawn"       value={applications.filter(a => a.status === 'withdrawn').length} />
              <InfoRow label="Offer Accepted"  value={applications.filter(a => a.status === 'offer_accepted').length} />
              <InfoRow label="Offer Declined"  value={applications.filter(a => a.status === 'offer_declined').length} />
            </div>
          </SectionCard>
          <SectionCard title="Conversion">
            <div className="text-center py-4">
              <div className="w-24 h-24 rounded-full border-8 border-accent-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-accent-600">{conversionRate}%</span>
              </div>
              <p className="text-sm text-surface-500">Applied → Joined</p>
              <p className="text-xs text-surface-400 mt-1">Overall conversion rate</p>
            </div>
          </SectionCard>
        </div>
      </div>
    )
  }

  const tabContent = { overview: renderOverview, requirements: renderRequirements, applications: renderApplications, analytics: renderAnalytics }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 mb-6">
        <button onClick={() => navigate('/jobs')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-500 mt-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-400 font-medium">Jobs</p>
          <div className="flex items-center gap-3 flex-wrap mt-0.5">
            <h1 className="text-xl font-bold text-surface-900">{job.title}</h1>
            {job.priority === 'urgent' && <AlertCircle className="w-5 h-5 text-danger-500" />}
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${jobStatus.bg} ${jobStatus.text}`}>
              {jobStatus.label}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${priority.bg} ${priority.text}`}>
              {priority.label}
            </span>
            {job.job_code && (
              <span className="flex items-center gap-1 text-xs text-surface-400 font-mono">
                <Hash className="w-3.5 h-3.5" />{job.job_code}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={load} className="p-2 hover:bg-surface-100 rounded-lg text-surface-400" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            to={`/jobs/${id}/matching`}
            className="hidden sm:flex items-center gap-2 px-3 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Search className="w-4 h-4" />
            Find Candidates
          </Link>
          <Link
            to={`/jobs/edit/${id}`}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* ── Meta strip ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-white border border-surface-200 rounded-xl">
        <MetaBadge icon={Building2}    text={job.client_name} />
        <MetaBadge icon={MapPin}       text={[job.city, job.state].filter(Boolean).join(', ')} />
        <MetaBadge icon={Clock}        text={`${job.experience?.min_years ?? 0}–${job.experience?.max_years ?? '?'} yrs`} />
        <MetaBadge icon={IndianRupee}  text={`₹${job.salary?.min_salary ?? 0}–${job.salary?.max_salary ?? '?'} LPA`} />
        <MetaBadge icon={Users}        text={`${total} positions`} />
        <MetaBadge icon={Briefcase}    text={job.work_mode} />
        <MetaBadge icon={Calendar}     text={`Posted ${formatDate(job.created_at)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: tabs + main content ─────────────────────────────────── */}
        <div className="lg:col-span-2">
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
          {(tabContent[activeTab] || tabContent.overview)()}
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Actions */}
          <SectionCard title="Actions">
            <div className="space-y-2">
              <Link
                to={`/jobs/${id}/matching`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Search className="w-4 h-4" />
                Find Matching Candidates
              </Link>
              <Link
                to={`/applications?job_id=${id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Users className="w-4 h-4" />
                All Applications
              </Link>
              <Link
                to={`/jobs/edit/${id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Job
              </Link>
            </div>
          </SectionCard>

          {/* Application summary */}
          <SectionCard title="Application Summary">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Total',       value: totalApps,           color: 'text-surface-900',  bg: 'bg-surface-50'  },
                { label: 'Shortlisted', value: pipeline[2].count,   color: 'text-purple-700',   bg: 'bg-purple-50'   },
                { label: 'Interviews',  value: pipeline[3].count,   color: 'text-indigo-700',   bg: 'bg-indigo-50'   },
                { label: 'Offered',     value: pipeline[4].count,   color: 'text-orange-700',   bg: 'bg-orange-50'   },
                { label: 'Joined',      value: pipeline[5].count,   color: 'text-success-700',  bg: 'bg-success-50'  },
                { label: 'Rejected',    value: applications.filter(a => a.status === 'rejected').length, color: 'text-danger-700', bg: 'bg-danger-50' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-surface-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Recent applicants */}
          {applications.length > 0 && (
            <SectionCard title="Recent Applicants">
              <div className="space-y-2">
                {applications.slice(0, 6).map(app => {
                  const cfg = APP_STATUS[app.status] || APP_STATUS.applied
                  return (
                    <Link
                      key={app.id}
                      to={`/applications/${app.id}`}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-50 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center text-surface-600 font-semibold text-xs flex-shrink-0">
                        {(app.candidate_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-900 truncate">{app.candidate_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                          {app.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-accent-500 transition-colors flex-shrink-0" />
                    </Link>
                  )
                })}
              </div>
              {applications.length > 6 && (
                <Link
                  to={`/applications?job_id=${id}`}
                  className="block text-center text-xs text-accent-600 hover:text-accent-700 font-medium mt-3 pt-3 border-t border-surface-100"
                >
                  View all {applications.length} applications →
                </Link>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}

export default JobDetails
