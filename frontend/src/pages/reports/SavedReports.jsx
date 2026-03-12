/**
 * Saved Reports Page - Phase 5
 * Displays and manages saved report configurations
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Search, Filter, Plus, Play, Edit, Trash2, Clock,
  Calendar, Star, MoreVertical, Download, Copy, Share2
} from 'lucide-react';
import reportService from '../../services/reportService';
import ScheduleReportModal from './components/ScheduleReportModal';

const SavedReports = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    loadReports();
  }, [selectedCategory]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const params = selectedCategory !== 'all' ? { category: selectedCategory } : {};
      const res = await reportService.getSavedReports(params);
      setReports(res.items || []);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunReport = async (reportId) => {
    try {
      const result = await reportService.runSavedReport(reportId);
      navigate(`/reports/view/${result.id || reportId}`);
    } catch (error) {
      console.error('Error running report:', error);
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this saved report?')) return;
    
    try {
      await reportService.deleteSavedReport(reportId);
      setReports(reports.filter(r => r.id !== reportId));
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  const handleDuplicateReport = async (report) => {
    try {
      await reportService.saveReport({
        name: `${report.name} (Copy)`,
        report_type: report.report_type,
        filters: report.filters,
        columns: report.columns
      });
      loadReports();
    } catch (error) {
      console.error('Error duplicating report:', error);
    }
  };

  const handleScheduleReport = (report) => {
    setSelectedReport(report);
    setShowScheduleModal(true);
  };

  const filteredReports = reports.filter(report => {
    if (searchQuery && !report.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const categories = [
    { value: 'all', label: 'All' },
    { value: 'recruitment', label: 'Recruitment' },
    { value: 'financial', label: 'Financial' },
    { value: 'onboarding', label: 'Onboarding' },
    { value: 'team', label: 'Team' }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saved Reports</h1>
          <p className="text-gray-500 mt-1">Manage your saved report configurations</p>
        </div>
        
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create New Report
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search saved reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2">
          {categories.map(cat => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-gray-200 rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No saved reports</h3>
          <p className="text-gray-500 mb-4">Create and save reports to access them quickly</p>
          <button
            onClick={() => navigate('/reports')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create Report
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map(report => (
            <ReportCard
              key={report.id}
              report={report}
              onRun={() => handleRunReport(report.id)}
              onEdit={() => navigate(`/reports/edit/${report.id}`)}
              onDelete={() => handleDeleteReport(report.id)}
              onDuplicate={() => handleDuplicateReport(report)}
              onSchedule={() => handleScheduleReport(report)}
            />
          ))}
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && selectedReport && (
        <ScheduleReportModal
          report={selectedReport}
          onClose={() => {
            setShowScheduleModal(false);
            setSelectedReport(null);
          }}
          onSave={() => {
            setShowScheduleModal(false);
            setSelectedReport(null);
            loadReports();
          }}
        />
      )}
    </div>
  );
};

// Report Card Component
const ReportCard = ({ report, onRun, onEdit, onDelete, onDuplicate, onSchedule }) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 bg-blue-50 rounded-xl">
          <FileText className="w-6 h-6 text-blue-600" />
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              <button
                onClick={() => { setShowMenu(false); onEdit(); }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => { setShowMenu(false); onDuplicate(); }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> Duplicate
              </button>
              <button
                onClick={() => { setShowMenu(false); onSchedule(); }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Clock className="w-4 h-4" /> Schedule
              </button>
              <hr className="my-1" />
              <button
                onClick={() => { setShowMenu(false); onDelete(); }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <h3 className="font-semibold text-gray-900 mb-1">{report.name}</h3>
      <p className="text-sm text-gray-500 mb-3">
        {report.report_type_display || report.report_type}
      </p>

      {report.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{report.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
        {report.last_run && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last run: {new Date(report.last_run).toLocaleDateString()}
          </span>
        )}
        {report.schedule && (
          <span className="flex items-center gap-1 text-green-600">
            <Calendar className="w-3 h-3" />
            Scheduled
          </span>
        )}
      </div>

      <button
        onClick={onRun}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Play className="w-4 h-4" />
        Run Report
      </button>
    </div>
  );
};

export default SavedReports;
