/**
 * Exports Page - Phase 5
 * Data export management
 */
import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, Clock, CheckCircle, XCircle, RefreshCw, Plus } from 'lucide-react';
import importExportService from '../../services/importExportService';
import ExportModal from './components/ExportModal';

const ExportsPage = () => {
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    loadExports();
  }, []);

  const loadExports = async () => {
    try {
      setLoading(true);
      const res = await importExportService.getExportJobs({ page_size: 20 });
      setExports(res.items || []);
    } catch (error) {
      console.error('Error loading exports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (exportJob) => {
    try {
      const res = await importExportService.downloadExport(exportJob.id);
      if (res.download_url) {
        window.open(res.download_url, '_blank');
      }
    } catch (error) {
      console.error('Error downloading export:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Export Data</h1>
          <p className="text-gray-500 mt-1">Download your data in various formats</p>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New Export
        </button>
      </div>

      {/* Export History */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Export History</h3>
          <button onClick={loadExports} className="p-2 hover:bg-gray-100 rounded-lg">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : exports.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p>No exports yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {exports.map(exp => (
              <div key={exp.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  {getStatusIcon(exp.status)}
                  <div>
                    <p className="font-medium text-gray-900">
                      {exp.entity_type} Export
                    </p>
                    <p className="text-sm text-gray-500">
                      {exp.format?.toUpperCase()} • {exp.total_records || 0} records • 
                      {new Date(exp.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                {exp.status === 'completed' && (
                  <button
                    onClick={() => handleDownload(exp)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          onExportCreated={() => {
            setShowExportModal(false);
            loadExports();
          }}
        />
      )}
    </div>
  );
};

export default ExportsPage;
