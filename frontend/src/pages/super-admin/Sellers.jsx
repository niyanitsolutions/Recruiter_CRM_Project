import React, { useState, useEffect } from 'react'
import { Search, Plus, Ban, CheckCircle, Trash2, Eye, RefreshCw, Percent } from 'lucide-react'
import { Button, Card, Table, StatusBadge, Select, Modal, Badge } from '../../components/common'
import sellerService from '../../services/sellerService'
import { formatDate, formatRelativeTime } from '../../utils/format'
import toast from 'react-hot-toast'

const emptyForm = {
  seller_name: '', company_name: '', email: '', phone: '',
  address: '', username: '', password: '',
  margin_percentage: '',   // empty = use platform default
}

// Defined OUTSIDE to prevent focus-loss on re-render
const SellerFormFields = ({ form, setForm, formErrors, isEdit }) => {
  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="form-label">Seller Name *</label>
        <input className={`input ${formErrors.seller_name ? 'border-danger-500' : ''}`}
          value={form.seller_name} onChange={f('seller_name')} />
        {formErrors.seller_name && <p className="form-error">{formErrors.seller_name}</p>}
      </div>
      <div>
        <label className="form-label">Company Name *</label>
        <input className={`input ${formErrors.company_name ? 'border-danger-500' : ''}`}
          value={form.company_name} onChange={f('company_name')} />
        {formErrors.company_name && <p className="form-error">{formErrors.company_name}</p>}
      </div>
      <div>
        <label className="form-label">Email *</label>
        <input type="email" className={`input ${formErrors.email ? 'border-danger-500' : ''}`}
          value={form.email} onChange={f('email')} />
        {formErrors.email && <p className="form-error">{formErrors.email}</p>}
      </div>
      <div>
        <label className="form-label">Phone *</label>
        <input className={`input ${formErrors.phone ? 'border-danger-500' : ''}`}
          value={form.phone} onChange={f('phone')} />
        {formErrors.phone && <p className="form-error">{formErrors.phone}</p>}
      </div>
      <div className="col-span-2">
        <label className="form-label">Address</label>
        <input className="input" value={form.address} onChange={f('address')} />
      </div>
      {!isEdit && (
        <>
          <div>
            <label className="form-label">Username *</label>
            <input className={`input ${formErrors.username ? 'border-danger-500' : ''}`}
              value={form.username} onChange={f('username')} />
            {formErrors.username && <p className="form-error">{formErrors.username}</p>}
          </div>
          <div>
            <label className="form-label">Password *</label>
            <input type="password" className={`input ${formErrors.password ? 'border-danger-500' : ''}`}
              value={form.password} onChange={f('password')} />
            {formErrors.password && <p className="form-error">{formErrors.password}</p>}
          </div>
        </>
      )}
      {/* Commission Margin */}
      <div>
        <label className="form-label flex items-center gap-1">
          <Percent className="w-3.5 h-3.5" />
          Commission Margin (%)
        </label>
        <input
          type="number" min="0" max="100" step="0.1"
          className="input"
          value={form.margin_percentage}
          onChange={f('margin_percentage')}
          placeholder="Leave blank for platform default (20%)"
        />
        <p className="text-xs text-surface-400 mt-1">
          Commission = Plan Price × Margin. Leave blank to use platform default.
        </p>
      </div>
    </div>
  )
}

