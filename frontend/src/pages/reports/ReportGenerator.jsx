/**
 * Report Generator - Phase 5
 * Form for generating reports with filters and options
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Download, Save, Play, Filter,
  FileSpreadsheet, FileText, Loader, CheckCircle, AlertCircle
} from 'lucide-react';
import reportService from '../../services/reportService';
import ReportViewer from './ReportViewer';

const ReportGenerator = () => {
  const { reportType } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState({
    dateRange: {
      preset: 'this_month',
      start_date: null,
      end_date: null
    },
    client_ids: [],
    partner_ids: [],
    status: [],
    group_by: null
  });
  
  const [exportFormat, setExportFormat] = useState('excel');

  const reportTypeInfo = getReportTypeInfo(reportType);

  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      setError(null);
      
      const data = await reportService.generateReport({
        report_type: reportType,
        filters: filters,
        format: exportFormat
      });
      
      setReportData(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportReport = async () => {
    try {
      setLoading(true);
      
      const response = await reportService.exportReport({
        report_type: reportType,
        filters: filters,
        format: exportFormat
      });
      
      const filename = `${reportType}_${new Date().toISOString().split('T')[0]}.${
        exportFormat === 'excel' ? 'xlsx' : exportFormat
      }`;
      
      reportService.downloadReport(response.data, filename);
    } catch (err) {
      setError('Failed to export report');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReport = async (name, description) => {
    try {
      await reportService.saveReport({
        name,
        description,
        report_type: reportType,
        filters: filters,
        columns: reportData?.columns || []
      });
      setShowSaveModal(false);
    } catch (err) {
      setError('Failed to save report');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/reports')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{reportTypeInfo.name}</h1>
          <p className="text-gray-500 mt-1">{reportTypeInfo.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-6 sticky top-6">
            <div className="flex items-center gap-2 text-gray-900 font-semibold">
              <Filter className="w-4 h-4" />
              Filters
            </div>

            {/* Date Range */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Date Range
              </label>
              <select
                value={filters.dateRange.preset}
                onChange={(e) => setFilters({
                  ...filters,
                  dateRange: { ...filters.dateRange, preset: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {reportService.getDatePresets().map(preset => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>

              {filters.dateRange.preset === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={filters.dateRange.start_date || ''}
                    onChange={(e) => setFilters({
                      ...filters,
                      dateRange: { ...filters.dateRange, start_date: e.target.value }
                    })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="date"
                    value={filters.dateRange.end_date || ''}
                    onChange={(e) => setFilters({
                      ...filters,
                      dateRange: { ...filters.dateRange, end_date: e.target.value }
                    })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>

            {/* Group By */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Group By
              </label>
              <select
                value={filters.group_by || ''}
                onChange={(e) => setFilters({ ...filters, group_by: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="client">Client</option>
                <option value="coordinator">Coordinator</option>
              </select>
            </div>

            {/* Export Format */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Export Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {reportService.getExportFormats().map(format => (
                  <button
                    key={format.value}
                    onClick={() => setExportFormat(format.value)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      exportFormat === format.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {format.value.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleGenerateReport}
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Generate Report
                  </>
                )}
              </button>

              {reportData && (
                <>
                  <button
                    onClick={handleExportReport}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export {exportFormat.toUpperCase()}
                  </button>

                  <button
                    onClick={() => setShowSaveModal(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Report
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="lg:col-span-3">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {!reportData && !generating && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Configure and Generate Report
              </h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Select your filters and click "Generate Report" to view the results
              </p>
            </div>
          )}

          {generating && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Loader className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Generating Report...
              </h3>
              <p className="text-gray-500">This may take a few moments</p>
            </div>
          )}

          {reportData && !generating && (
            <ReportViewer data={reportData} reportType={reportType} />
          )}
        </div>
      </div>

      {/* Save Report Modal */}
      {showSaveModal && (
        <SaveReportModal
          onSave={handleSaveReport}
          onClose={() => setShowSaveModal(false)}
          reportType={reportType}
        />
      )}
    </div>
  );
};

// Save Report Modal
const SaveReportModal = ({ onSave, onClose, reportType }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(name, description);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Save Report</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Monthly Placements Report"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this report..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Helper function for report type info
const getReportTypeInfo = (type) => {
  const info = {
    placements_summary: {
      name: 'Placements Summary',
      description: 'Overview of all placements with status breakdown and trends'
    },
    application_funnel: {
      name: 'Application Funnel',
      description: 'Track candidate progression through application stages'
    },
    time_to_hire: {
      name: 'Time to Hire',
      description: 'Analyze average time from application to placement'
    },
    source_effectiveness: {
      name: 'Source Effectiveness',
      description: 'Compare candidate sources by quality and conversion'
    },
    job_aging: {
      name: 'Job Aging Report',
      description: 'Monitor job postings by age and status'
    },
    payout_summary: {
      name: 'Payout Summary',
      description: 'Summary of partner payouts and commissions'
    },
    invoice_aging: {
      name: 'Invoice Aging',
      description: 'Track outstanding invoices by age'
    },
    revenue_by_client: {
      name: 'Revenue by Client',
      description: 'Revenue breakdown by client company'
    },
    offer_acceptance: {
      name: 'Offer Acceptance',
      description: 'Offer acceptance rates and trends'
    },
    coordinator_activity: {
      name: 'Coordinator Activity',
      description: 'Team member activity and performance metrics'
    }
  };
  
  return info[type] || { name: type, description: 'Generate report' };
};

export default ReportGenerator;
