import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users2, Briefcase, Building2, Calendar, ClipboardList,
  CheckCircle, AlertCircle, ArrowRight, UserPlus, Plus, Clock
} from 'lucide-react'
import { usePermissions } from '../../hooks/usePermissions'
import candidateService from '../../services/candidateService'
import jobService from '../../services/jobService'
import applicationService from '../../services/applicationService'
import interviewService from '../../services/interviewService'

const StatCard = ({ icon: Icon, label, value, subValue, color, link }) => (
  <Link
    to={link}
    className="bg-white rounded-xl shadow-sm border border-surface-200 p-6 hover:shadow-md transition-shadow"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-surface-500">{label}</p>
        <p className="text-3xl font-bold text-surface-900 mt-1">{value ?? '—'}</p>
        {subValue && <p className="text-sm text-surface-500 mt-1">{subValue}</p>}
      </div>
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </Link>
)

const RecruitmentDashboard = () => {
  const { has } = usePermissions()

  const canViewCandidates    = has('candidates:view')
  const canViewJobs          = has('jobs:view')
  const canViewApplications  = has('applications:view') || has('candidates:view')
  const canViewInterviews    = has('interviews:view')
  const canViewClients       = has('clients:view')
  const canCreateCandidates  = has('candidates:create')
  const canCreateJobs        = has('jobs:create')

  const [loading, setLoading]               = useState(true)
  const [candidateStats, setCandidateStats] = useState(null)
  const [jobStats, setJobStats]             = useState(null)
  const [appStats, setAppStats]             = useState(null)
  const [interviewStats, setInterviewStats] = useState(null)
  const [todayInterviews, setTodayInterviews] = useState([])
  const [pendingFeedback, setPendingFeedback] = useState([])

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      // Only call APIs the user has permission to access
      const tasks = await Promise.allSettled([
        canViewCandidates   ? candidateService.getDashboardStats()   : Promise.resolve(null),
        canViewJobs         ? jobService.getDashboardStats()          : Promise.resolve(null),
        canViewApplications ? applicationService.getDashboardStats()  : Promise.resolve(null),
        canViewInterviews   ? interviewService.getDashboardStats()    : Promise.resolve(null),
        canViewInterviews   ? interviewService.getTodayInterviews()   : Promise.resolve(null),
        canViewInterviews   ? interviewService.getPendingFeedback()   : Promise.resolve(null),
      ])

      const value = (result) => result.status === 'fulfilled' ? result.value?.data || null : null

      setCandidateStats(value(tasks[0]))
      setJobStats(value(tasks[1]))
      setAppStats(value(tasks[2]))
      setInterviewStats(value(tasks[3]))
      setTodayInterviews(value(tasks[4]) || [])
      setPendingFeedback(value(tasks[5]) || [])
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const hasAnyStat = canViewCandidates || canViewJobs || canViewApplications || canViewInterviews

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Recruitment Dashboard</h1>
          <p className="text-surface-500">Overview of recruitment activities</p>
        </div>
        <div className="flex gap-3">
          {canCreateCandidates && (
            <Link to="/candidates/new" className="btn-secondary flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Add Candidate
            </Link>
          )}
          {canCreateJobs && (
            <Link to="/jobs/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Post Job
            </Link>
          )}
        </div>
      </div>

      {/* Stats Grid — only render cards user is allowed to see */}
      {hasAnyStat && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {canViewCandidates && (
            <StatCard
              icon={Users2}
              label="Total Candidates"
              value={candidateStats?.total}
              subValue={candidateStats?.new != null ? `${candidateStats.new} new this week` : undefined}
              color="bg-blue-500"
              link="/candidates"
            />
          )}
          {canViewJobs && (
            <StatCard
              icon={Briefcase}
              label="Open Jobs"
              value={jobStats?.open}
              subValue={jobStats?.urgent != null ? `${jobStats.urgent} urgent` : undefined}
              color="bg-green-500"
              link="/jobs"
            />
          )}
          {canViewApplications && (
            <StatCard
              icon={ClipboardList}
              label="Active Applications"
              value={appStats?.active}
              subValue={appStats?.shortlisted != null ? `${appStats.shortlisted} shortlisted` : undefined}
              color="bg-purple-500"
              link="/applications"
            />
          )}
          {canViewInterviews && (
            <StatCard
              icon={Calendar}
              label="Interviews This Week"
              value={interviewStats?.this_week}
              subValue={interviewStats?.today != null ? `${interviewStats.today} today` : undefined}
              color="bg-orange-500"
              link="/interviews"
            />
          )}
        </div>
      )}

      {/* Two-column section — interviews only shown with permission */}
      {canViewInterviews && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Interviews */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-900">Today's Interviews</h2>
              <Link to="/interviews" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            {todayInterviews.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                <p className="text-surface-500">No interviews scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayInterviews.slice(0, 5).map((interview) => (
                  <Link
                    key={interview.id}
                    to={`/interviews/${interview.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-surface-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-surface-900 truncate">{interview.candidate_name}</p>
                      <p className="text-sm text-surface-500 truncate">
                        {interview.job_title} • {interview.stage_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-surface-900">{interview.scheduled_time}</p>
                      <p className="text-sm text-surface-500 capitalize">{interview.interview_mode}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Pending Feedback */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-900">Pending Feedback</h2>
              <Link to="/interviews" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            {pendingFeedback.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-green-300 mx-auto mb-2" />
                <p className="text-surface-500">All feedback submitted!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingFeedback.slice(0, 5).map((interview) => (
                  <Link
                    key={interview.id}
                    to={`/interviews/${interview.id}/feedback`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-surface-50 transition-colors border border-orange-200 bg-orange-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-surface-900 truncate">{interview.candidate_name}</p>
                      <p className="text-sm text-surface-500 truncate">
                        {interview.job_title} • {interview.stage_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-orange-600 font-medium">Submit Feedback</p>
                      <p className="text-xs text-surface-500">
                        {new Date(interview.scheduled_date).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Application Pipeline — only with application or candidate view */}
      {canViewApplications && appStats?.by_status && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-surface-900">Application Pipeline</h2>
            <Link to="/applications" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label: 'Applied',     value: appStats.by_status?.applied     || 0, color: 'bg-blue-500' },
              { label: 'Screening',   value: appStats.by_status?.screening   || 0, color: 'bg-yellow-500' },
              { label: 'Shortlisted', value: appStats.by_status?.shortlisted || 0, color: 'bg-purple-500' },
              { label: 'Interview',   value: appStats.by_status?.interview   || 0, color: 'bg-indigo-500' },
              { label: 'Offered',     value: appStats.by_status?.offered     || 0, color: 'bg-orange-500' },
              { label: 'Joined',      value: appStats.by_status?.joined      || 0, color: 'bg-green-500' },
              { label: 'Rejected',    value: appStats.by_status?.rejected    || 0, color: 'bg-red-500' },
            ].map((stage) => (
              <div key={stage.label} className="text-center">
                <div className={`w-full h-2 ${stage.color} rounded-full mb-2`} />
                <p className="text-2xl font-bold text-surface-900">{stage.value}</p>
                <p className="text-xs text-surface-500">{stage.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions — only show actions the user can actually perform */}
      {(canViewCandidates || canViewJobs || canViewInterviews) && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {canViewCandidates && (
            <Link
              to="/candidates?status=new"
              className="p-4 bg-blue-50 rounded-xl border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              <Users2 className="w-6 h-6 text-blue-600 mb-2" />
              <p className="font-medium text-surface-900">New Candidates</p>
              <p className="text-sm text-surface-500">{candidateStats?.new || 0} to review</p>
            </Link>
          )}
          {canViewJobs && (
            <Link
              to="/jobs?priority=urgent"
              className="p-4 bg-red-50 rounded-xl border border-red-200 hover:bg-red-100 transition-colors"
            >
              <AlertCircle className="w-6 h-6 text-red-600 mb-2" />
              <p className="font-medium text-surface-900">Urgent Jobs</p>
              <p className="text-sm text-surface-500">{jobStats?.urgent || 0} positions</p>
            </Link>
          )}
          {canViewInterviews && canCreateJobs && (
            <Link
              to="/interviews/schedule"
              className="p-4 bg-green-50 rounded-xl border border-green-200 hover:bg-green-100 transition-colors"
            >
              <Calendar className="w-6 h-6 text-green-600 mb-2" />
              <p className="font-medium text-surface-900">Schedule Interview</p>
              <p className="text-sm text-surface-500">Quick action</p>
            </Link>
          )}
          {canViewClients && (
            <Link
              to="/clients"
              className="p-4 bg-purple-50 rounded-xl border border-purple-200 hover:bg-purple-100 transition-colors"
            >
              <Building2 className="w-6 h-6 text-purple-600 mb-2" />
              <p className="font-medium text-surface-900">Clients</p>
              <p className="text-sm text-surface-500">Manage clients</p>
            </Link>
          )}
        </div>
      )}

      {/* Empty state — user has no permissions to see any module */}
      {!hasAnyStat && !canViewClients && (
        <div className="flex flex-col items-center justify-center py-24 text-surface-400">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p className="text-lg font-medium">No modules available</p>
          <p className="text-sm mt-1">Contact your administrator to grant access.</p>
        </div>
      )}
    </div>
  )
}

export default RecruitmentDashboard
