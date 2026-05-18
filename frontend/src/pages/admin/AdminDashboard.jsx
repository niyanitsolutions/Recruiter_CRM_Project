import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Users, UserCheck, Building, Award, Briefcase, Calendar,
  UserPlus, History, TrendingUp, Activity, ArrowRight,
  RefreshCw, Users2, DollarSign, Target, Sparkles,
  Lightbulb, BarChart2, Clock, CheckCircle2, XCircle,
  AlertTriangle, Trophy, Zap, Star, ChevronRight,
} from 'lucide-react'
import {
  Tooltip as RechartTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
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
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'
import KpiCard from '../../components/dashboard/KpiCard'
import HiringFunnel from '../../components/dashboard/HiringFunnel'
import CandidatePipelineChart from '../../components/dashboard/CandidatePipelineChart'
import HiringTrend from '../../components/dashboard/HiringTrend'
import { formatDateTime } from '../../utils/format'

// ── Module-level cache — survives SPA navigation, TTL 5 min ──────────────────
const DASH_CACHE_TTL = 5 * 60 * 1000
const _cache = {
  main: null, recruit: null, seat: null,
  ivStats: null, todayIv: null, jobStats: null,
  candStats: null, hrmStats: null,
  ts: 0, company_id: null,
}

// ── Animated counter ──────────────────────────────────────────────────────────
const useCounter = (target, duration = 800) => {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null || isNaN(target)) return
    let raf
    const start = Date.now()
    const tick = () => {
      const elapsed  = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

// ── Gradient palette ──────────────────────────────────────────────────────────
const GRADIENTS = {
  purple: { icon: 'var(--stat-purple)', glow: 'rgba(108,99,255,0.20)', border: 'var(--stat-border-purple)' },
  blue:   { icon: 'var(--stat-blue)',   glow: 'rgba(79,172,254,0.20)',  border: 'var(--stat-border-blue)'   },
  green:  { icon: 'var(--stat-green)',  glow: 'rgba(67,233,123,0.20)',  border: 'var(--stat-border-green)'  },
  orange: { icon: 'var(--stat-orange)', glow: 'rgba(250,130,49,0.20)',  border: 'var(--stat-border-orange)' },
  red:    { icon: 'var(--stat-red)',    glow: 'rgba(255,71,87,0.20)',   border: 'var(--stat-border-red)'    },
  pink:   { icon: 'var(--stat-pink)',   glow: 'rgba(255,107,157,0.20)', border: 'var(--stat-border-pink)'   },
  teal:   { icon: 'var(--stat-teal)',   glow: 'rgba(56,249,215,0.20)',  border: 'var(--stat-border-teal)'   },
  yellow: { icon: 'var(--stat-yellow)', glow: 'rgba(246,211,101,0.20)', border: 'var(--stat-border-yellow)' },
}

// ── Secondary stat card ───────────────────────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, color = 'purple', linkTo, trend, subtitle }) => {
  const count = useCounter(typeof value === 'number' ? value : null)
  const grad  = GRADIENTS[color] || GRADIENTS.purple
  const [hov, setHov] = useState(false)
  const trendUp = trend && !trend.startsWith('-')
  const tint = grad.glow.replace(/[\d.]+\)$/, '0.07)')

  const card = (
    <div
      className="rounded-2xl p-5 cursor-default relative overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-card)',
        border:     '1px solid var(--border-card)',
        borderLeft: `4px solid ${grad.border}`,
        boxShadow:  hov
          ? `0 0 25px ${grad.glow}, 0 8px 32px ${grad.glow}, var(--shadow-card)`
          : 'var(--shadow-card)',
        transform:  hov ? 'scale(1.03) translateY(-2px)' : 'scale(1) translateY(0)',
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${tint} 0%, transparent 65%)`,
          opacity: hov ? 1 : 0, transition: 'opacity 0.3s ease',
        }}
      />
      <div className="relative flex items-start justify-between mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{
            background: grad.icon, boxShadow: `0 4px 12px ${grad.glow}`,
            transform: hov ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.3s ease',
          }}
        >
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: trendUp ? 'var(--bg-success)' : 'var(--bg-danger)',
              color:      trendUp ? 'var(--text-success)' : 'var(--text-danger)',
            }}
          >
            {trendUp ? '▲' : '▼'} {trend}
          </span>
        )}
      </div>
      <p className="relative text-2xl font-bold leading-none mb-1" style={{ color: 'var(--text-heading)' }}>
        {value == null
          ? <span style={{ color: 'var(--text-disabled)' }}>—</span>
          : (typeof value === 'string' ? value : count.toLocaleString('en-IN'))
        }
      </p>
      <p className="relative text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{title}</p>
      {subtitle && (
        <p className="relative text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>{subtitle}</p>
      )}
    </div>
  )
  return linkTo ? <Link to={linkTo} className="block">{card}</Link> : card
}

// ── Activity feed item ────────────────────────────────────────────────────────
const ActivityItem = ({ activity }) => {
  const cfg = {
    create: { bg: 'var(--bg-success)', color: 'var(--text-success)' },
    update: { bg: 'var(--bg-info)',    color: 'var(--text-info)'    },
    delete: { bg: 'var(--bg-danger)',  color: 'var(--text-danger)'  },
    login:  { bg: 'var(--bg-warning)', color: 'var(--text-warning)' },
  }[activity.action] || { bg: 'var(--bg-hover)', color: 'var(--text-muted)' }

  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span
        className="px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 mt-0.5"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        {activity.action_display || activity.action}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{activity.description}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          by {activity.user_name} · {formatDateTime(activity.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between mb-4">
    <div>
      <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
        {Icon && <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
        {title}
      </h2>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
    </div>
    {action}
  </div>
)

// ── Chart card wrapper ────────────────────────────────────────────────────────
const ChartCard = ({ children, className = '' }) => (
  <div
    className={`rounded-2xl p-5 ${className}`}
    style={{
      backgroundColor: 'var(--bg-card)',
      border:          '1px solid var(--border-card)',
      boxShadow:       'var(--shadow-card)',
    }}
  >
    {children}
  </div>
)

// ── Custom recharts tooltip ───────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2 text-sm shadow-lg"
      style={{
        background: 'var(--bg-card-alt)',
        border:     '1px solid var(--border-strong)',
        color:      'var(--text-primary)',
      }}
    >
      {label && <p className="font-semibold mb-1" style={{ color: 'var(--text-heading)' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--text-secondary)' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ── Period filter ─────────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'week',    label: '7D',  days: 7   },
  { key: 'month',   label: '30D', days: 30  },
  { key: 'quarter', label: '90D', days: 90  },
  { key: 'year',    label: '1Y',  days: 365 },
]

const PeriodFilter = ({ value, onChange }) => (
  <div
    className="flex rounded-lg p-0.5 gap-0.5"
    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
  >
    {PERIODS.map(p => (
      <button
        key={p.key}
        onClick={() => onChange(p)}
        className="px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200"
        style={value === p.key
          ? { background: 'var(--accent)', color: '#fff' }
          : { color: 'var(--text-muted)', background: 'transparent' }
        }
      >
        {p.label}
      </button>
    ))}
  </div>
)

// ── Conversion strip ──────────────────────────────────────────────────────────
const ConversionStrip = ({ applied, screening, interview, offered, joined }) => {
  const calc = (a, b) => (a > 0 ? Math.round((b / a) * 100) : null)
  const steps = [
    { from: 'Applied',   to: 'Screened',  rate: calc(applied, screening),   color: '#4FACFE' },
    { from: 'Screened',  to: 'Interview', rate: calc(screening, interview),  color: '#43E97B' },
    { from: 'Interview', to: 'Offer',     rate: calc(interview, offered),    color: '#F6D365' },
    { from: 'Offer',     to: 'Joined',    rate: calc(offered, joined),       color: '#FA8231' },
  ]
  return (
    <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
        Stage Conversion Rates
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map(s => (
          <div key={s.to} className="rounded-xl px-3 py-3 text-center" style={{ background: 'var(--bg-hover)' }}>
            <div
              className="text-xl font-bold"
              style={{ color: s.rate !== null ? s.color : 'var(--text-disabled)' }}
            >
              {s.rate !== null ? `${s.rate}%` : '—'}
            </div>
            <div className="text-[10px] mt-1 leading-tight" style={{ color: 'var(--text-muted)' }}>
              {s.from} → {s.to}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Interview status config ───────────────────────────────────────────────────
const IV_STATUS = {
  scheduled:  { bg: 'var(--bg-info)',    color: 'var(--text-info)'    },
  confirmed:  { bg: 'var(--bg-success)', color: 'var(--text-success)' },
  completed:  { bg: 'var(--bg-success)', color: 'var(--text-success)' },
  cancelled:  { bg: 'var(--bg-danger)',  color: 'var(--text-danger)'  },
  no_show:    { bg: 'var(--bg-warning)', color: 'var(--text-warning)' },
}

// ── Interview card ────────────────────────────────────────────────────────────
const InterviewCard = ({ iv }) => {
  const cfg = IV_STATUS[iv.status] || IV_STATUS.scheduled
  const dt  = iv.scheduled_at || iv.interview_time || iv.scheduled_time

  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
        style={{ background: 'var(--stat-purple)' }}
      >
        <Calendar className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>
          {iv.candidate_name || iv.candidate?.name || 'Candidate'}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {iv.job_title || iv.job?.title || iv.position || 'Position'}
          {iv.round && ` · Round ${iv.round}`}
          {iv.mode && ` · ${iv.mode}`}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {dt && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Clock className="w-3 h-3 flex-shrink-0" />
              {formatDateTime(dt)}
            </span>
          )}
          <span
            className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            {(iv.status || 'scheduled').replace('_', ' ')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Horizontal source bar ─────────────────────────────────────────────────────
const SourceBar = ({ label, value, max, color }) => {
  const pct = Math.max(Math.round((value / max) * 100), 4)
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-xs truncate text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div className="flex-1 rounded-full h-2" style={{ background: 'var(--bg-hover)' }}>
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="w-8 text-xs text-right flex-shrink-0 font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

// ── Format trend data ─────────────────────────────────────────────────────────
const formatTrendData = (raw) => {
  if (!raw) return []
  const items = Array.isArray(raw) ? raw : (raw.data || raw.items || [])
  if (!Array.isArray(items)) return []
  return items.map(item => ({
    label: item.date
      ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
      : (item.label || ''),
    value: item.count ?? item.value ?? item.actions ?? 0,
  }))
}

// ── Color palettes ────────────────────────────────────────────────────────────
const SRC_COLORS  = ['#6C63FF', '#4FACFE', '#43E97B', '#FA8231', '#FF6B9D', '#38F9D7', '#F6D365', '#FF4757']
const PIE_COLORS  = ['#6C63FF', '#4FACFE', '#43E97B', '#FA8231', '#FF4757', '#FF6B9D', '#38F9D7']

// ─────────────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const user        = useSelector(selectUser)
  const permissions = useSelector(selectUserPermissions)
  const perms       = new Set(permissions)
  const isAdminOrOwner = user?.isOwner || user?.role === 'admin'
  const has = (...p) => p.some(x => perms.has(x))

  const [loading,          setLoading]          = useState(true)
  const [trendLoading,     setTrendLoading]      = useState(false)
  const [error,            setError]             = useState(null)
  const [dashboardData,    setDashboardData]     = useState(null)
  const [recruitStats,     setRecruitStats]      = useState(null)
  const [ivStats,          setIvStats]           = useState(null)
  const [todayIvs,         setTodayIvs]          = useState([])
  const [jobStats,         setJobStats]          = useState(null)
  const [candStats,        setCandStats]         = useState(null)
  const [hrmStats,         setHrmStats]          = useState(null)
  const [seatStatus,       setSeatStatus]        = useState(null)
  const [trendRaw,         setTrendRaw]          = useState(null)
  const [period,           setPeriod]            = useState(PERIODS[1])
  const [showUpgradeModal, setShowUpgradeModal]  = useState(false)

  // ── Fetch trend ─────────────────────────────────────────────────────────────
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

  // ── Fetch all dashboard data in parallel ────────────────────────────────────
  const fetchDashboardData = useCallback(async (force = false) => {
    if (
      !force &&
      _cache.ts &&
      _cache.company_id === user?.company_id &&
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
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [mainRes, recruitRes, ivStatsRes, todayIvRes, jobRes, candRes, hrmRes, seatRes] =
        await Promise.allSettled([
          adminDashboardService.getDashboardData(),
          applicationService.getDashboardStats(),
          interviewService.getDashboardStats(),
          interviewService.getTodayInterviews(),
          jobService.getDashboardStats(),
          candidateService.getDashboardStats(),
          hrmService.getDashboardStats(),
          subscriptionService.getTenantSeatStatus(),
        ])

      const main    = mainRes.status    === 'fulfilled' ? mainRes.value?.data    : null
      const recruit = recruitRes.status === 'fulfilled' ? recruitRes.value?.data : null
      const ivs     = ivStatsRes.status === 'fulfilled' ? ivStatsRes.value?.data : null

      const rawTodayIv = todayIvRes.status === 'fulfilled' ? todayIvRes.value?.data : null
      const todayIvList = Array.isArray(rawTodayIv)
        ? rawTodayIv
        : (rawTodayIv?.interviews || rawTodayIv?.data || [])

      const jobs  = jobRes.status  === 'fulfilled' ? jobRes.value?.data  : null
      const cands = candRes.status === 'fulfilled' ? candRes.value?.data : null

      // hrmService returns the axios response directly (not response.data)
      const hrm  = hrmRes.status  === 'fulfilled' ? (hrmRes.value?.data?.data  ?? hrmRes.value?.data)  : null
      const seat = seatRes.status === 'fulfilled' ? (seatRes.value?.data?.data ?? seatRes.value?.data) : null

      _cache.main      = main
      _cache.recruit   = recruit
      _cache.ivStats   = ivs
      _cache.todayIv   = todayIvList
      _cache.jobStats  = jobs
      _cache.candStats = cands
      _cache.hrmStats  = hrm
      _cache.seat      = seat
      _cache.ts        = Date.now()
      _cache.company_id = user?.company_id

      setDashboardData(main)
      setRecruitStats(recruit)
      setIvStats(ivs)
      setTodayIvs(todayIvList)
      setJobStats(jobs)
      setCandStats(cands)
      setHrmStats(hrm)
      setSeatStatus(seat)
      setError(null)
    } catch (err) {
      setError('Failed to load dashboard data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user?.company_id])

  useEffect(() => {
    fetchDashboardData()
    fetchTrend(period.days)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTrend(period.days)
  }, [period, fetchTrend])

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 page-enter">
        <div className="h-32 rounded-2xl skeleton" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-36 rounded-2xl skeleton" />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 rounded-2xl skeleton" />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl skeleton" />)}
        </div>
        <div className="h-96 rounded-2xl skeleton" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-2xl skeleton" />
          <div className="h-64 rounded-2xl skeleton" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56 rounded-2xl skeleton" />
          <div className="h-56 rounded-2xl skeleton" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56 rounded-2xl skeleton" />
          <div className="h-56 rounded-2xl skeleton" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-xl" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
          {error}
          <button onClick={() => fetchDashboardData(true)} className="ml-4 underline">Retry</button>
        </div>
      </div>
    )
  }

  const { user_stats, activity_stats, recent_activity, quick_stats } = dashboardData || {}

  // ── KPI computations ────────────────────────────────────────────────────────
  const totalCandidates = candStats?.total ?? quick_stats?.candidates
  const activeJobs      = jobStats?.open   ?? quick_stats?.jobs
  const appsInProgress  = recruitStats?.total != null
    ? Math.max(0, (recruitStats.total || 0) - (recruitStats.joined || 0) - (recruitStats.rejected || 0))
    : null
  const interviewsToday = ivStats?.today ?? ivStats?.today_count
    ?? (Array.isArray(todayIvs) ? todayIvs.length : null)
    ?? quick_stats?.interviews

  const offersPending   = recruitStats?.offered
  const placementsMonth = recruitStats?.joined
  const billingPayouts  = quick_stats?.payouts

  const totalUsers      = user_stats?.total_users
  const loggedInToday   = user_stats?.logged_in_today
  const onLeaveToday    = hrmStats?.on_leave_today ?? hrmStats?.leaves_today ?? hrmStats?.on_leave
  const pendingFeedback = ivStats?.pending_feedback ?? ivStats?.pending_feedback_count

  const toRate    = (a, b) => (a > 0 ? Math.round((b / a) * 100) : null)
  const offerRate  = toRate(recruitStats?.applied, recruitStats?.offered)
  const joinRate   = toRate(recruitStats?.offered, recruitStats?.joined)
  const rejectRate = recruitStats?.total > 0
    ? Math.round(((recruitStats.rejected || 0) / recruitStats.total) * 100)
    : null

  // ── Funnel data (6 main pipeline stages) ────────────────────────────────────
  const funnelData = recruitStats ? [
    { stage: 'Applied',     value: recruitStats.applied     || 0, fill: '#6C63FF' },
    { stage: 'Screening',   value: recruitStats.screening   || 0, fill: '#4FACFE' },
    { stage: 'Shortlisted', value: recruitStats.shortlisted || 0, fill: '#38F9D7' },
    { stage: 'Interview',   value: recruitStats.interview   || 0, fill: '#43E97B' },
    { stage: 'Offered',     value: recruitStats.offered     || 0, fill: '#F6D365' },
    { stage: 'Joined',      value: recruitStats.joined      || 0, fill: '#FA8231' },
  ] : []

  // ── Source analytics ─────────────────────────────────────────────────────────
  const sourceData = candStats?.by_source
    ? Object.entries(candStats.by_source)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
    : []
  const maxSource = sourceData[0]?.[1] || 1

  // ── Top recruiters ───────────────────────────────────────────────────────────
  const topRecruiters = activity_stats?.top_users?.slice(0, 5) || []

  // ── Trend data ───────────────────────────────────────────────────────────────
  const trendData = formatTrendData(trendRaw)

  // ── Users by role ────────────────────────────────────────────────────────────
  const roleData = user_stats?.users_by_role
    ? Object.entries(user_stats.users_by_role)
        .filter(([, v]) => v > 0)
        .map(([role, count], i) => ({
          name:  role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: count,
          fill:  PIE_COLORS[i % PIE_COLORS.length],
        }))
    : []

  // ── Quick insights ───────────────────────────────────────────────────────────
  const insights = [
    recruitStats?.recent_week > 0 && {
      color: '#43E97B', icon: Zap,
      text: `${recruitStats.recent_week} new application${recruitStats.recent_week > 1 ? 's' : ''} this week`,
    },
    offerRate !== null && {
      color: offerRate >= 30 ? '#43E97B' : '#F6D365', icon: TrendingUp,
      text: `${offerRate}% overall offer rate`,
    },
    joinRate !== null && {
      color: joinRate >= 60 ? '#43E97B' : '#FA8231', icon: CheckCircle2,
      text: `${joinRate}% of offers accepted / joined`,
    },
    rejectRate !== null && rejectRate > 0 && {
      color: '#FF4757', icon: XCircle,
      text: `${rejectRate}% rejection rate across pipeline`,
    },
    loggedInToday > 0 && {
      color: '#4FACFE', icon: Activity,
      text: `${loggedInToday} user${loggedInToday > 1 ? 's' : ''} active today`,
    },
    onLeaveToday > 0 && {
      color: '#F6D365', icon: AlertTriangle,
      text: `${onLeaveToday} employee${onLeaveToday > 1 ? 's' : ''} on leave today`,
    },
    pendingFeedback > 0 && {
      color: '#FF6B9D', icon: AlertTriangle,
      text: `${pendingFeedback} interview${pendingFeedback > 1 ? 's' : ''} awaiting feedback`,
    },
  ].filter(Boolean)

  return (
    <div className="p-6 space-y-6 page-enter">

      {/* ── Welcome Banner ───────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: 'var(--gradient-1)', boxShadow: '0 8px 32px rgba(108,99,255,0.30)' }}
      >
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-20"
          style={{ background: 'rgba(255,255,255,0.3)', filter: 'blur(30px)' }} />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10"
          style={{ background: 'rgba(255,255,255,0.4)', filter: 'blur(25px)' }} />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-white/70" />
              <span className="text-white/70 text-xs font-medium uppercase tracking-widest">Welcome back</span>
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">{user?.fullName || 'User'}! 👋</h1>
            <p className="text-white/70 text-sm mt-1">
              Your recruitment operations snapshot for today.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {has('candidates:create') && (
              <Link to="/candidates/new"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.40)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}>
                <UserPlus className="w-4 h-4" /> Add Candidate
              </Link>
            )}
            {has('jobs:create') && (
              <Link to="/jobs/new"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'white', color: '#7c3aed' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.90)'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                <Briefcase className="w-4 h-4" /> Post Job
              </Link>
            )}
            <button
              onClick={() => fetchDashboardData(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Subscription sections ─────────────────────────────────────────────── */}
      {isAdminOrOwner && (
        <SubscriptionBanner seatStatus={seatStatus} onUpgrade={() => setShowUpgradeModal(true)} />
      )}
      {isAdminOrOwner && seatStatus && (
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Subscription</p>
              <p className="text-base font-bold mt-0.5" style={{ color: 'var(--text-heading)' }}>
                {seatStatus.plan_display_name || seatStatus.plan_name}
                {seatStatus.is_trial && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>Trial</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-6">
              {[
                { label: 'Seats',     value: seatStatus.total_user_seats,     color: 'var(--text-heading)' },
                { label: 'Active',    value: seatStatus.current_active_users,  color: 'var(--text-info)'    },
                { label: 'Remaining', value: seatStatus.remaining_seats,
                  color: seatStatus.remaining_seats === 0 ? 'var(--text-danger)' : 'var(--text-success)' },
                { label: 'Expiry',    value: seatStatus.plan_expiry
                    ? new Date(seatStatus.plan_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
                    : '—', color: 'var(--text-heading)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className="text-xl font-bold" style={{ color }}>{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ color: 'var(--accent)', border: '1px solid var(--accent)', background: 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Upgrade / Add Seats
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 1 — Core Recruitment KPIs                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {(has('candidates:view') || has('jobs:view') || has('interviews:view')) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {has('candidates:view') && (
            <KpiCard
              title="Total Candidates"
              value={totalCandidates}
              subtitle="In active pipeline"
              icon={Users2}
              color="purple"
              delay={0}
              trend={recruitStats?.recent_week > 0
                ? { value: `+${recruitStats.recent_week} this week`, dir: 'up' }
                : undefined}
              linkTo="/candidates"
            />
          )}
          {has('jobs:view') && (
            <KpiCard
              title="Active Jobs"
              value={activeJobs}
              subtitle={jobStats?.filled != null ? `${jobStats.filled} filled this period` : 'Open positions'}
              icon={Briefcase}
              color="blue"
              delay={80}
              linkTo="/jobs"
            />
          )}
          {has('candidates:view') && (
            <KpiCard
              title="In Progress"
              value={appsInProgress}
              subtitle="Applications being evaluated"
              icon={Activity}
              color="orange"
              delay={160}
              linkTo="/applications"
            />
          )}
          {has('interviews:view') && (
            <KpiCard
              title="Interviews Today"
              value={interviewsToday}
              subtitle={ivStats?.this_week > 0 ? `${ivStats.this_week} this week` : 'Scheduled today'}
              icon={Calendar}
              color="teal"
              delay={240}
              trend={pendingFeedback > 0
                ? { value: `${pendingFeedback} awaiting feedback`, dir: 'neutral' }
                : undefined}
              linkTo="/interviews"
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 2 — Business Performance KPIs                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {(has('candidates:view') || has('accounts:payouts') || isAdminOrOwner) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {has('candidates:view') && (
            <KpiCard
              title="Offers Pending"
              value={offersPending}
              subtitle="Awaiting candidate response"
              icon={Award}
              color="yellow"
              delay={0}
              trend={offerRate !== null
                ? { value: `${offerRate}% offer rate`, dir: offerRate >= 20 ? 'up' : 'neutral' }
                : undefined}
              linkTo="/applications"
            />
          )}
          {has('candidates:view') && (
            <KpiCard
              title="Placements"
              value={placementsMonth}
              subtitle={joinRate !== null ? `${joinRate}% offer acceptance` : 'Successfully joined'}
              icon={TrendingUp}
              color="green"
              delay={80}
              trend={joinRate !== null
                ? { value: `${joinRate}% join rate`, dir: joinRate >= 50 ? 'up' : 'down' }
                : undefined}
            />
          )}
          {isAdminOrOwner && (
            <KpiCard
              title="Revenue"
              value={null}
              subtitle="Coming soon"
              icon={DollarSign}
              color="pink"
              delay={160}
            />
          )}
          {has('accounts:payouts') && (
            <KpiCard
              title="Partner Payouts"
              value={billingPayouts}
              subtitle="Total payouts processed"
              icon={DollarSign}
              color="teal"
              delay={240}
              linkTo="/payouts"
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 3 — Operations KPIs                                                */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {(has('users:view') || isAdminOrOwner) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {has('users:view') && (
            <StatCard
              title="Total Users"
              value={totalUsers}
              icon={Users}
              color="purple"
              linkTo="/users"
            />
          )}
          {has('users:view') && (
            <StatCard
              title="Logged In Today"
              value={loggedInToday}
              icon={UserCheck}
              color="blue"
            />
          )}
          {isAdminOrOwner && (
            <StatCard
              title="On Leave Today"
              value={onLeaveToday ?? null}
              icon={Building}
              color="orange"
              subtitle={onLeaveToday == null ? 'HRM module required' : undefined}
            />
          )}
          {has('interviews:view') && (
            <StatCard
              title="Pending Feedback"
              value={pendingFeedback ?? null}
              icon={AlertTriangle}
              color={pendingFeedback > 0 ? 'red' : 'green'}
              linkTo="/interviews"
              subtitle="Interviews awaiting review"
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 4 — PIPELINE ANALYTICS (MOST IMPORTANT SECTION)                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {has('candidates:view') && (recruitStats || funnelData.some(d => d.value > 0)) && (
        <ChartCard>
          {/* Header */}
          <div className="flex items-start sm:items-center justify-between gap-3 mb-6 flex-wrap">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                <BarChart2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                Pipeline Analytics
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                End-to-end recruitment funnel
                {recruitStats?.total > 0 && ` · ${recruitStats.total.toLocaleString('en-IN')} total applications`}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {recruitStats?.rejected > 0 && (
                <span
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(255,71,87,0.10)', color: '#FF4757', border: '1px solid rgba(255,71,87,0.22)' }}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {recruitStats.rejected.toLocaleString('en-IN')} Rejected
                </span>
              )}
              <Link
                to="/applications"
                className="text-xs font-medium flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Two-column: Funnel | Pipeline donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left — Hiring Funnel */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-muted)' }}>
                Hiring Funnel
              </p>
              <HiringFunnel data={funnelData} rejectedCount={recruitStats?.rejected} />
            </div>

            {/* Right — Donut + conversion pills */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-muted)' }}>
                Candidate Pipeline
              </p>
              <CandidatePipelineChart data={funnelData} total={recruitStats?.total || 0} />

              {/* Rate pills */}
              {recruitStats && (
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    { label: 'Offer Rate',  value: offerRate,  color: 'var(--text-success)' },
                    { label: 'Join Rate',   value: joinRate,   color: 'var(--text-info)'    },
                    { label: 'Reject Rate', value: rejectRate, color: 'var(--text-danger)'  },
                  ].map(m => (
                    <div key={m.label} className="text-center py-2.5 px-1 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                      <div className="text-lg font-bold" style={{ color: m.value !== null ? m.color : 'var(--text-disabled)' }}>
                        {m.value !== null ? `${m.value}%` : '—'}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Conversion strip — full width below both columns */}
          {recruitStats && (
            <ConversionStrip
              applied={recruitStats.applied}
              screening={recruitStats.screening}
              interview={recruitStats.interview}
              offered={recruitStats.offered}
              joined={recruitStats.joined}
            />
          )}
        </ChartCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 5 — Activity Trend | Source Analytics                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {(isAdminOrOwner || has('candidates:view')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Activity Trend */}
          {has('audit:view') && (
            <ChartCard>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  Activity Trend
                </h2>
                <PeriodFilter value={period.key} onChange={setPeriod} />
              </div>
              <HiringTrend data={trendData} loading={trendLoading} height={185} />
              {activity_stats && (
                <div className="flex items-center gap-6 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>
                      {(activity_stats.total_actions || 0).toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total actions (7d)</p>
                  </div>
                  {topRecruiters.slice(0, 2).map((u, i) => (
                    <div key={i}>
                      <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                        {u.action_count}
                      </p>
                      <p className="text-xs truncate max-w-[96px]" style={{ color: 'var(--text-muted)' }}>
                        {u.user_name}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          )}

          {/* Source Analytics */}
          {has('candidates:view') && sourceData.length > 0 && (
            <ChartCard>
              <SectionHeader
                icon={Target}
                title="Source Analytics"
                subtitle={`Candidates by acquisition source`}
                action={
                  <Link to="/candidates" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                    View all
                  </Link>
                }
              />
              <div className="space-y-3.5">
                {sourceData.map(([source, count], i) => (
                  <SourceBar
                    key={source}
                    label={source}
                    value={count}
                    max={maxSource}
                    color={SRC_COLORS[i % SRC_COLORS.length]}
                  />
                ))}
              </div>
              {candStats?.total > 0 && (
                <p
                  className="text-xs mt-4 pt-3"
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  {candStats.total.toLocaleString('en-IN')} total candidates across all sources
                </p>
              )}
            </ChartCard>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 6 — Upcoming Interviews | Top Recruiters                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {(has('interviews:view') || (isAdminOrOwner && topRecruiters.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Upcoming Interviews */}
          {has('interviews:view') && (
            <ChartCard>
              <SectionHeader
                icon={Calendar}
                title="Upcoming Interviews"
                subtitle="Today's schedule"
                action={
                  <Link
                    to="/interviews"
                    className="text-xs font-medium flex items-center gap-0.5"
                    style={{ color: 'var(--accent)' }}
                  >
                    Full Schedule <ChevronRight className="w-3 h-3" />
                  </Link>
                }
              />
              <div>
                {todayIvs.length > 0
                  ? todayIvs.slice(0, 5).map((iv, i) => (
                      <InterviewCard key={iv._id || iv.id || i} iv={iv} />
                    ))
                  : (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <CheckCircle2 className="w-10 h-10" style={{ color: 'var(--text-disabled)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        No interviews scheduled for today
                      </p>
                    </div>
                  )
                }
              </div>
              {todayIvs.length > 5 && (
                <Link
                  to="/interviews"
                  className="flex items-center gap-1.5 text-xs font-medium mt-3 pt-3"
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--accent)' }}
                >
                  +{todayIvs.length - 5} more interviews today <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </ChartCard>
          )}

          {/* Top Recruiters */}
          {isAdminOrOwner && has('users:view') && topRecruiters.length > 0 && (
            <ChartCard>
              <SectionHeader
                icon={Trophy}
                title="Top Recruiters"
                subtitle="By activity count (last 7 days)"
                action={
                  <Link to="/users" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                    View All
                  </Link>
                }
              />
              <div className="space-y-2.5">
                {topRecruiters.map((recruiter, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--bg-hover)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{
                        background: i === 0 ? '#F6A535'
                          : i === 1 ? '#8B8FA8'
                          : i === 2 ? '#CD7F32'
                          : 'var(--stat-purple)',
                      }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>
                        {recruiter.user_name || recruiter.name}
                      </p>
                      {recruiter.role && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{recruiter.role}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold" style={{ color: 'var(--accent)' }}>
                        {(recruiter.action_count || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>actions</p>
                    </div>
                    {i === 0 && <Star className="w-4 h-4 flex-shrink-0" style={{ color: '#F6D365' }} />}
                  </div>
                ))}
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ROW 7 — Activity Feed | Quick Insights                                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {isAdminOrOwner && (has('audit:view') || insights.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Recent Activity */}
          {has('audit:view') && (
            <ChartCard>
              <SectionHeader
                icon={History}
                title="Recent Activity"
                action={
                  <Link to="/audit-logs" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                    View all
                  </Link>
                }
              />
              <div>
                {recent_activity?.length > 0
                  ? recent_activity.slice(0, 7).map((a, i) => (
                      <ActivityItem key={a.id || i} activity={a} />
                    ))
                  : (
                    <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                      No recent activity
                    </p>
                  )
                }
              </div>
            </ChartCard>
          )}

          {/* Quick Insights + Users by Role */}
          {(insights.length > 0 || roleData.length > 0) && (
            <ChartCard>
              {insights.length > 0 && (
                <>
                  <SectionHeader icon={Lightbulb} title="Quick Insights" />
                  <div className="space-y-2.5 mb-4">
                    {insights.map((ins, i) => {
                      const InsIcon = ins.icon
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded-xl px-4 py-3"
                          style={{
                            background: `${ins.color}10`,
                            border:     `1px solid ${ins.color}20`,
                          }}
                        >
                          <InsIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ins.color }} />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {ins.text}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Users by Role mini-donut */}
              {has('users:view') && roleData.length > 0 && (
                <div className={insights.length > 0 ? 'pt-4 border-t' : ''} style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                    Users by Role
                  </p>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie
                        data={roleData}
                        cx="50%" cy="50%"
                        innerRadius={42} outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                        animationBegin={0} animationDuration={800}
                      >
                        {roleData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartTooltip content={<ChartTooltip />} />
                      <Legend
                        iconType="circle" iconSize={7}
                        formatter={v => (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{v}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          )}
        </div>
      )}

      {/* ── Upgrade Modal ────────────────────────────────────────────────────── */}
      <UpgradeSeatsModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        seatStatus={seatStatus}
      />
    </div>
  )
}

export default AdminDashboard
