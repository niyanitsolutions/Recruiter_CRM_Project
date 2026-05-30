/**
 * QR Scan asset detail page.
 * Accessible at /hrm/assets/scan/:id — requires login for actions.
 * Shows asset info and allows Assign / Return / Maintenance / Retire.
 */
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Package, Loader2, AlertCircle, UserCheck, RotateCcw, Wrench,
  AlertTriangle, CheckCircle, Calendar, Hash, MapPin, DollarSign,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectUser } from '../../store/authSlice'

const STATUS_STYLE = {
  available:   { bg: '#d1fae5', color: '#10b981', label: 'Available' },
  assigned:    { bg: '#dbeafe', color: '#3b82f6', label: 'Assigned' },
  maintenance: { bg: '#fef3c7', color: '#f59e0b', label: 'Maintenance' },
  retired:     { bg: '#f1f5f9', color: '#64748b', label: 'Retired' },
  lost:        { bg: '#fee2e2', color: '#ef4444', label: 'Lost' },
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-indigo-500" />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-800 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  )
}

export default function AssetScanPage() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const isAuth = useSelector(selectIsAuthenticated)
  const user = useSelector(selectUser)
  const [asset, setAsset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  const canManage = user?.permissions?.includes('hrm:assets:manage')

  const loadAsset = async () => {
    if (!isAuth) return
    setLoading(true)
    try {
      const res = await hrmService.getAsset(assetId)
      setAsset(res.data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Asset not found')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!isAuth) return
    loadAsset()
  }, [assetId, isAuth])

  const handleReturn = async () => {
    if (!confirm('Mark this asset as returned?')) return
    setActionLoading(true)
    try {
      await hrmService.returnAsset(assetId, {})
      toast.success('Asset returned')
      loadAsset()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Return failed')
    }
    setActionLoading(false)
  }

  const handleMaintenance = async () => {
    if (!confirm('Send asset to maintenance?')) return
    setActionLoading(true)
    try {
      await hrmService.updateAsset(assetId, { status: 'maintenance' })
      toast.success('Asset moved to maintenance')
      loadAsset()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed')
    }
    setActionLoading(false)
  }

  const handleRetire = async () => {
    if (!confirm('Retire this asset? This cannot be undone easily.')) return
    setActionLoading(true)
    try {
      await hrmService.updateAsset(assetId, { status: 'retired' })
      toast.success('Asset retired')
      loadAsset()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed')
    }
    setActionLoading(false)
  }

  const fmt = (dt) => dt ? new Date(dt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : null

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full">
          <Package className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Login Required</h2>
          <p className="text-gray-500 text-sm mb-4">Please log in to view asset details.</p>
          <button onClick={() => navigate(`/login?redirect=/hrm/assets/scan/${assetId}`)}
            className="btn-primary w-full">Log In</button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Asset Not Found</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  const statusCfg = STATUS_STYLE[asset.status] || STATUS_STYLE.available

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Asset Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            <Package className="w-8 h-8 text-indigo-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{asset.asset_tag}</h1>
          <p className="text-gray-500 capitalize">{asset.asset_type} {asset.brand ? `· ${asset.brand}` : ''}</p>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
                  style={{ background: statusCfg.bg, color: statusCfg.color }}>
              <CheckCircle className="w-4 h-4" />
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Asset Details</h3>
          <InfoRow icon={Hash} label="Asset ID" value={asset.asset_tag} />
          <InfoRow icon={Package} label="Model" value={asset.model_name} />
          <InfoRow icon={Hash} label="Serial Number" value={asset.serial_number} />
          <InfoRow icon={Calendar} label="Purchase Date" value={fmt(asset.purchase_date)} />
          <InfoRow icon={DollarSign} label="Purchase Cost" value={asset.purchase_cost ? `₹${asset.purchase_cost.toLocaleString('en-IN')}` : null} />
          <InfoRow icon={Calendar} label="Warranty Expiry" value={fmt(asset.warranty_expiry)} />
          <InfoRow icon={MapPin} label="Location" value={asset.location} />
        </div>

        {/* Current Assignment */}
        {asset.status === 'assigned' && asset.assigned_to_name && (
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
            <p className="text-sm font-semibold text-blue-800">Currently Assigned</p>
            <p className="text-lg font-bold text-blue-900 mt-0.5">{asset.assigned_to_name}</p>
            {asset.assigned_on && (
              <p className="text-xs text-blue-600 mt-0.5">Since {fmt(asset.assigned_on)}</p>
            )}
          </div>
        )}

        {/* Actions (HR/manager only) */}
        {canManage && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Actions</h3>
            {asset.status === 'available' && (
              <button onClick={() => navigate(`/hrm/assets`)}
                className="w-full btn-primary flex items-center justify-center gap-2">
                <UserCheck className="w-4 h-4" /> Assign Asset
              </button>
            )}
            {asset.status === 'assigned' && (
              <button onClick={handleReturn} disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Return Asset
              </button>
            )}
            {['available', 'assigned'].includes(asset.status) && (
              <button onClick={handleMaintenance} disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                <Wrench className="w-4 h-4" /> Send to Maintenance
              </button>
            )}
            {asset.status !== 'retired' && (
              <button onClick={handleRetire} disabled={actionLoading}
                className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                <AlertTriangle className="w-4 h-4" /> Retire Asset
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
