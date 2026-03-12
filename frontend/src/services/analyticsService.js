/**
 * Analytics Service - Phase 5
 * API calls for analytics and dashboard module
 */
import api from './api';

const analyticsService = {
  // ============== Dashboard ==============
  getDashboard: async (params = {}) => {
    const response = await api.get('/analytics/dashboard', { params });
    return response.data;
  },

  getKPIs: async (params = {}) => {
    const response = await api.get('/analytics/kpis', { params });
    return response.data;
  },

  // ============== Specific Analytics ==============
  getRecruitmentAnalytics: async (params = {}) => {
    const response = await api.get('/analytics/recruitment', { params });
    return response.data;
  },

  getFinancialAnalytics: async (params = {}) => {
    const response = await api.get('/analytics/financial', { params });
    return response.data;
  },

  getOnboardingAnalytics: async (params = {}) => {
    const response = await api.get('/analytics/onboarding', { params });
    return response.data;
  },

  getTeamAnalytics: async (params = {}) => {
    const response = await api.get('/analytics/team', { params });
    return response.data;
  },

  // ============== Dashboard Layout ==============
  getDashboardLayout: async () => {
    const response = await api.get('/analytics/layout');
    return response.data;
  },

  saveDashboardLayout: async (data) => {
    const response = await api.post('/analytics/layout', data);
    return response.data;
  },

  updateDashboardLayout: async (layoutId, data) => {
    const response = await api.put(`/analytics/layout/${layoutId}`, data);
    return response.data;
  },

  // ============== Widget Data ==============
  getWidgetData: async (widgetId, params = {}) => {
    const response = await api.get(`/analytics/widget/${widgetId}`, { params });
    return response.data;
  },

  // ============== Charts ==============
  getChartData: async (chartType, metric, params = {}) => {
    const response = await api.get(`/analytics/charts/${chartType}`, {
      params: { metric, ...params }
    });
    return response.data;
  },

  // ============== Comparison Periods ==============
  getComparisonPeriods: () => [
    { value: 'previous_period', label: 'Previous Period' },
    { value: 'previous_month', label: 'Previous Month' },
    { value: 'previous_quarter', label: 'Previous Quarter' },
    { value: 'previous_year', label: 'Previous Year' },
    { value: 'same_period_last_year', label: 'Same Period Last Year' }
  ],

  // ============== Chart Colors ==============
  getChartColors: () => ({
    primary: '#3B82F6',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    purple: '#8B5CF6',
    pink: '#EC4899',
    teal: '#14B8A6',
    orange: '#F97316',
    indigo: '#6366F1',
    lime: '#84CC16',
    palette: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']
  }),

  // ============== Default Widgets ==============
  getDefaultWidgets: () => [
    { id: 'kpi_placements', type: 'kpi', title: 'Total Placements', size: 'small' },
    { id: 'kpi_revenue', type: 'kpi', title: 'Total Revenue', size: 'small' },
    { id: 'kpi_active_jobs', type: 'kpi', title: 'Active Jobs', size: 'small' },
    { id: 'kpi_pending_interviews', type: 'kpi', title: 'Pending Interviews', size: 'small' },
    { id: 'chart_placements_trend', type: 'line', title: 'Placements Trend', size: 'large' },
    { id: 'chart_application_funnel', type: 'funnel', title: 'Application Funnel', size: 'medium' },
    { id: 'chart_revenue_by_client', type: 'pie', title: 'Revenue by Client', size: 'medium' }
  ],

  // ============== Format Helpers ==============
  formatCurrency: (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  },

  formatNumber: (value) => {
    return new Intl.NumberFormat('en-IN').format(value);
  },

  formatPercentage: (value) => {
    return `${value.toFixed(1)}%`;
  },

  getTrendIcon: (direction) => {
    switch (direction) {
      case 'up': return 'TrendingUp';
      case 'down': return 'TrendingDown';
      default: return 'Minus';
    }
  },

  getTrendColor: (direction, isPositiveGood = true) => {
    if (direction === 'up') {
      return isPositiveGood ? 'text-green-500' : 'text-red-500';
    } else if (direction === 'down') {
      return isPositiveGood ? 'text-red-500' : 'text-green-500';
    }
    return 'text-gray-500';
  }
};

export default analyticsService;
