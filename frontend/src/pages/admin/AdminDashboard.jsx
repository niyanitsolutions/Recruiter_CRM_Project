import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Users,
  UserCheck,
  UserMinus,
  Building,
  Award,
  Briefcase,
  Calendar,
  UserPlus,
  History,
  TrendingUp,
  Activity,
  ArrowRight,
  RefreshCw,
  Users2,
  Building2,
  DollarSign,
  Target,
  Sparkles,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { selectUser, selectUserPermissions } from '../../store/authSlice'
import adminDashboardService from '../../services/adminDashboardService'
import applicationService from '../../services/applicationService'
import subscriptionService from '../../services/subscriptionService'
import SubscriptionBanner from '../../components/subscription/SubscriptionBanner'
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'

// ── Animated counter ─────────────────────────────────────────────────────────
const useCounter = (target, duration = 800) => {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null || isNaN(target)) return
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return value
}

// ── Gradient palette for stat cards ─────────────────────────────────────────
const CARD_GRADIENTS = {
  purple: { icon: 'var(--stat-purple)', glow: 'rgba(108,99,255,0.20)' },
  blue:   { icon: 'var(--stat-blue)',   glow: 'rgba(79,172,254,0.20)'  },
  green:  { icon: 'var(--stat-green)',  glow: 'rgba(67,233,123,0.20)'  },
  orange: { icon: 'var(--stat-orange)', glow: 'rgba(250,130,49,0.20)'  },
  red:    { icon: 'var(--stat-red)',     glow: 'rgba(255,71,87,0.20)'   },
  pink:   { icon: 'var(--stat-pink)',    glow: 'rgba(255,107,157,0.20)' },
  teal:   { icon: 'var(--stat-teal)',    glow: 'rgba(56,249,215,0.20)'  },
  yellow: { icon: 'var(--stat-yellow)', glow: 'rgba(246,211,101,0.20)' },
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, color = 'purple', linkTo }) => {
  const count = useCounter(typeof value === 'number' ? value : null)
  const grad = CARD_GRADIENTS[color] || CARD_GRADIENTS.purple
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="rounded-2xl p-5 transition-all duration-300 cursor-default"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-card)',
        boxShadow: hovered
          ? `0 8px 24px ${grad.glow}, var(--shadow-card)`
          : 'var(--shadow-card)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: grad.icon, boxShadow: `0 4px 12px ${grad.glow}` }}
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
      <p className="text-2xl font-bold leading-none mb-1" style={{ color: 'var(--text-heading)' }}>
        {value == null ? <span style={{ color: 'var(--text-disabled)' }}>—</span> : count}
      </p>
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{title}</p>
    </div>
  )
}

