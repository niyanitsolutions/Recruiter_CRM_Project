import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Card, Table, Badge } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import { formatCurrency, formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

const SellerCommissions = () => {
  const [commissions, setCommissions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const limit = 20

  const fetchCommissions = async () => {
    setIsLoading(true)
    try {
      const params = { page: currentPage, limit }
      if (statusFilter) params.status = statusFilter
      const res = await sellerPortalService.getCommissions(params)
      setCommissions(res.data.commissions || [])
      setTotalCount(res.data.total || 0)
    } catch {
      toast.error('Failed to load commissions')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchCommissions() }, [currentPage, statusFilter])

  const columns = [
    {
      header: 'Tenant',
      render: (row) => (
        <div>
          <p className="font-medium text-surface-900">{row.tenant_name || '—'}</p>
          <p className="text-xs text-surface-500">{row.plan_name}</p>
        </div>
      ),
    },
    {
      header: 'Billing',
      render: (row) => (
        <Badge variant="info">{(row.billing_cycle || 'monthly').toUpperCase()}</Badge>
      ),
    },
    {
      header: 'Subscription Amount',
      render: (row) => (
        <span className="font-medium text-surface-700">
          {formatCurrency(row.base_amount_display || row.base_amount / 100 || 0)}
        </span>
      ),
    },
    {
      header: 'Commission Amount',
      render: (row) => (
        <span className="font-semibold text-success-700">
          {formatCurrency(row.commission_amount_display || row.commission_amount / 100 || 0)}
        </span>
      ),
    },
    {
      header: 'Date',
      render: (row) => <p className="text-sm text-surface-600">{formatDate(row.created_at)}</p>,
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'paid' ? 'success' : 'warning'}>
          {row.status}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Commissions</h1>
          <p className="text-surface-500">Your earnings from tenant subscriptions</p>
        </div>
        <div className="flex gap-3">
          <select
            className="input py-2 text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
          <Button variant="secondary" onClick={fetchCommissions} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-surface-200">
          <p className="text-sm text-surface-500">{totalCount} total commission records</p>
        </div>
        <Table columns={columns} data={commissions} isLoading={isLoading} emptyMessage="No commission records found" />
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

export default SellerCommissions
