/**
 * Report Viewer - Phase 5
 * Displays generated report data with tables and charts
 */
import React, { useState } from 'react';
import {
  Table, BarChart2, PieChart, TrendingUp, Download,
  ChevronDown, ChevronUp, ArrowUpDown, Search
} from 'lucide-react';
import { TrendChart, FunnelChart, PieChart as PieChartComponent, BarChart } from '../analytics/components/Charts';

const ReportViewer = ({ data, reportType }) => {
  const [viewMode, setViewMode] = useState('table');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  if (!data || !data.data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const { report_name, data: reportData, columns, summary, generated_at } = data;

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!Array.isArray(reportData)) return reportData;
    if (!sortConfig.key) return reportData;

    return [...reportData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [reportData, sortConfig]);

  // Filter data
  const filteredData = React.useMemo(() => {
    if (!Array.isArray(sortedData) || !searchQuery) return sortedData;
    
    return sortedData.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [sortedData, searchQuery]);

  // Paginate data
  const paginatedData = React.useMemo(() => {
    if (!Array.isArray(filteredData)) return filteredData;
    
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage]);

  const totalPages = Array.isArray(filteredData) 
    ? Math.ceil(filteredData.length / pageSize) 
    : 1;

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatValue = (value, column) => {
    if (value === null || value === undefined) return '-';
    
    if (column?.type === 'currency' || column?.includes?.('amount') || column?.includes?.('revenue')) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
      }).format(value);
    }
    
    if (column?.type === 'percentage' || column?.includes?.('rate') || column?.includes?.('percentage')) {
      return `${Number(value).toFixed(1)}%`;
    }
    
    if (column?.type === 'date' || column?.includes?.('date')) {
      return new Date(value).toLocaleDateString();
    }
    
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    
    return value;
  };

  const getColumnLabel = (key) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const getChartData = () => {
    if (!Array.isArray(reportData)) return [];
    
    // Try to extract chart-friendly data
    if (reportType.includes('funnel')) {
      return reportData.map(item => ({
        label: item.stage || item.status || item.name,
        value: item.count || item.value || item.total
      }));
    }
    
    return reportData.slice(0, 10).map(item => ({
      label: item.name || item.client_name || item.month || Object.values(item)[0],
      value: item.count || item.value || item.total || item.amount || Object.values(item)[1]
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{report_name}</h3>
            <p className="text-sm text-gray-500">
              Generated: {new Date(generated_at).toLocaleString()} • 
              {Array.isArray(reportData) ? ` ${reportData.length} records` : ''}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Table className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('chart')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'chart'
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            {Object.entries(summary).map(([key, value]) => (
              <div key={key} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  {getColumnLabel(key)}
                </p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {formatValue(value, key)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table View */}
      {viewMode === 'table' && Array.isArray(reportData) && (
        <>
          {/* Search */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {columns?.length > 0 
                    ? columns.map(col => (
                        <th
                          key={col.key || col}
                          onClick={() => handleSort(col.key || col)}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          <div className="flex items-center gap-1">
                            {col.label || getColumnLabel(col.key || col)}
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          </div>
                        </th>
                      ))
                    : reportData[0] && Object.keys(reportData[0]).map(key => (
                        <th
                          key={key}
                          onClick={() => handleSort(key)}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          <div className="flex items-center gap-1">
                            {getColumnLabel(key)}
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          </div>
                        </th>
                      ))
                  }
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedData.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    {columns?.length > 0
                      ? columns.map(col => (
                          <td key={col.key || col} className="px-4 py-3 text-sm text-gray-700">
                            {formatValue(row[col.key || col], col.key || col)}
                          </td>
                        ))
                      : Object.entries(row).map(([key, value]) => (
                          <td key={key} className="px-4 py-3 text-sm text-gray-700">
                            {formatValue(value, key)}
                          </td>
                        ))
                    }
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Chart View */}
      {viewMode === 'chart' && (
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-4">Distribution</h4>
              <BarChart data={getChartData()} height={300} horizontal />
            </div>

            {/* Pie Chart */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-4">Breakdown</h4>
              <PieChartComponent data={getChartData()} height={300} />
            </div>

            {/* Trend Chart (if applicable) */}
            {reportType.includes('trend') && (
              <div className="lg:col-span-2">
                <h4 className="text-sm font-medium text-gray-700 mb-4">Trend</h4>
                <TrendChart data={getChartData()} height={300} showArea />
              </div>
            )}

            {/* Funnel Chart (if applicable) */}
            {reportType.includes('funnel') && (
              <div className="lg:col-span-2">
                <h4 className="text-sm font-medium text-gray-700 mb-4">Funnel</h4>
                <FunnelChart data={getChartData()} height={300} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Non-array data display */}
      {!Array.isArray(reportData) && typeof reportData === 'object' && (
        <div className="p-6">
          <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
            {JSON.stringify(reportData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ReportViewer;
