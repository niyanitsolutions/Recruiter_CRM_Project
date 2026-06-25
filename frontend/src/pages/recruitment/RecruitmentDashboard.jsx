import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  Users2, Briefcase, Building2, Calendar, ClipboardList,
  CheckCircle, AlertCircle, ArrowRight, UserPlus, Plus, Clock,
  TrendingUp, Activity, Target, Zap, Filter, RefreshCw,
  ChevronRight, Star, Award,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid,
} from 'recharts'
import { usePermissions } from '../../hooks/usePermissions'
import candidateService from '../../services/candidateService'
import jobService from '../../services/jobService'
import applicationService from '../../services/applicationService'
import interviewService from '../../services/interviewService'
import { formatDate, formatRelativeTime } from '../../utils/format'
import KpiCard from '../../components/dashboard/KpiCard'
import { SkeletonKpiRow, SkeletonBox } from '../../components/common/SkeletonLoader'

// ── Module-level cache (5 min TTL, survives SPA navigation) ─────────────────
// company_id is stored so the cache is invalidated when a different tenant logs in.
const CACHE_TTL = 5 * 60 * 1000
const _cache = { data: null, ts: 0, company_id: null }

// ── Pipeline stage config ────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: 'applied',     label: 'Applied',     color: '#6366f1', short: 'AP' },
  { key: 'screening',   label: 'Screening',   color: '#8b5cf6', short: 'SC' },
  { key: 'shortlisted', label: 'Shortlisted', color: '#a855f7', short: 'SL' },
  { key: 'interview',   label: 'Interview',   color: '#06b6d4', short: 'IN' },
  { key: 'offered',     label: 'Offered',     color: '#f59e0b', short: 'OF' },
  { key: 'joined',      label: 'Joined',      color: '#10b981', short: 'JO' },
  { key: 'rejected',    label: 'Rejected',    color: '#ef4444', short: 'RJ' },
]

// ── Custom pipeline bar tooltip ──────────────────────────────────────────────
const PipelineTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const stage = PIPELINE_STAGES.find(s => s.label === label)
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', minWidth: 110 }}>
      <p className="font-semibold mb-1" style={{ color: stage?.color || 'var(--accent)' }}>{label}</p>
      <p style={{ color: 'var(--text-primary)' }}>{payload[0].value} applications</p>
    </div>
  )
}

