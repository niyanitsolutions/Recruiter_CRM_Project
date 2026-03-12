/**
 * Audit Timeline Component - Phase 5
 * Visual timeline of audit events
 */
import React from 'react';
import { Activity, User, FileText, Settings, LogIn, LogOut, Edit, Trash2, Plus } from 'lucide-react';
import auditAdvancedService from '../../services/auditAdvancedService';;

const AuditTimeline = ({ events = [], loading = false }) => {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p>No activity to display</p>
      </div>
    );
  }

  const getActionIcon = (action) => {
    const icons = {
      login: LogIn,
      logout: LogOut,
      create: Plus,
      update: Edit,
      delete: Trash2,
      read: FileText
    };
    return icons[action] || Activity;
  };

  const getActionColor = (action) => {
    const colors = {
      login: 'bg-green-100 text-green-600',
      logout: 'bg-gray-100 text-gray-600',
      create: 'bg-blue-100 text-blue-600',
      update: 'bg-yellow-100 text-yellow-600',
      delete: 'bg-red-100 text-red-600',
      read: 'bg-purple-100 text-purple-600'
    };
    return colors[action] || 'bg-gray-100 text-gray-600';
  };

  // Group events by date
  const groupedEvents = events.reduce((groups, event) => {
    const date = new Date(event.timestamp).toLocaleDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(event);
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(groupedEvents).map(([date, dateEvents]) => (
        <div key={date}>
          <h4 className="text-sm font-medium text-gray-500 mb-4">{date}</h4>
          
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200"></div>
            
            <div className="space-y-4">
              {dateEvents.map((event, index) => {
                const Icon = getActionIcon(event.action);
                const colorClass = getActionColor(event.action);
                
                return (
                  <div key={event.id || index} className="relative flex gap-4 pl-2">
                    {/* Icon */}
                    <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 bg-white rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-gray-900">
                            <span className="font-medium">{event.user_name || 'System'}</span>
                            {' '}{event.action_display || event.action}
                            {event.entity_type && (
                              <span className="text-gray-600">
                                {' '}{event.entity_type}: {event.entity_name || event.entity_id}
                              </span>
                            )}
                          </p>
                          {event.description && (
                            <p className="text-sm text-gray-500 mt-1">{event.description}</p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      {/* Changes */}
                      {event.changes && Object.keys(event.changes).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-500 mb-1">Changes:</p>
                          <div className="space-y-1">
                            {Object.entries(event.changes).slice(0, 3).map(([field, change]) => (
                              <div key={field} className="text-xs">
                                <span className="text-gray-600">{field}:</span>
                                <span className="text-red-500 line-through ml-1">{change.old || '-'}</span>
                                <span className="mx-1">→</span>
                                <span className="text-green-600">{change.new || '-'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AuditTimeline;
