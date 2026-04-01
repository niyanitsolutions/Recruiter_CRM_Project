import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, FileText, CheckCircle, DollarSign, Calendar
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { payoutService } from '../../services'

const RaiseInvoice = () => {
  const navigate = useNavigate()
  const [eligiblePayouts, setEligiblePayouts] = useState([])
  const [selectedPayouts, setSelectedPayouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchEligiblePayouts()
  }, [])

  const fetchEligiblePayouts = async () => {
    try {
      setLoading(true)
      const data = await payoutService.getEligiblePayouts()
      setEligiblePayouts(data || [])
    } catch (error) {
      console.error('Error fetching eligible payouts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPayout = (payoutId) => {
    setSelectedPayouts(prev => {
      if (prev.includes(payoutId)) {
        return prev.filter(id => id !== payoutId)
      }
      return [...prev, payoutId]
    })
  }

  const handleSelectAll = () => {
    if (selectedPayouts.length === eligiblePayouts.length) {
      setSelectedPayouts([])
    } else {
      setSelectedPayouts(eligiblePayouts.map(p => p.id))
    }
  }

  const calculateTotals = () => {
    const selected = eligiblePayouts.filter(p => selectedPayouts.includes(p.id))
    const subtotal = selected.reduce((sum, p) => sum + (p.calculation?.gross_amount || 0), 0)
    const gst = selected.reduce((sum, p) => sum + (p.calculation?.gst_amount || 0), 0)
    const tds = selected.reduce((sum, p) => sum + (p.calculation?.tds_amount || 0), 0)
    const total = selected.reduce((sum, p) => sum + (p.calculation?.net_amount || 0), 0)
    return { subtotal, gst, tds, total }
  }

  const handleSubmit = async () => {
    if (selectedPayouts.length === 0) {
      toast.error('Please select at least one payout')
      return
    }

    try {
      setSubmitting(true)
      await payoutService.raiseInvoice({
        payout_ids: selectedPayouts,
        invoice_date: invoiceDate,
        notes
      })
      navigate('/payouts/invoices')
    } catch (error) {
      console.error('Error raising invoice:', error)
      toast.error(error.response?.data?.detail || error.response?.data?.message || 'Error raising invoice')
    } finally {
      setSubmitting(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const totals = calculateTotals()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/payouts')}
          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Raise Invoice</h1>
          <p className="text-surface-600">Select eligible payouts to create invoice</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">Loading eligible payouts...</div>
      ) : eligiblePayouts.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-surface-200 text-center">
          <DollarSign className="w-12 h-12 mx-auto mb-4 text-surface-300" />
          <p className="text-surface-600">No eligible payouts available for invoicing</p>
          <p className="text-sm text-surface-500 mt-2">
            Payouts become eligible after completing the required payout days
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Payouts List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
              <div className="p-4 border-b border-surface-200 flex items-center justify-between">
                <h2 className="font-semibold text-surface-900">Eligible Payouts</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPayouts.length === eligiblePayouts.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm">Select All</span>
                </label>
              </div>
              <div className="divide-y divide-surface-200">
                {eligiblePayouts.map((payout) => (
                  <div
                    key={payout.id}
                    className={`p-4 cursor-pointer transition-colors ${
                      selectedPayouts.includes(payout.id) ? 'bg-primary-50' : 'hover:bg-surface-50'
                    }`}
                    onClick={() => handleSelectPayout(payout.id)}
                  >
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={selectedPayouts.includes(payout.id)}
                        onChange={() => handleSelectPayout(payout.id)}
                        className="w-4 h-4 mt-1 text-primary-600 rounded"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-surface-900">{payout.candidate_name}</p>
                            <p className="text-sm text-surface-500">{payout.job_title} at {payout.client_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600">
                              {formatCurrency(payout.calculation?.net_amount || 0)}
                            </p>
                            <p className="text-xs text-surface-500">Net Payable</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-sm text-surface-500">
                          <span>CTC: {formatCurrency(payout.candidate_ctc)}</span>
                          <span>Joined: {payout.joined_date}</span>
                          <span>Commission: {payout.commission_rule?.percentage}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-surface-200 sticky top-6">
              <h2 className="font-semibold text-surface-900 mb-4">Invoice Summary</h2>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>

              <div className="space-y-3 py-4 border-t border-surface-200">
                <div className="flex justify-between text-sm">
                  <span className="text-surface-600">Selected Items</span>
                  <span className="font-medium">{selectedPayouts.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-600">GST (18%)</span>
                  <span className="font-medium text-surface-600">+ {formatCurrency(totals.gst)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-600">TDS (10%)</span>
                  <span className="font-medium text-red-600">- {formatCurrency(totals.tds)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-surface-200">
                  <span className="font-semibold text-surface-900">Total Payable</span>
                  <span className="font-bold text-xl text-green-600">{formatCurrency(totals.total)}</span>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-surface-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any notes for this invoice..."
                  className="w-full px-4 py-2 border border-surface-300 rounded-lg"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={selectedPayouts.length === 0 || submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FileText className="w-5 h-5" />
                {submitting ? 'Submitting...' : 'Raise Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RaiseInvoice