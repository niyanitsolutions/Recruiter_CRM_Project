import React, { useState, useEffect } from 'react'
import { Plus, RefreshCw, Tag } from 'lucide-react'
import { Button, Card, Table, Badge, Modal } from '../../components/common'
import discountService from '../../services/discountService'
import planService from '../../services/planService'
import { formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

const emptyForm = {
  name: '',
  code: '',
  type: 'percentage',
  value: '',
  applicable_plans: [],
  usage_limit: '',
  valid_from: '',
  valid_until: '',
}

// ─── Form — defined OUTSIDE parent to preserve focus across re-renders ─────────
const DiscountFormFields = ({ form, setForm, plans }) => {
  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const togglePlan = (planId) => {
    setForm(prev => {
      const has = prev.applicable_plans.includes(planId)
      return {
        ...prev,
        applicable_plans: has
          ? prev.applicable_plans.filter(id => id !== planId)
          : [...prev.applicable_plans, planId],
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="form-label">Discount Name *</label>
          <input className="input" value={form.name} onChange={f('name')} placeholder="e.g. Launch Offer" />
        </div>
        <div>
          <label className="form-label">Discount Code *</label>
          <input
            className="input uppercase"
            value={form.code}
            onChange={e => setForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
            placeholder="e.g. LAUNCH20"
          />
        </div>
        <div>
          <label className="form-label">Type *</label>
          <select className="input" value={form.type} onChange={f('type')}>
            <option value="percentage">Percentage (%)</option>
            <option value="flat">Flat Amount (₹)</option>
          </select>
        </div>
        <div>
          <label className="form-label">Value *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-sm">
              {form.type === 'percentage' ? '%' : '₹'}
            </span>
            <input
              type="number"
              className="input pl-7"
              value={form.value}
              onChange={f('value')}
              min="0"
              max={form.type === 'percentage' ? '100' : undefined}
              placeholder={form.type === 'percentage' ? '20' : '500'}
            />
          </div>
        </div>
        <div>
          <label className="form-label">Usage Limit</label>
          <input
            type="number"
            className="input"
            value={form.usage_limit}
            onChange={f('usage_limit')}
            placeholder="Leave blank for unlimited"
            min="1"
          />
        </div>
        <div>
          <label className="form-label">Valid From</label>
          <input type="date" className="input" value={form.valid_from} onChange={f('valid_from')} />
        </div>
        <div>
          <label className="form-label">Valid Until</label>
          <input type="date" className="input" value={form.valid_until} onChange={f('valid_until')} />
        </div>
      </div>

      {plans.length > 0 && (
        <div>
          <label className="form-label">Applicable Plans</label>
          <p className="text-xs text-surface-500 mb-2">Select plans this discount applies to (leave empty for all plans)</p>
          <div className="flex flex-wrap gap-2">
            {plans.map(plan => {
              const id = plan._id || plan.id
              const active = form.applicable_plans.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePlan(id)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    active
                      ? 'bg-accent-500 text-white border-accent-500'
                      : 'bg-white text-surface-700 border-surface-300 hover:border-accent-400'
                  }`}
                >
                  {plan.display_name || plan.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
const Discounts = () => {
  const [discounts, setDiscounts] = useState([])
  const [plans, setPlans] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const limit = 10

  const fetchDiscounts = async () => {
    setIsLoading(true)
    try {
      const res = await discountService.getDiscounts({
        page: currentPage,
        limit,
        status: statusFilter || undefined,
      })
      setDiscounts(res.data.discounts || [])
      setTotalCount(res.data.total || 0)
    } catch {
      toast.error('Failed to load discounts')
      setDiscounts([])
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPlans = async () => {
    try {
      const res = await planService.getPlans(true)
      setPlans(res.data.plans || res.data || [])
    } catch {
      // non-critical
    }
  }

  useEffect(() => { fetchDiscounts() }, [currentPage, statusFilter])
  useEffect(() => { fetchPlans() }, [])

  const openCreate = () => {
    setForm(emptyForm)
    setIsCreateOpen(true)
  }

  const openEdit = (discount) => {
    setSelected(discount)
    setForm({
      name: discount.name || '',
      code: discount.code || '',
      type: discount.type || 'percentage',
      value: discount.value ?? '',
      applicable_plans: discount.applicable_plans || [],
      usage_limit: discount.usage_limit ?? '',
      valid_from: discount.valid_from ? discount.valid_from.slice(0, 10) : '',
      valid_until: discount.valid_until ? discount.valid_until.slice(0, 10) : '',
    })
    setIsEditOpen(true)
  }

  const validate = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return false }
    if (!form.code.trim()) { toast.error('Code is required'); return false }
    if (!form.value && form.value !== 0) { toast.error('Value is required'); return false }
    if (form.type === 'percentage' && (Number(form.value) <= 0 || Number(form.value) > 100)) {
      toast.error('Percentage must be between 1 and 100'); return false
    }
    if (form.type === 'flat' && Number(form.value) <= 0) {
      toast.error('Flat value must be greater than 0'); return false
    }
    return true
  }

  const buildPayload = () => ({
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    type: form.type,
    value: Number(form.value),
    applicable_plans: form.applicable_plans,
    usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    valid_from: form.valid_from || null,
    valid_until: form.valid_until || null,
  })

  const handleCreate = async () => {
    if (!validate()) return
    setIsActionLoading(true)
    try {
      await discountService.createDiscount(buildPayload())
      toast.success('Discount created')
      setIsCreateOpen(false)
      fetchDiscounts()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create discount')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!validate()) return
    setIsActionLoading(true)
    try {
      const id = selected._id || selected.id
      await discountService.updateDiscount(id, buildPayload())
      toast.success('Discount updated')
      setIsEditOpen(false)
      fetchDiscounts()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update discount')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleToggleStatus = async (discount) => {
    const id = discount._id || discount.id
    const newStatus = discount.status === 'active' ? 'inactive' : 'active'
    setIsActionLoading(true)
    try {
      await discountService.updateDiscount(id, { status: newStatus })
      toast.success(`Discount ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
      fetchDiscounts()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update status')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this discount? This cannot be undone.')) return
    setIsActionLoading(true)
    try {
      await discountService.deleteDiscount(id)
      toast.success('Discount deleted')
      fetchDiscounts()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete discount')
    } finally {
      setIsActionLoading(false)
    }
  }

  const columns = [
    {
      header: 'Discount',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-100 flex items-center justify-center">
            <Tag className="w-4 h-4 text-accent-600" />
          </div>
          <div>
            <p className="font-medium text-surface-900">{row.name}</p>
            <p className="text-xs font-mono text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Type / Value',
      render: (row) => (
        <div>
          <p className="font-semibold text-surface-900">
            {row.type === 'percentage' ? `${row.value}%` : `₹${row.value}`}
          </p>
          <p className="text-xs text-surface-500 capitalize">{row.type}</p>
        </div>
      ),
    },
    {
      header: 'Usage',
      render: (row) => (
        <div className="text-center">
          <p className="font-semibold text-surface-900">{row.used_count ?? 0}</p>
          <p className="text-xs text-surface-500">
            {row.usage_limit ? `of ${row.usage_limit}` : 'unlimited'}
          </p>
        </div>
      ),
    },
    {
      header: 'Valid Until',
      render: (row) => (
        <p className="text-sm text-surface-600">
          {row.valid_until ? formatDate(row.valid_until) : '—'}
        </p>
      ),
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'active' ? 'success' : 'danger'}>
          {row.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      render: (row) => {
        const id = row._id || row.id
        return (
          <div className="flex items-center gap-2">
            {/* Edit */}
            <button
              onClick={() => openEdit(row)}
              className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {/* Toggle status */}
            <button
              onClick={() => handleToggleStatus(row)}
              disabled={isActionLoading}
              className={`p-2 rounded-lg transition-colors ${
                row.status === 'active'
                  ? 'text-surface-400 hover:text-warning-600 hover:bg-warning-50'
                  : 'text-surface-400 hover:text-success-600 hover:bg-success-50'
              }`}
              title={row.status === 'active' ? 'Deactivate' : 'Activate'}
            >
              {row.status === 'active' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
            {/* Delete */}
            <button
              onClick={() => handleDelete(id)}
              disabled={isActionLoading}
              className="p-2 text-surface-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
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
          <h1 className="text-2xl font-bold text-surface-900">Discounts</h1>
          <p className="text-surface-500">Manage promotional codes and discount offers</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={fetchDiscounts} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
            Add Discount
          </Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-surface-200 flex gap-3">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            className="input w-40 text-sm"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <Table columns={columns} data={discounts} isLoading={isLoading} emptyMessage="No discounts found" />

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
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Add Discount" size="lg">
        <div className="space-y-4">
          <DiscountFormFields form={form} setForm={setForm} plans={plans} />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={isActionLoading}>Create Discount</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Discount" size="lg">
        <div className="space-y-4">
          <DiscountFormFields form={form} setForm={setForm} plans={plans} />
          <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
            <Button variant="secondary" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} isLoading={isActionLoading}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Discounts
