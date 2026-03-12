/**
 * Audit Advanced Service - Phase 5
 * API calls for advanced audit features: sessions, alerts, security
 * Note: Basic audit logging uses auditService from Phase 2 (/audit-logs/)
 * This service handles advanced features (/audit/)
 */
import api from './api';

const auditAdvancedService = {
  // ============== Enhanced Audit Logs ==============
  searchLogs: async (params = {}) => {
    const response = await api.get('/audit/logs', { params });
    return response.data;
  },

  getTimeline: async (params = {}) => {
    const response = await api.get('/audit/timeline', { params });
    return response.data;
  },

  getEntityHistory: async (entityType, entityId) => {
    const response = await api.get(`/audit/entity/${entityType}/${entityId}/history`);
    return response.data;
  },

  getAuditSummary: async (params = {}) => {
    const response = await api.get('/audit/summary', { params });
    return response.data;
  },

  // ============== Sessions ==============
  getSessions: async (params = {}) => {
    const response = await api.get('/audit/sessions', { params });
    return response.data;
  },

  getMySessions: async (params = {}) => {
    const response = await api.get('/audit/sessions/my', { params });
    return response.data;
  },

  getSession: async (sessionId) => {
    const response = await api.get(`/audit/sessions/${sessionId}`);
    return response.data;
  },

  revokeSession: async (sessionId, reason = null) => {
    const response = await api.post(`/audit/sessions/${sessionId}/revoke`, null, {
      params: { reason }
    });
    return response.data;
  },

  revokeAllSessions: async (userId, reason = null) => {
    const response = await api.post('/audit/sessions/revoke-all', {
      user_id: userId,
      reason
    });
    return response.data;
  },

  revokeMyOtherSessions: async () => {
    const response = await api.post('/audit/sessions/revoke-my-other');
    return response.data;
  },

  // ============== Security Alerts ==============
  getSecurityAlerts: async (params = {}) => {
    const response = await api.get('/audit/alerts', { params });
    return response.data;
  },

  getUnresolvedAlertCount: async () => {
    const response = await api.get('/audit/alerts/unresolved-count');
    return response.data;
  },

  resolveAlert: async (alertId, resolutionNotes = null) => {
    const response = await api.post(`/audit/alerts/${alertId}/resolve`, {
      resolution_notes: resolutionNotes
    });
    return response.data;
  },

  // ============== Login History ==============
  getLoginHistory: async (userId, limit = 50) => {
    const response = await api.get(`/audit/login-history/${userId}`, {
      params: { limit }
    });
    return response.data;
  },

  getMyLoginHistory: async (limit = 50) => {
    const response = await api.get('/audit/login-history/me', {
      params: { limit }
    });
    return response.data;
  },

  // ============== User Activity ==============
  getUserActivity: async (userId) => {
    const response = await api.get(`/audit/activity/user/${userId}`);
    return response.data;
  },

  getMyActivity: async () => {
    const response = await api.get('/audit/activity/me');
    return response.data;
  },

  // ============== Admin Cleanup ==============
  cleanupSessions: async () => {
    const response = await api.post('/audit/cleanup/sessions');
    return response.data;
  },

  // ============== Helper Functions ==============
  getActionOptions: () => [
    { value: 'create', label: 'Created' },
    { value: 'read', label: 'Viewed' },
    { value: 'update', label: 'Updated' },
    { value: 'delete', label: 'Deleted' },
    { value: 'login', label: 'Logged In' },
    { value: 'logout', label: 'Logged Out' },
    { value: 'login_failed', label: 'Login Failed' },
    { value: 'export', label: 'Exported' },
    { value: 'import', label: 'Imported' },
    { value: 'status_change', label: 'Status Changed' }
  ],

  getSeverityOptions: () => [
    { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-800' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
    { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800' }
  ],

  getEntityTypeOptions: () => [
    { value: 'user', label: 'User' },
    { value: 'candidate', label: 'Candidate' },
    { value: 'client', label: 'Client' },
    { value: 'job', label: 'Job' },
    { value: 'application', label: 'Application' },
    { value: 'interview', label: 'Interview' },
    { value: 'onboard', label: 'Onboard' },
    { value: 'payout', label: 'Payout' },
    { value: 'settings', label: 'Settings' }
  ],

  getAlertTypeOptions: () => [
    { value: 'multiple_login_failures', label: 'Multiple Login Failures', icon: 'AlertTriangle' },
    { value: 'unusual_location', label: 'Unusual Location', icon: 'MapPin' },
    { value: 'unusual_time', label: 'Unusual Time', icon: 'Clock' },
    { value: 'sensitive_data_access', label: 'Sensitive Data Access', icon: 'Eye' },
    { value: 'bulk_data_export', label: 'Bulk Data Export', icon: 'Download' },
    { value: 'permission_escalation', label: 'Permission Escalation', icon: 'Shield' },
    { value: 'suspicious_activity', label: 'Suspicious Activity', icon: 'AlertOctagon' }
  ],

  getSeverityColor: (severity) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };
    return colors[severity] || 'bg-gray-100 text-gray-800';
  },

  getSessionStatusColor: (status) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      expired: 'bg-gray-100 text-gray-800',
      revoked: 'bg-red-100 text-red-800',
      logged_out: 'bg-blue-100 text-blue-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  },

  getActionColor: (action) => {
    const colors = {
      create: 'text-green-600',
      update: 'text-blue-600',
      delete: 'text-red-600',
      login: 'text-green-600',
      logout: 'text-gray-600',
      login_failed: 'text-red-600',
      export: 'text-purple-600',
      import: 'text-indigo-600'
    };
    return colors[action] || 'text-gray-600';
  },

  formatTimeAgo: (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    return `${Math.floor(seconds / 31536000)}y ago`;
  },

  getDeviceIcon: (deviceType) => {
    const icons = {
      desktop: 'Monitor',
      mobile: 'Smartphone',
      tablet: 'Tablet'
    };
    return icons[deviceType] || 'Monitor';
  }
};

export default auditAdvancedService;
