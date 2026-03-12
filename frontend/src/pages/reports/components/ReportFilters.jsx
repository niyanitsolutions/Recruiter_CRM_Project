/**
 * Report Filters Component - Phase 5
 * Reusable filters for report generation
 */
import React, { useState, useEffect } from 'react';
import { Calendar, Users, Building, Filter, X, ChevronDown } from 'lucide-react';
import reportService from '../../../services/reportService';

const ReportFilters = ({ filters, onChange, reportType }) => {
  const [clients, setClients] = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const datePresets = reportService.getDatePresets();

  const handleFilterChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const handleDateRangeChange = (key, value) => {
    onChange({
      ...filters,
      dateRange: { ...filters.dateRange, [key]: value }
    });
  };

  const clearFilters = () => {
    onChange({
      dateRange: { preset: 'this_month', start_date: null, end_date: null },
      client_ids: [],
      coordinator_ids: [],
      status: [],
      group_by: null
    });
  };

  return (
    <div className="space-y-4">
      {/* Date Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Calendar className="w-4 h-4 inline mr-1" />
          Date Range
        </label>
        <select
          value={filters.dateRange?.preset || 'this_month'}
          onChange={(e) => handleDateRangeChange('preset', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          {datePresets.map(preset => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>

        {filters.dateRange?.preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.dateRange?.start_date || ''}
                onChange={(e) => handleDateRangeChange('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={filters.dateRange?.end_date || ''}
                onChange={(e) => handleDateRangeChange('end_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Group By */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Group By
        </label>
        <select
          value={filters.group_by || ''}
          onChange={(e) => handleFilterChange('group_by', e.target.value || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">None</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
          <option value="client">Client</option>
          <option value="coordinator">Coordinator</option>
          <option value="source">Source</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Advanced Filters Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
      >
        <Filter className="w-4 h-4" />
        {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
      </button>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="space-y-4 pt-2 border-t border-gray-200">
          {/* Client Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building className="w-4 h-4 inline mr-1" />
              Clients
            </label>
            <select
              multiple
              value={filters.client_ids || []}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions, opt => opt.value);
                handleFilterChange('client_ids', values);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            >
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
          </div>

          {/* Coordinator Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline mr-1" />
              Coordinators
            </label>
            <select
              multiple
              value={filters.coordinator_ids || []}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions, opt => opt.value);
                handleFilterChange('coordinator_ids', values);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            >
              {coordinators.map(user => (
                <option key={user.id} value={user.id}>
                  {user.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <div className="space-y-2">
              {['active', 'completed', 'pending', 'cancelled'].map(status => (
                <label key={status} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.status?.includes(status) || false}
                    onChange={(e) => {
                      const current = filters.status || [];
                      const updated = e.target.checked
                        ? [...current, status]
                        : current.filter(s => s !== status);
                      handleFilterChange('status', updated);
                    }}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 capitalize">{status}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Clear Filters */}
      <button
        onClick={clearFilters}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
      >
        <X className="w-4 h-4" />
        Clear All Filters
      </button>
    </div>
  );
};

export default ReportFilters;
