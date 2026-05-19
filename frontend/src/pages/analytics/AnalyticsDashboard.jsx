/**
 * Analytics Dashboard - Enterprise Grade
 * Power BI-style dashboard with 12 KPI cards, all date presets, global filters
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Minus,
  Users, Briefcase, DollarSign, Calendar,
  UserCheck, Clock, FileText, RefreshCw,
  Download, Filter, ChevronDown, X,
  Award, AlertCircle, CheckCircle, Activity,
  Target, BarChart2, ArrowUpRight, ArrowDownRight,
  ChevronRight, Zap
} from 'lucide-react';
import analyticsService from '../../services/analyticsService';
import KPICard from './components/KPICard';
import TrendChart from './components/TrendChart';
import FunnelChart from './components/FunnelChart';
import PieChart from './components/PieChart';
import BarChart from './components/BarChart';

// ─── Date preset config ────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { value: 'today',         label: 'Today',         group: 'Days' },
  { value: 'yesterday',     label: 'Yesterday',      group: 'Days' },
  { value: 'this_week',     label: 'This Week',      group: 'Weeks' },
  { value: 'last_week',     label: 'Last Week',      group: 'Weeks' },
  { value: 'this_month',    label: 'This Month',     group: 'Months' },
  { value: 'last_month',    label: 'Last Month',     group: 'Months' },
  { value: 'this_quarter',  label: 'This Quarter',   group: 'Quarters' },
  { value: 'last_quarter',  label: 'Last Quarter',   group: 'Quarters' },
  { value: 'last_6_months', label: 'Last 6 Months',  group: 'Extended' },
  { value: 'last_12_months',label: 'Last 12 Months', group: 'Extended' },
  { value: 'this_year',     label: 'This Year',      group: 'Years' },
  { value: 'last_year',     label: 'Last Year',      group: 'Years' },
];

const COMPARISON_OPTIONS = [
  { value: 'previous_period', label: 'vs Previous Period' },
  { value: 'previous_month',  label: 'vs Previous Month' },
  { value: 'previous_year',   label: 'vs Previous Year' },
];

// ─── Stat number formatter ─────────────────────────────────────────────────────

const fmt = (n) => {
  if (n === null || n === undefined) return '—';
  if (typeof n === 'string') return n;
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)      return n.toLocaleString('en-IN');
  return String(n);
};

const fmtCurrency = (n) => {
  if (!n) return '₹0';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

// ─── Trend badge ───────────────────────────────────────────────────────────────

const TrendBadge = ({ direction, pct, isPositiveGood = true }) => {
  if (!direction || direction === 'stable') {
    return <span className="inline-flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" /> —</span>;
  }
  const isUp = direction === 'up';
  const isGood = isPositiveGood ? isUp : !isUp;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
      {isUp
        ? <ArrowUpRight className="w-3.5 h-3.5" />
        : <ArrowDownRight className="w-3.5 h-3.5" />
      }
      {pct != null ? `${Math.abs(pct)}%` : ''}
    </span>
  );
};

// ─── KPI mini card ─────────────────────────────────────────────────────────────

const KPIMini = ({ title, value, icon: Icon, color, kpi, isPositiveGood = true, suffix = '' }) => {
  const colors = {
    blue:    { bg: 'bg-blue-50 dark:bg-blue-900/20',    icon: 'text-blue-600',    border: 'border-blue-100 dark:border-blue-800' },
    green:   { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600', border: 'border-emerald-100 dark:border-emerald-800' },
    purple:  { bg: 'bg-violet-50 dark:bg-violet-900/20', icon: 'text-violet-600',  border: 'border-violet-100 dark:border-violet-800' },
    orange:  { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600',  border: 'border-orange-100 dark:border-orange-800' },
    indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-900/20', icon: 'text-indigo-600',  border: 'border-indigo-100 dark:border-indigo-800' },
    yellow:  { bg: 'bg-amber-50 dark:bg-amber-900/20',  icon: 'text-amber-600',   border: 'border-amber-100 dark:border-amber-800' },
    teal:    { bg: 'bg-teal-50 dark:bg-teal-900/20',    icon: 'text-teal-600',    border: 'border-teal-100 dark:border-teal-800' },
    pink:    { bg: 'bg-pink-50 dark:bg-pink-900/20',    icon: 'text-pink-600',    border: 'border-pink-100 dark:border-pink-800' },
    red:     { bg: 'bg-red-50 dark:bg-red-900/20',      icon: 'text-red-600',     border: 'border-red-100 dark:border-red-800' },
    cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-900/20',    icon: 'text-cyan-600',    border: 'border-cyan-100 dark:border-cyan-800' },
  };
  const c = colors[color] || colors.blue;
  const displayValue = value ?? (kpi?.formatted_value ?? '—');

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border ${c.border} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className={`p-2 ${c.bg} rounded-xl`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        {kpi && (
          <TrendBadge
            direction={kpi.trend_direction}
            pct={kpi.trend_percentage}
            isPositiveGood={isPositiveGood}
          />
        )}
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
          {displayValue}{suffix}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{title}</div>
      </div>
    </div>
  );
};

// ─── Large KPI card ────────────────────────────────────────────────────────────

const KPILarge = ({ title, value, icon: Icon, color, kpi, isPositiveGood = true, subtitle }) => {
  const colors = {
    blue:   { grad: 'from-blue-500 to-blue-700',    ring: 'ring-blue-200 dark:ring-blue-800' },
    green:  { grad: 'from-emerald-500 to-emerald-700', ring: 'ring-emerald-200 dark:ring-emerald-800' },
    purple: { grad: 'from-violet-500 to-violet-700', ring: 'ring-violet-200 dark:ring-violet-800' },
    orange: { grad: 'from-orange-500 to-orange-700', ring: 'ring-orange-200 dark:ring-orange-800' },
  };
  const c = colors[color] || colors.blue;
  const displayValue = value ?? (kpi?.formatted_value ?? '—');

  return (
    <div className={`bg-gradient-to-br ${c.grad} rounded-2xl p-5 text-white ring-1 ${c.ring}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="bg-white/20 p-2.5 rounded-xl">
          <Icon className="w-5 h-5 text-white" />
        </div>
        {kpi && kpi.trend_direction && kpi.trend_direction !== 'stable' && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
            (isPositiveGood ? kpi.trend_direction === 'up' : kpi.trend_direction === 'down')
              ? 'bg-white/20 text-white'
              : 'bg-red-400/30 text-red-100'
          }`}>
            {kpi.trend_direction === 'up'
              ? <ArrowUpRight className="w-3 h-3" />
              : <ArrowDownRight className="w-3 h-3" />
            }
            {kpi.trend_percentage != null ? `${Math.abs(kpi.trend_percentage)}%` : ''}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold tracking-tight">{displayValue}</div>
      <div className="text-sm text-white/80 mt-1">{title}</div>
      {subtitle && <div className="text-xs text-white/60 mt-0.5">{subtitle}</div>}
    </div>
  );
};

// ─── Section header ────────────────────────────────────────────────────────────

const SectionHeader = ({ title, subtitle, action }) => (
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ─── Chart card ────────────────────────────────────────────────────────────────

const ChartCard = ({ title, subtitle, children, action }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

// ─── Date preset dropdown ──────────────────────────────────────────────────────

const DatePresetPicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selected = DATE_PRESETS.find(p => p.value === value) || { label: 'Select period' };

  const groups = DATE_PRESETS.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {});

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        {selected.label}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
            {Object.entries(groups).map(([group, presets]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-750">
                  {group}
                </div>
                {presets.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { onChange(p.value); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      value === p.value
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Onboarding stat row ───────────────────────────────────────────────────────

const OnboardStat = ({ label, value, color }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
    <span className={`text-sm font-bold ${color}`}>{value ?? '—'}</span>
  </div>
);

// ─── Leaderboard row ───────────────────────────────────────────────────────────

const LeaderRow = ({ rank, name, value, label }) => {
  const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className={`w-5 text-center text-sm font-bold ${rankColors[rank - 1] || 'text-gray-500'}`}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{name || 'Unknown'}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const DashboardSkeleton = () => (
  <div className="p-6 space-y-6 animate-pulse">
    <div className="flex justify-between items-start">
      <div>
        <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2" />
        <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-64" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
    </div>
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────────

const AnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('this_month');
  const [comparison, setComparison] = useState('previous_period');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await analyticsService.getDashboard({ date_range: dateRange, comparison });
      setDashboard(data);
      setLastUpdated(new Date());
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) setError('You do not have permission to view analytics.');
      else if (status === 401) setError('Your session has expired. Please log in again.');
      else setError('Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, comparison]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
          <button
            onClick={() => loadDashboard()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { kpis, recruitment, financial, onboarding, team } = dashboard || {};

  const selectedPresetLabel = DATE_PRESETS.find(p => p.value === dateRange)?.label || dateRange;

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-blue-600" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {selectedPresetLabel} · Live data
            {lastUpdated && (
              <span className="ml-2 text-gray-400">· Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DatePresetPicker value={dateRange} onChange={setDateRange} />

          <select
            value={comparison}
            onChange={e => setComparison(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {COMPARISON_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Primary KPIs (4 large gradient cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPILarge
          title="Total Placements"
          value={kpis?.total_placements?.value ?? 0}
          kpi={kpis?.total_placements}
          icon={UserCheck}
          color="blue"
          subtitle={selectedPresetLabel}
        />
        <KPILarge
          title="Total Revenue"
          value={fmtCurrency(kpis?.total_revenue?.value ?? 0)}
          kpi={kpis?.total_revenue}
          icon={DollarSign}
          color="green"
          subtitle="From paid payouts"
        />
        <KPILarge
          title="Active Jobs"
          value={kpis?.active_jobs?.value ?? 0}
          kpi={kpis?.active_jobs}
          icon={Briefcase}
          color="purple"
          subtitle="Currently open"
        />
        <KPILarge
          title="Upcoming Interviews"
          value={kpis?.pending_interviews?.value ?? 0}
          kpi={kpis?.pending_interviews}
          icon={Calendar}
          color="orange"
          subtitle="Scheduled ahead"
        />
      </div>

      {/* ── Secondary KPIs (8 mini cards) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPIMini
          title="Candidates Added"
          kpi={kpis?.total_candidates}
          icon={Users}
          color="indigo"
        />
        <KPIMini
          title="Pending Payouts"
          value={fmtCurrency(kpis?.pending_payouts?.value ?? 0)}
          kpi={kpis?.pending_payouts}
          icon={DollarSign}
          color="yellow"
          isPositiveGood={false}
        />
        <KPIMini
          title="Offer Acceptance"
          value={`${kpis?.offer_acceptance_rate?.value ?? 0}%`}
          kpi={kpis?.offer_acceptance_rate}
          icon={CheckCircle}
          color="teal"
        />
        <KPIMini
          title="Avg. Time to Hire"
          value={`${kpis?.avg_time_to_hire?.value ?? 0}`}
          suffix=" days"
          kpi={kpis?.avg_time_to_hire}
          icon={Clock}
          color="pink"
          isPositiveGood={false}
        />
        <KPIMini
          title="Total Applications"
          value={recruitment?.total_applications ?? 0}
          icon={FileText}
          color="blue"
        />
        <KPIMini
          title="Interviews Done"
          value={recruitment?.total_interviews ?? 0}
          icon={Activity}
          color="purple"
        />
        <KPIMini
          title="Offers Released"
          value={recruitment?.total_offers ?? 0}
          icon={Target}
          color="orange"
        />
        <KPIMini
          title="No Shows"
          value={onboarding?.no_shows ?? 0}
          icon={AlertCircle}
          color="red"
          isPositiveGood={false}
        />
      </div>

      {/* ── Charts row 1: Trend + Funnel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Application Trend"
          subtitle="Volume of applications over time"
          action={
            <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Download className="w-4 h-4" />
            </button>
          }
        >
          <TrendChart data={recruitment?.applications_trend || []} height={250} color="#3B82F6" />
        </ChartCard>

        <ChartCard
          title="Application Funnel"
          subtitle="Conversion from application to join"
          action={
            <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Download className="w-4 h-4" />
            </button>
          }
        >
          <FunnelChart data={recruitment?.funnel_data || []} height={250} />
        </ChartCard>
      </div>

      {/* ── Charts row 2: Source pie + Revenue bar + Status donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard title="Candidates by Source" subtitle="Sourcing channel breakdown">
          <PieChart data={recruitment?.by_source || []} height={220} />
        </ChartCard>

        <ChartCard title="Top Clients by Revenue" subtitle="Paid payout revenue per client">
          <BarChart data={financial?.revenue_by_client || []} height={220} horizontal />
        </ChartCard>

        <ChartCard title="Applications by Status" subtitle="Current pipeline distribution">
          <PieChart data={recruitment?.by_status || []} height={220} donut />
        </ChartCard>
      </div>

      {/* ── Revenue trend (wide) ── */}
      <ChartCard
        title="Revenue Trend"
        subtitle="Monthly payout revenue"
        action={
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />Revenue
            </span>
          </div>
        }
      >
        <TrendChart data={financial?.revenue_trend || []} height={240} color="#10B981" showArea />
      </ChartCard>

      {/* ── Onboarding stats + Leaderboard ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Onboarding summary */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <SectionHeader
            title="Onboarding Summary"
            subtitle={selectedPresetLabel}
          />

          <div className="mt-4 flex items-center justify-center mb-4">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="48" fill="none" stroke="#E5E7EB" strokeWidth="14" />
                <circle
                  cx="60" cy="60" r="48"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${(onboarding?.acceptance_rate || 0) * 3.015} 301.5`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {onboarding?.acceptance_rate ?? 0}%
                </span>
                <span className="text-xs text-gray-500">Acceptance</span>
              </div>
            </div>
          </div>

          <div className="space-y-0">
            <OnboardStat label="Offers Released"    value={onboarding?.total_offers}       color="text-gray-900 dark:text-white" />
            <OnboardStat label="Accepted"           value={onboarding?.offers_accepted}    color="text-emerald-600" />
            <OnboardStat label="Declined"           value={onboarding?.offers_declined}    color="text-red-500" />
            <OnboardStat label="Joined"             value={onboarding?.candidates_joined}  color="text-blue-600" />
            <OnboardStat label="No Shows"           value={onboarding?.no_shows}           color="text-orange-600" />
            <OnboardStat label="No-Show Rate"       value={`${onboarding?.no_show_rate ?? 0}%`} color="text-orange-600" />
          </div>
        </div>

        {/* Recruiter leaderboard */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <SectionHeader
            title="Recruiter Leaderboard"
            subtitle={`Top performers · ${selectedPresetLabel}`}
            action={
              <Award className="w-5 h-5 text-amber-500" />
            }
          />
          <div className="mt-4">
            {team?.top_performers?.length > 0 ? (
              team.top_performers.slice(0, 8).map((p, i) => (
                <LeaderRow
                  key={p.user_id || i}
                  rank={i + 1}
                  name={p.user_name}
                  value={p.placements}
                  label="placements"
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Zap className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No placement data for this period</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Payout summary ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <SectionHeader title="Payout Summary" subtitle="Breakdown by status" />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Paid</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {fmtCurrency(financial?.total_payouts ?? 0)}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-500 opacity-40" />
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                {fmtCurrency(financial?.total_pending ?? 0)}
              </p>
            </div>
            <Clock className="w-8 h-8 text-amber-500 opacity-40" />
          </div>
          <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Invoices Pending</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mt-0.5">
                {financial?.pending_invoices ?? 0}
              </p>
            </div>
            <FileText className="w-8 h-8 text-blue-500 opacity-40" />
          </div>
        </div>
      </div>

    </div>
  );
};

export default AnalyticsDashboard;
