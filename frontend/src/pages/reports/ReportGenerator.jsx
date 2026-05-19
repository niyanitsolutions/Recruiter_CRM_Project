/**
 * Report Generator — Enterprise Grade
 * Full-featured report generation with global filters panel
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Download, Save, Play, Filter,
  Loader, AlertCircle, X, ChevronDown, CheckSquare,
  FileSpreadsheet, FileText, FilePdf, RefreshCw
} from 'lucide-react';
import reportService from '../../services/reportService';
import ReportViewer from './ReportViewer';

// ─── Multi-select chip input ──────────────────────────────────────────────────

const ChipSelect = ({ label, options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <span className={selected.length ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
          {selected.length ? `${selected.length} selected` : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 py-1 max-h-44 overflow-y-auto">
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No options</p>
            )}
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                  selected.includes(opt.value)
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {selected.includes(opt.value) && <span className="text-xs font-bold">✓</span>}
                </span>
                <span className="text-gray-700 dark:text-gray-300 truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Filter section label ─────────────────────────────────────────────────────

const FilterLabel = ({ children }) => (
  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
    {children}
  </label>
);

// ─── Status options per report type ──────────────────────────────────────────

const STATUS_OPTIONS_MAP = {
  default: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
  application: [
    { value: 'applied', label: 'Applied' },
    { value: 'screening', label: 'Screening' },
    { value: 'shortlisted', label: 'Shortlisted' },
    { value: 'interview_scheduled', label: 'Interview Scheduled' },
    { value: 'offered', label: 'Offered' },
    { value: 'joined', label: 'Joined' },
    { value: 'rejected', label: 'Rejected' },
  ],
  onboard: [
    { value: 'offer_released', label: 'Offer Released' },
    { value: 'offer_accepted', label: 'Accepted' },
    { value: 'offer_declined', label: 'Declined' },
    { value: 'doj_confirmed', label: 'DOJ Confirmed' },
    { value: 'joined', label: 'Joined' },
    { value: 'no_show', label: 'No Show' },
  ],
  payout: [
    { value: 'pending', label: 'Pending' },
    { value: 'eligible', label: 'Eligible' },
    { value: 'invoice_raised', label: 'Invoice Raised' },
    { value: 'invoice_approved', label: 'Invoice Approved' },
    { value: 'paid', label: 'Paid' },
  ],
};

const SOURCE_OPTIONS = [
  { value: 'portal', label: 'Job Portal' },
  { value: 'referral', label: 'Referral' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'naukri', label: 'Naukri' },
  { value: 'direct', label: 'Direct' },
  { value: 'campus', label: 'Campus' },
  { value: 'other', label: 'Other' },
];

const getStatusOptions = (type) => {
  if (['application_funnel', 'candidate_pipeline', 'source_effectiveness'].includes(type)) return STATUS_OPTIONS_MAP.application;
  if (['offer_acceptance', 'no_show_analysis', 'doj_extensions', 'document_compliance', 'payout_eligibility'].includes(type)) return STATUS_OPTIONS_MAP.onboard;
  if (['payout_summary', 'invoice_aging', 'commission_trends', 'payment_history'].includes(type)) return STATUS_OPTIONS_MAP.payout;
  return STATUS_OPTIONS_MAP.default;
};

// ─── Main component ───────────────────────────────────────────────────────────

const ReportGenerator = () => {
  const { reportType } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Dynamic option lists fetched from API
  const [clients, setClients] = useState([]);
  const [coordinators, setCoordinators] = useState([]);

  // Filter state
  const [filters, setFilters] = useState({
    dateRange: { preset: 'this_month', start_date: null, end_date: null },
    client_ids: [],
    partner_ids: [],
    coordinator_ids: [],
    status: [],
    source: [],
    group_by: null,
  });

  const [exportFormat, setExportFormat] = useState('excel');
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Fetch filter option lists (clients, coordinators)
  useEffect(() => {
    const load = async () => {
      try {
        const [clientRes, userRes] = await Promise.allSettled([
          import('../../services/clientService').then(m => m.default.getClients({ page_size: 200 })).catch(() => null),
          import('../../services/userService').then(m => m.default.getUsers({ page_size: 200 })).catch(() => null),
        ]);
        if (clientRes.status === 'fulfilled' && clientRes.value?.items) {
          setClients(clientRes.value.items.map(c => ({ value: c.id, label: c.name })));
        }
        if (userRes.status === 'fulfilled' && userRes.value?.items) {
          setCoordinators(userRes.value.items.map(u => ({ value: u.id, label: u.full_name })));
        }
      } catch (_) { /* filter dropdowns are best-effort */ }
    };
    load();
  }, []);

  const reportTypeInfo = getReportTypeInfo(reportType);
  const datePresets = reportService.getDatePresets();
  const statusOptions = getStatusOptions(reportType);

  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }));
  const setDatePreset = (preset) => setFilters(f => ({ ...f, dateRange: { ...f.dateRange, preset } }));
  const setDateField = (field, value) => setFilters(f => ({ ...f, dateRange: { ...f.dateRange, [field]: value } }));

  const buildPayload = () => ({
    report_type: reportType,
    format: 'json',
    filters: {
      date_range: {
        preset: filters.dateRange.preset,
        start_date: filters.dateRange.start_date || null,
        end_date: filters.dateRange.end_date || null,
      },
      client_ids: filters.client_ids.length ? filters.client_ids : null,
      partner_ids: filters.partner_ids.length ? filters.partner_ids : null,
      coordinator_ids: filters.coordinator_ids.length ? filters.coordinator_ids : null,
      status: filters.status.length ? filters.status : null,
      custom_filters: {
        ...(filters.source.length ? { source: filters.source } : {}),
      },
      group_by: filters.group_by || null,
    },
  });

  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      setError(null);
      const data = await reportService.generateReport(buildPayload());
      setReportData(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportReport = async () => {
    try {
      setLoading(true);
      const payload = { ...buildPayload(), format: exportFormat };
      const response = await reportService.exportReport(payload);
      const ext = exportFormat === 'excel' ? 'xlsx' : exportFormat;
      reportService.downloadReport(response.data, `${reportType}_${new Date().toISOString().split('T')[0]}.${ext}`);
    } catch (_) {
      setError('Export failed. Please try again.');
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
        filters: buildPayload().filters,
      });
      setShowSaveModal(false);
    } catch (_) {
      setError('Failed to save report.');
    }
  };

  const activeFilterCount = [
    filters.client_ids.length,
    filters.coordinator_ids.length,
    filters.status.length,
    filters.source.length,
  ].filter(Boolean).length;

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/reports')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors mt-0.5"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportTypeInfo.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{reportTypeInfo.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* ── Filters panel ── */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden sticky top-6">

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setFiltersExpanded(e => !e)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                <Filter className="w-4 h-4 text-gray-500" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(f => ({ ...f, client_ids: [], coordinator_ids: [], status: [], source: [] }))}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {filtersExpanded && (
              <div className="p-4 space-y-5">

                {/* Date range */}
                <div>
                  <FilterLabel>Date Range</FilterLabel>
                  <select
                    value={filters.dateRange.preset}
                    onChange={e => setDatePreset(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {datePresets.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  {filters.dateRange.preset === 'custom' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={filters.dateRange.start_date || ''}
                        onChange={e => setDateField('start_date', e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      <input
                        type="date"
                        value={filters.dateRange.end_date || ''}
                        onChange={e => setDateField('end_date', e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Client */}
                <div>
                  <FilterLabel>Client</FilterLabel>
                  <ChipSelect
                    options={clients}
                    selected={filters.client_ids}
                    onChange={v => setFilter('client_ids', v)}
                    placeholder="All clients"
                  />
                </div>

                {/* Coordinator */}
                <div>
                  <FilterLabel>Recruiter / Coordinator</FilterLabel>
                  <ChipSelect
                    options={coordinators}
                    selected={filters.coordinator_ids}
                    onChange={v => setFilter('coordinator_ids', v)}
                    placeholder="All coordinators"
                  />
                </div>

                {/* Status */}
                {statusOptions.length > 0 && (
                  <div>
                    <FilterLabel>Status</FilterLabel>
                    <ChipSelect
                      options={statusOptions}
                      selected={filters.status}
                      onChange={v => setFilter('status', v)}
                      placeholder="All statuses"
                    />
                  </div>
                )}

                {/* Source */}
                {['source_effectiveness', 'placements_summary', 'application_funnel', 'candidate_pipeline'].includes(reportType) && (
                  <div>
                    <FilterLabel>Source</FilterLabel>
                    <ChipSelect
                      options={SOURCE_OPTIONS}
                      selected={filters.source}
                      onChange={v => setFilter('source', v)}
                      placeholder="All sources"
                    />
                  </div>
                )}

                {/* Group by */}
                <div>
                  <FilterLabel>Group By</FilterLabel>
                  <select
                    value={filters.group_by || ''}
                    onChange={e => setFilter('group_by', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">None</option>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="quarter">Quarter</option>
                    <option value="client">Client</option>
                    <option value="coordinator">Coordinator</option>
                    <option value="source">Source</option>
                  </select>
                </div>

                {/* Export format */}
                <div>
                  <FilterLabel>Export Format</FilterLabel>
                  <div className="grid grid-cols-3 gap-1.5">
                    {reportService.getExportFormats().map(fmt => (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => setExportFormat(fmt.value)}
                        className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                          exportFormat === fmt.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {fmt.value.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* Action buttons */}
            <div className="px-4 pb-4 space-y-2">
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {generating
                  ? <><Loader className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Play className="w-4 h-4" /> Generate Report</>
                }
              </button>

              {reportData && (
                <>
                  <button
                    type="button"
                    onClick={handleExportReport}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export {exportFormat.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Report
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Report content ── */}
        <div className="lg:col-span-3">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {!reportData && !generating && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Configure and Generate Report
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                Set your filters on the left and click <strong>Generate Report</strong> to view live data
              </p>
              <button
                type="button"
                onClick={handleGenerateReport}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Play className="w-4 h-4" />
                Generate Now
              </button>
            </div>
          )}

          {generating && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
              <Loader className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Generating Report…</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Querying live data, please wait</p>
            </div>
          )}

          {reportData && !generating && (
            <ReportViewer
              data={reportData}
              reportType={reportType}
              onExport={handleExportReport}
              exportFormat={exportFormat}
            />
          )}
        </div>
      </div>

      {showSaveModal && (
        <SaveReportModal
          reportType={reportType}
          onSave={handleSaveReport}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
};

// ─── Save report modal ─────────────────────────────────────────────────────────

const SaveReportModal = ({ reportType, onSave, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(name, description);
    setSaving(false);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Save Report</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Report Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Monthly Placements — Q1"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// ─── Report type info lookup ──────────────────────────────────────────────────

const REPORT_INFO = {
  placements_summary:    { name: 'Placements Summary',        description: 'Overview of all placements grouped by client and partner with CTC breakdown' },
  application_funnel:    { name: 'Application Funnel',         description: 'Track candidate progression through every stage of the hiring funnel' },
  time_to_hire:          { name: 'Time to Hire',              description: 'Average, minimum and maximum days from application to joining per client' },
  source_effectiveness:  { name: 'Source Effectiveness',      description: 'Compare candidate sources by application volume, conversion and joining rates' },
  job_aging:             { name: 'Job Aging Report',           description: 'Open job postings segmented by age bucket — identify stale positions' },
  candidate_pipeline:    { name: 'Candidate Pipeline',         description: 'Live view of all candidates by their current pipeline stage' },
  interview_conversion:  { name: 'Interview Conversion',       description: 'Interview-to-offer-to-join conversion rates with drop-off analysis' },
  recruiter_performance: { name: 'Recruiter Performance',      description: 'Recruiter leaderboard with placements, revenue and activity metrics' },
  client_summary:        { name: 'Client Summary',             description: 'Client-level overview of open positions, placements, revenue and SLA' },
  client_hiring_trend:   { name: 'Client Hiring Trend',        description: 'Month-over-month hiring volume and closure rate per client' },
  payout_summary:        { name: 'Payout Summary',             description: 'Partner payout breakdown by status — pending, eligible and paid' },
  invoice_aging:         { name: 'Invoice Aging',              description: 'Outstanding partner invoices segmented by age — 0-30, 30-60, 60-90, 90+ days' },
  revenue_by_client:     { name: 'Revenue by Client',          description: 'Gross revenue, GST and net revenue breakdown per client company' },
  commission_trends:     { name: 'Commission Trends',          description: 'Monthly commission earned per partner with trend analysis' },
  payment_history:       { name: 'Payment History',            description: 'Complete log of all processed payments with dates and amounts' },
  tax_summary:           { name: 'GST/TDS Summary',            description: 'GST and TDS summary for all transactions in the selected period' },
  offer_acceptance:      { name: 'Offer Acceptance Rate',      description: 'Offer acceptance and join rates broken down by client' },
  no_show_analysis:      { name: 'No-Show Analysis',           description: 'Candidates who accepted offers but did not join on the DOJ' },
  doj_extensions:        { name: 'DOJ Extensions',             description: 'Onboards with extended date of joining — frequency and duration' },
  document_compliance:   { name: 'Document Compliance',        description: 'Candidates missing required onboarding documents' },
  payout_eligibility:    { name: 'Payout Eligibility Tracker', description: 'Candidates who have joined but whose partner payout is not yet processed' },
  coordinator_activity:  { name: 'Coordinator Activity',       description: 'Per-user action counts from audit logs — creates, updates, deletes' },
  user_productivity:     { name: 'User Productivity',          description: 'Applications owned, interviews scheduled, offers released per user' },
  response_time:         { name: 'Response Time Metrics',      description: 'Average time for coordinators to move candidates through pipeline stages' },
  login_activity:        { name: 'Login Activity Report',      description: 'User login history with device, location and session duration' },
  user_actions:          { name: 'User Actions Report',        description: 'Detailed audit trail of all user actions within the selected period' },
};

const getReportTypeInfo = (type) =>
  REPORT_INFO[type] || { name: type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Report', description: '' };

export default ReportGenerator;
