import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Filter, Building2, MoreVertical, Eye, Edit, Ban, Trash2,
  CheckCircle, XCircle, RefreshCw, Plus, CreditCard, UserPlus, Download,
} from 'lucide-react'
import { Button, Card, Table, Badge, StatusBadge, Input, Select, Modal } from '../../components/common'
import superAdminService from '../../services/superAdminService'
import { formatDate, formatRelativeTime } from '../../utils/format'
import toast from 'react-hot-toast'
import ExportModal from '../../components/common/ExportModal'

// ── Create Tenant Modal ───────────────────────────────────────────────────────

const emptyBase = {
  company_name: '', owner_name: '', owner_email: '', owner_password: '',
  plan_id: '', user_seats: 3, plan_duration_days: 30,
  industry: 'other', phone: '0000000000', city: 'NA', state: 'NA',
  zip_code: '000000', seller_id: '', send_welcome_email: true,
}

const CreateTenantModal = ({ isOpen, onClose, onCreated }) => {
  const [mode, setMode] = useState('free')   // 'free' | 'paid'
  const [form, setForm] = useState({ ...emptyBase, amount_paid: '', payment_mode: 'upi', payment_date: '', payment_reference: '' })
  const [errors, setErrors] = useState({})
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      superAdminService.getPlans().then(r => setPlans(r.data.plans || [])).catch(() => {})
    }
  }, [isOpen])

  const f = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(prev => ({ ...prev, [key]: val }))
  }

  const validate = () => {
    const e = {}
    if (!form.company_name.trim()) e.company_name = 'Required'
    if (!form.owner_name.trim())   e.owner_name   = 'Required'
    if (!form.owner_email.trim())  e.owner_email  = 'Required'
    if (!form.owner_password || form.owner_password.length < 8) e.owner_password = 'Min 8 characters'
    if (!form.plan_id)             e.plan_id      = 'Required'
    if (mode === 'paid') {
      if (!form.amount_paid && form.amount_paid !== 0) e.amount_paid = 'Required'
      if (!form.payment_mode)   e.payment_mode  = 'Required'
      if (!form.payment_date)   e.payment_date  = 'Required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const payload = {
        company_name: form.company_name,
        owner_name: form.owner_name,
        owner_email: form.owner_email,
        owner_password: form.owner_password,
        plan_id: form.plan_id,
        user_seats: Number(form.user_seats),
        plan_duration_days: Number(form.plan_duration_days),
        industry: form.industry,
        phone: form.phone || '0000000000',
        city: form.city || 'NA',
        state: form.state || 'NA',
        zip_code: form.zip_code || '000000',
        seller_id: form.seller_id || null,
        send_welcome_email: form.send_welcome_email,
      }

      if (mode === 'paid') {
        payload.amount_paid     = parseFloat(form.amount_paid)
        payload.payment_mode    = form.payment_mode
        payload.payment_date    = new Date(form.payment_date).toISOString()
        payload.payment_reference = form.payment_reference || null
        await superAdminService.createTenantWithPayment(payload)
        toast.success('Tenant created with payment recorded')
      } else {
        await superAdminService.createTenant(payload)
        toast.success('Tenant created successfully')
      }

      setForm({ ...emptyBase, amount_paid: '', payment_mode: 'upi', payment_date: '', payment_reference: '' })
      setErrors({})
      onClose()
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create tenant')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setForm({ ...emptyBase, amount_paid: '', payment_mode: 'upi', payment_date: '', payment_reference: '' })
    setErrors({})
    setMode('free')
    onClose()
  }

  const planOptions = [
    { value: '', label: 'Select Plan' },
    ...plans.map(p => ({ value: p.id, label: p.display_name })),
  ]

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Tenant" size="xl">
      <div className="space-y-5">

        {/* Mode tabs */}
        <div className="flex gap-2 p-1 bg-surface-100 rounded-xl">
          <button
            onClick={() => setMode('free')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              mode === 'free' ? 'bg-white shadow text-accent-700' : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Without Payment
          </button>
          <button
            onClick={() => setMode('paid')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              mode === 'paid' ? 'bg-white shadow text-accent-700' : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            With Manual Payment
          </button>
        </div>

        {/* Mode description */}
        {mode === 'free' ? (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            <strong>Mode A — Without Payment:</strong> Creates account immediately. Useful for demo accounts, manual onboarding, and partner accounts. <code>payment_status = manual_by_admin</code>
          </div>
        ) : (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            <strong>Mode B — With Manual Payment:</strong> Records an offline payment (UPI / Bank Transfer / Cash). Plan start date = payment date. Seller commission calculated automatically.
          </div>
        )}

        {/* Company Info */}
        <div>
          <p className="text-xs font-semibold text-surface-500 uppercase mb-3">Company Information</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Company Name *</label>
              <input className={`input ${errors.company_name ? 'border-danger-500' : ''}`}
                value={form.company_name} onChange={f('company_name')} placeholder="Acme Corp" />
              {errors.company_name && <p className="form-error">{errors.company_name}</p>}
            </div>
          </div>
        </div>

        {/* Owner Info */}
        <div>
          <p className="text-xs font-semibold text-surface-500 uppercase mb-3">Owner / Admin</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Full Name *</label>
              <input className={`input ${errors.owner_name ? 'border-danger-500' : ''}`}
                value={form.owner_name} onChange={f('owner_name')} />
              {errors.owner_name && <p className="form-error">{errors.owner_name}</p>}
            </div>
            <div>
              <label className="form-label">Email *</label>
              <input type="email" className={`input ${errors.owner_email ? 'border-danger-500' : ''}`}
                value={form.owner_email} onChange={f('owner_email')} />
              {errors.owner_email && <p className="form-error">{errors.owner_email}</p>}
            </div>
            <div>
              <label className="form-label">Password *</label>
              <input type="password" className={`input ${errors.owner_password ? 'border-danger-500' : ''}`}
                value={form.owner_password} onChange={f('owner_password')} placeholder="Min 8 characters" />
              {errors.owner_password && <p className="form-error">{errors.owner_password}</p>}
            </div>
          </div>
        </div>

        {/* Plan & Seats */}
        <div>
          <p className="text-xs font-semibold text-surface-500 uppercase mb-3">Plan & Subscription</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Plan *</label>
              <select className={`input ${errors.plan_id ? 'border-danger-500' : ''}`}
                value={form.plan_id} onChange={f('plan_id')}>
                {planOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors.plan_id && <p className="form-error">{errors.plan_id}</p>}
            </div>
            <div>
              <label className="form-label">User Seats</label>
              <input type="number" min="1" className="input" value={form.user_seats} onChange={f('user_seats')} />
            </div>
            <div>
              <label className="form-label">Duration (days)</label>
              <input type="number" min="1" className="input" value={form.plan_duration_days} onChange={f('plan_duration_days')} />
            </div>
          </div>
        </div>

        {/* Payment fields (Mode B only) */}
        {mode === 'paid' && (
          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase mb-3">Payment Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Amount Paid (₹) *</label>
                <input type="number" min="0" step="0.01" className={`input ${errors.amount_paid ? 'border-danger-500' : ''}`}
                  value={form.amount_paid} onChange={f('amount_paid')} placeholder="e.g. 5000" />
                {errors.amount_paid && <p className="form-error">{errors.amount_paid}</p>}
              </div>
              <div>
                <label className="form-label">Payment Mode *</label>
                <select className={`input ${errors.payment_mode ? 'border-danger-500' : ''}`}
                  value={form.payment_mode} onChange={f('payment_mode')}>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                </select>
                {errors.payment_mode && <p className="form-error">{errors.payment_mode}</p>}
              </div>
              <div>
                <label className="form-label">Payment Date *</label>
                <input type="date" className={`input ${errors.payment_date ? 'border-danger-500' : ''}`}
                  value={form.payment_date} onChange={f('payment_date')} />
                {errors.payment_date && <p className="form-error">{errors.payment_date}</p>}
              </div>
              <div>
                <label className="form-label">Reference / UTR</label>
                <input className="input" value={form.payment_reference} onChange={f('payment_reference')}
                  placeholder="UTR / Transaction ID (optional)" />
              </div>
            </div>
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="welcome_email" checked={form.send_welcome_email} onChange={f('send_welcome_email')} className="rounded" />
          <label htmlFor="welcome_email" className="text-sm text-surface-700">Send welcome email with login credentials</label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={loading} leftIcon={<Plus className="w-4 h-4" />}>
            {mode === 'paid' ? 'Create & Record Payment' : 'Create Tenant'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Tenants Page ─────────────────────────────────────────────────────────

const Tenants = () => {
  const [searchParams] = useSearchParams()
  const [tenants, setTenants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const limit = 10

  const fetchTenants = async () => {
    setIsLoading(true)
    try {
      const response = await superAdminService.getTenants({
        page: currentPage, limit,
        search: search || undefined,
        status: statusFilter || undefined,
      })
      setTenants(response.data.tenants)
      setTotalCount(response.data.total)
    } catch {
      toast.error('Failed to load tenants')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchTenants() }, [currentPage, statusFilter])

  const handleSearch = (e) => {
    e.preventDefault()
    setCurrentPage(1)
    fetchTenants()
  }

  const handleStatusChange = async (tenantId, newStatus) => {
    setIsActionLoading(true)
    try {
      await superAdminService.updateTenantStatus(tenantId, newStatus)
      toast.success(`Tenant ${newStatus} successfully`)
      fetchTenants()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleDelete = async (tenantId) => {
    if (!window.confirm('Are you sure you want to delete this tenant?')) return
    setIsActionLoading(true)
    try {
      await superAdminService.deleteTenant(tenantId)
      toast.success('Tenant deleted successfully')
      fetchTenants()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete tenant')
    } finally {
      setIsActionLoading(false)
    }
  }

  const columns = [
    {
      header: 'Company',
      accessor: 'company_name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-semibold">
            {row.company_name?.charAt(0) || 'C'}
          </div>
          <div>
            <p className="font-medium text-surface-900">{row.company_name}</p>
            <p className="text-xs text-surface-500">{row.company_id}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Owner',
      render: (row) => (
        <div>
          <p className="text-surface-900">{row.owner?.full_name}</p>
          <p className="text-xs text-surface-500">{row.owner?.email}</p>
          {row.email_verified === false && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 mt-0.5">
              <XCircle className="w-3 h-3" /> Email unverified
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Plan',
      render: (row) => (
        <div>
          <Badge variant={row.is_trial ? 'warning' : 'info'}>
            {row.plan_name?.toUpperCase() || 'N/A'}
          </Badge>
          <p className="text-xs text-surface-500 mt-1">
            {row.payment_status === 'manual_by_admin'
              ? 'Manual (Admin)'
              : row.payment_status === 'paid'
                ? 'Paid'
                : row.is_trial ? 'Trial' : 'Active'}
          </p>
        </div>
      ),
    },
    {
      header: 'Seats',
      render: (row) => (
        <p className="text-sm font-medium text-surface-700">{row.max_users || '—'}</p>
      ),
    },
    {
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Plan Expiry',
      render: (row) => (
        <div>
          <p className="text-surface-900">{formatDate(row.plan_expiry)}</p>
          <p className="text-xs text-surface-500">{formatRelativeTime(row.plan_expiry)}</p>
        </div>
      ),
    },
    {
      header: 'Actions',
      width: '100px',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSelectedTenant(row); setIsViewModalOpen(true) }}
            className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>

          {row.status === 'active' ? (
            <button onClick={() => handleStatusChange(row._id, 'suspended')} disabled={isActionLoading}
              className="p-2 text-surface-400 hover:text-warning-600 hover:bg-warning-50 rounded-lg transition-colors" title="Suspend">
              <Ban className="w-4 h-4" />
            </button>
          ) : row.status === 'suspended' ? (
            <button onClick={() => handleStatusChange(row._id, 'active')} disabled={isActionLoading}
              className="p-2 text-surface-400 hover:text-success-600 hover:bg-success-50 rounded-lg transition-colors" title="Activate">
              <CheckCircle className="w-4 h-4" />
            </button>
          ) : null}

          <button onClick={() => handleDelete(row._id)} disabled={isActionLoading}
            className="p-2 text-surface-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'trial_expired', label: 'Trial Expired' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Tenants</h1>
          <p className="text-surface-500">Manage all registered companies</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={fetchTenants} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button variant="secondary" onClick={() => setExportOpen(true)} leftIcon={<Download className="w-4 h-4" />}>
            Export
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Create Tenant
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card padding={false}>
        <div className="p-4 border-b border-surface-200">
          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search by company name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </form>
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
              className="w-full md:w-48"
            />
          </div>
        </div>

        <Table columns={columns} data={tenants} isLoading={isLoading} emptyMessage="No tenants found" />

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

      {/* View Tenant Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Tenant Details" size="lg">
        {selectedTenant && (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-surface-500 uppercase mb-3">Company Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-surface-500">Company Name</p><p className="font-medium">{selectedTenant.company_name}</p></div>
                <div><p className="text-xs text-surface-500">Company ID</p><p className="font-mono text-sm">{selectedTenant.company_id}</p></div>
                <div><p className="text-xs text-surface-500">Industry</p><p className="capitalize">{selectedTenant.industry}</p></div>
                <div><p className="text-xs text-surface-500">Phone</p><p>{selectedTenant.phone}</p></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-surface-500 uppercase mb-3">Owner Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-surface-500">Name</p><p className="font-medium">{selectedTenant.owner?.full_name}</p></div>
                <div><p className="text-xs text-surface-500">Email</p>
                  <p className="flex items-center gap-1">
                    {selectedTenant.owner?.email}
                    {selectedTenant.email_verified === false
                      ? <span className="text-xs text-amber-600 ml-1">(unverified)</span>
                      : <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-1" />}
                  </p>
                </div>
                <div><p className="text-xs text-surface-500">Username</p><p>@{selectedTenant.owner?.username}</p></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-surface-500 uppercase mb-3">Subscription</h4>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-surface-500">Plan</p>
                  <Badge variant={selectedTenant.is_trial ? 'warning' : 'success'}>
                    {selectedTenant.plan_name?.toUpperCase()}
                  </Badge>
                </div>
                <div><p className="text-xs text-surface-500">Status</p><StatusBadge status={selectedTenant.status} /></div>
                <div><p className="text-xs text-surface-500">User Seats</p><p className="font-medium">{selectedTenant.max_users || '—'}</p></div>
                <div><p className="text-xs text-surface-500">Payment Status</p>
                  <p className="capitalize">{selectedTenant.payment_status || '—'}</p>
                </div>
                <div><p className="text-xs text-surface-500">Start Date</p><p>{formatDate(selectedTenant.plan_start_date)}</p></div>
                <div><p className="text-xs text-surface-500">Expiry Date</p><p>{formatDate(selectedTenant.plan_expiry)}</p></div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
              <Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button>
              {selectedTenant.status === 'active' && (
                <Button variant="danger" onClick={() => { handleStatusChange(selectedTenant._id, 'suspended'); setIsViewModalOpen(false) }}>
                  Suspend Tenant
                </Button>
              )}
              {selectedTenant.status === 'suspended' && (
                <Button onClick={() => { handleStatusChange(selectedTenant._id, 'active'); setIsViewModalOpen(false) }}>
                  Activate Tenant
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create Tenant Modal */}
      <CreateTenantModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={fetchTenants}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Tenants"
        apiPath="/export/tenants"
        extraFilters={({ status, setStatus }) => (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input w-full">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
              <option value="trial_expired">Trial Expired</option>
            </select>
          </div>
        )}
      />
    </div>
  )
}

export default Tenants
