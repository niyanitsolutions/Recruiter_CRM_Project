import React, { useState, useEffect } from 'react'
import { RefreshCw, DollarSign, TrendingUp, CreditCard, Award } from 'lucide-react'
import { Button, Card, Table, Badge } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import { formatCurrency, formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

const SellerRevenue = () => {
  const [payments, setPayments] = useState([])
  const [summary, setSummary] = useState({})
  const [commissionStats, setCommissionStats] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  const limit = 20

  const fetchRevenue = async () => {
    setIsLoading(true)
    try {
      const [revenueRes, dashboardRes] = await Promise.all([
        sellerPortalService.getRevenue({ page: currentPage, limit }),
        sellerPortalService.getDashboard(),
      ])
      setPayments(revenueRes.data.payments)
      setTotalCount(revenueRes.data.total)
      setSummary({
        total_revenue: revenueRes.data.summary?.total_revenue ?? revenueRes.data.total_revenue,
        monthly_revenue: revenueRes.data.summary?.monthly_revenue ?? revenueRes.data.monthly_revenue,
        payment_count: revenueRes.data.total,
      })
      setCommissionStats(dashboardRes.data?.data || dashboardRes.data || {})
    } catch {
      toast.error('Failed to load revenue data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchRevenue() }, [currentPage])

  const columns = [
    {
      header: 'Tenant',
      render: (row) => (
        <div>
          <p className="font-medium text-surface-900">{row.company_name || row.tenant_id}</p>
        </div>
      ),
    },
    {
      header: 'Plan',
      render: (row) => <Badge variant="info">{(row.plan_name || 'N/A').toUpperCase()}</Badge>,
    },
    {
      header: 'Amount',
      render: (row) => (
        <span className="font-semibold text-success-700">{formatCurrency(row.total_amount || 0)}</span>
      ),
    },
    {
      header: 'Payment Date',
      render: (row) => <p className="text-sm text-surface-600">{formatDate(row.payment_date)}</p>,
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'completed' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'}>
          {row.status}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Revenue</h1>
          <p className="text-surface-500">Payment history from your tenants</p>
        </div>
        <Button variant="secondary" onClick={fetchRevenue} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: 'Total Revenue', value: formatCurrency(summary.total_revenue || 0), icon: DollarSign, color: 'from-purple-500 to-purple-600' },
          { title: 'Monthly Revenue', value: formatCurrency(summary.monthly_revenue || 0), icon: TrendingUp, color: 'from-success-500 to-success-600' },
          { title: 'Total Payments', value: String(summary.payment_count || 0), icon: CreditCard, color: 'from-accent-500 to-accent-600' },
          { title: 'Commission Earned', value: formatCurrency(commissionStats.total_commission || 0), icon: Award, color: 'from-yellow-500 to-yellow-600' },
        ].map((item) => (
          <Card key={item.title}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-surface-500">{item.title}</p>
                <p className="text-2xl font-bold text-surface-900 mt-1">{item.value}</p>
              </div>
              <div className={`p-3 rounded-xl bg-gradient-to-br ${item.color}`}>
                <item.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card padding={false}>
        <Table columns={columns} data={payments} isLoading={isLoading} emptyMessage="No payments found" />
        {totalCount > limit && (
          <Table.Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(totalCount / limit)}
            totalItems={totalCount}
            itemsPerPage={limit}
            onPageChange={setCurrentPage}
          />
        )}
      </Card>
    </div>
  )
}

export default SellerRevenue