const Sellers = () => {
  const [sellers, setSellers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isActionLoading, setIsActionLoading] = useState(false)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})

  const limit = 10

  const fetchSellers = async () => {
    setIsLoading(true)
    try {
      const res = await sellerService.getSellers({
        page: currentPage, limit,
        search: search || undefined,
        status: statusFilter || undefined,
      })
      setSellers(res.data.sellers || [])
      setTotalCount(res.data.total || 0)
    } catch {
      toast.error('Failed to load sellers')
      setSellers([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchSellers() }, [currentPage, statusFilter])

  const handleSearch = (e) => {
    e.preventDefault()
    setCurrentPage(1)
    fetchSellers()
  }

  const buildPayload = (isCreate) => {
    const payload = {
      seller_name: form.seller_name,
      company_name: form.company_name,
      email: form.email,
      phone: form.phone,
      address: form.address,
      // Parse margin — null means use platform default
      margin_percentage: form.margin_percentage !== '' && form.margin_percentage !== null
        ? parseFloat(form.margin_percentage)
        : null,
    }
    if (isCreate) {
      payload.username = form.username
      payload.password = form.password
    }
    return payload
  }

  const handleCreate = async () => {
    const errors = {}
    if (!form.seller_name) errors.seller_name = 'Required'
    if (!form.company_name) errors.company_name = 'Required'
    if (!form.email) errors.email = 'Required'
    if (!form.phone) errors.phone = 'Required'
    if (!form.username) errors.username = 'Required'
    if (!form.password) errors.password = 'Required'
    if (Object.keys(errors).length) { setFormErrors(errors); return }

    setIsActionLoading(true)
    try {
      await sellerService.createSeller(buildPayload(true))
      toast.success('Seller created successfully')
      setIsCreateOpen(false)
      setForm(emptyForm)
      setFormErrors({})
      fetchSellers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create seller')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleEdit = async () => {
    setIsActionLoading(true)
    try {
      await sellerService.updateSeller(selected._id || selected.id, buildPayload(false))
      toast.success('Seller updated')
      setIsEditOpen(false)
      fetchSellers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update seller')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleToggleStatus = async (seller) => {
    const newStatus = seller.status === 'active' ? 'suspended' : 'active'
    setIsActionLoading(true)
    try {
      await sellerService.updateSeller(seller._id || seller.id, { status: newStatus })
      toast.success(`Seller ${newStatus}`)
      fetchSellers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update status')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this seller? This cannot be undone.')) return
    setIsActionLoading(true)
    try {
      await sellerService.deleteSeller(id)
      toast.success('Seller deleted')
      fetchSellers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete seller')
    } finally {
      setIsActionLoading(false)
    }
  }

  const openEdit = (seller) => {
    setSelected(seller)
    setForm({
      seller_name: seller.seller_name || '',
      company_name: seller.company_name || '',
      email: seller.email || '',
      phone: seller.phone || '',
      address: seller.address || '',
      username: seller.username || '',
      password: '',
      margin_percentage: seller.margin_percentage !== null && seller.margin_percentage !== undefined
        ? String(seller.margin_percentage)
        : '',
    })
    setIsEditOpen(true)
  }

  const closeCreate = () => { setIsCreateOpen(false); setFormErrors({}) }
  const closeEdit   = () => { setIsEditOpen(false);   setFormErrors({}) }

  const columns = [
    {
      header: 'Seller',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-semibold">
            {row.seller_name?.charAt(0) || 'S'}
          </div>
          <div>
            <p className="font-medium text-surface-900">{row.seller_name}</p>
            <p className="text-xs text-surface-500">{row.company_name}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Contact',
      render: (row) => (
        <div>
          <p className="text-surface-900">{row.email}</p>
          <p className="text-xs text-surface-500">{row.phone}</p>
        </div>
      ),
    },
    {
      header: 'Margin',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Percent className="w-3.5 h-3.5 text-surface-400" />
          <span className="font-semibold text-surface-900">
            {row.margin_percentage !== null && row.margin_percentage !== undefined
              ? `${row.margin_percentage}%`
              : <span className="text-surface-400 font-normal">Default</span>}
          </span>
        </div>
      ),
    },
    {
      header: 'Tenants',
      render: (row) => (
        <div className="text-center">
          <p className="font-semibold text-surface-900">{row.total_tenants || 0}</p>
          <p className="text-xs text-success-600">{row.active_tenants || 0} active</p>
        </div>
      ),
    },
    { header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      header: 'Created',
      render: (row) => <p className="text-sm text-surface-500">{formatDate(row.created_at)}</p>,
    },
    {
      header: 'Actions',
      render: (row) => {
        const id = row._id || row.id
        return (
          <div className="flex items-center gap-2">
            <button onClick={() => { setSelected(row); setIsViewOpen(true) }}
              className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors" title="View">
              <Eye className="w-4 h-4" />
            </button>
            <button onClick={() => openEdit(row)}
              className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors" title="Edit">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => handleToggleStatus(row)} disabled={isActionLoading}
              className={`p-2 rounded-lg transition-colors ${row.status === 'active' ? 'text-surface-400 hover:text-warning-600 hover:bg-warning-50' : 'text-surface-400 hover:text-success-600 hover:bg-success-50'}`}
              title={row.status === 'active' ? 'Suspend' : 'Activate'}>
              {row.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            </button>
            <button onClick={() => handleDelete(id)} disabled={isActionLoading}
              className="p-2 text-surface-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Sellers</h1>
          <p className="text-surface-500">Manage reseller / partner accounts and commission margins</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={fetchSellers} leftIcon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>
          <Button onClick={() => { setForm(emptyForm); setFormErrors({}); setIsCreateOpen(true) }} leftIcon={<Plus className="w-4 h-4" />}>Add Seller</Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-surface-200">
          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input type="text" placeholder="Search by name, company or email..."
                  value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-10" />
              </div>
            </form>
            <Select
              options={[{ value: '', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
              className="w-full md:w-48"
            />
          </div>
        </div>

        <Table columns={columns} data={sellers} isLoading={isLoading} emptyMessage="No sellers found" />

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

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={closeCreate} title="Add Seller" size="lg">
        <div className="space-y-4">
          <SellerFormFields form={form} setForm={setForm} formErrors={formErrors} isEdit={false} />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
            <Button variant="secondary" onClick={closeCreate}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={isActionLoading}>Create Seller</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={closeEdit} title="Edit Seller" size="lg">
        <div className="space-y-4">
          <SellerFormFields form={form} setForm={setForm} formErrors={formErrors} isEdit={true} />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
            <Button variant="secondary" onClick={closeEdit}>Cancel</Button>
            <Button onClick={handleEdit} isLoading={isActionLoading}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} title="Seller Details" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Seller Name', selected.seller_name],
                ['Company', selected.company_name],
                ['Email', selected.email],
                ['Phone', selected.phone],
                ['Username', selected.username],
                ['Address', selected.address || '—'],
                ['Total Tenants', selected.total_tenants ?? 0],
                ['Active Tenants', selected.active_tenants ?? 0],
                ['Created', formatDate(selected.created_at)],
                ['Last Login', selected.last_login ? formatRelativeTime(selected.last_login) : 'Never'],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-xs text-surface-500">{label}</p>
                  <p className="font-medium text-surface-900">{val}</p>
                </div>
              ))}
              <div>
                <p className="text-xs text-surface-500">Commission Margin</p>
                <p className="font-medium text-surface-900 flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5 text-surface-400" />
                  {selected.margin_percentage !== null && selected.margin_percentage !== undefined
                    ? `${selected.margin_percentage}%`
                    : 'Platform Default (20%)'}
                </p>
              </div>
              <div>
                <p className="text-xs text-surface-500">Status</p>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            {/* Subscription Info */}
            <div className="bg-surface-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-surface-500 uppercase">Subscription</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-surface-500">Plan:</span> <strong>{selected.plan_display_name || selected.plan_name}</strong></div>
                <div><span className="text-surface-500">Seats:</span> <strong>{selected.total_user_seats}</strong></div>
                <div><span className="text-surface-500">Expiry:</span> {formatDate(selected.plan_expiry_date)}</div>
                <div><span className="text-surface-500">Trial:</span> {selected.is_trial ? 'Yes' : 'No'}</div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-surface-200">
              <Button variant="secondary" onClick={() => setIsViewOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Sellers
