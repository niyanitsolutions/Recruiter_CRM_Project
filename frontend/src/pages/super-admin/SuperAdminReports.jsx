import React, { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, Users, Building2, CreditCard } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Button, Card, Table, Badge } from '../../components/common'
import sellerService from '../../services/sellerService'
import { formatCurrency, formatNumber } from '../../utils/format'
import toast from 'react-hot-toast'

const SuperAdminReports = () => {
  const [activeTab, setActiveTab] = useState('revenue')
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchReport = async (type) => {
    setIsLoading(true)
    try {
      const res = await sellerService.getReports(type)
      setData(res.data)
    } catch {
      toast.error('Failed to load report')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Clear stale data first — prevents previous tab's data from being passed to
    // the new tab's renderer (e.g. subscriptions object → revenue BarChart crashes)
    setData(null)
    fetchReport(activeTab)
  }, [activeTab])

  const tabs = [
    { id: 'revenue', label: 'Revenue', icon: CreditCard },
    { id: 'seller_performance', label: 'Seller Performance', icon: Users },
    { id: 'tenant_growth', label: 'Tenant Growth', icon: Building2 },
    { id: 'subscriptions', label: 'Subscriptions', icon: TrendingUp },
  ]

  const sellerColumns = [
    { header: 'Seller', render: (row) => <p className="font-medium">{row.seller_name || row._id}</p> },
    { header: 'Total Tenants', render: (row) => <p className="text-center font-semibold">{row.total_tenants}</p> },
    { header: 'Active Tenants', render: (row) => <Badge variant="success">{row.active_tenants}</Badge> },
  ]

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }
    if (!data?.data) return <p className="text-surface-500 text-center py-12">No data available</p>

    // Type guard — chart tabs expect an array; subscriptions tab returns an object.
    // If the types don't match (stale data from a previous tab), render nothing.
    const dataIsArray = Array.isArray(data.data)

    if (activeTab === 'revenue') {
      if (!dataIsArray) return <p className="text-surface-500 text-center py-12">No data available</p>
      return (
        <div className="space-y-6">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="label" stroke="#737373" fontSize={12} />
                <YAxis stroke="#737373" fontSize={12} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: 'none', borderRadius: '8px', color: '#fff' }}
                  formatter={(value) => [formatCurrency(value * 100), 'Revenue']}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-2 text-surface-500 font-medium">Month</th>
                  <th className="text-right py-2 text-surface-500 font-medium">Revenue</th>
                  <th className="text-right py-2 text-surface-500 font-medium">Payments</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.label} className="border-b border-surface-100">
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="py-2 text-right">{formatCurrency(row.amount * 100)}</td>
                    <td className="py-2 text-right text-surface-500">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (activeTab === 'seller_performance') {
      if (!dataIsArray) return <p className="text-surface-500 text-center py-12">No data available</p>
      return <Table columns={sellerColumns} data={data.data} emptyMessage="No seller data" />
    }

    if (activeTab === 'tenant_growth') {
      if (!dataIsArray) return <p className="text-surface-500 text-center py-12">No data available</p>
      return (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="label" stroke="#737373" fontSize={12} />
              <YAxis stroke="#737373" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a2e', border: 'none', borderRadius: '8px', color: '#fff' }}
              />
              <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )
    }

    if (activeTab === 'subscriptions') {
      if (dataIsArray) return <p className="text-surface-500 text-center py-12">No data available</p>
      const sub = data.data
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active', value: sub.active, color: 'text-success-600', bg: 'bg-success-50' },
            { label: 'Trial', value: sub.trial, color: 'text-warning-600', bg: 'bg-warning-50' },
            { label: 'Expired', value: sub.expired, color: 'text-danger-600', bg: 'bg-danger-50' },
            { label: 'Cancelled', value: sub.cancelled, color: 'text-surface-600', bg: 'bg-surface-100' },
          ].map((item) => (
            <div key={item.label} className={`${item.bg} rounded-xl p-6 text-center`}>
              <p className={`text-4xl font-bold ${item.color}`}>{formatNumber(item.value)}</p>
              <p className="text-surface-600 mt-2 font-medium">{item.label}</p>
            </div>
          ))}
        </div>
      )
    }

    return null
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Reports</h1>
          <p className="text-surface-500">Platform-level insights and analytics</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => fetchReport(activeTab)}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-surface-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-accent-500 text-accent-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <Card.Content>
          {renderContent()}
        </Card.Content>
      </Card>
    </div>
  )
}

export default SuperAdminReports
