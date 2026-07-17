/**
 * Report Service - Phase 5
 * API calls for reports module
 */
import api from './api';

const LONG_OP_TIMEOUT = 120_000 // matches nginx proxy_read_timeout for reports/imports/exports

const reportService = {
  // ============== Report Types ==============
  getReportTypes: async (category = null) => {
    const params = category ? { category } : {};
    const response = await api.get('/reports/types', { params });
    return response.data;
  },

  getReportCategories: async () => {
    const response = await api.get('/reports/categories');
    return response.data;
  },

  // ============== Report Generation ==============
  generateReport: async (data) => {
    const response = await api.post('/reports/generate', data, { timeout: LONG_OP_TIMEOUT });
    return response.data;
  },

  generateReportByType: async (reportType, filters = {}) => {
    const response = await api.post(`/reports/generate/${reportType}`, null, { params: filters, timeout: LONG_OP_TIMEOUT });
    return response.data;
  },

  // ============== Report Export ==============
  exportReport: async (data) => {
    const response = await api.post('/reports/export', data, {
      responseType: 'blob',
      timeout: LONG_OP_TIMEOUT
    });
    return response;
  },

  downloadReport: (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // ============== Saved Reports ==============
  getSavedReports: async (params = {}) => {
    const response = await api.get('/reports/saved', { params });
    return response.data;
  },

  getSavedReport: async (reportId) => {
    const response = await api.get(`/reports/saved/${reportId}`);
    return response.data;
  },

  saveReport: async (data) => {
    const response = await api.post('/reports/saved', data);
    return response.data;
  },

  updateSavedReport: async (reportId, data) => {
    const response = await api.put(`/reports/saved/${reportId}`, data);
    return response.data;
  },

  deleteSavedReport: async (reportId) => {
    const response = await api.delete(`/reports/saved/${reportId}`);
    return response.data;
  },

  runSavedReport: async (reportId) => {
    const response = await api.post(`/reports/saved/${reportId}/run`, null, { timeout: LONG_OP_TIMEOUT });
    return response.data;
  },

  // ============== Report Presets ==============
  getDatePresets: () => [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this_week', label: 'This Week' },
    { value: 'last_week', label: 'Last Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_quarter', label: 'This Quarter' },
    { value: 'last_quarter', label: 'Last Quarter' },
    { value: 'last_6_months', label: 'Last 6 Months' },
    { value: 'last_12_months', label: 'Last 12 Months' },
    { value: 'this_year', label: 'This Year' },
    { value: 'last_year', label: 'Last Year' },
    { value: 'custom', label: 'Custom Range' }
  ],

  getExportFormats: () => [
    { value: 'excel', label: 'Excel (.xlsx)', icon: 'FileSpreadsheet' },
    { value: 'csv', label: 'CSV (.csv)', icon: 'FileText' },
    { value: 'pdf', label: 'PDF (.pdf)', icon: 'FileText' }
  ],

  getScheduleFrequencies: () => [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ]
};

export default reportService;
