import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Search, Filter, Eye, DollarSign, Clock, CheckCircle, 
  XCircle, FileText, TrendingUp, Calendar
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { selectUserRole } from '../../store/authSlice'
import { payoutService } from '../../services'

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  eligible: 'bg-blue-100 text-blue-800',
  invoice_raised: 'bg-purple-100 text-purple-800',
  invoice_approved: 'bg-green-100 text-green-800',
  invoice_rejected: 'bg-red-100 text-red-800',
  payment_processing: 'bg-indigo-100 text-indigo-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const STATUS_LABELS = {
  pending: 'Pending',
  eligible: 'Eligible',
  invoice_raised: 'Invoice Raised',
  invoice_approved: 'Invoice Approved',
  invoice_rejected: 'Invoice Rejected',
  payment_processing: 'Processing',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const PartnerPayouts = () => {
  const userRole = useSelector(selectUserRole)
  const isPartner = userRole === 'partner'
  const isAccounts = userRole === 'accounts'

  const [payouts, setPayouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
    page: 1,
    page_size: 20
  })
  const [pagination, setPagination] = useState({ total: 0, pages: 1 })

  useEffect(() => {
    fetchPayouts()
    fetchStats()
  }, [filters])

  const fetchPayouts = async () => {
    try {
      setLoading(true)
      const response = isPartner 
        ? await payoutService.getMyPayouts(filters)
        : await payoutService.getAll(filters)
      setPayouts(response.items || [])
      setPagination({ total: response.total, pages: response.pages })
    } catch (error) {
      console.error('Error fetching payouts:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = isPartner 
        ? await payoutService.getMyStats()
        : await payoutService.getAccountsDashboard()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            {isPartner ? 'My Payouts' : 'Partner Payouts'}
          </h1>
          <p className="text-surface-600">
            {isPartner ? 'Track your commissions and payments' : 'Manage partner commissions and invoices'}
          </p>
        </div>
        {isPartner && (
          <Link
            to="/payouts/raise-invoice"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FileText className="w-5 h-5" />
            Raise Invoice
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isPartner ? (
            <>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-surface-600">Total Placements</p>
                    <p className="text-2xl font-bold text-surface-900">{stats.total_placements}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-surface-600">Pending Amount</p>
                    <p className="text-2xl font-bold text-surface-900">{formatCurrency(stats.total_pending_amount)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-surface-600">Total Paid</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.total_paid)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-surface-600">This Month</p>
                    <p className="text-2xl font-bold text-purple-600">{formatCurrency(stats.this_month_earnings)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <p className="text-sm text-surface-600">Pending Approvals</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending_approvals}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <p className="text-sm text-surface-600">Pending Payments</p>
                <p className="text-2xl font-bold text-blue-600">{stats.pending_payments}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <p className="text-sm text-surface-600">Pending Amount</p>
                <p className="text-2xl font-bold text-surface-900">{formatCurrency(stats.total_pending_amount)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-surface-200">
                <p className="text-sm text-surface-600">Paid This Month</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.paid_this_month)}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-surface-200">
        <div className="flex flex-wrap gap-4">
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-surface-500">Loading...</div>
        ) : payouts.length === 0 ? (
          <div className="p-8 text-center text-surface-500">
            <DollarSign className="w-12 h-12 mx-auto mb-4 text-surface-300" />
            <p>No payout records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  {!isPartner && <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Partner</th>}
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Candidate</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Client</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">CTC</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Commission</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Joined</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Eligible Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {payouts.map((payout) => (
                  <tr key={payout.id} className="hover:bg-surface-50">
                    {!isPartner && (
                      <td className="px-4 py-3">
                        <p className="font-medium text-surface-900">{payout.partner_name}</p>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-surface-900">{payout.candidate_name}</p>
                        <p className="text-sm text-surface-500">{payout.job_title}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-surface-900">{payout.client_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-surface-900">
                        {formatCurrency(payout.candidate_ctc)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-green-600">
                          {formatCurrency(payout.calculation?.net_amount || 0)}
                        </p>
                        <p className="text-xs text-surface-500">
                          {payout.commission_rule?.percentage}% + GST - TDS
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{payout.joined_date}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm">{payout.payout_eligible_date}</p>
                        {payout.days_remaining > 0 && (
                          <p className="text-xs text-surface-500">{payout.days_remaining} days left</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[payout.status]}`}>
                        {STATUS_LABELS[payout.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/payouts/${payout.id}`}
                        className="p-2 hover:bg-surface-100 rounded-lg transition-colors inline-flex"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-surface-600" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-600">
              Showing {(filters.page - 1) * filters.page_size + 1} to{' '}
              {Math.min(filters.page * filters.page_size, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleFilterChange('page', filters.page - 1)}
                disabled={filters.page === 1}
                className="px-3 py-1 border border-surface-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handleFilterChange('page', filters.page + 1)}
                disabled={filters.page === pagination.pages}
                className="px-3 py-1 border border-surface-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PartnerPayouts