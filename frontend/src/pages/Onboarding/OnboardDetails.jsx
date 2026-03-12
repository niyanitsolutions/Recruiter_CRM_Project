import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { 
  ArrowLeft, Edit, Calendar, Clock, DollarSign, MapPin, 
  User, Building2, Briefcase, FileText, CheckCircle, XCircle,
  AlertCircle, RefreshCw
} from 'lucide-react'
import { onboardService } from '../../services'

const STATUS_COLORS = {
  offer_released: 'bg-blue-100 text-blue-800 border-blue-200',
  offer_accepted: 'bg-green-100 text-green-800 border-green-200',
  offer_declined: 'bg-red-100 text-red-800 border-red-200',
  doj_confirmed: 'bg-purple-100 text-purple-800 border-purple-200',
  doj_extended: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  joined: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  no_show: 'bg-red-100 text-red-800 border-red-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
}

const OnboardDetails = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [onboard, setOnboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showDOJModal, setShowDOJModal] = useState(false)
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [dojDate, setDojDate] = useState('')
  const [extendData, setExtendData] = useState({ new_doj: '', reason: '' })

  useEffect(() => {
    fetchOnboard()
  }, [id])

  const fetchOnboard = async () => {
    try {
      setLoading(true)
      const data = await onboardService.getById(id)
      setOnboard(data)
    } catch (error) {
      console.error('Error fetching onboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusAction = async (action, data = {}) => {
    try {
      setActionLoading(true)
      switch (action) {
        case 'accept':
          await onboardService.acceptOffer(id, dojDate)
          break
        case 'decline':
          await onboardService.declineOffer(id, data.reason)
          break
        case 'confirm_doj':
          await onboardService.confirmDOJ(id)
          break
        case 'extend_doj':
          await onboardService.extendDOJ(id, extendData)
          break
        case 'mark_joined':
          await onboardService.markJoined(id, dojDate)
          break
        case 'mark_no_show':
          await onboardService.markNoShow(id, data.reason)
          break
      }
      fetchOnboard()
      setShowDOJModal(false)
      setShowExtendModal(false)
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Error updating status')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  if (!onboard) {
    return <div className="p-8 text-center">Onboard record not found</div>
  }

  const getStatusActions = () => {
    switch (onboard.status) {
      case 'offer_released':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => setShowDOJModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4" />
              Accept Offer
            </button>
            <button
              onClick={() => handleStatusAction('decline', { reason: 'Declined by candidate' })}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <XCircle className="w-4 h-4" />
              Decline
            </button>
          </div>
        )
      case 'offer_accepted':
        return (
          <button
            onClick={() => handleStatusAction('confirm_doj')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <CheckCircle className="w-4 h-4" />
            Confirm DOJ
          </button>
        )
      case 'doj_confirmed':
      case 'doj_extended':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setDojDate(onboard.expected_doj || '')
                setShowDOJModal(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              <CheckCircle className="w-4 h-4" />
              Mark Joined
            </button>
            <button
              onClick={() => setShowExtendModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              <RefreshCw className="w-4 h-4" />
              Extend DOJ
            </button>
            <button
              onClick={() => handleStatusAction('mark_no_show')}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <XCircle className="w-4 h-4" />
              No Show
            </button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/onboards')}
            className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">{onboard.candidate_name}</h1>
            <p className="text-surface-600">{onboard.job_title} at {onboard.client_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${STATUS_COLORS[onboard.status]}`}>
            {onboard.status?.replace(/_/g, ' ').toUpperCase()}
          </span>
          <Link
            to={`/onboards/${id}/edit`}
            className="flex items-center gap-2 px-4 py-2 border border-surface-300 rounded-lg hover:bg-surface-50"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* Status Actions */}
      <div className="bg-white rounded-xl p-4 border border-surface-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-surface-600">Quick Actions</p>
          </div>
          {getStatusActions()}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Offer Details */}
          <div className="bg-white rounded-xl p-6 border border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Offer Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-surface-500">CTC</p>
                <p className="font-semibold text-surface-900 flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  ₹{(onboard.offer_ctc / 100000).toFixed(2)} LPA
                </p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Designation</p>
                <p className="font-semibold text-surface-900">{onboard.offer_designation}</p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Location</p>
                <p className="font-semibold text-surface-900 flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {onboard.offer_location}
                </p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Offer Released</p>
                <p className="font-semibold text-surface-900 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {onboard.offer_released_date}
                </p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Expected DOJ</p>
                <p className="font-semibold text-surface-900">{onboard.expected_doj || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-surface-500">Actual DOJ</p>
                <p className="font-semibold text-surface-900">{onboard.actual_doj || '-'}</p>
              </div>
            </div>
          </div>

          {/* Day Counter (for joined candidates) */}
          {onboard.status === 'joined' && (
            <div className="bg-white rounded-xl p-6 border border-surface-200">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">Day Counter</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-surface-50 rounded-lg">
                  <p className="text-3xl font-bold text-primary-600">{onboard.days_at_client}</p>
                  <p className="text-sm text-surface-600">Days at Client</p>
                </div>
                <div className="text-center p-4 bg-surface-50 rounded-lg">
                  <p className="text-3xl font-bold text-surface-900">{onboard.payout_days_required}</p>
                  <p className="text-sm text-surface-600">Payout Days Required</p>
                </div>
                <div className="text-center p-4 bg-surface-50 rounded-lg">
                  <p className={`text-3xl font-bold ${onboard.payout_eligible ? 'text-green-600' : 'text-yellow-600'}`}>
                    {onboard.payout_eligible ? 'Yes' : 'No'}
                  </p>
                  <p className="text-sm text-surface-600">Payout Eligible</p>
                </div>
              </div>
              {!onboard.payout_eligible && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    {onboard.payout_days_required - onboard.days_at_client} days remaining for payout eligibility
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Documents */}
          <div className="bg-white rounded-xl p-6 border border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">
              Documents
              {onboard.documents_verified && (
                <span className="ml-2 text-sm font-normal text-green-600">✓ All Verified</span>
              )}
            </h2>
            {onboard.documents?.length > 0 ? (
              <div className="space-y-2">
                {onboard.documents.map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-surface-400" />
                      <span>{doc.document_name}</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      doc.status === 'verified' ? 'bg-green-100 text-green-800' :
                      doc.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                      doc.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-surface-500">No documents required</p>
            )}
          </div>

          {/* Status History */}
          <div className="bg-white rounded-xl p-6 border border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Status History</h2>
            <div className="space-y-3">
              {onboard.status_history?.map((history, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg">
                  <div className="w-2 h-2 mt-2 rounded-full bg-primary-500" />
                  <div className="flex-1">
                    <p className="font-medium text-surface-900">
                      {history.from_status ? `${history.from_status} → ` : ''}{history.to_status}
                    </p>
                    {history.reason && (
                      <p className="text-sm text-surface-600">{history.reason}</p>
                    )}
                    <p className="text-xs text-surface-400 mt-1">
                      {new Date(history.changed_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Candidate Info */}
          <div className="bg-white rounded-xl p-6 border border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Candidate</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-surface-400" />
                <span>{onboard.candidate_name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-surface-400">📧</span>
                <span className="text-sm">{onboard.candidate_email}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-surface-400">📱</span>
                <span className="text-sm">{onboard.candidate_mobile}</span>
              </div>
            </div>
          </div>

          {/* Job Info */}
          <div className="bg-white rounded-xl p-6 border border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Job</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Briefcase className="w-5 h-5 text-surface-400" />
                <span>{onboard.job_title}</span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-surface-400" />
                <span>{onboard.client_name}</span>
              </div>
            </div>
          </div>

          {/* Partner Info */}
          {onboard.partner_name && (
            <div className="bg-white rounded-xl p-6 border border-surface-200">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">Referred By</h2>
              <p className="font-medium">{onboard.partner_name}</p>
            </div>
          )}

          {/* Notes */}
          {onboard.notes && (
            <div className="bg-white rounded-xl p-6 border border-surface-200">
              <h2 className="text-lg font-semibold text-surface-900 mb-4">Notes</h2>
              <p className="text-surface-600">{onboard.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* DOJ Modal */}
      {showDOJModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {onboard.status === 'offer_released' ? 'Accept Offer' : 'Mark Joined'}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-1">
                {onboard.status === 'offer_released' ? 'Expected DOJ' : 'Actual DOJ'}
              </label>
              <input
                type="date"
                value={dojDate}
                onChange={(e) => setDojDate(e.target.value)}
                className="w-full px-4 py-2 border border-surface-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDOJModal(false)}
                className="px-4 py-2 border border-surface-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusAction(onboard.status === 'offer_released' ? 'accept' : 'mark_joined')}
                disabled={!dojDate || actionLoading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend DOJ Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Extend DOJ</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">New DOJ</label>
                <input
                  type="date"
                  value={extendData.new_doj}
                  onChange={(e) => setExtendData(prev => ({ ...prev, new_doj: e.target.value }))}
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Reason</label>
                <textarea
                  value={extendData.reason}
                  onChange={(e) => setExtendData(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowExtendModal(false)}
                className="px-4 py-2 border border-surface-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusAction('extend_doj')}
                disabled={!extendData.new_doj || !extendData.reason || actionLoading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Extend DOJ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OnboardDetails