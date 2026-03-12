/**
 * Import Progress Component - Phase 5
 * Shows real-time import progress
 */
import React, { useState, useEffect } from 'react';
import { Loader, CheckCircle, XCircle, AlertTriangle, RefreshCw, Download } from 'lucide-react';

const ImportProgress = ({
  importJob,
  onRefresh,
  onDownloadErrors
}) => {
  const [refreshing, setRefreshing] = useState(false);

  if (!importJob) return null;

  const {
    status,
    status_display,
    total_rows = 0,
    processed_rows = 0,
    success_count = 0,
    error_count = 0,
    skipped_count = 0,
    progress_percentage = 0,
    started_at,
    completed_at,
    error_file_url
  } = importJob;

  const isProcessing = status === 'processing' || status === 'pending';
  const isCompleted = status === 'completed' || status === 'completed_with_errors';
  const isFailed = status === 'failed';

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const getStatusIcon = () => {
    if (isProcessing) return <Loader className="w-8 h-8 text-blue-500 animate-spin" />;
    if (isFailed) return <XCircle className="w-8 h-8 text-red-500" />;
    if (error_count > 0) return <AlertTriangle className="w-8 h-8 text-yellow-500" />;
    return <CheckCircle className="w-8 h-8 text-green-500" />;
  };

  const getStatusColor = () => {
    if (isProcessing) return 'text-blue-600';
    if (isFailed) return 'text-red-600';
    if (error_count > 0) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getProgressBarColor = () => {
    if (isFailed) return 'bg-red-500';
    if (error_count > 0 && isCompleted) return 'bg-yellow-500';
    if (isCompleted) return 'bg-green-500';
    return 'bg-blue-500';
  };

  const formatDuration = () => {
    if (!started_at) return '-';
    const start = new Date(started_at);
    const end = completed_at ? new Date(completed_at) : new Date();
    const seconds = Math.floor((end - start) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          {getStatusIcon()}
        </div>
        <h3 className={`text-xl font-semibold ${getStatusColor()}`}>
          {status_display || status?.replace('_', ' ').toUpperCase()}
        </h3>
        {isProcessing && (
          <p className="text-gray-500 mt-1">
            Processing your import...
          </p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium text-gray-900">{progress_percentage}%</span>
        </div>
        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${progress_percentage}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>{processed_rows} of {total_rows} rows processed</span>
          <span>Duration: {formatDuration()}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{success_count}</p>
          <p className="text-sm text-green-700">Imported</p>
        </div>
        <div className={`rounded-lg p-4 text-center ${
          skipped_count > 0 
            ? 'bg-yellow-50 border border-yellow-200' 
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <p className={`text-3xl font-bold ${skipped_count > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
            {skipped_count}
          </p>
          <p className={`text-sm ${skipped_count > 0 ? 'text-yellow-700' : 'text-gray-500'}`}>
            Skipped
          </p>
        </div>
        <div className={`rounded-lg p-4 text-center ${
          error_count > 0 
            ? 'bg-red-50 border border-red-200' 
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <p className={`text-3xl font-bold ${error_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {error_count}
          </p>
          <p className={`text-sm ${error_count > 0 ? 'text-red-700' : 'text-gray-500'}`}>
            Errors
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-4">
        {isProcessing && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
        )}

        {error_count > 0 && error_file_url && (
          <button
            onClick={onDownloadErrors}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Download className="w-4 h-4" />
            Download Error Report
          </button>
        )}
      </div>

      {/* Detailed Results (when completed) */}
      {isCompleted && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <h4 className="font-medium text-gray-900">Import Summary</h4>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Total rows processed:</span>
              <span className="font-medium">{total_rows}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Successfully imported:</span>
              <span className="font-medium text-green-600">{success_count}</span>
            </div>
            {skipped_count > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Skipped (duplicates):</span>
                <span className="font-medium text-yellow-600">{skipped_count}</span>
              </div>
            )}
            {error_count > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Failed rows:</span>
                <span className="font-medium text-red-600">{error_count}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="text-gray-600">Total time:</span>
              <span className="font-medium">{formatDuration()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Processing Animation */}
      {isProcessing && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>Import in progress...</span>
        </div>
      )}
    </div>
  );
};

export default ImportProgress;
