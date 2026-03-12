import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Card, Table, Badge } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import { formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

const SellerSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  const limit = 20

  const fetchSubscriptions = async () => {
    setIsLoading(true)
    try {
      const res = await sellerPortalService.getSubscriptions({ page: currentPage, limit })
      setSubscriptions(res.data.subscriptions)
      setTotalCount(res.data.total)
    } catch {
      toast.error('Failed to load subscriptions')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchSubscriptions() }, [currentPage])

  const columns = [
    {
      header: 'Company',
      render: (row) => (
        <div>
          <p className="font-medium text-surface-900">{row.company_name}</p>
          <p className="text-xs text-surface-500">{row.tenant_id}</p>
        </div>
      ),
    },
    {
      header: 'Plan',
      render: (row) => <Badge variant="info">{(row.plan_name || 'N/A').toUpperCase()}</Badge>,
    },
    {
      header: 'Start Date',
      render: (row) => <p className="text-sm text-surface-600">{formatDate(row.plan_start_date)}</p>,
    },
    {
      header: 'Expiry',
      render: (row) => <p className="text-sm text-surface-600">{formatDate(row.plan_expiry)}</p>,
    },
    {
      header: 'Days Left',
      render: (row) => {
        const { days_left, status } = row
        if (status === 'expired') return <Badge variant="danger">Expired</Badge>
        if (status === 'trial') return <Badge variant="warning">Trial</Badge>
        if (days_left <= 7) return <Badge variant="danger">{days_left}d</Badge>
        if (days_left <= 30) return <Badge variant="warning">{days_left}d</Badge>
        return <Badge variant="success">{days_left}d</Badge>
      },
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={
          row.status === 'active' ? 'success' :
          row.status === 'trial' ? 'warning' :
          row.status === 'expired' ? 'danger' : 'default'
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
          <h1 className="text-2xl font-bold text-surface-900">Subscriptions</h1>
          <p className="text-surface-500">Subscription status for your tenants</p>
        </div>
        <Button variant="secondary" onClick={fetchSubscriptions} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-surface-200">
          <p className="text-sm text-surface-500">{totalCount} total subscriptions</p>
        </div>
        <Table columns={columns} data={subscriptions} isLoading={isLoading} emptyMessage="No subscriptions found" />
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

export default SellerSubscriptions
