import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Calendar, Plus, Search, Filter, Eye, Edit,
  Video, Phone, MapPin, Clock, User, CheckCircle,
  XCircle, AlertCircle, MessageSquare
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import interviewService from '../../services/interviewService'
import usePermissions from '../../hooks/usePermissions'

const Interviews = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const [interviews, setInterviews] = useState([])
  const [todayInterviews, setTodayInterviews] = useState([])
  const [pendingFeedback, setPendingFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all') // 'all', 'today', 'pending'
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({
    status: '',
    date_from: '',
    date_to: ''
  })
  const [showFilters, setShowFilters] = useState(false)
  const [statuses, setStatuses] = useState([])

  useEffect(() => {
    loadDropdowns()
  }, [])

  useEffect(() => {
    loadData()
  }, [activeTab, pagination.page, filters])

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

  const getStatusBadge = (status) => {
    const colors = {
      scheduled: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-indigo-100 text-indigo-800',
      rescheduled: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      no_show: 'bg-gray-100 text-gray-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getResultBadge = (result) => {
    const colors = {
      pending: 'bg-gray-100 text-gray-600',
      passed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      on_hold: 'bg-yellow-100 text-yellow-800'
    }
    return colors[result] || 'bg-gray-100 text-gray-800'
  }

  const getModeIcon = (mode) => {
    const icons = {
      video: Video,
      phone: Phone,
      in_person: MapPin
    }
    const Icon = icons[mode] || Video
    return <Icon className="w-4 h-4" />
  }

  const currentData = activeTab === 'today' 
    ? todayInterviews 
    : activeTab === 'pending' 
      ? pendingFeedback 
      : interviews

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Interviews</h1>
          <p className="text-surface-500">Schedule and manage candidate interviews</p>
        </div>
        {has('interviews:schedule') && (
          <Link
            to="/interviews/schedule"
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Schedule Interview
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex rounded-lg border border-surface-200 p-1 bg-white">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'all' 
                ? 'bg-primary-500 text-white' 
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            All Interviews
          </button>
          <button
            onClick={() => setActiveTab('today')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'today' 
                ? 'bg-primary-500 text-white' 
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            Today
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'pending' 
                ? 'bg-primary-500 text-white' 
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Pending Feedback
          </button>
        </div>
      </div>

      {/* Filters (only for All tab) */}
      {activeTab === 'all' && (
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 mb-6">
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
              placeholder="From Date"
            />
            
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
              className="input"
              placeholder="To Date"
            />
          </div>
        </div>
      )}

      {/* Interviews List */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2 text-surface-500">Loading interviews...</p>
          </div>
        ) : currentData.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-12 h-12 text-surface-300 mx-auto mb-4" />
            <p className="text-surface-500">
              {activeTab === 'today' 
                ? 'No interviews scheduled for today' 
                : activeTab === 'pending'
                  ? 'No pending feedback'
                  : 'No interviews found'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Candidate</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Job</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Stage</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Schedule</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Mode</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-surface-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {currentData.map(interview => (
                <tr key={interview.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-surface-900">{interview.candidate_name}</p>
                        <p className="text-sm text-surface-500">{interview.client_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-surface-900">{interview.job_title}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-surface-600">{interview.stage_name}</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm">
                      <p className="text-surface-900">
                        {new Date(interview.scheduled_date).toLocaleDateString()}
                      </p>
                      <p className="text-surface-500">{interview.scheduled_time}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1 text-sm text-surface-600">
                      {getModeIcon(interview.interview_mode)}
                      <span className="capitalize">{interview.interview_mode?.replace('_', ' ')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block w-fit ${getStatusBadge(interview.status)}`}>
                        {interview.status?.replace('_', ' ')}
                      </span>
                      {interview.result && interview.result !== 'pending' && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block w-fit ${getResultBadge(interview.result)}`}>
                          {interview.result}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/interviews/${interview.id}`)}
                        className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-surface-500" />
                      </button>
                      {has('interviews:update_status') && !interview.feedback_submitted && interview.status !== 'cancelled' && (
                        <button
                          onClick={() => navigate(`/interviews/${interview.id}/feedback`)}
                          className="p-2 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Submit Feedback"
                        >
                          <MessageSquare className="w-4 h-4 text-primary-500" />
                        </button>
                      )}
                      {has('interviews:update_status') && ['scheduled', 'confirmed', 'rescheduled'].includes(interview.status) && (
                        <button
                          onClick={() => handleCancel(interview.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Cancel"
                        >
                          <XCircle className="w-4 h-4 text-red-500" />
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
          <div className="px-4 py-3 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-500">
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
    </div>
  )
}

export default Interviews