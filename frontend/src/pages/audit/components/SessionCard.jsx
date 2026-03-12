/**
 * Session Card Component - Phase 5
 * Displays a user session with device info
 */
import React from 'react';
import { Monitor, Smartphone, Tablet, Globe, Clock, MapPin, Shield, X } from 'lucide-react';
import auditAdvancedService from '../../services/auditAdvancedService';

const SessionCard = ({
  session,
  isCurrentSession = false,
  onRevoke,
  showActions = true
}) => {
  const {
    id,
    status,
    status_display,
    device,
    ip_address,
    location,
    created_at,
    last_activity,
    expires_at
  } = session;

  const getDeviceIcon = () => {
    const type = device?.device_type?.toLowerCase();
    if (type === 'mobile') return Smartphone;
    if (type === 'tablet') return Tablet;
    return Monitor;
  };

  const DeviceIcon = getDeviceIcon();

  const isActive = status === 'active';
  const isExpired = status === 'expired';
  const isRevoked = status === 'revoked';

  return (
    <div className={`bg-white rounded-lg border p-4 ${
      isCurrentSession ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'
    }`}>
      <div className="flex items-start gap-4">
        {/* Device Icon */}
        <div className={`p-3 rounded-lg ${
          isActive ? 'bg-green-100' : 'bg-gray-100'
        }`}>
          <DeviceIcon className={`w-6 h-6 ${
            isActive ? 'text-green-600' : 'text-gray-400'
          }`} />
        </div>

        {/* Session Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900">
              {device?.browser || 'Unknown Browser'}
            </h4>
            {isCurrentSession && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                Current Session
              </span>
            )}
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              auditService.getSessionStatusColor(status)
            }`}>
              {status_display || status}
            </span>
          </div>

          <p className="text-sm text-gray-600 mt-1">
            {device?.os || 'Unknown OS'}
            {device?.device && ` • ${device.device}`}
          </p>

          {/* Details */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
            {ip_address && (
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {ip_address}
              </span>
            )}
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {location.city}, {location.country}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last active: {auditService.formatTimeAgo(last_activity)}
            </span>
          </div>

          {/* Created & Expires */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span>Created: {new Date(created_at).toLocaleString()}</span>
            {expires_at && (
              <span>Expires: {new Date(expires_at).toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        {showActions && isActive && !isCurrentSession && onRevoke && (
          <button
            onClick={() => onRevoke(id)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Revoke
          </button>
        )}
      </div>

      {/* Security Warning */}
      {isActive && !isCurrentSession && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            If you don't recognize this session, revoke it immediately
          </p>
        </div>
      )}
    </div>
  );
};

export default SessionCard;