// ── Animated interview / feedback card item ──────────────────────────────────
const InterviewItem = ({ interview, linkTo, accent = '#6366f1', badge, badgeText }) => (
  <Link to={linkTo}
    className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group"
    style={{ border: badge ? `1px solid ${accent}30` : '1px solid var(--border-subtle)', background: badge ? `${accent}08` : 'transparent' }}
    onMouseEnter={e => { e.currentTarget.style.background = `${accent}12`; e.currentTarget.style.borderColor = `${accent}40` }}
    onMouseLeave={e => { e.currentTarget.style.background = badge ? `${accent}08` : 'transparent'; e.currentTarget.style.borderColor = badge ? `${accent}30` : 'var(--border-subtle)' }}>
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${accent}18` }}>
      <Clock className="w-4 h-4" style={{ color: accent }} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>
        {interview.candidate_name}
      </p>
      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
        {interview.job_title}
        {interview.stage_name && <> · {interview.stage_name}</>}
      </p>
    </div>
    <div className="text-right flex-shrink-0">
      {badge
        ? <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: `${accent}18`, color: accent }}>
            {badgeText}
          </span>
        : <>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{interview.scheduled_time}</p>
            <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{interview.interview_mode}</p>
          </>
      }
    </div>
  </Link>
)

// ── Section card wrapper ─────────────────────────────────────────────────────
const SectionCard = ({ title, subtitle, linkTo, linkLabel = 'View All', children, icon: Icon, accent = '#6366f1', action }) => (
  <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
    <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}18` }}>
            <Icon className="w-4 h-4" style={{ color: accent }} />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</h2>
          {subtitle && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {linkTo && (
          <Link to={linkTo}
            className="flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-lg"
            style={{ color: accent, background: `${accent}10` }}
            onMouseEnter={e => { e.currentTarget.style.background = `${accent}20` }}
            onMouseLeave={e => { e.currentTarget.style.background = `${accent}10` }}>
            {linkLabel} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
    <div className="p-4">{children}</div>
  </div>
)

// ── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = ({ icon: Icon, message, color = '#6366f1' }) => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: `${color}12` }}>
      <Icon className="w-5 h-5" style={{ color: `${color}80` }} />
    </div>
    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
  </div>
)

// ── Quick action card ────────────────────────────────────────────────────────
const QuickAction = ({ icon: Icon, title, subtitle, to, color = '#6366f1', value }) => (
  <Link to={to}
    className="rounded-xl p-4 flex items-start gap-3 transition-all duration-200 group"
    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}50`; e.currentTarget.style.boxShadow = `0 4px 20px ${color}20` }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-card)'; e.currentTarget.style.boxShadow = '' }}>
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
      style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
      <Icon className="w-5 h-5" style={{ color }} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
    </div>
    {value != null && (
      <span className="text-lg font-bold flex-shrink-0" style={{ color }}>{value}</span>
    )}
  </Link>
)

// ── Main Dashboard ───────────────────────────────────────────────────────────
const RecruitmentDashboard = () => {
  const { has } = usePermissions()
  const currentUser = useSelector(state => state.auth.user)
  const companyId = currentUser?.company_id

  const canViewCandidates   = has('candidates:view')
  const canViewJobs         = has('jobs:view')
  const canViewApplications = has('applications:view') || has('candidates:view')
  const canViewInterviews   = has('interviews:view')
  const canViewClients      = has('clients:view')
  const canCreateCandidates = has('candidates:create')
  const canCreateJobs       = has('jobs:create')

  const [loading, setLoading]                 = useState(true)
  const [refreshing, setRefreshing]           = useState(false)
  const [candidateStats, setCandidateStats]   = useState(null)
  const [jobStats, setJobStats]               = useState(null)
  const [appStats, setAppStats]               = useState(null)
  const [interviewStats, setInterviewStats]   = useState(null)
  const [todayInterviews, setTodayInterviews] = useState([])
  const [pendingFeedback, setPendingFeedback] = useState([])
  const [pipelineData, setPipelineData]       = useState([])
  const [mounted, setMounted]                 = useState(false)

  const loadData = useCallback(async (bypassCache = false) => {
    if (!bypassCache && _cache.data && _cache.company_id === companyId && Date.now() - _cache.ts < CACHE_TTL) {
      const c = _cache.data
      setCandidateStats(c.candidateStats)
      setJobStats(c.jobStats)
      setAppStats(c.appStats)
      setInterviewStats(c.interviewStats)
      setTodayInterviews(c.todayInterviews)
      setPendingFeedback(c.pendingFeedback)
      setPipelineData(c.pipelineData)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const tasks = await Promise.allSettled([
        canViewCandidates   ? candidateService.getDashboardStats()   : Promise.resolve(null),
        canViewJobs         ? jobService.getDashboardStats()          : Promise.resolve(null),
        canViewApplications ? applicationService.getDashboardStats()  : Promise.resolve(null),
        canViewInterviews   ? interviewService.getDashboardStats()    : Promise.resolve(null),
        canViewInterviews   ? interviewService.getTodayInterviews()   : Promise.resolve(null),
        canViewInterviews   ? interviewService.getPendingFeedback()   : Promise.resolve(null),
      ])

      const val = r => r.status === 'fulfilled' ? r.value?.data || null : null

      // Normalise a raw API result to an array, handling nested {data:[]} and {interviews:[]} shapes
      const toArray = (raw) => {
        if (!raw) return []
        if (Array.isArray(raw)) return raw
        // Axios wraps body in .data — already unwrapped by val(), but body may still have a .data array
        const inner = raw.data ?? raw
        if (Array.isArray(inner)) return inner
        return inner?.interviews || inner?.items || inner?.results || []
      }

      const cs = val(tasks[0])
      const js = val(tasks[1])
      const as = val(tasks[2])
      const is = val(tasks[3])
      const ti = toArray(val(tasks[4]))
      const pf = toArray(val(tasks[5]))

      // Build pipeline chart data from appStats.by_status
      const pd = PIPELINE_STAGES.map(s => ({
        label: s.label,
        count: as?.by_status?.[s.key] || 0,
        color: s.color,
      }))

      setCandidateStats(cs)
      setJobStats(js)
      setAppStats(as)
      setInterviewStats(is)
      setTodayInterviews(ti)
      setPendingFeedback(pf)
      setPipelineData(pd)

      _cache.data = { candidateStats: cs, jobStats: js, appStats: as, interviewStats: is, todayInterviews: ti, pendingFeedback: pf, pipelineData: pd }
      _cache.ts = Date.now()
      _cache.company_id = companyId
    } catch (err) {
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [canViewCandidates, canViewJobs, canViewApplications, canViewInterviews])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData(true)
  }

  const hasAnyAccess = canViewCandidates || canViewJobs || canViewApplications || canViewInterviews || canViewClients

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonBox className="h-7 w-56" />
            <SkeletonBox className="h-4 w-44" />
          </div>
          <div className="flex gap-2">
            <SkeletonBox className="h-9 w-32 rounded-lg" />
            <SkeletonBox className="h-9 w-28 rounded-lg" />
          </div>
        </div>

        {/* KPI row */}
        <SkeletonKpiRow count={4} />

        {/* Two-col */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map(i => (
            <div key={i} className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <SkeletonBox className="h-5 w-40 mb-2" />
              {[0, 1, 2, 3].map(j => (
                <div key={j} className="flex items-center gap-3">
                  <SkeletonBox className="w-9 h-9 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <SkeletonBox className="h-3.5 w-36" />
                    <SkeletonBox className="h-3 w-24" />
                  </div>
                  <SkeletonBox className="h-7 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Pipeline chart */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <SkeletonBox className="h-5 w-40 mb-4" />
          <SkeletonBox className="h-40 w-full rounded-xl" />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <SkeletonBox key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!hasAnyAccess) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
        <AlertCircle className="w-12 h-12 mb-4 opacity-40" />
        <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>No modules available</p>
        <p className="text-sm mt-1">Contact your administrator to grant access.</p>
      </div>
    )
  }

  const kpiCards = [
    canViewCandidates && {
      title: 'Total Candidates', icon: Users2, color: 'blue',
      value: candidateStats?.total,
      subtitle: candidateStats?.new != null ? `+${candidateStats.new} this week` : undefined,
      trend: candidateStats?.new != null ? { value: `${candidateStats.new} new`, dir: 'up' } : undefined,
      linkTo: '/candidates',
    },
    canViewJobs && {
      title: 'Open Positions', icon: Briefcase, color: 'green',
      value: jobStats?.open,
      subtitle: jobStats?.urgent != null ? `${jobStats.urgent} urgent` : undefined,
      trend: jobStats?.urgent > 0 ? { value: `${jobStats.urgent} urgent`, dir: 'neutral', label: 'needs attention' } : undefined,
      linkTo: '/jobs',
    },
    canViewApplications && {
      title: 'Active Applications', icon: ClipboardList, color: 'purple',
      value: appStats?.active,
      subtitle: appStats?.shortlisted != null ? `${appStats.shortlisted} shortlisted` : undefined,
      trend: appStats?.shortlisted > 0 ? { value: `${appStats.shortlisted} SL`, dir: 'up' } : undefined,
      linkTo: '/applications',
    },
    canViewInterviews && {
      title: 'Interviews This Week', icon: Calendar, color: 'orange',
      value: interviewStats?.this_week,
      subtitle: interviewStats?.today != null ? `${interviewStats.today} today` : undefined,
      trend: interviewStats?.today > 0 ? { value: `${interviewStats.today} today`, dir: 'up' } : undefined,
      linkTo: '/interviews',
    },
  ].filter(Boolean)

  // Highest count in pipeline (for conversion rate label)
  const pipelineMax = Math.max(...pipelineData.map(d => d.count), 1)
  const joinedCount = appStats?.by_status?.joined || 0
  const appliedCount = appStats?.by_status?.applied || 0
  const convRate = appliedCount > 0 ? Math.round((joinedCount / appliedCount) * 100) : 0

  return (
    <div
      className="p-6 space-y-6 page-enter"
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s ease' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>
            Recruitment Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Real-time overview of your recruitment pipeline
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canCreateCandidates && (
            <Link to="/candidates/new" className="btn-secondary flex items-center gap-2 text-sm">
              <UserPlus className="w-4 h-4" />Add Candidate
            </Link>
          )}
          {canCreateJobs && (
            <Link to="/jobs/new" className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />Post Job
            </Link>
          )}
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      {kpiCards.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(kpiCards.length, 4)} gap-4 animate-stagger`}>
          {kpiCards.map((card, i) => (
            <KpiCard key={card.title} {...card} delay={i * 60} />
          ))}
        </div>
      )}

      {/* ── Interviews + Feedback ──────────────────────────────────────────── */}
      {canViewInterviews && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Today's Interviews */}
          <SectionCard
            title="Today's Interviews"
            subtitle={`${todayInterviews.length} scheduled`}
            linkTo="/interviews"
            icon={Calendar}
            accent="#6366f1"
          >
            {todayInterviews.length === 0
              ? <EmptyState icon={Calendar} message="No interviews scheduled for today" color="#6366f1" />
              : (
                <div className="space-y-2">
                  {todayInterviews.slice(0, 5).map(iv => (
                    <InterviewItem key={iv.id} interview={iv} linkTo={`/interviews/${iv.id}`} accent="#6366f1" />
                  ))}
                  {todayInterviews.length > 5 && (
                    <Link to="/interviews" className="block text-center text-xs font-medium pt-1 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#6366f1'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                      +{todayInterviews.length - 5} more interviews
                    </Link>
                  )}
                </div>
              )
            }
          </SectionCard>

          {/* Pending Feedback */}
          <SectionCard
            title="Pending Feedback"
            subtitle={pendingFeedback.length > 0 ? `${pendingFeedback.length} awaiting` : 'All clear!'}
            linkTo="/interviews"
            icon={pendingFeedback.length > 0 ? AlertCircle : CheckCircle}
            accent={pendingFeedback.length > 0 ? '#f59e0b' : '#10b981'}
          >
            {pendingFeedback.length === 0
              ? <EmptyState icon={CheckCircle} message="All feedback submitted — great work!" color="#10b981" />
              : (
                <div className="space-y-2">
                  {pendingFeedback.slice(0, 5).map(iv => (
                    <InterviewItem
                      key={iv.id}
                      interview={iv}
                      linkTo={`/interviews/${iv.id}/feedback`}
                      accent="#f59e0b"
                      badge
                      badgeText={formatDate(iv.scheduled_date)}
                    />
                  ))}
                  {pendingFeedback.length > 5 && (
                    <Link to="/interviews" className="block text-center text-xs font-medium pt-1 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#f59e0b'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                      +{pendingFeedback.length - 5} more pending
                    </Link>
                  )}
                </div>
              )
            }
          </SectionCard>
        </div>
      )}

      {/* ── Application Pipeline Chart ─────────────────────────────────────── */}
      {canViewApplications && appStats?.by_status && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          {/* Section header */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#6366f118' }}>
                <Activity className="w-4 h-4" style={{ color: '#6366f1' }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>Application Pipeline</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {appStats?.total || 0} total · {convRate}% conversion rate
                </p>
              </div>
            </div>
            <Link to="/applications"
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-all"
              style={{ color: '#6366f1', background: '#6366f110' }}
              onMouseEnter={e => e.currentTarget.style.background = '#6366f120'}
              onMouseLeave={e => e.currentTarget.style.background = '#6366f110'}>
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={pipelineData.map(d => ({ name: d.label, count: d.count, color: d.color }))}
              margin={{ top: 0, right: 8, left: -20, bottom: 0 }}
              barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)', radius: 6 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {pipelineData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Stage summary strip */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {PIPELINE_STAGES.map(stage => {
              const count = appStats?.by_status?.[stage.key] || 0
              const pct = pipelineMax > 0 ? (count / pipelineMax) * 100 : 0
              return (
                <div key={stage.key} className="text-center">
                  <p className="text-lg font-bold" style={{ color: stage.color }}>{count}</p>
                  <p className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>{stage.label}</p>
                  <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: stage.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      {(canViewCandidates || canViewJobs || canViewInterviews || canViewClients) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Quick Actions
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {canViewCandidates && (
              <QuickAction
                icon={Users2}
                title="New Candidates"
                subtitle="Review new entries"
                to="/candidates?status=new"
                color="#6366f1"
                value={candidateStats?.new || 0}
              />
            )}
            {canViewJobs && (
              <QuickAction
                icon={Zap}
                title="Urgent Positions"
                subtitle="Needs immediate fill"
                to="/jobs?priority=urgent"
                color="#ef4444"
                value={jobStats?.urgent || 0}
              />
            )}
            {canViewInterviews && (
              <QuickAction
                icon={Calendar}
                title="Schedule Interview"
                subtitle="Plan next interview"
                to="/interviews"
                color="#10b981"
              />
            )}
            {canViewClients && (
              <QuickAction
                icon={Building2}
                title="Client Accounts"
                subtitle="Manage relationships"
                to="/clients"
                color="#8b5cf6"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RecruitmentDashboard
