import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Calendar, Plus, Eye, Clock, User,
  XCircle, Download, MessageSquare
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import interviewService from '../../services/interviewService'
import usePermissions from '../../hooks/usePermissions'
import ExportModal from '../../components/common/ExportModal'

const STATUS_STYLES = {
  scheduled:   { background: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  confirmed:   { background: 'rgba(108,99,255,0.15)', color: '#6C63FF' },
  rescheduled: { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  in_progress: { background: 'rgba(156,99,255,0.15)', color: '#9C63FF' },
  completed:   { background: 'rgba(67,233,123,0.15)', color: '#43E97B' },
  cancelled:   { background: 'rgba(255,71,87,0.15)',  color: '#FF4757' },
  no_show:     { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
}

const getStatusStyle = (status) => STATUS_STYLES[status] || STATUS_STYLES.no_show

const Interviews = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const [interviews, setInterviews] = useState([])
  const [todayInterviews, setTodayInterviews] = useState([])
  const [pendingFeedback, setPendingFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({
    status: '',
    date_from: '',
    date_to: ''
  })
  const [statuses, setStatuses] = useState([])
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => { loadDropdowns() }, [])
  useEffect(() => { loadData() }, [activeTab, pagination.page, filters])

  const loadDropdowns = async () => {
    try {
      const statusRes = await interviewService.getStatuses()
      setStatuses(statusRes.data || [])
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      if (activeTab === 'today') {
        const response = await interviewService.getTodayInterviews()
        setTodayInterviews(response.data || [])
      } else if (activeTab === 'pending') {
        const response = await interviewService.getPendingFeedback()
        setPendingFeedback(response.data || [])
      } else {
        const params = {
          page: pagination.page,
          page_size: 20,
          ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
        }
        const response = await interviewService.getInterviews(params)
        setInterviews(response.data || [])
        setPagination(prev => ({
          ...prev,
          total: response.pagination?.total || 0,
          totalPages: response.pagination?.total_pages || 0
        }))
      }
    } catch (error) {
      toast.error('Failed to load interviews')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (interviewId) => {
    const reason = prompt('Please enter cancellation reason:')
    if (!reason) return
    try {
      await interviewService.cancelInterview(interviewId, reason)
      toast.success('Interview cancelled')
      loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel interview')
    }
  }

  const currentData = activeTab === 'today'
    ? todayInterviews
    : activeTab === 'pending'
      ? pendingFeedback
      : interviews

  const TABS = [
    { key: 'all', label: 'All Interviews', icon: null },
    { key: 'today', label: 'Today', icon: Clock },
    { key: 'pending', label: 'Pending Feedback', icon: MessageSquare },
  ]

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Interviews</h1>
          <p style={{ color: 'var(--text-muted)' }}>Schedule and manage candidate interviews</p>
        </div>
        <div className="flex items-center gap-2">
          {has('exports:create') && (
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {has('interviews:schedule') && (
            <Link to="/interviews/schedule" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Schedule Interview
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <div
          className="flex rounded-lg p-1"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              style={activeTab === key
                ? { background: 'var(--accent)', color: '#fff' }
                : { color: 'var(--text-secondary)' }
              }
              onMouseEnter={e => { if (activeTab !== key) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (activeTab !== key) e.currentTarget.style.background = '' }}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters (only for All tab) */}
      {activeTab === 'all' && (
        <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="input w-full"
              >
                <option value="">All Statuses</option>
                {statuses.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
              className="input"
            />
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
              className="input"
            />
          </div>
        </div>
      )}

      {/* Interviews Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {loading ? (
          <div className="p-8 text-center">
            <div
              className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Loading interviews...</p>
          </div>
        ) : currentData.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
            <p style={{ color: 'var(--text-muted)' }}>
              {activeTab === 'today'
                ? 'No interviews scheduled for today'
                : activeTab === 'pending'
                  ? 'No pending feedback'
                  : 'No interviews found'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Job / Company</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Pipeline</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Stage</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Last Round</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Overall Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Progress</th>
                <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentData.map(interview => (
                <tr
                  key={interview.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                  onClick={() => navigate(`/interviews/${interview.id}`)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                      >
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{interview.candidate_name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {interview.scheduled_date
                            ? new Date(interview.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                            : '—'}
                          {interview.scheduled_time && ` · ${interview.scheduled_time}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{interview.job_title}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{interview.client_name}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{interview.pipeline_name || '—'}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{interview.current_round_name || interview.stage_name || '—'}</span>
                  </td>
                  <td className="px-4 py-4">
                    {interview.last_round_result ? (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{interview.last_round_result}</span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium inline-block w-fit"
                      style={getStatusStyle(interview.overall_status || interview.status)}
                    >
                      {(interview.overall_status || interview.status)?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {interview.total_rounds > 0 ? (
                      <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                          Round {Math.min(interview.current_round_index + 1, interview.total_rounds)} of {interview.total_rounds}
                        </p>
                        <div className="flex gap-0.5">
                          {Array.from({ length: interview.total_rounds }).map((_, i) => (
                            <div
                              key={i}
                              className="h-1.5 flex-1 rounded-full"
                              style={{
                                background: i < interview.current_round_index || interview.overall_status === 'selected'
                                  ? '#43E97B'
                                  : i === interview.current_round_index && !['selected', 'failed'].includes(interview.overall_status)
                                  ? 'var(--accent)'
                                  : 'var(--border-strong)'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/interviews/${interview.id}`)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {has('interviews:update_status') && ['scheduled', 'confirmed', 'rescheduled', 'in_progress'].includes(interview.status) && (
                        <button
                          onClick={() => handleCancel(interview.id)}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: '#FF4757' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                          title="Cancel"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination (only for All tab) */}
        {activeTab === 'all' && pagination.totalPages > 1 && (
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Showing {interviews.length} of {pagination.total} interviews
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Interviews"
        apiPath="/export/interviews"
        extraFilters={({ status, setStatus }) => (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input w-full">
              <option value="">All Statuses</option>
              {statuses.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        )}
      />
    </div>
  )
}

export default Interviews
