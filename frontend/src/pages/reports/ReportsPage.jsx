/**
 * Reports Page - Enterprise Grade
 * Premium Power BI-style report catalogue with 6 categories
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Search, Download, Calendar, Clock,
  Play, Star, Trash2, Edit, ChevronRight,
  BarChart2, PieChart, TrendingUp, Users, DollarSign, Briefcase,
  Shield, UserCheck, RefreshCw, Filter, X, MoreVertical,
  BookOpen, Layers, Activity, Target, AlertCircle
} from 'lucide-react';
import reportService from '../../services/reportService';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    value: 'all',
    label: 'All Reports',
    icon: Layers,
    gradient: 'from-slate-500 to-slate-700',
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    activeBg: 'bg-slate-700',
  },
  {
    value: 'recruitment',
    label: 'Recruitment',
    icon: Users,
    gradient: 'from-blue-500 to-blue-700',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    activeBg: 'bg-blue-600',
  },
  {
    value: 'client',
    label: 'Client',
    icon: Briefcase,
    gradient: 'from-violet-500 to-violet-700',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    activeBg: 'bg-violet-600',
  },
  {
    value: 'financial',
    label: 'Financial',
    icon: DollarSign,
    gradient: 'from-emerald-500 to-emerald-700',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    activeBg: 'bg-emerald-600',
  },
  {
    value: 'onboarding',
    label: 'Onboarding',
    icon: UserCheck,
    gradient: 'from-orange-500 to-orange-700',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    activeBg: 'bg-orange-600',
  },
  {
    value: 'team',
    label: 'Team',
    icon: Target,
    gradient: 'from-pink-500 to-pink-700',
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200',
    activeBg: 'bg-pink-600',
  },
  {
    value: 'audit',
    label: 'Audit',
    icon: Shield,
    gradient: 'from-red-500 to-red-700',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    activeBg: 'bg-red-600',
  },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

// ─── Icon resolver ─────────────────────────────────────────────────────────────

const getReportIcon = (type) => {
  if (type.includes('funnel') || type.includes('pipeline') || type.includes('source')) return PieChart;
  if (type.includes('trend') || type.includes('time') || type.includes('aging')) return TrendingUp;
  if (type.includes('revenue') || type.includes('payout') || type.includes('invoice') || type.includes('commission') || type.includes('tax') || type.includes('payment')) return DollarSign;
  if (type.includes('recruiter') || type.includes('productivity') || type.includes('performance')) return Activity;
  if (type.includes('login') || type.includes('audit') || type.includes('action')) return Shield;
  if (type.includes('document') || type.includes('compliance')) return BookOpen;
  if (type.includes('client')) return Briefcase;
  if (type.includes('offer') || type.includes('no_show') || type.includes('doj') || type.includes('eligibility')) return Calendar;
  return BarChart2;
};

// ─── Main component ───────────────────────────────────────────────────────────

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
        reportService.getSavedReports(),
      ]);
      setReportTypes(typesRes.report_types || []);
      setSavedReports(savedRes.items || []);
    } catch (err) {
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTypes = useMemo(() => {
    return reportTypes.filter(rt => {
      if (selectedCategory !== 'all' && rt.category !== selectedCategory) return false;
      if (searchQuery && !rt.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !rt.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [reportTypes, selectedCategory, searchQuery]);

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts = { all: reportTypes.length };
    for (const rt of reportTypes) {
      counts[rt.category] = (counts[rt.category] || 0) + 1;
    }
    return counts;
  }, [reportTypes]);

  const handleGenerateReport = (rt) => {
    navigate(`/reports/generate/${rt.type}`);
  };

  const handleRunSavedReport = async (reportId) => {
    try {
      const result = await reportService.runSavedReport(reportId);
      navigate(`/reports/view`, { state: { reportData: result } });
    } catch (err) {
      console.error('Error running report:', err);
    }
  };

  const handleDeleteSavedReport = async (reportId) => {
    if (!window.confirm('Delete this saved report?')) return;
    try {
      await reportService.deleteSavedReport(reportId);
      setSavedReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err) {
      console.error('Error deleting report:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2" />
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-72" />
        </div>
        <div className="flex gap-2">
          {[1,2,3,4,5,6,7].map(i => (
            <div key={i} className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-44 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">
            {reportTypes.length} reports across {CATEGORIES.length - 1} categories
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 text-sm font-medium transition-colors"
          >
            <Star className="w-4 h-4 text-amber-500" />
            Saved ({savedReports.length})
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1">
          {[
            { key: 'generate', label: 'Report Catalogue', icon: Layers },
            { key: 'saved', label: 'Saved Reports', icon: Star },
            { key: 'scheduled', label: 'Scheduled', icon: Clock },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Catalogue tab ── */}
      {activeTab === 'generate' && (
        <>
          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const count = categoryCounts[cat.value] || 0;
              const isActive = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                    isActive
                      ? `${cat.activeBg} text-white border-transparent shadow-sm`
                      : `bg-white dark:bg-gray-800 ${cat.text} ${cat.border} hover:${cat.bg} dark:border-gray-700`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search reports…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Report grid */}
          {filteredTypes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTypes.map(rt => {
                const cat = CATEGORY_MAP[rt.category] || CATEGORY_MAP['all'];
                const Icon = getReportIcon(rt.type);
                const CatIcon = cat.icon;
                return (
                  <ReportCard
                    key={rt.type}
                    rt={rt}
                    cat={cat}
                    Icon={Icon}
                    CatIcon={CatIcon}
                    onClick={() => handleGenerateReport(rt)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No reports match your criteria</p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Saved reports tab ── */}
      {activeTab === 'saved' && (
        <SavedReportsTab
          reports={savedReports}
          onRun={handleRunSavedReport}
          onDelete={handleDeleteSavedReport}
          onEdit={id => navigate(`/reports/edit/${id}`)}
        />
      )}

      {/* ── Scheduled tab ── */}
      {activeTab === 'scheduled' && (
        <ScheduledReportsTab reports={savedReports.filter(r => r.schedule)} />
      )}
    </div>
  );
};

// ─── Report card ───────────────────────────────────────────────────────────────

const ReportCard = ({ rt, cat, Icon, CatIcon, onClick }) => (
  <button
    onClick={onClick}
    className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    <div className="flex items-start justify-between mb-4">
      <div className={`p-2.5 ${cat.bg} rounded-xl transition-colors group-hover:scale-105`}>
        <Icon className={`w-5 h-5 ${cat.text}`} />
      </div>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${cat.bg} ${cat.text} border ${cat.border} rounded-full text-xs font-medium`}>
        <CatIcon className="w-3 h-3" />
        {cat.label}
      </span>
    </div>

    <h3 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
      {rt.name}
    </h3>

    {rt.description && (
      <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
        {rt.description}
      </p>
    )}

    <div className="mt-4 flex items-center justify-between">
      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">
        Generate Report
      </span>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
    </div>
  </button>
);

// ─── Saved reports tab ────────────────────────────────────────────────────────

const SavedReportsTab = ({ reports, onRun, onDelete, onEdit }) => {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mb-4">
          <Star className="w-8 h-8 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No saved reports</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Generate a report and save it for quick access</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map(report => {
        const cat = CATEGORY_MAP[report.category] || CATEGORY_MAP['all'];
        const CatIcon = cat.icon;
        return (
          <div
            key={report.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className={`p-2.5 ${cat.bg} rounded-xl flex-shrink-0`}>
                <CatIcon className={`w-5 h-5 ${cat.text}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 dark:text-white truncate">{report.name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {report.type_display || report.report_type} •{' '}
                  {report.last_run
                    ? `Last run: ${new Date(report.last_run).toLocaleDateString()}`
                    : 'Never run'}
                  {report.schedule && (
                    <span className="ml-2 inline-flex items-center gap-1 text-green-600">
                      <Clock className="w-3 h-3" /> Scheduled
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onRun(report.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run
                </button>
                <button
                  onClick={() => onEdit(report.id)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(report.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Scheduled reports tab ────────────────────────────────────────────────────

const ScheduledReportsTab = ({ reports }) => {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mb-4">
          <Clock className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No scheduled reports</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Save a report with a schedule to receive it automatically by email
        </p>
      </div>
    );
  }

  const freqLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly' };

  return (
    <div className="space-y-3">
      {reports.map(report => (
        <div
          key={report.id}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
        >
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-xl flex-shrink-0">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 dark:text-white">{report.name}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {freqLabel[report.schedule?.frequency] || report.schedule?.frequency} •{' '}
                Next: {report.next_run
                  ? new Date(report.next_run).toLocaleDateString()
                  : 'Pending'}
                {report.schedule?.recipients?.length > 0 && (
                  <> • {report.schedule.recipients.length} recipient{report.schedule.recipients.length > 1 ? 's' : ''}</>
                )}
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              report.schedule?.is_active
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {report.schedule?.is_active ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ReportsPage;
