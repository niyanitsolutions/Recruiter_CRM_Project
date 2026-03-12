import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, CheckCircle, DollarSign, TrendingUp, RefreshCw, Plus, Award } from 'lucide-react'
import { Card, Button } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import subscriptionService from '../../services/subscriptionService'
import SubscriptionBanner from '../../components/subscription/SubscriptionBanner'
import { formatCurrency, formatNumber } from '../../utils/format'
import toast from 'react-hot-toast'

const StatCard = ({ title, value, icon: Icon, color, link }) => (
  <Card hover className="relative overflow-hidden">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-surface-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-surface-900 mt-2">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    {link && <Link to={link} className="absolute inset-0 focus:outline-none" />}
  </Card>
)

const SellerDashboard = () => {
  const navigate = useNavigate()
  const [stats,       setStats]       = useState(null)
  const [isLoading,   setIsLoading]   = useState(true)
  const [seatStatus,  setSeatStatus]  = useState(null)

  const fetchDashboard = async () => {
    setIsLoading(true)
    try {
      const res = await sellerPortalService.getDashboard()
      setStats(res.data)
    } catch {
      toast.error('Failed to load dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
    subscriptionService.getSellerSeatStatus()
      .then(res => setSeatStatus(res.data?.data || null))
      .catch(() => {})
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Dashboard</h1>
          <p className="text-surface-500">Your seller portal overview</p>
        </div>
        <Button variant="secondary" onClick={fetchDashboard} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
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
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">My Subscription</p>
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
                  {seatStatus.plan_expiry_date
                    ? new Date(seatStatus.plan_expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">Expiry Date</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <StatCard
          title="Total Tenants"
          value={formatNumber(stats?.total_tenants || 0)}
          icon={Building2}
          color="bg-gradient-to-br from-accent-500 to-accent-600"
          link="/seller/tenants"
        />
        <StatCard
          title="Active Subscriptions"
          value={formatNumber(stats?.active_tenants || 0)}
          icon={CheckCircle}
          color="bg-gradient-to-br from-success-500 to-success-600"
          link="/seller/subscriptions"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(stats?.monthly_revenue || 0)}
          icon={TrendingUp}
          color="bg-gradient-to-br from-purple-500 to-purple-600"
          link="/seller/revenue"
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats?.total_revenue || 0)}
          icon={DollarSign}
          color="bg-gradient-to-br from-orange-500 to-orange-600"
          link="/seller/revenue"
        />
        <StatCard
          title="Commission Earned"
          value={formatCurrency(stats?.total_commission || 0)}
          icon={Award}
          color="bg-gradient-to-br from-yellow-500 to-yellow-600"
          link="/seller/revenue"
        />
      </div>

      <Card>
        <Card.Header>
          <Card.Title>Quick Actions</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="flex flex-wrap gap-3">
            <Link to="/seller/tenants">
              <Button leftIcon={<Plus className="w-4 h-4" />}>Add Tenant</Button>
            </Link>
            <Link to="/seller/subscriptions">
              <Button variant="secondary">View Subscriptions</Button>
            </Link>
            <Link to="/seller/revenue">
              <Button variant="secondary" leftIcon={<DollarSign className="w-4 h-4" />}>Revenue Report</Button>
            </Link>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}

export default SellerDashboard
