/**
 * Import/Export Service - Phase 5
 * API calls for bulk import and export operations
 */
import api from './api';

const importExportService = {
  // ============== Import Templates ==============
  getImportTemplates: async (entityType = null) => {
    const params = entityType ? { entity_type: entityType } : {};
    const response = await api.get('/data/import/templates', { params });
    return response.data;
  },

  getTemplateFields: async (entityType) => {
    const response = await api.get(`/data/import/templates/${entityType}/fields`);
    return response.data;
  },

  downloadTemplate: async (entityType) => {
    const response = await api.get(`/data/import/templates/${entityType}/download`, {
      responseType: 'blob'
    });
    return response;
  },

  // ============== Import Operations ==============
  validateImport: async (entityType, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entity_type', entityType);
    
    const response = await api.post('/data/import/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { entity_type: entityType }
    });
    return response.data;
  },

  startImport: async (data, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('data', JSON.stringify(data));
    
    const response = await api.post('/data/import/start', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  getImportJobs: async (params = {}) => {
    const response = await api.get('/data/import/jobs', { params });
    return response.data;
  },

  getImportJob: async (importId) => {
    const response = await api.get(`/data/import/jobs/${importId}`);
    return response.data;
  },

  // ============== Export Operations ==============
  createExport: async (data) => {
    const response = await api.post('/data/export', data);
    return response.data;
  },

  getExportJobs: async (params = {}) => {
    const response = await api.get('/data/export/jobs', { params });
    return response.data;
  },

  getExportJob: async (exportId) => {
    const response = await api.get(`/data/export/jobs/${exportId}`);
    return response.data;
  },

  downloadExport: async (exportId) => {
    const response = await api.get(`/data/export/jobs/${exportId}/download`);
    return response.data;
  },

  // ============== Quick Exports ==============
  exportCandidates: async (params = {}) => {
    const response = await api.get('/data/export/candidates', {
      params,
      responseType: 'blob'
    });
    return response;
  },

  // ============== Entity Types ==============
  getEntityTypes: () => [
    { value: 'candidates', label: 'Candidates', icon: 'Users' },
    { value: 'clients', label: 'Clients', icon: 'Building' },
    { value: 'jobs', label: 'Jobs', icon: 'Briefcase' },
    { value: 'applications', label: 'Applications', icon: 'FileText' },
    { value: 'users', label: 'Users', icon: 'UserCog' }
  ],

  // ============== Import Actions ==============
  getImportActions: () => [
    { value: 'skip', label: 'Skip Duplicates', description: 'Ignore rows that already exist' },
    { value: 'update', label: 'Update Existing', description: 'Update existing records with new data' },
    { value: 'create_new', label: 'Create New', description: 'Always create new records' }
  ],

  // ============== Export Formats ==============
  getExportFormats: () => [
    { value: 'excel', label: 'Excel (.xlsx)' },
    { value: 'csv', label: 'CSV (.csv)' },
    { value: 'json', label: 'JSON (.json)' }
  ],

  // ============== File Helpers ==============
  parseCSV: (content) => {
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }
    
    return { headers, data };
  },

  downloadFile: (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  getStatusColor: (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      completed_with_errors: 'bg-orange-100 text-orange-800',
      failed: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }
};

export default importExportService;
