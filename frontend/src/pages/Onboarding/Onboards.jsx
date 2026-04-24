import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Eye, Edit,
  UserCheck, Calendar, Clock, FileText
} from 'lucide-react'
import { onboardService } from '../../services'
import usePermissions from '../../hooks/usePermissions'

const STATUS_STYLES = {
  offer_released: { background: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  offer_accepted: { background: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  offer_declined: { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  doj_confirmed:  { background: 'rgba(108,99,255,0.15)',   color: '#6C63FF' },
  doj_extended:   { background: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  joined:         { background: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  no_show:        { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  absconded:      { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  terminated:     { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  completed:      { background: 'rgba(67,233,123,0.20)',   color: '#43E97B', fontWeight: 700 },
}

const STATUS_LABELS = {
  offer_released: 'Offer Released',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  doj_confirmed:  'DOJ Confirmed',
  doj_extended:   'DOJ Extended',
  joined:         'Joined',
  no_show:        'No Show',
  absconded:      'Absconded',
  terminated:     'Terminated',
  completed:      'Completed',
}

const STAT_CARDS = [
  { key: 'total_offers',      label: 'Total Offers',       color: 'var(--stat-blue)' },
  { key: 'offers_accepted',   label: 'Accepted',           color: 'var(--stat-green)' },
  { key: 'joined_this_month', label: 'Joined This Month',  color: 'var(--stat-teal)' },
  { key: 'upcoming_doj',      label: 'Upcoming DOJ',       color: 'var(--stat-purple)' },
  { key: 'payout_eligible',   label: 'Payout Eligible',    color: 'var(--stat-orange)' },
]

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
    <div className="p-6 space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Onboarding</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track candidate onboarding journey</p>
        </div>
        {has('onboards:create') && (
          <Link to="/onboards/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Release Offer
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {STAT_CARDS.map(({ key, label, color }) => (
            <div
              key={key}
              className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
            >
              <div
                className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center"
                style={{ background: color }}
              >
                <UserCheck className="w-4 h-4 text-white" />
              </div>
              <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {stats[key] ?? 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by candidate, job, client..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="input w-full pl-10"
              />
            </div>
          </div>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="input"
          >
            <option value="">All Status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {loading ? (
          <div className="p-8 text-center">
            <div
              className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          </div>
        ) : onboards.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
            <p style={{ color: 'var(--text-muted)' }}>No onboarding records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Job / Client</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Offer CTC</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>DOJ</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Days</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {onboards.map((onboard) => (
                  <tr
                    key={onboard.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{onboard.candidate_name}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{onboard.candidate_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{onboard.job_title}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{onboard.client_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        ₹{(onboard.offer_ctc / 100000).toFixed(1)}L
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {onboard.actual_doj || onboard.expected_doj || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {onboard.status === 'joined' ? (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {onboard.days_at_client} days
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--text-disabled)' }}>-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="px-2 py-1 rounded-full text-xs font-medium"
                          style={STATUS_STYLES[onboard.status] || STATUS_STYLES.offer_released}
                        >
                          {STATUS_LABELS[onboard.status]}
                        </span>
                        {onboard.payout_eligible && (
                          <span
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{ background: 'rgba(56,249,215,0.15)', color: '#38F9D7' }}
                          >
                            Payout Ready
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/onboards/${onboard.id}`}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {has('onboards:edit') && (
                          <Link
                            to={`/onboards/${onboard.id}/edit`}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
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
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Showing {(filters.page - 1) * filters.page_size + 1} to{' '}
              {Math.min(filters.page * filters.page_size, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleFilterChange('page', filters.page - 1)}
                disabled={filters.page === 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handleFilterChange('page', filters.page + 1)}
                disabled={filters.page === pagination.pages}
                className="btn-secondary text-sm disabled:opacity-50"
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
