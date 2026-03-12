import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Card, Table, Badge } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import { formatCurrency, formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

const SellerPayments = () => {
  const [payments, setPayments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  const limit = 20

  const fetchPayments = async () => {
    setIsLoading(true)
    try {
      const res = await sellerPortalService.getRevenue({ page: currentPage, limit })
      setPayments(res.data.payments || [])
      setTotalCount(res.data.total || 0)
    } catch {
      toast.error('Failed to load payments')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchPayments() }, [currentPage])

  const columns = [
    {
      header: 'Tenant',
      render: (row) => (
        <div>
          <p className="font-medium text-surface-900">{row.company_name || row.tenant_id || '—'}</p>
        </div>
      ),
    },
    {
      header: 'Plan',
      render: (row) => <Badge variant="info">{(row.plan_name || 'N/A').toUpperCase()}</Badge>,
    },
    {
      header: 'Payment Amount',
      render: (row) => (
        <span className="font-semibold text-success-700">
          {formatCurrency(row.total_amount || 0)}
        </span>
      ),
    },
    {
      header: 'Payment Date',
      render: (row) => <p className="text-sm text-surface-600">{formatDate(row.payment_date)}</p>,
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={
          row.status === 'completed' ? 'success' :
          row.status === 'pending'   ? 'warning' : 'danger'
        }>
          {row.status}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Payments</h1>
          <p className="text-surface-500">Payment history from your tenants</p>
        </div>
        <Button variant="secondary" onClick={fetchPayments} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-surface-200">
          <p className="text-sm text-surface-500">{totalCount} total payments</p>
        </div>
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

export default SellerPayments
