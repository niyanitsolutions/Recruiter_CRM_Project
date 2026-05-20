import React, { useState, useEffect, useCallback } from 'react'
import {
  Package, Plus, Search, Loader2, AlertCircle, X, Edit2, Trash2,
  UserCheck, RotateCcw, Monitor, Smartphone, Mouse, Keyboard, Headphones,
  CheckCircle, Clock, Wrench, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

const ASSET_TYPES = ['laptop', 'desktop', 'monitor', 'phone', 'mouse', 'keyboard', 'headset', 'tablet', 'printer', 'other']
const CONDITIONS   = ['excellent', 'good', 'fair', 'poor']
const STATUSES     = ['available', 'assigned', 'maintenance', 'retired', 'lost']

const STATUS_STYLE = {
  available:   'bg-green-100 text-green-700',
  assigned:    'bg-blue-100 text-blue-700',
  maintenance: 'bg-amber-100 text-amber-700',
  retired:     'bg-gray-100 text-gray-500',
  lost:        'bg-red-100 text-red-600',
}

const STATUS_ICON = {
  available:   CheckCircle,
  assigned:    UserCheck,
  maintenance: Wrench,
  retired:     AlertTriangle,
  lost:        AlertTriangle,
}

function AssetFormModal({ asset, onClose, onSaved }) {
  const editing = !!asset?.id
  const [form, setForm] = useState({
    asset_tag: asset?.asset_tag || '',
    asset_type: asset?.asset_type || 'laptop',
    brand: asset?.brand || '',
    model_name: asset?.model_name || '',
    serial_number: asset?.serial_number || '',
    purchase_date: asset?.purchase_date ? asset.purchase_date.split('T')[0] : '',
    purchase_cost: asset?.purchase_cost || '',
    warranty_expiry: asset?.warranty_expiry ? asset.warranty_expiry.split('T')[0] : '',
    condition: asset?.condition || 'good',
    location: asset?.location || '',
    notes: asset?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.asset_tag.trim()) { toast.error('Asset tag is required'); return }
    if (!form.asset_type) { toast.error('Asset type is required'); return }
    setLoading(true)
    try {
      const payload = {
        ...form,
        purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : undefined,
        purchase_date: form.purchase_date || undefined,
        warranty_expiry: form.warranty_expiry || undefined,
      }
      if (editing) {
        await hrmService.updateAsset(asset.id, payload)
      } else {
        await hrmService.createAsset(payload)
      }
      toast.success(editing ? 'Asset updated' : 'Asset created')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">{editing ? 'Edit Asset' : 'Add Asset'}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">Asset Tag <span className="text-red-500">*</span></label>
            <input className="input" placeholder="e.g. LAP-001" value={form.asset_tag}
              onChange={e => set('asset_tag', e.target.value)} disabled={editing} />
          </div>
          <div>
            <label className="input-label">Type <span className="text-red-500">*</span></label>
            <select className="input" value={form.asset_type} onChange={e => set('asset_type', e.target.value)}>
              {ASSET_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Brand</label>
            <input className="input" placeholder="e.g. Dell" value={form.brand} onChange={e => set('brand', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Model</label>
            <input className="input" placeholder="e.g. XPS 15" value={form.model_name} onChange={e => set('model_name', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Serial Number</label>
            <input className="input" placeholder="Serial / IMEI" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Condition</label>
            <select className="input" value={form.condition} onChange={e => set('condition', e.target.value)}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Purchase Date</label>
            <input className="input" type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Purchase Cost (₹)</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={form.purchase_cost} onChange={e => set('purchase_cost', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Warranty Expiry</label>
            <input className="input" type="date" value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Location / Branch</label>
            <input className="input" placeholder="Office location" value={form.location} onChange={e => set('location', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="input-label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Update' : 'Create Asset'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignModal({ asset, onClose, onAssigned }) {
  const [employees, setEmployees] = useState([])
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState(null)
  const [loading, setLoading]     = useState(false)
  const [empLoading, setEmpLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setEmpLoading(true)
      try {
        const res = await hrmService.listEmployees({ status: 'active', page_size: 100 })
        setEmployees(res.data.items || [])
      } catch {}
      setEmpLoading(false)
    }
    load()
  }, [])

  const filtered = search
    ? employees.filter(e => e.full_name?.toLowerCase().includes(search.toLowerCase()))
    : employees

  const handleAssign = async () => {
    if (!selected) { toast.error('Select an employee'); return }
    setLoading(true)
    try {
      await hrmService.assignAsset(asset.id, { employee_id: selected._id || selected.id, employee_name: selected.full_name })
      toast.success(`Assigned to ${selected.full_name}`)
      onAssigned()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Assignment failed')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold">Assign Asset: <span className="text-indigo-600">{asset.asset_tag}</span></h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input className="input text-sm" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="border border-gray-200 rounded-xl overflow-y-auto max-h-56">
            {empLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
            {!empLoading && filtered.map(emp => (
              <button
                key={emp._id || emp.id}
                onClick={() => setSelected(emp)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors
                  ${selected?.(_id || id) === (emp._id || emp.id) ? 'bg-indigo-50' : ''}`}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                  {emp.full_name?.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{emp.full_name}</p>
                  <p className="text-xs text-gray-400">{emp.designation_name}</p>
                </div>
                {selected && (selected._id || selected.id) === (emp._id || emp.id) && (
                  <CheckCircle className="w-4 h-4 text-indigo-500 ml-auto" />
                )}
              </button>
            ))}
          </div>
          {selected && (
            <p className="text-sm text-indigo-700 font-medium">Selected: {selected.full_name}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleAssign} disabled={loading || !selected} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetCard({ asset, onEdit, onDelete, onAssign, onReturn, onRefresh }) {
  const StatusIcon = STATUS_ICON[asset.status] || Package
  const [returning, setReturning] = useState(false)

  const handleReturn = async () => {
    if (!confirm('Mark asset as returned?')) return
    setReturning(true)
    try {
      await hrmService.returnAsset(asset.id, {})
      toast.success('Asset returned')
      onRefresh()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Return failed')
    }
    setReturning(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete asset ${asset.asset_tag}?`)) return
    try {
      await hrmService.deleteAsset(asset.id)
      toast.success('Asset deleted')
      onDelete()
    } catch { toast.error('Delete failed') }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-indigo-200 transition-colors space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{asset.asset_tag}</p>
            <p className="text-xs text-gray-500 capitalize">{asset.asset_type} {asset.brand ? `· ${asset.brand}` : ''}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${STATUS_STYLE[asset.status]}`}>
          <StatusIcon className="w-3 h-3" />
          {asset.status}
        </span>
      </div>

      {asset.model_name && <p className="text-xs text-gray-500">{asset.model_name}</p>}

      {asset.status === 'assigned' && asset.assigned_to_name && (
        <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
          Assigned to <strong>{asset.assigned_to_name}</strong>
          {asset.assigned_on && ` · ${new Date(asset.assigned_on).toLocaleDateString('en-IN')}`}
        </div>
      )}

      {asset.serial_number && (
        <p className="text-xs text-gray-400 font-mono">S/N: {asset.serial_number}</p>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
        <button onClick={() => onEdit(asset)}
          className="flex-1 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
          <Edit2 className="w-3.5 h-3.5" /> Edit
        </button>
        {asset.status === 'available' && (
          <button onClick={() => onAssign(asset)}
            className="flex-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
            <UserCheck className="w-3.5 h-3.5" /> Assign
          </button>
        )}
        {asset.status === 'assigned' && (
          <button onClick={handleReturn} disabled={returning}
            className="flex-1 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
            {returning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Return
          </button>
        )}
        <button onClick={handleDelete}
          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function AssetManagement() {
  const [assets, setAssets]     = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType]     = useState('')
  const [page, setPage]         = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editAsset, setEditAsset]   = useState(null)
  const [assignAsset, setAssignAsset] = useState(null)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hrmService.listAssets({
        search: search || undefined,
        status: filterStatus || undefined,
        asset_type: filterType || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setAssets(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }, [search, filterStatus, filterType, page])

  useEffect(() => { setPage(1) }, [search, filterStatus, filterType])
  useEffect(() => { load() }, [load])

  // Summary counts
  const counts = assets.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600" />
            Asset Management
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} total assets</p>
        </div>
        <button onClick={() => { setEditAsset(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Asset
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {STATUSES.map(s => (
          <div key={s} className={`p-3 rounded-xl border cursor-pointer transition-all text-center
            ${filterStatus === s ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-200'}`}
            onClick={() => setFilterStatus(filterStatus === s ? '' : s)}>
            <p className={`text-xl font-bold ${STATUS_STYLE[s].split(' ')[1]}`}>{counts[s] || 0}</p>
            <p className="text-xs text-gray-500 capitalize mt-0.5">{s}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tag, brand, model, serial…" className="input pl-9 text-sm" />
        </div>
        <select className="input text-sm w-40" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {ASSET_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          No assets found.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map(a => (
            <AssetCard key={a.id} asset={a}
              onEdit={a => { setEditAsset(a); setShowForm(true) }}
              onDelete={load}
              onAssign={setAssignAsset}
              onReturn={load}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
            <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {showForm && (
        <AssetFormModal
          asset={editAsset}
          onClose={() => { setShowForm(false); setEditAsset(null) }}
          onSaved={load}
        />
      )}

      {assignAsset && (
        <AssignModal
          asset={assignAsset}
          onClose={() => setAssignAsset(null)}
          onAssigned={load}
        />
      )}
    </div>
  )
}
