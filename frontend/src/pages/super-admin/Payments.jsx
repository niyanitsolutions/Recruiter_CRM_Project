import React, { useState, useEffect } from 'react'
import {
  Download,
  RefreshCw,
  Eye,
  Loader2,
} from 'lucide-react'
import { Button, Card, Table, Badge, Select, Modal } from '../../components/common'
import superAdminService from '../../services/superAdminService'
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'

const Payments = () => {
  const [payments, setPayments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)

  const limit = 10

  const fetchPayments = async () => {
    setIsLoading(true)
    try {
      const response = await superAdminService.getPayments({
        page: currentPage,
        limit,
        status: statusFilter || undefined,
      })
      setPayments(response.data.payments)
      setTotalCount(response.data.total)
    } catch (error) {
      toast.error('Failed to load payments')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPayments()
  }, [currentPage, statusFilter])

  const downloadInvoice = async (payment) => {
    if (downloadingId) return
    setDownloadingId(payment._id || payment.id)
    try {
      const companyName = (payment.company_name || 'Company').replace(/[^a-zA-Z0-9]/g, '_')
      const invoiceNo = payment.invoice_number || payment.transaction_id || 'INV'
      const payDate = formatDate(payment.payment_date || payment.created_at)
      const amount = formatCurrency(payment.total_amount)
      const taxAmount = formatCurrency(payment.tax_amount || 0)
      const baseAmount = formatCurrency(payment.amount || 0)
      const planName = (payment.plan_name || '').toUpperCase()
      const cycle = payment.billing_cycle || ''

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>Invoice ${invoiceNo}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#1a1a2e;padding:40px;background:#fff}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #4f46e5}
  .brand{font-size:24px;font-weight:700;color:#4f46e5}
  .brand-sub{font-size:12px;color:#6b7280;margin-top:2px}
  .inv-title{text-align:right}
  .inv-title h2{font-size:28px;font-weight:700;color:#1a1a2e;letter-spacing:-0.5px}
  .inv-title .inv-no{font-size:13px;color:#6b7280;margin-top:4px}
  .inv-title .status{display:inline-block;margin-top:8px;padding:3px 12px;background:#dcfce7;color:#16a34a;border-radius:20px;font-size:12px;font-weight:600}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
  .box{background:#f8fafc;padding:20px;border-radius:12px}
  .box-label{font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;margin-bottom:8px}
  .box-value{font-size:14px;color:#1a1a2e;font-weight:500;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  thead tr{background:#4f46e5;color:#fff}
  thead th{padding:12px 16px;text-align:left;font-size:13px;font-weight:600}
  tbody tr{border-bottom:1px solid #f1f5f9}
  tbody td{padding:12px 16px;font-size:14px;color:#374151}
  .total-row{background:#fafafa}
  .total-row td{font-weight:600;font-size:15px;color:#1a1a2e}
  .footer{text-align:center;font-size:12px;color:#9ca3af;margin-top:40px;padding-top:20px;border-top:1px solid #f1f5f9}
  @media print{body{padding:20px}}
</style></head><body>
<div class="header">
  <div><div class="brand">Niyan HireFlow</div><div class="brand-sub">Smart Recruitment &amp; Talent Platform</div></div>
  <div class="inv-title">
    <h2>INVOICE</h2>
    <div class="inv-no">${invoiceNo}</div>
    <div class="status">PAID</div>
  </div>
</div>
<div class="grid">
  <div class="box"><div class="box-label">Billed To</div><div class="box-value"><strong>${payment.company_name || '—'}</strong><br/>${payment.company_id || ''}</div></div>
  <div class="box"><div class="box-label">Invoice Details</div><div class="box-value">Date: ${payDate}<br/>Plan: ${planName} (${cycle})</div></div>
</div>
<table>
  <thead><tr><th>Description</th><th>Amount</th></tr></thead>
  <tbody>
    <tr><td>${planName} Plan — ${cycle} subscription</td><td>${baseAmount}</td></tr>
    <tr><td>GST (18%)</td><td>${taxAmount}</td></tr>
    <tr class="total-row"><td><strong>Total Amount</strong></td><td><strong>${amount}</strong></td></tr>
  </tbody>
</table>
<div class="footer">Thank you for your business · Niyan HireFlow · support@niyanhireflow.com</div>
</body></html>`

      const printWin = window.open('', '_blank', 'width=900,height=700,menubar=no,toolbar=no')
      if (!printWin) {
        toast.error('Pop-up blocked — please allow pop-ups and try again')
        return
      }
      printWin.document.write(html)
      printWin.document.close()
      printWin.onload = () => {
        printWin.focus()
        printWin.print()
      }
      toast.success('Invoice opened — use Print → Save as PDF')
    } catch {
      toast.error('Failed to download invoice')
    } finally {
      setDownloadingId(null)
    }
  }

  const getStatusVariant = (status) => {
    switch (status) {
      case 'completed': return 'success'
      case 'pending': return 'warning'
      case 'failed': return 'danger'
      case 'refunded': return 'info'
      default: return 'neutral'
    }
  }

  const columns = [
    {
      header: 'Transaction ID',
      render: (row) => (
        <div>
          <p className="font-mono text-sm text-surface-900">{row.transaction_id}</p>
          <p className="text-xs text-surface-500">{row.invoice_number}</p>
        </div>
      ),
    },
    {
      header: 'Company',
      render: (row) => (
        <div>
          <p className="font-medium text-surface-900">{row.company_name}</p>
          <p className="text-xs text-surface-500">{row.company_id}</p>
        </div>
      ),
    },
    {
      header: 'Plan',
      render: (row) => (
        <div>
          <Badge variant="info">{row.plan_name?.toUpperCase()}</Badge>
          <p className="text-xs text-surface-500 mt-1 capitalize">{row.billing_cycle}</p>
        </div>
      ),
    },
    {
      header: 'Amount',
      render: (row) => (
        <div>
          <p className="font-semibold text-surface-900">{formatCurrency(row.total_amount)}</p>
          <p className="text-xs text-surface-500">
            {formatCurrency(row.amount)} + {formatCurrency(row.tax_amount)} GST
          </p>
        </div>
      ),
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={getStatusVariant(row.status)} dot>
          {row.status?.charAt(0).toUpperCase() + row.status?.slice(1)}
        </Badge>
      ),
    },
    {
      header: 'Date',
      render: (row) => (
        <div>
          <p className="text-surface-900">{formatDate(row.payment_date || row.created_at)}</p>
        </div>
      ),
    },
    {
      header: 'Actions',
      width: '100px',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedPayment(row)
              setIsViewModalOpen(true)
            }}
            className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
          {row.status === 'completed' && (
            <button
              onClick={() => downloadInvoice(row)}
              disabled={!!downloadingId}
              className="p-2 text-surface-400 hover:text-success-600 hover:bg-success-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Print / Save Invoice as PDF"
            >
              {downloadingId === (row._id || row.id)
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
            </button>
          )}
        </div>
      ),
    },
  ]

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Payments</h1>
          <p className="text-surface-500">View all payment transactions</p>
        </div>
        <Button variant="secondary" onClick={fetchPayments} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-surface-200">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            className="w-48"
          />
        </div>

        <Table columns={columns} data={payments} isLoading={isLoading} emptyMessage="No payments found" />

        {totalCount > limit && (
          <Table.Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(totalCount / limit)}
            totalItems={totalCount}
            itemsPerPage={limit}
            onPageChange={setCurrentPage}
          />
        )}
      </Card>

      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Payment Details" size="md">
        {selectedPayment && (
          <div className="space-y-6">
            <div className="text-center p-6 bg-surface-50 rounded-xl">
              <Badge variant={getStatusVariant(selectedPayment.status)} className="mb-3">
                {selectedPayment.status?.toUpperCase()}
              </Badge>
              <p className="text-3xl font-bold text-surface-900">{formatCurrency(selectedPayment.total_amount)}</p>
              <p className="text-surface-500 text-sm mt-1">{selectedPayment.plan_name} - {selectedPayment.billing_cycle}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-surface-500">Transaction ID</p><p className="font-mono text-sm">{selectedPayment.transaction_id}</p></div>
              <div><p className="text-xs text-surface-500">Invoice</p><p className="font-mono text-sm">{selectedPayment.invoice_number}</p></div>
              <div><p className="text-xs text-surface-500">Company</p><p>{selectedPayment.company_name}</p></div>
              <div><p className="text-xs text-surface-500">Date</p><p>{formatDateTime(selectedPayment.created_at)}</p></div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
              {selectedPayment.status === 'completed' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => downloadInvoice(selectedPayment)}
                  disabled={!!downloadingId}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Print / Save PDF
                </Button>
              )}
              <Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Payments