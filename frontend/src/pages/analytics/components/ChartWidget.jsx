/**
 * Chart Widget Component - Phase 5
 * Wrapper for dashboard chart widgets
 */
import React, { useState } from 'react';
import { MoreVertical, Maximize2, Download, RefreshCw, Settings } from 'lucide-react';

const ChartWidget = ({ 
  title, 
  subtitle,
  children, 
  onRefresh, 
  onExpand, 
  onExport,
  loading = false,
  size = 'medium',
  className = ''
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const sizeClasses = {
    small: 'col-span-1',
    medium: 'col-span-1 md:col-span-2',
    large: 'col-span-1 md:col-span-2 lg:col-span-3'
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${sizeClasses[size]} ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              {onRefresh && (
                <button
                  onClick={() => { setShowMenu(false); onRefresh(); }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              )}
              {onExpand && (
                <button
                  onClick={() => { setShowMenu(false); onExpand(); }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Maximize2 className="w-4 h-4" /> Expand
                </button>
              )}
              {onExport && (
                <button
                  onClick={() => { setShowMenu(false); onExport(); }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default ChartWidget;
