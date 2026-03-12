import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Plus, Search, Filter, Eye, Edit, MoreVertical,
  UserCheck, UserX, Calendar, Clock, FileText, AlertCircle
} from 'lucide-react'
import { onboardService } from '../../services'
import usePermissions from '../../hooks/usePermissions'

const STATUS_COLORS = {
  offer_released: 'bg-blue-100 text-blue-800',
  offer_accepted: 'bg-green-100 text-green-800',
  offer_declined: 'bg-red-100 text-red-800',
  doj_confirmed: 'bg-purple-100 text-purple-800',
  doj_extended: 'bg-yellow-100 text-yellow-800',
  joined: 'bg-emerald-100 text-emerald-800',
  no_show: 'bg-red-100 text-red-800',
  absconded: 'bg-gray-100 text-gray-800',
  terminated: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
}

const STATUS_LABELS = {
  offer_released: 'Offer Released',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  doj_confirmed: 'DOJ Confirmed',
  doj_extended: 'DOJ Extended',
  joined: 'Joined',
  no_show: 'No Show',
  absconded: 'Absconded',
  terminated: 'Terminated',
  completed: 'Completed',
}

const Onboards = () => {
  const { has } = usePermissions()
  const [onboards, setOnboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    page: 1,
    page_size: 20
  })
  const [pagination, setPagination] = useState({ total: 0, pages: 1 })

  useEffect(() => {
    fetchOnboards()
    fetchStats()
  }, [filters])

  const fetchOnboards = async () => {
    try {
      setLoading(true)
      const response = await onboardService.getAll(filters)
      setOnboards(response.items || [])
      setPagination({ total: response.total, pages: response.pages })
    } catch (error) {
      console.error('Error fetching onboards:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await onboardService.getDashboardStats()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Onboarding</h1>
          <p className="text-surface-600">Track candidate onboarding journey</p>
        </div>
        {has('onboards:create') && (
          <Link
            to="/onboards/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Release Offer
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 border border-surface-200">
            <p className="text-sm text-surface-600">Total Offers</p>
            <p className="text-2xl font-bold text-surface-900">{stats.total_offers}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-surface-200">
            <p className="text-sm text-surface-600">Accepted</p>
            <p className="text-2xl font-bold text-green-600">{stats.offers_accepted}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-surface-200">
            <p className="text-sm text-surface-600">Joined This Month</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.joined_this_month}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-surface-200">
            <p className="text-sm text-surface-600">Upcoming DOJ</p>
            <p className="text-2xl font-bold text-purple-600">{stats.upcoming_doj}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-surface-200">
            <p className="text-sm text-surface-600">Payout Eligible</p>
            <p className="text-2xl font-bold text-blue-600">{stats.payout_eligible}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-surface-200">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
              <input
                type="text"
                placeholder="Search by candidate, job, client..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
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
        ) : onboards.length === 0 ? (
          <div className="p-8 text-center text-surface-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-surface-300" />
            <p>No onboarding records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Candidate</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Job / Client</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Offer CTC</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">DOJ</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Days</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {onboards.map((onboard) => (
                  <tr key={onboard.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-surface-900">{onboard.candidate_name}</p>
                        <p className="text-sm text-surface-500">{onboard.candidate_email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-surface-900">{onboard.job_title}</p>
                        <p className="text-sm text-surface-500">{onboard.client_name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-surface-900">
                        ₹{(onboard.offer_ctc / 100000).toFixed(1)}L
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-surface-400" />
                        <span className="text-sm">
                          {onboard.actual_doj || onboard.expected_doj || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {onboard.status === 'joined' ? (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-surface-400" />
                          <span className="text-sm font-medium">{onboard.days_at_client} days</span>
                        </div>
                      ) : (
                        <span className="text-sm text-surface-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[onboard.status]}`}>
                        {STATUS_LABELS[onboard.status]}
                      </span>
                      {onboard.payout_eligible && (
                        <span className="ml-2 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Payout Ready
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/onboards/${onboard.id}`}
                          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-surface-600" />
                        </Link>
                        {has('onboards:edit') && (
                          <Link
                            to={`/onboards/${onboard.id}/edit`}
                            className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4 text-surface-600" />
                          </Link>
                        )}
                      </div>
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

export default Onboards