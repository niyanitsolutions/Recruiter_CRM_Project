/**
 * Reports Page - Phase 5
 * Main reports listing and generation page
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Plus, Search, Filter, Download, Calendar, Clock,
  Play, Star, Trash2, Edit, MoreVertical, ChevronRight,
  BarChart2, PieChart, TrendingUp, Users, DollarSign, Briefcase
} from 'lucide-react';
import reportService from '../../services/reportService';

const ReportsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('generate');
  const [reportTypes, setReportTypes] = useState([]);
  const [savedReports, setSavedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [typesRes, savedRes] = await Promise.all([
        reportService.getReportTypes(),
        reportService.getSavedReports()
      ]);
      setReportTypes(typesRes.report_types || []);
      setSavedReports(savedRes.items || []);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { value: 'all', label: 'All Reports', icon: FileText },
    { value: 'recruitment', label: 'Recruitment', icon: Users },
    { value: 'financial', label: 'Financial', icon: DollarSign },
    { value: 'onboarding', label: 'Onboarding', icon: Briefcase },
    { value: 'team', label: 'Team', icon: TrendingUp }
  ];

  const getCategoryIcon = (category) => {
    const icons = {
      recruitment: Users,
      financial: DollarSign,
      onboarding: Briefcase,
      team: TrendingUp
    };
    return icons[category] || FileText;
  };

  const getReportIcon = (type) => {
    if (type.includes('funnel') || type.includes('pipeline')) return PieChart;
    if (type.includes('trend') || type.includes('time')) return TrendingUp;
    if (type.includes('revenue') || type.includes('payout')) return DollarSign;
    return BarChart2;
  };

  const filteredTypes = reportTypes.filter(rt => {
    if (selectedCategory !== 'all' && rt.category !== selectedCategory) return false;
    if (searchQuery && !rt.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleGenerateReport = (reportType) => {
    navigate(`/reports/generate/${reportType.type}`);
  };

  const handleRunSavedReport = async (reportId) => {
    try {
      const result = await reportService.runSavedReport(reportId);
      navigate(`/reports/view/${result.id}`);
    } catch (error) {
      console.error('Error running report:', error);
    }
  };

  const handleDeleteSavedReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this saved report?')) return;
    
    try {
      await reportService.deleteSavedReport(reportId);
      setSavedReports(savedReports.filter(r => r.id !== reportId));
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Generate and manage your reports</p>
        </div>
        
        <button
          onClick={() => navigate('/reports/saved')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Star className="w-4 h-4" />
          Saved Reports ({savedReports.length})
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('generate')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'generate'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Generate Report
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'saved'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Saved Reports
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'scheduled'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Scheduled
          </button>
        </nav>
      </div>

      {activeTab === 'generate' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {categories.map(cat => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.value}
                    onClick={() => setSelectedCategory(cat.value)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                      selectedCategory === cat.value
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Report Types Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTypes.map((rt) => {
              const Icon = getReportIcon(rt.type);
              const CategoryIcon = getCategoryIcon(rt.category);
              
              return (
                <div
                  key={rt.type}
                  onClick={() => handleGenerateReport(rt)}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                      <CategoryIcon className="w-3 h-3" />
                      {rt.category}
                    </span>
                  </div>
                  
                  <h3 className="mt-4 text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {rt.name}
                  </h3>
                  
                  <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                    {getReportDescription(rt.type)}
                  </p>
                  
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-blue-600 font-medium group-hover:underline">
                      Generate Report
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>

          {filteredTypes.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No reports found matching your criteria</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'saved' && (
        <SavedReportsTab
          reports={savedReports}
          onRun={handleRunSavedReport}
          onDelete={handleDeleteSavedReport}
          onEdit={(id) => navigate(`/reports/edit/${id}`)}
        />
      )}

      {activeTab === 'scheduled' && (
        <ScheduledReportsTab reports={savedReports.filter(r => r.schedule)} />
      )}
    </div>
  );
};

// Saved Reports Tab Component
const SavedReportsTab = ({ reports, onRun, onDelete, onEdit }) => {
  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No saved reports</h3>
        <p className="text-gray-500">Save reports to quickly access them later</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <div
          key={report.id}
          className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{report.name}</h4>
                <p className="text-sm text-gray-500">
                  {report.report_type_display} • Last run: {report.last_run || 'Never'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRun(report.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Run
              </button>
              <button
                onClick={() => onEdit(report.id)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(report.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Scheduled Reports Tab Component
const ScheduledReportsTab = ({ reports }) => {
  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No scheduled reports</h3>
        <p className="text-gray-500">Schedule reports to receive them automatically</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <div
          key={report.id}
          className="bg-white rounded-lg border border-gray-200 p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-50 rounded-lg">
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{report.name}</h4>
                <p className="text-sm text-gray-500">
                  {report.schedule?.frequency} • Next run: {report.schedule?.next_run || 'Pending'}
                </p>
              </div>
            </div>
            
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              Active
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper function for report descriptions
const getReportDescription = (type) => {
  const descriptions = {
    placements_summary: 'Overview of all placements with status breakdown and trends',
    application_funnel: 'Track candidate progression through application stages',
    time_to_hire: 'Analyze average time from application to placement',
    source_effectiveness: 'Compare candidate sources by quality and conversion',
    job_aging: 'Monitor job postings by age and status',
    payout_summary: 'Summary of partner payouts and commissions',
    invoice_aging: 'Track outstanding invoices by age',
    revenue_by_client: 'Revenue breakdown by client company',
    offer_acceptance: 'Offer acceptance rates and trends',
    coordinator_activity: 'Team member activity and performance metrics'
  };
  return descriptions[type] || 'Generate detailed insights and analytics';
};

export default ReportsPage;
