import React, { useState, useEffect } from 'react'
import { Plus, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { Button, Card, Table, Badge, Modal } from '../../components/common'
import api from '../../services/api'
import { formatCurrency } from '../../utils/format'
import toast from 'react-hot-toast'

const emptyForm = {
  name: '', display_name: '', description: '',
  price_monthly: '', price_yearly: '',
  max_users: '', max_candidates: '', max_jobs: '',
  features: '',
  reseller_discount_percent: '0',
}

const Plans = () => {
  const [plans, setPlans] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const fetchPlans = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/plans/', { params: { include_inactive: true, include_trial: true } })
      setPlans(res.data.plans || [])
    } catch {
      toast.error('Failed to load plans')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchPlans() }, [])

  const handleCreate = async () => {
    setIsActionLoading(true)
    try {
      const payload = {
        name: form.name,
        display_name: form.display_name,
        description: form.description,
        price_monthly: Number(form.price_monthly || 0) * 100,
        price_quarterly: 0,
        price_yearly: Number(form.price_yearly || 0) * 100,
        max_users: Number(form.max_users || 5),
        max_candidates: Number(form.max_candidates || 100),
        max_jobs: Number(form.max_jobs || 10),
        reseller_discount_percent: Number(form.reseller_discount_percent || 0),
      }
      await api.post('/plans/', payload)
      toast.success('Plan created')
      setIsCreateOpen(false)
      setForm(emptyForm)
      fetchPlans()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create plan')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleEdit = async () => {
    setIsActionLoading(true)
    try {
      const payload = {
        display_name: form.display_name,
        description: form.description,
        price_monthly: Number(form.price_monthly || 0) * 100,
        price_yearly: Number(form.price_yearly || 0) * 100,
        max_users: Number(form.max_users || 5),
        max_candidates: Number(form.max_candidates || 100),
        max_jobs: Number(form.max_jobs || 10),
        reseller_discount_percent: Number(form.reseller_discount_percent || 0),
      }
      await api.put(`/plans/${selected.id}`, payload)
      toast.success('Plan updated')
      setIsEditOpen(false)
      fetchPlans()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update plan')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleToggle = async (plan) => {
    setIsActionLoading(true)
    try {
      await api.patch(`/plans/${plan.id}/toggle`)
      toast.success(`Plan ${plan.status === 'active' ? 'deactivated' : 'activated'}`)
      fetchPlans()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle plan')
    } finally {
      setIsActionLoading(false)
    }
  }

  const openEdit = (plan) => {
    setSelected(plan)
    setForm({
      name: plan.name || '',
      display_name: plan.display_name || '',
      description: plan.description || '',
      price_monthly: plan.price_monthly ? (plan.price_monthly / 100).toString() : '',
      price_yearly: plan.price_yearly ? (plan.price_yearly / 100).toString() : '',
      max_users: String(plan.max_users || ''),
      max_candidates: String(plan.max_candidates || ''),
      max_jobs: String(plan.max_jobs || ''),
      features: Array.isArray(plan.features) ? plan.features.join(', ') : '',
      reseller_discount_percent: String(plan.reseller_discount_percent ?? 0),
    })
    setIsEditOpen(true)
  }

  const columns = [
    {
      header: 'Plan',
      render: (row) => (
        <div>
          <p className="font-medium text-surface-900">{row.display_name || row.name}</p>
          <p className="text-xs text-surface-500 capitalize">{row.name}</p>
        </div>
      ),
    },
    {
      header: 'Monthly Price',
      render: (row) => (
        <span className="font-semibold">{formatCurrency(row.price_monthly || 0)}</span>
      ),
    },
    {
      header: 'Annual Price',
      render: (row) => (
        <span className="font-semibold">{formatCurrency(row.price_yearly || 0)}</span>
      ),
    },
    {
      header: 'Limits',
      render: (row) => (
        <div className="text-sm text-surface-600">
          <p>{row.max_users ?? '∞'} users</p>
          <p>{row.max_candidates ?? '∞'} candidates</p>
          <p>{row.max_jobs ?? '∞'} jobs</p>
        </div>
      ),
    },
    {
      header: 'Reseller Discount',
      render: (row) => (
        <span className="text-sm font-medium text-surface-700">
          {row.reseller_discount_percent > 0 ? `${row.reseller_discount_percent}%` : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'active' ? 'success' : 'default'}>
          {row.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEdit(row)}
            className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => handleToggle(row)}
            disabled={isActionLoading}
            className={`p-2 rounded-lg transition-colors ${
              row.status === 'active'
                ? 'text-surface-400 hover:text-danger-600 hover:bg-danger-50'
                : 'text-surface-400 hover:text-success-600 hover:bg-success-50'
            }`}
            title={row.status === 'active' ? 'Deactivate' : 'Activate'}
          >
            {row.status === 'active' ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          </button>
        </div>
      ),
    },
  ]

  const PlanForm = ({ onSubmit, submitLabel }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Plan Key (slug)</label>
          <input className="input" placeholder="e.g. basic" value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Display Name</label>
          <input className="input" placeholder="e.g. Basic Plan" value={form.display_name}
            onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="form-label">Description</label>
          <input className="input" value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Monthly Price (₹)</label>
          <input type="number" className="input" value={form.price_monthly}
            onChange={(e) => setForm(f => ({ ...f, price_monthly: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Annual Price (₹)</label>
          <input type="number" className="input" value={form.price_yearly}
            onChange={(e) => setForm(f => ({ ...f, price_yearly: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Max Users</label>
          <input type="number" className="input" value={form.max_users}
            onChange={(e) => setForm(f => ({ ...f, max_users: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Max Candidates</label>
          <input type="number" className="input" value={form.max_candidates}
            onChange={(e) => setForm(f => ({ ...f, max_candidates: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Max Jobs</label>
          <input type="number" className="input" value={form.max_jobs}
            onChange={(e) => setForm(f => ({ ...f, max_jobs: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">Reseller Discount (%)</label>
          <input type="number" className="input" min="0" max="100" value={form.reseller_discount_percent}
            onChange={(e) => setForm(f => ({ ...f, reseller_discount_percent: e.target.value }))}
            placeholder="0" />
          <p className="text-xs text-surface-500 mt-1">% discount applied to reseller pricing</p>
        </div>
        <div className="col-span-2">
          <label className="form-label">Features (comma-separated)</label>
          <input className="input" placeholder="e.g. ATS, Email Integration, Reports" value={form.features}
            onChange={(e) => setForm(f => ({ ...f, features: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
        <Button variant="secondary" onClick={() => { setIsCreateOpen(false); setIsEditOpen(false) }}>Cancel</Button>
        <Button onClick={onSubmit} isLoading={isActionLoading}>{submitLabel}</Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Plans</h1>
          <p className="text-surface-500">Manage subscription plans available to tenants</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={fetchPlans} leftIcon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>
          <Button onClick={() => { setForm(emptyForm); setIsCreateOpen(true) }} leftIcon={<Plus className="w-4 h-4" />}>New Plan</Button>
        </div>
      </div>

      <Card padding={false}>
        <Table columns={columns} data={plans} isLoading={isLoading} emptyMessage="No plans found" />
      </Card>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Plan" size="lg">
        <PlanForm onSubmit={handleCreate} submitLabel="Create Plan" />
      </Modal>

      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Plan" size="lg">
        <PlanForm onSubmit={handleEdit} submitLabel="Save Changes" />
      </Modal>
    </div>
  )
}

export default Plans
