import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Card, Table, Badge, Select } from '../../components/common'
import sellerService from '../../services/sellerService'
import { formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

const DaysLeftBadge = ({ days, status }) => {
  if (status === 'trial') return <Badge variant="warning">Trial</Badge>
  if (status === 'expired') return <Badge variant="danger">Expired</Badge>
  if (days <= 7) return <Badge variant="danger">{days}d left</Badge>
  if (days <= 30) return <Badge variant="warning">{days}d left</Badge>
  return <Badge variant="success">{days}d left</Badge>
}

const Subscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const limit = 20

  const fetchSubscriptions = async () => {
    setIsLoading(true)
    try {
      const res = await sellerService.getSubscriptions({
        page: currentPage,
        limit,
        status: statusFilter || undefined,
      })
      setSubscriptions(res.data.subscriptions || [])
      setTotalCount(res.data.total || 0)
    } catch {
      toast.error('Failed to load subscriptions')
      setSubscriptions([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchSubscriptions() }, [currentPage, statusFilter])

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
      render: (row) => (
        <Badge variant="info">{(row.plan_name || 'N/A').toUpperCase()}</Badge>
      ),
    },
    {
      header: 'Seller',
      render: (row) => (
        <p className="text-surface-700">{row.seller_name || '—'}</p>
      ),
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
      header: 'Status / Days',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge variant={
            row.status === 'active' ? 'success' :
            row.status === 'trial' ? 'warning' :
            row.status === 'expired' ? 'danger' : 'default'
          }>
            {row.status}
          </Badge>
          <DaysLeftBadge days={row.days_left} status={row.status} />
        </div>
      ),
    },
  ]

  const statusOptions = [
    { value: '', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'trial', label: 'Trial' },
    { value: 'expired', label: 'Expired' },
    { value: 'expiring', label: 'Expiring (30d)' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Subscriptions</h1>
          <p className="text-surface-500">All tenant subscription records</p>
        </div>
        <Button variant="secondary" onClick={fetchSubscriptions} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-surface-200 flex justify-between items-center">
          <p className="text-sm text-surface-500">{totalCount} total subscriptions</p>
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            className="w-48"
          />
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

export default Subscriptions
