/**
 * Validation Preview Component - Phase 5
 * Shows validation results before import
 */
import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Eye } from 'lucide-react';

const ValidationPreview = ({ 
  validationResult,
  maxPreviewRows = 5
}) => {
  const [expandedErrors, setExpandedErrors] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  if (!validationResult) {
    return null;
  }

  const {
    total_rows = 0,
    valid_rows = 0,
    invalid_rows = 0,
    errors = [],
    warnings = [],
    preview_data = [],
    duplicates_found = 0
  } = validationResult;

  const successRate = total_rows > 0 ? ((valid_rows / total_rows) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Rows</p>
          <p className="text-2xl font-bold text-gray-900">{total_rows}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600">Valid</p>
          <p className="text-2xl font-bold text-green-700">{valid_rows}</p>
        </div>
        <div className={`rounded-lg p-4 ${
          invalid_rows > 0 
            ? 'bg-red-50 border border-red-200' 
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <p className={`text-sm ${invalid_rows > 0 ? 'text-red-600' : 'text-gray-500'}`}>Invalid</p>
          <p className={`text-2xl font-bold ${invalid_rows > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {invalid_rows}
          </p>
        </div>
        <div className={`rounded-lg p-4 ${
          duplicates_found > 0 
            ? 'bg-yellow-50 border border-yellow-200' 
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <p className={`text-sm ${duplicates_found > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>
            Duplicates
          </p>
          <p className={`text-2xl font-bold ${duplicates_found > 0 ? 'text-yellow-700' : 'text-gray-900'}`}>
            {duplicates_found}
          </p>
        </div>
      </div>

      {/* Success Rate Progress */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Validation Success Rate</span>
          <span className={`text-sm font-bold ${
            successRate >= 90 ? 'text-green-600' : 
            successRate >= 70 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {successRate}%
          </span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              successRate >= 90 ? 'bg-green-500' : 
              successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>

      {/* Errors Section */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedErrors(!expandedErrors)}
            className="w-full flex items-center justify-between p-4 hover:bg-red-100"
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-700">
                {errors.length} Error{errors.length > 1 ? 's' : ''} Found
              </span>
            </div>
            {expandedErrors ? (
              <ChevronUp className="w-5 h-5 text-red-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-red-500" />
            )}
          </button>
          
          {expandedErrors && (
            <div className="border-t border-red-200 p-4 space-y-2">
              {errors.slice(0, 10).map((error, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-red-400">Row {error.row}:</span>
                  <span className="text-red-700">{error.message}</span>
                  {error.field && (
                    <span className="text-red-500">({error.field})</span>
                  )}
                </div>
              ))}
              {errors.length > 10 && (
                <p className="text-sm text-red-500 mt-2">
                  ... and {errors.length - 10} more errors
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Warnings Section */}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <span className="font-medium text-yellow-700">
              {warnings.length} Warning{warnings.length > 1 ? 's' : ''}
            </span>
          </div>
          <ul className="space-y-1 text-sm text-yellow-700">
            {warnings.slice(0, 5).map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Data Preview */}
      {preview_data.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-gray-400" />
              <span className="font-medium text-gray-700">Data Preview</span>
            </div>
            {showPreview ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          
          {showPreview && (
            <div className="border-t border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                    {Object.keys(preview_data[0] || {}).map(key => (
                      <th key={key} className="px-3 py-2 text-left font-medium text-gray-600">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview_data.slice(0, maxPreviewRows).map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{rowIndex + 1}</td>
                      {Object.values(row).map((value, colIndex) => (
                        <td key={colIndex} className="px-3 py-2 text-gray-700 truncate max-w-xs">
                          {value !== null && value !== undefined ? String(value) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview_data.length > maxPreviewRows && (
                <p className="p-3 text-sm text-gray-500 text-center bg-gray-50">
                  Showing {maxPreviewRows} of {preview_data.length} preview rows
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ready to Import */}
      {valid_rows > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <div>
            <p className="font-medium text-green-700">
              Ready to import {valid_rows} record{valid_rows > 1 ? 's' : ''}
            </p>
            {invalid_rows > 0 && (
              <p className="text-sm text-green-600">
                {invalid_rows} invalid row{invalid_rows > 1 ? 's' : ''} will be skipped
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationPreview;
