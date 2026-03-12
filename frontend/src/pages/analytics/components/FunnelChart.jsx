/**
 * Funnel Chart Component - Phase 5
 * Displays funnel/pipeline visualization
 */
import React from 'react';

const FunnelChart = ({ data = [], height = 280, showPercentage = true, showConversion = true }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No funnel data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value || d.count || 0));
  const colors = ['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899'];

  return (
    <div style={{ height }} className="flex flex-col justify-center space-y-3">
      {data.map((item, index) => {
        const value = item.value || item.count || 0;
        const percentage = maxValue ? (value / maxValue * 100) : 0;
        const prevValue = index > 0 ? (data[index - 1].value || data[index - 1].count || 0) : null;
        const conversionRate = prevValue ? ((value / prevValue) * 100).toFixed(1) : null;
        const dropOff = prevValue ? (100 - (value / prevValue) * 100).toFixed(1) : null;

        return (
          <div key={index} className="group">
            <div className="flex items-center gap-3">
              {/* Stage Label */}
              <div className="w-28 text-right">
                <span className="text-sm font-medium text-gray-700">
                  {item.label || item.stage || item.name}
                </span>
              </div>

              {/* Bar */}
              <div className="flex-1 relative">
                <div className="h-10 bg-gray-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all duration-500 flex items-center px-3 group-hover:opacity-90"
                    style={{
                      width: `${Math.max(percentage, 8)}%`,
                      backgroundColor: item.color || colors[index % colors.length]
                    }}
                  >
                    <span className="text-sm font-semibold text-white">
                      {value.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Funnel connector */}
                {index < data.length - 1 && (
                  <div className="absolute left-1/2 -bottom-3 w-0.5 h-3 bg-gray-200"></div>
                )}
              </div>

              {/* Stats */}
              <div className="w-24 text-left">
                {showPercentage && (
                  <span className="text-sm text-gray-600">
                    {percentage.toFixed(0)}%
                  </span>
                )}
                {showConversion && conversionRate && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-green-600">↓ {conversionRate}%</span>
                    {dropOff && Number(dropOff) > 0 && (
                      <span className="text-xs text-red-400">(-{dropOff}%)</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Summary */}
      <div className="pt-4 border-t border-gray-200 mt-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Overall Conversion</span>
          <span className="font-semibold text-gray-900">
            {data.length >= 2 
              ? ((data[data.length - 1].value || data[data.length - 1].count || 0) / 
                 (data[0].value || data[0].count || 1) * 100).toFixed(1)
              : 0}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default FunnelChart;
