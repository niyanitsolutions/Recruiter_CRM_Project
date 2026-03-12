/**
 * Dashboard Customizer Component - Phase 5
 * Allows users to customize dashboard layout and widgets
 */
import React, { useState, useEffect } from 'react';
import {
  X, Plus, GripVertical, Eye, EyeOff, Save, RotateCcw,
  BarChart2, PieChart, TrendingUp, Activity, DollarSign, Users
} from 'lucide-react';
import analyticsService from '../../../services/analyticsService';

const DashboardCustomizer = ({ layout, onSave, onClose }) => {
  const [widgets, setWidgets] = useState(layout?.widgets || []);
  const [availableWidgets, setAvailableWidgets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState(null);

  useEffect(() => {
    // Get default widgets that are not in current layout
    const defaultWidgets = analyticsService.getDefaultWidgets();
    const currentIds = widgets.map(w => w.id);
    setAvailableWidgets(defaultWidgets.filter(w => !currentIds.includes(w.id)));
  }, [widgets]);

  const widgetIcons = {
    kpi: Activity,
    line: TrendingUp,
    bar: BarChart2,
    pie: PieChart,
    funnel: Activity,
    gauge: Activity
  };

  const handleAddWidget = (widget) => {
    setWidgets([...widgets, { ...widget, visible: true }]);
    setAvailableWidgets(availableWidgets.filter(w => w.id !== widget.id));
  };

  const handleRemoveWidget = (widgetId) => {
    const widget = widgets.find(w => w.id === widgetId);
    setWidgets(widgets.filter(w => w.id !== widgetId));
    if (widget) {
      setAvailableWidgets([...availableWidgets, widget]);
    }
  };

  const handleToggleVisibility = (widgetId) => {
    setWidgets(widgets.map(w => 
      w.id === widgetId ? { ...w, visible: !w.visible } : w
    ));
  };

  const handleDragStart = (e, index) => {
    setDraggedWidget(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedWidget === null || draggedWidget === index) return;

    const newWidgets = [...widgets];
    const draggedItem = newWidgets[draggedWidget];
    newWidgets.splice(draggedWidget, 1);
    newWidgets.splice(index, 0, draggedItem);
    setWidgets(newWidgets);
    setDraggedWidget(index);
  };

  const handleDragEnd = () => {
    setDraggedWidget(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave({ widgets });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaultWidgets = analyticsService.getDefaultWidgets();
    setWidgets(defaultWidgets.map(w => ({ ...w, visible: true })));
    setAvailableWidgets([]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Customize Dashboard</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Current Widgets */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Current Widgets</h4>
            <div className="space-y-2">
              {widgets.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No widgets added. Add widgets from below.
                </p>
              ) : (
                widgets.map((widget, index) => {
                  const Icon = widgetIcons[widget.type] || Activity;
                  return (
                    <div
                      key={widget.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-move ${
                        draggedWidget === index ? 'opacity-50' : ''
                      }`}
                    >
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <div className={`p-2 rounded-lg ${widget.visible ? 'bg-blue-100' : 'bg-gray-200'}`}>
                        <Icon className={`w-4 h-4 ${widget.visible ? 'text-blue-600' : 'text-gray-400'}`} />
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${widget.visible ? 'text-gray-900' : 'text-gray-400'}`}>
                          {widget.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {widget.type} • {widget.size}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleVisibility(widget.id)}
                        className="p-1.5 hover:bg-gray-200 rounded"
                        title={widget.visible ? 'Hide' : 'Show'}
                      >
                        {widget.visible ? (
                          <Eye className="w-4 h-4 text-gray-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRemoveWidget(widget.id)}
                        className="p-1.5 hover:bg-red-100 rounded text-red-500"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Available Widgets */}
          {availableWidgets.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Available Widgets</h4>
              <div className="grid grid-cols-2 gap-2">
                {availableWidgets.map((widget) => {
                  const Icon = widgetIcons[widget.type] || Activity;
                  return (
                    <button
                      key={widget.id}
                      onClick={() => handleAddWidget(widget)}
                      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left transition-colors"
                    >
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Icon className="w-4 h-4 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {widget.title}
                        </p>
                        <p className="text-xs text-gray-500">{widget.type}</p>
                      </div>
                      <Plus className="w-4 h-4 text-blue-600" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Widget Size Guide */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Widget Sizes</h4>
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-200 rounded"></div>
                <span>Small (1 col)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-4 bg-blue-300 rounded"></div>
                <span>Medium (2 col)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-4 bg-blue-400 rounded"></div>
                <span>Large (3 col)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Layout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardCustomizer;
