/**
 * Export Modal Component - Phase 5
 */
import React, { useState } from 'react';
import { X, Download, Users, Building, Briefcase, FileText } from 'lucide-react';
import importExportService from '../../../services/importExportService';

const ExportModal = ({ onClose, onExportCreated }) => {
  const [entityType, setEntityType] = useState('candidates');
  const [format, setFormat] = useState('excel');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      await importExportService.createExport({ entity_type: entityType, format });
      onExportCreated();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setExporting(false);
    }
  };

  const entityTypes = [
    { value: 'candidates', label: 'Candidates', icon: Users },
    { value: 'clients', label: 'Clients', icon: Building },
    { value: 'jobs', label: 'Jobs', icon: Briefcase }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Export Data</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Type</label>
            <div className="grid grid-cols-3 gap-2">
              {entityTypes.map(et => {
                const Icon = et.icon;
                return (
                  <button
                    key={et.value}
                    onClick={() => setEntityType(et.value)}
                    className={`p-3 border-2 rounded-lg text-center ${
                      entityType === et.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mx-auto mb-1 ${entityType === et.value ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className="text-sm">{et.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {['excel', 'csv', 'json'].map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`px-4 py-2 border-2 rounded-lg text-sm ${
                    format === fmt ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t bg-gray-50">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Creating...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
