import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Users, UserCheck, UserMinus, Building, Award,
  Briefcase, Calendar, UserPlus, History, TrendingUp,
  Activity, ArrowRight, RefreshCw, Users2, Building2,
  DollarSign, Target, Sparkles, Lightbulb, BarChart2,
} from 'lucide-react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { selectUser, selectUserPermissions } from '../../store/authSlice'
import adminDashboardService from '../../services/adminDashboardService'
import applicationService from '../../services/applicationService'
import subscriptionService from '../../services/subscriptionService'
import SubscriptionBanner from '../../components/subscription/SubscriptionBanner'
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'
import KpiCard from '../../components/dashboard/KpiCard'
import { SkeletonKpiRow, SkeletonBox } from '../../components/common/SkeletonLoader'
import HiringFunnel from '../../components/dashboard/HiringFunnel'
import CandidatePipelineChart from '../../components/dashboard/CandidatePipelineChart'
import HiringTrend from '../../components/dashboard/HiringTrend'
import { formatDateTime } from '../../utils/format'

// ── Module-level dashboard cache — survives SPA navigation ───────────────────
// TTL: 5 minutes. Matches backend cache so we never show data older than backend.
const DASH_CACHE_TTL = 5 * 60 * 1000
const _dashCache = { data: null, recruit: null, seat: null, ts: 0 }

// ── Animated counter (used in compact stat cards) ─────────────────────────────
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
const CARD_GRADIENTS = {
  purple: { icon: 'var(--stat-purple)', glow: 'rgba(108,99,255,0.20)', border: 'var(--stat-border-purple)' },
  blue:   { icon: 'var(--stat-blue)',   glow: 'rgba(79,172,254,0.20)',  border: 'var(--stat-border-blue)'   },
  green:  { icon: 'var(--stat-green)',  glow: 'rgba(67,233,123,0.20)',  border: 'var(--stat-border-green)'  },
  orange: { icon: 'var(--stat-orange)', glow: 'rgba(250,130,49,0.20)',  border: 'var(--stat-border-orange)' },
  red:    { icon: 'var(--stat-red)',     glow: 'rgba(255,71,87,0.20)',   border: 'var(--stat-border-red)'    },
  pink:   { icon: 'var(--stat-pink)',    glow: 'rgba(255,107,157,0.20)', border: 'var(--stat-border-pink)'   },
  teal:   { icon: 'var(--stat-teal)',    glow: 'rgba(56,249,215,0.20)',  border: 'var(--stat-border-teal)'   },
  yellow: { icon: 'var(--stat-yellow)', glow: 'rgba(246,211,101,0.20)', border: 'var(--stat-border-yellow)' },
}

