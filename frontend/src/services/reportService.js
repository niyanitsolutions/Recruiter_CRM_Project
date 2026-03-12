/**
 * Report Service - Phase 5
 * API calls for reports module
 */
import api from './api';

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
    const response = await api.post('/reports/generate', data);
    return response.data;
  },

  generateReportByType: async (reportType, filters = {}) => {
    const response = await api.post(`/reports/generate/${reportType}`, null, { params: filters });
    return response.data;
  },

  // ============== Report Export ==============
  exportReport: async (data) => {
    const response = await api.post('/reports/export', data, {
      responseType: 'blob'
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
    const response = await api.post(`/reports/saved/${reportId}/run`);
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
    { value: 'this_year', label: 'This Year' },
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
