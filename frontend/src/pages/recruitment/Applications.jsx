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

  useEffect(() => {
    loadDropdowns()
  }, [])

  useEffect(() => {
    loadApplications()
  }, [pagination.page, filters])

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

  const getStatusBadge = (status) => {
    const colors = {
      applied: 'bg-blue-100 text-blue-800',
      screening: 'bg-yellow-100 text-yellow-800',
      shortlisted: 'bg-purple-100 text-purple-800',
      interview: 'bg-indigo-100 text-indigo-800',
      next_round: 'bg-indigo-200 text-indigo-900',
      selected: 'bg-green-600 text-white',
      offered: 'bg-orange-100 text-orange-800',
      offer_accepted: 'bg-green-100 text-green-800',
      offer_declined: 'bg-pink-100 text-pink-800',
      joined: 'bg-green-200 text-green-900',
      rejected: 'bg-red-100 text-red-800',
      withdrawn: 'bg-gray-100 text-gray-800',
      on_hold: 'bg-yellow-50 text-yellow-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Applications</h1>
          <p className="text-surface-500">Track candidate applications through the hiring pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {has('exports:create') && (
            <button
              onClick={() => setExportOpen(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {selectedIds.length > 0 && has('applications:edit') && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-surface-600">{selectedIds.length} selected</span>
              <button
                onClick={() => setShowStatusModal(true)}
                className="btn-primary text-sm"
              >
                Update Status
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 mb-6">
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

      {/* Pipeline View */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
        {loading ? (
          <div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-surface-100">
                <div className="w-5 h-5 bg-surface-200 rounded skeleton flex-shrink-0" />
                <div className="w-8 h-8 rounded-full bg-surface-200 skeleton flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-surface-200 rounded skeleton w-36" />
                  <div className="h-2.5 bg-surface-200 rounded skeleton w-48" />
                </div>
                <div className="h-3 bg-surface-200 rounded skeleton w-24" />
                <div className="h-5 bg-surface-200 rounded-full skeleton w-20" />
                <div className="h-3 bg-surface-200 rounded skeleton w-16" />
              </div>
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-surface-300 mx-auto mb-4" />
            <p className="text-surface-500">No applications found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === applications.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Candidate</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Match</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Job</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Stage</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Interviews</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Applied</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Last Updated</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-surface-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {applications.map(app => (
                <tr key={app.id} className="hover:bg-surface-50 transition-colors">
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
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-surface-900">{app.candidate_name}</p>
                        <p className="text-sm text-surface-500">{app.candidate_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {app.eligibility_score != null ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: app.eligibility_score >= 70
                          ? 'rgba(16,185,129,0.15)' : app.eligibility_score >= 50
                          ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.12)',
                        color: app.eligibility_score >= 70 ? '#34d399'
                          : app.eligibility_score >= 50 ? '#fbbf24' : '#f87171',
                      }}>
                        {Math.round(app.eligibility_score)}%
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#475569' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="text-sm text-surface-900">{app.job_title}</p>
                      <p className="text-xs text-surface-500">{app.client_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-600">
                      {app.current_stage_name || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {/* Inline status dropdown — no edit click required */}
                    <select
                      value={app.status}
                      onChange={(e) => handleStatusUpdate(app.id, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-primary-300 ${getStatusBadge(app.status)}`}
                    >
                      {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-600">
                      {app.total_interviews || 0} total
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-500">
                      {new Date(app.applied_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-500">
                      {app.status_changed_at
                        ? new Date(app.status_changed_at).toLocaleDateString()
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/applications/${app.id}`)}
                        className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-surface-500" />
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
          <div className="px-4 py-3 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-500">
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
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Update Status</h3>
            <p className="text-surface-600 mb-4">
              Select new status for {selectedIds.length} application(s)
            </p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                <button
                  key={s.value}
                  onClick={() => handleBulkStatusUpdate(s.value)}
                  className="px-4 py-2 text-sm border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors text-left"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowStatusModal(false)}
                className="btn-secondary"
              >
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
            <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
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