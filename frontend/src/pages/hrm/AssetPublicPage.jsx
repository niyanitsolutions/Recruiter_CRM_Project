/**
 * Public QR scan page for assets — no login required.
 * Route: /asset/public/:publicToken
 *
 * Shows safe asset info only. Does NOT expose internal IDs.
 */
import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  Package, Loader2, AlertCircle, CheckCircle,
  Calendar, Hash, MapPin, Tag, Shield, Clock,
} from 'lucide-react'
import hrmService from '../../services/hrmService'

const STATUS_CFG = {
  available:   { label: 'Available',   color: '#10b981', bg: '#d1fae5' },
  assigned:    { label: 'Assigned',    color: '#3b82f6', bg: '#dbeafe' },
  maintenance: { label: 'Maintenance', color: '#f59e0b', bg: '#fef3c7' },
  retired:     { label: 'Retired',     color: '#64748b', bg: '#f1f5f9' },
  lost:        { label: 'Lost',        color: '#ef4444', bg: '#fee2e2' },
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-indigo-500" />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-800 font-medium mt-0.5 capitalize">{String(value).replace(/_/g, ' ')}</p>
      </div>
    </div>
  )
}

export default function AssetPublicPage() {
  const { publicToken } = useParams()
  const [asset, setAsset]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!publicToken) { setError('Invalid QR code.'); setLoading(false); return }
    hrmService.getAssetByPublicToken(publicToken)
      .then(r => setAsset(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Asset not found.'))
      .finally(() => setLoading(false))
  }, [publicToken])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm text-gray-500">Loading asset info…</p>
        </div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Asset Not Found</h2>
          <p className="text-gray-500 text-sm">{error || 'This QR code is not associated with any asset.'}</p>
        </div>
      </div>
    )
  }

  const statusCfg = STATUS_CFG[asset.status] || STATUS_CFG.available
  const assetName = [asset.brand, asset.model_name].filter(Boolean).join(' ') || asset.asset_tag

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4">
      <div className="max-w-md mx-auto space-y-4">

        {/* Asset header card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-indigo-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{assetName}</h1>
          {asset.asset_tag && (
            <p className="text-sm text-gray-500 mt-0.5 font-mono">{asset.asset_tag}</p>
          )}
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm"
               style={{ background: statusCfg.bg, color: statusCfg.color }}>
            <CheckCircle className="w-4 h-4" />
            {statusCfg.label}
          </div>
        </div>

        {/* Asset details card */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Asset Details</h3>
          <InfoRow icon={Tag}      label="Asset Tag"      value={asset.asset_tag} />
          <InfoRow icon={Package}  label="Type"           value={asset.asset_type} />
          <InfoRow icon={Hash}     label="Serial Number"  value={asset.serial_number} />
          <InfoRow icon={Shield}   label="Condition"      value={asset.condition} />
          <InfoRow icon={MapPin}   label="Location"       value={asset.location} />
          <InfoRow icon={Calendar} label="Purchase Date"  value={asset.purchase_date} />
          <InfoRow icon={Calendar} label="Warranty Until" value={asset.warranty_expiry} />
        </div>

        {/* Assignment info */}
        {asset.status === 'assigned' && asset.assigned_to_name && (
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
            <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">Currently Assigned To</p>
            <p className="text-lg font-bold text-blue-900">{asset.assigned_to_name}</p>
            {asset.assigned_on && (
              <p className="text-xs text-blue-500 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Since {new Date(asset.assigned_on).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          This is a public asset information page. For issues, contact your IT or HR team.
        </p>
      </div>
    </div>
  )
}
