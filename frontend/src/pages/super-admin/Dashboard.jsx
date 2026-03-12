import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Card, Button, Badge, StatsSkeleton, CardSkeleton } from '../../components/common'
import superAdminService from '../../services/superAdminService'
import { formatCurrency, formatNumber, formatRelativeTime } from '../../utils/format'
import toast from 'react-hot-toast'

const StatCard = ({ title, value, change, changeType, icon: Icon, color, link }) => (
  <Card hover className="relative overflow-hidden">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-surface-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-surface-900 mt-2">{value}</p>
        {change !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-sm ${
            changeType === 'up' ? 'text-success-600' : 'text-danger-600'
          }`}>
            {changeType === 'up' ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
            <span>{change}%</span>
            <span className="text-surface-400">vs last month</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    {link && (
      <Link
        to={link}
        className="absolute inset-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500"
      />
    )}
  </Card>
)

const SuperAdminDashboard = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchDashboard = async () => {
    try {
      const response = await superAdminService.getDashboard()
      setDashboardData(response.data)
    } catch (error) {
      toast.error('Failed to load dashboard data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchDashboard()
  }

  // Sample chart data (replace with actual data)
  const revenueChartData = [
    { month: 'Jan', revenue: 45000 },
    { month: 'Feb', revenue: 52000 },
    { month: 'Mar', revenue: 48000 },
    { month: 'Apr', revenue: 61000 },
    { month: 'May', revenue: 55000 },
    { month: 'Jun', revenue: 67000 },
  ]

  const planDistribution = [
    { name: 'Trial', value: dashboardData?.tenants?.trial_tenants || 0, color: '#f59e0b' },
    { name: 'Paid', value: dashboardData?.tenants?.paid_tenants || 0, color: '#22c55e' },
    { name: 'Expired', value: dashboardData?.tenants?.expired_tenants || 0, color: '#ef4444' },
  ]

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    )
  }

  const { tenants, revenue, sellers, subscriptions } = dashboardData || {}

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Dashboard</h1>
          <p className="text-surface-500">Welcome back! Here's your platform overview.</p>
        </div>
        <Button
          variant="secondary"
          onClick={handleRefresh}
          isLoading={isRefreshing}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Tenants"
          value={formatNumber(tenants?.total_tenants || 0)}
          change={12}
          changeType="up"
          icon={Building2}
          color="bg-gradient-to-br from-accent-500 to-accent-600"
          link="/super-admin/tenants"
        />
        <StatCard
          title="Active Tenants"
          value={formatNumber(tenants?.active_tenants || 0)}
          change={8}
          changeType="up"
          icon={Users}
          color="bg-gradient-to-br from-success-500 to-success-600"
          link="/super-admin/tenants?status=active"
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(revenue?.total_revenue || 0)}
          change={15}
          changeType="up"
          icon={CreditCard}
          color="bg-gradient-to-br from-purple-500 to-purple-600"
          link="/super-admin/payments"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(revenue?.monthly_revenue || 0)}
          change={5}
          changeType="down"
          icon={TrendingUp}
          color="bg-gradient-to-br from-orange-500 to-orange-600"
          link="/super-admin/payments"
        />
        <StatCard
          title="Total Sellers"
          value={formatNumber(sellers?.total_sellers || 0)}
          icon={Users}
          color="bg-gradient-to-br from-indigo-500 to-indigo-600"
          link="/super-admin/sellers"
        />
        <StatCard
          title="Expiring Soon"
          value={formatNumber(subscriptions?.expiring_soon || 0)}
          icon={AlertCircle}
          color="bg-gradient-to-br from-warning-500 to-warning-600"
          link="/super-admin/subscriptions?status=expiring"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <Card.Header>
            <div className="flex items-center justify-between">
              <div>
                <Card.Title>Revenue Overview</Card.Title>
                <Card.Description>Monthly revenue trend</Card.Description>
              </div>
              <Badge variant="success" dot>Live</Badge>
            </div>
          </Card.Header>
          <Card.Content>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" stroke="#737373" fontSize={12} />
                  <YAxis stroke="#737373" fontSize={12} tickFormatter={(v) => `₹${v/1000}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    formatter={(value) => [formatCurrency(value * 100), 'Revenue']}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card.Content>
        </Card>

        {/* Plan Distribution */}
        <Card>
          <Card.Header>
            <Card.Title>Plan Distribution</Card.Title>
            <Card.Description>Tenant breakdown by plan</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {planDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {planDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-surface-600">
                    {item.name}: {item.value}
                  </span>
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <Card.Header>
            <Card.Title>Quick Actions</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/super-admin/tenants">
                <Button variant="secondary" className="w-full justify-start">
                  <Building2 className="w-4 h-4 mr-2" />
                  View Tenants
                </Button>
              </Link>
              <Link to="/super-admin/payments">
                <Button variant="secondary" className="w-full justify-start">
                  <CreditCard className="w-4 h-4 mr-2" />
                  View Payments
                </Button>
              </Link>
              <Link to="/super-admin/payments">
                <Button variant="secondary" className="w-full justify-start">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Analytics
                </Button>
              </Link>
              <Link to="/super-admin/tenants">
                <Button variant="secondary" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Tenants
                </Button>
              </Link>
            </div>
          </Card.Content>
        </Card>

        {/* Platform Stats */}
        <Card>
          <Card.Header>
            <Card.Title>Platform Statistics</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent-100 rounded-lg">
                    <Activity className="w-4 h-4 text-accent-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900">Success Rate</p>
                    <p className="text-xs text-surface-500">Payment success</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-success-600">
                  {revenue?.success_rate || 0}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-warning-100 rounded-lg">
                    <CreditCard className="w-4 h-4 text-warning-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900">Pending Amount</p>
                    <p className="text-xs text-surface-500">Awaiting payment</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-warning-600">
                  {formatCurrency(revenue?.pending_amount || 0)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900">Total Transactions</p>
                    <p className="text-xs text-surface-500">All time</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-purple-600">
                  {formatNumber(revenue?.transaction_count || 0)}
                </span>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  )
}

export default SuperAdminDashboard