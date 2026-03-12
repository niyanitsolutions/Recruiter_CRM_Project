/**
 * Audit Logs Page - Phase 5
 * Advanced audit logging with search, filters, and timeline
 */
import React, { useState, useEffect } from 'react';
import {
  Search, Filter, Calendar, User, Activity, Shield, Clock,
  ChevronDown, Download, RefreshCw, Eye, AlertTriangle,
  Monitor, Smartphone, Globe, LogIn, LogOut
} from 'lucide-react';
import auditAdvancedService from '../../services/auditAdvancedService';

const AuditLogsPage = () => {
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: '',
    severity: '',
    entity_type: '',
    user_id: '',
    search: ''
  });
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });

  useEffect(() => {
    loadData();
  }, [activeTab, filters, pagination.page]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'logs') {
        const res = await auditService.searchLogs({ ...filters, page: pagination.page });
        setLogs(res.items || []);
        setPagination({ page: res.page, total: res.total, pages: res.pages });
      } else if (activeTab === 'sessions') {
        const res = await auditService.getMySessions({ include_expired: true });
        setSessions(res.items || []);
      } else if (activeTab === 'alerts') {
        const res = await auditService.getSecurityAlerts();
        setAlerts(res.items || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    if (!window.confirm('Revoke this session?')) return;
    try {
      await auditService.revokeSession(sessionId);
      loadData();
    } catch (error) {
      console.error('Error revoking session:', error);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      await auditService.resolveAlert(alertId);
      loadData();
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const getActionIcon = (action) => {
    const icons = {
      login: LogIn,
      logout: LogOut,
      create: Activity,
      update: Activity,
      delete: Activity
    };
    return icons[action] || Activity;
  };

  const tabs = [
    { id: 'logs', label: 'Audit Logs', icon: Activity },
    { id: 'sessions', label: 'My Sessions', icon: Monitor },
    { id: 'alerts', label: 'Security Alerts', icon: Shield }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit & Security</h1>
          <p className="text-gray-500 mt-1">Monitor activity, sessions, and security alerts</p>
        </div>
        <button
          onClick={loadData}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Audit Logs Tab */}
      {activeTab === 'logs' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Actions</option>
              {auditService.getActionOptions().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Severity</option>
              {auditService.getSeverityOptions().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={filters.entity_type}
              onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Entities</option>
              {auditService.getEntityTypeOptions().map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Logs List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No audit logs found</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {logs.map(log => {
                  const ActionIcon = getActionIcon(log.action);
                  return (
                    <div key={log.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${
                          log.severity === 'high' || log.severity === 'critical'
                            ? 'bg-red-100'
                            : log.severity === 'medium'
                              ? 'bg-yellow-100'
                              : 'bg-gray-100'
                        }`}>
                          <ActionIcon className={`w-4 h-4 ${auditService.getActionColor(log.action)}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">
                            <span className="font-medium">{log.user_name}</span>
                            {' '}{log.action_display || log.action}{' '}
                            {log.entity_type && (
                              <span className="text-gray-600">
                                {log.entity_type}: {log.entity_name || log.entity_id}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">{log.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {log.time_ago || auditService.formatTimeAgo(log.timestamp)}
                            </span>
                            {log.ip_address && (
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {log.ip_address}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${auditService.getSeverityColor(log.severity)}`}>
                          {log.severity}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Page {pagination.page} of {pagination.pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                    disabled={pagination.page === pagination.pages}
                    className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No sessions found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sessions.map(session => {
                const DeviceIcon = session.device?.device_type === 'mobile' ? Smartphone : Monitor;
                return (
                  <div key={session.id} className="p-4 flex items-center gap-4">
                    <div className="p-3 bg-gray-100 rounded-lg">
                      <DeviceIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">
                          {session.device?.browser || 'Unknown Browser'}
                        </p>
                        {session.status === 'active' && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {session.device?.os || 'Unknown OS'} • {session.ip_address}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Last active: {auditService.formatTimeAgo(session.last_activity)}
                      </p>
                    </div>

                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${auditService.getSessionStatusColor(session.status)}`}>
                      {session.status_display || session.status}
                    </span>

                    {session.status === 'active' && (
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Security Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p>No security alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {alerts.map(alert => (
                <div key={alert.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      alert.severity === 'critical' ? 'bg-red-100' :
                      alert.severity === 'high' ? 'bg-orange-100' : 'bg-yellow-100'
                    }`}>
                      <AlertTriangle className={`w-5 h-5 ${
                        alert.severity === 'critical' ? 'text-red-600' :
                        alert.severity === 'high' ? 'text-orange-600' : 'text-yellow-600'
                      }`} />
                    </div>
                    
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{alert.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>{auditService.formatTimeAgo(alert.created_at)}</span>
                        {alert.user_name && <span>User: {alert.user_name}</span>}
                        {alert.ip_address && <span>IP: {alert.ip_address}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${auditService.getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      
                      {!alert.is_resolved && (
                        <button
                          onClick={() => handleResolveAlert(alert.id)}
                          className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
