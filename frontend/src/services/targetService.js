/**
 * Target Service - Phase 5
 * API calls for goals and targets module
 */
import api from './api';

const targetService = {
  // ============== Target Types ==============
  getTargetTypes: async () => {
    const response = await api.get('/targets/types');
    return response.data;
  },

  getTargetPeriods: async () => {
    const response = await api.get('/targets/periods');
    return response.data;
  },

  // ============== Target CRUD ==============
  getTargets: async (params = {}) => {
    const response = await api.get('/targets', { params });
    return response.data;
  },

  getTarget: async (targetId) => {
    const response = await api.get(`/targets/${targetId}`);
    return response.data;
  },

  getMyTargets: async (params = {}) => {
    const response = await api.get('/targets/my-targets', { params });
    return response.data;
  },

  createTarget: async (data) => {
    const response = await api.post('/targets', data);
    return response.data;
  },

  updateTarget: async (targetId, data) => {
    const response = await api.put(`/targets/${targetId}`, data);
    return response.data;
  },

  deleteTarget: async (targetId) => {
    const response = await api.delete(`/targets/${targetId}`);
    return response.data;
  },

  // ============== Bulk Operations ==============
  bulkCreateTargets: async (data) => {
    const response = await api.post('/targets/bulk', data);
    return response.data;
  },

  // ============== Progress ==============
  updateProgress: async (targetId, data) => {
    const response = await api.put(`/targets/${targetId}/progress`, data);
    return response.data;
  },

  incrementProgress: async (targetId, increment) => {
    const response = await api.post(`/targets/${targetId}/increment`, null, {
      params: { increment }
    });
    return response.data;
  },

  autoUpdateTargets: async () => {
    const response = await api.post('/targets/auto-update');
    return response.data;
  },

  // ============== Summary & Dashboard ==============
  getCompanySummary: async () => {
    const response = await api.get('/targets/summary/company');
    return response.data;
  },

  getUserSummary: async (userId) => {
    const response = await api.get(`/targets/summary/user/${userId}`);
    return response.data;
  },

  getMySummary: async () => {
    const response = await api.get('/targets/summary/me');
    return response.data;
  },

  getMyDashboard: async () => {
    const response = await api.get('/targets/dashboard/me');
    return response.data;
  },

  getUserDashboard: async (userId) => {
    const response = await api.get(`/targets/dashboard/user/${userId}`);
    return response.data;
  },

  // ============== Leaderboard ==============
  getLeaderboard: async (targetType, params = {}) => {
    const response = await api.get(`/targets/leaderboard/${targetType}`, { params });
    return response.data;
  },

  getMyRank: async (targetType, params = {}) => {
    const response = await api.get(`/targets/leaderboard/${targetType}/my-rank`, { params });
    return response.data;
  },

  // ============== Helper Functions ==============
  getTargetTypeOptions: () => [
    { value: 'placements', label: 'Placements', icon: 'UserCheck' },
    { value: 'revenue', label: 'Revenue', icon: 'DollarSign' },
    { value: 'interviews', label: 'Interviews', icon: 'Calendar' },
    { value: 'applications', label: 'Applications', icon: 'FileText' },
    { value: 'candidates_added', label: 'Candidates Added', icon: 'UserPlus' },
    { value: 'jobs_closed', label: 'Jobs Closed', icon: 'CheckCircle' },
    { value: 'offer_acceptance', label: 'Offer Acceptance', icon: 'ThumbsUp' },
    { value: 'client_acquisition', label: 'New Clients', icon: 'Building' }
  ],

  getPeriodOptions: () => [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' }
  ],

  getScopeOptions: () => [
    { value: 'individual', label: 'Individual' },
    { value: 'team', label: 'Team' },
    { value: 'company', label: 'Company-wide' }
  ],

  getStatusColor: (status) => {
    const colors = {
      not_started: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      achieved: 'bg-green-100 text-green-800',
      exceeded: 'bg-emerald-100 text-emerald-800',
      missed: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  },

  getProgressColor: (percentage) => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  },

  getRankBadge: (rank) => {
    if (rank === 1) return { color: 'bg-yellow-400', icon: 'Trophy', label: '1st' };
    if (rank === 2) return { color: 'bg-gray-300', icon: 'Medal', label: '2nd' };
    if (rank === 3) return { color: 'bg-orange-400', icon: 'Medal', label: '3rd' };
    return { color: 'bg-gray-100', icon: null, label: `#${rank}` };
  },

  formatTargetValue: (value, type) => {
    if (type === 'revenue') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
      }).format(value);
    }
    if (type === 'offer_acceptance') {
      return `${value}%`;
    }
    return value.toString();
  }
};

export default targetService;
