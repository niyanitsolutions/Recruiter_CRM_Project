import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { selectUser, selectUserPermissions } from '../../store/authSlice'
import adminDashboardService from '../../services/adminDashboardService'
import subscriptionService from '../../services/subscriptionService'
import SubscriptionBanner from '../../components/subscription/SubscriptionBanner'

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, color, linkTo }) => {
  const colorClasses = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    teal:   'bg-teal-50 text-teal-600',
    pink:   'bg-pink-50 text-pink-600',
  }
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-surface-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-surface-500 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-surface-900 mt-1">
            {value ?? <span className="text-surface-300">—</span>}
          </p>
        </div>
        <div className={`p-3 rounded-xl ${colorClasses[color] || colorClasses.blue}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {linkTo && (
        <Link to={linkTo} className="mt-4 flex items-center text-sm text-accent-600 hover:text-accent-700 font-medium">
          View all <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      )}
    </div>
  )
}

// ── Activity Item ─────────────────────────────────────────────────────────────
const ActivityItem = ({ activity }) => {
  const color = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    login:  'bg-purple-100 text-purple-700',
  }[activity.action] || 'bg-surface-100 text-surface-700'

  return (
    <div className="flex items-start gap-3 py-3 border-b border-surface-100 last:border-0">
      <div className={`px-2 py-1 rounded text-xs font-medium ${color}`}>
        {activity.action_display || activity.action}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-surface-900 truncate">{activity.description}</p>
        <p className="text-xs text-surface-500 mt-1">
          by {activity.user_name} • {new Date(activity.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const navigate    = useNavigate()
  const user        = useSelector(selectUser)
  const permissions = useSelector(selectUserPermissions)
  const perms       = new Set(permissions)

  const [loading,       setLoading]       = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const [error,         setError]         = useState(null)
  const [seatStatus,    setSeatStatus]    = useState(null)

  const has = (...p) => p.some(x => perms.has(x))

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const response = await adminDashboardService.getDashboardData()
      setDashboardData(response.data)
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
    // Fetch seat/subscription status for banner and subscription card
    subscriptionService.getTenantSeatStatus()
      .then(res => setSeatStatus(res.data?.data || null))
      .catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-surface-200 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-surface-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          {error}
          <button onClick={fetchDashboardData} className="ml-4 underline">Retry</button>
        </div>
      </div>
    )
  }

  const { user_stats, activity_stats, recent_activity, quick_stats } = dashboardData || {}

  // ── Permission-gated primary stat cards ────────────────────────────────────
  const primaryCards = [
    has('users:view') && (
      <StatCard key="total-users"    title="Total Users"     value={user_stats?.total_users}    icon={Users}     color="blue"   linkTo="/users" />
    ),
    has('users:view') && (
      <StatCard key="active-users"   title="Active Users"    value={user_stats?.active_users}   icon={UserCheck} color="green" />
    ),
    has('users:view') && (
      <StatCard key="inactive-users" title="Inactive Users"  value={user_stats?.inactive_users} icon={UserMinus} color="yellow" />
    ),
    has('users:view') && (
      <StatCard key="logged-today"   title="Logged In Today" value={user_stats?.logged_in_today} icon={Activity} color="purple" />
    ),
    has('candidates:view') && (
      <StatCard key="candidates"          title="Total Candidates"    value={quick_stats?.candidates}           icon={Users2}    color="teal"   linkTo="/candidates" />
    ),
    has('candidates:view') && (
      <StatCard key="rejected-candidates" title="Rejected Candidates" value={quick_stats?.rejected_candidates}  icon={UserMinus} color="red"    linkTo="/candidates" />
    ),
    has('clients:view') && (
      <StatCard key="clients"             title="Active Clients"      value={quick_stats?.clients}              icon={Building2} color="blue"   linkTo="/clients" />
    ),
    has('jobs:view') && (
      <StatCard key="jobs"           title="Active Jobs"     value={quick_stats?.jobs}          icon={Briefcase} color="orange" linkTo="/jobs" />
    ),
    has('interviews:view') && (
      <StatCard key="interviews"     title="Interviews"      value={quick_stats?.interviews}    icon={Calendar}  color="purple" linkTo="/interviews" />
    ),
    has('onboards:view') && (
      <StatCard key="onboards"       title="Onboarding"      value={quick_stats?.onboards}      icon={UserPlus}  color="green"  linkTo="/onboards" />
    ),
    has('partners:view') && (
      <StatCard key="partners"       title="Partners"        value={quick_stats?.partners}      icon={Users}     color="pink"   linkTo="/users?role=partner" />
    ),
    has('departments:view') && (
      <StatCard key="departments"    title="Departments"     value={quick_stats?.departments}   icon={Building}  color="blue"   linkTo="/departments" />
    ),
    has('designations:view') && (
      <StatCard key="designations"   title="Designations"    value={quick_stats?.designations}  icon={Award}     color="green"  linkTo="/designations" />
    ),
    has('targets:view') && (
      <StatCard key="targets"        title="Targets"         value={quick_stats?.targets}       icon={Target}    color="orange" linkTo="/targets" />
    ),
    has('accounts:payouts') && (
      <StatCard key="payouts"        title="Partner Payouts" value={quick_stats?.payouts}       icon={DollarSign} color="teal" linkTo="/payouts" />
    ),
  ].filter(Boolean)

  const hasNoWidgets = primaryCards.length === 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            Welcome back, {user?.fullName}!
          </h1>
          <p className="text-surface-500 mt-1">
            Here's what's happening in your organization today.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="flex items-center gap-2 px-4 py-2 text-surface-600 hover:text-surface-900 hover:bg-surface-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Subscription expiry / seat banner */}
      <SubscriptionBanner
        seatStatus={seatStatus}
        onUpgrade={() => navigate('/upgrade-plan')}
      />

      {/* Subscription info card */}
      {seatStatus && (
        <div className="bg-white rounded-xl border border-surface-100 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Subscription</p>
              <p className="text-base font-semibold text-surface-900 mt-0.5">
                {seatStatus.plan_display_name || seatStatus.plan_name}
                {seatStatus.is_trial && (
                  <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Trial</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-surface-900">{seatStatus.total_user_seats}</p>
                <p className="text-xs text-surface-500 mt-0.5">Purchased Seats</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-surface-900">{seatStatus.current_active_users}</p>
                <p className="text-xs text-surface-500 mt-0.5">Active Users</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${seatStatus.remaining_seats === 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {seatStatus.remaining_seats}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">Remaining</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-surface-900">
                  {seatStatus.plan_expiry
                    ? new Date(seatStatus.plan_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">Expiry Date</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/upgrade-plan')}
              className="text-xs font-semibold text-accent-600 hover:text-accent-700 border border-accent-200 hover:border-accent-400 px-3 py-1.5 rounded-lg transition-colors"
            >
              Upgrade / Add Seats
            </button>
          </div>
        </div>
      )}

      {/* Stat cards — shown only for permissions the user has */}
      {primaryCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {primaryCards}
        </div>
      )}

      {hasNoWidgets && (
        <div className="bg-surface-50 rounded-xl p-12 text-center text-surface-500">
          No dashboard widgets are available for your current permissions.
        </div>
      )}

      {/* Bottom panels — Recent Activity + Users by Role */}
      {(has('audit:view') || has('users:view')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          {has('audit:view') && (
            <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-surface-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-surface-400" />
                  Recent Activity
                </h2>
                <Link to="/audit-logs" className="text-sm text-accent-600 hover:text-accent-700 font-medium">
                  View all
                </Link>
              </div>
              <div className="space-y-1">
                {recent_activity?.length > 0 ? (
                  recent_activity.slice(0, 5).map((a, i) => (
                    <ActivityItem key={a.id || i} activity={a} />
                  ))
                ) : (
                  <p className="text-surface-500 text-sm py-4 text-center">No recent activity</p>
                )}
              </div>
            </div>
          )}

          {/* Users by Role */}
          {has('users:view') && (
            <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-surface-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-surface-400" />
                  Users by Role
                </h2>
                <Link to="/users" className="text-sm text-accent-600 hover:text-accent-700 font-medium">
                  Manage users
                </Link>
              </div>
              <div className="space-y-3">
                {user_stats?.users_by_role && Object.entries(user_stats.users_by_role).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
                    <span className="text-surface-700 capitalize">{role.replace(/_/g, ' ')}</span>
                    <span className="font-semibold text-surface-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Overview */}
      {has('audit:view') && activity_stats && (
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-surface-400" />
            Activity Overview (Last 7 Days)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-surface-50 rounded-lg">
              <p className="text-2xl font-bold text-surface-900">{activity_stats.total_actions || 0}</p>
              <p className="text-sm text-surface-500">Total Actions</p>
            </div>
            {activity_stats.top_users?.slice(0, 3).map((topUser, i) => (
              <div key={i} className="text-center p-4 bg-surface-50 rounded-lg">
                <p className="text-2xl font-bold text-surface-900">{topUser.action_count}</p>
                <p className="text-sm text-surface-500 truncate">{topUser.user_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