// ── Compact Stat Card (secondary grid) ───────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, color = 'purple', linkTo, trend }) => {
  const count   = useCounter(typeof value === 'number' ? value : null)
  const grad    = CARD_GRADIENTS[color] || CARD_GRADIENTS.purple
  const [hov, setHov] = useState(false)
  const trendUp = trend && !trend.startsWith('-')
  // derive tint from glow color (replace alpha with 0.07)
  const tint = grad.glow.replace(/[\d.]+\)$/, '0.07)')

  return (
    <div
      className="rounded-2xl p-5 cursor-default relative overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-card)',
        border:      '1px solid var(--border-card)',
        borderLeft:  `4px solid ${grad.border}`,
        boxShadow:   hov
          ? `0 0 25px ${grad.glow}, 0 8px 32px ${grad.glow}, var(--shadow-card)`
          : 'var(--shadow-card)',
        transform:   hov ? 'scale(1.03) translateY(-2px)' : 'scale(1) translateY(0)',
        transition:  'box-shadow 0.3s ease, transform 0.3s ease',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Gradient tint overlay */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${tint} 0%, transparent 65%)`,
          opacity:    hov ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      <div className="relative flex items-start justify-between mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{
            background:  grad.icon,
            boxShadow:   `0 4px 12px ${grad.glow}`,
            transform:   hov ? 'scale(1.1)' : 'scale(1)',
            transition:  'transform 0.3s ease',
          }}
        >
          <Icon className="w-5 h-5" />
        </div>
        {linkTo && (
          <Link
            to={linkTo}
            className="text-xs font-medium transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            View <ArrowRight className="w-3 h-3 inline" />
          </Link>
        )}
      </div>
      <p className="relative text-2xl font-bold leading-none mb-1" style={{ color: 'var(--text-heading)' }}>
        {value == null ? <span style={{ color: 'var(--text-disabled)' }}>—</span> : count}
      </p>
      <div className="relative flex items-center gap-2">
        <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{title}</p>
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
    </div>
  )
}

// ── Activity item ─────────────────────────────────────────────────────────────
const ActivityItem = ({ activity }) => {
  const config = {
    create: { bg: 'var(--bg-success)', color: 'var(--text-success)' },
    update: { bg: 'var(--bg-info)',    color: 'var(--text-info)'    },
    delete: { bg: 'var(--bg-danger)',  color: 'var(--text-danger)'  },
    login:  { bg: 'var(--bg-warning)', color: 'var(--text-warning)' },
  }[activity.action] || { bg: 'var(--bg-hover)', color: 'var(--text-muted)' }

  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span
        className="px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 mt-0.5"
        style={{ background: config.bg, color: config.color }}
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
const SectionHeader = ({ icon: Icon, title, action }) => (
  <div className="flex items-center justify-between mb-4">
    <h2
      className="text-base font-semibold flex items-center gap-2"
      style={{ color: 'var(--text-heading)' }}
    >
      {Icon && <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
      {title}
    </h2>
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
  { key: 'week',    label: '7D',    days: 7   },
  { key: 'month',   label: '30D',   days: 30  },
  { key: 'quarter', label: '90D',   days: 90  },
  { key: 'year',    label: '1Y',    days: 365 },
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

// ── Format trend data from activity chart API ─────────────────────────────────
const formatTrendData = (raw, days) => {
  if (!raw) return []
  const items = Array.isArray(raw) ? raw : (raw.data || raw.items || [])
  if (!Array.isArray(items)) return []
  return items.slice(-days).map(item => ({
    label: item.date
      ? new Date(item.date).toLocaleDateString('en-IN', {
          day:   '2-digit',
          month: 'short',
          timeZone: 'Asia/Kolkata',
        })
      : (item.label || ''),
    value: item.count ?? item.value ?? item.actions ?? 0,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const user        = useSelector(selectUser)
  const permissions = useSelector(selectUserPermissions)
  const perms       = new Set(permissions)
  const isAdminOrOwner = user?.isOwner || user?.role === 'admin'

  const [loading,          setLoading]          = useState(true)
  const [trendLoading,     setTrendLoading]      = useState(false)
  const [dashboardData,    setDashboardData]     = useState(null)
  const [recruitStats,     setRecruitStats]      = useState(null)
  const [trendRaw,         setTrendRaw]          = useState(null)
  const [period,           setPeriod]            = useState(PERIODS[1]) // 30D default
  const [error,            setError]             = useState(null)
  const [seatStatus,       setSeatStatus]        = useState(null)
  const [showUpgradeModal, setShowUpgradeModal]  = useState(false)

  const has = (...p) => p.some(x => perms.has(x))

  // ── Fetch trend data ────────────────────────────────────────────────────────
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

  // ── Fetch main dashboard data ───────────────────────────────────────────────
  const fetchDashboardData = useCallback(async (force = false) => {
    // Serve from module-level cache if fresh (within TTL) and not forced
    if (!force && _dashCache.ts && (Date.now() - _dashCache.ts) < DASH_CACHE_TTL) {
      setDashboardData(_dashCache.data)
      setRecruitStats(_dashCache.recruit)
      setSeatStatus(_dashCache.seat)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const [mainRes, recruitRes, seatRes] = await Promise.allSettled([
        adminDashboardService.getDashboardData(),
        applicationService.getDashboardStats(),
        subscriptionService.getTenantSeatStatus(),
      ])
      const data    = mainRes.status   === 'fulfilled' ? mainRes.value.data   : _dashCache.data
      const recruit = recruitRes.status === 'fulfilled' ? recruitRes.value.data : _dashCache.recruit
      const seat    = seatRes.status   === 'fulfilled' ? (seatRes.value.data?.data || null) : _dashCache.seat
      // Write-through to module cache
      _dashCache.data    = data
      _dashCache.recruit = recruit
      _dashCache.seat    = seat
      _dashCache.ts      = Date.now()
      setDashboardData(data)
      setRecruitStats(recruit)
      setSeatStatus(seat)
      setError(null)
    } catch (err) {
      setError('Failed to load dashboard data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
    fetchTrend(period.days)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch trend when period changes
  useEffect(() => {
    fetchTrend(period.days)
  }, [period, fetchTrend])

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 page-enter">
        <div className="h-32 rounded-2xl skeleton" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-36 rounded-2xl skeleton" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-2xl skeleton" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 rounded-2xl skeleton" />
          <div className="h-72 rounded-2xl skeleton" />
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
        <div
          className="p-4 rounded-xl"
          style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}
        >
          {error}
          <button onClick={() => fetchDashboardData(true)} className="ml-4 underline">Retry</button>
        </div>
      </div>
    )
  }

  const { user_stats, activity_stats, recent_activity, quick_stats } = dashboardData || {}

  // ── KPI data ────────────────────────────────────────────────────────────────
  const offerRate = recruitStats?.applied > 0
    ? Math.round((recruitStats.offered / recruitStats.applied) * 100)
    : null
  const joinRate  = recruitStats?.offered > 0
    ? Math.round((recruitStats.joined / recruitStats.offered) * 100)
    : null

  // ── Hiring funnel chart data ────────────────────────────────────────────────
  const funnelData = recruitStats ? [
    { stage: 'Applied',     value: recruitStats.applied     || 0, fill: '#6C63FF' },
    { stage: 'Screening',   value: recruitStats.screening   || 0, fill: '#4FACFE' },
    { stage: 'Shortlisted', value: recruitStats.shortlisted || 0, fill: '#38F9D7' },
    { stage: 'Interview',   value: recruitStats.interview   || 0, fill: '#43E97B' },
    { stage: 'Offered',     value: recruitStats.offered     || 0, fill: '#F6D365' },
    { stage: 'Joined',      value: recruitStats.joined      || 0, fill: '#FA8231' },
  ] : []

  // ── Users by role donut ─────────────────────────────────────────────────────
  const PIE_COLORS = ['#6C63FF','#4FACFE','#43E97B','#FA8231','#FF4757','#FF6B9D','#38F9D7']
  const roleData   = user_stats?.users_by_role
    ? Object.entries(user_stats.users_by_role)
        .filter(([, v]) => v > 0)
        .map(([role, count], i) => ({
          name:  role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: count,
          fill:  PIE_COLORS[i % PIE_COLORS.length],
        }))
    : []

  // ── Trend chart data ────────────────────────────────────────────────────────
  const trendData = formatTrendData(trendRaw, period.days)

  // ── Quick insight bullets ───────────────────────────────────────────────────
  const insights = [
    recruitStats?.recent_week > 0 && {
      color: '#43E97B',
      text:  `${recruitStats.recent_week} new application${recruitStats.recent_week > 1 ? 's' : ''} this week`,
    },
    offerRate !== null && {
      color: offerRate >= 30 ? '#43E97B' : '#F6D365',
      text:  `${offerRate}% offer rate from applications`,
    },
    joinRate !== null && {
      color: joinRate >= 60 ? '#43E97B' : '#FA8231',
      text:  `${joinRate}% of offers accepted / joined`,
    },
    recruitStats?.rejected > 0 && {
      color: '#FF4757',
      text:  `${recruitStats.rejected} applications rejected`,
    },
    user_stats?.logged_in_today > 0 && {
      color: '#4FACFE',
      text:  `${user_stats.logged_in_today} user${user_stats.logged_in_today > 1 ? 's' : ''} active today`,
    },
  ].filter(Boolean)

  // ── Secondary stat cards ────────────────────────────────────────────────────
  const primaryCards = [
    has('users:view')       && <StatCard key="tu" title="Total Users"     value={user_stats?.total_users}          icon={Users}     color="purple" linkTo="/users"             />,
    has('users:view')       && <StatCard key="au" title="Active Users"    value={user_stats?.active_users}         icon={UserCheck} color="green"                              />,
    has('users:view')       && <StatCard key="iu" title="Inactive Users"  value={user_stats?.inactive_users}       icon={UserMinus} color="yellow" linkTo="/users/inactive"    />,
    has('users:view')       && <StatCard key="lt" title="Logged In Today" value={user_stats?.logged_in_today}      icon={Activity}  color="blue"                               />,
    has('candidates:view')  && <StatCard key="cn" title="Candidates"      value={quick_stats?.candidates}          icon={Users2}    color="teal"   linkTo="/candidates"        />,
    has('candidates:view')  && <StatCard key="rj" title="Rejected"        value={quick_stats?.rejected_candidates} icon={UserMinus} color="red"    linkTo="/candidates"        />,
    has('clients:view')     && <StatCard key="cl" title="Active Clients"  value={quick_stats?.clients}             icon={Building2} color="blue"   linkTo="/clients"           />,
    has('jobs:view')        && <StatCard key="jb" title="Active Jobs"     value={quick_stats?.jobs}                icon={Briefcase} color="orange" linkTo="/jobs"              />,
    has('interviews:view')  && <StatCard key="iv" title="Interviews"      value={quick_stats?.interviews}          icon={Calendar}  color="purple" linkTo="/interviews"        />,
    has('onboards:view')    && <StatCard key="ob" title="Onboarding"      value={quick_stats?.onboards}            icon={UserPlus}  color="green"  linkTo="/onboards"          />,
    has('partners:view')    && <StatCard key="pt" title="Partners"        value={quick_stats?.partners}            icon={Users}     color="pink"   linkTo="/users?role=partner"/>,
    has('departments:view') && <StatCard key="dp" title="Departments"     value={quick_stats?.departments}         icon={Building}  color="blue"   linkTo="/departments"       />,
    has('designations:view')&& <StatCard key="dg" title="Designations"   value={quick_stats?.designations}        icon={Award}     color="green"  linkTo="/designations"      />,
    has('targets:view')     && <StatCard key="tg" title="Targets"         value={quick_stats?.targets}             icon={Target}    color="orange" linkTo="/targets"           />,
    has('accounts:payouts') && <StatCard key="pw" title="Partner Payouts" value={quick_stats?.payouts}             icon={DollarSign}color="teal"   linkTo="/payouts"           />,
  ].filter(Boolean)

  return (
    <div className="p-6 space-y-6 page-enter">

      {/* ── Welcome Banner ─────────────────────────────────────────────────── */}
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
            <h1 className="text-2xl font-bold text-white leading-tight">
              {user?.fullName || 'User'}! 👋
            </h1>
            <p className="text-white/70 text-sm mt-1">
              Here's what's happening in your organization today.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {has('candidates:create') && (
              <Link
                to="/candidates/new"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.18)', color: 'white', border: '1px solid rgba(255,255,255,0.40)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
              >
                <UserPlus className="w-4 h-4" /> Add Candidate
              </Link>
            )}
            {has('jobs:create') && (
              <Link
                to="/jobs/new"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'white', color: '#7c3aed' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.90)'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <Briefcase className="w-4 h-4" /> Post Job
              </Link>
            )}
            <button
              onClick={() => fetchDashboardData(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Subscription Banner ─────────────────────────────────────────────── */}
      {isAdminOrOwner && (
        <SubscriptionBanner seatStatus={seatStatus} onUpgrade={() => setShowUpgradeModal(true)} />
      )}

      {/* ── Subscription info card ──────────────────────────────────────────── */}
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
                    style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                    Trial
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-6">
              {[
                { label: 'Purchased Seats', value: seatStatus.total_user_seats,      color: 'var(--text-heading)' },
                { label: 'Active Users',    value: seatStatus.current_active_users,  color: 'var(--text-info)'    },
                { label: 'Remaining',       value: seatStatus.remaining_seats,
                  color: seatStatus.remaining_seats === 0 ? 'var(--text-danger)' : 'var(--text-success)' },
                { label: 'Expiry',          value: seatStatus.plan_expiry
                    ? new Date(seatStatus.plan_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
                    : '—',
                  color: 'var(--text-heading)' },
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
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Upgrade / Add Seats
            </button>
          </div>
        </div>
      )}

      {/* ── ROW 1 — KPI Feature Cards ─────────────────────────────────────────── */}
      {(has('candidates:view') || has('jobs:view') || has('interviews:view')) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {has('candidates:view') && (
            <KpiCard
              title="Total Candidates"
              value={quick_stats?.candidates}
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
              value={quick_stats?.jobs}
              subtitle="Open positions"
              icon={Briefcase}
              color="blue"
              delay={80}
              linkTo="/jobs"
            />
          )}
          {has('interviews:view') && (
            <KpiCard
              title="Interviews"
              value={quick_stats?.interviews}
              subtitle="Scheduled"
              icon={Calendar}
              color="teal"
              delay={160}
              linkTo="/interviews"
            />
          )}
          {has('candidates:view') && (
            <KpiCard
              title="Placements"
              value={recruitStats?.joined}
              subtitle={joinRate !== null ? `${joinRate}% offer acceptance` : 'Successfully hired'}
              icon={TrendingUp}
              color="green"
              delay={240}
              trend={offerRate !== null
                ? { value: `${offerRate}% offer rate`, dir: offerRate >= 20 ? 'up' : 'neutral' }
                : undefined}
            />
          )}
        </div>
      )}

      {/* ── ROW 2 — Secondary Stat Cards ────────────────────────────────────── */}
      {primaryCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
          {primaryCards}
        </div>
      )}

      {primaryCards.length === 0 && !has('candidates:view', 'jobs:view', 'interviews:view') && (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            No dashboard widgets available for your current permissions.
          </p>
        </div>
      )}

      {/* ── ROW 3 — Pipeline Donut + Hiring Funnel ──────────────────────────── */}
      {isAdminOrOwner && has('candidates:view') && funnelData.some(d => d.value > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Candidate Pipeline Donut */}
          <ChartCard>
            <SectionHeader
              icon={BarChart2}
              title="Candidate Pipeline"
              action={
                <Link to="/applications" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  View all
                </Link>
              }
            />
            <CandidatePipelineChart
              data={funnelData}
              total={recruitStats?.total || 0}
            />
          </ChartCard>

          {/* Visual Hiring Funnel */}
          <ChartCard>
            <SectionHeader
              icon={TrendingUp}
              title="Hiring Funnel"
              action={
                <div className="flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>Total: <strong style={{ color: 'var(--text-primary)' }}>{recruitStats?.total || 0}</strong></span>
                  <span>This week: <strong style={{ color: 'var(--accent)' }}>{recruitStats?.recent_week || 0}</strong></span>
                </div>
              }
            />
            <HiringFunnel data={funnelData} />

            {/* Conversion KPIs */}
            {recruitStats && (
              <div
                className="grid grid-cols-3 gap-2 mt-4 pt-4"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                {[
                  { label: 'Offer Rate',  value: offerRate !== null ? `${offerRate}%` : '—',  color: 'var(--text-success)' },
                  { label: 'Join Rate',   value: joinRate  !== null ? `${joinRate}%`  : '—',  color: 'var(--text-info)'    },
                  { label: 'Reject Rate', value: recruitStats.total > 0
                      ? `${Math.round((recruitStats.rejected / recruitStats.total) * 100)}%`
                      : '—',
                    color: 'var(--text-danger)',
                  },
                ].map(kpi => (
                  <div
                    key={kpi.label}
                    className="text-center py-2 px-1 rounded-xl"
                    style={{ background: 'var(--bg-hover)' }}
                  >
                    <div className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{kpi.label}</div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      )}

      {/* ── ROW 4 — Activity Trend + Users by Role ──────────────────────────── */}
      {isAdminOrOwner && (has('audit:view') || has('users:view')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Activity Trend Line Chart */}
          {has('audit:view') && (
            <ChartCard>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-base font-semibold flex items-center gap-2"
                  style={{ color: 'var(--text-heading)' }}
                >
                  <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  Activity Trend
                </h2>
                <PeriodFilter value={period.key} onChange={setPeriod} />
              </div>

              <HiringTrend data={trendData} loading={trendLoading} height={190} />

              {activity_stats && (
                <div
                  className="flex items-center gap-6 mt-4 pt-4"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <div>
                    <p className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>
                      {activity_stats.total_actions || 0}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total actions (7d)</p>
                  </div>
                  {activity_stats.top_users?.slice(0, 2).map((u, i) => (
                    <div key={i}>
                      <p className="text-sm font-bold truncate max-w-[100px]" style={{ color: 'var(--text-primary)' }}>{u.action_count}</p>
                      <p className="text-xs truncate max-w-[100px]" style={{ color: 'var(--text-muted)' }}>{u.user_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          )}

          {/* Users by Role Donut */}
          {has('users:view') && roleData.length > 0 && (
            <ChartCard>
              <SectionHeader
                icon={Users}
                title="Users by Role"
                action={
                  <Link to="/users" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                    Manage
                  </Link>
                }
              />
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={roleData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {roleData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={value => (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      {/* ── ROW 5 — Recent Activity + Quick Insights ────────────────────────── */}
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
                  ? recent_activity.slice(0, 6).map((a, i) => (
                      <ActivityItem key={a.id || i} activity={a} />
                    ))
                  : <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                      No recent activity
                    </p>
                }
              </div>
            </ChartCard>
          )}

          {/* Quick Insights */}
          {insights.length > 0 && (
            <ChartCard>
              <SectionHeader icon={Lightbulb} title="Quick Insights" />

              <div className="space-y-3">
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl px-4 py-3"
                    style={{ background: `${ins.color}10`, border: `1px solid ${ins.color}20` }}
                  >
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: ins.color }}
                    />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {ins.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Activity summary */}
              {activity_stats && (
                <div
                  className="mt-4 pt-4 grid grid-cols-2 gap-3"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <div
                    className="rounded-xl p-4 text-center"
                    style={{ background: 'var(--bg-hover)' }}
                  >
                    <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>
                      {activity_stats.total_actions || 0}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Actions (7 days)</p>
                  </div>
                  {activity_stats.top_users?.slice(0, 1).map((u, i) => (
                    <div key={i} className="rounded-xl p-4 text-center" style={{ background: 'var(--bg-hover)' }}>
                      <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{u.action_count}</p>
                      <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{u.user_name}</p>
                    </div>
                  ))}
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
