import React, { useState, useEffect } from 'react'
import { Plus, RefreshCw, Eye, Monitor, Smartphone, Check, Minus, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import { Button, Card, Table, Badge, StatusBadge, Modal } from '../../components/common'
import sellerPortalService from '../../services/sellerPortalService'
import { formatDate, formatCurrency } from '../../utils/format'
import toast from 'react-hot-toast'

const emptyForm = {
  company_name: '', industry: 'IT',
  owner_name: '', owner_email: '', owner_mobile: '', owner_username: '', owner_password: '',
  plan_id: '', billing_cycle: 'monthly', user_count: 1,
  phone: '', address: '', city: '', state: '', zip_code: '',
}

const INDUSTRIES = ['IT', 'Finance', 'Healthcare', 'Manufacturing', 'Retail', 'Education', 'Staffing', 'Other']

const SellerTenants = () => {
  const [tenants,         setTenants]         = useState([])
  const [isLoading,       setIsLoading]       = useState(true)
  const [totalCount,      setTotalCount]      = useState(0)
  const [currentPage,     setCurrentPage]     = useState(1)
  const [sellerPlans,     setSellerPlans]     = useState([])
  const [selectedPlan,    setSelectedPlan]    = useState(null)
  const [billingCycle,    setBillingCycle]    = useState('monthly')
  const [userCount,       setUserCount]       = useState(1)
  const [isCreateOpen,    setIsCreateOpen]    = useState(false)
  const [isViewOpen,      setIsViewOpen]      = useState(false)
  const [selected,        setSelected]        = useState(null)
  const [form,            setForm]            = useState(emptyForm)
  const [isActionLoading, setIsActionLoading] = useState(false)

  const limit = 10

  const fetchTenants = async () => {
    setIsLoading(true)
    try {
      const res = await sellerPortalService.getMyTenants({ page: currentPage, limit })
      setTenants(res.data.tenants || [])
      setTotalCount(res.data.total || 0)
    } catch {
      toast.error('Failed to load tenants')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPlans = async () => {
    try {
      const res = await sellerPortalService.getSellerPlans()
      const plans = res.data.plans || []
      setSellerPlans(plans)
      const popular = plans.find(p => p.is_popular) || plans[0]
      if (popular) setSelectedPlan(popular)
    } catch {
      // non-critical
    }
  }

  useEffect(() => { fetchTenants() }, [currentPage])
  useEffect(() => { fetchPlans() }, [])

  // Seller price per user for selected billing cycle (in paise)
  const getSellerPpu = (plan) => {
    if (!plan) return 0
    return billingCycle === 'yearly' ? plan.seller_price_yearly : plan.seller_price_monthly
  }

  // Full tenant price per user
  const getTenantPpu = (plan) => {
    if (!plan) return 0
    return billingCycle === 'yearly' ? plan.price_per_user_yearly : plan.price_per_user_monthly
  }

  // Seller subtotal (before GST)
  const getSellerSubtotal = (plan) => {
    const ppu   = getSellerPpu(plan)
    const users = Math.max(userCount, 1)
    return billingCycle === 'yearly' ? ppu * users * 12 : ppu * users
  }

  const openCreate = () => {
    setForm(emptyForm)
    setBillingCycle('monthly')
    setUserCount(1)
    const popular = sellerPlans.find(p => p.is_popular) || sellerPlans[0]
    setSelectedPlan(popular || null)
    setIsCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!form.company_name || !form.owner_name || !form.owner_email || !form.owner_username || !form.owner_password) {
      toast.error('Please fill all required fields')
      return
    }
    if (!selectedPlan) {
      toast.error('Please select a plan')
      return
    }
    setIsActionLoading(true)
    try {
      await sellerPortalService.createTenant({
        ...form,
        plan_id:       selectedPlan.id,
        billing_cycle: billingCycle,
        user_count:    Math.max(userCount, 1),
      })
      toast.success('Tenant created successfully')
      setIsCreateOpen(false)
      fetchTenants()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create tenant')
    } finally {
      setIsActionLoading(false)
    }
  }

  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const columns = [
    {
      header: 'Company',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-semibold text-sm">
            {row.company_name?.charAt(0) || 'C'}
          </div>
          <div>
            <p className="font-medium text-surface-900">{row.company_name}</p>
            <p className="text-xs text-surface-500">{row.owner_email}</p>
          </div>
        </div>
      ),
    },
    { header: 'Owner', render: (row) => <p className="text-surface-700">{row.owner_name}</p> },
    {
      header: 'Plan',
      render: (row) => <Badge variant={row.is_trial ? 'warning' : 'info'}>{(row.plan_name || 'N/A').toUpperCase()}</Badge>,
    },
    { header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { header: 'Expiry',  render: (row) => <p className="text-sm text-surface-600">{formatDate(row.plan_expiry)}</p> },
    {
      header: 'Actions',
      render: (row) => (
        <button
          onClick={() => { setSelected(row); setIsViewOpen(true) }}
          className="p-2 text-surface-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ]

  const sellerSubtotal = selectedPlan ? getSellerSubtotal(selectedPlan) : 0
  const sellerGst      = Math.round(sellerSubtotal * 0.18)
  const sellerTotal    = sellerSubtotal + sellerGst

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">My Tenants</h1>
          <p className="text-surface-500">Companies you have onboarded</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={fetchTenants} leftIcon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>
          <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>Add Tenant</Button>
        </div>
      </div>

      <Card padding={false}>
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

      {/* ── Create Tenant Modal ─────────────────────────────────────────── */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Add New Tenant" size="xl">
        <div className="space-y-6">

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Company Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Company Name *</label>
                <input className="input" placeholder="Acme Corp" value={form.company_name} onChange={f('company_name')} />
              </div>
              <div>
                <label className="form-label">Industry</label>
                <select className="input" value={form.industry} onChange={f('industry')}>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="input" placeholder="+91 98765 43210" value={form.phone} onChange={f('phone')} />
              </div>
              <div>
                <label className="form-label">City</label>
                <input className="input" placeholder="City" value={form.city} onChange={f('city')} />
              </div>
              <div>
                <label className="form-label">State</label>
                <input className="input" placeholder="State" value={form.state} onChange={f('state')} />
              </div>
            </div>
          </div>

          {/* Owner */}
          <div>
            <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Owner Account</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Full Name *</label>
                <input className="input" placeholder="John Doe" value={form.owner_name} onChange={f('owner_name')} />
              </div>
              <div>
                <label className="form-label">Email *</label>
                <input type="email" className="input" placeholder="john@company.com" value={form.owner_email} onChange={f('owner_email')} />
              </div>
              <div>
                <label className="form-label">Mobile</label>
                <input className="input" placeholder="+91 98765 43210" value={form.owner_mobile} onChange={f('owner_mobile')} />
              </div>
              <div>
                <label className="form-label">Username *</label>
                <input className="input" placeholder="johndoe" value={form.owner_username} onChange={f('owner_username')} />
              </div>
              <div>
                <label className="form-label">Password *</label>
                <input type="password" className="input" placeholder="Min. 8 characters" value={form.owner_password} onChange={f('owner_password')} />
              </div>
            </div>
          </div>

          {/* Plan + Pricing */}
          <div>
            <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Subscription Plan</h4>

            {/* Billing toggle */}
            <div className="flex mb-4">
              <div className="bg-surface-100 p-1 rounded-lg inline-flex">
                {[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly',  label: 'Yearly', badge: 'Save ~33%' },
                ].map(({ value, label, badge }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBillingCycle(value)}
                    className={clsx(
                      'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                      billingCycle === value
                        ? 'bg-white text-surface-900 shadow-sm'
                        : 'text-surface-500 hover:text-surface-700'
                    )}
                  >
                    {label}
                    {badge && <span className="ml-1 text-[10px] text-green-600 font-semibold">{badge}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan cards */}
            {sellerPlans.length === 0 ? (
              <p className="text-sm text-surface-400 text-center py-4">Loading plans…</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {sellerPlans.map(plan => {
                  const isSelected = selectedPlan?.id === plan.id
                  const sellerPpu  = getSellerPpu(plan)
                  const tenantPpu  = getTenantPpu(plan)
                  const margin     = tenantPpu - sellerPpu
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={clsx(
                        'relative flex flex-col rounded-xl border-2 cursor-pointer transition-all overflow-hidden',
                        isSelected ? 'border-accent-500 shadow-md' : 'border-surface-200 hover:border-surface-300',
                        plan.is_popular && 'ring-1 ring-accent-400'
                      )}
                    >
                      {/* Popular banner */}
                      {plan.is_popular && (
                        <div className="bg-accent-500 text-white text-[10px] font-semibold text-center py-1 flex items-center justify-center gap-1">
                          <Sparkles className="w-3 h-3" /> Recommended
                        </div>
                      )}

                      <div className={clsx('flex flex-col flex-1 p-4', plan.is_popular && 'bg-accent-50/30')}>
                        {/* Name + check */}
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-surface-900">{plan.display_name}</h3>
                          {isSelected && (
                            <div className="w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>

                        {/* Features */}
                        <div className="space-y-1 mb-3">
                          <div className="flex items-center gap-1.5 text-xs text-surface-600">
                            <Monitor className="w-3 h-3 text-surface-400" /> Desktop Version
                          </div>
                          {plan.has_mobile && (
                            <div className="flex items-center gap-1.5 text-xs text-purple-700">
                              <Smartphone className="w-3 h-3" /> Mobile
                              <span className="text-[9px] bg-purple-100 px-1 py-0.5 rounded font-medium">Coming Soon</span>
                            </div>
                          )}
                        </div>

                        {/* Pricing split */}
                        <div className="mt-auto space-y-1 text-xs border-t border-surface-100 pt-2">
                          {/* Tenant price */}
                          <div className="flex justify-between text-surface-500">
                            <span>Tenant pays</span>
                            <span className="font-medium">{formatCurrency(tenantPpu)}/user/mo</span>
                          </div>
                          {/* Seller price */}
                          <div className="flex justify-between text-accent-700">
                            <span>Your price ({plan.reseller_discount_percent}% off)</span>
                            <span className="font-bold">{formatCurrency(sellerPpu)}/user/mo</span>
                          </div>
                          {/* Margin */}
                          {margin > 0 && (
                            <div className="flex justify-between text-green-700 font-semibold">
                              <span>Your margin</span>
                              <span>+{formatCurrency(margin)}/user/mo</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* User count stepper */}
            {selectedPlan && (
              <div className="bg-surface-50 rounded-xl border border-surface-200 p-4">
                <label className="block text-sm font-medium text-surface-700 mb-3">Number of Users</label>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setUserCount(c => Math.max(c - 1, 1))}
                    className="w-9 h-9 rounded-lg border border-surface-300 bg-white flex items-center justify-center hover:bg-surface-100 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-surface-600" />
                  </button>
                  <input
                    type="number" min="1" value={userCount}
                    onChange={e => setUserCount(Math.max(parseInt(e.target.value) || 1, 1))}
                    className="w-20 text-center border border-surface-300 rounded-lg py-2 text-surface-900 font-semibold focus:outline-none focus:ring-2 focus:ring-accent-400"
                  />
                  <button
                    type="button"
                    onClick={() => setUserCount(c => c + 1)}
                    className="w-9 h-9 rounded-lg border border-surface-300 bg-white flex items-center justify-center hover:bg-surface-100 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-surface-600" />
                  </button>
                  <span className="text-sm text-surface-500">users</span>
                </div>

                {/* Order summary */}
                <div className="space-y-1.5 text-sm border-t border-surface-200 pt-3">
                  <div className="flex justify-between text-surface-600">
                    <span>
                      {formatCurrency(getSellerPpu(selectedPlan))}/user × {userCount} user{userCount !== 1 ? 's' : ''}
                      {billingCycle === 'yearly' ? ' × 12 mo' : ''}
                    </span>
                    <span className="font-medium">{formatCurrency(sellerSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-surface-500 text-xs">
                    <span>GST (18%)</span>
                    <span>{formatCurrency(sellerGst)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-surface-900 pt-1.5 border-t border-surface-200">
                    <span>You pay (total)</span>
                    <span className="text-accent-700">{formatCurrency(sellerTotal)}</span>
                  </div>
                  {selectedPlan.reseller_discount_percent > 0 && (
                    <div className="flex justify-between text-green-700 text-xs font-medium">
                      <span>Your margin ({selectedPlan.reseller_discount_percent}% discount saved)</span>
                      <span>
                        +{formatCurrency(
                          Math.round((getTenantPpu(selectedPlan) - getSellerPpu(selectedPlan))
                            * Math.max(userCount, 1)
                            * (billingCycle === 'yearly' ? 12 : 1)
                            * 1.18)
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={isActionLoading}>Create Tenant</Button>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} title="Tenant Details" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Company',  selected.company_name],
                ['Owner',    selected.owner_name],
                ['Email',    selected.owner_email],
                ['Plan',     selected.plan_name],
                ['Status',   null],
                ['Expiry',   formatDate(selected.plan_expiry)],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-xs text-surface-500">{label}</p>
                  {label === 'Status'
                    ? <StatusBadge status={selected.status} />
                    : <p className="font-medium text-surface-900">{val || '—'}</p>
                  }
                </div>
              ))}
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

export default SellerTenants
