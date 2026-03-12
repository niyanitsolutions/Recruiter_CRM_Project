/**
 * Target Card Component - Phase 5
 * Displays a single target with progress
 */
import React from 'react';
import {
  Target, TrendingUp, DollarSign, Calendar, Users,
  CheckCircle, Clock, AlertCircle, MoreVertical, Edit, Trash2
} from 'lucide-react';
import targetService from '../../../services/targetService';

const TargetCard = ({ target, onEdit, onDelete, onClick }) => {
  const {
    name,
    target_type,
    period,
    target_value,
    current_value,
    progress,
    status,
    status_display,
    type_display,
    period_display,
    start_date,
    end_date,
    assigned_to_name,
    days_remaining,
    on_track
  } = target;

  const percentage = progress?.percentage || 
    (target_value ? (current_value / target_value) * 100 : 0);

  const getTypeIcon = () => {
    const icons = {
      placements: CheckCircle,
      revenue: DollarSign,
      interviews: Calendar,
      candidates_added: Users
    };
    return icons[target_type] || Target;
  };

  const TypeIcon = getTypeIcon();

  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all cursor-pointer relative"
      onClick={onClick}
    >
      {/* Menu */}
      <div className="absolute top-4 right-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 hover:bg-gray-100 rounded-lg"
        >
          <MoreVertical className="w-4 h-4 text-gray-400" />
        </button>
        
        {showMenu && (
          <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onEdit();
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onDelete();
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-lg ${
          status === 'achieved' || status === 'exceeded' 
            ? 'bg-green-100' 
            : status === 'missed' 
              ? 'bg-red-100' 
              : 'bg-blue-100'
        }`}>
          <TypeIcon className={`w-5 h-5 ${
            status === 'achieved' || status === 'exceeded' 
              ? 'text-green-600' 
              : status === 'missed' 
                ? 'text-red-600' 
                : 'text-blue-600'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 truncate pr-8">{name}</h4>
          <p className="text-sm text-gray-500">
            {type_display || target_type} • {period_display || period}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className="text-2xl font-bold text-gray-900">
              {targetService.formatTargetValue(current_value || 0, target_type)}
            </span>
            <span className="text-gray-400 mx-1">/</span>
            <span className="text-gray-500">
              {targetService.formatTargetValue(target_value, target_type)}
            </span>
          </div>
          <span className={`text-sm font-semibold ${
            percentage >= 100 ? 'text-green-600' : 
            percentage >= 75 ? 'text-blue-600' : 
            percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {percentage.toFixed(0)}%
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${targetService.getProgressColor(percentage)}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${targetService.getStatusColor(status)}`}>
          {status_display || status?.replace('_', ' ')}
        </span>
        
        <div className="flex items-center gap-3 text-gray-500">
          {days_remaining !== undefined && days_remaining >= 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {days_remaining}d left
            </span>
          )}
          
          {on_track !== undefined && (
            <span className={`flex items-center gap-1 ${on_track ? 'text-green-600' : 'text-orange-600'}`}>
              {on_track ? (
                <>
                  <TrendingUp className="w-3.5 h-3.5" />
                  On track
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  Behind
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Assigned To */}
      {assigned_to_name && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Assigned to: <span className="font-medium text-gray-700">{assigned_to_name}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default TargetCard;
