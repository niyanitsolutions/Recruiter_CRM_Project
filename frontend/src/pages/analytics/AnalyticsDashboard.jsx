/**
 * Analytics Dashboard - Phase 5
 * Main analytics page with KPIs, charts, and customizable widgets
 */
import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Users, Briefcase, DollarSign,
  Calendar, UserCheck, Clock, FileText, RefreshCw, Settings,
  Download, Filter, ChevronDown
} from 'lucide-react';
import analyticsService from '../../services/analyticsService';
import KPICard from './components/KPICard';
import TrendChart from './components/TrendChart';
import FunnelChart from './components/FunnelChart';
import PieChart from './components/PieChart';
import BarChart from './components/BarChart';

const AnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('this_month');
  const [comparison, setComparison] = useState('previous_period');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, [dateRange, comparison]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await analyticsService.getDashboard({ comparison });
      setDashboard(data);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      const status = err?.response?.status;
      if (status === 403) {
        setError('You do not have permission to view analytics.');
      } else if (status === 401) {
        setError('Your session has expired. Please log in again.');
      } else {
        setError('Failed to load analytics data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'this_quarter', label: 'This Quarter' },
    { value: 'this_year', label: 'This Year' }
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80 bg-gray-200 rounded-lg"></div>
            <div className="h-80 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  const { kpis, recruitment, financial, onboarding } = dashboard || {};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-500 mt-1">Real-time insights and performance metrics</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Date Range */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {dateRangeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Comparison */}
          <select
            value={comparison}
            onChange={(e) => setComparison(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {analyticsService.getComparisonPeriods().map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Settings */}
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Placements"
          value={kpis?.total_placements?.value ?? 0}
          trend={kpis?.total_placements?.trend_direction}
          trendValue={kpis?.total_placements?.trend_percentage}
          icon={UserCheck}
          color="blue"
        />
        <KPICard
          title="Total Revenue"
          value={analyticsService.formatCurrency(kpis?.total_revenue?.value ?? 0)}
          trend={kpis?.total_revenue?.trend_direction}
          trendValue={kpis?.total_revenue?.trend_percentage}
          icon={DollarSign}
          color="green"
          isCurrency
        />
        <KPICard
          title="Active Jobs"
          value={kpis?.active_jobs?.value ?? 0}
          trend={kpis?.active_jobs?.trend_direction}
          trendValue={kpis?.active_jobs?.trend_percentage}
          icon={Briefcase}
          color="purple"
        />
        <KPICard
          title="Pending Interviews"
          value={kpis?.pending_interviews?.value ?? 0}
          trend={kpis?.pending_interviews?.trend_direction}
          trendValue={kpis?.pending_interviews?.trend_percentage}
          icon={Calendar}
          color="orange"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Candidates"
          value={kpis?.total_candidates?.value ?? 0}
          trend={kpis?.total_candidates?.trend_direction}
          trendValue={kpis?.total_candidates?.trend_percentage}
          icon={Users}
          color="indigo"
          size="small"
        />
        <KPICard
          title="Pending Payouts"
          value={analyticsService.formatCurrency(kpis?.pending_payouts?.value ?? 0)}
          icon={DollarSign}
          color="yellow"
          size="small"
          isCurrency
        />
        <KPICard
          title="Offer Acceptance Rate"
          value={`${kpis?.offer_acceptance_rate?.value ?? 0}%`}
          trend={kpis?.offer_acceptance_rate?.trend_direction}
          trendValue={kpis?.offer_acceptance_rate?.trend_percentage}
          icon={FileText}
          color="teal"
          size="small"
        />
        <KPICard
          title="Avg. Time to Hire"
          value={`${kpis?.avg_time_to_hire?.value ?? 0} days`}
          trend={kpis?.avg_time_to_hire?.trend_direction}
          trendValue={kpis?.avg_time_to_hire?.trend_percentage}
          icon={Clock}
          color="pink"
          size="small"
          isPositiveGood={false}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Placements Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Placements Trend</h3>
            <button className="text-gray-400 hover:text-gray-600">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <TrendChart
            data={recruitment?.applications_trend || []}
            height={280}
            color="#3B82F6"
          />
        </div>

        {/* Application Funnel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Application Funnel</h3>
            <button className="text-gray-400 hover:text-gray-600">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <FunnelChart
            data={recruitment?.funnel_data || []}
            height={280}
          />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidates by Source */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Candidates by Source</h3>
          <PieChart
            data={recruitment?.by_source || []}
            height={250}
          />
        </div>

        {/* Revenue by Client */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Clients by Revenue</h3>
          <BarChart
            data={financial?.revenue_by_client || []}
            height={250}
            horizontal
          />
        </div>

        {/* Applications by Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications by Status</h3>
          <PieChart
            data={recruitment?.by_status || []}
            height={250}
            donut
          />
        </div>
      </div>

      {/* Revenue Trend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm text-gray-600">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              <span className="text-sm text-gray-600">Payouts</span>
            </div>
          </div>
        </div>
        <TrendChart
          data={financial?.revenue_trend || []}
          height={300}
          color="#10B981"
          showArea
        />
      </div>

      {/* Onboarding Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Offer Acceptance */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Offer Acceptance Rate</h3>
          <div className="flex items-center justify-center">
            <div className="relative">
              <svg className="w-48 h-48">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="#E5E7EB"
                  strokeWidth="16"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${(onboarding?.offer_acceptance_rate || 0) * 5.02} 502`}
                  transform="rotate(-90 96 96)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-gray-900">
                  {onboarding?.offer_acceptance_rate || 0}%
                </span>
                <span className="text-sm text-gray-500">Acceptance Rate</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-green-600">{onboarding?.offers_accepted || 0}</p>
              <p className="text-sm text-gray-500">Accepted</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-red-600">{onboarding?.offers_rejected || 0}</p>
              <p className="text-sm text-gray-500">Rejected/Withdrawn</p>
            </div>
          </div>
        </div>

        {/* Payout Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payout Summary</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Paid</p>
                <p className="text-xl font-semibold text-green-700">
                  {analyticsService.formatCurrency(financial?.total_paid || 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">{financial?.paid_count || 0}</p>
                <p className="text-sm text-gray-500">payouts</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-xl font-semibold text-yellow-700">
                  {analyticsService.formatCurrency(financial?.total_pending || 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-yellow-600">{financial?.pending_count || 0}</p>
                <p className="text-sm text-gray-500">payouts</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Eligible</p>
                <p className="text-xl font-semibold text-blue-700">
                  {analyticsService.formatCurrency(financial?.total_eligible || 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{financial?.eligible_count || 0}</p>
                <p className="text-sm text-gray-500">payouts</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
