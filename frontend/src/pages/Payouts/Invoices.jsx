import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Eye, FileText, CheckCircle, XCircle, DollarSign, 
  Clock, Download, CreditCard
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { selectUserRole } from '../../store/authSlice'
import { payoutService } from '../../services'

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const Invoices = () => {
  const userRole = useSelector(selectUserRole)
  const isPartner = userRole === 'partner'
  const isAccounts = userRole === 'accounts' || userRole === 'admin'

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: '',
    page: 1,
    page_size: 20
  })
  const [pagination, setPagination] = useState({ total: 0, pages: 1 })
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [paymentData, setPaymentData] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    payment_reference: '',
    payment_amount: 0,
    notes: ''
  })

  useEffect(() => {
    fetchInvoices()
  }, [filters])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const response = isPartner 
        ? await payoutService.getMyInvoices(filters)
        : await payoutService.getInvoices(filters)
      setInvoices(response.items || [])
      setPagination({ total: response.total, pages: response.pages })
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedInvoice) return
    try {
      setActionLoading(true)
      await payoutService.approveInvoice(selectedInvoice.id, {})
      fetchInvoices()
      setShowApproveModal(false)
      setSelectedInvoice(null)
    } catch (error) {
      console.error('Error approving invoice:', error)
      alert('Error approving invoice')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selectedInvoice || !rejectReason) return
    try {
      setActionLoading(true)
      await payoutService.rejectInvoice(selectedInvoice.id, { rejection_reason: rejectReason })
      fetchInvoices()
      setShowRejectModal(false)
      setSelectedInvoice(null)
      setRejectReason('')
    } catch (error) {
      console.error('Error rejecting invoice:', error)
      alert('Error rejecting invoice')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return
    try {
      setActionLoading(true)
      await payoutService.recordPayment(selectedInvoice.id, paymentData)
      fetchInvoices()
      setShowPaymentModal(false)
      setSelectedInvoice(null)
    } catch (error) {
      console.error('Error recording payment:', error)
      alert('Error recording payment')
    } finally {
      setActionLoading(false)
    }
  }

  const openApproveModal = (invoice) => {
    setSelectedInvoice(invoice)
    setShowApproveModal(true)
  }

  const openRejectModal = (invoice) => {
    setSelectedInvoice(invoice)
    setShowRejectModal(true)
  }

  const openPaymentModal = (invoice) => {
    setSelectedInvoice(invoice)
    setPaymentData(prev => ({ ...prev, payment_amount: invoice.total_amount }))
    setShowPaymentModal(true)
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
          <h1 className="text-2xl font-bold text-surface-900">Invoices</h1>
          <p className="text-surface-600">
            {isPartner ? 'View your submitted invoices' : 'Manage partner invoices'}
          </p>
        </div>
        {isPartner && (
          <Link
            to="/payouts/raise-invoice"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <FileText className="w-5 h-5" />
            New Invoice
          </Link>
        )}
      </div>

      {/* Quick Actions for Accounts */}
      {isAccounts && (
        <div className="grid grid-cols-2 gap-4">
          <Link
            to="/payouts/invoices?status=submitted"
            className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 hover:bg-yellow-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="font-semibold text-yellow-800">Pending Approval</p>
                <p className="text-sm text-yellow-600">Review and approve invoices</p>
              </div>
            </div>
          </Link>
          <Link
            to="/payouts/invoices?status=approved"
            className="bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CreditCard className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">Pending Payment</p>
                <p className="text-sm text-green-600">Record payments for approved invoices</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-surface-200">
        <div className="flex flex-wrap gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
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
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-surface-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-surface-300" />
            <p>No invoices found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Invoice #</th>
                  {!isPartner && <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Partner</th>}
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Items</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-surface-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-primary-600">{invoice.invoice_number}</p>
                    </td>
                    {!isPartner && (
                      <td className="px-4 py-3">
                        <p className="font-medium text-surface-900">{invoice.partner_name}</p>
                        <p className="text-sm text-surface-500">{invoice.partner_email}</p>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="text-sm">{invoice.invoice_date}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{invoice.items?.length || 0} placements</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-green-600">
                        {formatCurrency(invoice.total_amount)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status]}`}>
                        {STATUS_LABELS[invoice.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/payouts/invoices/${invoice.id}`}
                          className="p-2 hover:bg-surface-100 rounded-lg"
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-surface-600" />
                        </Link>
                        {isAccounts && invoice.status === 'submitted' && (
                          <>
                            <button
                              onClick={() => openApproveModal(invoice)}
                              className="p-2 hover:bg-green-100 rounded-lg"
                              title="Approve"
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </button>
                            <button
                              onClick={() => openRejectModal(invoice)}
                              className="p-2 hover:bg-red-100 rounded-lg"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4 text-red-600" />
                            </button>
                          </>
                        )}
                        {isAccounts && invoice.status === 'approved' && (
                          <button
                            onClick={() => openPaymentModal(invoice)}
                            className="p-2 hover:bg-blue-100 rounded-lg"
                            title="Record Payment"
                          >
                            <CreditCard className="w-4 h-4 text-blue-600" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {showApproveModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Approve Invoice</h3>
            <p className="text-surface-600 mb-4">
              Are you sure you want to approve invoice <strong>{selectedInvoice.invoice_number}</strong> for{' '}
              <strong>{formatCurrency(selectedInvoice.total_amount)}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 border border-surface-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Reject Invoice</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Rejection Reason *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Provide reason for rejection..."
                className="w-full px-4 py-2 border border-surface-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-surface-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason || actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentData.payment_date}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, payment_date: e.target.value }))}
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Payment Method</label>
                <select
                  value={paymentData.payment_method}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, payment_method: e.target.value }))}
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Reference Number</label>
                <input
                  type="text"
                  value={paymentData.payment_reference}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, payment_reference: e.target.value }))}
                  placeholder="Transaction ID / Cheque No."
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Amount</label>
                <input
                  type="number"
                  value={paymentData.payment_amount}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, payment_amount: parseFloat(e.target.value) }))}
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Notes</label>
                <textarea
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 border border-surface-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={!paymentData.payment_reference || actionLoading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Invoices