import React, { useState, useEffect, useCallback, useRef, Component } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Users, Building, Award, Briefcase, Calendar,
  UserPlus, History, TrendingUp, Activity, ArrowRight,
  RefreshCw, Users2, DollarSign, Target, Bot,
  BarChart2, Clock, CheckCircle2,
  AlertTriangle, Trophy, Zap, ChevronRight, Bell, Plus, ChevronDown,
} from 'lucide-react'
import {
  Tooltip as RechartTooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { selectUser, selectUserPermissions } from '../../store/authSlice'
import adminDashboardService from '../../services/adminDashboardService'
import applicationService from '../../services/applicationService'
import interviewService from '../../services/interviewService'
import jobService from '../../services/jobService'
import candidateService from '../../services/candidateService'
import hrmService from '../../services/hrmService'
import subscriptionService from '../../services/subscriptionService'
import SubscriptionBanner from '../../components/subscription/SubscriptionBanner'
import DashboardBanner from '../../components/announcements/DashboardBanner'
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'
import KpiCard from '../../components/dashboard/KpiCard'
import HiringTrend from '../../components/dashboard/HiringTrend'
import PunchInModal from '../../components/hrm/PunchInModal'
import { formatDateTime, formatDate, formatTimeOnly, getTenantTimezone } from '../../utils/format'
import { useLivePolling } from '../../hooks/useLivePolling'
import { subscribe, LIVE_TOPICS } from '../../utils/liveUpdateBus'

// ── Section-level error boundary — wraps individual grid rows ────────────────
class WidgetErrorBoundary extends Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.error('[Dashboard widget error]', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-2xl p-5 flex flex-col items-center justify-center gap-2"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', minHeight: 120 }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Widget unavailable</p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Page-level error boundary — wraps the entire dashboard ───────────────────
class DashboardPageBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(err) { return { hasError: true, error: err } }
  componentDidCatch(err, info) { console.error('[Dashboard crash]', err, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <div
            className="rounded-2xl p-8 max-w-md w-full"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          >
            <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-heading)' }}>
              Dashboard failed to load
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {this.state.error?.message || 'An unexpected error occurred while rendering the dashboard.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#7c3aed' }}
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const ATTEND_DISMISS_KEY = 'attendance_modal_dismissed'
const todayISO = () => new Date().toISOString().slice(0, 10)

// ── Module-level cache — survives SPA navigation, TTL 5 min ─────────────────
const DASH_CACHE_TTL = 5 * 60 * 1000
const _cache = {
  main: null, recruit: null, seat: null,
  ivStats: null, todayIv: null, jobStats: null,
  candStats: null, hrmStats: null, announcements: null,
  syncStatus: null, syncPreview: null,
  ts: 0, company_id: null,
}

// ── Time-based greeting ───────────────────────────────────────────────────────
const getGreeting = () => {
  // Hour must be resolved in the tenant's saved Localization timezone, not
  // the browser/OS clock — otherwise the greeting can disagree with every
  // other time display on the page.
  const h = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: getTenantTimezone(), hour: '2-digit', hour12: false }).format(new Date()),
    10,
  )
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
const Card = ({ children, className = '', style = {} }) => (
  <div
    className={`rounded-xl p-4 ${className}`}
    style={{
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      boxShadow: 'var(--shadow-card)',
      ...style,
    }}
  >
    {children}
  </div>
)

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, subtitle, action, iconColor }) => (
  <div className="flex items-center justify-between mb-3">
    <div>
      <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
        {Icon && <Icon className="w-4 h-4" style={{ color: iconColor || 'var(--accent)' }} />}
        {title}
      </h3>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
    </div>
    {action}
  </div>
)

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-sm shadow-lg" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border-strong)' }}>
      {label && <p className="font-semibold mb-1" style={{ color: 'var(--text-heading)' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--text-secondary)' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ── Period filter (Task 2) ────────────────────────────────────────────────────
const PERIODS = [
  { key: 'today',     label: 'Today',         days: 1   },
  { key: 'week',      label: 'This Week',     days: 7   },
  { key: 'month',     label: 'This Month',    days: 30  },
  { key: 'quarter',   label: 'This Quarter',  days: 90  },
  { key: 'half_year', label: 'Last 6 Months', days: 180 },
  { key: 'all_time',  label: 'All Time',      days: 0   },
]

const PeriodFilter = ({ value, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = PERIODS.find(p => p.key === value) || PERIODS[1]

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
      >
        {current.label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-40 rounded-xl shadow-xl z-50 overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => { onChange(p); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs font-medium transition-colors"
              style={p.key === value ? { background: 'rgba(124,58,237,0.1)', color: '#7c3aed' } : { color: 'var(--text-secondary)' }}
              onMouseEnter={e => { if (p.key !== value) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (p.key !== value) e.currentTarget.style.background = 'transparent' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Format trend data ─────────────────────────────────────────────────────────
const formatTrendData = (raw) => {
  if (!raw) return []
  const items = Array.isArray(raw)
    ? raw
    : (raw.daily_activity || raw.data || raw.items || [])
  if (!Array.isArray(items)) return []
  return items.map(item => ({
    label: item.date
      ? formatDate(item.date, 'dd MMM')
      : (item.label || ''),
    value: item.count ?? item.value ?? item.actions ?? 0,
  }))
}

const PIE_COLORS = ['#7c3aed', '#4FACFE', '#43E97B', '#FA8231', '#FF4757', '#FF6B9D', '#38F9D7']
const SRC_COLORS = ['#7c3aed', '#4FACFE', '#43E97B', '#FA8231', '#FF6B9D', '#38F9D7', '#F6D365', '#FF4757']

// ─────────────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const user        = useSelector(selectUser)
  const permissions = useSelector(selectUserPermissions)
  const perms       = new Set(permissions)
  const isAdminOrOwner = user?.isOwner || user?.role === 'admin'
  const has = (...p) => p.some(x => perms.has(x))

  const [loading,          setLoading]         = useState(true)
  const [trendLoading,     setTrendLoading]     = useState(false)
  const [error,            setError]            = useState(null)
  const [dashboardData,    setDashboardData]    = useState(null)
  const [recruitStats,     setRecruitStats]     = useState(null)
  const [ivStats,          setIvStats]          = useState(null)
  const [todayIvs,         setTodayIvs]         = useState([])
  const [jobStats,         setJobStats]         = useState(null)
  const [candStats,        setCandStats]        = useState(null)
  const [hrmStats,         setHrmStats]         = useState(null)
  const [seatStatus,       setSeatStatus]       = useState(null)
  const [trendRaw,         setTrendRaw]         = useState(null)
  const [announcements,    setAnnouncements]    = useState([])
  const [syncStatus,       setSyncStatus]       = useState(null)
  const [syncPreview,      setSyncPreview]      = useState(null)
  const [period,           setPeriod]           = useState(PERIODS.find(p => p.key === 'today'))
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showQuickAction,  setShowQuickAction]  = useState(false)

  // Attendance warning: show card if user dismissed the punch-in modal today.
  // Do NOT gate on hrmEmployeeId — show for all non-partner internal users.
  const [attendanceDismissed, setAttendanceDismissed] = useState(
    () => user?.userType !== 'partner' && localStorage.getItem(ATTEND_DISMISS_KEY) === todayISO()
  )
  const [showDashPunchIn, setShowDashPunchIn] = useState(false)

  // ── Fetch trend ──────────────────────────────────────────────────────────────
  const fetchTrend = useCallback(async (days) => {
    try {
      setTrendLoading(true)
      const res = await adminDashboardService.getActivityChartData(days)
      setTrendRaw(res?.data ?? res)
    } catch {
      setTrendRaw(null)
    } finally {
      setTrendLoading(false)
    }
  }, [])

  // ── Fetch all dashboard data ─────────────────────────────────────────────────
  // silent=true (Task 8 live polling): refetch in the background without
  // flipping the loading flag, so the skeleton never flashes over real data.
  const fetchDashboardData = useCallback(async (force = false, silent = false) => {
    if (
      !force &&
      _cache.ts &&
      _cache.company_id === user?.company_id &&
      _cache.periodKey === period.key &&
      (Date.now() - _cache.ts) < DASH_CACHE_TTL
    ) {
      setDashboardData(_cache.main)
      setRecruitStats(_cache.recruit)
      setIvStats(_cache.ivStats)
      setTodayIvs(_cache.todayIv ?? [])
      setJobStats(_cache.jobStats)
      setCandStats(_cache.candStats)
      setHrmStats(_cache.hrmStats)
      setSeatStatus(_cache.seat)
      setAnnouncements(_cache.announcements ?? [])
      setSyncStatus(_cache.syncStatus)
      setSyncPreview(_cache.syncPreview)
      setLoading(false)
      return
    }

    try {
      if (!silent) setLoading(true)
      const [mainRes, recruitRes, ivStatsRes, todayIvRes, jobRes, candRes, hrmRes, seatRes, annRes, syncRes, syncPreviewRes] =
        await Promise.allSettled([
          adminDashboardService.getDashboardData(period.days),
          applicationService.getDashboardStats(period.days),
          interviewService.getDashboardStats(period.days),
          interviewService.getTodayInterviews(),
          jobService.getDashboardStats(period.days),
          candidateService.getDashboardStats(period.days),
          hrmService.getDashboardStats(),
          subscriptionService.getTenantSeatStatus(),
          hrmService.getAnnouncements({ limit: 3 }),
          hrmService.getSyncStatus(),
          hrmService.getSyncUnlinkedPreview(5),
        ])

      const main    = mainRes.status    === 'fulfilled' ? mainRes.value?.data    : null
      const recruit = recruitRes.status === 'fulfilled' ? recruitRes.value?.data : null
      const ivs     = ivStatsRes.status === 'fulfilled' ? ivStatsRes.value?.data : null

      const rawTodayIv = todayIvRes.status === 'fulfilled' ? todayIvRes.value?.data : null
      const todayIvList = (() => {
        if (!rawTodayIv) return []
        if (Array.isArray(rawTodayIv)) return rawTodayIv
        const inner = rawTodayIv?.interviews ?? rawTodayIv?.data ?? rawTodayIv?.items
        return Array.isArray(inner) ? inner : []
      })()

      const jobs  = jobRes.status  === 'fulfilled' ? jobRes.value?.data  : null
      const cands = candRes.status === 'fulfilled' ? candRes.value?.data : null
      const hrm   = hrmRes.status  === 'fulfilled' ? (hrmRes.value?.data?.data ?? hrmRes.value?.data) : null
      const seat  = seatRes.status === 'fulfilled' ? (seatRes.value?.data?.data ?? seatRes.value?.data) : null

      const rawAnn = annRes.status === 'fulfilled' ? annRes.value : null
      const annList = (() => {
        if (!rawAnn) return []
        if (Array.isArray(rawAnn)) return rawAnn
        const items = rawAnn?.data?.items ?? rawAnn?.data ?? rawAnn?.items
        return Array.isArray(items) ? items : []
      })()

      const rawSync = syncRes.status === 'fulfilled' ? syncRes.value?.data : null
      const syncData = rawSync?.data ?? rawSync

      const rawSyncPreview = syncPreviewRes.status === 'fulfilled' ? syncPreviewRes.value?.data : null
      const syncPreviewData = rawSyncPreview?.data ?? rawSyncPreview

      _cache.main          = main
      _cache.recruit       = recruit
      _cache.ivStats       = ivs
      _cache.todayIv       = todayIvList
      _cache.jobStats      = jobs
      _cache.candStats     = cands
      _cache.hrmStats      = hrm
      _cache.seat          = seat
      _cache.announcements = annList
      _cache.syncStatus    = syncData
      _cache.syncPreview   = syncPreviewData
      _cache.ts            = Date.now()
      _cache.company_id    = user?.company_id
      _cache.periodKey     = period.key

      setDashboardData(main)
      setRecruitStats(recruit)
      setIvStats(ivs)
      setTodayIvs(todayIvList)
      setJobStats(jobs)
      setCandStats(cands)
      setHrmStats(hrm)
      setSeatStatus(seat)
      setAnnouncements(annList)
      setSyncStatus(syncData)
      setSyncPreview(syncPreviewData)
      setError(null)
    } catch (err) {
      if (!silent) setError('Failed to load dashboard data')
      console.error(err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [user?.company_id, period])

  const periodMountedRef = useRef(false)

  useEffect(() => {
    fetchDashboardData()
    fetchTrend(period.days)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch main stats when period changes (skip on initial mount)
  useEffect(() => {
    if (!periodMountedRef.current) { periodMountedRef.current = true; return }
    fetchDashboardData(true)
  }, [period.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live background refresh (Task 8) — silent, no visible reload.
  // `force=true` already bypasses the module-level cache on every tick, but
  // also subscribe so a mutation elsewhere (user/employee/candidate
  // created/deleted, status change, attendance punch) triggers this refresh
  // immediately instead of waiting up to 5s for the next tick.
  useLivePolling(() => fetchDashboardData(true, true), 5000, true, [
    LIVE_TOPICS.USERS, LIVE_TOPICS.EMPLOYEES, LIVE_TOPICS.CANDIDATES,
    LIVE_TOPICS.ATTENDANCE, LIVE_TOPICS.DASHBOARD,
  ])

  // The module-level `_cache` above is keyed by company_id, but if a user
  // logs out and a different user/tenant logs back in within the 5-minute
  // TTL, a fresh mount would otherwise serve the previous session's cached
  // snapshot until the first poll tick corrects it. Invalidate immediately
  // on any auth transition so the next mount always fetches fresh.
  useEffect(() => subscribe(LIVE_TOPICS.AUTH, () => { _cache.ts = 0 }), [])

  useEffect(() => {
    fetchTrend(period.days)
  }, [period, fetchTrend])

  // Close quick-action dropdown on outside click
  useEffect(() => {
    if (!showQuickAction) return
    const handler = () => setShowQuickAction(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showQuickAction])

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-2 space-y-3 page-enter">
        <div className="h-16 rounded-xl skeleton" />
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 rounded-xl skeleton" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-60 rounded-xl skeleton" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-48 rounded-xl skeleton" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="h-40 rounded-xl skeleton" />
          <div className="h-40 rounded-xl skeleton" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3">
        <div className="p-4 rounded-xl" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
          {error}
          <button onClick={() => fetchDashboardData(true)} className="ml-4 underline">Retry</button>
        </div>
      </div>
    )
  }

  const { user_stats, activity_stats, recent_activity } = dashboardData || {}

  // ── KPI computations — prefer period-filtered quick_stats when period != all-time ─
  const _periodFiltered = period.days > 0
  const totalCandidates = _periodFiltered
    ? (dashboardData?.quick_stats?.candidates ?? candStats?.total)
    : (candStats?.total ?? dashboardData?.quick_stats?.candidates)
  const activeJobs = _periodFiltered
    ? (dashboardData?.quick_stats?.jobs ?? jobStats?.open)
    : (jobStats?.open ?? dashboardData?.quick_stats?.jobs)
  const appsInProgress  = recruitStats?.total != null
    ? Math.max(0, (recruitStats.total || 0) - (recruitStats.joined || 0) - (recruitStats.rejected || 0))
    : null
  const interviewsToday = _periodFiltered
    ? (dashboardData?.quick_stats?.interviews ?? ivStats?.today ?? ivStats?.today_count ?? (Array.isArray(todayIvs) ? todayIvs.length : null))
    : (ivStats?.today ?? ivStats?.today_count ?? (Array.isArray(todayIvs) ? todayIvs.length : null) ?? dashboardData?.quick_stats?.interviews)

  const offersPending   = recruitStats?.offered
  const placementsMonth = recruitStats?.joined
  const totalUsers      = user_stats?.total_users
  const activeUsers     = user_stats?.active_users
  const inactiveUsers   = user_stats?.inactive_users
  const loggedInToday   = user_stats?.logged_in_today
  const onlineUsers     = user_stats?.online_users
  const onLeaveToday    = hrmStats?.on_leave_today ?? hrmStats?.leaves_today ?? hrmStats?.on_leave
  const pendingFeedback = ivStats?.pending_feedback ?? ivStats?.pending_feedback_count

  const toRate    = (a, b) => (a > 0 ? Math.round((b / a) * 100) : null)
  const offerRate  = toRate(recruitStats?.applied, recruitStats?.offered)
  const joinRate   = toRate(recruitStats?.offered, recruitStats?.joined)
  const screenRate = toRate(recruitStats?.applied, recruitStats?.screening)
  const ivRate     = toRate(recruitStats?.screening, recruitStats?.interview)
  const rejectRate = recruitStats?.total > 0
    ? Math.round(((recruitStats.rejected || 0) / recruitStats.total) * 100) : null

  // ── Funnel data ───────────────────────────────────────────────────────────────
  const funnelData = recruitStats ? [
    { stage: 'Applied',     value: recruitStats.applied     || 0, fill: '#7c3aed' },
    { stage: 'Screening',   value: recruitStats.screening   || 0, fill: '#4FACFE' },
    { stage: 'Shortlisted', value: recruitStats.shortlisted || 0, fill: '#38F9D7' },
    { stage: 'Interview',   value: recruitStats.interview   || 0, fill: '#43E97B' },
    { stage: 'Offered',     value: recruitStats.offered     || 0, fill: '#F6A535' },
    { stage: 'Joined',      value: recruitStats.joined      || 0, fill: '#FA8231' },
  ] : []

  // ── Source analytics ──────────────────────────────────────────────────────────
  const sourceData = candStats?.by_source
    ? Object.entries(candStats.by_source)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
    : []

  // ── Top recruiters ────────────────────────────────────────────────────────────
  const topRecruiters = activity_stats?.top_users?.slice(0, 5) || []

  // ── Trend / activity bar data (last 6 data points) ───────────────────────────
  const trendData  = formatTrendData(trendRaw)
  const barData    = trendData.slice(-6).map((d, i, arr) => ({
    label: d.label,
    value: d.value,
    fill:  i === arr.length - 1 ? '#7c3aed' : '#7c3aed55',
  }))

  // ── Users by role pie ─────────────────────────────────────────────────────────
  const roleData = user_stats?.users_by_role
    ? Object.entries(user_stats.users_by_role)
        .filter(([, v]) => v > 0)
        .map(([role, count], i) => ({
          name:  role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: count,
          fill:  PIE_COLORS[i % PIE_COLORS.length],
        }))
    : []

  // ── AI insights ───────────────────────────────────────────────────────────────
  const aiInsights = [
    recruitStats?.recent_week > 0 && {
      color: '#7c3aed', icon: Zap,
      text: `${recruitStats.recent_week} new application${recruitStats.recent_week > 1 ? 's' : ''} this week`,
      tag: 'New',
    },
    offerRate !== null && {
      color: offerRate >= 30 ? '#22c55e' : '#f59e0b', icon: TrendingUp,
      text: `${offerRate}% offer conversion rate`,
      tag: offerRate >= 30 ? 'Good' : 'Improve',
    },
    joinRate !== null && {
      color: joinRate >= 60 ? '#22c55e' : '#FA8231', icon: CheckCircle2,
      text: `${joinRate}% offer-to-join rate`,
      tag: joinRate >= 60 ? 'Strong' : 'Watch',
    },
    pendingFeedback > 0 && {
      color: '#FF4757', icon: AlertTriangle,
      text: `${pendingFeedback} interview${pendingFeedback > 1 ? 's' : ''} need feedback`,
      tag: 'Action',
    },
    onLeaveToday > 0 && {
      color: '#F6A535', icon: AlertTriangle,
      text: `${onLeaveToday} employee${onLeaveToday > 1 ? 's' : ''} on leave today`,
      tag: 'Info',
    },
  ].filter(Boolean).slice(0, 4)

  // ── Pending approval items ────────────────────────────────────────────────────
  const pendingItems = [
    offersPending > 0 && { label: 'Offers Awaiting Response',   count: offersPending,              color: '#F6A535', icon: Award,    path: '/applications' },
    pendingFeedback > 0 && { label: 'Interview Feedback Needed', count: pendingFeedback,             color: '#FF4757', icon: Calendar, path: '/interviews'   },
    hrmStats?.pending_leaves > 0 && { label: 'Leave Requests',  count: hrmStats.pending_leaves,     color: '#7c3aed', icon: Building, path: '/hrm/leaves'   },
    hrmStats?.pending_exits > 0  && { label: 'Exit Requests',   count: hrmStats.pending_exits,      color: '#FF6B9D', icon: Users,    path: '/hrm/exit'     },
    // Sync pending items — show actual names from preview, fall back to count
    syncStatus?.unlinked_users > 0 && {
      label: 'Users Without Employee Profile',
      count: syncStatus.unlinked_users,
      names: syncPreview?.unlinked_users || [],
      color: '#4FACFE', icon: Users2, path: '/hrm/sync',
    },
    syncStatus?.unlinked_employees > 0 && {
      label: 'Employees Without User Account',
      count: syncStatus.unlinked_employees,
      names: syncPreview?.unlinked_employees || [],
      color: '#38F9D7', icon: UserPlus, path: '/hrm/sync',
    },
  ].filter(Boolean)

  // ── Recruitment health metrics ────────────────────────────────────────────────
  const healthMetrics = [
    { label: 'Offer Rate',     value: offerRate,  color: '#22c55e', target: 30 },
    { label: 'Join Rate',      value: joinRate,   color: '#4FACFE', target: 60 },
    { label: 'Screening Rate', value: screenRate, color: '#7c3aed', target: 70 },
    { label: 'Interview Rate', value: ivRate,     color: '#F6A535', target: 50 },
  ].filter(m => m.value !== null)

  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: getTenantTimezone(),
  })

  return (
    <div className="p-2 space-y-3 page-enter">

      {/* ── Super-admin broadcast banners ────────────────────────────────────────── */}
      <DashboardBanner />

      {/* ── Subscription Banner ─────────────────────────────────────────────────── */}
      {isAdminOrOwner && (
        <SubscriptionBanner seatStatus={seatStatus} onUpgrade={() => setShowUpgradeModal(true)} />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HEADER — Greeting | Subscription | Period | Refresh | Quick Action   */}
      {/* Responsive: all controls always visible; wraps to 2 rows if needed.  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Card style={{ padding: '12px 16px' }}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">

          {/* Left — Greeting */}
          <div className="flex-shrink-0" style={{ minWidth: '180px' }}>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>
              {getGreeting()}, {user?.fullName || 'User'}! 👋
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Here's what's happening with your recruitment today.
            </p>
          </div>

          {/* Right — Subscription widget + all controls (always visible) */}
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">

            {/* Subscription widget — always visible for admin/owner */}
            {isAdminOrOwner && seatStatus && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl flex-shrink-0"
                style={{ border: '1.5px dashed rgba(124,58,237,0.30)', background: 'rgba(124,58,237,0.03)' }}
              >
                {/* Plan name */}
                <div className="flex-shrink-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#7c3aed' }}>Plan</p>
                  <p className="text-xs font-bold mt-0.5 leading-tight whitespace-nowrap" style={{ color: 'var(--text-heading)' }}>
                    {seatStatus.plan_display_name || seatStatus.plan_name}
                    {seatStatus.is_trial && (
                      <span className="ml-1 text-[9px] px-1 py-0.5 rounded-full font-bold align-middle" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>Trial</span>
                    )}
                  </p>
                </div>
                {/* Divider */}
                <div className="w-px self-stretch mx-0.5 flex-shrink-0" style={{ background: 'var(--border)' }} />
                {/* Stats */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-heading)' }}>{seatStatus.total_user_seats}</p>
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Seats</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-info)' }}>{seatStatus.current_active_users}</p>
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold leading-tight" style={{ color: seatStatus.remaining_seats === 0 ? 'var(--text-danger)' : 'var(--text-success)' }}>
                      {seatStatus.remaining_seats}
                    </p>
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Left</p>
                  </div>
                  {seatStatus.plan_expiry && (
                    <div className="text-center hidden xl:block">
                      <p className="text-xs font-bold leading-tight whitespace-nowrap" style={{ color: 'var(--text-heading)' }}>
                        {formatDate(seatStatus.plan_expiry, 'dd MMM')}
                      </p>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Expiry</p>
                    </div>
                  )}
                </div>
                {/* Manage Subscription button */}
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-lg transition-all whitespace-nowrap ml-1"
                  style={{ color: '#7c3aed', border: '1px solid rgba(124,58,237,0.40)', background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Manage
                </button>
              </div>
            )}

            {/* Date string — informational, xl+ only */}
            <span className="text-xs hidden xl:block whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{dateStr}</span>

            {/* Period filter — always visible */}
            <PeriodFilter value={period.key} onChange={setPeriod} />

            {/* Refresh button */}
            <button
              onClick={() => fetchDashboardData(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-active)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Quick Action */}
            {(has('candidates:create') || has('jobs:create')) && (
              <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowQuickAction(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all whitespace-nowrap"
                  style={{ background: '#7c3aed' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#6d28d9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#7c3aed'}
                >
                  <Plus className="w-3.5 h-3.5" /> Quick Action
                  <ChevronDown className="w-3 h-3 opacity-80" />
                </button>
                {showQuickAction && (
                  <div
                    className="absolute right-0 top-full mt-1 w-44 rounded-xl shadow-xl z-50 overflow-hidden"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
                  >
                    {has('candidates:create') && (
                      <Link
                        to="/candidates/new"
                        className="flex items-center gap-2 px-4 py-2.5 text-sm"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => setShowQuickAction(false)}
                      >
                        <UserPlus className="w-4 h-4" style={{ color: '#7c3aed' }} /> Add Candidate
                      </Link>
                    )}
                    {has('jobs:create') && (
                      <Link
                        to="/jobs/new"
                        className="flex items-center gap-2 px-4 py-2.5 text-sm"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => setShowQuickAction(false)}
                      >
                        <Briefcase className="w-4 h-4" style={{ color: '#4FACFE' }} /> Post Job
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Attendance Warning Card ─────────────────────────────────────────────── */}
      {attendanceDismissed && (
        <>
          <PunchInModal
            isOpen={showDashPunchIn}
            onClose={() => setShowDashPunchIn(false)}
            onDismiss={() => setShowDashPunchIn(false)}
            onPunchedIn={() => {
              localStorage.removeItem(ATTEND_DISMISS_KEY)
              setAttendanceDismissed(false)
              setShowDashPunchIn(false)
            }}
          />
          <div
            className="flex items-center gap-3 px-5 py-3 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.04) 100%)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <Clock className="w-5 h-5 flex-shrink-0" style={{ color: '#ef4444' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>Attendance Pending — Punch In Required</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>You haven't punched in yet today. Your work hours won't be recorded until you do.</p>
            </div>
            <button
              onClick={() => setShowDashPunchIn(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: '#ef4444' }}
              onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
              onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
            >
              <Clock className="w-3.5 h-3.5" /> Punch In Now
            </button>
            <button
              onClick={() => setAttendanceDismissed(false)}
              className="flex-shrink-0 text-xs px-2 py-1 rounded-lg transition-all"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
            >
              Dismiss
            </button>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* 8 STAT KPI CARDS — compact                                             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
      {(() => {
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
            {has('candidates:view') && (
              <KpiCard
                title="Total Candidates"
                value={totalCandidates}
                icon={Users2}
                color="purple"
                trend={recruitStats?.recent_week > 0
                  ? { value: `+${recruitStats.recent_week} this week`, dir: 'up' }
                  : undefined}
                subtitle="In pipeline"
                compact={true}
                linkTo="/candidates"
                delay={0}
              />
            )}
            {has('jobs:view') && (
              <KpiCard
                title="Active Jobs"
                value={activeJobs}
                icon={Briefcase}
                color="blue"
                trend={jobStats?.filled > 0
                  ? { value: `${jobStats.filled} filled`, dir: 'up' }
                  : undefined}
                subtitle="Open positions"
                compact={true}
                linkTo="/jobs"
                delay={50}
              />
            )}
            {has('candidates:view') && (
              <KpiCard
                title="Applications"
                value={appsInProgress}
                icon={Activity}
                color="orange"
                subtitle="In Progress"
                compact={true}
                linkTo="/applications"
                delay={100}
              />
            )}
            {has('interviews:view') && (
              <KpiCard
                title="Interviews Today"
                value={interviewsToday}
                icon={Calendar}
                color="teal"
                trend={ivStats?.this_week > 0
                  ? { value: `${ivStats.this_week} this week`, dir: 'up' }
                  : undefined}
                subtitle="Scheduled"
                compact={true}
                linkTo="/interviews"
                delay={150}
              />
            )}
            {has('candidates:view') && (
              <KpiCard
                title="Offers Pending"
                value={offersPending}
                icon={Award}
                color="yellow"
                trend={offerRate !== null
                  ? { value: `${offerRate}% offer rate`, dir: offerRate >= 20 ? 'up' : 'down' }
                  : undefined}
                subtitle="Awaiting response"
                compact={true}
                linkTo="/applications"
                delay={200}
              />
            )}
            {isAdminOrOwner && (
              <KpiCard
                title="Revenue"
                value={null}
                icon={DollarSign}
                color="pink"
                subtitle="This month"
                compact={true}
                delay={250}
              />
            )}
            {has('users:view') && (
              <Link to="/users" className="block" style={{ animationDelay: '300ms' }}>
                <div
                  className="rounded-xl relative overflow-hidden"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-card)',
                    padding: '10px 12px 8px',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <div className="absolute top-0 left-0 right-0" style={{ height: '2px', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: '#6366f118' }}>
                    <Users className="w-[15px] h-[15px]" style={{ color: '#6366f1' }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-bold leading-none" style={{ fontSize: '20px', color: 'var(--text-heading)', letterSpacing: '-0.5px' }}>
                        {totalUsers ?? '—'}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Total</p>
                    </div>
                    <div className="w-px self-stretch" style={{ background: 'var(--border)' }} />
                    <div>
                      <p className="font-bold leading-none flex items-center gap-1.5" style={{ fontSize: '20px', color: 'var(--text-heading)', letterSpacing: '-0.5px' }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: onlineUsers > 0 ? '#22c55e' : 'var(--text-disabled)' }} />
                        {onlineUsers ?? '—'}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Online</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold mt-1.5" style={{ color: 'var(--text-secondary)' }}>Users</p>
                </div>
              </Link>
            )}
            {has('candidates:view') && (
              <KpiCard
                title="Placements"
                value={placementsMonth}
                icon={TrendingUp}
                color="green"
                trend={joinRate !== null
                  ? { value: `${joinRate}% join rate`, dir: joinRate >= 50 ? 'up' : 'down' }
                  : undefined}
                subtitle="This Month"
                compact={true}
                delay={400}
              />
            )}
          </div>
        )
      })()}
      </WidgetErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MIDDLE ROW — Pipeline | Interviews | AI Assistant | Pending Approvals  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Hiring Pipeline */}
        {has('candidates:view') && (
          <Card>
            <SectionHeader
              icon={BarChart2}
              title="Hiring Pipeline"
              subtitle={recruitStats?.total > 0 ? `${recruitStats.total.toLocaleString('en-IN')} total` : 'Recruitment funnel'}
              action={
                <Link to="/applications" className="text-xs font-medium" style={{ color: '#7c3aed' }}>
                  View all
                </Link>
              }
            />
            {funnelData.some(d => d.value > 0) ? (
              <>
                <div className="space-y-2">
                  {funnelData.map((item, i) => {
                    const maxVal = Math.max(...funnelData.map(d => d.value), 1)
                    const pct    = Math.max(Math.round((item.value / maxVal) * 100), 5)
                    const prev   = i > 0 ? funnelData[i - 1].value : null
                    const conv   = prev && prev > 0 ? Math.round((item.value / prev) * 100) : null
                    return (
                      <div key={item.stage}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{item.stage}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold" style={{ color: 'var(--text-heading)' }}>
                              {item.value.toLocaleString('en-IN')}
                            </span>
                            {conv !== null && (
                              <span
                                className="text-[9px] font-semibold px-1 py-0.5 rounded-full"
                                style={{
                                  background: conv >= 50 ? 'rgba(34,197,94,0.10)' : 'rgba(255,71,87,0.10)',
                                  color: conv >= 50 ? '#22c55e' : '#ef4444',
                                }}
                              >
                                {conv}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-hover)' }}>
                          <div
                            className="h-1.5 rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: item.fill }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {recruitStats?.rejected > 0 && (
                  <div className="mt-2 pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Rejected</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,71,87,0.10)', color: '#ef4444' }}>
                      {recruitStats.rejected.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <BarChart2 className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No pipeline data yet</p>
              </div>
            )}
          </Card>
        )}

        {/* Interviews Today */}
        {has('interviews:view') && (
          <Card>
            <SectionHeader
              icon={Calendar}
              title="Interviews Today"
              subtitle={`${interviewsToday ?? 0} scheduled`}
              action={
                <Link to="/interviews" className="text-xs font-medium flex items-center gap-0.5" style={{ color: '#7c3aed' }}>
                  Full Schedule <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
            {Array.isArray(todayIvs) && todayIvs.length > 0
              ? todayIvs.slice(0, 5).map((iv, i) => {
                  const dt = iv.scheduled_at || iv.interview_time || iv.scheduled_time
                  const roundNum = iv.round
                  const roundLabel = roundNum === 1 ? 'Technical' : roundNum === 2 ? 'HR Round' : roundNum ? `Round ${roundNum}` : null
                  const rStyle = roundLabel === 'Technical'
                    ? { bg: 'rgba(124,58,237,0.10)', color: '#7c3aed' }
                    : roundLabel === 'HR Round'
                    ? { bg: 'rgba(34,197,94,0.10)', color: '#22c55e' }
                    : { bg: 'var(--bg-hover)', color: 'var(--text-muted)' }
                  return (
                    <div
                      key={iv._id || iv.id || i}
                      className="flex items-start gap-3 py-2"
                      style={{ borderBottom: i < Math.min(todayIvs.length, 5) - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                    >
                      <div className="flex-shrink-0 text-center w-10">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.10)' }}>
                          <Clock className="w-3.5 h-3.5" style={{ color: '#7c3aed' }} />
                        </div>
                        {dt && (
                          <p className="text-[9px] mt-0.5 font-medium leading-tight" style={{ color: 'var(--text-muted)' }}>
                            {formatTimeOnly(dt)}
                          </p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>
                          {iv.candidate_name || iv.candidate?.name || 'Candidate'}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {iv.job_title || iv.job?.title || iv.position || 'Position'}
                        </p>
                      </div>
                      {roundLabel && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 self-center whitespace-nowrap" style={{ background: rStyle.bg, color: rStyle.color }}>
                          {roundLabel}
                        </span>
                      )}
                    </div>
                  )
                })
              : (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No interviews today</p>
                </div>
              )
            }
            {todayIvs.length > 5 && (
              <Link to="/interviews" className="flex items-center gap-1 text-xs font-medium mt-2 pt-2" style={{ borderTop: '1px solid var(--border)', color: '#7c3aed' }}>
                +{todayIvs.length - 5} more <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </Card>
        )}

        {/* AI Hiring Assistant */}
        <Card>
          <SectionHeader
            icon={Bot}
            title="AI Hiring Assistant"
            subtitle="Smart recommendations"
            iconColor="#7c3aed"
          />
          {aiInsights.length > 0 ? (
            <div className="space-y-2">
              {aiInsights.map((ins, i) => {
                const InsIcon = ins.icon
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2"
                    style={{ background: `${ins.color}0d`, border: `1px solid ${ins.color}22` }}
                  >
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${ins.color}20` }}>
                      <InsIcon className="w-3 h-3" style={{ color: ins.color }} />
                    </div>
                    <p className="flex-1 text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {ins.text}
                    </p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 self-start" style={{ background: `${ins.color}15`, color: ins.color }}>
                      {ins.tag}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Bot className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No insights yet</p>
              <p className="text-xs text-center" style={{ color: 'var(--text-disabled)' }}>Add candidates and jobs to see recommendations</p>
            </div>
          )}
          {(offerRate !== null || joinRate !== null) && (
            <div className="mt-2 pt-2 grid grid-cols-2 gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {offerRate !== null && (
                <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-sm font-bold" style={{ color: offerRate >= 20 ? '#22c55e' : '#f59e0b' }}>{offerRate}%</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Offer Rate</p>
                </div>
              )}
              {joinRate !== null && (
                <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-sm font-bold" style={{ color: joinRate >= 50 ? '#22c55e' : '#f59e0b' }}>{joinRate}%</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Join Rate</p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Pending Approvals */}
        <Card>
          <SectionHeader
            icon={Bell}
            title="Pending Approvals"
            subtitle="Action required"
            iconColor="#FF4757"
          />
          {pendingItems.length > 0 ? (
            <div className="space-y-2">
              {pendingItems.map((item, i) => {
                const ItemIcon = item.icon
                const hasNames = item.names && item.names.length > 0
                return (
                  <Link
                    key={i}
                    to={item.path}
                    className="flex flex-col gap-1 rounded-xl p-2.5 transition-all block"
                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${item.color}0d`; e.currentTarget.style.borderColor = `${item.color}30` }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}15` }}>
                        <ItemIcon className="w-3.5 h-3.5" style={{ color: item.color }} />
                      </div>
                      <p className="flex-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${item.color}15`, color: item.color }}>
                        {item.count}
                      </span>
                    </div>
                    {/* Show actual names if available */}
                    {hasNames && (
                      <div className="pl-11 space-y-0.5">
                        {item.names.map((n, ni) => (
                          <p key={ni} className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {n.full_name || n.email}
                            {n.email && n.full_name && (
                              <span className="ml-1 opacity-60">·&nbsp;{n.email}</span>
                            )}
                          </p>
                        ))}
                        {item.count > item.names.length && (
                          <p className="text-[10px]" style={{ color: item.color }}>
                            +{item.count - item.names.length} more
                          </p>
                        )}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <CheckCircle2 className="w-8 h-8" style={{ color: '#22c55e' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>All caught up!</p>
              <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>No pending approvals</p>
            </div>
          )}
        </Card>

      </div>
      </WidgetErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* LOWER ROW — Top Recruiters | Source Analytics | Activity | Health     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Top Recruiters */}
        {(isAdminOrOwner || has('users:view')) && topRecruiters.length > 0 ? (
          <Card>
            <SectionHeader
              icon={Trophy}
              title="Top Recruiters"
              subtitle="By activity (7 days)"
              action={
                has('users:view') && (
                  <Link to="/users" className="text-xs font-medium" style={{ color: '#7c3aed' }}>View All</Link>
                )
              }
            />
            <div className="space-y-1.5">
              {topRecruiters.map((r, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 p-2 rounded-xl"
                    style={{
                      background: i === 0 ? 'rgba(246,165,53,0.08)' : 'var(--bg-hover)',
                      border: i === 0 ? '1px solid rgba(246,165,53,0.22)' : '1px solid transparent',
                    }}
                  >
                    <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                      {medal
                        ? <span className="text-base leading-none">{medal}</span>
                        : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#7c3aed' }}>
                            {i + 1}
                          </div>
                        )
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{r.user_name || r.name}</p>
                      {r.role && <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{r.role}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold" style={{ color: '#7c3aed' }}>{(r.action_count || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>actions</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : (
          /* Placeholder if no recruiters — keeps grid layout intact */
          <Card>
            <SectionHeader icon={Trophy} title="Top Recruiters" subtitle="By activity (7 days)" />
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Trophy className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data yet</p>
            </div>
          </Card>
        )}

        {/* Source Analytics */}
        <Card>
          <SectionHeader
            icon={Target}
            title="Source Analytics"
            subtitle="Candidates by source"
            action={
              has('candidates:view') && (
                <Link to="/candidates" className="text-xs font-medium" style={{ color: '#7c3aed' }}>View all</Link>
              )
            }
          />
          {sourceData.length > 0 ? (
            <>
              {roleData.length > 0 && (
                <div className="mb-1.5 -mx-1">
                  <ResponsiveContainer width="100%" height={80}>
                    <PieChart>
                      <Pie
                        data={roleData}
                        cx="50%" cy="50%"
                        innerRadius={28} outerRadius={46}
                        paddingAngle={3}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={700}
                      >
                        {roleData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartTooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-2">
                {sourceData.map(([src, count], i) => {
                  const maxSrc = sourceData[0][1]
                  const pct = Math.max(Math.round((count / maxSrc) * 100), 5)
                  return (
                    <div key={src}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs truncate" style={{ color: 'var(--text-secondary)', maxWidth: '65%' }}>{src}</span>
                        <span className="text-xs font-bold" style={{ color: 'var(--text-heading)' }}>{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-hover)' }}>
                        <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: SRC_COLORS[i % SRC_COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Target className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No source data yet</p>
            </div>
          )}
        </Card>

        {/* Activity Trend */}
        {(isAdminOrOwner || has('audit:view')) && (
          <Card>
            <SectionHeader
              icon={BarChart2}
              title="Activity Trend"
              subtitle="Platform activity"
              action={<PeriodFilter value={period.key} onChange={setPeriod} />}
            />
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartTooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Actions" radius={[3, 3, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <HiringTrend data={trendData} loading={trendLoading} height={120} />
            )}
            {activity_stats && (
              <div className="flex gap-4 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>
                    {(activity_stats.total_actions || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Total actions (7d)</p>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Recruitment Health */}
        <Card>
          <SectionHeader
            icon={Zap}
            title="Recruitment Health"
            subtitle="Pipeline efficiency"
          />
          {healthMetrics.length > 0 ? (
            <div className="space-y-2.5">
              {healthMetrics.map(m => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: m.value >= m.target ? '#22c55e' : '#f59e0b' }}>{m.value}%</span>
                      <span className="text-[9px]" style={{ color: 'var(--text-disabled)' }}>/ {m.target}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--bg-hover)' }}>
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(m.value, 100)}%`,
                        background: m.value >= m.target ? '#22c55e' : m.value >= m.target * 0.6 ? m.color : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Zap className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No health data yet</p>
            </div>
          )}
          {rejectRate !== null && (
            <div className="mt-2 pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Rejection Rate</span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: rejectRate <= 30 ? 'rgba(34,197,94,0.10)' : 'rgba(255,71,87,0.10)',
                  color: rejectRate <= 30 ? '#22c55e' : '#ef4444',
                }}
              >
                {rejectRate}%
              </span>
            </div>
          )}
        </Card>

      </div>
      </WidgetErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* BOTTOM ROW — Recent Activity | Announcements                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Recent Activity */}
        {isAdminOrOwner && has('audit:view') && (
          <Card>
            <SectionHeader
              icon={History}
              title="Recent Activity"
              subtitle="Latest platform actions"
              action={
                <Link to="/audit-logs" className="text-xs font-medium" style={{ color: '#7c3aed' }}>View all</Link>
              }
            />
            {Array.isArray(recent_activity) && recent_activity.length > 0
              ? recent_activity.slice(0, 7).map((a, i) => {
                  const cfg = {
                    create: { bg: 'rgba(34,197,94,0.10)',  color: '#22c55e' },
                    update: { bg: 'rgba(79,172,254,0.10)', color: '#4FACFE' },
                    delete: { bg: 'rgba(255,71,87,0.10)',  color: '#ef4444' },
                    login:  { bg: 'rgba(246,165,53,0.10)', color: '#f59e0b' },
                  }[a.action] || { bg: 'var(--bg-hover)', color: 'var(--text-muted)' }
                  return (
                    <div
                      key={a.id || i}
                      className="flex items-start gap-3 py-2"
                      style={{ borderBottom: i < Math.min(recent_activity.length, 7) - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                    >
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold flex-shrink-0 mt-0.5 uppercase" style={{ background: cfg.bg, color: cfg.color }}>
                        {a.action_display || a.action}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.description}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {a.user_name} · {formatDateTime(a.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })
              : (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <History className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No recent activity</p>
                </div>
              )
            }
          </Card>
        )}

        {/* Announcements */}
        <Card>
          <SectionHeader
            icon={Bell}
            title="Announcements"
            subtitle="Latest from your team"
            action={
              <Link to="/hrm" className="text-xs font-medium" style={{ color: '#7c3aed' }}>View all</Link>
            }
          />
          {Array.isArray(announcements) && announcements.length > 0 ? (
            <div className="space-y-2">
              {announcements.slice(0, 3).map((ann, i) => {
                const isHigh = ann.priority === 'high' || ann.priority === 'urgent'
                return (
                  <div
                    key={ann._id || ann.id || i}
                    className="p-2.5 rounded-xl"
                    style={{
                      background: isHigh ? 'rgba(255,71,87,0.05)' : 'var(--bg-hover)',
                      border: isHigh ? '1px solid rgba(255,71,87,0.20)' : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{ann.title}</p>
                      {isHigh && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap" style={{ background: 'rgba(255,71,87,0.12)', color: '#ef4444' }}>
                          HIGH PRIORITY
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {ann.body || ann.content || ann.message || ann.description}
                    </p>
                    {ann.created_at && (
                      <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-disabled)' }}>
                        {formatDateTime(ann.created_at)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Bell className="w-8 h-8" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No announcements</p>
              <p className="text-xs text-center" style={{ color: 'var(--text-disabled)' }}>
                HRM announcements will appear here
              </p>
            </div>
          )}
        </Card>

      </div>
      </WidgetErrorBoundary>

      {/* ── Upgrade Modal ─────────────────────────────────────────────────────── */}
      <UpgradeSeatsModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        seatStatus={seatStatus ?? {}}
      />
    </div>
  )
}

// ── Exported component — wraps inner component with page-level error boundary ─
const AdminDashboardWithBoundary = () => (
  <DashboardPageBoundary>
    <AdminDashboard />
  </DashboardPageBoundary>
)

export default AdminDashboardWithBoundary
