import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Eye, User, Download, X
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import applicationService from '../../services/applicationService'
import ExportModal from '../../components/common/ExportModal'
import usePermissions from '../../hooks/usePermissions'

const FALLBACK_STATUSES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview', label: 'In Interview' },
  { value: 'next_round', label: 'Next Round' },
  { value: 'selected', label: 'Selected' },
  { value: 'offered', label: 'Offered' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'offer_declined', label: 'Offer Declined' },
  { value: 'joined', label: 'Joined' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'on_hold', label: 'On Hold' },
]

const STATUS_STYLES = {
  applied:        { background: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  screening:      { background: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  shortlisted:    { background: 'rgba(108,99,255,0.15)',   color: '#6C63FF' },
  interview:      { background: 'rgba(108,99,255,0.20)',   color: '#9C63FF' },
  next_round:     { background: 'rgba(90,82,232,0.20)',    color: '#8B7FF8' },
  selected:       { background: 'rgba(67,233,123,0.20)',   color: '#43E97B' },
  offered:        { background: 'rgba(251,146,60,0.15)',   color: '#FB923C' },
  offer_accepted: { background: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  offer_declined: { background: 'rgba(255,107,157,0.15)', color: '#FF6B9D' },
  joined:         { background: 'rgba(67,233,123,0.25)',   color: '#43E97B', fontWeight: 700 },
  rejected:       { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  withdrawn:      { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  on_hold:        { background: 'rgba(245,158,11,0.10)',   color: '#F59E0B' },
}

const getStatusStyle = (status) => STATUS_STYLES[status] || STATUS_STYLES.withdrawn

const Applications = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({
    job_id: '',
    candidate_id: '',
    status: '',
    keyword: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => { loadDropdowns() }, [])
  useEffect(() => { loadApplications() }, [pagination.page, filters])

  const loadDropdowns = async () => {
    try {
      const statusRes = await applicationService.getStatuses()
      setStatuses(statusRes.data || [])
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadApplications = async () => {
    try {
      setLoading(true)
      const params = {
        page: pagination.page,
        page_size: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      }
      const response = await applicationService.getApplications(params)
      setApplications(response.data || [])
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.total_pages || 0
      }))
    } catch (error) {
      toast.error('Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (applicationId, newStatus) => {
    try {
      const res = await applicationService.updateStatus(applicationId, { status: newStatus })
      if (res && res.success === false) {
        toast.error(res.message || 'Failed to update status')
      } else {
        toast.success('Status updated successfully')
        loadApplications()
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status')
    }
  }

  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedIds.length === 0) {
      toast.error('Please select applications first')
      return
    }
    try {
      await applicationService.bulkUpdateStatus(selectedIds, newStatus)
      toast.success(`Updated ${selectedIds.length} applications`)
      setSelectedIds([])
      setShowStatusModal(false)
      loadApplications()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update applications')
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === applications.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(applications.map(a => a.id))
    }
  }

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Applications</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track candidate applications through the hiring pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {has('exports:create') && (
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {selectedIds.length > 0 && has('applications:edit') && (
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selectedIds.length} selected</span>
              <button onClick={() => setShowStatusModal(true)} className="btn-primary text-sm">
                Update Status
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={filters.keyword}
              onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
              placeholder="Search by candidate, job or client…"
              className="input w-full"
            />
          </div>
          <div className="min-w-[180px]">
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="input w-full"
            >
              <option value="">All Statuses</option>
              {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {(filters.keyword || filters.status) && (
            <button
              onClick={() => setFilters({ job_id: '', candidate_id: '', status: '', keyword: '' })}
              className="btn-secondary text-sm flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Applications Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {loading ? (
          <div>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="w-5 h-5 rounded skeleton flex-shrink-0" style={{ background: 'var(--skeleton-from)' }} />
                <div className="w-8 h-8 rounded-full skeleton flex-shrink-0" style={{ background: 'var(--skeleton-from)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded skeleton w-36" style={{ background: 'var(--skeleton-from)' }} />
                  <div className="h-2.5 rounded skeleton w-48" style={{ background: 'var(--skeleton-from)' }} />
                </div>
                <div className="h-3 rounded skeleton w-24" style={{ background: 'var(--skeleton-from)' }} />
                <div className="h-5 rounded-full skeleton w-20" style={{ background: 'var(--skeleton-from)' }} />
                <div className="h-3 rounded skeleton w-16" style={{ background: 'var(--skeleton-from)' }} />
              </div>
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
            <p style={{ color: 'var(--text-muted)' }}>No applications found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === applications.length && applications.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Match</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Job</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Stage</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Interviews</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Applied</th>
                <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Last Updated</th>
                <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(app => (
                <tr
                  key={app.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(app.id)}
                      onChange={() => toggleSelect(app.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                      >
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{app.candidate_name}</p>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{app.candidate_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {app.eligibility_score != null ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={
                          app.eligibility_score >= 70
                            ? { background: 'rgba(67,233,123,0.15)', color: '#43E97B' }
                            : app.eligibility_score >= 50
                            ? { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
                            : { background: 'rgba(255,71,87,0.12)', color: '#FF4757' }
                        }
                      >
                        {Math.round(app.eligibility_score)}%
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{app.job_title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{app.client_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {app.current_stage_name || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={app.status}
                      onChange={(e) => handleStatusUpdate(app.id, e.target.value)}
                      className="text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none"
                      style={getStatusStyle(app.status)}
                    >
                      {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {app.total_interviews || 0} total
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {new Date(app.applied_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {app.status_changed_at
                        ? new Date(app.status_changed_at).toLocaleDateString()
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/applications/${app.id}`)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Showing {applications.length} of {pagination.total} applications
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

      {/* Bulk Status Update Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-xl shadow-xl p-6 w-full max-w-md" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Update Status</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              Select new status for {selectedIds.length} application(s)
            </p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                <button
                  key={s.value}
                  onClick={() => handleBulkStatusUpdate(s.value)}
                  className="px-4 py-2 text-sm rounded-lg transition-colors text-left"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowStatusModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Applications"
        apiPath="/export/applications"
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

export default Applications
