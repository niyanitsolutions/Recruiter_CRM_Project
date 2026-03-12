import React, { useState, useEffect } from 'react'
import {
  Download,
  CreditCard,
  RefreshCw,
  FileText,
  Eye,
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
            <button className="p-2 text-surface-400 hover:text-success-600 hover:bg-success-50 rounded-lg transition-colors">
              <Download className="w-4 h-4" />
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
              <Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Payments