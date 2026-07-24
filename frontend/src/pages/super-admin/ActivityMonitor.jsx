import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Building2, UserPlus, Clock, CheckCircle, XCircle,
  CreditCard, RefreshCw, AlertTriangle, Mail, Eye, ExternalLink,
} from 'lucide-react'
import { Card, Button, Table, Badge, Select } from '../../components/common'
import tenantActivityService from '../../services/tenantActivityService'
import { formatDate, formatRelativeTime, formatNumber } from '../../utils/format'
import toast from 'react-hot-toast'

const StatCard = ({ title, value, icon: Icon, color, active, onClick }) => (
  <button
    onClick={onClick}
    className={`text-left w-full rounded-2xl border p-4 transition-all ${
      active
        ? 'border-accent-400 ring-2 ring-accent-200 bg-white'
        : 'border-surface-200 bg-white hover:border-surface-300'
    }`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-surface-500">{title}</p>
        <p className="text-2xl font-bold text-surface-900 mt-1">{formatNumber(value || 0)}</p>
      </div>
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </button>
)

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'trial', label: 'Free Trial' },
  { value: 'paid', label: 'Paid' },
  { value: 'expired', label: 'Expired' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'active', label: 'Active' },
  { value: 'payment_failed', label: 'Payment Failed' },
]

const ActivityMonitor = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [dashboard, setDashboard] = useState(null)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true)
  const [tenants, setTenants] = useState([])
  const [total, setTotal] = useState(0)
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [page, setPage] = useState(1)
  const filter = searchParams.get('filter') || 'all'
  const limit = 10

  const fetchDashboard = useCallback(async () => {
    setIsLoadingDashboard(true)
    try {
      const res = await tenantActivityService.getDashboard()
      setDashboard(res.data)
    } catch {
      toast.error('Failed to load tenant monitoring dashboard')
    } finally {
      setIsLoadingDashboard(false)
    }
  }, [])

  const fetchTenants = useCallback(async () => {
    setIsLoadingList(true)
    try {
      const res = await tenantActivityService.getTenants({ filter, page, limit })
      setTenants(res.data.tenants || [])
      setTotal(res.data.total || 0)
    } catch {
      toast.error('Failed to load tenant list')
    } finally {
      setIsLoadingList(false)
    }
  }, [filter, page])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])
  useEffect(() => { fetchTenants() }, [fetchTenants])

  const setFilter = (value) => {
    setPage(1)
    setSearchParams(value === 'all' ? {} : { filter: value })
  }

  const columns = [
    {
      header: 'Company',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-semibold text-sm">
            {row.company_name?.charAt(0) || 'C'}
          </div>
          <div>
            <p className="font-medium text-surface-900">{row.company_name}</p>
            <p className="text-xs text-surface-500">{row.company_id}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Owner',
      render: (row) => (
        <div>
          <p className="text-surface-900">{row.owner_name}</p>
          <p className="text-xs text-surface-500">{row.owner_email}</p>
        </div>
      ),
    },
    {
      header: 'Plan',
      render: (row) => (
        <Badge variant={row.is_trial ? 'warning' : 'info'}>{row.plan_name?.toUpperCase() || 'N/A'}</Badge>
      ),
    },
    { header: 'Users', render: (row) => <p className="text-sm font-medium">{row.users ?? '—'}</p> },
    {
      header: 'Registered',
      render: (row) => <p className="text-sm text-surface-700">{formatDate(row.registered_at)}</p>,
    },
    {
      header: 'Last Activity',
      render: (row) => (
        <div>
          <p className="text-sm text-surface-700">{row.last_activity_at ? formatRelativeTime(row.last_activity_at) : 'Never'}</p>
          {row.is_inactive && row.inactive_since && (
            <p className="text-xs text-red-500">Inactive since {formatDate(row.inactive_since)}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col gap-1 items-start">
          <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge>
          {row.is_inactive && <Badge variant="danger">Inactive</Badge>}
        </div>
      ),
    },
    {
      header: 'Actions',
      width: '140px',
      render: (row) => (
        <div className="flex items-center gap-1">
          <a
            href={`/super-admin/tenants?search=${encodeURIComponent(row.company_name || '')}`}
            className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
            title="View Tenant"
          >
            <Eye className="w-4 h-4" />
          </a>
          {row.owner_email && (
            <a
              href={`mailto:${row.owner_email}`}
              className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
              title="Send Email"
            >
              <Mail className="w-4 h-4" />
            </a>
          )}
          <a
            href="/super-admin/subscriptions"
            className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
            title="View Subscription"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Tenant Monitoring</h1>
          <p className="text-surface-500">
            Lifecycle &amp; activity health across all tenant companies
            {dashboard?.inactivity_days ? ` — inactive after ${dashboard.inactivity_days}+ days of no activity` : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => { fetchDashboard(); fetchTenants() }}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="New Registrations (7d)" value={dashboard?.new_registrations} icon={UserPlus}
          color="bg-gradient-to-br from-accent-500 to-accent-600" active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatCard title="Trial Active" value={dashboard?.trial_active} icon={Clock}
          color="bg-gradient-to-br from-amber-500 to-amber-600" active={filter === 'trial'} onClick={() => setFilter('trial')} />
        <StatCard title="Trial Expired" value={dashboard?.trial_expired} icon={XCircle}
          color="bg-gradient-to-br from-red-500 to-red-600" active={filter === 'expired'} onClick={() => setFilter('expired')} />
        <StatCard title="Active Tenants" value={dashboard?.active_tenants} icon={CheckCircle}
          color="bg-gradient-to-br from-success-500 to-success-600" active={filter === 'active'} onClick={() => setFilter('active')} />
        <StatCard title="Inactive Tenants (7+ Days)" value={dashboard?.inactive_tenants} icon={AlertTriangle}
          color="bg-gradient-to-br from-red-500 to-red-700" active={filter === 'inactive'} onClick={() => setFilter('inactive')} />
        <StatCard title="Subscriptions Purchased" value={dashboard?.subscriptions_purchased} icon={CreditCard}
          color="bg-gradient-to-br from-purple-500 to-purple-600" active={filter === 'paid'} onClick={() => setFilter('paid')} />
        <StatCard title="Subscriptions Renewed" value={dashboard?.subscriptions_renewed} icon={RefreshCw}
          color="bg-gradient-to-br from-indigo-500 to-indigo-600" active={filter === 'paid'} onClick={() => setFilter('paid')} />
        <StatCard title="Payment Failures" value={dashboard?.payment_failures} icon={Building2}
          color="bg-gradient-to-br from-orange-500 to-orange-600" active={filter === 'payment_failed'} onClick={() => setFilter('payment_failed')} />
      </div>

      {/* Filtered tenant list */}
      <Card padding={false}>
        <div className="p-4 border-b border-surface-200 flex items-center justify-between">
          <p className="font-semibold text-surface-900">Tenants</p>
          <Select
            options={FILTERS}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-48"
          />
        </div>

        <Table columns={columns} data={tenants} isLoading={isLoadingList} emptyMessage="No tenants match this filter" />

        {total > limit && (
          <Table.Pagination
            currentPage={page}
            totalPages={Math.ceil(total / limit)}
            totalItems={total}
            itemsPerPage={limit}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  )
}

export default ActivityMonitor