// ── Activity Item ─────────────────────────────────────────────────────────────
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
          by {activity.user_name} · {new Date(activity.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

// ── Custom tooltip for recharts ───────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-sm shadow-lg" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
      {label && <p className="font-semibold mb-1" style={{ color: 'var(--text-heading)' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--text-secondary)' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const user        = useSelector(selectUser)
  const permissions = useSelector(selectUserPermissions)
  const perms       = new Set(permissions)
  const isAdminOrOwner = user?.isOwner || user?.role === 'admin'

  const [loading,          setLoading]          = useState(true)
  const [dashboardData,    setDashboardData]     = useState(null)
  const [recruitStats,     setRecruitStats]      = useState(null)
  const [error,            setError]             = useState(null)
  const [seatStatus,       setSeatStatus]        = useState(null)
  const [showUpgradeModal, setShowUpgradeModal]  = useState(false)

  const has = (...p) => p.some(x => perms.has(x))

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const [mainRes, recruitRes] = await Promise.allSettled([
        adminDashboardService.getDashboardData(),
        applicationService.getDashboardStats(),
      ])
      if (mainRes.status === 'fulfilled')   setDashboardData(mainRes.value.data)
      if (recruitRes.status === 'fulfilled') setRecruitStats(recruitRes.value.data)
      setError(null)
    } catch (err) {
      setError('Failed to load dashboard data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
    subscriptionService.getTenantSeatStatus()
      .then(res => setSeatStatus(res.data?.data || null))
      .catch(() => {})
  }, [])

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 page-enter">
        <div className="h-32 rounded-2xl skeleton" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-2xl skeleton" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-2xl skeleton" />
          <div className="h-64 rounded-2xl skeleton" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-xl" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>
          {error}
          <button onClick={fetchDashboardData} className="ml-4 underline">Retry</button>
        </div>
      </div>
    )
  }

  const { user_stats, activity_stats, recent_activity, quick_stats } = dashboardData || {}

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const primaryCards = [
    has('users:view')      && <StatCard key="total-users"    title="Total Users"        value={user_stats?.total_users}       icon={Users}     color="purple" linkTo="/users" />,
    has('users:view')      && <StatCard key="active-users"   title="Active Users"       value={user_stats?.active_users}      icon={UserCheck} color="green"  />,
    has('users:view')      && <StatCard key="inactive-users" title="Inactive Users"     value={user_stats?.inactive_users}    icon={UserMinus} color="yellow" linkTo="/users/inactive" />,
    has('users:view')      && <StatCard key="logged-today"   title="Logged In Today"    value={user_stats?.logged_in_today}   icon={Activity}  color="blue"   />,
    has('candidates:view') && <StatCard key="candidates"     title="Total Candidates"   value={quick_stats?.candidates}       icon={Users2}    color="teal"   linkTo="/candidates" />,
    has('candidates:view') && <StatCard key="rejected"       title="Rejected"           value={quick_stats?.rejected_candidates} icon={UserMinus} color="red"  linkTo="/candidates" />,
    has('clients:view')    && <StatCard key="clients"        title="Active Clients"     value={quick_stats?.clients}          icon={Building2} color="blue"   linkTo="/clients" />,
    has('jobs:view')       && <StatCard key="jobs"           title="Active Jobs"        value={quick_stats?.jobs}             icon={Briefcase} color="orange" linkTo="/jobs" />,
    has('interviews:view') && <StatCard key="interviews"     title="Interviews"         value={quick_stats?.interviews}       icon={Calendar}  color="purple" linkTo="/interviews" />,
    has('onboards:view')   && <StatCard key="onboards"       title="Onboarding"         value={quick_stats?.onboards}         icon={UserPlus}  color="green"  linkTo="/onboards" />,
    has('partners:view')   && <StatCard key="partners"       title="Partners"           value={quick_stats?.partners}         icon={Users}     color="pink"   linkTo="/users?role=partner" />,
    has('departments:view')&& <StatCard key="departments"    title="Departments"        value={quick_stats?.departments}      icon={Building}  color="blue"   linkTo="/departments" />,
    has('designations:view')&&<StatCard key="designations"   title="Designations"       value={quick_stats?.designations}     icon={Award}     color="green"  linkTo="/designations" />,
    has('targets:view')    && <StatCard key="targets"        title="Targets"            value={quick_stats?.targets}          icon={Target}    color="orange" linkTo="/targets" />,
    has('accounts:payouts')&& <StatCard key="payouts"        title="Partner Payouts"    value={quick_stats?.payouts}          icon={DollarSign}color="teal"   linkTo="/payouts" />,
  ].filter(Boolean)

  // ── Hiring funnel chart data ────────────────────────────────────────────────
  const funnelData = recruitStats ? [
    { stage: 'Applied',     value: recruitStats.applied     || 0, fill: '#6C63FF' },
    { stage: 'Screening',   value: recruitStats.screening   || 0, fill: '#4FACFE' },
    { stage: 'Shortlisted', value: recruitStats.shortlisted || 0, fill: '#38F9D7' },
    { stage: 'Interview',   value: recruitStats.interview   || 0, fill: '#43E97B' },
    { stage: 'Offered',     value: recruitStats.offered     || 0, fill: '#F6D365' },
    { stage: 'Joined',      value: recruitStats.joined      || 0, fill: '#FA8231' },
  ] : []

  // ── Users by role donut data ────────────────────────────────────────────────
  const PIE_COLORS = ['#6C63FF', '#4FACFE', '#43E97B', '#FA8231', '#FF4757', '#FF6B9D', '#38F9D7']
  const roleData = user_stats?.users_by_role
    ? Object.entries(user_stats.users_by_role)
        .filter(([, v]) => v > 0)
        .map(([role, count], i) => ({
          name: role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: count,
          fill: PIE_COLORS[i % PIE_COLORS.length],
        }))
    : []

  return (
    <div className="p-6 space-y-6 page-enter">

      {/* ── Welcome banner ─────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: 'var(--gradient-1)', boxShadow: '0 8px 32px rgba(108,99,255,0.30)' }}
      >
        {/* decorative blobs */}
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-20" style={{ background: 'rgba(255,255,255,0.3)', filter: 'blur(30px)' }} />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10" style={{ background: 'rgba(255,255,255,0.4)', filter: 'blur(25px)' }} />

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
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Subscription banner ────────────────────────────────────────────── */}
      {isAdminOrOwner && (
        <SubscriptionBanner
          seatStatus={seatStatus}
          onUpgrade={() => setShowUpgradeModal(true)}
        />
      )}

      {/* ── Subscription info card ─────────────────────────────────────────── */}
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
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>Trial</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-6">
              {[
                { label: 'Purchased Seats', value: seatStatus.total_user_seats, color: 'var(--text-heading)' },
                { label: 'Active Users',    value: seatStatus.current_active_users, color: 'var(--text-info)' },
                { label: 'Remaining',       value: seatStatus.remaining_seats, color: seatStatus.remaining_seats === 0 ? 'var(--text-danger)' : 'var(--text-success)' },
                { label: 'Expiry',          value: seatStatus.plan_expiry ? new Date(seatStatus.plan_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—', color: 'var(--text-heading)' },
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

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      {primaryCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
          {primaryCards}
        </div>
      )}

      {primaryCards.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <p style={{ color: 'var(--text-muted)' }}>No dashboard widgets available for your current permissions.</p>
        </div>
      )}

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      {isAdminOrOwner && (has('candidates:view') || has('users:view')) && (funnelData.length > 0 || roleData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Hiring Funnel Bar Chart */}
          {has('candidates:view') && funnelData.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  Hiring Funnel
                </h2>
                <div className="flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>Total: <strong style={{ color: 'var(--text-primary)' }}>{recruitStats?.total || 0}</strong></span>
                  <span>This week: <strong style={{ color: 'var(--accent)' }}>{recruitStats?.recent_week || 0}</strong></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={funnelData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={28}>
                  <XAxis dataKey="stage" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-hover)' }} />
                  <Bar dataKey="value" name="Candidates" radius={[6, 6, 0, 0]}>
                    {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Conversion KPIs */}
              {recruitStats && (() => {
                const offerRate  = recruitStats.applied  > 0 ? Math.round((recruitStats.offered  / recruitStats.applied)  * 100) : 0
                const joinRate   = recruitStats.offered  > 0 ? Math.round((recruitStats.joined   / recruitStats.offered)  * 100) : 0
                const rejectRate = recruitStats.total    > 0 ? Math.round((recruitStats.rejected / recruitStats.total)    * 100) : 0
                return (
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                    {[
                      { label: 'Offer Rate',  value: `${offerRate}%`,  color: 'var(--text-success)' },
                      { label: 'Join Rate',   value: `${joinRate}%`,   color: 'var(--text-info)'    },
                      { label: 'Reject Rate', value: `${rejectRate}%`, color: 'var(--text-danger)'  },
                    ].map(kpi => (
                      <div key={kpi.label} className="text-center py-2 px-1 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                        <div className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{kpi.label}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Users by Role Donut */}
          {has('users:view') && roleData.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
            >
              <h2 className="text-base font-semibold flex items-center gap-2 mb-4" style={{ color: 'var(--text-heading)' }}>
                <Users className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                Users by Role
                <Link to="/users" className="ml-auto text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  Manage
                </Link>
              </h2>
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
                  >
                    {roleData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Recent Activity + Activity Overview ────────────────────────────── */}
      {isAdminOrOwner && (has('audit:view') || has('users:view')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Recent Activity */}
          {has('audit:view') && (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                  <History className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  Recent Activity
                </h2>
                <Link to="/audit-logs" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  View all
                </Link>
              </div>
              <div>
                {recent_activity?.length > 0
                  ? recent_activity.slice(0, 6).map((a, i) => <ActivityItem key={a.id || i} activity={a} />)
                  : <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No recent activity</p>
                }
              </div>
            </div>
          )}

          {/* Activity Overview */}
          {has('audit:view') && activity_stats && (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
            >
              <h2 className="text-base font-semibold flex items-center gap-2 mb-4" style={{ color: 'var(--text-heading)' }}>
                <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                Activity (Last 7 Days)
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{activity_stats.total_actions || 0}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Total Actions</p>
                </div>
                {activity_stats.top_users?.slice(0, 3).map((topUser, i) => (
                  <div key={i} className="rounded-xl p-4 text-center" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{topUser.action_count}</p>
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{topUser.user_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upgrade Seats Modal */}
      <UpgradeSeatsModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        seatStatus={seatStatus}
      />
    </div>
  )
}

export default AdminDashboard
