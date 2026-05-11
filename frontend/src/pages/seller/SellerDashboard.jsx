import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CheckCircle, DollarSign, TrendingUp, RefreshCw, Plus, Award } from 'lucide-react'
import { Card, Button } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
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
  const [stats,       setStats]       = useState(null)
  const [isLoading,   setIsLoading]   = useState(true)

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
