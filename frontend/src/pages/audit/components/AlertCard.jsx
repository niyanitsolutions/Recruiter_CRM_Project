/**
 * Alert Card Component - Phase 5
 * Displays a security alert
 */
import React, { useState } from 'react';
import {
  AlertTriangle, AlertOctagon, Shield, MapPin, Clock,
  User, Globe, CheckCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import auditAdvancedService from '../../services/auditAdvancedService';

const AlertCard = ({
  alert,
  onResolve,
  showDetails = true
}) => {
  const [expanded, setExpanded] = useState(false);

  const {
    id,
    alert_type,
    alert_type_display,
    severity,
    severity_display,
    title,
    description,
    user_id,
    user_name,
    ip_address,
    location,
    metadata,
    is_resolved,
    resolved_at,
    resolved_by_name,
    resolution_notes,
    created_at
  } = alert;

  const getSeverityStyles = () => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: 'bg-red-100 text-red-600',
          badge: 'bg-red-100 text-red-700'
        };
      case 'high':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          icon: 'bg-orange-100 text-orange-600',
          badge: 'bg-orange-100 text-orange-700'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: 'bg-yellow-100 text-yellow-600',
          badge: 'bg-yellow-100 text-yellow-700'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          icon: 'bg-gray-100 text-gray-600',
          badge: 'bg-gray-100 text-gray-700'
        };
    }
  };

  const getAlertIcon = () => {
    switch (alert_type) {
      case 'multiple_login_failures':
      case 'suspicious_activity':
        return AlertOctagon;
      case 'permission_escalation':
      case 'bulk_data_export':
        return Shield;
      default:
        return AlertTriangle;
    }
  };

  const styles = getSeverityStyles();
  const AlertIcon = getAlertIcon();

  return (
    <div className={`rounded-lg border ${styles.border} ${is_resolved ? 'bg-white' : styles.bg}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`p-2 rounded-lg ${styles.icon}`}>
            <AlertIcon className="w-5 h-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-medium text-gray-900">{title}</h4>
                <p className="text-sm text-gray-600 mt-1">{description}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles.badge}`}>
                  {severity_display || severity}
                </span>
                {is_resolved && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Resolved
                  </span>
                )}
              </div>
            </div>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {auditService.formatTimeAgo(created_at)}
              </span>
              {user_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {user_name}
                </span>
              )}
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
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
          {showDetails && metadata && Object.keys(metadata).length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {expanded ? 'Hide' : 'Show'} Details
            </button>
          )}

          {!is_resolved && onResolve && (
            <button
              onClick={() => onResolve(id)}
              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Mark as Resolved
            </button>
          )}

          {is_resolved && (
            <p className="text-xs text-gray-500">
              Resolved by {resolved_by_name} • {new Date(resolved_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && metadata && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <h5 className="text-xs font-medium text-gray-700 mb-2">Additional Details</h5>
            <div className="space-y-1">
              {Object.entries(metadata).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-gray-500">{key.replace(/_/g, ' ')}:</span>
                  <span className="text-gray-900 font-medium">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {resolution_notes && (
            <div className="mt-3 bg-green-50 rounded-lg border border-green-200 p-3">
              <h5 className="text-xs font-medium text-green-700 mb-1">Resolution Notes</h5>
              <p className="text-sm text-green-800">{resolution_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertCard;
